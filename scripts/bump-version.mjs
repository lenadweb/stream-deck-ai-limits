#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, "..", "com.len.limits.sdPlugin", "manifest.json");

const raw = readFileSync(manifestPath, "utf-8");
const manifest = JSON.parse(raw);

const parts = String(manifest.Version || "0.0.0.0").split(".").map((n) => parseInt(n, 10) || 0);
while (parts.length < 4) parts.push(0);

const [major, minor, patch, build] = parts;
const next = `${major}.${minor}.${patch + 1}.${build}`;

manifest.Version = next;

// Preserve original indentation (Elgato manifests are 2-space)
const indentMatch = raw.match(/^(\s+)"/m);
const indent = indentMatch ? indentMatch[1].length : 2;
writeFileSync(manifestPath, JSON.stringify(manifest, null, indent) + "\n");

console.log(`Bumped manifest version: ${parts.join(".")} -> ${next}`);
