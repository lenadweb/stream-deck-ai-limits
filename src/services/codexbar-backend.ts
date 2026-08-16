import type {
    CodexBarMetricOption,
    CodexBarNamedRateWindow,
    CodexBarProviderOption,
    CodexBarProviderPayload,
    CodexBarRateWindow,
    CodexBarResult,
    CodexBarUsageSnapshot
} from "../interfaces/codexbar";

const DEFAULT_PORT = 8080;
/** Matches CodexBar's default total request deadline, including a cold refresh. */
const REQUEST_TIMEOUT_MS = 35_000;

export function codexBarPort(value: unknown): number {
    const port = typeof value === "number" ? value : Number(value);
    return Number.isInteger(port) && port >= 1024 && port <= 65_535 ? port : DEFAULT_PORT;
}

export function providerTitle(providerId: string): string {
    return providerId
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function metricsForUsage(usage: CodexBarUsageSnapshot | null | undefined): CodexBarMetricOption[] {
    const metrics: CodexBarMetricOption[] = [];
    const add = (id: string, fallback: string, window: CodexBarRateWindow | null | undefined) => {
        if (!window || window.isSyntheticPlaceholder) return;
        metrics.push({ id, label: genericWindowLabel(window, fallback) });
    };

    add("primary", "Primary", usage?.primary);
    add("secondary", "Secondary", usage?.secondary);
    add("tertiary", "Tertiary", usage?.tertiary);
    for (const extra of usage?.extraRateWindows ?? []) {
        if (!extra?.id || !extra.window || extra.usageKnown === false) continue;
        metrics.push({ id: `extra:${extra.id}`, label: extra.title || extra.id });
    }
    return metrics;
}

export function windowForMetric(
    usage: CodexBarUsageSnapshot | null | undefined,
    metricId: string | undefined
): { label: string; window: CodexBarRateWindow } | null {
    const metrics = metricsForUsage(usage);
    const selected = metrics.find((metric) => metric.id === metricId) ?? metrics[0];
    if (!selected) return null;

    if (selected.id === "primary") return usage?.primary ? { label: selected.label, window: usage.primary } : null;
    if (selected.id === "secondary") return usage?.secondary ? { label: selected.label, window: usage.secondary } : null;
    if (selected.id === "tertiary") return usage?.tertiary ? { label: selected.label, window: usage.tertiary } : null;

    const extraId = selected.id.slice("extra:".length);
    const extra = (usage?.extraRateWindows ?? []).find((item: CodexBarNamedRateWindow) => item.id === extraId);
    return extra ? { label: selected.label, window: extra.window } : null;
}

function genericWindowLabel(window: CodexBarRateWindow, fallback: string): string {
    const minutes = window.windowMinutes;
    if (minutes == null || minutes <= 0) return fallback;
    if (minutes >= 28 * 24 * 60) return "Month";
    if (minutes >= 7 * 24 * 60) return "Week";
    if (minutes >= 24 * 60) return minutes === 24 * 60 ? "Day" : `${Math.round(minutes / (24 * 60))}d`;
    if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
    return `${minutes}m`;
}

export class CodexBarBackend {
    private static instance: CodexBarBackend | undefined;

    static getInstance(): CodexBarBackend {
        return this.instance ??= new CodexBarBackend();
    }

    async fetchProviderUsage(providerId: string, account: string | undefined, port: unknown): Promise<CodexBarResult> {
        const id = providerId.trim();
        if (!id) return { error: { message: "Choose a CodexBar provider" } };

        // A full serve snapshot is cached by CodexBar. A provider-filtered request uses
        // a distinct cache key and can trigger a slow cold refresh, so select locally.
        const payloads = await this.requestUsage(codexBarPort(port));
        if (!Array.isArray(payloads)) return payloads;

        const matches = payloads.filter((payload) => payload.provider === id);
        const payload = account
            ? matches.find((item) => (item.account ?? "") === account)
            : matches.find((item) => item.usage) ?? matches[0];
        if (!payload) return { error: { message: `CodexBar has no data for ${id}` } };
        if (payload.error?.message) return { payload, error: { message: payload.error.message } };
        return { payload, error: null };
    }

    async listProviders(port: unknown): Promise<CodexBarProviderOption[] | { error: { message: string } }> {
        const payloads = await this.requestUsage(codexBarPort(port));
        if (!Array.isArray(payloads)) return payloads;

        return payloads
            .filter((payload) => Boolean(payload.provider))
            .map((payload) => ({
                provider: payload.provider,
                account: payload.account ?? "",
                label: payload.account ? `${providerTitle(payload.provider)} — ${payload.account}` : providerTitle(payload.provider),
                metrics: metricsForUsage(payload.usage)
            }))
            .sort((left, right) => left.label.localeCompare(right.label));
    }

    private async requestUsage(port: number, providerId?: string): Promise<CodexBarProviderPayload[] | { error: { message: string } }> {
        const url = new URL(`http://127.0.0.1:${port}/usage`);
        if (providerId) url.searchParams.set("provider", providerId);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, { signal: controller.signal });
            const text = await response.text();
            if (!response.ok) return { error: { message: `CodexBar serve returned HTTP ${response.status}` } };
            const parsed = JSON.parse(text) as unknown;
            if (!Array.isArray(parsed)) return { error: { message: "CodexBar returned an unexpected response" } };
            return parsed as CodexBarProviderPayload[];
        } catch (error) {
            const reason = error instanceof Error && error.name === "AbortError"
                ? "Timed out waiting for codexbar serve"
                : "Can't reach codexbar serve on 127.0.0.1";
            return { error: { message: reason } };
        } finally {
            clearTimeout(timer);
        }
    }
}
