import streamDeck, { action, type PropertyInspectorDidAppearEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { BaseMonitoringAction } from "./base-monitoring-action";
import type { CodexBarResult } from "../interfaces/codexbar";
import { CodexBarSettings, TileLayout } from "../interfaces/settings";
import { ServiceTheme } from "../interfaces/theme";
import { RenderOptions, Slot } from "../ui/progress-bar-renderer";
import { CodexBarBackend, codexBarPort, detailForMetric, providerTitle, windowForMetric } from "../services/codexbar-backend";
import { formatTimeUntil } from "../utils/time-formatter";

interface CodexBarGlobalSettings {
    codexBarPort?: number;
    codexBarAutoStart?: boolean;
    [key: string]: any;
}

interface CodexBarServerConfig {
    port: number;
    autoStart: boolean;
}

@action({ UUID: "com.len.limits.codexbar" })
export class CodexBarProgressBars extends BaseMonitoringAction<CodexBarSettings, CodexBarResult> {
    protected readonly providerName = "codexbar";
    protected readonly themeName: ServiceTheme = "codexbar";
    private readonly backend = CodexBarBackend.getInstance();

    protected override fetchKey(settings: CodexBarSettings | undefined): string {
        return JSON.stringify({
            provider: settings?.providerId?.trim() || "",
            account: settings?.account ?? "",
            port: codexBarPort(settings?.port),
            autoStart: settings?.autoStart === true
        });
    }

    override async onWillAppear(ev: WillAppearEvent<CodexBarSettings>): Promise<void> {
        await this.getServerConfig(ev.payload.settings);
        await super.onWillAppear(ev);
    }

    override async onDidReceiveSettings(ev: any): Promise<void> {
        const settings = (ev?.payload?.settings ?? {}) as CodexBarSettings;
        await this.setServerConfig(settings.port, settings.autoStart === true);
        await super.onDidReceiveSettings(ev);
    }

    protected override async fetchProviderUsage(ev: any): Promise<CodexBarResult> {
        const settings = (ev?.payload?.settings ?? {}) as CodexBarSettings;
        const server = await this.getServerConfig(settings);
        return this.backend.fetchProviderUsage(
            settings.providerId?.trim() || "",
            settings.account,
            server.port,
            server.autoStart
        );
    }

    override async onSendToPlugin(ev: any): Promise<void> {
        switch (ev.payload?.event) {
            case "loadProviders": {
                const server = await this.setServerConfig(ev.payload?.port, ev.payload?.autoStart === true);
                await this.sendProviders(server);
                await this.sendServerStatus(server);
                break;
            }
            case "getServerStatus": {
                const server = await this.getServerConfig();
                await this.sendServerStatus(server);
                break;
            }
            case "startServer": {
                const server = await this.setServerConfig(ev.payload?.port, ev.payload?.autoStart === true);
                await this.startServer(server);
                break;
            }
            case "stopServer": {
                const server = await this.setServerConfig(ev.payload?.port, ev.payload?.autoStart === true);
                await this.stopServer(server);
                break;
            }
        }
    }

    override async onPropertyInspectorDidAppear(ev: PropertyInspectorDidAppearEvent<CodexBarSettings>): Promise<void> {
        const settings = await ev.action.getSettings<CodexBarSettings>();
        const server = await this.getServerConfig(settings);
        await this.sendServerConfig(server);
        await this.sendServerStatus(server);
        await this.sendProviders(server);
        await this.sendServerStatus(server);
    }

    private async sendProviders(server: CodexBarServerConfig): Promise<void> {
        streamDeck.logger.info(`[codexbar] Loading configured providers on port ${server.port}`);
        const providers = await this.backend.listProviders(server.port, server.autoStart);
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

    private async sendServerConfig(server: CodexBarServerConfig): Promise<void> {
        await streamDeck.ui.sendToPropertyInspector({
            event: "serverConfig",
            port: server.port,
            autoStart: server.autoStart
        });
    }

    private async sendServerStatus(server: CodexBarServerConfig): Promise<void> {
        const status = await this.backend.getServerStatus(server.port);
        await streamDeck.ui.sendToPropertyInspector({
            event: "serverStatus",
            state: status.state,
            managed: status.managed,
            pid: status.pid ?? null,
            port: server.port
        });
    }

    private async startServer(server: CodexBarServerConfig): Promise<void> {
        const result = await this.backend.startServer(server.port);
        await this.sendServerResult(server, result);
    }

    private async stopServer(server: CodexBarServerConfig): Promise<void> {
        const result = await this.backend.stopServer(server.port);
        await this.sendServerResult(server, result);
    }

    private async sendServerResult(
        server: CodexBarServerConfig,
        result: Awaited<ReturnType<CodexBarBackend["startServer"]>>
    ): Promise<void> {
        if ("error" in result) {
            await streamDeck.ui.sendToPropertyInspector({ event: "serverStatusError", message: result.error.message });
            return;
        }
        await streamDeck.ui.sendToPropertyInspector({
            event: "serverStatus",
            state: result.state,
            managed: result.managed,
            pid: result.pid ?? null,
            port: server.port
        });
    }

    private async getServerConfig(fallback?: CodexBarSettings): Promise<CodexBarServerConfig> {
        const global = await streamDeck.settings.getGlobalSettings<CodexBarGlobalSettings>();
        const port = codexBarPort(global.codexBarPort ?? fallback?.port);
        const autoStart = global.codexBarAutoStart ?? fallback?.autoStart === true;
        if (global.codexBarPort === undefined || global.codexBarAutoStart === undefined) {
            await streamDeck.settings.setGlobalSettings({
                ...global,
                codexBarPort: port,
                codexBarAutoStart: autoStart
            });
        }
        return { port, autoStart };
    }

    private async setServerConfig(port: unknown, autoStart: boolean): Promise<CodexBarServerConfig> {
        const global = await streamDeck.settings.getGlobalSettings<CodexBarGlobalSettings>();
        const config = { port: codexBarPort(port), autoStart };
        await streamDeck.settings.setGlobalSettings({
            ...global,
            codexBarPort: config.port,
            codexBarAutoStart: config.autoStart
        });
        return config;
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
        const detail = detailForMetric(result.payload?.usage, metricId);
        if (detail) {
            return {
                kind: "stat",
                label: detail.label,
                valueText: detail.valueText,
                caption: detail.caption
            };
        }

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
