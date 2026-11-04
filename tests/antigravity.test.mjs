import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rollup } from "rollup";
import ts from "typescript";
import { runInNewContext } from "node:vm";
import { LimitsClient, mapAntigravityUsage } from "@lenadweb/ai-limits";

// Exercise the actual action, base lifecycle and renderer with only Stream Deck I/O stubbed.
const io = {
    client: null,
    messages: [],
    ui: { action: { manifestId: "com.len.limits.antigravity" } }
};
io.ui.sendToPropertyInspector = async (payload) => io.messages.push(payload);
globalThis.__antigravityTestIO = io;
after(() => { delete globalThis.__antigravityTestIO; });
const bundle = await rollup({
    input: path.resolve("src/actions/antigravity-progress-bars.ts"),
    onwarn(warning, warn) {
        if (warning.code !== "THIS_IS_UNDEFINED") warn(warning);
    },
    plugins: [{
        name: "test-runtime",
        resolveId(source, importer) {
            if (source === "@elgato/streamdeck") return "\0sdk";
            if (source.endsWith("/services/limits-manager")) return "\0manager";
            if (source === "@lenadweb/ai-limits") {
                return { id: import.meta.resolve(source), external: true };
            }
            if (source.startsWith(".")) return path.resolve(path.dirname(importer), source) + ".ts";
        },
        load(id) {
            if (id === "\0sdk") return `
                export class SingletonAction {}
                export const action = () => (target) => target;
                export default { ui: globalThis.__antigravityTestIO.ui,
                    logger: { info() {}, error() {} } };`;
            if (id === "\0manager") return `export class LimitsManager {
                static getInstance() { return { getClient: () => globalThis.__antigravityTestIO.client }; }
            }`;
        },
        transform(source, id) {
            if (!id.endsWith(".ts")) return;
            return ts.transpileModule(source, { compilerOptions: {
                target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext
            }}).outputText;
        }
    }]
});
const { output } = await bundle.generate({ format: "esm" });
await bundle.close();
const { AntigravityProgressBars } = await import("data:text/javascript;base64," + Buffer.from(output[0].code).toString("base64"));

const raw = { groups: [
    { name: "Gemini Models", buckets: [{ id: "gemini-weekly", window: "weekly", remaining_fraction: 0.49 }] },
    { name: "Claude and GPT models", buckets: [{ id: "3p-weekly", window: "weekly", remaining_fraction: 1 }] }
] };
const usage = mapAntigravityUsage(raw);
function tile(id, settings = {}, controller = "Keypad") {
    const writes = [];
    const images = [];
    const feedback = [];
    return {
        action: {
            id,
            setSettings: async (value) => writes.push(value),
            setImage: async (value) => images.push(Buffer.from(value.split(",")[1], "base64").toString()),
            setFeedback: async (value) => feedback.push(value)
        },
        payload: { settings, controller }, writes, images, feedback
    };
}

test("saved Gemini and Claude models render and migrate to shared weekly pools on every tile", async () => {
    io.client = { fetchUsage: async () => usage };
    const action = new AntigravityProgressBars();
    const first = tile("key", { topModel: "gemini-2.5-pro", bottomModel: "claude-sonnet-4", size: "large", loggedInEmail: "old@example.test" });
    const second = tile("dial", { layout: "ring", model: "opaque-id", availableModelLabels: { "opaque-id": "GPT-OSS 120B" } }, "Encoder");
    action.track(first, "Keypad");
    action.track(second, "Encoder");
    await action.onKeyDown(first);
    assert.equal(first.writes.at(-1).topModel, "gemini-weekly");
    assert.equal(first.writes.at(-1).bottomModel, "3p-weekly");
    assert.equal(first.writes.at(-1).size, "large");
    assert.equal("loggedInEmail" in first.writes.at(-1), false);
    assert.equal(second.writes.at(-1).model, "3p-weekly");
    assert.deepEqual(second.writes.at(-1).availableModels, ["gemini-weekly", "3p-weekly"]);
    assert.match(first.images.at(-1), /51%/);
    assert.match(first.images.at(-1), /0%/);
    assert.equal(second.feedback.length, 1);
    assert.deepEqual(io.messages.at(-1).labels, {
        "gemini-weekly": "Gemini Models (7d)", "3p-weekly": "Claude and GPT models (7d)"
    });
    // Switching to another page uses cached usage but must still migrate its tile.
    const third = tile("another-page", { layout: "ring", model: "gemini-3-pro" });
    try {
        await action.onWillAppear(third);
        assert.equal(third.writes.at(-1).model, "gemini-weekly");
    } finally {
        for (const ev of [first, second, third]) await action.onWillDisappear(ev);
    }
});

test("missing and null quotas show no data; a real zero remains a gauge", () => {
    const action = new AntigravityProgressBars();
    const missing = action.getDisplayData(tile("key", { topModel: "unknown", bottomModel: "3p-weekly" }), usage).slots;
    assert.equal(missing[0].kind, "stat");
    assert.equal(missing[0].caption, "no data");
    assert.equal(missing[1].percent, 0);
    assert.equal(missing[1].kind, "gauge");
    const empty = action.getDisplayData(tile("key", { layout: "ring" }), mapAntigravityUsage({ groups: [] })).ring;
    assert.equal(empty.caption, "no data");
    const unavailable = action.getDisplayData(tile("key", { layout: "ring", model: "gemini-weekly" }), {
        ...usage, perModel: { "gemini-weekly": { usagePercent: null, displayName: "Gemini Models" } }
    }).ring;
    assert.equal(unavailable.kind, "stat");
    const missingWindow = action.getDisplayData(tile("key", { layout: "ring", model: "gemini-daily" }), usage).ring;
    assert.equal(missingWindow.caption, "no data");
});

