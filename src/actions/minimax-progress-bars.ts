import { action } from "@elgato/streamdeck";
import { LimitsClient, ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { MiniMaxSettings } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";

@action({ UUID: "com.len.limits.minimax" })
export class MiniMaxProgressBars extends BaseMonitoringAction<MiniMaxSettings> {
    protected readonly providerName = ProviderName.MiniMax;
    protected readonly themeName: ServiceTheme = "minimax";
    private settings: MiniMaxSettings = {};

    override async onWillAppear(ev: any): Promise<void> {
        this.settings = (ev.payload?.settings ?? {}) as MiniMaxSettings;
        await super.onWillAppear(ev);
    }

    override async onDidReceiveSettings(ev: any): Promise<void> {
        this.settings = (ev.payload?.settings ?? {}) as MiniMaxSettings;
        await this.refresh(ev);
    }

    protected override async fetchProviderUsage(ev: any): Promise<StandardUsageResult> {
        const apiKey = this.settings.apiKey?.trim() || "";
        if (!apiKey) {
            return {
                provider: this.providerName,
                overallUsagePercent: null,
                overallResetTime: null,
                error: { code: "AUTH", message: "Auth Required" }
            };
        }
        const client = new LimitsClient({ minimax: { apiKey } });
        return client.fetchUsage(this.providerName);
    }

    protected getDisplayData(ev: any, result: StandardUsageResult) {
        const general = result.perModel?.["general"];
        const weekly = result.perModel?.["weekly_interval"];
        return {
            value1: general ? general.usagePercent : 0,
            value2: weekly ? weekly.usagePercent : 0,
            label1: "Daily",
            label2: "Week",
            resetTime1: general?.resetTime,
            resetTime2: weekly?.resetTime
        };
    }
}
