import streamDeck from "@elgato/streamdeck";
import { execFileSync, spawn } from "child_process";
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
    error?: { code: number | string; message: string };
}

export class ClaudeUsageService {
    private credPath: string;
    private lastFetch: number = 0;
    private cache: ClaudeUsage | null = null;
    private credCache: { token: string | null; mtime?: number; timestamp?: number } | null = null;
    private readonly CACHE_TTL_MS = 60000;
    private readonly KEYCHAIN_CACHE_TTL_MS = 10000;
    private readonly MAX_RETRIES = 4;
    private readonly BASE_BACKOFF_MS = 1000;
    private readonly MAX_BACKOFF_MS = 30000;
    private readonly MAX_CONSECUTIVE_429 = 4;
    private readonly CIRCUIT_COOLDOWN_MS = 30 * 60 * 1000;
    private consecutive429Count = 0;
    private cooldownUntil = 0;
    private invalidTokens = new Set<string>();

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
            if (this.credCache.token && !this.invalidTokens.has(this.credCache.token)) {
                return this.credCache.token;
            }
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
                if (this.credCache.token && !this.invalidTokens.has(this.credCache.token)) {
                    return this.credCache.token;
                }
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
            let token: string | null = null;
            if (platform() === "darwin") {
                token = await this.getCredentialsFromKeychain();
                if (token && this.invalidTokens.has(token)) {
                    token = await this.getCredentialsFromFile();
                }
            } else {
                token = await this.getCredentialsFromFile();
            }

