// Edge Function: google-calendar
// Replaces backend/routes/integrations.js. Single function with sub-routes
// matching the original /api/integrations/google/* paths.
//
// verify_jwt is disabled because Google calls /callback directly with no
// Supabase JWT (auth context comes from the `state` param). Every other
// handler calls authedUser(req) and returns 401 if no valid JWT is present.
//
// URL shape: https://<project>.functions.supabase.co/google-calendar/<subpath>
//
// Required env vars (set via `supabase secrets set ...`):
//   GOOGLE_CLIENT_ID      — OAuth client ID
//   GOOGLE_CLIENT_SECRET  — OAuth client secret
//   GOOGLE_REDIRECT_URI   — must point at this function's /callback path
//   CLIENT_ORIGIN         — frontend origin (used for post-callback redirect)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//     (auto-injected by the Edge Function runtime under legacy names even on
//      projects using API Keys v2 — those names are fixed by the runtime)

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function authedUser(req: Request): Promise<{ userId: string; client: SupabaseClient } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  // Edge Function runtime auto-injects SUPABASE_URL + SUPABASE_ANON_KEY +
  // SUPABASE_SERVICE_ROLE_KEY under those legacy names regardless of whether
  // the project uses API Keys v2 (publishable / secret). Read what's injected.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !publishableKey) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");
  const client = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { userId: data.user.id, client };
}

function serviceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !secretKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  return createClient(supabaseUrl, secretKey);
}

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];
const STATE_TTL_MS = 10 * 60 * 1000;

function getOAuthEnv() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

interface GoogleTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
}

