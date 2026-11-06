import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { rollup } from "rollup";
import ts from "typescript";
import { mapOpenCodeUsage } from "@lenadweb/ai-limits";

const io = { client: null, ui: { action: { manifestId: "com.len.limits.opencode" } } };
globalThis.__opencodeTestIO = io;
after(() => { delete globalThis.__opencodeTestIO; });

const bundle = await rollup({
    input: path.resolve("src/actions/opencode-progress-bars.ts"),
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
                export default { ui: globalThis.__opencodeTestIO.ui,
                    logger: { info() {}, error() {} } };`;
            if (id === "\0manager") return `export const streamDeckLogger = { info() {}, error() {} };
                export class LimitsManager {
                    static getInstance() { return { getClient: () => globalThis.__opencodeTestIO.client }; }
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
const { OpenCodeProgressBars } = await import("data:text/javascript;base64," + Buffer.from(output[0].code).toString("base64"));

function tile(id, settings = {}, controller = "Keypad") {
    return {
        action: { id, setImage: async () => {}, setFeedback: async () => {}, setSettings: async () => {} },
        payload: { settings, controller }
    };
}

const goUsage = mapOpenCodeUsage({
    go: {
        usage: {
            rolling: { status: "ok", percent: 20, resetsAt: "2026-11-06T18:00:00.000Z" },
            weekly: { status: "ok", percent: 50, resetsAt: "2026-11-11T00:00:00.000Z" },
            monthly: { status: "ok", percent: 30, resetsAt: "2026-12-01T00:00:00.000Z" }
        }
    },
    budgets: [{
        ruleID: "rule", limitDollars: 20, spentDollars: 15,
        coverage: "all", per: "set", shared: false,
        resetsAt: "2026-12-01T00:00:00.000Z"
    }],
    billing: { balanceMicroCents: 12_500_000 }
});

const zenOnly = mapOpenCodeUsage({
    go: null,
    budgets: [{
        ruleID: "rule", limitDollars: 20, spentDollars: 15,
        coverage: "all", per: "set", shared: false,
        resetsAt: "2026-12-01T00:00:00.000Z"
    }, {
        ruleID: "rule_model", limitDollars: 10, spentDollars: 9,
        coverage: "models", per: "model", models: [{ modelID: "glm", name: "GLM-5", spentDollars: 9 }],
        resetsAt: "2026-12-01T00:00:00.000Z"
    }],
    billing: null
});

const balanceOnly = mapOpenCodeUsage({
    go: null,
    budgets: [],
    billing: { balanceMicroCents: 12_500_000 }
});

test("auto defaults use Go windows when the key has Go", () => {
    const action = new OpenCodeProgressBars();
    const bars = action.getDisplayData(tile("key"), goUsage).slots;
    assert.equal(bars[0].label, "5-Hour");
    assert.equal(bars[0].percent, 20);
    assert.equal(bars[1].label, "Week");
    assert.equal(bars[1].percent, 50);

    const ring = action.getDisplayData(tile("key", { layout: "ring" }), goUsage).ring;
    assert.equal(ring.label, "5-Hour");
    assert.equal(ring.percent, 20);
});

test("auto falls back to the worst budget and then to the Zen balance", () => {
    const action = new OpenCodeProgressBars();
    const zen = action.getDisplayData(tile("key"), zenOnly).slots;
    assert.equal(zen[0].label, "Overall");
    assert.equal(zen[0].percent, 90);
    assert.equal(zen[1].label, "GLM-5");
    assert.equal(zen[1].percent, 90);

    const balance = action.getDisplayData(tile("key"), balanceOnly).slots;
    assert.equal(balance[0].kind, "stat");
    assert.equal(balance[0].valueText, "$12.5");
    assert.equal(balance[1].kind, "stat");
    assert.equal(balance[1].label, "Balance");
});

test("explicit metrics select Go windows, budgets and balance", () => {
    const action = new OpenCodeProgressBars();
    const slots = action.getDisplayData(
        tile("key", { topMetric: "monthly", bottomMetric: "budget" }),
        goUsage
    ).slots;
    assert.equal(slots[0].label, "Month");
    assert.equal(slots[0].percent, 30);
    assert.equal(slots[1].label, "Budget");
    assert.equal(slots[1].percent, 75);

    const balance = action.getDisplayData(tile("key", { layout: "ring", metric: "balance" }), goUsage).ring;
    assert.equal(balance.kind, "stat");
    assert.equal(balance.valueText, "$12.5");
});

test("missing API key returns an auth error without a request", async () => {
    const action = new OpenCodeProgressBars();
    const result = await action.fetchProviderUsage(tile("key", { apiKey: "" }));
    assert.deepEqual(result.error, { code: "AUTH", message: "Auth Required" });
});
