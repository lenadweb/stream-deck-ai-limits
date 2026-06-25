# CodexBar Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic CodexBar-backed AI usage action to `stream-deck-ai-limits` that consumes the local `codexbar serve` HTTP API to display any of 50+ providers on macOS, purely additively.

**Architecture:** A new `CodexBarBackend` singleton wraps the `codexbar serve` HTTP API (localhost) with health-probe + caching + graceful degradation. A new generic action `CodexBarGenericProgress` extends the existing `BaseMonitoringAction`, reusing all rendering/lifecycle, and reads CodexBar's `usage.primary/secondary` windows into the existing `value1/value2/resetTime` model. No changes to the 6 existing actions; Windows untouched.

**Tech Stack:** TypeScript (ESM, `"type":"module"`), Node 20, `@elgato/streamdeck`, Rollup, `node:test` (zero new runtime deps).

**Spec:** `docs/superpowers/specs/2026-06-25-codexbar-backend-design.md`

**Branch:** `feat/codexbar-backend` (already created)

**Testing approach:** Pure logic (registry, normalize, backend) is tested with `node:test`. Since Node can't run `.ts` directly and we add zero runtime deps, `scripts/test-compile.mjs` compiles the three pure TS modules with `tsc` (already a devDependency) into `tests/.compiled/` (gitignored); tests import from there. Type ordering matters: `ServiceTheme` is extended (Task 2) **before** the registry that uses it (Task 4).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/interfaces/codexbar.ts` | TS types mirroring CodexBar serve JSON + `CodexBarResult` + `CodexBarGenericSettings` (+ `MonitoringResult` added in Task 7) | Create |
| `src/interfaces/theme.ts` | Add CodexBar provider themes to `ServiceTheme` | Modify |
| `src/ui/progress-bar-renderer.ts` | Add brand + fallback theme colors | Modify |
| `scripts/test-compile.mjs` | Compile pure TS modules to ESM for `node:test` | Create |
| `src/services/codexbar-provider-registry.ts` | provider id → `{ displayName, theme }` + fallback; `themeFor`, `displayNameFor`, `knownProviderIds` | Create |
| `src/services/codexbar-backend.ts` | `normalizeCodexBarDisplay` pure mapper + `CodexBarBackend` singleton (probe/fetch/cache/platform-guard) | Create |
| `src/actions/base-monitoring-action.ts` | Widen `fetchProviderUsage`/`lastResult` to `MonitoringResult` union | Modify |
| `src/actions/codexbar-generic-progress.ts` | Generic action extending `BaseMonitoringAction` | Create |
| `src/plugin.ts` | Register the new action | Modify |
| `com.len.limits.sdPlugin/manifest.json` | Add the new action entry | Modify |
| `com.len.limits.sdPlugin/ui/codexbar-settings.html` | Property Inspector for the new action | Create |
| `tests/codexbar.test.mjs` | `node:test` cases (registry, normalize, probe, fetch, error passthrough) | Create |
| `README.md` | "CodexBar backend (macOS, optional)" section | Modify |

---

## Task 0: Bootstrap dependencies

**Files:** (no source changes)

- [ ] **Step 1: Install dependencies**

Run: `npm install`
Expected: installs `@elgato/streamdeck`, `@lenadweb/ai-limits`, etc. into `node_modules/`.

- [ ] **Step 2: Verify build still works**

Run: `npm run build`
Expected: builds `com.len.limits.sdPlugin/bin/plugin.js` with no errors.

- [ ] **Step 3: Verify node:test is available**

Run: `node --version`
Expected: version ≥ 20 (node:test ships with Node).

No commit. Proceed to Task 1.

---

## Task 1: CodexBar type definitions

**Files:**
- Create: `src/interfaces/codexbar.ts`

- [ ] **Step 1: Create the types file**

Create `src/interfaces/codexbar.ts`:

