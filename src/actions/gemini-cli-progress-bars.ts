import streamDeck, { action } from "@elgato/streamdeck";
import { ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { GeminiSettings } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";

@action({ UUID: "com.len.limits.gemini-cli" })
export class GeminiCliProgressBars extends BaseMonitoringAction<GeminiSettings> {
    protected readonly providerName = ProviderName.Gemini;
    protected readonly themeName: ServiceTheme = "gemini-cli";
    private topModel: string = "";
    private bottomModel: string = "";

    override async onWillAppear(ev: any): Promise<void> {
        const settings = ev.payload?.settings as GeminiSettings | undefined;
        if (settings) {
            this.topModel = settings.topModel || "";
            this.bottomModel = settings.bottomModel || "";
        }
        await super.onWillAppear(ev);
    }

    override async onDidReceiveSettings(ev: any): Promise<void> {
        const settings = ev.payload?.settings as GeminiSettings | undefined;
        if (settings) {
            this.topModel = settings.topModel || "";
            this.bottomModel = settings.bottomModel || "";
        }
        await this.redraw(ev);
    }

    override async refresh(ev: any): Promise<void> {
        await super.refresh(ev);
        await this.persistModelsToSettings(ev);
    }

    override async onSendToPlugin(ev: any): Promise<void> {
        if (ev.payload?.event === "getModels") {
            if (!this.lastResult) {
                try {
                    this.lastResult = await this.fetchProviderUsage(ev);
                } catch {}
            }
            const models = this.getAvailableModels();
            try {
                await ev.action.sendToPropertyInspector({
                    event: "modelList",
                    models
                });
            } catch {}
        }
    }

    private getAvailableModels(): string[] {
        if (!this.lastResult || !this.lastResult.perModel) return [];
        return Object.keys(this.lastResult.perModel);
    }

    private async persistModelsToSettings(ev: any): Promise<void> {
        const models = this.getAvailableModels();
        try {
            const currentSettings = (ev.payload?.settings ?? {}) as GeminiSettings;
            if (JSON.stringify(currentSettings.availableModels) !== JSON.stringify(models)) {
                await ev.action.setSettings({
                    ...currentSettings,
                    topModel: this.topModel,
                    bottomModel: this.bottomModel,
                    availableModels: models
                });
            }
        } catch {}
    }

    private getModelData(modelKey: string, result: StandardUsageResult): { usage: number; resetTime: string | null; label: string } {
        if (!modelKey || modelKey === "__overall__") {
            return {
                usage: result.overallUsagePercent ?? 0,
                resetTime: result.overallResetTime,
                label: "Overall"
            };
        }

        const model = result.perModel?.[modelKey];
        if (model) {
            const shortName = modelKey.replace(/^models\//, "").replace(/^gemini-/, "");
            return {
                usage: model.usagePercent,
                resetTime: model.resetTime ?? null,
                label: shortName
            };
        }

        return {
            usage: result.overallUsagePercent ?? 0,
            resetTime: result.overallResetTime,
            label: "Overall"
        };
    }

    protected getDisplayData(ev: any, result: StandardUsageResult) {
        const top = this.getModelData(this.topModel, result);
        const bottom = this.getModelData(this.bottomModel, result);
        return {
            value1: top.usage,
            value2: bottom.usage,
            label1: top.label,
            label2: bottom.label,
            resetTime1: top.resetTime,
            resetTime2: bottom.resetTime
        };
    }
}
