import type { Page } from "@playwright/test";

// Test-only helpers for talking to Supabase from inside step definitions.
// Setup steps (e.g. "I have a goal titled X") create rows directly via the
// REST API using the logged-in user's JWT instead of going through the UI,
// so scenarios don't double as fixture-creation tests.
//
// Resolution order for env values: explicit env var (set by CI), then
// VITE_-prefixed (so a developer running tests locally with .env loaded
// gets them automatically). If neither is set, we surface a loud error
// instead of falling back to localhost.

export function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "e2e: SUPABASE_URL (or VITE_SUPABASE_URL) is not set. " +
        "Source your .env or pass them as env vars before running tests.",
    );
  }
  return url.replace(/\/$/, "");
}

export function supabasePublishableKey(): string {
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error(
      "e2e: SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) is not set.",
    );
  }
  return key;
}

// Supabase JS persists the session under `sb-<project-ref>-auth-token` as a
// JSON blob containing access_token / refresh_token / user. The project ref
// is the leftmost subdomain of VITE_SUPABASE_URL.
function projectRef(): string {
  const url = supabaseUrl();
  const match = url.match(/^https?:\/\/([^.]+)\./);
  if (!match) throw new Error(`Cannot extract project ref from ${url}`);
  return match[1];
}

export async function getAccessToken(page: Page): Promise<string | null> {
  const ref = projectRef();
  const raw = await page.evaluate((key) => localStorage.getItem(key), `sb-${ref}-auth-token`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.access_token ?? null;
  } catch {
    return null;
  }
}

export async function getUserId(page: Page): Promise<string> {
  const ref = projectRef();
  const raw = await page.evaluate((key) => localStorage.getItem(key), `sb-${ref}-auth-token`);
  if (!raw) throw new Error("e2e: no Supabase session in localStorage");
  const parsed = JSON.parse(raw);
  const id = parsed.user?.id;
  if (!id) throw new Error("e2e: Supabase session has no user.id");
  return id;
}

export interface RestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Adds Prefer: return=representation so the response body has the row(s). */
  returnRow?: boolean;
}

export async function rest<T = unknown>(
  page: Page,
  path: string,
  options: RestOptions = {},
): Promise<T> {
  const token = await getAccessToken(page);
  if (!token) throw new Error("e2e: no Supabase session in localStorage");

  const headers: Record<string, string> = {
    apikey: supabasePublishableKey(),
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (options.returnRow) headers.Prefer = "return=representation";

  const res = await page.request.fetch(`${supabaseUrl()}/rest/v1${path}`, {
    method: options.method ?? "GET",
    headers,
    data: options.body ? JSON.stringify(options.body) : undefined,
    failOnStatusCode: false,
  });

  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`e2e: Supabase REST ${options.method ?? "GET"} ${path} → ${res.status()} ${text}`);
  }

  if (res.status() === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function rpc<T = unknown>(
  page: Page,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return rest<T>(page, `/rpc/${fn}`, { method: "POST", body: args });
}
