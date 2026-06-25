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
