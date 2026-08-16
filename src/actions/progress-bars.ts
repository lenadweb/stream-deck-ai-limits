import { action } from "@elgato/streamdeck";
import { ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { ClaudeMetric, ClaudeSettings, TileLayout } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";
import { Slot } from "../ui/progress-bar-renderer";
import { formatTimeUntil } from "../utils/time-formatter";

/** Bucket keys vary per Claude plan/API version, so each metric accepts several. */
const METRICS: Record<ClaudeMetric, { label: string; keys: string[] }> = {
    session: { label: "Session", keys: ["five_hour", "5h_quota"] },
    weekly: { label: "Week", keys: ["seven_day", "7d_quota"] },
    weeklySonnet: { label: "Sonnet", keys: ["seven_day_sonnet", "7d_sonnet_quota"] }
};

@action({ UUID: "com.len.limits.progress" })
export class ProgressBars extends BaseMonitoringAction<ClaudeSettings> {
    protected readonly providerName = ProviderName.Claude;
    protected readonly themeName: ServiceTheme = "claude";

    protected getDisplayData(ev: any, result: StandardUsageResult) {
        const settings = (ev?.payload?.settings ?? {}) as ClaudeSettings;
        const layout: TileLayout = settings.layout ?? "bars";

        if (layout === "ring") {
            return this.tileDisplay([this.metricSlot(settings.metric ?? "session", result)], layout);
        }

        return this.tileDisplay([
            this.metricSlot(settings.topMetric ?? "session", result),
            this.metricSlot(settings.bottomMetric ?? "weekly", result)
        ], layout);
    }

    private metricSlot(metric: ClaudeMetric, result: StandardUsageResult): Slot {
        const definition = METRICS[metric] ?? METRICS.session;
        const bucket = definition.keys.map((key) => result.perModel?.[key]).find(Boolean);

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
