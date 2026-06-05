import streamDeck, { action } from "@elgato/streamdeck";
import { ProviderName, StandardUsageResult, AntigravityProvider } from "@lenadweb/ai-limits";
import { AntigravitySettings } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";

@action({ UUID: "com.len.limits.antigravity" })
export class AntigravityProgressBars extends BaseMonitoringAction<AntigravitySettings> {
    protected readonly providerName = ProviderName.Antigravity;
    protected readonly themeName: ServiceTheme = "antigravity";
    private topModel: string = "";
    private bottomModel: string = "";
    private cachedLabels: Record<string, string> = {};
    private provider!: AntigravityProvider;

    override async onWillAppear(ev: any): Promise<void> {
        this.provider = this.limitsManager.getAntigravityProvider();
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
        await this.redraw(ev);
    }

    override async refresh(ev: any): Promise<void> {
        await super.refresh(ev);
        if (this.lastResult && !this.lastResult.error) {
            await this.persistModelsToSettings(ev);
        }
    }

    override async onSendToPlugin(ev: any): Promise<void> {
        const eventType = ev.payload?.event;

        if (eventType === "getStatus") {
            await this.sendStatusToPI(ev);
            return;
        }

        if (eventType === "login") {
            try {
                const email = await this.provider.login();
                await this.sendStatusToPI(ev);
                await this.refresh(ev);
            } catch (err: any) {
                await streamDeck.ui.sendToPropertyInspector({
                    event: "loginError",
                    message: err?.message || String(err)
                });
            }
            return;
        }

        if (eventType === "logout") {
            await this.provider.logout();
            this.lastResult = null;
            await this.sendStatusToPI(ev);
            await this.drawPlaceholder(ev);
            return;
        }

        if (eventType === "getModels") {
            if (!this.lastResult) {
                try {
                    await this.refresh(ev);
                } catch {}
            }
            await this.sendModelsToPI(ev);
            return;
        }
    }

    private async sendStatusToPI(ev: any): Promise<void> {
        const loggedIn = await this.provider.isLoggedIn();
        await streamDeck.ui.sendToPropertyInspector({
            event: "status",
            loggedIn,
            email: this.provider.getLoggedInEmail()
        });
    }

    private async sendModelsToPI(ev: any): Promise<void> {
        const models = this.getAvailableModels();
        const labels = this.getModelLabels();
        await streamDeck.ui.sendToPropertyInspector({
            event: "modelList",
            models,
            labels
        });
    }

    private getAvailableModels(): string[] {
        if (!this.lastResult || !this.lastResult.perModel) return [];
        return Object.keys(this.lastResult.perModel);
    }

    private getModelLabels(): Record<string, string> {
        const labels: Record<string, string> = {};
        if (!this.lastResult || !this.lastResult.perModel) return labels;
        for (const [id, info] of Object.entries(this.lastResult.perModel)) {
            labels[id] = info.displayName || id;
        }
        return labels;
    }

    private async persistModelsToSettings(ev: any): Promise<void> {
        const models = this.getAvailableModels();
        const labels = this.getModelLabels();
        const mergedLabels = { ...this.cachedLabels, ...labels };
        this.cachedLabels = mergedLabels;

        try {
            const currentSettings = (ev.payload?.settings ?? {}) as AntigravitySettings;
            if (
                JSON.stringify(currentSettings.availableModels) !== JSON.stringify(models) ||
                JSON.stringify(currentSettings.availableModelLabels) !== JSON.stringify(mergedLabels)
            ) {
                await ev.action.setSettings({
                    ...currentSettings,
                    topModel: this.topModel,
                    bottomModel: this.bottomModel,
                    availableModels: models,
                    availableModelLabels: mergedLabels,
                    loggedInEmail: this.provider.getLoggedInEmail() || undefined
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
            return {
                usage: model.usagePercent,
                resetTime: model.resetTime ?? null,
                label: this.shortLabel(model.displayName || modelKey)
            };
        }

        const fallbackLabel = this.cachedLabels[modelKey] || modelKey;
        return {
            usage: 100,
            resetTime: null,
            label: this.shortLabel(fallbackLabel)
        };
    }

    private shortLabel(name: string): string {
        const readable = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
        return readable.length > 18 ? `${readable.slice(0, 16)}..` : readable;
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
