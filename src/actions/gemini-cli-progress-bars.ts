import streamDeck, { action } from "@elgato/streamdeck";
import { GeminiSettings } from "../interfaces/settings";
import { GeminiCliUsageService, type GeminiQuotaResult } from "../services/gemini-cli-usage-service";
import { ProgressBarRenderer } from "../ui/progress-bar-renderer";
import { BaseMonitoringAction } from "./base-monitoring-action";

@action({ UUID: "com.len.limits.gemini-cli" })
export class GeminiCliProgressBars extends BaseMonitoringAction<GeminiSettings> {
    private readonly usageService = GeminiCliUsageService.getInstance();
    private readonly renderer = new ProgressBarRenderer();
    private lastQuota: GeminiQuotaResult | null = null;
    private topModel: string = "";
    private bottomModel: string = "";

    override async onWillAppear(ev: any): Promise<void> {
        const settings = ev.payload?.settings as GeminiSettings | undefined;
        if (settings) {
            this.topModel = settings.topModel || "";
            this.bottomModel = settings.bottomModel || "";
            streamDeck.logger.info(`[Gemini] Settings loaded — top: "${this.topModel}", bottom: "${this.bottomModel}"`);
        }
        await super.onWillAppear(ev);
    }

    override async onDidReceiveSettings(ev: any): Promise<void> {
        const settings = ev.payload?.settings as GeminiSettings | undefined;
        if (settings) {
            this.topModel = settings.topModel || "";
            this.bottomModel = settings.bottomModel || "";
            streamDeck.logger.info(`[Gemini] Settings updated — top: "${this.topModel}", bottom: "${this.bottomModel}"`);
        }
        if (this.lastQuota) {
            await this.draw(ev, this.lastQuota);
        }
    }

    protected async refresh(ev: any): Promise<void> {
        try {
            streamDeck.logger.info("[Gemini] Refreshing quota...");
            const quota = await this.usageService.getQuota();
            this.lastQuota = quota;

            // Persist available models into settings so the PI can read them
            await this.persistModelsToSettings(ev);

            this.draw(ev, quota);
        } catch (err) {
            streamDeck.logger.error(`[Gemini] Refresh failed: ${err}`);
        }
    }

    protected async redraw(ev: any): Promise<void> {
        if (this.lastQuota !== null) {
            await this.draw(ev, this.lastQuota);
        }
    }

    private async persistModelsToSettings(ev: any) {
        const models = this.usageService.getAvailableModels();
        try {
            const currentSettings = (ev.payload?.settings ?? {}) as GeminiSettings;
            const existingModels = currentSettings.availableModels;

            // Only update if models changed
            if (JSON.stringify(existingModels) !== JSON.stringify(models)) {
                await ev.action.setSettings({
                    ...currentSettings,
                    topModel: this.topModel,
                    bottomModel: this.bottomModel,
                    availableModels: models,
                });
                streamDeck.logger.info(`[Gemini] Persisted ${models.length} models to settings: [${models.join(", ")}]`);
            }
        } catch (err) {
            streamDeck.logger.error(`[Gemini] Failed to persist models to settings: ${err}`);
        }
    }

    override async onSendToPlugin(ev: any): Promise<void> {
        if (ev.payload?.event === "getModels") {
            streamDeck.logger.info("[Gemini] PI requested model list");
            if (!this.lastQuota) {
                try {
                    const quota = await this.usageService.getQuota();
                    this.lastQuota = quota;
                } catch (err) {
                    streamDeck.logger.error(`[Gemini] Failed to fetch models for PI: ${err}`);
                }
            }
            const models = this.usageService.getAvailableModels();
            try {
                await ev.action.sendToPropertyInspector({
                    event: "modelList",
                    models,
                });
                streamDeck.logger.info(`[Gemini] Sent ${models.length} models to PI via sendToPropertyInspector`);
            } catch (err) {
                streamDeck.logger.warn(`[Gemini] sendToPropertyInspector failed: ${err}`);
            }
        }
    }

    private getModelData(modelKey: string, quota: GeminiQuotaResult): { usage: number; resetTime: string | null; label: string } {
        if (!modelKey || modelKey === "__overall__") {
            return {
                usage: quota.overallUsage,
                resetTime: quota.overallResetTime,
                label: "Overall",
            };
        }

        const modelData = quota.perModel.get(modelKey);
        if (modelData) {
            const shortName = modelKey.replace(/^models\//, "").replace(/^gemini-/, "");
            return {
                usage: modelData.usage,
                resetTime: modelData.resetTime ?? null,
                label: shortName,
            };
        }

        streamDeck.logger.warn(`[Gemini] Selected model "${modelKey}" not found in quota, falling back to overall`);
        return {
            usage: quota.overallUsage,
            resetTime: quota.overallResetTime,
            label: "Overall",
        };
    }

    private async draw(ev: any, quota: GeminiQuotaResult) {
        const top = this.getModelData(this.topModel, quota);
        const bottom = this.getModelData(this.bottomModel, quota);

        streamDeck.logger.info(`[Gemini] Drawing — top: ${top.label} ${top.usage}%, bottom: ${bottom.label} ${bottom.usage}%`);

        const svg = this.renderer.render(
            top.usage,
            bottom.usage,
            'gemini-cli',
            top.resetTime,
            bottom.resetTime,
            top.label, bottom.label,
            144, 144
        );
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        await ev.action.setImage(image);

        const dialSvg = this.renderer.render(
            top.usage,
            bottom.usage,
            'gemini-cli',
            top.resetTime,
            bottom.resetTime,
            top.label, bottom.label,
            200, 100
        );
        await this.updateDialFeedback(ev, dialSvg);
    }
}
