import type { CodexBarResult, HealthPayload, ProviderPayload, UsageSnapshot } from "../interfaces/codexbar";

export interface NormalizedDisplay {
    value1: number;
    value2: number;
    label1: string;
    label2: string;
    resetTime1: string | null;
    resetTime2: string | null;
}

function clampPercent(v: number | undefined | null): number {
    if (v == null || Number.isNaN(v)) return 0;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
}

export function normalizeCodexBarDisplay(
    snapshot: UsageSnapshot | null | undefined,
    topWindow: "primary" | "secondary",
): NormalizedDisplay {
    const primary = snapshot?.primary ?? null;
    const secondary = snapshot?.secondary ?? null;
    const top = topWindow === "secondary" ? secondary : primary;
    const bottom = topWindow === "secondary" ? primary : secondary;

    return {
        value1: clampPercent(top?.usedPercent),
        value2: clampPercent(bottom?.usedPercent),
        label1: "Session",
        label2: "Week",
        resetTime1: top?.resetsAt ?? null,
        resetTime2: bottom?.resetsAt ?? null,
    };
}

const PROBE_TIMEOUT_MS = 1500;
const FETCH_TIMEOUT_MS = 8000;
const PROBE_CACHE_MS = 60_000;
const LOOPBACK = "127.0.0.1";

type FetchLike = (url: string, opts?: Record<string, unknown>) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
}>;

interface TestDeps {
    fetch?: FetchLike;
    platform?: string;
}

export class CodexBarBackend {
    private static instance: CodexBarBackend;
    private available = false;
    private lastProbeAt = 0;
    private probing: Promise<boolean> | null = null;
    private deps: TestDeps = {};

    constructor() {}

    static getInstance(): CodexBarBackend {
        if (!CodexBarBackend.instance) CodexBarBackend.instance = new CodexBarBackend();
        return CodexBarBackend.instance;
    }

    /** Test-only injection of fetch/platform. */
    setTestDeps(deps: TestDeps): void {
        this.deps = deps;
        this.available = false;
        this.lastProbeAt = 0;
    }

    private get platform(): string {
        return this.deps.platform ?? process.platform;
    }

    private get fetchFn(): FetchLike {
        return (this.deps.fetch as FetchLike) ?? (globalThis.fetch as FetchLike);
    }

    isAvailable(): boolean {
        return this.available;
    }

    /** Probes /health; caches result for PROBE_CACHE_MS. Safe to call repeatedly. */
    async probe(port = 8080): Promise<boolean> {
        if (this.platform !== "darwin") {
            this.available = false;
            return false;
        }
        if (this.probing) return this.probing;
        const now = Date.now();
        if (this.lastProbeAt !== 0 && now - this.lastProbeAt < PROBE_CACHE_MS) {
            return this.available;
        }
        this.probing = this.doProbe(port);
        try {
            return await this.probing;
        } finally {
            this.probing = null;
        }
    }

    private async doProbe(port: number): Promise<boolean> {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
            const res = await this.fetchFn(`http://${LOOPBACK}:${port}/health`, { signal: ctrl.signal });
            clearTimeout(timer);
            if (!res.ok) {
                this.available = false;
            } else {
                const body = (await res.json()) as HealthPayload;
                this.available = body?.status === "ok";
            }
        } catch {
            this.available = false;
        }
        this.lastProbeAt = Date.now();
        return this.available;
    }

    /** Fetches usage for a provider. Never throws — errors become { error }. */
    async fetchUsage(providerId: string, port = 8080): Promise<CodexBarResult> {
        if (this.platform !== "darwin" || !providerId) {
            return { usage: null, error: { message: "CodexBar serve unavailable (macOS only)" } };
        }
        if (!this.available) {
            await this.probe(port);
        }
        if (!this.available) {
            return { usage: null, error: { message: "CodexBar serve 未运行(仅 macOS)" } };
        }
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
            const res = await this.fetchFn(
                `http://${LOOPBACK}:${port}/usage?provider=${encodeURIComponent(providerId)}`,
                { signal: ctrl.signal },
            );
            clearTimeout(timer);
            if (!res.ok) return { usage: null, error: { message: `serve HTTP ${res.status}` } };
            const arr = (await res.json()) as ProviderPayload[];
            const item = (Array.isArray(arr) ? arr : []).find((p) => p?.provider === providerId);
            if (!item) return { usage: null, error: { message: `provider "${providerId}" not found` } };
            if (item.error) return { usage: null, error: { message: item.error.message } };
            return { usage: item.usage ?? null, error: null };
        } catch (e) {
            return { usage: null, error: { message: e instanceof Error ? e.message : "request failed" } };
        }
    }
}
