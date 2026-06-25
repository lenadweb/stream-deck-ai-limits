import { action } from "@elgato/streamdeck";
import { ProviderName } from "@lenadweb/ai-limits";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";
import type { CodexBarGenericSettings, CodexBarResult } from "../interfaces/codexbar";
import { CodexBarBackend, normalizeCodexBarDisplay } from "../services/codexbar-backend";
import { themeFor } from "../services/codexbar-provider-registry";
import type { RenderOptions, Slot } from "../ui/progress-bar-renderer";

@action({ UUID: "com.len.limits.codexbar.generic" })
export class CodexBarGenericProgress extends BaseMonitoringAction<CodexBarGenericSettings, CodexBarResult> {
    private settings: CodexBarGenericSettings = {};
    private providerId: string = "cursor";

    override async onWillAppear(ev: any): Promise<void> {
        this.applySettings(ev);
        await super.onWillAppear(ev);
    }

    override async onDidReceiveSettings(ev: any): Promise<void> {
        this.applySettings(ev);
        await this.refresh(ev);
    }

    private applySettings(ev: any): void {
        this.settings = (ev.payload?.settings ?? {}) as CodexBarGenericSettings;
        this.providerId = (this.settings.providerId ?? "cursor").trim() || "cursor";
    }

    protected get providerName(): ProviderName {
        // CodexBar exposes 50+ providers whose IDs are not members of the
        // ai-limits ProviderName enum. This action never routes through
        // LimitsClient.fetchUsage (it overrides fetchProviderUsage), so the
        // value is only used for logging — cast to satisfy the abstract base.
        return this.providerId as ProviderName;
    }

    protected get themeName(): ServiceTheme {
        return themeFor(this.providerId);
    }

    protected override async fetchProviderUsage(): Promise<CodexBarResult> {
        const backend = CodexBarBackend.getInstance();
        return backend.fetchUsage(this.providerId, this.settings.port ?? 8080);
    }

    protected getDisplayData(_ev: any, result: CodexBarResult): {
        value1: number; value2: number; label1: string; label2: string;
        resetTime1: string | null; resetTime2: string | null;
        valueText1?: string; valueText2?: string; slots?: Slot[];
    } {
        const win = this.settings.window === "secondary" ? "secondary" : "primary";
        return normalizeCodexBarDisplay(result.usage ?? null, win);
    }

    protected override renderOptions(_ev: any): RenderOptions {
        return { showName: this.settings.showProviderName !== false };
    }
}
