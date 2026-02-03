import { spawn } from 'child_process';
import * as https from 'https';
import streamDeck from "@elgato/streamdeck";

export interface AntigravityUsage {
    gemini: { used: number; resetAt: string | null; } | null;
    claude: { used: number; resetAt: string | null; } | null;
}

interface ProcessInfo {
    pid: number;
    token: string;
}

export class AntigravityUsageService {
    private static instance: AntigravityUsageService;
    private cachedPort: number | null = null;
    private cachedToken: string | null = null;

    private constructor() { }

    static getInstance(): AntigravityUsageService {
        if (!AntigravityUsageService.instance) {
            AntigravityUsageService.instance = new AntigravityUsageService();
        }
        return AntigravityUsageService.instance;
    }

    async fetchUsage(): Promise<AntigravityUsage | null> {
        try {
            const info = await this.findProcess();
            if (!info) {
                streamDeck.logger.warn("[Antigravity] Process not found");
                return null;
            }

            if (this.cachedPort && this.cachedToken === info.token) {
                const usage = await this.tryFetchFromPort(this.cachedPort, info.token);
                if (usage) return usage;
            }

            const ports = await this.findListeningPorts(info.pid);
            for (const port of ports) {
                const usage = await this.tryFetchFromPort(port, info.token);
                if (usage) {
                    this.cachedPort = port;
                    this.cachedToken = info.token;
                    return usage;
                }
            }

            streamDeck.logger.warn("[Antigravity] No working port found");
            return null;
        } catch (err) {
            streamDeck.logger.error(`[Antigravity] Error: ${err}`);
            return null;
        }
    }

    private async findProcess(): Promise<ProcessInfo | null> {
        return new Promise((resolve) => {
            const ps = spawn('ps', ['-ax', '-o', 'pid,command']);
            let output = '';

            ps.stdout.on('data', (data) => output += data.toString());
            ps.on('close', () => {
                const lines = output.split('\n');
                for (const line of lines) {
                    if (line.includes('language_server_macos') && line.includes('--csrf_token')) {
                        const pidMatch = line.trim().match(/^(\d+)/);
                        const tokenMatch = line.match(/--csrf_token\s+([^\s]+)/);

                        if (pidMatch && tokenMatch) {
                            resolve({
                                pid: parseInt(pidMatch[1]),
                                token: tokenMatch[1]
                            });
                            return;
                        }
                    }
                }
                resolve(null);
            });
        });
    }

    private async findListeningPorts(pid: number): Promise<number[]> {
        return new Promise((resolve) => {
            const lsof = spawn('lsof', ['-a', '-P', '-iTCP', '-sTCP:LISTEN', '-p', pid.toString()]);
            let output = '';

            lsof.stdout.on('data', (data) => output += data.toString());
            lsof.on('close', () => {
                const ports = new Set<number>();
                const lines = output.split('\n');
                for (let i = 1; i < lines.length; i++) {
                    const match = lines[i].match(/:(\d+)\s+\(LISTEN\)/);
                    if (match) {
                        ports.add(parseInt(match[1]));
                    }
                }
                resolve(Array.from(ports));
            });
        });
    }

    private async tryFetchFromPort(port: number, token: string): Promise<AntigravityUsage | null> {
        return new Promise((resolve) => {
            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Codeium-Csrf-Token': token
                },
                rejectUnauthorized: false
            };

            const req = https.request(options, (res) => {
                if (res.statusCode !== 200) {
                    resolve(null);
                    return;
                }

                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        streamDeck.logger.info(`[Antigravity] Raw response: ${JSON.stringify(json, null, 2)}`);

                        const usage = this.parseUsage(json);
                        resolve(usage);
                    } catch {
                        resolve(null);
                    }
                });
            });

            req.on('error', () => resolve(null));

            const body = JSON.stringify({
                metadata: { ideName: "antigravity", extensionName: "antigravity", locale: "en" }
            });

            req.write(body);
            req.end();
        });
    }

    private parseUsage(data: any): AntigravityUsage {
        const models = data.userStatus?.cascadeModelConfigData?.clientModelConfigs || [];

        const geminiModel = models.find((m: any) =>
            m.label?.includes('Gemini 3 Pro') && !m.label?.includes('Flash')
        );

        let gemini: { used: number; resetAt: string | null; } | null = null;
        if (geminiModel?.quotaInfo) {
            const remaining = geminiModel.quotaInfo.remainingFraction;
            let used: number | null = null;

            if (typeof remaining === 'number') {
                used = Math.round((1 - remaining) * 100);
            } else if (geminiModel.quotaInfo.resetTime) {
                used = 100;
            }

            if (used !== null) {
                gemini = {
                    used: used,
                    resetAt: geminiModel.quotaInfo.resetTime || null
                };
            }
        }

        const claudeModel = models.find((m: any) =>
            m.label?.includes('Claude')
        );

        let claude: { used: number; resetAt: string | null; } | null = null;
        if (claudeModel?.quotaInfo) {
            const remaining = claudeModel.quotaInfo.remainingFraction;
            let used: number | null = null;

            if (typeof remaining === 'number') {
                used = Math.round((1 - remaining) * 100);
            } else if (claudeModel.quotaInfo.resetTime) {
                used = 100;
            }

            if (used !== null) {
                claude = {
                    used: used,
                    resetAt: claudeModel.quotaInfo.resetTime || null
                };
            }
        }

        return { gemini, claude };
    }
}
