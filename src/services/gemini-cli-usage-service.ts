import { LimitsClient, ProviderName, GeminiProvider } from "@lenadweb/ai-limits";

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

export class GeminiCliUsageService {
    private static instance: GeminiCliUsageService;
    private client = new LimitsClient();
    private provider: GeminiProvider;
    private cache: GeminiQuotaResult | null = null;

    private constructor() {
        this.provider = this.client.getProvider<GeminiProvider>(ProviderName.Gemini);
    }

    public static getInstance(): GeminiCliUsageService {
        if (!GeminiCliUsageService.instance) {
            GeminiCliUsageService.instance = new GeminiCliUsageService();
        }
        return GeminiCliUsageService.instance;
    }

    public getAvailableModels(): string[] {
        if (!this.cache) return [];
        return [...this.cache.perModel.keys()];
    }

    public async getQuota(): Promise<GeminiQuotaResult> {
        try {
            const res = await this.client.fetchUsage(ProviderName.Gemini);
            if (res.error) {
                return {
                    overallUsage: 0,
                    overallResetTime: null,
                    perModel: new Map(),
                    error: res.error
                };
            }
            const perModel = new Map<string, ModelQuota>();
            if (res.perModel) {
                for (const [id, model] of Object.entries(res.perModel)) {
                    perModel.set(id, {
                        usage: model.usagePercent,
                        remaining: model.remainingAmount ?? 0,
                        limit: model.limitAmount ?? 0,
                        resetTime: model.resetTime ?? undefined
                    });
                }
            }
            const quota: GeminiQuotaResult = {
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
