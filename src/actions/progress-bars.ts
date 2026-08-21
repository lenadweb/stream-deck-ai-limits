import streamDeck, { action } from "@elgato/streamdeck";
import { ClaudeProvider, ModelUsage, ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { ClaudeMetric, ClaudeSettings, TileLayout } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";
import { SONNET_MODEL, mapClaudeUsage, scopedKey, scopedNames, scopeName } from "../services/claude-limits";
import { Slot } from "../ui/progress-bar-renderer";
import { formatTimeUntil } from "../utils/time-formatter";

/** Bucket keys vary per Claude plan/API version, so each metric accepts several. */
const METRICS: Record<string, { label: string; keys: string[] }> = {
    session: { label: "Session", keys: ["five_hour", "5h_quota"] },
    weekly: { label: "Week", keys: ["seven_day", "7d_quota"] },
    // Newer accounts report Sonnet as a scoped limit, which keeps this option working.
    weeklySonnet: { label: SONNET_MODEL, keys: ["seven_day_sonnet", "7d_sonnet_quota", scopedKey(SONNET_MODEL)] }
};

/** Models a fixed metric already covers, so the picker never lists them twice. */
const BUILT_IN_SCOPES = [SONNET_MODEL];

@action({ UUID: "com.len.limits.progress" })
export class ProgressBars extends BaseMonitoringAction<ClaudeSettings> {
    protected readonly providerName = ProviderName.Claude;
    protected readonly themeName: ServiceTheme = "claude";

    /**
     * Anthropic reports model-scoped weekly limits in a `limits` array that
     * @lenadweb/ai-limits does not map yet, so read the raw response and fall back
     * to the library whenever its shape is not the one we expect.
     */
    protected override async fetchProviderUsage(ev: any): Promise<StandardUsageResult> {
        try {
            const provider = this.limitsManager.getClient().getProvider<ClaudeProvider>(ProviderName.Claude);
            const mapped = mapClaudeUsage(await provider.fetchRawUsage());
            if (mapped) return mapped;
            streamDeck.logger.debug("[claude] Raw usage held no limits array, using the library mapping");
        } catch (err: any) {
            streamDeck.logger.warn(`[claude] Raw usage unavailable, using the library mapping: ${err?.message ?? err}`);
        }
        return super.fetchProviderUsage(ev);
    }

    protected override async refresh(ev: any): Promise<void> {
        await super.refresh(ev);
        await this.persistScopesToSettings();
    }

    override async onSendToPlugin(ev: any): Promise<void> {
        if (ev.payload?.event !== "getScopes") return;

        if (!this.lastResult) {
            try {
                this.lastResult = await this.fetchProviderUsage(ev);
            } catch {}
        }
        try {
            await ev.action.sendToPropertyInspector({ event: "scopeList", scopes: this.scopes() });
        } catch {}
    }

    private scopes(): string[] {
        return scopedNames(this.lastResult).filter((model) => !BUILT_IN_SCOPES.includes(model));
    }

    /**
     * Cache the scoped limits in every tile's settings so each picker also works
     * before the first fetch. Writing to the refreshing tile alone would leave the
     * other tiles of this action without a list.
     */
    private async persistScopesToSettings(): Promise<void> {
        const scopes = this.scopes();
        for (const instance of [...this.instances.values()]) {
            const settings = (instance.settings ?? {}) as ClaudeSettings;
            if (JSON.stringify(settings.availableScopes) === JSON.stringify(scopes)) continue;
            try {
                await instance.action.setSettings({ ...settings, availableScopes: scopes });
            } catch {}
        }
    }

    protected getDisplayData(ev: any, result: StandardUsageResult) {
        const settings = (ev?.payload?.settings ?? {}) as ClaudeSettings;
        const layout: TileLayout = settings.layout ?? "bars";

        if (layout === "ring") {
            return this.tileDisplay([this.metricSlot(settings.metric ?? "session", result)], layout);
        }

        return this.tileDisplay([
            this.metricSlot(settings.topMetric ?? "session", result),
            this.metricSlot(settings.bottomMetric ?? "weekly", result)
        ], layout);
    }

    private metricSlot(metric: ClaudeMetric, result: StandardUsageResult): Slot {
        const model = scopeName(metric);
        if (model) return this.slot(model, result.perModel?.[metric]);

        const preset = METRICS[metric] ?? METRICS.session;
        return this.slot(preset.label, preset.keys.map((key) => result.perModel?.[key]).find(Boolean));
    }

    private slot(label: string, bucket: ModelUsage | undefined): Slot {
        if (!bucket) {
            return { kind: "stat", label, valueText: "—", caption: "no data", muted: true };
        }

        return {
            kind: "gauge",
            label,
            percent: bucket.usagePercent ?? 0,
            caption: bucket.resetTime ? formatTimeUntil(bucket.resetTime) : undefined
        };
    }
}
