import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/services/codexbar-backend.ts", import.meta.url), "utf8");
const propertyInspector = await readFile(new URL("../com.len.limits.sdPlugin/ui/codexbar-settings.html", import.meta.url), "utf8");
const actionSource = await readFile(new URL("../src/actions/codexbar-progress-bars.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
}).outputText;
const codexbar = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("CodexBar exposes every real rate window with useful labels", () => {
    const usage = {
        primary: { usedPercent: 12, windowMinutes: 300 },
        secondary: { usedPercent: 35, windowMinutes: 10080 },
        tertiary: { usedPercent: 4, windowMinutes: 43200 },
        extraRateWindows: [
            { id: "premium", title: "Premium", window: { usedPercent: 60, windowMinutes: 10080 } },
            { id: "placeholder", title: "Ignore", usageKnown: false, window: { usedPercent: 0 } }
        ]
    };

    assert.deepEqual(codexbar.metricsForUsage(usage), [
        { id: "primary", label: "5h" },
        { id: "secondary", label: "Week" },
        { id: "tertiary", label: "Month" },
        { id: "extra:premium", label: "Premium" }
    ]);
    assert.deepEqual(codexbar.windowForMetric(usage, "extra:premium"), {
        label: "Premium",
        window: { usedPercent: 60, windowMinutes: 10080 }
    });
});

test("CodexBar backend selects the requested account and keeps the request on loopback", async () => {
    const originalFetch = globalThis.fetch;
    let requestedURL;
    globalThis.fetch = async (url) => {
        requestedURL = String(url);
        return new Response(JSON.stringify([
            { provider: "cursor", account: "Personal", usage: { primary: { usedPercent: 10 } } },
            { provider: "cursor", account: "Work", usage: { primary: { usedPercent: 40 } } }
        ]));
    };

    try {
        const result = await codexbar.CodexBarBackend.getInstance().fetchProviderUsage("cursor", "Work", 9090);
        assert.equal(requestedURL, "http://127.0.0.1:9090/usage");
        assert.equal(result.payload.account, "Work");
        assert.equal(result.payload.usage.primary.usedPercent, 40);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("CodexBar Property Inspector only accepts discovered providers", () => {
    assert.doesNotMatch(propertyInspector, /Custom provider/i);
    assert.doesNotMatch(propertyInspector, /\(custom\)/i);
    assert.match(propertyInspector, /Loading providers…/);
});

test("CodexBar loads providers when the inspector opens and keeps configuration progressive", () => {
    assert.match(actionSource, /onPropertyInspectorDidAppear/);
    assert.match(propertyInspector, /id="refreshProviders"/);
    assert.match(propertyInspector, /id="configurationPanel" class="hidden"/);
    assert.match(propertyInspector, /<details class="advanced">/);
    assert.match(propertyInspector, /id="accountRow" class="hidden"/);
    assert.doesNotMatch(propertyInspector, /Changing the port refreshes providers/);
    assert.match(propertyInspector, /Start CodexBar with <code>codexbar serve<\/code>/);
    assert.match(propertyInspector, /View source on GitHub/);
    assert.match(propertyInspector, /hideStatus\(\)/);
    assert.doesNotMatch(propertyInspector, /Loaded \$\{_providers\.length\} configured provider account/);
    assert.doesNotMatch(propertyInspector, /Load enabled CodexBar providers/);
});
