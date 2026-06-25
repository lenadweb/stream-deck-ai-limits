import { test } from "node:test";
import assert from "node:assert/strict";
import {
  themeFor,
  displayNameFor,
  knownProviderIds,
} from "./.compiled/services/codexbar-provider-registry.js";
import { normalizeCodexBarDisplay } from "./.compiled/services/codexbar-backend.js";

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
