import { LimitsClient, ProviderName } from "@lenadweb/ai-limits";
import { MiniMaxSettings } from "../interfaces/settings";

export interface MiniMaxUsage {
    sessionUsed: number | null;
    sessionResetsAt: number | null;
    weekUsed: number | null;
    weekResetsAt: number | null;
    error?: { code: number | string; message: string };
}

export class MiniMaxUsageService {
    async fetchUsage(settings?: MiniMaxSettings): Promise<MiniMaxUsage | null> {
        const apiKey = settings?.apiKey?.trim() || "";
        if (!apiKey) {
            return {
                sessionUsed: null,
                sessionResetsAt: null,
                weekUsed: null,
                weekResetsAt: null,
                error: { code: "AUTH", message: "Auth Required" }
            };
        }

        try {
            const client = new LimitsClient({ minimax: { apiKey } });
            const res = await client.fetchUsage(ProviderName.MiniMax);
            if (res.error) {
                return {
                    sessionUsed: null,
                    sessionResetsAt: null,
                    weekUsed: null,
                    weekResetsAt: null,
                    error: res.error
                };
            }
            const general = res.perModel?.["general"];
            const weekly = res.perModel?.["weekly_interval"];
            return {
                sessionUsed: general ? general.usagePercent : null,
                sessionResetsAt: general && general.resetTime ? Math.floor(new Date(general.resetTime).getTime() / 1000) : null,
                weekUsed: weekly ? weekly.usagePercent : null,
                weekResetsAt: weekly && weekly.resetTime ? Math.floor(new Date(weekly.resetTime).getTime() / 1000) : null
            };
        } catch (err: any) {
            return {
                sessionUsed: null,
                sessionResetsAt: null,
                weekUsed: null,
                weekResetsAt: null,
                error: { code: "ERROR", message: err.message || String(err) }
            };
        }
    }
}
