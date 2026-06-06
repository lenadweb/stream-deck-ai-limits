import { action } from "@elgato/streamdeck";
import { LimitsClient, ProviderName, StandardUsageResult, OpenRouterProvider, OpenRouterUsage } from "@lenadweb/ai-limits";
import { OpenRouterMetric, OpenRouterSettings } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";
import { streamDeckLogger } from "../services/limits-manager";

interface Bar {
    value: number;
    valueText: string;
    label: string;
    resetTime?: string | null;
}

const METRIC_LABELS: Record<OpenRouterMetric, string> = {
    limit: "Limit",
    daily: "Today",
    weekly: "Week",
    monthly: "Month",
    total: "Total"
};

@action({ UUID: "com.len.limits.openrouter" })
export class OpenRouterProgressBars extends BaseMonitoringAction<OpenRouterSettings> {
    protected readonly providerName = ProviderName.OpenRouter;
    protected readonly themeName: ServiceTheme = "openrouter";
    private settings: OpenRouterSettings = {};
    private details: OpenRouterUsage | null = null;

    private get topMetric(): OpenRouterMetric {
        return this.settings.topMetric ?? "limit";
    }

    private get bottomMetric(): OpenRouterMetric {
        return this.settings.bottomMetric ?? "monthly";
    }

    override async onWillAppear(ev: any): Promise<void> {
        this.settings = (ev.payload?.settings ?? {}) as OpenRouterSettings;
        await super.onWillAppear(ev);
    }

    override async onDidReceiveSettings(ev: any): Promise<void> {
        this.settings = (ev.payload?.settings ?? {}) as OpenRouterSettings;
        // Re-render from cached details without forcing a network call when only
        // the selected metric changed; refresh only if we have no data yet.
        if (this.details) {
            await this.redraw(ev);
        } else {
            await this.refresh(ev);
        }
    }

    protected override async fetchProviderUsage(ev: any): Promise<StandardUsageResult> {
        const apiKey = this.settings.apiKey?.trim() || "";
        if (!apiKey) {
            this.details = null;
            return {
                provider: this.providerName,
                overallUsagePercent: null,
                overallResetTime: null,
                error: { code: "AUTH", message: "Auth Required" }
            };
        }

        const client = new LimitsClient({ openrouter: { apiKey }, logger: streamDeckLogger });
        const provider = client.getProvider<OpenRouterProvider>(ProviderName.OpenRouter);
        const result = await provider.fetchUsage();

        if (result.error) {
            this.details = null;
        } else {
            try {
                this.details = await provider.fetchDetails();
            } catch {
                this.details = null;
            }
        }
        return result;
    }

    protected getDisplayData(ev: any, result: StandardUsageResult) {
        const top = this.metricBar(this.topMetric);
        const bottom = this.metricBar(this.bottomMetric);
        return {
            value1: top.value,
            value2: bottom.value,
            label1: top.label,
            label2: bottom.label,
            resetTime1: top.resetTime,
            resetTime2: bottom.resetTime,
            valueText1: top.valueText,
            valueText2: bottom.valueText
        };
    }

    private metricBar(metric: OpenRouterMetric): Bar {
        const label = METRIC_LABELS[metric];
        const d = this.details;

        if (metric === "limit") {
            if (d?.limit) {
                return {
                    value: d.limit.usagePercent,
                    valueText: `${d.limit.usagePercent}%`,
                    label,
                    resetTime: d.limit.resetTime
                };
            }
            return { value: 0, valueText: "∞", label, resetTime: null };
        }

        const window = metric === "total" ? null : metric;
        const amount = d ? d.spend[metric] : null;
        // The bar only fills proportionally when the key's limit shares this window;
        // otherwise the dollar amount is the meaningful value and the bar stays flat.
        const matchesLimit = !!window && !!d?.limit && d.limit.interval === window;
        return {
            value: matchesLimit ? d!.limit!.usagePercent : 0,
            valueText: amount == null ? "—" : `$${formatSpend(amount)}`,
            label,
            resetTime: matchesLimit ? d!.limit!.resetTime : null
        };
    }
}

function formatSpend(value: number): string {
    if (value === 0) return "0";
    const fixed = value < 1 ? value.toFixed(4) : value.toFixed(2);
    return fixed.replace(/\.?0+$/, "");
}
