import streamDeck from "@elgato/streamdeck";
import { OAuth2Client } from "google-auth-library";
import fs from "fs/promises";
import path from "path";
import os from "os";

const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com/v1internal";
const OAUTH_CLIENT_ID = "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
const OAUTH_CLIENT_SECRET = "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"; // NOTE: public, well-known OAuth client secret shipped openly in Google's Gemini CLI (google-gemini/gemini-cli). It is a native/desktop "installed app" client using PKCE, so this value is non-confidential by Google's OAuth design — NOT a personal credential.
const CREDS_PATH = path.join(os.homedir(), ".gemini", "oauth_creds.json");

export type QuotaBucket = {
    resetTime: string;
    tokenType: string;
    modelId: string;
    remainingFraction: number;
    remainingAmount?: string;
};

export type QuotaResponse = {
    buckets?: QuotaBucket[];
};

export interface ModelQuota {
    usage: number;
    remaining: number;
    limit: number;
    resetTime?: string;
}

export interface GeminiQuotaResult {
    overallUsage: number;
    overallResetTime: string | null;
    perModel: Map<string, ModelQuota>;
    error?: { code: number | string; message: string };
}

interface LoadCodeAssistResponse {
    currentTier?: { id?: string; name?: string } | null;
    allowedTiers?: Array<{ id?: string; name?: string; isDefault?: boolean }> | null;
    cloudaicompanionProject?: string | null;
}

export class GeminiCliUsageService {
    private static instance: GeminiCliUsageService;
    private client: OAuth2Client;
    private isInitialized = false;
    private projectId: string | null = null;
    private lastFetch: number = 0;
    private cache: GeminiQuotaResult | null = null;
    private readonly CACHE_TTL_MS = 60000;

    private constructor() {
        this.client = new OAuth2Client({
            clientId: OAUTH_CLIENT_ID,
            clientSecret: OAUTH_CLIENT_SECRET,
        });
    }

    public static getInstance(): GeminiCliUsageService {
        if (!GeminiCliUsageService.instance) {
            GeminiCliUsageService.instance = new GeminiCliUsageService();
        }
        return GeminiCliUsageService.instance;
    }

    private async initialize() {
        if (this.isInitialized) return;
        try {
            streamDeck.logger.info(`[Gemini] Loading OAuth credentials from ${CREDS_PATH}`);
            const credsStr = await fs.readFile(CREDS_PATH, "utf-8");
            const creds = JSON.parse(credsStr);
            this.client.setCredentials(creds);
            this.isInitialized = true;
            streamDeck.logger.info("[Gemini] OAuth credentials loaded successfully");
        } catch (e) {
            streamDeck.logger.error(`[Gemini] Failed to load OAuth credentials: ${e}`);
            throw e;
        }
    }

    private async reloadCredentials(): Promise<void> {
        streamDeck.logger.info("[Gemini] Reloading credentials...");
        this.isInitialized = false;
        await this.initialize();
    }

    private async getToken(): Promise<string> {
        const { token } = await this.client.getAccessToken();
        if (!token) {
            streamDeck.logger.error("[Gemini] Failed to obtain access token");
            throw new Error("Failed to obtain access token");
        }
        streamDeck.logger.info(`[Gemini] Token obtained (last 8 chars): ...${token.slice(-8)}`);
        return token;
    }

    private async apiPost<T>(method: string, body: object): Promise<T> {
        streamDeck.logger.info(`[Gemini] POST ${method}...`);
        const token = await this.getToken();

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(`${CODE_ASSIST_ENDPOINT}:${method}`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (response.status === 401) {
                streamDeck.logger.warn(`[Gemini] Got 401 on ${method}, reloading credentials and retrying...`);
                await this.reloadCredentials();
                const newToken = await this.getToken();

                const retryController = new AbortController();
                const retryTimeout = setTimeout(() => retryController.abort(), 10000);

                const retry = await fetch(`${CODE_ASSIST_ENDPOINT}:${method}`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${newToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(body),
                    signal: retryController.signal,
                });

                clearTimeout(retryTimeout);

                if (!retry.ok) {
                    streamDeck.logger.error(`[Gemini] Retry failed for ${method}: ${retry.status} ${retry.statusText}`);
                    throw new Error(`Google API ${method} returned ${retry.status}: ${retry.statusText}`);
                }
                return (await retry.json()) as T;
            }

            if (!response.ok) {
                streamDeck.logger.error(`[Gemini] ${method} returned ${response.status}: ${response.statusText}`);
                throw new Error(`Google API ${method} returned ${response.status}: ${response.statusText}`);
            }
            return (await response.json()) as T;
        } catch (e) {
            clearTimeout(timeout);
            throw e;
        }
    }

