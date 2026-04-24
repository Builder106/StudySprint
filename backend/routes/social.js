import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const SLUG_RE = /^[a-z0-9-]{3,50}$/;

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50);
}

// Profile lookup (public — no auth needed)
router.get("/profiles/:username", async (req, res) => {
  const { username } = req.params;
  const { rows } = await pool.query(
    `SELECT id, username, display_name, bio, is_public, created_at
     FROM users WHERE username = $1`,
    [username.toLowerCase()],
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "Profile not found" });
  if (!user.is_public) return res.status(404).json({ error: "Profile not found" });

  const [stats, recent] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(s.duration_minutes), 0)::int AS total_minutes,
              COUNT(s.id)::int AS total_sessions,
              COUNT(DISTINCT g.id)::int AS total_goals
       FROM study_goals g
       LEFT JOIN study_sessions s ON s.goal_id = g.id
       WHERE g.user_id = $1`,
      [user.id],
    ),
    pool.query(
      `SELECT s.duration_minutes, s.logged_at, g.title AS goal_title
       FROM study_sessions s
       JOIN study_goals g ON g.id = s.goal_id
       WHERE g.user_id = $1
       ORDER BY s.logged_at DESC
       LIMIT 8`,
      [user.id],
    ),
  ]);

  res.json({
    user: {
      username: user.username,
      display_name: user.display_name || user.username,
      bio: user.bio,
      joined_at: user.created_at,
    },
    stats: stats.rows[0],
    recent_sessions: recent.rows,
  });
});

// Everything else requires auth
router.use(requireAuth);

// Me — update own profile
router.put("/profiles/me", async (req, res) => {
  const { username, display_name, bio, is_public } = req.body ?? {};

  if (username !== undefined) {
    if (typeof username !== "string" || !USERNAME_RE.test(username.toLowerCase())) {
      return res
        .status(400)
        .json({ error: "Username must be 3-30 chars (lowercase letters, digits, underscore)" });
    }
    const normalized = username.toLowerCase();
    const { rows: taken } = await pool.query(
      `SELECT id FROM users WHERE username = $1 AND id <> $2`,
      [normalized, req.userId],
    );
    if (taken.length > 0) {
      return res.status(409).json({ error: "Username is taken" });
    }
  }

  const updates = [];
  const values = [];
  let idx = 1;
  if (username !== undefined) {
    updates.push(`username = $${idx++}`);
    values.push(username.toLowerCase());
  }
  if (display_name !== undefined) {
    updates.push(`display_name = $${idx++}`);
    values.push(display_name ? String(display_name).slice(0, 80) : null);
  }
  if (bio !== undefined) {
    updates.push(`bio = $${idx++}`);
    values.push(bio ? String(bio).slice(0, 500) : null);
  }
  if (is_public !== undefined) {
    updates.push(`is_public = $${idx++}`);
    values.push(Boolean(is_public));
  }
  if (updates.length === 0) return res.status(400).json({ error: "No updates provided" });

  values.push(req.userId);
  const { rows } = await pool.query(
    `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx}
     RETURNING id, email, username, display_name, bio, is_public`,
    values,
  );
  res.json({ user: rows[0] });
});

router.get("/profiles/me", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, email, username, display_name, bio, is_public
     FROM users WHERE id = $1`,
    [req.userId],
  );
  res.json({ user: rows[0] });
});

