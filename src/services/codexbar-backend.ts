import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type {
    CodexBarMetricOption,
    CodexBarDetailSection,
    CodexBarError,
    CodexBarNamedRateWindow,
    CodexBarProviderOption,
    CodexBarProviderPayload,
    CodexBarRateWindow,
    CodexBarResult,
    CodexBarServerStatus,
    CodexBarUsageSnapshot
} from "../interfaces/codexbar";

const DEFAULT_PORT = 8080;
/** Matches CodexBar's default total request deadline, including a cold refresh. */
const REQUEST_TIMEOUT_MS = 35_000;
const HEALTH_TIMEOUT_MS = 1_500;
const SERVER_STARTUP_TIMEOUT_MS = 10_000;
const CODEXBAR_BINARIES = [
    "/opt/homebrew/bin/codexbar",
    "/usr/local/bin/codexbar",
    "/Applications/CodexBar.app/Contents/Helpers/CodexBarCLI"
];

type UsageResponse = CodexBarProviderPayload[] | { error: CodexBarError };

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
    return [...quotaMetricsForUsage(usage), ...detailMetricsForUsage(usage)];
}

function quotaMetricsForUsage(usage: CodexBarUsageSnapshot | null | undefined): CodexBarMetricOption[] {
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
    const metrics = quotaMetricsForUsage(usage);
    const selected = metrics.find((metric) => metric.id === metricId) ?? metrics[0];
    if (!selected) return null;

    if (selected.id === "primary") return usage?.primary ? { label: selected.label, window: usage.primary } : null;
    if (selected.id === "secondary") return usage?.secondary ? { label: selected.label, window: usage.secondary } : null;
    if (selected.id === "tertiary") return usage?.tertiary ? { label: selected.label, window: usage.tertiary } : null;

    const extraId = selected.id.slice("extra:".length);
    const extra = (usage?.extraRateWindows ?? []).find((item: CodexBarNamedRateWindow) => item.id === extraId);
    return extra ? { label: selected.label, window: extra.window } : null;
}

export function detailForMetric(
    usage: CodexBarUsageSnapshot | null | undefined,
    metricId: string | undefined
): { label: string; valueText: string; caption?: string } | null {
    if (!metricId) return null;
    return detailMetricsForUsage(usage).find((metric) => metric.id === metricId) ?? null;
}

function detailMetricsForUsage(
    usage: CodexBarUsageSnapshot | null | undefined
): Array<CodexBarMetricOption & { valueText: string; caption?: string }> {
    const metrics: Array<CodexBarMetricOption & { valueText: string; caption?: string }> = [];
    for (const [sectionIndex, section] of (usage?.details ?? []).entries()) {
        addDetailRows(metrics, section, sectionIndex);
        addChartPoints(metrics, section, sectionIndex);
    }
    return metrics;
}

function addDetailRows(
    metrics: Array<CodexBarMetricOption & { valueText: string; caption?: string }>,
    section: CodexBarDetailSection,
    sectionIndex: number
): void {
    const occurrences = new Map<string, number>();
    for (const row of section.rows ?? []) {
        const valueText = displayValue(row.value);
        if (!row.label || valueText == null) continue;
        metrics.push({
            id: detailMetricId("detail", section.title, row.label, occurrences),
            label: detailLabel(section.title, row.label),
            valueText,
            ...(row.secondaryValue ? { caption: row.secondaryValue } : {})
        });
    }
}

function addChartPoints(
    metrics: Array<CodexBarMetricOption & { valueText: string; caption?: string }>,
    section: CodexBarDetailSection,
    sectionIndex: number
): void {
    const chart = section.chart;
    const occurrences = new Map<string, number>();
    for (const point of chart?.points ?? []) {
        const valueText = displayChartValue(point.value, chart?.unit);
        if (!point.label || valueText == null) continue;
        metrics.push({
            id: detailMetricId("chart", chart?.title ?? section.title, point.label, occurrences),
            label: detailLabel(chart?.title ?? section.title, point.label),
            valueText,
            ...(chart?.unit ? { caption: chart.unit } : {})
        });
    }
}

function detailLabel(section: string | undefined, label: string): string {
    return section ? `${section} · ${label}` : label;
}

function detailMetricId(
    prefix: "detail" | "chart",
    section: string | undefined,
    label: string,
    occurrences: Map<string, number>
): string {
    const base = `${prefix}:${encodeURIComponent(section ?? "")}:${encodeURIComponent(label)}`;
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return occurrence === 0 ? base : `${base}:${occurrence}`;
}

function displayValue(value: string | number | null | undefined): string | null {
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
    const text = value?.trim();
    return text || null;
}

