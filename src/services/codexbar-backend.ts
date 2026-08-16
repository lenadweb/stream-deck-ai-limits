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
type CodexBarWindowId = "primary" | "secondary" | "tertiary";

/**
 * Labels from CodexBar's ProviderMetadata (sessionLabel, weeklyLabel, opusLabel).
 * CodexBar's serve API intentionally transports windows as primary/secondary/tertiary,
 * so consumers need this presentation mapping to avoid exposing those transport names.
 */
const PROVIDER_WINDOW_LABELS: Record<string, Partial<Record<CodexBarWindowId, string>>> = {
    abacus: { primary: "Credits", secondary: "Weekly" },
    aiand: { primary: "Spend", secondary: "Spend" },
    alibaba: { primary: "5-hour", secondary: "Weekly", tertiary: "Monthly" },
    alibabatokenplan: { primary: "Credits", secondary: "Usage" },
    amp: { primary: "Amp Free", secondary: "Balance" },
    antigravity: { primary: "Gemini Models", secondary: "Claude and GPT" },
    augment: { primary: "Credits", secondary: "Usage" },
    azureopenai: { primary: "Status", secondary: "Deployment" },
    bedrock: { primary: "Budget", secondary: "Cost" },
    chutes: { primary: "4-hour quota", secondary: "Monthly quota" },
    claude: { primary: "Session", secondary: "Weekly", tertiary: "Sonnet" },
    clawrouter: { primary: "Monthly budget", secondary: "Requests" },
    clinepass: { primary: "5-hour", secondary: "Weekly", tertiary: "Monthly" },
    codebuff: { primary: "Credits", secondary: "Weekly" },
    codex: { primary: "Session", secondary: "Weekly" },
    commandcode: { primary: "5-hour", secondary: "Weekly", tertiary: "Monthly" },
    copilot: { primary: "Premium", secondary: "Chat" },
    crof: { primary: "Credits", secondary: "Credits" },
    cursor: { primary: "Total", secondary: "Cursor", tertiary: "Third Party" },
    deepinfra: { primary: "Balance", secondary: "Balance" },
    deepseek: { primary: "Balance", secondary: "Balance" },
    deepgram: { primary: "Requests", secondary: "Usage" },
    devin: { primary: "Daily", secondary: "Weekly" },
    doubao: { primary: "5-hour", secondary: "Weekly", tertiary: "Monthly" },
    elevenlabs: { primary: "Credits", secondary: "Voices" },
    factory: { primary: "Standard", secondary: "Premium" },
    fireworks: { primary: "Spend", secondary: "Spend" },
    gemini: { primary: "Pro", secondary: "Flash", tertiary: "Flash Lite" },
    grok: { primary: "Credits", secondary: "On-demand" },
    groq: { primary: "Requests", secondary: "Tokens" },
    ibmbob: { primary: "Monthly Bobcoins", secondary: "Monthly Bobcoins" },
    jetbrains: { primary: "Current", secondary: "Refill" },
    kilo: { primary: "Credits", secondary: "Kilo Pass" },
    kimi: { primary: "7-day usage", secondary: "5-hour usage" },
    kiro: { primary: "Credits", secondary: "Bonus" },
    llmproxy: { primary: "Quota", secondary: "Requests" },
    litellm: { primary: "Personal budget", secondary: "Team budget" },
    longcat: { primary: "Quota", secondary: "Fuel Pack" },
    manus: { primary: "Monthly credits", secondary: "Daily refresh" },
    mimo: { primary: "Credits", secondary: "Window" },
    minimax: { primary: "Prompts", secondary: "Window" },
    mistral: { primary: "Balance" },
    moonshot: { primary: "Balance", secondary: "Balance" },
    neuralwatt: { primary: "Subscription", secondary: "Key allowance" },
    notion: { primary: "Rolling", secondary: "Monthly" },
    ollama: { primary: "Session", secondary: "Weekly" },
    openai: { primary: "Spend", secondary: "Requests" },
    opencode: { primary: "5-hour", secondary: "Weekly" },
    opencodego: { primary: "5-hour", secondary: "Weekly", tertiary: "Monthly" },
    openrouter: { primary: "Credits", secondary: "Usage" },
    perplexity: { primary: "Credits", secondary: "Bonus credits", tertiary: "Purchased" },
    poe: { primary: "Points", secondary: "Points" },
    qoder: { primary: "Credits", secondary: "Balance" },
    qwencloud: { primary: "5-hour", secondary: "Weekly" },
    sakana: { primary: "5-hour", secondary: "Weekly" },
    stepfun: { primary: "5h Window", secondary: "Weekly Window" },
    sub2api: { primary: "Quota", secondary: "Weekly quota", tertiary: "Monthly quota" },
    synthetic: { primary: "Five-hour quota", secondary: "Weekly tokens", tertiary: "Search hourly" },
    t3chat: { primary: "Base", secondary: "Overage" },
    venice: { primary: "Balance", secondary: "Balance" },
    vertexai: { primary: "Requests", secondary: "Tokens" },
    warp: { primary: "Credits", secondary: "Add-on credits" },
    wayfinder: { primary: "Savings", secondary: "Requests" },
    windsurf: { primary: "Daily", secondary: "Weekly" },
    xai: { primary: "Spend", secondary: "Spend" },
    zai: { primary: "5-hour", secondary: "Weekly" },
    zed: { primary: "Edit predictions", secondary: "Billing cycle" },
    zenmux: { primary: "5-hour quota", secondary: "Weekly quota" },
    zoommate: { primary: "Credits", secondary: "Credits" }
};

