// Compiles the pure TS test targets to ESM .mjs/.js for node:test.
// Zero runtime deps — uses tsc from devDependencies.
import { spawnSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync } from "node:fs";

const out = "tests/.compiled";
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const declaredTargets = [
  "src/services/codexbar-provider-registry.ts",
  "src/services/codexbar-backend.ts",
];
// Skip targets that don't exist yet (created in later tasks).
const targets = declaredTargets.filter((f) => existsSync(f));

// Note: module/moduleResolution match the project tsconfig (ES2022 + Bundler)
// so extensionless relative imports — the project's convention — resolve
// correctly. Emitting ESM .js under outDir is fine for node:test.
const res = spawnSync(
  "npx",
  ["tsc", "--module", "es2022", "--target", "es2022",
   "--moduleResolution", "bundler", "--outDir", out,
   "--skipLibCheck", "--strict", ...targets],
  { stdio: "inherit", shell: process.platform === "win32" },
);
if (res.status !== 0) process.exit(res.status ?? 1);
