import streamDeck from "@elgato/streamdeck";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { exec } from "child_process";
import * as http from "http";
import { AddressInfo } from "net";
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";

import {
    AntigravityModelQuota,
    AntigravityQuotaResult,
} from "../interfaces/usage";

export type {
    AntigravityModelQuota,
    AntigravityQuotaResult,
};

const CODE_ASSIST_ENDPOINT = "https://daily-cloudcode-pa.googleapis.com/v1internal";
const OAUTH_CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const OAUTH_CLIENT_SECRET = "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"; // NOTE: public OAuth client secret embedded in Google's Antigravity desktop app. It is a native/desktop "installed app" client using PKCE, so this value is non-confidential by Google's OAuth design — NOT a personal credential.
const OAUTH_SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
];

const STORAGE_DIR = path.join(os.homedir(), ".limits-streamdeck");
const TOKEN_PATH = path.join(STORAGE_DIR, "antigravity_oauth.json");

interface StoredToken {
    access_token?: string;
    refresh_token?: string;
    expiry_date?: number;
    token_type?: string;
    id_token?: string;
    scope?: string;
    email?: string;
}

interface ModelInfo {
    displayName?: string;
    quotaInfo?: {
        remainingFraction?: number;
        resetTime?: string;
        isExhausted?: boolean;
    };
    [key: string]: any;
}

interface FetchAvailableModelsResponse {
    models?: Record<string, ModelInfo>;
}

interface RetrieveUserQuotaBucket {
    modelId?: string;
    remainingFraction?: number;
    resetTime?: string;
    [key: string]: any;
}

interface RetrieveUserQuotaResponse {
    buckets?: RetrieveUserQuotaBucket[];
}

export class AntigravityUsageService {
    private static instance: AntigravityUsageService;
    private client = new OAuth2Client({
        clientId: process.env.ANTIGRAVITY_CLIENT_ID || OAUTH_CLIENT_ID,
        clientSecret: process.env.ANTIGRAVITY_CLIENT_SECRET || OAUTH_CLIENT_SECRET,
    });
    private isInitialized = false;
    private email: string | null = null;
    private cache: AntigravityQuotaResult | null = null;
    private lastFetch = 0;
    private readonly CACHE_TTL_MS = 60000;
    private pendingLogin: {
        server: http.Server;
        codeVerifier: string;
        redirectUri: string;
        state: string;
        resolve: (email: string) => void;
        reject: (err: Error) => void;
    } | null = null;

    private constructor() { }

    static getInstance(): AntigravityUsageService {
        if (!AntigravityUsageService.instance) {
            AntigravityUsageService.instance = new AntigravityUsageService();
        }
        return AntigravityUsageService.instance;
    }

    async isLoggedIn(): Promise<boolean> {
        try {
            await this.initialize();
            return this.isInitialized;
        } catch {
            return false;
        }
    }

    getLoggedInEmail(): string | null {
        return this.email;
    }

    async logout(): Promise<void> {
        this.isInitialized = false;
        this.email = null;
        this.cache = null;
        this.lastFetch = 0;
        this.client = new OAuth2Client({
            clientId: process.env.ANTIGRAVITY_CLIENT_ID || OAUTH_CLIENT_ID,
            clientSecret: process.env.ANTIGRAVITY_CLIENT_SECRET || OAUTH_CLIENT_SECRET,
        });
        try {
            await fs.unlink(TOKEN_PATH);
            streamDeck.logger.info("[Antigravity] Logged out, token file removed");
        } catch (err: any) {
            if (err?.code !== "ENOENT") {
                streamDeck.logger.warn(`[Antigravity] Failed to remove token file: ${err}`);
            }
        }
    }