async function getUserTokens(userId: string): Promise<GoogleTokens | null> {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("user_google_tokens")
    .select("access_token, refresh_token, expiry_date, scope")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function upsertTokens(userId: string, tokens: GoogleTokens): Promise<void> {
  const svc = serviceClient();
  const existing = await getUserTokens(userId);
  // refresh_token only arrives on first consent and must not be overwritten
  // with NULL on later refreshes — coalesce against the existing row.
  const merged = {
    user_id: userId,
    access_token: tokens.access_token ?? existing?.access_token ?? null,
    refresh_token: tokens.refresh_token ?? existing?.refresh_token ?? null,
    expiry_date: tokens.expiry_date ?? existing?.expiry_date ?? null,
    scope: tokens.scope ?? existing?.scope ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await svc.from("user_google_tokens").upsert(merged, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

async function getValidAccessToken(userId: string): Promise<string | null> {
  const env = getOAuthEnv();
  if (!env) throw new Error("Google OAuth not configured");
  const tokens = await getUserTokens(userId);
  if (!tokens) return null;

  const now = Date.now();
  const expiresSoon = !tokens.expiry_date || tokens.expiry_date - now < 30_000;
  if (!expiresSoon && tokens.access_token) return tokens.access_token;
  if (!tokens.refresh_token) return tokens.access_token ?? null;

  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    console.error("token refresh failed:", res.status, await res.text());
    return null;
  }
  const fresh = await res.json();
  const newTokens: GoogleTokens = {
    access_token: fresh.access_token ?? null,
    expiry_date: fresh.expires_in ? now + fresh.expires_in * 1000 : null,
    scope: fresh.scope ?? null,
  };
  await upsertTokens(userId, newTokens);
  return newTokens.access_token ?? null;
}

async function gcalFetch(accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`https://www.googleapis.com/calendar/v3${path}`, { ...init, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const subpath = url.pathname.replace(/^\/google-calendar/, "") || "/";

  try {
    if (subpath === "/status" && req.method === "GET") return await handleStatus(req);
    if (subpath === "/auth-url" && req.method === "POST") return await handleAuthUrl(req);
    if (subpath === "/callback" && req.method === "GET") return await handleCallback(req);
    if (subpath === "/" && req.method === "DELETE") return await handleDisconnect(req);
    if (subpath.startsWith("/export-session/") && req.method === "POST") {
      const sessionId = subpath.slice("/export-session/".length);
      return await handleExportSession(req, sessionId);
    }
    if (subpath === "/import-event" && req.method === "POST") return await handleImportEvent(req);
    if (subpath === "/upcoming-events" && req.method === "GET") return await handleUpcomingEvents(req);
    return jsonResponse({ error: "Not found" }, 404);
  } catch (err) {
    console.error("google-calendar error:", err);
    return jsonResponse({ error: (err as Error).message ?? "Internal error" }, 500);
  }
});

async function handleStatus(req: Request): Promise<Response> {
  const auth = await authedUser(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);
  const env = getOAuthEnv();
  if (!env) return jsonResponse({ configured: false, connected: false });
  const tokens = await getUserTokens(auth.userId);
  return jsonResponse({
    configured: true,
    connected: !!(tokens?.refresh_token || tokens?.access_token),
  });
}

async function handleAuthUrl(req: Request): Promise<Response> {
  const auth = await authedUser(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);
  const env = getOAuthEnv();
  if (!env) return jsonResponse({ error: "Google OAuth not configured" }, 500);

  const svc = serviceClient();
  await svc.from("oauth_states").delete().lt("expires_at", new Date().toISOString());

  const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();
  const { error } = await svc.from("oauth_states").insert({ state, user_id: auth.userId, expires_at: expiresAt });
  if (error) return jsonResponse({ error: error.message }, 500);

  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return jsonResponse({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
}

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const env = getOAuthEnv();
  const frontend = (Deno.env.get("CLIENT_ORIGIN") ?? "http://localhost:5173").split(",")[0].trim();

  if (error) return Response.redirect(`${frontend}/dashboard?google=denied`, 302);
  if (!env || !code || !state) return new Response("Invalid callback", { status: 400 });

  const svc = serviceClient();
  const { data: stateRow, error: stateErr } = await svc
    .from("oauth_states")
    .select("user_id, expires_at")
    .eq("state", state)
    .maybeSingle();
  if (stateErr) return new Response("State lookup failed", { status: 500 });
  await svc.from("oauth_states").delete().eq("state", state);

  if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
    return new Response("State expired — please retry the connect flow.", { status: 400 });
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    console.error("token exchange failed:", tokenRes.status, await tokenRes.text());
    return Response.redirect(`${frontend}/dashboard?google=error`, 302);
  }
  const tokens = await tokenRes.json();
  await upsertTokens(stateRow.user_id, {
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? null,
    expiry_date: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
    scope: tokens.scope ?? null,
  });
  return Response.redirect(`${frontend}/dashboard?google=connected`, 302);
}

async function handleDisconnect(req: Request): Promise<Response> {
  const auth = await authedUser(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);

  const svc = serviceClient();
  await svc.from("user_google_tokens").delete().eq("user_id", auth.userId);
  const goalIds = (await svc.from("study_goals").select("id").eq("user_id", auth.userId)).data?.map((g) => g.id) ?? [];
  if (goalIds.length > 0) {
    await svc.from("study_sessions").update({ gcal_event_id: null }).in("goal_id", goalIds);
  }
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function handleExportSession(req: Request, sessionId: string): Promise<Response> {
  const auth = await authedUser(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);
  const result = await exportSessionToCalendar(auth.userId, sessionId, true);
  if ("error" in result) return jsonResponse({ error: result.error }, result.status);
  return jsonResponse(result);
}

async function handleImportEvent(req: Request): Promise<Response> {
  const auth = await authedUser(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);

  let body: { event_id?: unknown; goal_id?: unknown };
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }
  const eventId = typeof body.event_id === "string" ? body.event_id : "";
  const goalId = typeof body.goal_id === "string" ? body.goal_id : "";
  if (!eventId) return jsonResponse({ error: "event_id is required" }, 400);
  if (!goalId) return jsonResponse({ error: "goal_id is required" }, 400);

  const svc = serviceClient();
  const { data: ownGoal } = await svc
    .from("study_goals")
    .select("id")
    .eq("id", goalId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!ownGoal) return jsonResponse({ error: "Goal not found" }, 404);

  const { data: existing } = await svc
    .from("study_sessions")
    .select("id, study_goals!inner(user_id)")
    .eq("gcal_event_id", eventId)
    .eq("study_goals.user_id", auth.userId)
    .maybeSingle();
  if (existing) return jsonResponse({ error: "Already imported" }, 409);

  const accessToken = await getValidAccessToken(auth.userId);
  if (!accessToken) return jsonResponse({ error: "Google Calendar is not connected" }, 400);

  const eventRes = await gcalFetch(accessToken, `/calendars/primary/events/${encodeURIComponent(eventId)}`);
  if (!eventRes.ok) {
    console.error("calendar.events.get failed:", eventRes.status);
    return jsonResponse({ error: "Failed to fetch event from Google" }, 502);
  }
  const event = await eventRes.json();
  if (!event.start?.dateTime || !event.end?.dateTime) return jsonResponse({ error: "Can't import all-day events" }, 400);
  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return jsonResponse({ error: "Event has no duration" }, 400);
  const summary = event.summary || "(Untitled)";
  const { data: inserted, error: insertErr } = await svc
    .from("study_sessions")
    .insert({
      goal_id: goalId,
      duration_minutes: durationMinutes,
      notes: `Imported from Google Calendar: ${summary}`,
      logged_at: start.toISOString(),
      gcal_event_id: eventId,
    })
    .select()
    .single();
  if (insertErr) return jsonResponse({ error: insertErr.message }, 500);
  return jsonResponse({ session: inserted }, 201);
}

async function handleUpcomingEvents(req: Request): Promise<Response> {
  const auth = await authedUser(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);
  const accessToken = await getValidAccessToken(auth.userId);
  if (!accessToken) return jsonResponse({ error: "Google Calendar is not connected" }, 400);

  const url = new URL(req.url);
  const now = Date.now();
  const fromIso = url.searchParams.get("from") ?? new Date(now).toISOString();
  const toIso = url.searchParams.get("to") ?? new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    timeMin: fromIso,
    timeMax: toIso,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  const eventsRes = await gcalFetch(accessToken, `/calendars/primary/events?${params.toString()}`);
  if (!eventsRes.ok) {
    console.error("calendar.events.list failed:", eventsRes.status);
    return jsonResponse({ error: "Failed to fetch calendar events" }, 502);
  }
  const data = await eventsRes.json();
  const items: Array<{
    id?: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    htmlLink?: string;
  }> = Array.isArray(data.items) ? data.items : [];
  const eventIds = items.map((e) => e.id).filter((id): id is string => !!id);

  const svc = serviceClient();
  let importedByEventId = new Map<string, { session_id: string; goal_id: string; goal_title: string }>();
  if (eventIds.length > 0) {
    const { data: imported } = await svc
      .from("study_sessions")
      .select("id, gcal_event_id, study_goals!inner(id, user_id, title)")
      .in("gcal_event_id", eventIds)
      .eq("study_goals.user_id", auth.userId);
    importedByEventId = new Map(
      (imported ?? []).map((row) => {
        const goal = row.study_goals as unknown as { id: string; title: string };
        return [row.gcal_event_id as string, { session_id: row.id as string, goal_id: goal.id, goal_title: goal.title }];
      }),
    );
  }

  const events = items.map((e) => ({
    id: e.id ?? "",
    summary: e.summary ?? "(Untitled)",
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    all_day: !e.start?.dateTime,
    html_link: e.htmlLink ?? "",
    imported: e.id ? (importedByEventId.get(e.id) ?? null) : null,
  }));
  return jsonResponse({ events });
}

interface ExportSuccess { event_id: string; html_link: string }
interface ExportError { error: string; status: number }

async function exportSessionToCalendar(
  userId: string,
  sessionId: string,
  recreateOnMissing: boolean,
): Promise<ExportSuccess | ExportError> {
  const svc = serviceClient();
  const { data: row } = await svc
    .from("study_sessions")
    .select("id, goal_id, duration_minutes, notes, logged_at, gcal_event_id, study_goals!inner(title, user_id)")
    .eq("id", sessionId)
    .single();
  if (!row || (row.study_goals as unknown as { user_id: string }).user_id !== userId) {
    return { error: "Session not found", status: 404 };
  }

  const goal = row.study_goals as unknown as { title: string };
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return { error: "Google Calendar is not connected", status: 400 };

  const start = new Date(row.logged_at as string);
  const end = new Date(start.getTime() + (row.duration_minutes as number) * 60_000);
  const eventBody = {
    summary: `StudySprint — ${goal.title}`,
    description: row.notes || `Logged study session for "${goal.title}"`,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    source: { title: "StudySprint", url: Deno.env.get("CLIENT_ORIGIN") ?? "" },
  };

  if (row.gcal_event_id) {
    let alive = true;
    const checkRes = await gcalFetch(accessToken, `/calendars/primary/events/${encodeURIComponent(row.gcal_event_id as string)}`);
    if (!checkRes.ok) alive = false;
    else {
      const existing = await checkRes.json();
      if (existing.status === "cancelled") alive = false;
    }

    if (alive) {
      const updateRes = await gcalFetch(
        accessToken,
        `/calendars/primary/events/${encodeURIComponent(row.gcal_event_id as string)}`,
        { method: "PUT", body: JSON.stringify(eventBody) },
      );
      if (!updateRes.ok) {
        console.error("calendar.events.update failed:", updateRes.status);
        return { error: "Failed to update calendar event", status: 502 };
      }
      const data = await updateRes.json();
      return { event_id: data.id, html_link: data.htmlLink };
    }

    await svc.from("study_sessions").update({ gcal_event_id: null }).eq("id", sessionId);
    if (!recreateOnMissing) return { error: "Stale event id cleared", status: 200 };
  }

  const insertRes = await gcalFetch(accessToken, `/calendars/primary/events`, {
    method: "POST",
    body: JSON.stringify(eventBody),
  });
  if (!insertRes.ok) {
    console.error("calendar.events.insert failed:", insertRes.status);
    return { error: "Failed to create calendar event", status: 502 };
  }
  const data = await insertRes.json();
  await svc.from("study_sessions").update({ gcal_event_id: data.id }).eq("id", sessionId);
  return { event_id: data.id, html_link: data.htmlLink };
}
