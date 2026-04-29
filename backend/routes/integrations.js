import { Router } from "express";
import crypto from "node:crypto";
import { google } from "googleapis";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

// Ephemeral state store: state -> { userId, expiresAt }.
// In-memory is fine for a single-server deployment; for multi-instance,
// move this to Redis or a short-lived DB row.
const oauthStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function reapStates() {
  const now = Date.now();
  for (const [key, value] of oauthStates) {
    if (value.expiresAt < now) oauthStates.delete(key);
  }
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function getUserTokens(userId) {
  const { rows } = await pool.query(
    `SELECT access_token, refresh_token, expiry_date, scope
     FROM user_google_tokens WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function upsertTokens(userId, tokens) {
  await pool.query(
    `INSERT INTO user_google_tokens (user_id, access_token, refresh_token, expiry_date, scope, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = COALESCE(EXCLUDED.access_token, user_google_tokens.access_token),
       refresh_token = COALESCE(EXCLUDED.refresh_token, user_google_tokens.refresh_token),
       expiry_date = COALESCE(EXCLUDED.expiry_date, user_google_tokens.expiry_date),
       scope = COALESCE(EXCLUDED.scope, user_google_tokens.scope),
       updated_at = NOW()`,
    [
      userId,
      tokens.access_token ?? null,
      tokens.refresh_token ?? null,
      tokens.expiry_date ?? null,
      tokens.scope ?? null,
    ],
  );
}

async function authorizedClient(userId) {
  const client = getOAuthClient();
  if (!client) throw new Error("Google OAuth not configured");
  const tokens = await getUserTokens(userId);
  if (!tokens) return null;
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    scope: tokens.scope,
  });
  client.on("tokens", (newTokens) => {
    upsertTokens(userId, newTokens).catch((err) =>
      console.error("failed to persist refreshed google tokens:", err),
    );
  });
  return client;
}

// GET /api/integrations/google/status — whether this user has a live connection
router.get("/google/status", requireAuth, async (req, res) => {
  const client = getOAuthClient();
  if (!client) {
    return res.json({ configured: false, connected: false });
  }
  const tokens = await getUserTokens(req.userId);
  res.json({ configured: true, connected: !!tokens?.refresh_token || !!tokens?.access_token });
});

// POST /api/integrations/google/auth-url — generate an authorization URL
router.post("/google/auth-url", requireAuth, async (req, res) => {
  const client = getOAuthClient();
  if (!client) return res.status(500).json({ error: "Google OAuth not configured" });

  reapStates();
  const state = crypto.randomBytes(24).toString("hex");
  oauthStates.set(state, {
    userId: req.userId,
    expiresAt: Date.now() + STATE_TTL_MS,
  });

  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
  res.json({ url });
});

// GET /api/integrations/google/callback — handle redirect from Google
router.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const client = getOAuthClient();
  const frontend = process.env.CLIENT_ORIGIN?.split(",")[0]?.trim() || "http://localhost:5173";

  if (error) {
    return res.redirect(`${frontend}/dashboard?google=denied`);
  }

  if (!client || typeof code !== "string" || typeof state !== "string") {
    return res.status(400).send("Invalid callback");
  }

  const entry = oauthStates.get(state);
  oauthStates.delete(state);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(400).send("State expired — please retry the connect flow.");
  }

  try {
    const { tokens } = await client.getToken(code);
    await upsertTokens(entry.userId, tokens);
    res.redirect(`${frontend}/dashboard?google=connected`);
  } catch (err) {
    console.error("google token exchange failed:", err);
    res.redirect(`${frontend}/dashboard?google=error`);
  }
});

// DELETE /api/integrations/google — disconnect
router.delete("/google", requireAuth, async (req, res) => {
  await pool.query(`DELETE FROM user_google_tokens WHERE user_id = $1`, [req.userId]);
  await pool.query(
    `UPDATE study_sessions SET gcal_event_id = NULL
     WHERE goal_id IN (SELECT id FROM study_goals WHERE user_id = $1)`,
    [req.userId],
  );
  res.status(204).end();
});

async function exportSessionToCalendar(userId, sessionId, { recreateOnMissing = true } = {}) {
  const { rows } = await pool.query(
    `SELECT s.id, s.goal_id, s.duration_minutes, s.notes, s.logged_at,
            s.gcal_event_id, g.title
     FROM study_sessions s
     JOIN study_goals g ON g.id = s.goal_id
     WHERE s.id = $1 AND g.user_id = $2`,
    [sessionId, userId],
  );
  const session = rows[0];
  if (!session) {
    const err = new Error("Session not found");
    err.status = 404;
    throw err;
  }

  const client = await authorizedClient(userId);
  if (!client) {
    const err = new Error("Google Calendar is not connected");
    err.status = 400;
    throw err;
  }

  const calendar = google.calendar({ version: "v3", auth: client });
  const start = new Date(session.logged_at);
  const end = new Date(start.getTime() + session.duration_minutes * 60 * 1000);
  const eventBody = {
    summary: `StudySprint — ${session.title}`,
    description: session.notes || `Logged study session for "${session.title}"`,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    source: { title: "StudySprint", url: process.env.CLIENT_ORIGIN || "" },
  };

  // If we already have a Calendar event id, check whether it still exists.
  // Google's events.update silently restores soft-deleted events, so we must
  // not blindly call update on a stale id.
  if (session.gcal_event_id) {
    let alive = true;
    try {
      const { data: existing } = await calendar.events.get({
        calendarId: "primary",
        eventId: session.gcal_event_id,
      });
      if (existing.status === "cancelled") alive = false;
    } catch {
      alive = false;
    }

    if (alive) {
      try {
        const { data } = await calendar.events.update({
          calendarId: "primary",
          eventId: session.gcal_event_id,
          requestBody: eventBody,
        });
        return { event_id: data.id, html_link: data.htmlLink };
      } catch (err) {
        console.error("google calendar update failed for session", sessionId, err.message);
        const e = new Error("Failed to update calendar event");
        e.status = 502;
        throw e;
      }
    }

    // Event was deleted from Calendar — drop the local link
    await pool.query(
      `UPDATE study_sessions SET gcal_event_id = NULL WHERE id = $1`,
      [sessionId],
    );
    if (!recreateOnMissing) return null;
    // fall through to insert a fresh event
  }

  try {
    const { data } = await calendar.events.insert({
      calendarId: "primary",
      requestBody: eventBody,
    });
    await pool.query(
      `UPDATE study_sessions SET gcal_event_id = $1 WHERE id = $2`,
      [data.id, sessionId],
    );
    return { event_id: data.id, html_link: data.htmlLink };
  } catch (err) {
    console.error("google calendar insert failed for session", sessionId, err.message);
    const e = new Error("Failed to create calendar event");
    e.status = 502;
    throw e;
  }
}

// Best-effort wrapper for session-edit re-sync — does NOT resurrect deleted events
export async function tryExportSession(userId, sessionId) {
  try {
    return await exportSessionToCalendar(userId, sessionId, { recreateOnMissing: false });
  } catch {
    return null;
  }
}

// POST /api/integrations/google/export-session/:id — push one session to Calendar
router.post("/google/export-session/:id", requireAuth, async (req, res) => {
  try {
    const result = await exportSessionToCalendar(req.userId, Number(req.params.id));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/integrations/google/import-event — convert a Calendar event to a study session
router.post("/google/import-event", requireAuth, async (req, res) => {
  const { event_id, goal_id } = req.body ?? {};
  if (typeof event_id !== "string" || !event_id) {
    return res.status(400).json({ error: "event_id is required" });
  }
  const goalId = Number(goal_id);
  if (!Number.isInteger(goalId) || goalId <= 0) {
    return res.status(400).json({ error: "goal_id is required" });
  }

  const { rows: ownership } = await pool.query(
    `SELECT 1 FROM study_goals WHERE id = $1 AND user_id = $2`,
    [goalId, req.userId],
  );
  if (ownership.length === 0) {
    return res.status(404).json({ error: "Goal not found" });
  }

  const { rows: existing } = await pool.query(
    `SELECT s.id FROM study_sessions s
     JOIN study_goals g ON g.id = s.goal_id
     WHERE s.gcal_event_id = $1 AND g.user_id = $2`,
    [event_id, req.userId],
  );
  if (existing.length > 0) {
    return res.status(409).json({ error: "Already imported" });
  }

  let client;
  try {
    client = await authorizedClient(req.userId);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  if (!client) return res.status(400).json({ error: "Google Calendar is not connected" });

  const calendar = google.calendar({ version: "v3", auth: client });
  let event;
  try {
    const { data } = await calendar.events.get({ calendarId: "primary", eventId: event_id });
    event = data;
  } catch (err) {
    console.error("calendar.events.get failed:", err.message);
    return res.status(502).json({ error: "Failed to fetch event from Google" });
  }

  if (!event.start?.dateTime || !event.end?.dateTime) {
    return res.status(400).json({ error: "Can't import all-day events" });
  }
  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return res.status(400).json({ error: "Event has no duration" });
  }

  const summary = event.summary || "(Untitled)";
  const { rows } = await pool.query(
    `INSERT INTO study_sessions (goal_id, duration_minutes, notes, logged_at, gcal_event_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, goal_id, duration_minutes, notes, logged_at, quality, next_review_at, gcal_event_id`,
    [
      goalId,
      durationMinutes,
      `Imported from Google Calendar: ${summary}`,
      start.toISOString(),
      event_id,
    ],
  );
  res.status(201).json({ session: rows[0] });
});

// GET /api/integrations/google/upcoming-events — read events from primary calendar
router.get("/google/upcoming-events", requireAuth, async (req, res) => {
  let client;
  try {
    client = await authorizedClient(req.userId);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  if (!client) return res.status(400).json({ error: "Google Calendar is not connected" });

  const now = Date.now();
  const fromIso = typeof req.query.from === "string" ? req.query.from : new Date(now).toISOString();
  const toIso =
    typeof req.query.to === "string"
      ? req.query.to
      : new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();

  const calendar = google.calendar({ version: "v3", auth: client });

  try {
    const { data } = await calendar.events.list({
      calendarId: "primary",
      timeMin: fromIso,
      timeMax: toIso,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });
    const items = data.items || [];
    const eventIds = items.map((e) => e.id).filter(Boolean);

    let importedByEventId = new Map();
    if (eventIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT s.id AS session_id, s.gcal_event_id, g.id AS goal_id, g.title AS goal_title
         FROM study_sessions s
         JOIN study_goals g ON g.id = s.goal_id
         WHERE g.user_id = $1 AND s.gcal_event_id = ANY($2)`,
        [req.userId, eventIds],
      );
      importedByEventId = new Map(rows.map((r) => [r.gcal_event_id, r]));
    }

    res.json({
      events: items.map((e) => {
        const imported = importedByEventId.get(e.id);
        return {
          id: e.id,
          summary: e.summary || "(Untitled)",
          start: e.start?.dateTime || e.start?.date || null,
          end: e.end?.dateTime || e.end?.date || null,
          all_day: !e.start?.dateTime,
          html_link: e.htmlLink,
          imported: imported
            ? {
                session_id: imported.session_id,
                goal_id: imported.goal_id,
                goal_title: imported.goal_title,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    console.error("google calendar events.list failed:", err.message);
    res.status(502).json({ error: "Failed to fetch calendar events" });
  }
});

export default router;
