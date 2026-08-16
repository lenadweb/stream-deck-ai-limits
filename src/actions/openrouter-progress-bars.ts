import { action } from "@elgato/streamdeck";
import { LimitsClient, ProviderName, StandardUsageResult, OpenRouterProvider, OpenRouterUsage } from "@lenadweb/ai-limits";
import { OpenRouterMetric, OpenRouterSettings, TileLayout } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";
import { Slot } from "../ui/progress-bar-renderer";
import { streamDeckLogger } from "../services/limits-manager";

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
        const settings = (ev?.payload?.settings ?? {}) as OpenRouterSettings;
        const layout: TileLayout = settings.layout ?? "bars";

        if (layout === "ring") {
            return this.tileDisplay([this.metricSlot(settings.metric ?? "limit")], layout);
        }

        return this.tileDisplay([
            this.metricSlot(settings.topMetric ?? "limit"),
            this.metricSlot(settings.bottomMetric ?? "monthly")
        ], layout);
    }

    private metricSlot(metric: OpenRouterMetric): Slot {
        const label = METRIC_LABELS[metric];
        const d = this.details;

        if (metric === "limit") {
            if (d?.limit) {
                return {
                    kind: "gauge",
                    label,
                    percent: d.limit.usagePercent,
                    valueText: `${d.limit.usagePercent}%`,
                    caption: d.limit.resetTime ? formatResetTime(d.limit.resetTime) : undefined
                };
            }
            return { kind: "stat", label: "Limit", valueText: "∞", caption: "no limit" };
        }

        const amount = d ? d.spend[metric] : null;
        const valueText = amount == null ? "—" : `$${formatSpend(amount)}`;

        return {
            kind: "stat",
            label,
            valueText,
            caption: metric === "total" ? "All Time" : "spent"
        };
    }
}

function formatResetTime(resetTime: string): string {
    const diffMs = new Date(resetTime).getTime() - Date.now();
    if (!Number.isFinite(diffMs) || diffMs <= 0) return "now";
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return hours % 24 > 0 ? `${days}d ${hours % 24}h` : `${days}d`;
    if (hours > 0) return minutes % 60 > 0 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
    return `${minutes}m`;
}

function formatSpend(value: number): string {
    if (value === 0) return "0";
    if (value >= 1_000_000) return `${trim(value / 1_000_000)}M`;
    if (value >= 10_000) return `${trim(value / 1_000)}k`;
    const fixed = value < 1 ? value.toFixed(4) : value.toFixed(2);
    const trimmed = fixed.replace(/\.?0+$/, "");
    const [int, dec] = trimmed.split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return dec ? `${grouped}.${dec}` : grouped;
}

function trim(value: number): string {
    return value.toFixed(1).replace(/\.0$/, "");
}