    /**
     * Start the OAuth login flow:
     *   - boots a local HTTP server on a random port
     *   - opens the Google consent page in the user's browser
     *   - exchanges the returned code for tokens and persists them
     * Resolves with the user's email on success.
     */
    async login(): Promise<string> {
        if (this.pendingLogin) {
            throw new Error("Login already in progress");
        }

        return new Promise<string>((resolve, reject) => {
            const codeVerifier = this.generateCodeVerifier();
            const codeChallenge = this.generateCodeChallenge(codeVerifier);
            const state = crypto.randomBytes(16).toString("hex");

            const server = http.createServer(async (req, res) => {
                try {
                    const url = new URL(req.url || "/", `http://127.0.0.1`);
                    if (url.pathname !== "/callback") {
                        res.writeHead(404);
                        res.end("Not found");
                        return;
                    }

                    const code = url.searchParams.get("code");
                    const returnedState = url.searchParams.get("state");
                    const errParam = url.searchParams.get("error");

                    if (errParam) {
                        this.respondHtml(res, false, `Login failed: ${errParam}`);
                        this.finishLogin(new Error(`OAuth error: ${errParam}`));
                        return;
                    }

                    if (!code) {
                        this.respondHtml(res, false, "Missing authorization code");
                        this.finishLogin(new Error("Missing authorization code"));
                        return;
                    }

                    if (!this.pendingLogin || returnedState !== this.pendingLogin.state) {
                        this.respondHtml(res, false, "State mismatch — please retry");
                        this.finishLogin(new Error("State mismatch"));
                        return;
                    }

                    const tokens = await this.exchangeCode(code, this.pendingLogin.codeVerifier, this.pendingLogin.redirectUri);
                    this.client.setCredentials(tokens);
                    const email = await this.fetchUserEmail();
                    this.email = email;
                    await this.persistTokens(tokens, email);
                    this.isInitialized = true;

                    this.respondHtml(res, true, "You can close this tab and return to Stream Deck.");
                    this.finishLogin(null, email);
                } catch (err: any) {
                    streamDeck.logger.error(`[Antigravity] Login callback error: ${err}`);
                    this.respondHtml(res, false, `Login failed: ${err?.message || err}`);
                    this.finishLogin(err instanceof Error ? err : new Error(String(err)));
                }
            });

            server.listen(0, "127.0.0.1", () => {
                const port = (server.address() as AddressInfo).port;
                const redirectUri = `http://127.0.0.1:${port}/callback`;

                this.pendingLogin = {
                    server,
                    codeVerifier,
                    redirectUri,
                    state,
                    resolve,
                    reject,
                };

                const authUrl = this.client.generateAuthUrl({
                    access_type: "offline",
                    prompt: "consent",
                    scope: OAUTH_SCOPES,
                    redirect_uri: redirectUri,
                    state,
                    code_challenge: codeChallenge,
                    code_challenge_method: CodeChallengeMethod.S256,
                });

                streamDeck.logger.info(`[Antigravity] Opening browser for OAuth: ${authUrl}`);
                exec(`open "${authUrl}"`);

                // Safety: abort if the user never completes within 5 minutes
                setTimeout(() => {
                    if (this.pendingLogin && this.pendingLogin.server === server) {
                        this.finishLogin(new Error("Login timed out"));
                    }
                }, 5 * 60 * 1000);
            });

            server.on("error", (err) => {
                streamDeck.logger.error(`[Antigravity] Local server error: ${err}`);
                this.finishLogin(err);
            });
        });
    }

    async getQuota(): Promise<AntigravityQuotaResult | null> {
        const now = Date.now();
        if (this.cache && (now - this.lastFetch) < this.CACHE_TTL_MS) {
            return this.cache;
        }

        try {
            await this.initialize();
        } catch (err) {
            streamDeck.logger.warn(`[Antigravity] Not logged in: ${err}`);
            return {
                overallUsage: 0,
                overallResetTime: null,
                perModel: new Map(),
                error: { code: "AUTH", message: "Auth Required" }
            };
        }

        const perModel = new Map<string, AntigravityModelQuota>();
        const fractions: number[] = [];
        let overallResetTime: string | null = null;

        try {
            const quota = await this.apiPost<RetrieveUserQuotaResponse>("retrieveUserQuota", {});
            const modelLabels = await this.fetchModelDisplayNames();
            this.buildPerModelFromQuotaBuckets(quota.buckets || [], perModel, fractions, modelLabels);
            overallResetTime = this.pickOverallResetTimeFromQuotaBuckets(quota.buckets || [], fractions);
        } catch (err) {
            streamDeck.logger.warn(`[Antigravity] retrieveUserQuota failed, fallback to fetchAvailableModels: ${err}`);
            try {
                const data = await this.apiPost<FetchAvailableModelsResponse>("fetchAvailableModels", {});
                this.buildPerModelFromAvailableModels(data.models || {}, perModel, fractions);
                overallResetTime = this.pickOverallResetTimeFromAvailableModels(data.models || {}, fractions);
            } catch (fallbackErr: any) {
                const msg = String(fallbackErr?.message || fallbackErr);
                let code: string | number = "API";
                let message = "API Error";
                if (msg.includes("401") || msg.includes("403") || msg.includes("token")) {
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
                    perModel,
                    error: { code, message }
                };
            }
        }

        let overallUsage = 0;
        if (fractions.length > 0) {
            const lowest = Math.min(...fractions);
            overallUsage = Math.min(Math.max(Math.round((1 - lowest) * 100), 0), 100);
        }

        streamDeck.logger.info(
            `[Antigravity] Overall usage: ${overallUsage}%, models: ${perModel.size}`
        );

        const result: AntigravityQuotaResult = { overallUsage, overallResetTime, perModel };
        this.cache = result;
        this.lastFetch = now;
        return result;
    }