```ts
// Mirrors CodexBar serve JSON (CodexBarCore Codable field names).
// All fields optional/nullable for resilience — providers are heterogeneous.

export interface RateWindow {
    usedPercent: number;          // 0-100
    windowMinutes?: number | null;
    resetsAt?: string | null;     // ISO8601
    resetDescription?: string | null;
}

export interface UsageSnapshot {
    primary?: RateWindow | null;
    secondary?: RateWindow | null;
    tertiary?: RateWindow | null;
    extraRateWindows?: { name: string; [k: string]: unknown }[] | null;
    updatedAt: string;
}

export interface ProviderPayload {
    provider: string;
    source: string;
    usage?: UsageSnapshot | null;
    credits?: unknown | null;
    error?: { message: string; [k: string]: unknown } | null;
}

export interface HealthPayload {
    status: string;
    version?: string;
}

// Shape returned to BaseMonitoringAction. `error` has `message`, matching the
// shape BaseMonitoringAction.draw() reads (`result.error.message`).
export interface CodexBarResult {
    usage?: UsageSnapshot | null;
    error?: { message: string; code?: string } | null;
}

// Persisted via Stream Deck settings.
export interface CodexBarGenericSettings {
    providerId?: string;                       // default "cursor"
    port?: number;                             // default 8080
    window?: "primary" | "secondary";          // which window is the TOP bar; default "primary"
    showProviderName?: boolean;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/interfaces/codexbar.ts
git commit -m "feat(codexbar): add serve JSON type definitions"
```

---

## Task 2: Extend `ServiceTheme` (must precede registry)

**Files:**
- Modify: `src/interfaces/theme.ts`

- [ ] **Step 1: Read current theme file**

Run: `cat src/interfaces/theme.ts`
Confirm it has `export type ServiceTheme = 'claude' | 'codex' | 'antigravity' | 'gemini-cli' | 'minimax' | 'openrouter';`.

- [ ] **Step 2: Extend ServiceTheme**

Modify `src/interfaces/theme.ts` — replace the `ServiceTheme` line with:

```ts
export type ServiceTheme =
    | 'claude' | 'codex' | 'antigravity' | 'gemini-cli' | 'minimax' | 'openrouter'
    // CodexBar-backed providers (curated brand themes)
    | 'cursor' | 'copilot' | 'gemini' | 'zai' | 'augment' | 'windsurf'
    // Fallback for any provider without a curated theme
    | 'codexbar-generic';
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/interfaces/theme.ts
git commit -m "feat(codexbar): extend ServiceTheme with provider brand themes + fallback"
```

---

## Task 3: Add CodexBar theme colors to renderer

**Files:**
- Modify: `src/ui/progress-bar-renderer.ts` (the `themes` record)

- [ ] **Step 1: Add theme color entries**

In `src/ui/progress-bar-renderer.ts`, inside the `private themes: Record<ServiceTheme, ThemeColors> = { ... }` object, append these entries after the `openrouter: { ... }` entry (before the closing brace of the object):

```ts
        cursor: {
            primary: '#A8B1FF', secondary: '#C0C8FF',
            background: '#0E0F18', text: '#F2F3FB', label: '#8A8FA6',
            barBg: '#1F2030', barFill: '#A8B1FF'
        },
        copilot: {
            primary: '#8B5CF6', secondary: '#A78BFA',
            background: '#0F0B1A', text: '#F3EEFF', label: '#9288B0',
            barBg: '#221A3A', barFill: '#8B5CF6'
        },
        gemini: {
            primary: '#5B9BFF', secondary: '#8AB4F8',
            background: '#0E0F11', text: '#ECEDEF', label: '#8E929A',
            barBg: '#23272D', barFill: '#5B9BFF'
        },
        zai: {
            primary: '#4E8DFF', secondary: '#7AA9FF',
            background: '#0A0F1A', text: '#EDF2FB', label: '#8595AA',
            barBg: '#16223A', barFill: '#4E8DFF'
        },
        augment: {
            primary: '#2DD4BF', secondary: '#5EEAD4',
            background: '#08191A', text: '#E6FBFA', label: '#7FA8A6',
            barBg: '#0F2E2E', barFill: '#2DD4BF'
        },
        windsurf: {
            primary: '#22D3EE', secondary: '#67E8F9',
            background: '#06141A', text: '#E6FCFF', label: '#7AA5B0',
            barBg: '#0E2A33', barFill: '#22D3EE'
        },
        'codexbar-generic': {
            primary: '#9CA3AF', secondary: '#B0B6BF',
            background: '#121212', text: '#F5F5F5', label: '#9CA3AF',
            barBg: '#262626', barFill: '#9CA3AF'
        },
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: builds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/progress-bar-renderer.ts
git commit -m "feat(codexbar): add brand + fallback theme colors to renderer"
```

