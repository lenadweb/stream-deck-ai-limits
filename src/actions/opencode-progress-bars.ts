import { action } from "@elgato/streamdeck";
import { LimitsClient, ModelUsage, ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { OpenCodeMetric, OpenCodeSettings, TileLayout } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";
import { Slot } from "../ui/progress-bar-renderer";
import { formatTimeUntil } from "../utils/time-formatter";
import { streamDeckLogger } from "../services/limits-manager";

const METRIC_LABELS: Record<OpenCodeMetric, string> = {
    auto: "Auto",
    rolling: "5-Hour",
    weekly: "Week",
    monthly: "Month",
    budget: "Budget",
    balance: "Balance",
    overall: "Overall"
};

const GO_BUCKETS: Partial<Record<OpenCodeMetric, string>> = {
    rolling: "go_rolling",
    weekly: "go_weekly",
    monthly: "go_monthly"
};

@action({ UUID: "com.len.limits.opencode" })
export class OpenCodeProgressBars extends BaseMonitoringAction<OpenCodeSettings> {
    protected readonly providerName = ProviderName.OpenCode;
    protected readonly themeName: ServiceTheme = "opencode";

    protected override fetchKey(settings: OpenCodeSettings | undefined): string {
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

        const client = new LimitsClient({ opencode: { apiKey }, logger: streamDeckLogger });
        return client.fetchUsage(this.providerName);
    }

    protected getDisplayData(ev: any, result: StandardUsageResult) {
        const settings = (ev?.payload?.settings ?? {}) as OpenCodeSettings;
        const layout: TileLayout = settings.layout ?? "bars";

        if (layout === "ring") {
            return this.tileDisplay([
                this.metricSlot(this.resolveMetric(settings.metric, "ring", result), result)
            ], layout);
        }

        return this.tileDisplay([
            this.metricSlot(this.resolveMetric(settings.topMetric, "top", result), result),
            this.metricSlot(this.resolveMetric(settings.bottomMetric, "bottom", result), result)
        ], layout);
    }

    /**
     * "Auto" picks the useful subscription automatically: Go windows when the
     * key has Go, otherwise the most-used Console budget or the Zen balance.
     */
    private resolveMetric(
        metric: OpenCodeMetric | undefined,
        position: "ring" | "top" | "bottom",
        result: StandardUsageResult
    ): OpenCodeMetric {
        if (metric && metric !== "auto") return metric;

        const hasGo = Boolean(result.perModel?.go_rolling);
        if (hasGo) return position === "bottom" ? "weekly" : "rolling";
        if (position === "bottom") {
            if (result.perModel?.zen_balance) return "balance";
            if (this.hasBudget(result)) return "budget";
        }
        return "overall";
    }

    private hasBudget(result: StandardUsageResult): boolean {
        return Object.keys(result.perModel ?? {}).some((key) => key.startsWith("budget_"));
    }

    private metricSlot(metric: OpenCodeMetric, result: StandardUsageResult): Slot {
        const label = METRIC_LABELS[metric] ?? metric;

        if (metric === "overall") return this.overallSlot(result);
        if (metric === "balance") return this.balanceSlot(result, "Balance");
        if (metric === "budget") return this.budgetSlot(result);

        const bucketKey = GO_BUCKETS[metric];
        const bucket = bucketKey ? result.perModel?.[bucketKey] : undefined;
        return bucket ? this.gauge(label, bucket) : this.missing(label);
    }

    private overallSlot(result: StandardUsageResult): Slot {
        if (result.overallUsagePercent === null) {
            if (result.perModel?.zen_balance) return this.balanceSlot(result, "Overall");
            return this.missing("Overall");
        }

        return {
            kind: "gauge",
            label: "Overall",
            percent: result.overallUsagePercent,
            caption: result.overallResetTime ? formatTimeUntil(result.overallResetTime) : undefined
        };
    }

    private budgetSlot(result: StandardUsageResult): Slot {
        const budgets = Object.entries(result.perModel ?? {})
            .filter(([key, bucket]) => key.startsWith("budget_") && bucket.usagePercent !== null)
            .sort((a, b) => (b[1].usagePercent ?? 0) - (a[1].usagePercent ?? 0));

        if (budgets.length === 0) return this.missing("Budget");

        const [, bucket] = budgets[0];
        return this.gauge(budgetName(bucket), bucket, "Budget");
    }

    private balanceSlot(result: StandardUsageResult, label: string): Slot {
        const bucket = result.perModel?.zen_balance;
        if (!bucket) return this.missing(label);

        const valueText = bucket.displayName?.replace(/^Zen balance:\s*/i, "") || "—";
        return { kind: "stat", label, valueText, caption: "Zen" };
    }

    private gauge(label: string, bucket: ModelUsage, shortLabel?: string): Slot {
        return {
            kind: "gauge",
            label,
            shortLabel,
            percent: bucket.usagePercent ?? 0,
            caption: bucket.resetTime ? formatTimeUntil(bucket.resetTime) : undefined
        };
    }

    private missing(label: string): Slot {
        return { kind: "stat", label, valueText: "—", caption: "no data", muted: true };
    }
}

/** "GPT-6 Astra Budget ($20)" becomes "GPT-6 Astra"; a bare budget stays "Budget". */
function budgetName(bucket: ModelUsage): string {
    const name = bucket.displayName
        ?.replace(/\s*\([^)]*\)\s*$/, "")
        .replace(/\s+Budget$/i, "")
        .trim();
    return name || "Budget";
}