            if (token && this.invalidTokens.has(token)) {
                return null;
            }
            return token;
        } catch {
            return null;
        }
    }

    async fetchUsage(): Promise<ClaudeUsage | null> {
        const now = Date.now();
        if (this.cooldownUntil > now) {
            const remainingMs = this.cooldownUntil - now;
            streamDeck.logger.warn(`[Claude] Cooldown active after repeated 429. Skipping request for ${Math.ceil(remainingMs / 1000)}s`);
            return {
                sessionUsed: null,
                weekUsed: null,
                sessionResetsAt: null,
                weekResetsAt: null,
                error: { code: 429, message: "Rate Limit" }
            };
        }

        if (this.cache && (now - this.lastFetch) < this.CACHE_TTL_MS) {
            streamDeck.logger.info("[Claude] Returning cached usage");
            return this.cache;
        }

        const token = await this.getCredentials();
        if (!token) {
            streamDeck.logger.warn("[Claude] No credentials found");
            return {
                sessionUsed: null,
                weekUsed: null,
                sessionResetsAt: null,
                weekResetsAt: null,
                error: { code: "AUTH", message: "Auth Required" }
            };
        }

        streamDeck.logger.info(`[Claude] Token found (last 8 chars): ...${token.slice(-8)}`);

        try {
            streamDeck.logger.info("[Claude] Fetching usage from Anthropic API...");
            const response = await this.fetchWithRetry(token);
            if (!response) {
                return {
                    sessionUsed: null,
                    weekUsed: null,
                    sessionResetsAt: null,
                    weekResetsAt: null,
                    error: { code: "CONN", message: "Conn Error" }
                };
            }

            if (response.status === 401) {
                streamDeck.logger.warn("[Claude] Got 401, attempting token refresh via CLI...");
                this.invalidTokens.add(token);
                this.credCache = null;
                const refreshed = await this.refreshTokenViaCLI();
                if (refreshed) {
                    return await this.fetchUsageInternal();
                }
                return {
                    sessionUsed: null,
                    weekUsed: null,
                    sessionResetsAt: null,
                    weekResetsAt: null,
                    error: { code: 401, message: "Unauthorized" }
                };
            }

            if (response.status === 429) {
                return {
                    sessionUsed: null,
                    weekUsed: null,
                    sessionResetsAt: null,
                    weekResetsAt: null,
                    error: { code: 429, message: "Rate Limit" }
                };
            }

            if (!response.ok) {
                streamDeck.logger.error(`[Claude] API returned status: ${response.status}`);
                return {
                    sessionUsed: null,
                    weekUsed: null,
                    sessionResetsAt: null,
                    weekResetsAt: null,
                    error: { code: response.status, message: `Error ${response.status}` }
                };
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
            this.consecutive429Count = 0;
            this.cooldownUntil = 0;

            return usage;
        } catch (err) {
            streamDeck.logger.error(`[Claude] API fetch error: ${err}`);
            return {
                sessionUsed: null,
                weekUsed: null,
                sessionResetsAt: null,
                weekResetsAt: null,
                error: { code: "API", message: "API Error" }
            };
        }
    }

    private async fetchUsageInternal(): Promise<ClaudeUsage | null> {
        const token = await this.getCredentials();
        if (!token) {
            streamDeck.logger.warn("[Claude] No credentials found after refresh");
            return {
                sessionUsed: null,
                weekUsed: null,
                sessionResetsAt: null,
                weekResetsAt: null,
                error: { code: "AUTH", message: "Auth Required" }
            };
        }

        try {
            const response = await this.fetchWithRetry(token);
            if (!response) {
                return {
                    sessionUsed: null,
                    weekUsed: null,
                    sessionResetsAt: null,
                    weekResetsAt: null,
                    error: { code: "CONN", message: "Conn Error" }
                };
            }

            if (response.status === 401) {
                this.invalidTokens.add(token);
                this.credCache = null;
                return {
                    sessionUsed: null,
                    weekUsed: null,
                    sessionResetsAt: null,
                    weekResetsAt: null,
                    error: { code: 401, message: "Unauthorized" }
                };
            }

            if (response.status === 429) {
                return {
                    sessionUsed: null,
                    weekUsed: null,
                    sessionResetsAt: null,
                    weekResetsAt: null,
                    error: { code: 429, message: "Rate Limit" }
                };
            }

            if (!response.ok) {
                streamDeck.logger.error(`[Claude] API still failing after refresh: ${response.status}`);
                return {
                    sessionUsed: null,
                    weekUsed: null,
                    sessionResetsAt: null,
                    weekResetsAt: null,
                    error: { code: response.status, message: `Error ${response.status}` }
                };
            }

            const data = await response.json() as ClaudeApiResponse;

            const usage: ClaudeUsage = {
                sessionUsed: data.five_hour?.utilization ?? null,
                weekUsed: data.seven_day?.utilization ?? null,
                sessionResetsAt: data.five_hour?.resets_at ?? null,
                weekResetsAt: data.seven_day?.resets_at ?? null,
            };

            streamDeck.logger.info(`[Claude] Fetched usage after refresh - Session: ${usage.sessionUsed}%, Week: ${usage.weekUsed}%`);

            this.cache = usage;
            this.lastFetch = Date.now();
            this.consecutive429Count = 0;
            this.cooldownUntil = 0;

            return usage;
        } catch (err) {
            streamDeck.logger.error(`[Claude] API fetch error after refresh: ${err}`);
            return {
                sessionUsed: null,
                weekUsed: null,
                sessionResetsAt: null,
                weekResetsAt: null,
                error: { code: "API", message: "API Error" }
            };
        }
    }

    private async fetchWithRetry(token: string): Promise<Response | null> {
        let lastResponse: Response | null = null;

        for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
            const response = await this.fetchUsageEndpoint(token);
            if (!response) {
                return null;
            }

            lastResponse = response;
            if (response.ok || response.status === 401) {
                return response;
            }

            if (response.status === 429) {
                this.consecutive429Count += 1;
                const body = await this.readResponseBody(response);
                const retryAfterHeader = response.headers.get("retry-after");
                const requestId = response.headers.get("request-id")
                    ?? response.headers.get("x-request-id")
                    ?? "unknown";
                const resetHeader = response.headers.get("x-ratelimit-reset");

                streamDeck.logger.warn(
                    `[Claude] 429 from usage API (attempt ${attempt + 1}/${this.MAX_RETRIES + 1}, consecutive: ${this.consecutive429Count}, request-id: ${requestId}, retry-after: ${retryAfterHeader ?? "none"}, x-ratelimit-reset: ${resetHeader ?? "none"}, body: ${body ?? "empty"})`
                );

                if (this.consecutive429Count >= this.MAX_CONSECUTIVE_429) {
                    this.cooldownUntil = Date.now() + this.CIRCUIT_COOLDOWN_MS;
                    streamDeck.logger.error(`[Claude] Circuit breaker opened after ${this.consecutive429Count} consecutive 429 responses. Cooldown for ${Math.floor(this.CIRCUIT_COOLDOWN_MS / 60000)} minutes`);
                    return response;
                }

                if (attempt >= this.MAX_RETRIES) {
                    return response;
                }

                const delayMs = this.computeBackoffDelayMs(attempt, retryAfterHeader);
                streamDeck.logger.warn(`[Claude] Backing off for ${delayMs}ms before retry`);
                await this.sleep(delayMs);
                continue;
            }

            this.consecutive429Count = 0;

            if (response.status >= 500 && attempt < this.MAX_RETRIES) {
                const delayMs = this.computeBackoffDelayMs(attempt, null);
                streamDeck.logger.warn(`[Claude] Server error ${response.status}, retrying in ${delayMs}ms`);
                await this.sleep(delayMs);
                continue;
            }

            return response;
        }

        return lastResponse;
    }

    private async fetchUsageEndpoint(token: string): Promise<Response | null> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        try {
            return await fetch("https://api.anthropic.com/api/oauth/usage", {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                    "anthropic-beta": "oauth-2025-04-20",
                },
                signal: controller.signal,
            });
        } catch (err) {
            streamDeck.logger.error(`[Claude] Usage request failed: ${err}`);
            return null;
        } finally {
            clearTimeout(timeout);
        }
    }

    private computeBackoffDelayMs(attempt: number, retryAfterHeader: string | null): number {
        const retryAfterMs = this.parseRetryAfterMs(retryAfterHeader);
        if (retryAfterMs !== null) {
            return retryAfterMs;
        }

        const exponential = Math.min(this.BASE_BACKOFF_MS * (2 ** attempt), this.MAX_BACKOFF_MS);
        const jitter = Math.floor(Math.random() * 500);
        return exponential + jitter;
    }

    private parseRetryAfterMs(retryAfterHeader: string | null): number | null {
        if (!retryAfterHeader) {
            return null;
        }

        const seconds = Number(retryAfterHeader);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return Math.floor(seconds * 1000);
        }

        const at = Date.parse(retryAfterHeader);
        if (!Number.isNaN(at)) {
            const delay = at - Date.now();
            return delay > 0 ? delay : 0;
        }

        return null;
    }

    private async readResponseBody(response: Response): Promise<string | null> {
        try {
            const clone = response.clone();
            const text = await clone.text();
            if (!text) {
                return null;
            }
            return text.length > 800 ? `${text.slice(0, 800)}...` : text;
        } catch {
            return null;
        }
    }

    private async sleep(ms: number): Promise<void> {
        await new Promise<void>((resolve) => setTimeout(resolve, ms));
    }

    private refreshTokenViaCLI(): Promise<boolean> {
        return new Promise((resolve) => {
            const claudePath = join(homedir(), ".local/bin/claude");
            streamDeck.logger.info(`[Claude] Spawning claude CLI at ${claudePath} to refresh token...`);

            const proc = spawn(claudePath, [], {
                stdio: "ignore",
                detached: true,
            });

            proc.on("error", (err) => {
                streamDeck.logger.error(`[Claude] Failed to spawn claude CLI: ${err}`);
                resolve(false);
            });

            setTimeout(() => {
                try {
                    proc.kill("SIGTERM");
                    streamDeck.logger.info("[Claude] Killed claude CLI after 10s");
                } catch { }
                resolve(true);
            }, 10000);

            proc.unref();
        });
    }
}
