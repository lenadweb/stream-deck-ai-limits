import { OAuth2Client } from "google-auth-library";
import fs from "fs/promises";
import path from "path";
import os from "os";

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

export class GeminiCliUsageService {
    private static instance: GeminiCliUsageService;
    private client: OAuth2Client;
    private isInitialized = false;

    private constructor() {
        this.client = new OAuth2Client({
            clientId: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
            clientSecret: "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", // NOTE: public Gemini CLI OAuth secret (native/PKCE "installed app" client); non-confidential by design, NOT a personal credential.
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
            const credsPath = path.join(os.homedir(), ".gemini", "oauth_creds.json");
            const credsStr = await fs.readFile(credsPath, "utf-8");
            const creds = JSON.parse(credsStr);
            this.client.setCredentials(creds);
            this.isInitialized = true;
        } catch (e) {
            console.error("Failed to load Gemini OAuth credentials", e);
            throw e;
        }
    }

    /**
     * Fetches the lowest remaining fraction across all model buckets.
     * Returns a value between 0 and 100, where 100 is fully utilized.
     */
    public async getUsagePercentage(): Promise<number> {
        await this.initialize();
        try {
            const { token } = await this.client.getAccessToken();
            const response = await fetch("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
            });

            if (!response.ok) {
                throw new Error(`Google API returned ${response.status}: ${response.statusText}`);
            }

            const data = (await response.json()) as QuotaResponse;
            if (!data.buckets || data.buckets.length === 0) {
                return 0; // Unknown or unlimited mapping
            }

            // Find the most constrained bucket
            const lowestFraction = Math.min(...data.buckets.map((b) => b.remainingFraction));

            // Calculate the consumed percentage
            const usagePercentage = Math.round((1 - lowestFraction) * 100);

            // Clamp between 0 and 100 just in case
            return Math.min(Math.max(usagePercentage, 0), 100);
        } catch (e) {
            console.error("Failed to fetch Gemini CLI quota", e);
            return 0;
        }
    }
}