/** ProviderMetadata.balanceOnly from CodexBar's official descriptors. */
const BALANCE_ONLY_PROVIDERS = new Set(["deepinfra", "deepseek", "mistral", "moonshot", "poe"]);

export function codexBarPort(value: unknown): number {
    const port = typeof value === "number" ? value : Number(value);
    return Number.isInteger(port) && port >= 1024 && port <= 65_535 ? port : DEFAULT_PORT;
}

export function providerTitle(providerId: string): string {
    return providerId
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function metricsForUsage(usage: CodexBarUsageSnapshot | null | undefined, providerId?: string): CodexBarMetricOption[] {
    return [...quotaMetricsForUsage(usage, providerId), ...detailMetricsForUsage(usage)];
}

function quotaMetricsForUsage(usage: CodexBarUsageSnapshot | null | undefined, providerId?: string): CodexBarMetricOption[] {
    const metrics: CodexBarMetricOption[] = [];
    const add = (id: CodexBarWindowId, fallback: string, window: CodexBarRateWindow | null | undefined) => {
        if (!window || window.isSyntheticPlaceholder) return;
        metrics.push({ id, label: providerWindowLabel(providerId, id, window, fallback) });
    };

    add("primary", "Usage", usage?.primary);
    add("secondary", "Additional usage", usage?.secondary);
    add("tertiary", "Additional usage", usage?.tertiary);
    for (const extra of usage?.extraRateWindows ?? []) {
        if (!extra?.id || !extra.window || extra.usageKnown === false) continue;
        metrics.push({ id: `extra:${extra.id}`, label: extra.title || extra.id });
    }
    return metrics;
}

export function windowForMetric(
    usage: CodexBarUsageSnapshot | null | undefined,
    metricId: string | undefined,
    providerId?: string
): { label: string; window: CodexBarRateWindow; presentation: "gauge" | "stat" } | null {
    const metrics = quotaMetricsForUsage(usage, providerId);
    const selected = metricId ? metrics.find((metric) => metric.id === metricId) : metrics[0];
    if (!selected) return null;

    const balanceOnly = providerId ? BALANCE_ONLY_PROVIDERS.has(providerId.toLowerCase()) : false;
    const result = (window: CodexBarRateWindow) => ({
        label: selected.label,
        window,
        presentation: balanceOnly && selected.id === "primary" ? "stat" as const : "gauge" as const
    });

    if (selected.id === "primary") return usage?.primary ? result(usage.primary) : null;
    if (selected.id === "secondary") return usage?.secondary ? result(usage.secondary) : null;
    if (selected.id === "tertiary") return usage?.tertiary ? result(usage.tertiary) : null;

    const extraId = selected.id.slice("extra:".length);
    const extra = (usage?.extraRateWindows ?? []).find((item: CodexBarNamedRateWindow) => item.id === extraId);
    return extra ? result(extra.window) : null;
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

function providerWindowLabel(
    providerId: string | undefined,
    windowId: CodexBarWindowId,
    window: CodexBarRateWindow,
    fallback: string
): string {
    const mapped = providerId ? PROVIDER_WINDOW_LABELS[providerId.toLowerCase()]?.[windowId] : undefined;
    return mapped || genericWindowLabel(window, fallback);
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

        // CodexBar serves an expired unfiltered snapshot while rebuilding it in the
        // background. A per-provider request waits for that provider's current data,
        // which keeps a monitoring tile from being one cache cycle behind.
        const payloads = await this.requestUsageWithAutoStart(codexBarPort(port), autoStart, id);
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
                metrics: metricsForUsage(payload.usage, payload.provider)
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

    private async requestUsageWithAutoStart(
        port: number,
        autoStart: boolean,
        providerId?: string
    ): Promise<UsageResponse> {
        const payloads = await this.requestUsage(port, providerId);
        if (Array.isArray(payloads) || !autoStart || payloads.error.message !== "Can't reach codexbar serve on 127.0.0.1") {
            return payloads;
        }

        if (await this.isHealthy(port)) return payloads;

        const started = await this.ensureServerStarted(port);
        if (started.error) return { error: started.error };
        return this.requestUsage(port, providerId);
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
