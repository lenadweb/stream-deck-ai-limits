import streamDeck from "@elgato/streamdeck";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

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
    private envCache: { apiKey: string; groupId: string } | null = null;
    private readonly CACHE_TTL_MS = 60000;
    private readonly TARGET_MODEL = "MiniMax-M*";

    private async readEnv(): Promise<{ apiKey: string; groupId: string } | null> {
        if (this.envCache) return this.envCache;

        try {
            const envPath = join(homedir(), ".minimax", ".env");
            const content = await readFile(envPath, "utf-8");
            const vars: Record<string, string> = {};
            for (const line of content.split("\n")) {
                const match = line.match(/^([^#=]+)=(.*)$/);
                if (match) {
                    vars[match[1].trim()] = match[2].trim();
                }
            }

            const apiKey = vars["MINIMAX_API_KEY"];
            const groupId = vars["MINIMAX_GROUP_ID"];

            if (!apiKey || !groupId) {
                streamDeck.logger.warn("[MiniMax] Missing MINIMAX_API_KEY or MINIMAX_GROUP_ID in .env");
                return null;
            }

            this.envCache = { apiKey, groupId };
            return this.envCache;
        } catch (err) {
            streamDeck.logger.error(`[MiniMax] Failed to read .env: ${err}`);
            return null;
        }
    }

    async fetchUsage(): Promise<MiniMaxUsage | null> {
        const now = Date.now();
        if (this.cache && (now - this.lastFetch) < this.CACHE_TTL_MS) {
            streamDeck.logger.info("[MiniMax] Returning cached usage");
            return this.cache;
        }

        const env = await this.readEnv();
        if (!env) return null;

        try {
            streamDeck.logger.info("[MiniMax] Fetching usage from MiniMax API...");

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const url = `https://platform.minimax.io/v1/api/openplatform/coding_plan/remains?GroupId=${env.groupId}`;
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${env.apiKey}`,
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
                streamDeck.logger.warn(`[MiniMax] Model ${this.TARGET_MODEL} not found in response`);
                return null;
            }

            const dailyUsed = model.current_interval_total_count - model.current_interval_usage_count;
            const sessionPercent = model.current_interval_total_count > 0
                ? Math.round((dailyUsed / model.current_interval_total_count) * 100)
                : 0;

            const weeklyUsed = model.current_weekly_total_count - model.current_weekly_usage_count;
            const weekPercent = model.current_weekly_total_count > 0
                ? Math.round((weeklyUsed / model.current_weekly_total_count) * 100)
                : 0;

            const usage: MiniMaxUsage = {
                sessionUsed: sessionPercent,
                sessionResetsAt: Math.floor(model.end_time / 1000),
                weekUsed: weekPercent,
                weekResetsAt: Math.floor(model.weekly_end_time / 1000),
            };

            streamDeck.logger.info(`[MiniMax] ${this.TARGET_MODEL} - Daily: ${model.current_interval_usage_count}/${model.current_interval_total_count} (${sessionPercent}%), Weekly: ${model.current_weekly_usage_count}/${model.current_weekly_total_count} (${weekPercent}%)`);

            this.cache = usage;
            this.lastFetch = now;

            return usage;
        } catch (err) {
            streamDeck.logger.error(`[MiniMax] API fetch error: ${err}`);
            return null;
        }
    }
}
