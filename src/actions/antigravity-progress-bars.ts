import streamDeck, { action } from "@elgato/streamdeck";
import { AntigravitySettings } from "../interfaces/settings";
import { AntigravityUsageService, type AntigravityQuotaResult } from "../services/antigravity-usage-service";
import { ProgressBarRenderer } from "../ui/progress-bar-renderer";
import { BaseMonitoringAction } from "./base-monitoring-action";

@action({ UUID: "com.len.limits.antigravity" })
export class AntigravityProgressBars extends BaseMonitoringAction<AntigravitySettings> {
    private readonly usageService = AntigravityUsageService.getInstance();
    private readonly renderer = new ProgressBarRenderer();
    private lastQuota: AntigravityQuotaResult | null = null;
    private topModel: string = "";
    private bottomModel: string = "";
    private cachedLabels: Record<string, string> = {};

    override async onWillAppear(ev: any): Promise<void> {
        const settings = ev.payload?.settings as AntigravitySettings | undefined;
        if (settings) {
            this.topModel = settings.topModel || "";
            this.bottomModel = settings.bottomModel || "";
            this.cachedLabels = settings.availableModelLabels || {};
        }
        await super.onWillAppear(ev);
    }

    override async onDidReceiveSettings(ev: any): Promise<void> {
        const settings = ev.payload?.settings as AntigravitySettings | undefined;
        if (settings) {
            this.topModel = settings.topModel || "";
            this.bottomModel = settings.bottomModel || "";
            this.cachedLabels = settings.availableModelLabels || this.cachedLabels;
        }
        if (this.lastQuota) {
            await this.draw(ev, this.lastQuota);
        } else {
            await this.drawPlaceholder(ev);
        }
    }

    protected async refresh(ev: any): Promise<void> {
        try {
            const loggedIn = await this.usageService.isLoggedIn();
            if (!loggedIn) {
                this.lastQuota = null;
                await this.drawPlaceholder(ev);
                return;
            }

            const quota = await this.usageService.getQuota();
            if (!quota) {
                this.lastQuota = null;
                await this.drawPlaceholder(ev);
                return;
            }

            this.lastQuota = quota;
            await this.persistModelsToSettings(ev);
            await this.draw(ev, quota);
        } catch (err) {
            streamDeck.logger.error(`[Antigravity] Refresh failed: ${err}`);
            this.lastQuota = null;
            await this.drawPlaceholder(ev);
        }
    }

    protected async redraw(ev: any): Promise<void> {
        if (this.lastQuota) {
            await this.draw(ev, this.lastQuota);
        } else {
            await this.drawPlaceholder(ev);
        }
    }

    override async onSendToPlugin(ev: any): Promise<void> {
        const evt = ev.payload?.event;

        if (evt === "getStatus") {
            await this.sendStatusToPI(ev);
            return;
        }

        if (evt === "login") {
            try {
                streamDeck.logger.info("[Antigravity] PI requested login");
                const email = await this.usageService.login();
                streamDeck.logger.info(`[Antigravity] Logged in as ${email}`);
                await this.sendStatusToPI(ev);
                await this.refresh(ev);
            } catch (err: any) {
                streamDeck.logger.error(`[Antigravity] Login failed: ${err}`);
                await streamDeck.ui.sendToPropertyInspector({
                    event: "loginError",
                    message: err?.message || String(err),
                });
            }
            return;
        }

        if (evt === "logout") {
            await this.usageService.logout();
            this.lastQuota = null;
            await this.sendStatusToPI(ev);
            await this.drawPlaceholder(ev);
            return;
        }

        if (evt === "getModels") {
            if (!this.lastQuota) {
                try {
                    await this.refresh(ev);
                } catch (err) {
                    streamDeck.logger.error(`[Antigravity] Failed to fetch models for PI: ${err}`);
                }
            }
            await this.sendModelsToPI(ev);
            return;
        }
    }