    private async resolveProjectId(): Promise<string> {
        if (this.projectId) {
            streamDeck.logger.info(`[Gemini] Using cached projectId: ${this.projectId}`);
            return this.projectId;
        }

        const envProject = process.env["GOOGLE_CLOUD_PROJECT"] || process.env["GOOGLE_CLOUD_PROJECT_ID"];
        if (envProject) {
            streamDeck.logger.info(`[Gemini] Using projectId from env: ${envProject}`);
            this.projectId = envProject;
            return envProject;
        }

        streamDeck.logger.info("[Gemini] Resolving projectId via loadCodeAssist...");
        const res = await this.apiPost<LoadCodeAssistResponse>("loadCodeAssist", {
            metadata: {
                ideType: "IDE_UNSPECIFIED",
                platform: "PLATFORM_UNSPECIFIED",
                pluginType: "GEMINI",
            },
        });

        if (res.cloudaicompanionProject) {
            this.projectId = res.cloudaicompanionProject;
            streamDeck.logger.info(`[Gemini] Resolved projectId: ${res.cloudaicompanionProject}`);
            return res.cloudaicompanionProject;
        }

        streamDeck.logger.error("[Gemini] Could not resolve project ID from loadCodeAssist response");
        throw new Error("Could not resolve project ID from loadCodeAssist response");
    }

    public async getQuota(): Promise<GeminiQuotaResult> {
        const now = Date.now();
        if (this.cache && (now - this.lastFetch) < this.CACHE_TTL_MS) {
            streamDeck.logger.info("[Gemini] Returning cached quota");
            return this.cache;
        }

        try {
            await this.initialize();

            const projectId = await this.resolveProjectId();
            streamDeck.logger.info(`[Gemini] Fetching quota for project: ${projectId}`);

            const data = await this.apiPost<QuotaResponse>("retrieveUserQuota", {
                project: projectId,
            });

            streamDeck.logger.info(`[Gemini] Raw quota response: ${JSON.stringify(data)}`);

            const perModel = new Map<string, ModelQuota>();

            if (!data.buckets || data.buckets.length === 0) {
                streamDeck.logger.warn("[Gemini] No quota buckets returned");
                const result: GeminiQuotaResult = { overallUsage: 0, overallResetTime: null, perModel };
                this.cache = result;
                this.lastFetch = now;
                return result;
            }

            streamDeck.logger.info(`[Gemini] Got ${data.buckets.length} bucket(s)`);

            for (const bucket of data.buckets) {
                if (!bucket.modelId || bucket.remainingFraction == null) continue;

                const usage = Math.round((1 - bucket.remainingFraction) * 100);

                let remaining = 0;
                let limit = 0;
                if (bucket.remainingAmount) {
                    remaining = parseInt(bucket.remainingAmount, 10);
                    limit = bucket.remainingFraction > 0
                        ? Math.round(remaining / bucket.remainingFraction)
                        : 0;
                }

                if (bucket.modelId.endsWith("_vertex")) continue;

                perModel.set(bucket.modelId, { usage, remaining, limit, resetTime: bucket.resetTime });
                streamDeck.logger.info(`[Gemini] Model: ${bucket.modelId} — ${usage}% used, fraction: ${bucket.remainingFraction}, resets: ${bucket.resetTime ?? "N/A"}`);
            }

            const lowestFraction = Math.min(...data.buckets.map((b) => b.remainingFraction ?? 1));
            const overallUsage = Math.min(Math.max(Math.round((1 - lowestFraction) * 100), 0), 100);

            const mostConstrained = data.buckets.reduce((prev, curr) =>
                (curr.remainingFraction ?? 1) < (prev.remainingFraction ?? 1) ? curr : prev
            );
            const overallResetTime = mostConstrained.resetTime || null;

            streamDeck.logger.info(`[Gemini] Overall usage: ${overallUsage}%, models: [${[...perModel.keys()].join(", ")}]`);

            const result: GeminiQuotaResult = { overallUsage, overallResetTime, perModel };
            this.cache = result;
            this.lastFetch = now;
            return result;
        } catch (err: any) {
            streamDeck.logger.error(`[Gemini] Error fetching quota: ${err}`);
            const msg = String(err?.message || err);
            let code: string | number = "API";
            let message = "API Error";
            if (msg.includes("credentials") || msg.includes("ENOENT") || msg.includes("token") || msg.includes("401") || msg.includes("403")) {
                code = "AUTH";
                message = "Auth Required";
            } else if (msg.includes("429")) {
                code = 429;
                message = "Rate Limit";
            } else if (msg.includes("fetch") || msg.includes("CONN") || msg.includes("Network")) {
                code = "CONN";
                message = "Conn Error";
            }
            return {
                overallUsage: 0,
                overallResetTime: null,
                perModel: new Map(),
                error: { code, message }
            };
        }
    }

    public getAvailableModels(): string[] {
        if (!this.cache) return [];
        return [...this.cache.perModel.keys()];
    }
}
