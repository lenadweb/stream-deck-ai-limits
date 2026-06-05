import { LimitsClient, ProviderName } from "@lenadweb/ai-limits";

export interface CodexUsage {
    sessionUsed: number | null;
    weekUsed: number | null;
    sessionResetsAt: number | null;
    weekResetsAt: number | null;
    error?: { code: number | string; message: string };
}

export class CodexUsageService {
    private client = new LimitsClient();

    async fetchUsage(): Promise<CodexUsage | null> {
        try {
            const res = await this.client.fetchUsage(ProviderName.ChatGpt);
            if (res.error) {
                return {
                    sessionUsed: null,
                    weekUsed: null,
                    sessionResetsAt: null,
                    weekResetsAt: null,
                    error: res.error
                };
            }
            const primary = res.perModel?.["primary_window"];
            const secondary = res.perModel?.["secondary_window"];
            return {
                sessionUsed: primary ? primary.usagePercent : null,
                sessionResetsAt: primary && primary.resetTime ? Math.floor(new Date(primary.resetTime).getTime() / 1000) : null,
                weekUsed: secondary ? secondary.usagePercent : null,
                weekResetsAt: secondary && secondary.resetTime ? Math.floor(new Date(secondary.resetTime).getTime() / 1000) : null
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
