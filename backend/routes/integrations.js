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

// POST /api/integrations/google/export-session/:id — push one session to Calendar
router.post("/google/export-session/:id", requireAuth, async (req, res) => {
  const sessionId = Number(req.params.id);
  const { rows } = await pool.query(
    `SELECT s.id, s.goal_id, s.duration_minutes, s.notes, s.logged_at,
            s.gcal_event_id, g.title, g.user_id
     FROM study_sessions s
     JOIN study_goals g ON g.id = s.goal_id
     WHERE s.id = $1 AND g.user_id = $2`,
    [sessionId, req.userId],
  );
  const session = rows[0];
  if (!session) return res.status(404).json({ error: "Session not found" });

  let client;
  try {
    client = await authorizedClient(req.userId);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  if (!client) return res.status(400).json({ error: "Google Calendar is not connected" });

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

  try {
    if (session.gcal_event_id) {
      const { data } = await calendar.events.update({
        calendarId: "primary",
        eventId: session.gcal_event_id,
        requestBody: eventBody,
      });
      return res.json({ event_id: data.id, html_link: data.htmlLink });
    }
    const { data } = await calendar.events.insert({
      calendarId: "primary",
      requestBody: eventBody,
    });
    await pool.query(
      `UPDATE study_sessions SET gcal_event_id = $1 WHERE id = $2`,
      [data.id, sessionId],
    );
    res.json({ event_id: data.id, html_link: data.htmlLink });
  } catch (err) {
    console.error("google calendar insert failed:", err);
    res.status(502).json({ error: "Failed to create calendar event" });
  }
});

export default router;
