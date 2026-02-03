import streamDeck from "@elgato/streamdeck";
import { execFileSync } from "child_process";
import { readFile, stat } from "fs/promises";
import { homedir, platform } from "os";
import { join } from "path";

interface ClaudeCredentials {
    claudeAiOauth?: {
        accessToken?: string;
    };
}

interface ClaudeApiResponse {
    five_hour?: {
        utilization: number;
        resets_at: string;
    } | null;
    seven_day?: {
        utilization: number;
        resets_at: string;
    } | null;
    seven_day_sonnet?: {
        utilization: number;
        resets_at: string;
    } | null;
}

export interface ClaudeUsage {
    sessionUsed: number | null;
    weekUsed: number | null;
    sessionResetsAt: string | null;
    weekResetsAt: string | null;
}

export class ClaudeUsageService {
    private credPath: string;
    private lastFetch: number = 0;
    private cache: ClaudeUsage | null = null;
    private credCache: { token: string | null; mtime?: number; timestamp?: number } | null = null;
    private readonly CACHE_TTL_MS = 60000;
    private readonly KEYCHAIN_CACHE_TTL_MS = 10000;

    constructor() {
        this.credPath = join(homedir(), ".claude", ".credentials.json");
    }

    async startMonitoring(): Promise<ClaudeUsage | null> {
        streamDeck.logger.info("[Claude] Starting usage monitoring via HTTP API...");
        return await this.fetchUsage();
    }

    stopMonitoring(): void {
        streamDeck.logger.info("[Claude] Stopping monitoring");
    }

    private async getCredentialsFromKeychain(): Promise<string | null> {
        if (this.credCache?.timestamp && Date.now() - this.credCache.timestamp < this.KEYCHAIN_CACHE_TTL_MS) {
            return this.credCache.token;
        }

        try {
            const result = execFileSync(
                "security",
                ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
                { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
            ).trim();

            const creds: ClaudeCredentials = JSON.parse(result);
            const token = creds?.claudeAiOauth?.accessToken ?? null;

            this.credCache = { token, timestamp: Date.now() };
            return token;
        } catch {
            return await this.getCredentialsFromFile();
        }
    }

    private async getCredentialsFromFile(): Promise<string | null> {
        try {
            const fileStat = await stat(this.credPath);
            const mtime = fileStat.mtimeMs;

            if (this.credCache?.mtime === mtime) {
                return this.credCache.token;
            }

            const content = await readFile(this.credPath, "utf-8");
            const creds: ClaudeCredentials = JSON.parse(content);
            const token = creds?.claudeAiOauth?.accessToken ?? null;

            this.credCache = { token, mtime };
            return token;
        } catch {
            return null;
        }
    }

    private async getCredentials(): Promise<string | null> {
        try {
            if (platform() === "darwin") {
                return await this.getCredentialsFromKeychain();
            }
            return await this.getCredentialsFromFile();
        } catch {
            return null;
        }
    }

    async fetchUsage(): Promise<ClaudeUsage | null> {
        const now = Date.now();
        if (this.cache && (now - this.lastFetch) < this.CACHE_TTL_MS) {
            streamDeck.logger.info("[Claude] Returning cached usage");
            return this.cache;
        }

        const token = await this.getCredentials();
        if (!token) {
            streamDeck.logger.warn("[Claude] No credentials found");
            return null;
        }

        try {
            streamDeck.logger.info("[Claude] Fetching usage from Anthropic API...");

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                    "anthropic-beta": "oauth-2025-04-20",
                },
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                streamDeck.logger.error(`[Claude] API returned status: ${response.status}`);
                return null;
            }

            const data = await response.json() as ClaudeApiResponse;

            streamDeck.logger.info(`[Claude] Raw API response: ${JSON.stringify(data)}`);

            const usage: ClaudeUsage = {
                sessionUsed: data.five_hour?.utilization ?? null,
                weekUsed: data.seven_day?.utilization ?? null,
                sessionResetsAt: data.five_hour?.resets_at ?? null,
                weekResetsAt: data.seven_day?.resets_at ?? null,
            };

            streamDeck.logger.info(`[Claude] Fetched usage - Session: ${usage.sessionUsed}%, Week: ${usage.weekUsed}%`);

            this.cache = usage;
            this.lastFetch = now;

            return usage;
        } catch (err) {
            streamDeck.logger.error(`[Claude] API fetch error: ${err}`);
            return null;
        }
    }
}
