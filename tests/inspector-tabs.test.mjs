import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ui = (name) => readFile(new URL(`../com.len.limits.sdPlugin/ui/${name}`, import.meta.url), "utf8");

for (const provider of ["claude", "codex", "codexbar", "gemini", "antigravity", "minimax", "opencode", "openrouter"]) {
    test(`${provider} inspector is split into Data, Style and Hold tabs`, async () => {
        const html = await ui(`${provider}-settings.html`);
        assert.ok(html.includes('<script src="inspector-tabs.js"></script>'));

        const panels = [...html.matchAll(/<section class="tab-panel" data-tab="([^"]+)" data-label="([^"]+)">([\s\S]*?)<\/section>/g)];
        assert.deepEqual(panels.map((m) => [m[1], m[2]]), [["data", "Data"], ["style", "Style"], ["hold", "Hold"]]);

        const [data, style, hold] = panels.map((m) => m[3]);
        assert.ok(data.includes('id="layout"'));
        assert.ok(data.includes('id="topMetric"') || data.includes('id="topModel"'));
        for (const id of ["size", "backgroundMode", "backgroundColor", "showProviderName"]) {
            assert.ok(style.includes(`id="${id}"`), `${id} belongs to Style`);
        }
        assert.ok(style.includes('id="backgroundColorRow"'));
        assert.ok(hold.includes('<div id="launchSettings"></div>'));
        assert.ok(html.includes('getElementById("backgroundColorRow").classList.toggle("hidden"'));
        assert.ok(html.includes("function openGitHub()"), "tab bar GitHub link needs openGitHub");
        assert.ok(!html.includes("View source on GitHub"), "GitHub link lives in the tab bar");
    });
}
