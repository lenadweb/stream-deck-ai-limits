import { action } from "@elgato/streamdeck";
import { LimitsClient, ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { MiniMaxMetric, MiniMaxSettings, TileLayout } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";
import { Slot } from "../ui/progress-bar-renderer";
import { formatTimeUntil } from "../utils/time-formatter";
import { streamDeckLogger } from "../services/limits-manager";

const METRICS: Record<MiniMaxMetric, { label: string; key: string }> = {
    daily: { label: "Daily", key: "general" },
    weekly: { label: "Week", key: "weekly_interval" }
};

@action({ UUID: "com.len.limits.minimax" })
export class MiniMaxProgressBars extends BaseMonitoringAction<MiniMaxSettings> {
    protected readonly providerName = ProviderName.MiniMax;
    protected readonly themeName: ServiceTheme = "minimax";

    protected override fetchKey(settings: MiniMaxSettings | undefined): string {
        return settings?.apiKey?.trim() || "";
    }

    protected override async fetchProviderUsage(ev: any): Promise<StandardUsageResult> {
        const apiKey = this.fetchKey(ev?.payload?.settings);
        if (!apiKey) {
            return {
                provider: this.providerName,
                overallUsagePercent: null,
                overallResetTime: null,
                error: { code: "AUTH", message: "Auth Required" }
            };
        }
        const client = new LimitsClient({ minimax: { apiKey }, logger: streamDeckLogger });
        return client.fetchUsage(this.providerName);
    }

    protected getDisplayData(ev: any, result: StandardUsageResult) {
        const settings = (ev?.payload?.settings ?? {}) as MiniMaxSettings;
        const layout: TileLayout = settings.layout ?? "bars";

        if (layout === "ring") {
            return this.tileDisplay([this.metricSlot(settings.metric ?? "daily", result)], layout);
        }

        return this.tileDisplay([
            this.metricSlot(settings.topMetric ?? "daily", result),
            this.metricSlot(settings.bottomMetric ?? "weekly", result)
        ], layout);
    }

    private metricSlot(metric: MiniMaxMetric, result: StandardUsageResult): Slot {
        const definition = METRICS[metric] ?? METRICS.daily;
        const bucket = result.perModel?.[definition.key];

        if (!bucket) {
            return { kind: "stat", label: definition.label, valueText: "—", caption: "no data", muted: true };
        }

        return {
            kind: "gauge",
            label: definition.label,
            percent: bucket.usagePercent ?? 0,
            caption: bucket.resetTime ? formatTimeUntil(bucket.resetTime) : undefined
        };
    }
}
