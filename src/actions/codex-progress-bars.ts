import { action } from "@elgato/streamdeck";
import { ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { CodexSecondaryMetric, CodexSettings } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";
import { Slot } from "../ui/progress-bar-renderer";
import { formatTimeUntil } from "../utils/time-formatter";

@action({ UUID: "com.len.limits.codex.progress" })
export class CodexProgressBars extends BaseMonitoringAction<CodexSettings> {
    protected readonly providerName = ProviderName.ChatGpt;
    protected readonly themeName: ServiceTheme = "codex";

    protected getDisplayData(ev: any, result: StandardUsageResult) {
        const primary = result.perModel?.["primary_window"];
        const sessionSlot: Slot = {
            kind: "gauge",
            label: "Session",
            percent: primary?.usagePercent ?? 0,
            caption: primary?.resetTime ? formatTimeUntil(primary.resetTime) : undefined
        };
        const metric = (ev?.payload?.settings?.secondaryMetric ?? "resetCredits") as CodexSecondaryMetric;
        const slots: Slot[] = [
            sessionSlot,
            ...(metric === "none" ? [] : [this.secondarySlot(metric, result)])
        ];

        return {
            value1: slots[0].percent ?? 0,
            value2: slots[1]?.percent ?? 0,
            label1: slots[0].label,
            label2: slots[1]?.label ?? "",
            slots
        };
    }

    private secondarySlot(metric: CodexSecondaryMetric | undefined, result: StandardUsageResult): Slot {
        if (metric === "resetCredits") {
            const resets = result.rateLimitResetCredits;
            if (!resets) {
                return { kind: "stat", label: "Usage limit resets", valueText: "None" };
            }

            const { availableCount, applicableAvailableCount } = resets;
            return {
                kind: "stat",
                label: "Usage limit resets",
                valueText: availableCount === applicableAvailableCount
                    ? String(availableCount)
                    : `${applicableAvailableCount}/${availableCount}`,
                caption: availableCount === applicableAvailableCount ? "available" : "applicable / total"
            };
        }

        const credits = result.credits;
        if (!credits) {
            return { kind: "stat", label: "Credits balance", valueText: "—" };
        }
        if (credits.unlimited) {
            return { kind: "stat", label: "Credits balance", valueText: "∞", caption: "unlimited" };
        }
        if (!credits.hasCredits) {
            return { kind: "stat", label: "Credits balance", valueText: "0$" };
        }

        return {
            kind: "stat",
            label: "Credits balance",
            valueText: credits.balance ?? "Available",
            caption: credits.balance == null ? undefined : "available"
        };
    }
}
