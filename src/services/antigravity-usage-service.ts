import * as https from 'https';
import streamDeck from "@elgato/streamdeck";
import { AntigravityConnectionService } from "./antigravity-connection-service";
import { AntigravityParser, AntigravityUsage } from "../parsers/antigravity-parser";

export { AntigravityUsage };

export class AntigravityUsageService {
    private static instance: AntigravityUsageService;
    private connectionService = new AntigravityConnectionService();
    private parser = new AntigravityParser();

    private constructor() { }

    static getInstance(): AntigravityUsageService {
        if (!AntigravityUsageService.instance) {
            AntigravityUsageService.instance = new AntigravityUsageService();
        }
        return AntigravityUsageService.instance;
    }

    async fetchUsage(): Promise<AntigravityUsage | null> {
        try {
            const connection = await this.connectionService.getConnectionDetails();
            if (!connection) {
                return null;
            }

            return await this.fetchFromPort(connection.port, connection.token);
        } catch (err) {
            streamDeck.logger.error(`[Antigravity] Service Error: ${err}`);
            return null;
        }
    }

    private async fetchFromPort(port: number, token: string): Promise<AntigravityUsage | null> {
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
                        const usage = this.parser.parse(json);
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
}
