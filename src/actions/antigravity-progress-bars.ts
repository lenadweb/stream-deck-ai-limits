import streamDeck, { action } from "@elgato/streamdeck";
import { ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { AntigravitySettings, TileLayout } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";
import { Slot } from "../ui/progress-bar-renderer";
import { formatTimeUntil } from "../utils/time-formatter";

@action({ UUID: "com.len.limits.antigravity" })
export class AntigravityProgressBars extends BaseMonitoringAction<AntigravitySettings> {
    protected readonly providerName = ProviderName.Antigravity;
    protected readonly themeName: ServiceTheme = "antigravity";
    private pendingUsage: Promise<StandardUsageResult> | null = null;

    override async onWillAppear(ev: any): Promise<void> {
        await super.onWillAppear(ev);
        // A tile on another page may still have settings from the old provider.
        if (this.lastResult && !this.lastResult.error) {
            await this.persistQuotasToSettings();
        }
    }

    protected override async fetchProviderUsage(ev: any): Promise<StandardUsageResult> {
        // Several appearing tiles and the inspector can request the same CLI run.
        if (!this.pendingUsage) {
            this.pendingUsage = super.fetchProviderUsage(ev).finally(() => {
                this.pendingUsage = null;
            });
        }
        return this.pendingUsage;
    }

    protected override async refresh(ev: any): Promise<void> {
        await super.refresh(ev);
        if (this.lastResult && !this.lastResult.error) {
            await this.persistQuotasToSettings();
        }
        await this.sendQuotasToPI();
    }

    override async onSendToPlugin(ev: any): Promise<void> {
        if (ev.payload?.event !== "getQuotas") return;
        if (!this.lastResult) {
            await this.refresh(ev);
            return;
        }
        await this.sendQuotasToPI();
    }

    private async sendQuotasToPI(): Promise<void> {
        if (streamDeck.ui.action?.manifestId !== "com.len.limits.antigravity") return;
        await streamDeck.ui.sendToPropertyInspector({
            event: "quotaList",
            quotas: Object.keys(this.lastResult?.perModel ?? {}),
            labels: this.getQuotaLabels(),
            error: this.lastResult?.error ? { ...this.lastResult.error } : null
        });
    }

    private getQuotaLabels(): Record<string, string> {
        const labels: Record<string, string> = {};
        for (const [id, info] of Object.entries(this.lastResult?.perModel ?? {})) {
            const name = info.displayName || id;
            labels[id] = info.windowSeconds === 604800 ? `${name} (7d)` : name;
        }
        return labels;
    }

    /** Keep the existing settings keys so saved profiles retain their selections. */
    private async persistQuotasToSettings(): Promise<void> {
        const result = this.lastResult!;
        const quotas = Object.keys(result.perModel ?? {});
        const labels = this.getQuotaLabels();

        for (const instance of [...this.instances.values()]) {
            const settings = instance.settings;
            const next: AntigravitySettings = {
                ...settings,
                availableModels: quotas,
                // Retain names for unavailable selections so they remain readable.
                availableModelLabels: { ...settings.availableModelLabels, ...labels }
            };
            delete next.loggedInEmail;
            for (const key of ["model", "topModel", "bottomModel"] as const) {
                if (settings[key]) next[key] = this.quotaKey(settings[key], result, settings);
            }
            if (JSON.stringify(settings) === JSON.stringify(next)) continue;
            try {
                await instance.action.setSettings(next);
                instance.settings = next;
            } catch {}
        }
    }

    /** Old model selections now share their family's plan-level weekly pool. */
    private quotaKey(key: string, result: StandardUsageResult, settings: AntigravitySettings): string {
        if (result.perModel?.[key]) return key;
        // A missing quota window is not a legacy model and must stay unavailable.
        if (/weekly|daily|monthly|hour|(?:^|[-_])\d+[hdw](?:$|[-_])/i.test(key)) return key;
        const name = `${key} ${settings.availableModelLabels?.[key] ?? ""}`;
        const pool = /gemini/i.test(name) ? "gemini-weekly"
            : /claude|gpt|sonnet|opus/i.test(name) ? "3p-weekly" : "";
        return result.perModel?.[pool] ? pool : key;
    }

    protected getDisplayData(ev: any, result: StandardUsageResult) {
        const settings = (ev?.payload?.settings ?? {}) as AntigravitySettings;
        const layout: TileLayout = settings.layout ?? "bars";

        if (layout === "ring") {
            return this.tileDisplay([this.quotaSlot(settings.model ?? "", result, settings)], layout);
        }

        return this.tileDisplay([
            this.quotaSlot(settings.topModel ?? "", result, settings),
            this.quotaSlot(settings.bottomModel ?? "", result, settings)
        ], layout);
    }

    private quotaSlot(key: string, result: StandardUsageResult, settings: AntigravitySettings): Slot {
        const overall = !key || key === "__overall__";
        const quotaKey = this.quotaKey(key, result, settings);
        const quota = result.perModel?.[quotaKey];
        const percent = overall ? result.overallUsagePercent : quota?.usagePercent;
        const resetTime = overall ? result.overallResetTime : quota?.resetTime;
        const name = overall ? "Overall"
            : quota?.displayName || settings.availableModelLabels?.[key] || key;
        const label = name.replace(/\s*\([^)]*\)\s*$/, "").trim()
            .replace(/^Gemini Models$/i, "Gemini")
            .replace(/^Claude and GPT models$/i, "Claude / GPT");

        if (percent == null) {
            return { kind: "stat", label, valueText: "—", caption: "no data", muted: true };
        }
        return {
            kind: "gauge",
            label,
            percent,
            caption: resetTime ? formatTimeUntil(resetTime) : undefined
        };
    }
}