    private buildPerModelFromQuotaBuckets(
        buckets: RetrieveUserQuotaBucket[],
        perModel: Map<string, AntigravityModelQuota>,
        fractions: number[],
        modelLabels: Record<string, string>
    ): void {
        for (const bucket of buckets) {
            const modelId = bucket.modelId;
            const remainingFraction = bucket.remainingFraction;
            if (!modelId || typeof remainingFraction !== "number") continue;

            const usage = Math.min(Math.max(Math.round((1 - remainingFraction) * 100), 0), 100);
            perModel.set(modelId, {
                usage,
                remaining: 0,
                limit: 0,
                resetTime: bucket.resetTime,
                displayName: modelLabels[modelId] ?? modelId,
            });
            fractions.push(remainingFraction);
        }
    }

    private async fetchModelDisplayNames(): Promise<Record<string, string>> {
        const labels: Record<string, string> = {};
        try {
            const data = await this.apiPost<FetchAvailableModelsResponse>("fetchAvailableModels", {});
            for (const [id, info] of Object.entries(data.models || {})) {
                labels[id] = info.displayName || id;
            }
        } catch (err) {
            streamDeck.logger.warn(`[Antigravity] fetchAvailableModels for labels failed: ${err}`);
        }
        return labels;
    }

    private pickOverallResetTimeFromQuotaBuckets(
        buckets: RetrieveUserQuotaBucket[],
        fractions: number[]
    ): string | null {
        if (fractions.length === 0) return null;
        let mostConstrainedFraction = Infinity;
        let resetTime: string | null = null;
        for (const bucket of buckets) {
            const f = bucket.remainingFraction;
            if (typeof f !== "number") continue;
            if (f < mostConstrainedFraction) {
                mostConstrainedFraction = f;
                resetTime = bucket.resetTime ?? null;
            }
        }
        return resetTime;
    }

    private buildPerModelFromAvailableModels(
        models: Record<string, ModelInfo>,
        perModel: Map<string, AntigravityModelQuota>,
        fractions: number[]
    ): void {
        for (const [modelId, info] of Object.entries(models)) {
            const qi = info.quotaInfo;
            if (!qi || typeof qi.remainingFraction !== "number") continue;

            const usage = Math.min(Math.max(Math.round((1 - qi.remainingFraction) * 100), 0), 100);
            perModel.set(modelId, {
                usage,
                remaining: 0,
                limit: 0,
                resetTime: qi.resetTime,
                displayName: info.displayName ?? modelId,
            });
            fractions.push(qi.remainingFraction);
        }
    }

    private pickOverallResetTimeFromAvailableModels(
        models: Record<string, ModelInfo>,
        fractions: number[]
    ): string | null {
        if (fractions.length === 0) return null;
        let mostConstrained: ModelInfo | null = null;
        let mostConstrainedFraction = Infinity;
        for (const info of Object.values(models)) {
            const f = info.quotaInfo?.remainingFraction;
            if (typeof f !== "number") continue;
            if (f < mostConstrainedFraction) {
                mostConstrainedFraction = f;
                mostConstrained = info;
            }
        }
        return mostConstrained?.quotaInfo?.resetTime ?? null;
    }

    getAvailableModels(): string[] {
        if (!this.cache) return [];
        return [...this.cache.perModel.keys()];
    }

    getModelLabels(): Record<string, string> {
        const labels: Record<string, string> = {};
        if (!this.cache) return labels;
        for (const [id, info] of this.cache.perModel) {
            labels[id] = info.displayName || id;
        }
        return labels;
    }

    private async initialize(): Promise<void> {
        if (this.isInitialized) return;
        const tokens = await this.loadTokens();
        if (!tokens) {
            throw new Error("No saved credentials");
        }
        this.client.setCredentials(tokens);
        this.email = tokens.email ?? null;
        this.isInitialized = true;
    }