    private async sendStatusToPI(ev: any): Promise<void> {
        const loggedIn = await this.usageService.isLoggedIn();
        await streamDeck.ui.sendToPropertyInspector({
            event: "status",
            loggedIn,
            email: this.usageService.getLoggedInEmail(),
        });
    }

    private async sendModelsToPI(ev: any): Promise<void> {
        const models = this.usageService.getAvailableModels();
        const labels = this.usageService.getModelLabels();
        await streamDeck.ui.sendToPropertyInspector({
            event: "modelList",
            models,
            labels,
        });
    }

    private async persistModelsToSettings(ev: any): Promise<void> {
        const models = this.usageService.getAvailableModels();
        const labels = this.usageService.getModelLabels();
        // Merge with previously-seen labels so an exhausted model that the API stops
        // returning still has its label preserved across refreshes.
        const mergedLabels = { ...this.cachedLabels, ...labels };
        this.cachedLabels = mergedLabels;

        try {
            const currentSettings = (ev.payload?.settings ?? {}) as AntigravitySettings;
            const existingModels = currentSettings.availableModels;
            const existingLabels = currentSettings.availableModelLabels;

            if (
                JSON.stringify(existingModels) !== JSON.stringify(models) ||
                JSON.stringify(existingLabels) !== JSON.stringify(mergedLabels)
            ) {
                await ev.action.setSettings({
                    ...currentSettings,
                    topModel: this.topModel,
                    bottomModel: this.bottomModel,
                    availableModels: models,
                    availableModelLabels: mergedLabels,
                    loggedInEmail: this.usageService.getLoggedInEmail() ?? undefined,
                });
            }
        } catch (err) {
            streamDeck.logger.error(`[Antigravity] Failed to persist models: ${err}`);
        }
    }

    private getModelData(modelKey: string, quota: AntigravityQuotaResult): { usage: number; resetTime: string | null; label: string } {
        if (!modelKey || modelKey === "__overall__") {
            return {
                usage: quota.overallUsage,
                resetTime: quota.overallResetTime,
                label: "Overall",
            };
        }

        const modelData = quota.perModel.get(modelKey);
        if (modelData) {
            return {
                usage: modelData.usage,
                resetTime: modelData.resetTime ?? null,
                label: this.shortLabel(modelData.displayName || modelKey),
            };
        }

        // The model was selected previously but is missing from the latest API
        // response — Antigravity drops exhausted models. Treat as 100% used.
        const fallbackLabel = this.cachedLabels[modelKey] || modelKey;
        return {
            usage: 100,
            resetTime: null,
            label: this.shortLabel(fallbackLabel),
        };
    }

    private shortLabel(name: string): string {
        // Drop parenthetical qualifiers ("(Thinking)", "(Medium)") for the on-key label
        const readable = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
        // Hard cap: UI should never exceed 18 characters.
        return readable.length > 18 ? `${readable.slice(0, 16)}..` : readable;
    }

    private async drawPlaceholder(ev: any) {
        const svg = this.renderer.renderPlaceholder(144, 144);
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
        await ev.action.setImage(image);

        const dialSvg = this.renderer.renderPlaceholder(200, 100);
        await this.updateDialFeedback(ev, dialSvg);
    }

    private async draw(ev: any, quota: AntigravityQuotaResult) {
        const top = this.getModelData(this.topModel, quota);
        const bottom = this.getModelData(this.bottomModel, quota);

        const svg = this.renderer.render(
            top.usage,
            bottom.usage,
            "antigravity",
            top.resetTime,
            bottom.resetTime,
            top.label,
            bottom.label,
            144, 144
        );
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
        await ev.action.setImage(image);

        const dialSvg = this.renderer.render(
            top.usage,
            bottom.usage,
            "antigravity",
            top.resetTime,
            bottom.resetTime,
            top.label,
            bottom.label,
            200, 100
        );
        await this.updateDialFeedback(ev, dialSvg);
    }
}