---

## Task 4: Test harness + Provider registry (TDD)

**Files:**
- Create: `scripts/test-compile.mjs`
- Modify: `.gitignore`, `package.json`
- Create: `tests/codexbar.test.mjs`
- Create: `src/services/codexbar-provider-registry.ts`

- [ ] **Step 1: Create the test-compile helper**

Create `scripts/test-compile.mjs`:

```js
// Compiles the pure TS test targets to ESM .mjs/.js for node:test.
// Zero runtime deps — uses tsc from devDependencies.
import { spawnSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync } from "node:fs";

const out = "tests/.compiled";
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const targets = [
  "src/services/codexbar-provider-registry.ts",
  "src/services/codexbar-backend.ts",
];

const res = spawnSync(
  "npx",
  ["tsc", "--module", "nodenext", "--target", "es2022",
   "--moduleResolution", "nodenext", "--outDir", out,
   "--skipLibCheck", "--strict", ...targets],
  { stdio: "inherit", shell: process.platform === "win32" },
);
if (res.status !== 0) process.exit(res.status ?? 1);
```

- [ ] **Step 2: Add gitignore + test script**

Append to `.gitignore`:

```
# Compiled test artifacts
tests/.compiled/
```

In `package.json`, add these to `"scripts"`:

```json
    "test": "node scripts/test-compile.mjs && node --test tests/",
    "test:run": "node --test tests/"
```

- [ ] **Step 3: Write the failing test (registry)**

Create `tests/codexbar.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  themeFor,
  displayNameFor,
  knownProviderIds,
} from "./.compiled/services/codexbar-provider-registry.js";

test("registry returns branded entry for known id", () => {
  assert.equal(themeFor("cursor"), "cursor");
  assert.equal(displayNameFor("cursor"), "Cursor");
});

test("registry returns fallback for unknown id", () => {
  assert.equal(themeFor("some-unknown-provider"), "codexbar-generic");
  assert.equal(displayNameFor("some-unknown-provider"), "some-unknown-provider");
});

test("knownProviderIds includes curated providers", () => {
  const ids = knownProviderIds();
  assert.ok(ids.includes("cursor"));
  assert.ok(ids.includes("copilot"));
  assert.ok(ids.length >= 6);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `./.compiled/services/codexbar-provider-registry.js` not found (source not created).

- [ ] **Step 5: Write the registry**

Create `src/services/codexbar-provider-registry.ts`:

```ts
import type { ServiceTheme } from "../interfaces/theme";

export interface CodexBarProviderMeta {
    displayName: string;
    theme: ServiceTheme;
}

// Curated subset; the fallback covers all 50+ providers.
const REGISTRY: Record<string, CodexBarProviderMeta> = {
    cursor: { displayName: "Cursor", theme: "cursor" },
    copilot: { displayName: "Copilot", theme: "copilot" },
    gemini: { displayName: "Gemini", theme: "gemini" },
    zai: { displayName: "z.ai", theme: "zai" },
    augment: { displayName: "Augment", theme: "augment" },
    windsurf: { displayName: "Windsurf", theme: "windsurf" },
};

