import { LimitsClient, ProviderName } from "@lenadweb/ai-limits";

export interface ClaudeUsage {
    sessionUsed: number | null;
    weekUsed: number | null;
    sessionResetsAt: string | null;
    weekResetsAt: string | null;
    error?: { code: number | string; message: string };
}

export class ClaudeUsageService {
    private client = new LimitsClient();

    async fetchUsage(): Promise<ClaudeUsage | null> {
        try {
            const res = await this.client.fetchUsage(ProviderName.Claude);
            if (res.error) {
                return {
                    sessionUsed: null,
                    weekUsed: null,
                    sessionResetsAt: null,
                    weekResetsAt: null,
                    error: res.error
                };
            }
            const fiveHour = res.perModel?.["five_hour"];
            const sevenDay = res.perModel?.["seven_day"] || res.perModel?.["seven_day_sonnet"];
            return {
                sessionUsed: fiveHour ? fiveHour.usagePercent : null,
                sessionResetsAt: fiveHour ? (fiveHour.resetTime || null) : null,
                weekUsed: sevenDay ? sevenDay.usagePercent : null,
                weekResetsAt: sevenDay ? (sevenDay.resetTime || null) : null
            };
        } catch (err: any) {
            return {
                sessionUsed: null,
                weekUsed: null,
                sessionResetsAt: null,
                weekResetsAt: null,
                error: { code: "ERROR", message: err.message || String(err) }
            };
        }
    }
}
