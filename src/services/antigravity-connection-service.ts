import { spawn } from 'child_process';
import * as https from 'https';
import streamDeck from "@elgato/streamdeck";

interface ProcessInfo {
    pid: number;
    token: string;
}

export interface ConnectionDetails {
    port: number;
    token: string;
}

export class AntigravityConnectionService {
    private cachedPort: number | null = null;
    private cachedToken: string | null = null;

    async getConnectionDetails(): Promise<ConnectionDetails | null> {
        try {
            const info = await this.findProcess();
            if (!info) {
                // streamDeck.logger.warn("[Antigravity] Process not found");
                return null;
            }

            // 1. Try Cached
            if (this.cachedPort && this.cachedToken === info.token) {
                if (await this.testConnection(this.cachedPort, info.token)) {
                    return { port: this.cachedPort, token: info.token };
                }
            }

            // 2. Scan Ports
            const ports = await this.findListeningPorts(info.pid);
            for (const port of ports) {
                if (await this.testConnection(port, info.token)) {
                    this.cachedPort = port;
                    this.cachedToken = info.token;
                    return { port, token: info.token };
                }
            }

            streamDeck.logger.warn("[Antigravity] No working port found");
            return null;
        } catch (err) {
            streamDeck.logger.error(`[Antigravity] Connection Error: ${err}`);
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

    // Lightweight verification (ping) or full check? The usage service will do the full fetch.
    // Ideally we want to know if it *is* the right server. 
    // Let's optimize: checking "GetUserStatus" is safe.
    // If we return true here, we might as well return the DATA but that violates separation.
    // Let's keep it simple: just checking if it responds 200 OK.
    private async testConnection(port: number, token: string): Promise<boolean> {
        return new Promise((resolve) => {
            // We can send a lightweight request or the actual one.
            // The actual one is GetUserStatus.
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
                if (res.statusCode === 200) {
                    resolve(true);
                } else {
                    resolve(false);
                }
                // Consume response to free memory
                res.resume();
            });

            req.on('error', () => resolve(false));

            const body = JSON.stringify({
                metadata: { ideName: "antigravity", extensionName: "antigravity", locale: "en" }
            });

            req.write(body);
            req.end();
        });
    }
}