const FALLBACK_THEME: ServiceTheme = "codexbar-generic";

export function themeFor(providerId?: string): ServiceTheme {
    if (!providerId) return FALLBACK_THEME;
    return REGISTRY[providerId]?.theme ?? FALLBACK_THEME;
}

export function displayNameFor(providerId?: string): string {
    if (!providerId) return "CodexBar";
    return REGISTRY[providerId]?.displayName ?? providerId;
}

export function knownProviderIds(): string[] {
    return Object.keys(REGISTRY);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: 3 registry tests PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/test-compile.mjs .gitignore package.json tests/codexbar.test.mjs src/services/codexbar-provider-registry.ts
git commit -m "feat(codexbar): add test harness and provider registry with tests"
```

---

## Task 5: `normalizeCodexBarDisplay` pure mapper (TDD)

**Files:**
- Create: `src/services/codexbar-backend.ts` (mapper only this task)
- Modify: `tests/codexbar.test.mjs` (append)

- [ ] **Step 1: Write failing tests**

Append to `tests/codexbar.test.mjs`:

```js
import { normalizeCodexBarDisplay } from "./.compiled/services/codexbar-backend.js";

test("normalize maps primary/secondary to value1/value2", () => {
    const snapshot = {
        primary: { usedPercent: 42, resetsAt: "2099-01-01T00:00:00Z" },
        secondary: { usedPercent: 7, resetsAt: "2099-01-08T00:00:00Z" },
        updatedAt: "2099-01-01T00:00:00Z",
    };
    const out = normalizeCodexBarDisplay(snapshot, "primary");
    assert.equal(out.value1, 42);
    assert.equal(out.value2, 7);
    assert.equal(out.resetTime1, "2099-01-01T00:00:00Z");
    assert.equal(out.resetTime2, "2099-01-08T00:00:00Z");
});

test("normalize uses chosen window as top bar", () => {
    const snapshot = {
        primary: { usedPercent: 10 },
        secondary: { usedPercent: 80 },
        updatedAt: "2099-01-01T00:00:00Z",
    };
    const out = normalizeCodexBarDisplay(snapshot, "secondary");
    assert.equal(out.value1, 80); // secondary now on top
    assert.equal(out.value2, 10); // primary on bottom
});

test("normalize tolerates missing windows", () => {
    const out = normalizeCodexBarDisplay({ updatedAt: "x" }, "primary");
    assert.equal(out.value1, 0);
    assert.equal(out.value2, 0);
    assert.equal(out.resetTime1, null);
    assert.equal(out.resetTime2, null);
});

test("normalize clamps out-of-range percent", () => {
    const snapshot = { primary: { usedPercent: 150 }, updatedAt: "x" };
    const out = normalizeCodexBarDisplay(snapshot, "primary");
    assert.equal(out.value1, 100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `normalizeCodexBarDisplay` not exported.

- [ ] **Step 3: Write the mapper**

Create `src/services/codexbar-backend.ts`:

```ts
import type { UsageSnapshot } from "../interfaces/codexbar";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: 7 tests PASS (3 registry + 4 normalize).

- [ ] **Step 5: Commit**

```bash
git add src/services/codexbar-backend.ts tests/codexbar.test.mjs
git commit -m "feat(codexbar): add normalizeCodexBarDisplay pure mapper with tests"
```

---

## Task 6: `CodexBarBackend` singleton (TDD)

**Files:**
- Modify: `src/services/codexbar-backend.ts` (append the class)
- Modify: `tests/codexbar.test.mjs` (append)

- [ ] **Step 1: Write failing tests for probe + fetch**

Append to `tests/codexbar.test.mjs`:

```js
import { CodexBarBackend } from "./.compiled/services/codexbar-backend.js";

function mockResponse(obj) {
    return {
        ok: true,
        status: 200,
        json: async () => obj,
        text: async () => JSON.stringify(obj),
    };
}

test("backend probe reports unavailable when fetch throws", async () => {
    const b = new CodexBarBackend();
    b.setTestDeps({ fetch: async () => { throw new Error("ECONNREFUSED"); }, platform: "darwin" });
    const avail = await b.probe(8080);
    assert.equal(avail, false);
    assert.equal(b.isAvailable(), false);
});

test("backend probe reports available on healthy /health", async () => {
    const b = new CodexBarBackend();
    b.setTestDeps({
        fetch: async (url) => url.endsWith("/health") ? mockResponse({ status: "ok", version: "0.37.2" }) : mockResponse(undefined),
        platform: "darwin",
    });
    const avail = await b.probe(8080);
    assert.equal(avail, true);
});

test("backend does not call fetch on non-darwin", async () => {
    const b = new CodexBarBackend();
    let called = false;
    b.setTestDeps({ fetch: async () => { called = true; return mockResponse({}); }, platform: "win32" });
    const avail = await b.probe(8080);
    assert.equal(avail, false);
    assert.equal(called, false);
});

test("backend fetchUsage returns error when payload has error", async () => {
    const b = new CodexBarBackend();
    b.setTestDeps({
        fetch: async (url) => {
            if (url.endsWith("/health")) return mockResponse({ status: "ok" });
            return mockResponse([{ provider: "cursor", source: "web", error: { message: "no cookies" } }]);
        },
        platform: "darwin",
    });
    await b.probe(8080);
    const res = await b.fetchUsage("cursor", 8080);
    assert.equal(res.error?.message, "no cookies");
    assert.equal(res.usage, null);
});

test("backend fetchUsage returns usage when present", async () => {
    const b = new CodexBarBackend();
    b.setTestDeps({
        fetch: async (url) => {
            if (url.endsWith("/health")) return mockResponse({ status: "ok" });
            return mockResponse([{
                provider: "cursor", source: "web",
                usage: { primary: { usedPercent: 55, resetsAt: "2099-01-01T00:00:00Z" }, updatedAt: "x" },
            }]);
        },
        platform: "darwin",
    });
    await b.probe(8080);
    const res = await b.fetchUsage("cursor", 8080);
    assert.equal(res.error, null);
    assert.equal(res.usage?.primary?.usedPercent, 55);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `CodexBarBackend` / `setTestDeps` not exported.

- [ ] **Step 3: Implement the backend class**

Append to `src/services/codexbar-backend.ts`:

```ts
import type { CodexBarResult, HealthPayload, ProviderPayload } from "../interfaces/codexbar";

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

    private constructor() {}

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: 12 tests PASS (7 prior + 5 backend).

- [ ] **Step 5: Commit**

```bash
git add src/services/codexbar-backend.ts tests/codexbar.test.mjs
git commit -m "feat(codexbar): add CodexBarBackend singleton with probe/fetch + tests"
```

---

## Task 7: Make `BaseMonitoringAction` generic over result type

> **Plan correction (2026-06-25):** The original Task 7 widened the result type to a `MonitoringResult` union. That fails typecheck for two reasons discovered during implementation: (1) the real `StandardUsageResult.perModel` uses `usagePercent: number | null`, not assignable to the union's hand-rolled shape; (2) widening `getDisplayData`'s parameter type breaks the 6 existing subclass overrides (parameter contravariance). The generic approach below fixes both **without touching the 6 existing actions** (they keep their current `StandardUsageResult` parameter verbatim).

**Files:**
- Modify: `src/interfaces/codexbar.ts` (add `MonitoringResult`)
- Modify: `src/actions/base-monitoring-action.ts` (add a `TResult` generic param)

- [ ] **Step 1: Add the shared result type**

Append to `src/interfaces/codexbar.ts`:

```ts
// Base of every result the base action can render. Both members expose an
// optional `error` with a `message` field, which is all draw() reads.
export type MonitoringResult = StandardUsageResultLike | CodexBarResult;

interface StandardUsageResultLike {
    provider?: unknown;
    overallUsagePercent?: number | null;
    overallResetTime?: string | number | null;
    perModel?: Record<string, { usagePercent?: number | null; resetTime?: string | null } | undefined> | null;
    error?: { message: string; code?: string } | null;
    [k: string]: unknown;
}
```

> Note `usagePercent?: number | null` (the `| null` matches the real `ModelUsage` type from @lenadweb/ai-limits so `StandardUsageResult` is structurally assignable).

- [ ] **Step 2: Genericize the base class**

In `src/actions/base-monitoring-action.ts`, READ the file first.

Add the import:
```ts
import type { MonitoringResult } from "../interfaces/codexbar";
```

Change the class declaration to add a second generic param (default keeps existing actions working unchanged):

```ts
export abstract class BaseMonitoringAction<T extends Record<string, any>, TResult extends MonitoringResult = StandardUsageResult> extends SingletonAction<T> {
```

(Keep `StandardUsageResult` imported in this file — the default generic param references it.)

Change the member/method signatures from `StandardUsageResult` to `TResult`:

```ts
    protected lastResult: TResult | null = null;
```

```ts
    protected async fetchProviderUsage(ev: any): Promise<TResult> {
        return this.limitsManager.getClient().fetchUsage(this.providerName);
    }
```

```ts
    protected abstract getDisplayData(ev: any, result: TResult): {
        value1: number;
        value2: number;
        label1: string;
        label2: string;
        resetTime1?: string | null;
        resetTime2?: string | null;
        valueText1?: string;
        valueText2?: string;
        slots?: Slot[];
    };
```

```ts
    protected async draw(ev: any, result: TResult): Promise<void> {
```

Leave all logic inside `draw`/`redraw`/`refresh` unchanged — `draw` only reads `result.error.message`, which is present on every `MonitoringResult` member, so it typechecks under `TResult extends MonitoringResult`.

The 6 existing subclasses declare `extends BaseMonitoringAction<XxxSettings>` (one generic arg), so `TResult` defaults to `StandardUsageResult` — **their code and signatures are unchanged**. (They still write `result: StandardUsageResult` in `getDisplayData`, which now matches the inherited default.) No edits to the 6 subclass files.

- [ ] **Step 3: Verify build + tests**

Run: `npm run build && npm test`
Expected: build OK (existing 6 actions unchanged, still typecheck); 13 tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add src/interfaces/codexbar.ts src/actions/base-monitoring-action.ts
git commit -m "refactor: genericize BaseMonitoringAction over result type (MonitoringResult)"
```

---

## Task 8: Generic action

**Files:**
- Create: `src/actions/codexbar-generic-progress.ts`

- [ ] **Step 1: Create the action**

Create `src/actions/codexbar-generic-progress.ts`:

```ts
import { action } from "@elgato/streamdeck";
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

    protected get providerName(): string {
        return this.providerId;
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
```

> Passing `CodexBarResult` as the second generic param means `getDisplayData`'s `result` is already typed `CodexBarResult` — no cast needed (`result.usage`). Existing 6 actions pass only one generic arg, so they keep `StandardUsageResult` by default.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/actions/codexbar-generic-progress.ts
git commit -m "feat(codexbar): add generic CodexBar-backed progress action"
```

---

## Task 9: Register action + manifest

**Files:**
- Modify: `src/plugin.ts`
- Modify: `com.len.limits.sdPlugin/manifest.json`

- [ ] **Step 1: Register in plugin entry**

In `src/plugin.ts`, add the import after the OpenRouter import:

```ts
import { CodexBarGenericProgress } from "./actions/codexbar-generic-progress";
```

Add the registration after the last `registerAction(...)` line (before `streamDeck.connect();`):

```ts
streamDeck.actions.registerAction(new CodexBarGenericProgress());
```

- [ ] **Step 2: Add manifest action entry**

In `com.len.limits.sdPlugin/manifest.json`, append this object to the `"Actions"` array (after the OpenRouter action object, before the array's closing `]`):

```json
    {
      "Name": "Progress Bars (CodexBar)",
      "UUID": "com.len.limits.codexbar.generic",
      "Icon": "imgs/actions/counter/icon",
      "Tooltip": "Displays any CodexBar provider usage (requires codexbar serve on macOS).",
      "PropertyInspectorPath": "ui/codexbar-settings.html",
      "Controllers": ["Keypad", "Encoder"],
      "Encoder": {
        "layout": "layouts/full-view.json",
        "StackColor": "#9CA3AF",
        "TriggerDescription": {
          "Rotate": "Refresh",
          "Touch": "Refresh",
          "Push": "Refresh"
        }
      },
      "States": [
        {
          "Image": "imgs/actions/counter/key",
          "TitleAlignment": "middle"
        }
      ]
    }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `bin/plugin.js` built; no errors.

- [ ] **Step 4: Commit**

```bash
git add src/plugin.ts com.len.limits.sdPlugin/manifest.json
git commit -m "feat(codexbar): register generic action and add manifest entry"
```

---

## Task 10: Property Inspector UI

**Files:**
- Create: `com.len.limits.sdPlugin/ui/codexbar-settings.html`

- [ ] **Step 1: Create the settings UI**

Create `com.len.limits.sdPlugin/ui/codexbar-settings.html`:

```html
<!DOCTYPE html>
<html>
<head lang="en">
    <title>CodexBar Settings</title>
    <meta charset="utf-8" />
    <script src="https://sdpi-components.dev/releases/v4/sdpi-components.js"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .info { padding: 8px 16px; font-size: 11px; color: #999; line-height: 1.4; }
        .link { color: #4285F4; cursor: pointer; text-decoration: underline; }
        .link:hover { color: #357ae8; }
    </style>
</head>
<body>
    <sdpi-item label="Provider">
        <sdpi-select setting="providerId" id="providerId">
            <option value="cursor">Cursor</option>
            <option value="copilot">Copilot</option>
            <option value="gemini">Gemini</option>
            <option value="zai">z.ai</option>
            <option value="augment">Augment</option>
            <option value="windsurf">Windsurf</option>
        </sdpi-select>
    </sdpi-item>

    <sdpi-item label="Top bar window">
        <sdpi-select setting="window" id="window">
            <option value="primary">Primary (session)</option>
            <option value="secondary">Secondary (week)</option>
        </sdpi-select>
    </sdpi-item>

    <sdpi-item label="Port">
        <sdpi-range setting="port" id="port" min="1024" max="65535" step="1" default="8080" showvalue="true"></sdpi-range>
    </sdpi-item>

    <sdpi-item label="Display">
        <sdpi-checkbox setting="showProviderName" id="showProviderName" label="Show provider name"></sdpi-checkbox>
    </sdpi-item>

    <div class="info">
        Requires <b>CodexBar</b> running <code>codexbar serve</code> on macOS (default port 8080).
        On Windows / when serve is off, this action shows a "macOS only" message.
    </div>
    <div class="info"><span class="link" onclick="openGitHub()">View source on GitHub</span></div>

    <script>
        function openGitHub() {
            window.open("https://github.com/lenadweb/stream-deck-ai-limits", "_blank");
        }
    </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add com.len.limits.sdPlugin/ui/codexbar-settings.html
git commit -m "feat(codexbar): add Property Inspector UI for generic action"
```

---

## Task 11: README documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a CodexBar section**

In `README.md`, after the "Provider Setup" section's table, insert:

```markdown
---

## CodexBar backend (macOS, optional)

A **Progress Bars (CodexBar)** action lets you display **any** provider that [CodexBar](https://github.com/steipete/CodexBar) supports (50+), without each one needing its own action.

**How it works:** on macOS, if you run `codexbar serve` locally, this action fetches usage from its localhost HTTP API and renders it with the same progress-bar UI. It is purely additive — the six dedicated actions above keep working as-is, and this action has no effect on Windows.

### Setup
1. Install CodexBar: `brew install --cask codexbar`.
2. Start the local server: `codexbar serve` (defaults to `127.0.0.1:8080`).
3. Enable + configure the provider you want in CodexBar → Settings → Providers.
4. In Stream Deck, drag **Progress Bars (CodexBar)** onto a key/dial and pick the provider in the Property Inspector.

| Setting | What it does |
|---|---|
| **Provider** | Which CodexBar provider to display (Cursor, Copilot, Gemini, z.ai, Augment, Windsurf). |
| **Top bar window** | Whether the top bar shows the primary (session) or secondary (week) usage window. |
| **Port** | Port of `codexbar serve` (default 8080). |

> No CodexBar installed or not on macOS? The action shows a clear message instead of data.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add CodexBar backend section to README"
```

---

## Task 12: Full verification + PR prep

**Files:** (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all 12 tests PASS (3 registry + 4 normalize + 5 backend).

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: `com.len.limits.sdPlugin/bin/plugin.js` produced, no errors.

- [ ] **Step 3: Confirm existing actions + LimitsManager untouched**

Run: `git diff main -- src/actions/progress-bars.ts src/actions/codex-progress-bars.ts src/actions/antigravity-progress-bars.ts src/actions/gemini-cli-progress-bars.ts src/actions/minimax-progress-bars.ts src/actions/openrouter-progress-bars.ts src/services/limits-manager.ts`
Expected: empty diff.

- [ ] **Step 4: Manual smoke check (if macOS + CodexBar available)**

1. Open Stream Deck, drop **Progress Bars (CodexBar)** on a key.
2. With `codexbar serve` running and Cursor configured → bar renders usage + countdown.
3. Stop `codexbar serve` → key shows "CodexBar serve 未运行" message.
4. Switch provider to Copilot in PI → updates accordingly.

If CodexBar is not available, skip this step and note it in the PR.

- [ ] **Step 5: Push branch + open PR**

```bash
git push -u origin feat/codexbar-backend
```

Then open a PR to `lenadweb/stream-deck-ai-limits` with this body:

```
## What
Adds a generic **Progress Bars (CodexBar)** action that consumes the local `codexbar serve` HTTP API to display any of 50+ providers on macOS.

## Why
Each provider currently needs its own action + UI + manifest entry. This lets one dynamic action cover all providers CodexBar supports, reusing its existing auth/credential handling.

## Scope (friendly to upstream)
- **Purely additive** — no changes to the 6 existing actions or `LimitsManager` (`git diff main -- src/actions/*progress-bars.ts src/services/limits-manager.ts` is empty).
- **Windows untouched** — the action is macOS-only by design (serve is macOS); shows a clear message elsewhere.
- **Zero new runtime deps** — uses Node's built-in `fetch`; tests use `node:test`.

## How
New `CodexBarBackend` singleton probes `/health` and fetches `/usage?provider=<id>`; a generic action extends `BaseMonitoringAction` and reuses all rendering. `BaseMonitoringAction.fetchProviderUsage` return type widened to a union (existing actions unaffected).

## Tests
`npm test` → 12 cases (registry, normalize mapper, probe/fetch, error passthrough).

Spec: `docs/superpowers/specs/2026-06-25-codexbar-backend-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Verification checklist

- [ ] `npm test` → 12 passing
- [ ] `npm run build` → no errors
- [ ] existing 6 actions: `git diff main` empty
- [ ] `LimitsManager`: unchanged
- [ ] Windows: action shows message, doesn't throw
- [ ] manifest registers `com.len.limits.codexbar.generic` with PI path
- [ ] README has CodexBar section
