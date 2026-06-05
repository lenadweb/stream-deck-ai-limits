import { LimitsClient, ProviderName, AntigravityProvider } from "@lenadweb/ai-limits";
import { AntigravityQuotaResult, AntigravityModelQuota } from "../interfaces/usage";

export type {
    AntigravityModelQuota,
    AntigravityQuotaResult
};

export class AntigravityUsageService {
    private static instance: AntigravityUsageService;
    private client = new LimitsClient();
    private provider: AntigravityProvider;
    private cache: AntigravityQuotaResult | null = null;

    private constructor() {
        this.provider = this.client.getProvider<AntigravityProvider>(ProviderName.Antigravity);
    }

    static getInstance(): AntigravityUsageService {
        if (!AntigravityUsageService.instance) {
            AntigravityUsageService.instance = new AntigravityUsageService();
        }
        return AntigravityUsageService.instance;
    }

    async isLoggedIn(): Promise<boolean> {
        return this.provider.isLoggedIn();
    }

    getLoggedInEmail(): string | null {
        return this.provider.getLoggedInEmail();
    }

    async logout(): Promise<void> {
        await this.provider.logout();
        this.cache = null;
    }

    async login(): Promise<string> {
        return this.provider.login();
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

    async getQuota(): Promise<AntigravityQuotaResult | null> {
        try {
            const res = await this.client.fetchUsage(ProviderName.Antigravity);
            if (res.error) {
                return {
                    overallUsage: 0,
                    overallResetTime: null,
                    perModel: new Map(),
                    error: res.error
                };
            }
            const perModel = new Map<string, AntigravityModelQuota>();
            if (res.perModel) {
                for (const [id, model] of Object.entries(res.perModel)) {
                    perModel.set(id, {
                        usage: model.usagePercent,
                        remaining: model.remainingAmount ?? 0,
                        limit: model.limitAmount ?? 0,
                        resetTime: model.resetTime ?? undefined,
                        displayName: model.displayName || id
                    });
                }
            }
            const quota: AntigravityQuotaResult = {
                overallUsage: res.overallUsagePercent ?? 0,
                overallResetTime: res.overallResetTime,
                perModel
            };
            this.cache = quota;
            return quota;
        } catch (err: any) {
            return {
                overallUsage: 0,
                overallResetTime: null,
                perModel: new Map(),
                error: { code: "ERROR", message: err.message || String(err) }
            };
        }
    }
}
