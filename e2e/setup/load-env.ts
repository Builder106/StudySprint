// Shared .env loader used by both playwright configs.
//
// Imported for side effects: reads ./.env (relative to the repo root) at
// module load time and seeds anything not already in process.env. CI
// overrides via real env vars take precedence — existing process.env wins.
//
// fileURLToPath handles paths with spaces / parens (e.g. macOS Drive
// folders like "My Drive (user@x.edu)") that .pathname leaves percent-
// encoded — existsSync would otherwise miss the file silently.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
