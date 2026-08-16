import streamDeck, { action, type PropertyInspectorDidAppearEvent } from "@elgato/streamdeck";
import { BaseMonitoringAction } from "./base-monitoring-action";
import type { CodexBarResult } from "../interfaces/codexbar";
import { CodexBarSettings, TileLayout } from "../interfaces/settings";
import { ServiceTheme } from "../interfaces/theme";
import { RenderOptions, Slot } from "../ui/progress-bar-renderer";
import { CodexBarBackend, codexBarPort, providerTitle, windowForMetric } from "../services/codexbar-backend";
import { formatTimeUntil } from "../utils/time-formatter";

@action({ UUID: "com.len.limits.codexbar" })
export class CodexBarProgressBars extends BaseMonitoringAction<CodexBarSettings, CodexBarResult> {
    protected readonly providerName = "codexbar";
    protected readonly themeName: ServiceTheme = "codexbar";
    private readonly backend = CodexBarBackend.getInstance();

    protected override fetchKey(settings: CodexBarSettings | undefined): string {
        return JSON.stringify({
            provider: settings?.providerId?.trim() || "",
            account: settings?.account ?? "",
            port: codexBarPort(settings?.port)
        });
    }

    protected override async fetchProviderUsage(ev: any): Promise<CodexBarResult> {
        const settings = (ev?.payload?.settings ?? {}) as CodexBarSettings;
        return this.backend.fetchProviderUsage(settings.providerId?.trim() || "", settings.account, settings.port);
    }

    override async onSendToPlugin(ev: any): Promise<void> {
        if (ev.payload?.event !== "loadProviders") return;
        await this.sendProviders(ev.payload?.port);
    }

    override async onPropertyInspectorDidAppear(ev: PropertyInspectorDidAppearEvent<CodexBarSettings>): Promise<void> {
        const settings = await ev.action.getSettings<CodexBarSettings>();
        await this.sendProviders(settings.port);
    }

    private async sendProviders(port: unknown): Promise<void> {
        streamDeck.logger.info(`[codexbar] Loading configured providers on port ${codexBarPort(port)}`);
        const providers = await this.backend.listProviders(port);
        try {
            const message = Array.isArray(providers)
                ? {
                    event: "providerList",
                    providers: providers.map((provider) => ({
                        provider: provider.provider,
                        account: provider.account,
                        label: provider.label,
                        metrics: provider.metrics.map((metric) => ({ id: metric.id, label: metric.label }))
                    }))
                }
                : { event: "providerListError", message: providers.error.message };
            await streamDeck.ui.sendToPropertyInspector(
                message
            );
            streamDeck.logger.info(
                `[codexbar] Sent ${Array.isArray(providers) ? providers.length : 0} configured provider account(s) to Property Inspector`
            );
        } catch (error) {
            streamDeck.logger.error(`[codexbar] Could not update Property Inspector: ${error}`);
        }
    }

    protected getDisplayData(ev: any, result: CodexBarResult) {
        const settings = (ev?.payload?.settings ?? {}) as CodexBarSettings;
        const layout: TileLayout = settings.layout ?? "bars";
        if (layout === "ring") {
            return this.tileDisplay([this.metricSlot(settings.metric, result)], layout);
        }
        return this.tileDisplay([
            this.metricSlot(settings.topMetric ?? "primary", result),
            this.metricSlot(settings.bottomMetric ?? "secondary", result)
        ], layout);
    }

    protected override renderOptions(ev: any): RenderOptions {
        const settings = (ev?.payload?.settings ?? {}) as CodexBarSettings;
        return {
            showName: settings.showProviderName !== false,
            serviceName: providerTitle(settings.providerId?.trim() || "codexbar")
        };
    }

    private metricSlot(metricId: string | undefined, result: CodexBarResult): Slot {
        const resolved = windowForMetric(result.payload?.usage, metricId);
        if (!resolved) {
            return { kind: "stat", label: "Quota", valueText: "—", caption: "no data", muted: true };
        }

        return {
            kind: "gauge",
            label: resolved.label,
            percent: resolved.window.usedPercent ?? 0,
            caption: resolved.window.resetsAt
                ? formatTimeUntil(resolved.window.resetsAt)
                : resolved.window.resetDescription ?? undefined
        };
    }
}