function displayChartValue(value: string | number | null | undefined, unit: string | undefined): string | null {
    if (typeof value !== "number") return displayValue(value);
    if (!Number.isFinite(value)) return null;
    if (unit?.toUpperCase() === "USD") {
        return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return String(value);
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
    private readonly starts = new Map<number, Promise<{ error?: CodexBarError }>>();
    private readonly managedServers = new Map<number, ChildProcess>();

    static getInstance(): CodexBarBackend {
        return this.instance ??= new CodexBarBackend();
    }

    async fetchProviderUsage(
        providerId: string,
        account: string | undefined,
        port: unknown,
        autoStart = false
    ): Promise<CodexBarResult> {
        const id = providerId.trim();
        if (!id) return { error: { message: "Choose a CodexBar provider" } };

        // A full serve snapshot is cached by CodexBar. A provider-filtered request uses
        // a distinct cache key and can trigger a slow cold refresh, so select locally.
        const payloads = await this.requestUsageWithAutoStart(codexBarPort(port), autoStart);
        if (!Array.isArray(payloads)) return payloads;

        const matches = payloads.filter((payload) => payload.provider === id);
        const payload = account
            ? matches.find((item) => (item.account ?? "") === account)
            : matches.find((item) => item.usage) ?? matches[0];
        if (!payload) return { error: { message: `CodexBar has no data for ${id}` } };
        if (payload.error?.message) return { payload, error: { message: payload.error.message } };
        return { payload, error: null };
    }

    async listProviders(port: unknown, autoStart = false): Promise<CodexBarProviderOption[] | { error: CodexBarError }> {
        const payloads = await this.requestUsageWithAutoStart(codexBarPort(port), autoStart);
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

    async getServerStatus(port: unknown): Promise<CodexBarServerStatus> {
        const resolvedPort = codexBarPort(port);
        const child = this.managedServers.get(resolvedPort);
        if (child && (child.exitCode !== null || child.killed)) {
            this.managedServers.delete(resolvedPort);
        }

        const running = await this.isHealthy(resolvedPort);
        const managed = running && this.managedServers.has(resolvedPort);
        return {
            state: running ? "running" : "stopped",
            managed,
            ...(managed && child?.pid ? { pid: child.pid } : {})
        };
    }

    async startServer(port: unknown): Promise<CodexBarServerStatus | { error: CodexBarError }> {
        const resolvedPort = codexBarPort(port);
        const current = await this.getServerStatus(resolvedPort);
        if (current.state === "running") return current;

        const started = await this.ensureServerStarted(resolvedPort);
        if (started.error) return { error: started.error };
        return this.getServerStatus(resolvedPort);
    }

    async stopServer(port: unknown): Promise<CodexBarServerStatus | { error: CodexBarError }> {
        const resolvedPort = codexBarPort(port);
        const child = this.managedServers.get(resolvedPort);
        if (!child || child.exitCode !== null || child.killed) {
            return { error: { code: "not-managed", message: "Only a server started by this Stream Deck session can be stopped" } };
        }

        if (!child.kill("SIGTERM")) {
            return { error: { code: "stop-failed", message: "Couldn't stop codexbar serve" } };
        }

        const deadline = Date.now() + 4_000;
        while (Date.now() < deadline) {
            if (!(await this.isHealthy(resolvedPort))) return this.getServerStatus(resolvedPort);
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
        return { error: { code: "stop-timeout", message: "codexbar serve did not stop" } };
    }

    private async requestUsageWithAutoStart(port: number, autoStart: boolean): Promise<UsageResponse> {
        const payloads = await this.requestUsage(port);
        if (Array.isArray(payloads) || !autoStart || payloads.error.message !== "Can't reach codexbar serve on 127.0.0.1") {
            return payloads;
        }

        if (await this.isHealthy(port)) return payloads;

        const started = await this.ensureServerStarted(port);
        if (started.error) return { error: started.error };
        return this.requestUsage(port);
    }

    private async ensureServerStarted(port: number): Promise<{ error?: CodexBarError }> {
        if (process.platform !== "darwin") {
            return { error: { code: "unsupported-platform", message: "CodexBar auto-start is available only on macOS" } };
        }

        const existing = this.starts.get(port);
        if (existing) return existing;

        const start = this.spawnServer(port);
        this.starts.set(port, start);
        try {
            return await start;
        } finally {
            this.starts.delete(port);
        }
    }

    private async spawnServer(port: number): Promise<{ error?: CodexBarError }> {
        const binary = CODEXBAR_BINARIES.find((path) => existsSync(path));
        if (!binary) {
            return { error: { code: "cli-not-found", message: "CodexBar CLI was not found" } };
        }

        let child: ChildProcess;
        try {
            child = spawn(binary, ["serve", "--host", "127.0.0.1", "--port", String(port)], {
                detached: true,
                stdio: "ignore",
                shell: false
            });
            child.unref();
            this.managedServers.set(port, child);
        } catch {
            return { error: { code: "start-failed", message: "Couldn't start codexbar serve" } };
        }

        let startError: CodexBarError | undefined;
        child.once("error", () => { startError = { code: "start-failed", message: "Couldn't start codexbar serve" }; });
        child.once("exit", (code) => {
            if (this.managedServers.get(port) === child) this.managedServers.delete(port);
            startError ??= { code: "server-exited", message: `codexbar serve exited (${code ?? "unknown"})` };
        });

        const deadline = Date.now() + SERVER_STARTUP_TIMEOUT_MS;
        while (Date.now() < deadline) {
            if (await this.isHealthy(port)) return {};
            if (startError) return { error: startError };
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return { error: { code: "start-timeout", message: "Timed out starting codexbar serve" } };
    }

    private async isHealthy(port: number): Promise<boolean> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
        try {
            const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
            return response.ok;
        } catch {
            return false;
        } finally {
            clearTimeout(timer);
        }
    }

    private async requestUsage(port: number, providerId?: string): Promise<UsageResponse> {
        const url = new URL(`http://127.0.0.1:${port}/usage`);
        if (providerId) url.searchParams.set("provider", providerId);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, { signal: controller.signal });
            const text = await response.text();
            if (!response.ok) return { error: { code: "server-http", message: `CodexBar serve returned HTTP ${response.status}` } };
            const parsed = JSON.parse(text) as unknown;
            if (!Array.isArray(parsed)) return { error: { code: "invalid-response", message: "CodexBar returned an unexpected response" } };
            return parsed as CodexBarProviderPayload[];
        } catch (error) {
            const timedOut = error instanceof Error && error.name === "AbortError";
            return {
                error: {
                    code: timedOut ? "timeout" : "unreachable",
                    message: timedOut ? "Timed out waiting for codexbar serve" : "Can't reach codexbar serve on 127.0.0.1"
                }
            };
        } finally {
            clearTimeout(timer);
        }
    }
}
