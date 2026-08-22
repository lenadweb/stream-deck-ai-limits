import { action } from "@elgato/streamdeck";
import { ModelUsage, ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { ClaudeMetric, ClaudeScope, ClaudeSettings, TileLayout } from "../interfaces/settings";
import { BaseMonitoringAction } from "./base-monitoring-action";
import { ServiceTheme } from "../interfaces/theme";
import { Slot } from "../ui/progress-bar-renderer";
import { formatTimeUntil } from "../utils/time-formatter";

/** Bucket keys vary per Claude plan/API version, so each metric accepts several. */
const METRICS: Record<string, { label: string; keys: string[] }> = {
    session: { label: "Session", keys: ["five_hour", "5h_quota"] },
    weekly: { label: "Week", keys: ["seven_day", "7d_quota"] },
    weeklySonnet: { label: "Sonnet", keys: ["seven_day_sonnet", "7d_sonnet_quota"] }
};

/** The bucket the built-in Sonnet metric already covers, scoped or legacy alike. */
const SONNET_KEY = "7d_sonnet_quota";

@action({ UUID: "com.len.limits.progress" })
export class ProgressBars extends BaseMonitoringAction<ClaudeSettings> {
    protected readonly providerName = ProviderName.Claude;
    protected readonly themeName: ServiceTheme = "claude";

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

    /**
     * The model-scoped weekly limits this account reports. Anthropic names them per
     * account, so the picker is built from whatever the last fetch returned rather
     * than from a fixed list.
     */
    private scopes(): ClaudeScope[] {
        return Object.entries(this.lastResult?.perModel ?? {})
            .filter(([key, bucket]) => bucket.scope && key !== SONNET_KEY)
            .map(([key, bucket]) => ({ key, label: scopeLabel(key, bucket) }));
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
            return this.tileDisplay([this.metricSlot(settings.metric ?? "session", result, settings)], layout);
        }

        return this.tileDisplay([
            this.metricSlot(settings.topMetric ?? "session", result, settings),
            this.metricSlot(settings.bottomMetric ?? "weekly", result, settings)
        ], layout);
    }

    /** A metric is either one of the fixed windows or the bucket key of a scoped limit. */
    private metricSlot(metric: ClaudeMetric, result: StandardUsageResult, settings: ClaudeSettings): Slot {
        const preset = METRICS[metric];
        const bucket = preset
            ? preset.keys.map((key) => result.perModel?.[key]).find(Boolean)
            : result.perModel?.[metric];
        // A scoped limit the account stopped reporting still has a name in the cache.
        const cached = settings.availableScopes?.find((scope) => scope.key === metric)?.label;
        const label = preset?.label ?? (bucket ? scopeLabel(metric, bucket) : cached ?? metric);

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

/** A limit scoped to a surface rather than a model carries no model name. */
function scopeLabel(key: string, bucket: ModelUsage): string {
    return bucket.scope?.model ?? bucket.scope?.surface ?? key;
}
