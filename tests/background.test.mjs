import test from "node:test";
import assert from "node:assert/strict";
import { rollup } from "rollup";
import ts from "typescript";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const bundle = await rollup({
    input: "src/ui/progress-bar-renderer.ts",
    plugins: [{
        name: "typescript",
        transform(source, id) {
            if (id.endsWith(".ts")) return ts.transpileModule(source, {
                compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
            }).outputText;
        }
    }]
});
const { output } = await bundle.generate({ format: "esm" });
await bundle.close();
const { ProgressBarRenderer } = await import("data:text/javascript;base64," + Buffer.from(output[0].code).toString("base64"));
const renderer = new ProgressBarRenderer();
const slot = { kind: "gauge", label: "Usage", percent: 25 };

for (const [width, height] of [[144, 144], [200, 100]]) {
    for (const [name, render] of Object.entries({
        bars: (opts) => renderer.renderSlots([slot], "claude", width, height, opts),
        ring: (opts) => renderer.renderRing(slot, "claude", width, height, opts),
        placeholder: (opts) => renderer.renderPlaceholder("claude", width, height, opts),
        message: (opts) => renderer.renderMessage(["hello"], "claude", width, height, opts),
        error: (opts) => renderer.renderError("error", "claude", width, height, opts)
    })) {
        test(`${name} background selection at ${width}x${height}`, () => {
            const rect = (color) => `<rect width="${width}" height="${height}" fill="${color}" />`;
            assert.ok(render({}).includes(rect("#221C1A")));
            assert.ok(render({ backgroundMode: "color", backgroundColor: "#123456" }).includes(rect("#123456")));
            assert.ok(!render({ backgroundMode: "transparent" }).includes(rect("#221C1A")));
            assert.ok(render({ backgroundMode: "color", backgroundColor: '"><script>' }).includes(rect("#221C1A")));
            assert.ok(render({ backgroundMode: "invalid", backgroundColor: "#123456" }).includes(rect("#221C1A")));
        });
    }
}

for (const provider of ["claude", "codex", "codexbar", "gemini", "antigravity", "minimax", "opencode", "openrouter"]) {
    test(`${provider} inspector saves background choices`, async () => {
        const html = await readFile(new URL(`../com.len.limits.sdPlugin/ui/${provider}-settings.html`, import.meta.url), "utf8");
        const elements = new Map();
        for (const match of html.matchAll(/id="([^"]+)"/g)) {
            const listeners = {};
            elements.set(match[1], {
                value: "", checked: false, options: [], style: {}, classList: { toggle() {}, add() {}, remove() {} },
                addEventListener(event, fn) { listeners[event] = fn; },
                dispatch(event) { listeners[event]?.(); },
                appendChild(option) { this.options.push(option); }, remove(i) { this.options.splice(i, 1); },
                querySelectorAll() { return []; }
            });
        }
        let ready, socket;
        const sent = [];
        const context = {
            document: {
                getElementById: id => elements.get(id), createElement: () => ({ dataset: {} }),
                querySelectorAll: () => [], querySelector: () => null,
                addEventListener: (event, fn) => { if (event === "DOMContentLoaded") ready = fn; }
            },
            WebSocket: class { constructor() { socket = this; } send(message) { sent.push(JSON.parse(message)); } },
            Option: class { constructor(text, value) { this.text = text; this.value = value; this.dataset = {}; } },
            setTimeout: () => 1, clearTimeout() {}
        };
        runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
        ready();
        context.connectElgatoStreamDeckSocket(1234, "key", "register", "{}", JSON.stringify({ payload: { settings: {} } }));
        socket.onopen();
        assert.equal(elements.get("backgroundMode").value, "theme");
        elements.get("backgroundMode").value = "color";
        elements.get("backgroundColor").value = "#123456";
        elements.get("backgroundColor").dispatch("change");
        assert.equal(sent.at(-1).payload.backgroundColor, "#123456");
        elements.get("backgroundMode").value = "transparent";
        elements.get("backgroundMode").dispatch("change");
        assert.equal(sent.at(-1).payload.backgroundMode, "transparent");
        assert.equal(sent.at(-1).payload.backgroundColor, "#123456");
    });
}
