import { action } from "@elgato/streamdeck";
import { ModelUsage, ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { CodexMetric, CodexSettings, TileLayout } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";
import { Slot } from "../ui/progress-bar-renderer";
import { formatTimeUntil } from "../utils/time-formatter";

/** A window at least this long counts as a long-term (weekly) limit, not a session. */
const LONG_WINDOW_SECONDS = 24 * 60 * 60;

@action({ UUID: "com.len.limits.codex.progress" })
export class CodexProgressBars extends BaseMonitoringAction<CodexSettings> {
    protected readonly providerName = ProviderName.ChatGpt;
    protected readonly themeName: ServiceTheme = "codex";

    protected getDisplayData(ev: any, result: StandardUsageResult) {
        const config = this.resolveSettings((ev?.payload?.settings ?? {}) as CodexSettings);

        if (config.layout === "ring") {
            return this.tileDisplay([this.metricSlot(config.metric, result)], config.layout);
        }

        return this.tileDisplay([
            this.metricSlot(config.topMetric, result),
            this.metricSlot(config.bottomMetric, result)
        ], config.layout);
    }

    /**
     * Tiles configured before the metric picker existed carry `secondaryMetric`;
     * keep serving that as the bottom slot. The weekly window is the default metric
     * because it is the one every plan still exposes.
     */
    private resolveSettings(settings: CodexSettings): {
        layout: TileLayout;
        metric: CodexMetric;
        topMetric: CodexMetric;
        bottomMetric: CodexMetric;
    } {
        const legacy = settings.secondaryMetric;
        return {
            layout: settings.layout ?? "bars",
            metric: settings.metric ?? "weekly",
            topMetric: settings.topMetric ?? "weekly",
            bottomMetric: settings.bottomMetric ?? legacy ?? "resetCredits"
        };
    }

    private metricSlot(metric: CodexMetric, result: StandardUsageResult): Slot | null {
        if (metric === "none") return null;
        if (metric === "session" || metric === "weekly") return this.windowSlot(metric, result);
        if (metric === "resetCredits") return this.resetCreditsSlot(result);
        return this.creditsSlot(result);
    }

    private windowSlot(metric: "session" | "weekly", result: StandardUsageResult): Slot {
        const bucket = this.windows(result)[metric];
        const label = metric === "session" ? "Session" : "Week";

        if (!bucket) {
            return { kind: "stat", label, valueText: "—", caption: "no data", muted: true };
        }

        return {
            kind: "gauge",
            label: this.windowLabel(bucket, label),
            percent: bucket.usagePercent ?? 0,
            caption: bucket.resetTime ? formatTimeUntil(bucket.resetTime) : undefined
        };
    }

    /**
     * OpenAI dropped the 5-hour window on several plans, and when it does the weekly
     * window arrives as `primary_window` — so classify the buckets by the duration the
     * API reports rather than trusting their slot order (issue #6).
     */
    private windows(result: StandardUsageResult): { session: ModelUsage | undefined; weekly: ModelUsage | undefined } {
        const primary = result.perModel?.["primary_window"];
        const secondary = result.perModel?.["secondary_window"];

        if (primary?.windowSeconds != null && primary.windowSeconds >= LONG_WINDOW_SECONDS) {
            return { session: undefined, weekly: primary };
        }
        return { session: primary, weekly: secondary };
    }

    /** Name a long window after the period the API actually reports, when it reports one. */
    private windowLabel(bucket: ModelUsage, fallback: string): string {
        const seconds = bucket.windowSeconds;
        if (seconds == null || seconds < LONG_WINDOW_SECONDS) return fallback;
        if (seconds >= 28 * LONG_WINDOW_SECONDS) return "Month";
        if (seconds >= 7 * LONG_WINDOW_SECONDS) return "Week";
        return `${Math.round(seconds / LONG_WINDOW_SECONDS)}d`;
    }

    private resetCreditsSlot(result: StandardUsageResult): Slot {
        const resets = result.rateLimitResetCredits;
        if (!resets) {
            return { kind: "stat", label: "Usage limit resets", shortLabel: "Resets", valueText: "None" };
        }

        return {
            kind: "stat",
            label: "Usage limit resets",
            shortLabel: "Resets",
            valueText: String(resets.availableCount)
        };
    }

    private creditsSlot(result: StandardUsageResult): Slot {
        const credits = result.credits;
        const label = { label: "Credits balance", shortLabel: "Credits" } as const;

        if (!credits) {
            return { kind: "stat", ...label, valueText: "—" };
        }
        if (credits.unlimited) {
            return { kind: "stat", ...label, valueText: "∞", caption: "unlimited" };
        }
        if (!credits.hasCredits) {
            return { kind: "stat", ...label, valueText: "0$" };
        }

        return {
            kind: "stat",
            ...label,
            valueText: credits.balance ?? "Available",
            caption: credits.balance == null ? undefined : "available"
        };
    }
}
