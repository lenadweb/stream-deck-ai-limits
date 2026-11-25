import test from "node:test";
import assert from "node:assert/strict";
import { rollup } from "rollup";
import ts from "typescript";
import { homedir } from "node:os";

const bundle = await rollup({
    input: "src/services/launcher.ts",
    external: [/^node:/],
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
const { launchTarget, buildLaunchPlan } = await import("data:text/javascript;base64," + Buffer.from(output[0].code).toString("base64"));

test("no target keeps refresh-only behaviour", () => {
    assert.equal(launchTarget(undefined), "none");
    assert.equal(launchTarget({}), "none");
    assert.equal(launchTarget({ launchTarget: "none", launchApp: "Claude" }), "none");
});

test("a target with an empty field resolves to none", () => {
    assert.equal(launchTarget({ launchTarget: "app", launchApp: "  " }), "none");
    assert.equal(launchTarget({ launchTarget: "command" }), "none");
    assert.equal(launchTarget({ launchTarget: "url", launchUrl: "javascript:alert(1)" }), "none");
    assert.equal(launchTarget({ launchTarget: "url", launchUrl: "file:///etc/passwd" }), "none");
    assert.equal(launchTarget({ launchTarget: "url", launchUrl: "https://claude.ai" }), "url");
});

test("macOS opens apps by name or path", () => {
    assert.deepEqual(buildLaunchPlan({ launchTarget: "app", launchApp: "Claude" }, "darwin"),
        { file: "open", args: ["-a", "Claude"] });
    assert.deepEqual(buildLaunchPlan({ launchTarget: "app", launchApp: "/Applications/Claude.app" }, "darwin"),
        { file: "open", args: ["/Applications/Claude.app"] });
    assert.deepEqual(buildLaunchPlan({ launchTarget: "app", launchApp: "~/Applications/Codex.app" }, "darwin"),
        { file: "open", args: [homedir() + "/Applications/Codex.app"] });
});

test("Windows opens apps through start", () => {
    assert.deepEqual(buildLaunchPlan({ launchTarget: "app", launchApp: "C:\\Apps\\Claude.exe" }, "win32"),
        { file: "cmd.exe", args: ["/d", "/s", "/c", '"start "" "C:\\Apps\\Claude.exe""'] });
});

test("an app value with a quote is rejected", () => {
    const settings = { launchTarget: "app", launchApp: 'x" & calc & "' };
    assert.equal(launchTarget(settings), "none");
    assert.equal(buildLaunchPlan(settings, "win32"), null);
});

test("commands run in a shell in the chosen folder", () => {
    assert.deepEqual(buildLaunchPlan({ launchTarget: "command", launchCommand: "open -a Terminal .", launchCwd: "~/code" }, "darwin"),
        { file: "open -a Terminal .", args: [], shell: true, cwd: homedir() + "/code" });
    assert.equal(buildLaunchPlan({ launchTarget: "command", launchCommand: "x" }, "darwin").cwd, homedir());
});

test("urls are not spawned", () => {
    assert.equal(buildLaunchPlan({ launchTarget: "url", launchUrl: "https://claude.ai" }, "darwin"), null);
});

import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

for (const provider of ["claude", "codex", "codexbar", "gemini", "antigravity", "minimax", "opencode", "openrouter"]) {
    test(`${provider} inspector saves hold-to-open settings`, async () => {
        const ui = (name) => readFile(new URL(`../com.len.limits.sdPlugin/ui/${name}`, import.meta.url), "utf8");
        const html = await ui(`${provider}-settings.html`);
        const shared = await ui("launch-settings.js");
        assert.ok(html.includes('<script src="launch-settings.js"></script>'));
        assert.ok(html.includes('<div id="launchSettings"></div>'));

        // Elements exist up front for the page's ids; the shared rows appear on mount.
        const elements = new Map();
        const makeElement = () => {
            const listeners = {};
            return {
                value: "", checked: false, options: [], style: {}, dataset: {},
                classList: { toggle() {}, add() {}, remove() {} },
                addEventListener(event, fn) { listeners[event] = fn; },
                dispatch(event) { listeners[event]?.(); },
                appendChild(option) { this.options.push(option); }, remove(i) { this.options.splice(i, 1); },
                querySelectorAll() { return []; },
                set innerHTML(markup) {
                    for (const match of markup.matchAll(/id="([^"]+)"/g)) elements.set(match[1], makeElement());
                }
            };
        };
        for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], makeElement());

        let ready, socket;
        const sent = [];
        const context = {
            navigator: { userAgent: "Macintosh" },
            document: {
                head: { appendChild() {} },
                getElementById: id => elements.get(id), createElement: () => ({ dataset: {} }),
                querySelectorAll: () => [], querySelector: () => null,
                addEventListener: (event, fn) => { if (event === "DOMContentLoaded") ready = fn; }
            },
            WebSocket: class { constructor() { socket = this; } send(message) { sent.push(JSON.parse(message)); } },
            Option: class { constructor(text, value) { this.text = text; this.value = value; this.dataset = {}; } },
            setTimeout: () => 1, clearTimeout() {}
        };
        context.window = context;
        runInNewContext(shared, context);
        runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
        ready();
        const settings = { launchTarget: "app", launchApp: "Claude" };
        context.connectElgatoStreamDeckSocket(1234, "key", "register", "{}", JSON.stringify({ payload: { settings } }));
        socket.onopen();
        // Some pages apply settings only once Stream Deck echoes them back.
        socket.onmessage?.({ data: JSON.stringify({ event: "didReceiveSettings", payload: { settings } }) });

        assert.equal(elements.get("launchTarget").value, "app");
        assert.equal(elements.get("launchApp").value, "Claude");

        elements.get("launchTarget").value = "command";
        elements.get("launchCommand").value = "  open -a Terminal .  ";
        elements.get("launchCwd").value = "~/code";
        elements.get("launchCommand").dispatch("change");
        const saved = sent.at(-1).payload;
        assert.equal(saved.launchTarget, "command");
        assert.equal(saved.launchCommand, "open -a Terminal .");
        assert.equal(saved.launchCwd, "~/code");
        assert.equal(saved.launchApp, "Claude");
    });
}
