import streamDeck from "@elgato/streamdeck";
import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

interface CodexAuthData {
    tokens?: {
        access_token?: string;
        account_id?: string;
    };
}

interface CodexApiResponse {
    plan_type: string;
    rate_limit: {
        primary_window?: {
            used_percent: number;
            reset_at: number;
        } | null;
        secondary_window?: {
            used_percent: number;
            reset_at: number;
        } | null;
    };
}

export interface CodexUsage {
    sessionUsed: number | null;
    weekUsed: number | null;
}

export class CodexUsageService {
    private authPath: string;
    private lastFetch: number = 0;
    private cache: CodexUsage | null = null;
    private readonly CACHE_TTL_MS = 60000;

    constructor() {
        this.authPath = join(homedir(), ".codex", "auth.json");
    }

    async startMonitoring(onDataReceived: (data: string) => void): Promise<void> {
        streamDeck.logger.info("[Codex] Starting usage monitoring via HTTP API...");

        try {
            const usage = await this.fetchUsage();
            if (usage) {
                streamDeck.logger.info(`[Codex] Session: ${usage.sessionUsed}%, Week: ${usage.weekUsed}%`);
                onDataReceived(JSON.stringify(usage));
            }
        } catch (err) {
            streamDeck.logger.error(`[Codex] Error fetching usage: ${err}`);
        }
    }

    stopMonitoring(): void {
        streamDeck.logger.info("[Codex] Stopping monitoring");
    }

    private async readAuthTokens(): Promise<{ accessToken: string; accountId: string } | null> {
        try {
            if (!existsSync(this.authPath)) {
                streamDeck.logger.warn(`[Codex] Auth file not found: ${this.authPath}`);
                return null;
            }

            const content = await readFile(this.authPath, "utf-8");
            const auth: CodexAuthData = JSON.parse(content);

            const accessToken = auth?.tokens?.access_token;
            const accountId = auth?.tokens?.account_id;

            if (!accessToken || !accountId) {
                streamDeck.logger.warn("[Codex] Missing tokens in auth.json");
                return null;
            }

            streamDeck.logger.info("[Codex] Successfully read auth tokens");
            return { accessToken, accountId };
        } catch (err) {
            streamDeck.logger.error(`[Codex] Error reading auth: ${err}`);
            return null;
        }
    }

    async fetchUsage(): Promise<CodexUsage | null> {
        const now = Date.now();
        if (this.cache && (now - this.lastFetch) < this.CACHE_TTL_MS) {
            streamDeck.logger.info("[Codex] Returning cached usage");
            return this.cache;
        }

        const auth = await this.readAuthTokens();
        if (!auth) {
            return null;
        }

        try {
            streamDeck.logger.info("[Codex] Fetching usage from ChatGPT API...");

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${auth.accessToken}`,
                    "ChatGPT-Account-Id": auth.accountId,
                },
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                streamDeck.logger.error(`[Codex] API returned status: ${response.status}`);
                return null;
            }

            const data: CodexApiResponse = await response.json();

            const usage: CodexUsage = {
                sessionUsed: data.rate_limit.primary_window?.used_percent ?? null,
                weekUsed: data.rate_limit.secondary_window?.used_percent ?? null,
            };

            streamDeck.logger.info(`[Codex] Fetched usage - Session: ${usage.sessionUsed}%, Week: ${usage.weekUsed}%`);

            this.cache = usage;
            this.lastFetch = now;

            return usage;
        } catch (err) {
            streamDeck.logger.error(`[Codex] API fetch error: ${err}`);
            return null;
        }
    }
}