// Leaderboard — top public users by minutes logged in the last 7 days
router.get("/leaderboard", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.username, u.display_name,
            COALESCE(SUM(s.duration_minutes), 0)::int AS weekly_minutes
     FROM users u
     LEFT JOIN study_goals g ON g.user_id = u.id
     LEFT JOIN study_sessions s
       ON s.goal_id = g.id
      AND s.logged_at >= NOW() - INTERVAL '7 days'
     WHERE u.is_public = TRUE AND u.username IS NOT NULL
     GROUP BY u.id
     ORDER BY weekly_minutes DESC, u.username ASC
     LIMIT 25`,
  );
  res.json({ entries: rows });
});

// Rooms
router.get("/rooms", async (req, res) => {
  const { rows: mine } = await pool.query(
    `SELECT r.slug, r.name, r.description, r.created_at,
            (r.passcode_hash IS NOT NULL) AS has_passcode,
            (SELECT COUNT(*)::int FROM room_members WHERE room_id = r.id) AS member_count
     FROM study_rooms r
     JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $1
     ORDER BY r.created_at DESC`,
    [req.userId],
  );
  res.json({ rooms: mine });
});

router.post("/rooms", async (req, res) => {
  const { name, description, passcode } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length < 3) {
    return res.status(400).json({ error: "Name must be at least 3 characters" });
  }
  const trimmedName = name.trim().slice(0, 80);
  let slug = slugify(trimmedName);
  if (!SLUG_RE.test(slug)) {
    return res.status(400).json({ error: "Name must include letters or digits" });
  }
  const passcodeHash =
    typeof passcode === "string" && passcode.length > 0
      ? await bcrypt.hash(passcode, 10)
      : null;

  // Handle slug collisions by appending a short suffix
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let finalSlug = slug;
    let attempt = 0;
    while (attempt < 10) {
      const { rowCount } = await client.query(
        `SELECT 1 FROM study_rooms WHERE slug = $1`,
        [finalSlug],
      );
      if (rowCount === 0) break;
      attempt++;
      finalSlug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const { rows } = await client.query(
      `INSERT INTO study_rooms (slug, name, description, passcode_hash, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, slug`,
      [
        finalSlug,
        trimmedName,
        typeof description === "string" ? description.slice(0, 500) : null,
        passcodeHash,
        req.userId,
      ],
    );
    await client.query(
      `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)`,
      [rows[0].id, req.userId],
    );
    await client.query("COMMIT");
    res.status(201).json({ slug: rows[0].slug });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("create room error:", err);
    res.status(500).json({ error: "Failed to create room" });
  } finally {
    client.release();
  }
});

router.get("/rooms/:slug", async (req, res) => {
  const { slug } = req.params;
  const { rows: roomRows } = await pool.query(
    `SELECT r.id, r.slug, r.name, r.description, r.created_at,
            r.created_by, (r.passcode_hash IS NOT NULL) AS has_passcode
     FROM study_rooms r WHERE r.slug = $1`,
    [slug],
  );
  const room = roomRows[0];
  if (!room) return res.status(404).json({ error: "Room not found" });

  const { rowCount: isMember } = await pool.query(
    `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [room.id, req.userId],
  );
  if (!isMember) {
    return res.status(403).json({
      error: "You are not a member of this room. Join first.",
      has_passcode: room.has_passcode,
    });
  }

  const [membersRes, activityRes] = await Promise.all([
    pool.query(
      `SELECT u.username, u.display_name, u.is_public, rm.joined_at
       FROM room_members rm
       JOIN users u ON u.id = rm.user_id
       WHERE rm.room_id = $1
       ORDER BY rm.joined_at ASC`,
      [room.id],
    ),
    pool.query(
      `SELECT s.id, s.duration_minutes, s.logged_at,
              u.username, u.display_name, g.title AS goal_title
       FROM study_sessions s
       JOIN study_goals g ON g.id = s.goal_id
       JOIN users u ON u.id = g.user_id
       JOIN room_members rm ON rm.user_id = u.id AND rm.room_id = $1
       WHERE s.logged_at >= NOW() - INTERVAL '48 hours'
       ORDER BY s.logged_at DESC
       LIMIT 30`,
      [room.id],
    ),
  ]);

  res.json({
    room: {
      slug: room.slug,
      name: room.name,
      description: room.description,
      created_at: room.created_at,
      is_owner: room.created_by === req.userId,
      has_passcode: room.has_passcode,
    },
    members: membersRes.rows,
    recent_activity: activityRes.rows,
  });
});

router.post("/rooms/:slug/join", async (req, res) => {
  const { slug } = req.params;
  const { passcode } = req.body ?? {};
  const { rows } = await pool.query(
    `SELECT id, passcode_hash FROM study_rooms WHERE slug = $1`,
    [slug],
  );
  const room = rows[0];
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.passcode_hash) {
    if (typeof passcode !== "string" || !(await bcrypt.compare(passcode, room.passcode_hash))) {
      return res.status(401).json({ error: "Incorrect passcode" });
    }
  }
  await pool.query(
    `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [room.id, req.userId],
  );
  res.json({ ok: true });
});

router.post("/rooms/:slug/leave", async (req, res) => {
  const { slug } = req.params;
  const { rows } = await pool.query(
    `SELECT id, created_by FROM study_rooms WHERE slug = $1`,
    [slug],
  );
  const room = rows[0];
  if (!room) return res.status(404).json({ error: "Room not found" });
  await pool.query(
    `DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [room.id, req.userId],
  );
  // If the owner leaves and no one's left, delete the room
  const { rowCount } = await pool.query(
    `SELECT 1 FROM room_members WHERE room_id = $1 LIMIT 1`,
    [room.id],
  );
  if (rowCount === 0) {
    await pool.query(`DELETE FROM study_rooms WHERE id = $1`, [room.id]);
  }
  res.status(204).end();
});

export default router;
