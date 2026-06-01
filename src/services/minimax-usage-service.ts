import streamDeck from "@elgato/streamdeck";
import { MiniMaxSettings } from "../interfaces/settings";

interface MiniMaxModelRemains {
    start_time: number;
    end_time: number;
    remains_time: number;
    current_interval_total_count: number;
    current_interval_usage_count: number;
    model_name: string;
    current_weekly_total_count: number;
    current_weekly_usage_count: number;
    weekly_start_time: number;
    weekly_end_time: number;
    weekly_remains_time: number;
    current_interval_status?: number;
    current_interval_remaining_percent?: number;
    current_weekly_status?: number;
    current_weekly_remaining_percent?: number;
}

interface MiniMaxApiResponse {
    model_remains: MiniMaxModelRemains[];
    base_resp: { status_code: number; status_msg: string };
}

export interface MiniMaxUsage {
    sessionUsed: number | null;
    sessionResetsAt: number | null;
    weekUsed: number | null;
    weekResetsAt: number | null;
}

export class MiniMaxUsageService {
    private lastFetch: number = 0;
    private cache: MiniMaxUsage | null = null;
    private credentialsCache: { apiKey: string; groupId: string } | null = null;
    private readonly CACHE_TTL_MS = 60000;
    /** Coding-plan /coding_plan/remains returns model_name = "general" (LLM, MiniMax-M*) and "video". We track the LLM. */
    private readonly TARGET_MODEL = "general";

    private readSettings(settings?: MiniMaxSettings): { apiKey: string; groupId: string } | null {
        const apiKey = settings?.apiKey?.trim();
        const groupId = settings?.groupId?.trim();

        if (!apiKey || !groupId) {
            streamDeck.logger.warn("[MiniMax] Missing apiKey or groupId in action settings");
            return null;
        }

        return { apiKey, groupId };
    }

    async fetchUsage(settings?: MiniMaxSettings): Promise<MiniMaxUsage | null> {
        const now = Date.now();
        const credentials = this.readSettings(settings);
        if (!credentials) return null;

        const isSameCredentials = this.credentialsCache
            && this.credentialsCache.apiKey === credentials.apiKey
            && this.credentialsCache.groupId === credentials.groupId;

        if (isSameCredentials && this.cache && (now - this.lastFetch) < this.CACHE_TTL_MS) {
            streamDeck.logger.info("[MiniMax] Returning cached usage");
            return this.cache;
        }

        this.credentialsCache = credentials;

        try {
            streamDeck.logger.info("[MiniMax] Fetching usage from MiniMax API...");

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const url = `https://platform.minimax.io/v1/api/openplatform/coding_plan/remains?GroupId=${credentials.groupId}`;
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${credentials.apiKey}`,
                    "Accept": "application/json",
                },
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                streamDeck.logger.error(`[MiniMax] API returned status: ${response.status}`);
                return null;
            }

            const data = await response.json() as MiniMaxApiResponse;
            streamDeck.logger.info(`[MiniMax] Raw API response: ${JSON.stringify(data)}`);

            if (data.base_resp.status_code !== 0) {
                streamDeck.logger.error(`[MiniMax] API error: ${data.base_resp.status_msg}`);
                return null;
            }

            const model = data.model_remains.find(m => m.model_name === this.TARGET_MODEL);
            if (!model) {
                const available = data.model_remains.map(m => m.model_name).join(", ");
                streamDeck.logger.warn(`[MiniMax] Model ${this.TARGET_MODEL} not found in response (available: ${available || "none"})`);
                return null;
            }

            // The API exposes remaining% directly; total_count/usage_count are both 0 in current schema,
            // so we cannot derive usage from them. used% = 100 - remaining%.
            const dailyRemaining = model.current_interval_remaining_percent ?? 100;
            const weeklyRemaining = model.current_weekly_remaining_percent ?? 100;
            const sessionPercent = Math.max(0, Math.min(100, Math.round(100 - dailyRemaining)));
            const weekPercent = Math.max(0, Math.min(100, Math.round(100 - weeklyRemaining)));

            const usage: MiniMaxUsage = {
                sessionUsed: sessionPercent,
                sessionResetsAt: Math.floor(model.end_time / 1000),
                weekUsed: weekPercent,
                weekResetsAt: Math.floor(model.weekly_end_time / 1000),
            };

            streamDeck.logger.info(`[MiniMax] ${this.TARGET_MODEL} - Daily used: ${sessionPercent}% (remaining ${dailyRemaining}%), Weekly used: ${weekPercent}% (remaining ${weeklyRemaining}%)`);

            this.cache = usage;
            this.lastFetch = now;

            return usage;
        } catch (err) {
            streamDeck.logger.error(`[MiniMax] API fetch error: ${err}`);
            return null;
        }
    }
}
