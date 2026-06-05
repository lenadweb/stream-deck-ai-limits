import { action } from "@elgato/streamdeck";
import { ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { ProgressBarSettings } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";

@action({ UUID: "com.len.limits.codex.progress" })
export class CodexProgressBars extends BaseMonitoringAction<ProgressBarSettings> {
    protected readonly providerName = ProviderName.ChatGpt;
    protected readonly themeName: ServiceTheme = "codex";

    protected getDisplayData(ev: any, result: StandardUsageResult) {
        const primary = result.perModel?.["primary_window"];
        const secondary = result.perModel?.["secondary_window"];
        return {
            value1: primary ? primary.usagePercent : 0,
            value2: secondary ? secondary.usagePercent : 0,
            label1: "Session",
            label2: "Week",
            resetTime1: primary?.resetTime,
            resetTime2: secondary?.resetTime
        };
    }
}