    private async apiPost<T>(method: string, body: Record<string, unknown>): Promise<T> {
        const token = await this.getAccessToken();
        const url = `${CODE_ASSIST_ENDPOINT}:${method}`;

        const send = async (bearer: string): Promise<Response> => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            try {
                return await fetch(url, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${bearer}`,
                        "Content-Type": "application/json",
                        "User-Agent": "antigravity",
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timeout);
            }
        };

        let response = await send(token);

        if (response.status === 401 || response.status === 403) {
            // Stale access token — refresh and retry once
            streamDeck.logger.warn(`[Antigravity] ${response.status} on ${method}, retrying after refresh`);
            this.isInitialized = false;
            await this.initialize();
            const newToken = await this.getAccessToken();
            response = await send(newToken);
        }

        if (!response.ok) {
            const errText = await response.text().catch(() => "");
            streamDeck.logger.error(`[Antigravity] ${method} ${response.status}: ${errText.slice(0, 300)}`);
            throw new Error(`Antigravity API ${method} returned ${response.status}: ${response.statusText}`);
        }
        return (await response.json()) as T;
    }

    private async getAccessToken(): Promise<string> {
        const { token } = await this.client.getAccessToken();
        if (!token) {
            throw new Error("Failed to obtain access token");
        }
        // Persist the (possibly refreshed) credentials back to disk so we keep the
        // latest access_token / expiry_date for the next plugin restart.
        const creds = this.client.credentials;
        if (creds.access_token) {
            await this.persistTokens(creds, this.email);
        }
        return token;
    }

    private async exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<StoredToken> {
        const params = new URLSearchParams({
            code,
            client_id: process.env.ANTIGRAVITY_CLIENT_ID || OAUTH_CLIENT_ID,
            client_secret: process.env.ANTIGRAVITY_CLIENT_SECRET || OAUTH_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
            code_verifier: codeVerifier,
        });

        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Token exchange failed: ${response.status} ${text}`);
        }

        const data = await response.json() as any;
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
            token_type: data.token_type,
            id_token: data.id_token,
            scope: data.scope,
        };
    }

    private async fetchUserEmail(): Promise<string> {
        try {
            const { token } = await this.client.getAccessToken();
            const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return "";
            const data = await response.json() as any;
            return data.email || "";
        } catch {
            return "";
        }
    }

    private async loadTokens(): Promise<StoredToken | null> {
        try {
            const raw = await fs.readFile(TOKEN_PATH, "utf-8");
            return JSON.parse(raw) as StoredToken;
        } catch (err: any) {
            if (err?.code === "ENOENT") return null;
            streamDeck.logger.warn(`[Antigravity] Failed to read token file: ${err}`);
            return null;
        }
    }

    private async persistTokens(tokens: StoredToken | Record<string, any>, email: string | null): Promise<void> {
        try {
            await fs.mkdir(STORAGE_DIR, { recursive: true });
            const merged: StoredToken = {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expiry_date: tokens.expiry_date,
                token_type: tokens.token_type,
                id_token: tokens.id_token,
                scope: tokens.scope,
                email: email || undefined,
            };
            await fs.writeFile(TOKEN_PATH, JSON.stringify(merged, null, 2), { mode: 0o600 });
        } catch (err) {
            streamDeck.logger.warn(`[Antigravity] Failed to persist tokens: ${err}`);
        }
    }

    private finishLogin(err: Error | null, email?: string): void {
        if (!this.pendingLogin) return;
        const { server, resolve, reject } = this.pendingLogin;
        this.pendingLogin = null;
        try {
            server.close();
        } catch { /* ignore */ }
        if (err) reject(err);
        else resolve(email || "");
    }

    private respondHtml(res: http.ServerResponse, ok: boolean, message: string): void {
        const color = ok ? "#10b981" : "#ef4444";
        const title = ok ? "Signed in" : "Sign-in error";
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f1115;color:#eee}
.card{padding:32px 40px;border-radius:12px;background:#1a1d24;border:1px solid #2a2f39;text-align:center;max-width:480px}
h1{margin:0 0 12px;color:${color};font-size:20px}p{margin:0;color:#9ca3af;font-size:14px;line-height:1.5}
</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
        res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    }

    private generateCodeVerifier(): string {
        return crypto.randomBytes(32).toString("base64url");
    }

    private generateCodeChallenge(verifier: string): string {
        return crypto.createHash("sha256").update(verifier).digest("base64url");
    }
}