test("CLI errors reach the key and inspector without destroying cached selections", async () => {
    io.client = new LimitsClient({ logger: { log() {}, error() {} }, antigravity: { binaryPath: path.join(tmpdir(), "missing-agy-test", "agy") } });
    const action = new AntigravityProgressBars();
    const key = tile("key", { model: "gemini-weekly", availableModels: ["gemini-weekly"] });
    action.track(key, "Keypad");
    await action.onKeyDown(key);
    assert.match(key.images.at(-1), /agy Not Found/);
    assert.equal(io.messages.at(-1).error.message, "agy Not Found");
    assert.equal(key.writes.length, 0);
});

test("simultaneous tiles and inspector share one real SDK agy process", { skip: process.platform === "win32" }, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "limits-agy-"));
    try {
        const binary = path.join(dir, "agy");
        const calls = path.join(dir, "calls");
        await writeFile(binary, `#!/bin/sh\n[ "$*" = "--print /usage --print-timeout 20s --output-format json" ] || exit 9\necho run >> '${calls}'\ncat <<'JSON'\n${JSON.stringify({ status: "SUCCESS", command: { data: raw } })}\nJSON\n`, { mode: 0o755 });
        io.client = new LimitsClient({ logger: { log() {}, error() {} }, antigravity: { binaryPath: binary, cacheTtlMs: 0 } });
        const action = new AntigravityProgressBars();
        const first = tile("first");
        const second = tile("second");
        action.track(first, "Keypad");
        action.track(second, "Keypad");
        await Promise.all([
            action.onKeyDown(first), action.onKeyDown(second),
            action.onSendToPlugin({ ...first, payload: { event: "getQuotas" } })
        ]);
        assert.equal((await readFile(calls, "utf8")).trim(), "run");
        assert.equal(io.messages.at(-1).error, null);
        // A later manual refresh runs again, so the in-flight cache cannot get stuck.
        await action.onKeyDown(first);
        assert.equal((await readFile(calls, "utf8")).trim().split("\n").length, 2);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

const inspectorHtml = await readFile(new URL("../com.len.limits.sdPlugin/ui/antigravity-settings.html", import.meta.url), "utf8");
function inspector(settings) {
    const elements = new Map();
    for (const id of inspectorHtml.matchAll(/id="([^"]+)"/g)) {
        const classes = new Set();
        const el = {
            value: "", options: [{ value: "", textContent: "Overall" }],
            classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); } },
            addEventListener() {}, remove(index) { this.options.splice(index, 1); },
            appendChild(option) { this.options.push(option); }
        };
        elements.set(id[1], el);
    }
    let socket;
    const sent = [];
    const context = {
        document: {
            getElementById: (id) => elements.get(id),
            createElement: () => ({}), addEventListener() {}
        },
        WebSocket: class {
            constructor() { socket = this; }
            send(message) { sent.push(JSON.parse(message)); }
        }
    };
    runInNewContext(inspectorHtml.match(/<script>([\s\S]*?)<\/script>/)[1], context);
    context.connectElgatoStreamDeckSocket(1234, "key", "registerPropertyInspector", "{}", JSON.stringify({
        action: "com.len.limits.antigravity", payload: { settings }
    }));
    socket.onopen();
    return {
        elements, sent, save: context.saveSettings,
        receive: (message) => socket.onmessage({ data: JSON.stringify(message) })
    };
}

test("inspector preserves unavailable selections and cached quotas through CLI errors and display changes", () => {
    const pi = inspector({ topModel: "unknown-model", bottomModel: "gemini-weekly", availableModels: ["gemini-weekly"] });
    assert.equal(pi.sent.at(-1).payload.event, "getQuotas");
    assert.equal(pi.elements.get("topModel").value, "unknown-model");
    assert.match(pi.elements.get("topModel").options.at(-1).textContent, /unavailable/);
    for (const [error, expected] of [
        [{ code: "AUTH", message: "agy Not Found" }, /Install the Antigravity CLI/],
        [{ code: "CONN", message: "Timeout" }, /timed out/],
        [{ code: "API", message: "API Error" }, /check sign-in/]
    ]) {
        pi.receive({ event: "sendToPropertyInspector", payload: { event: "quotaList", quotas: [], error } });
        assert.match(pi.elements.get("cliStatus").textContent, expected);
        assert.equal(pi.elements.get("bottomModel").options.length, 2);
    }
    pi.elements.get("size").value = "large";
    pi.save();
    assert.equal(pi.sent.at(-1).payload.topModel, "unknown-model");
    assert.equal(pi.sent.at(-1).payload.bottomModel, "gemini-weekly");
});

test("inspector loads quota labels and applies migrated settings without clearing other display settings", () => {
    const pi = inspector({ layout: "ring", model: "gemini-2.5-pro", size: "compact", showProviderName: false });
    pi.receive({ event: "didReceiveSettings", payload: { settings: {
        layout: "ring", model: "gemini-weekly", size: "compact", showProviderName: false,
        availableModels: ["gemini-weekly"], availableModelLabels: { "gemini-weekly": "Gemini Models (7d)" }
    } } });
    pi.receive({ event: "sendToPropertyInspector", payload: {
        event: "quotaList", quotas: ["gemini-weekly"], labels: { "gemini-weekly": "Gemini Models (7d)" }, error: null
    } });
    assert.equal(pi.elements.get("model").value, "gemini-weekly");
    assert.equal(pi.elements.get("model").options.at(-1).textContent, "Gemini Models (7d)");
    assert.equal(pi.elements.get("size").value, "compact");
    assert.equal(pi.elements.get("showProviderName").checked, false);
    assert.match(pi.elements.get("cliStatus").textContent, /Usage loaded/);
});
