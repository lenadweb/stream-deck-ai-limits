import { action } from "@elgato/streamdeck";
import { ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { ProgressBarSettings } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";

@action({ UUID: "com.len.limits.progress" })
export class ProgressBars extends BaseMonitoringAction<ProgressBarSettings> {
    protected readonly providerName = ProviderName.Claude;
    protected readonly themeName: ServiceTheme = "claude";

    protected getDisplayData(ev: any, result: StandardUsageResult) {
        const fiveHour = result.perModel?.["five_hour"] || result.perModel?.["5h_quota"];
        const sevenDay = result.perModel?.["seven_day"] || result.perModel?.["seven_day_sonnet"] || result.perModel?.["7d_quota"] || result.perModel?.["7d_sonnet_quota"];
        return {
            value1: fiveHour?.usagePercent ?? 0,
            value2: sevenDay?.usagePercent ?? 0,
            label1: "Session",
            label2: "Week",
            resetTime1: fiveHour?.resetTime,
            resetTime2: sevenDay?.resetTime
        };
    }
}
