import { action } from "@elgato/streamdeck";
import { ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { GeminiSettings, TileLayout } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";
import { Slot } from "../ui/progress-bar-renderer";
import { formatTimeUntil } from "../utils/time-formatter";

@action({ UUID: "com.len.limits.gemini-cli" })
export class GeminiCliProgressBars extends BaseMonitoringAction<GeminiSettings> {
    protected readonly providerName = ProviderName.Gemini;
    protected readonly themeName: ServiceTheme = "gemini-cli";

    override async refresh(ev: any): Promise<void> {
        await super.refresh(ev);
        if (this.lastResult && !this.lastResult.error) {
            await this.persistModelsToSettings();
        }
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

    /**
     * Cache the model list in every tile's settings so each picker works offline.
     * Writing to the refreshing tile alone would leave the other tiles of this
     * action without a list.
     */
    private async persistModelsToSettings(): Promise<void> {
        const models = this.getAvailableModels();
        for (const instance of [...this.instances.values()]) {
            const settings = (instance.settings ?? {}) as GeminiSettings;
            if (JSON.stringify(settings.availableModels) === JSON.stringify(models)) continue;
            try {
                await instance.action.setSettings({ ...settings, availableModels: models });
            } catch {}
        }
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
                usage: model.usagePercent ?? 0,
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
        const settings = (ev?.payload?.settings ?? {}) as GeminiSettings;
        const layout: TileLayout = settings.layout ?? "bars";

        if (layout === "ring") {
            return this.tileDisplay([this.modelSlot(settings.model ?? "", result)], layout);
        }

        return this.tileDisplay([
            this.modelSlot(settings.topModel ?? "", result),
            this.modelSlot(settings.bottomModel ?? "", result)
        ], layout);
    }

    private modelSlot(modelKey: string, result: StandardUsageResult): Slot {
        const data = this.getModelData(modelKey, result);
        return {
            kind: "gauge",
            label: data.label,
            percent: data.usage,
            caption: data.resetTime ? formatTimeUntil(data.resetTime) : undefined
        };
    }
}
