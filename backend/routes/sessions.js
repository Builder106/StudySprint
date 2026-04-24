import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function assertGoalOwnership(goalId, userId) {
  const { rows } = await pool.query(
    "SELECT id FROM study_goals WHERE id = $1 AND user_id = $2",
    [goalId, userId],
  );
  return rows.length > 0;
}

const QUALITY_REVIEW_DAYS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14 };

function nextReviewFromQuality(quality, baseDate = new Date()) {
  const days = QUALITY_REVIEW_DAYS[quality];
  if (!days) return null;
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

router.get("/goals/:goalId/sessions", async (req, res) => {
  const goalId = Number(req.params.goalId);
  if (!(await assertGoalOwnership(goalId, req.userId))) {
    return res.status(404).json({ error: "Goal not found" });
  }
  const { rows } = await pool.query(
    `SELECT id, goal_id, duration_minutes, notes, logged_at, quality, next_review_at, gcal_event_id
     FROM study_sessions
     WHERE goal_id = $1
     ORDER BY logged_at DESC`,
    [goalId],
  );
  res.json({ sessions: rows });
});

router.post("/goals/:goalId/sessions", async (req, res) => {
  const goalId = Number(req.params.goalId);
  if (!(await assertGoalOwnership(goalId, req.userId))) {
    return res.status(404).json({ error: "Goal not found" });
  }
  const { duration_minutes, notes, logged_at, quality } = req.body ?? {};
  const mins = Number(duration_minutes);
  if (!Number.isFinite(mins) || mins <= 0) {
    return res.status(400).json({ error: "duration_minutes must be greater than 0" });
  }
  let qualityValue = null;
  if (quality !== undefined && quality !== null && quality !== "") {
    const q = Number(quality);
    if (!Number.isInteger(q) || q < 1 || q > 5) {
      return res.status(400).json({ error: "quality must be an integer 1-5" });
    }
    qualityValue = q;
  }
  const reviewAt = qualityValue ? nextReviewFromQuality(qualityValue) : null;
  const { rows } = await pool.query(
    `INSERT INTO study_sessions (goal_id, duration_minutes, notes, logged_at, quality, next_review_at)
     VALUES ($1, $2, $3, COALESCE($4, NOW()), $5, $6)
     RETURNING id, goal_id, duration_minutes, notes, logged_at, quality, next_review_at, gcal_event_id`,
    [goalId, Math.round(mins), notes ?? null, logged_at ?? null, qualityValue, reviewAt],
  );
  res.status(201).json({ session: rows[0] });
});

router.put("/sessions/:id", async (req, res) => {
  const sessionId = Number(req.params.id);
  const { duration_minutes, notes, quality } = req.body ?? {};

  const { rows: owned } = await pool.query(
    `SELECT s.id FROM study_sessions s
     JOIN study_goals g ON g.id = s.goal_id
     WHERE s.id = $1 AND g.user_id = $2`,
    [sessionId, req.userId],
  );
  if (owned.length === 0) return res.status(404).json({ error: "Session not found" });

  const updates = [];
  const values = [];
  let idx = 1;
  if (duration_minutes !== undefined) {
    const mins = Number(duration_minutes);
    if (!Number.isFinite(mins) || mins <= 0) {
      return res.status(400).json({ error: "duration_minutes must be greater than 0" });
    }
    updates.push(`duration_minutes = $${idx++}`);
    values.push(Math.round(mins));
  }
  if (notes !== undefined) {
    updates.push(`notes = $${idx++}`);
    values.push(notes);
  }
  if (quality !== undefined) {
    if (quality === null || quality === "") {
      updates.push(`quality = NULL`);
      updates.push(`next_review_at = NULL`);
    } else {
      const q = Number(quality);
      if (!Number.isInteger(q) || q < 1 || q > 5) {
        return res.status(400).json({ error: "quality must be an integer 1-5" });
      }
      updates.push(`quality = $${idx++}`);
      values.push(q);
      updates.push(`next_review_at = $${idx++}`);
      values.push(nextReviewFromQuality(q));
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: "No updates provided" });

  values.push(sessionId);
  const { rows } = await pool.query(
    `UPDATE study_sessions SET ${updates.join(", ")}
     WHERE id = $${idx}
     RETURNING id, goal_id, duration_minutes, notes, logged_at, quality, next_review_at, gcal_event_id`,
    values,
  );
  res.json({ session: rows[0] });
});

router.delete("/sessions/:id", async (req, res) => {
  const sessionId = Number(req.params.id);
  const { rowCount } = await pool.query(
    `DELETE FROM study_sessions s
     USING study_goals g
     WHERE s.goal_id = g.id AND s.id = $1 AND g.user_id = $2`,
    [sessionId, req.userId],
  );
  if (rowCount === 0) return res.status(404).json({ error: "Session not found" });
  res.status(204).end();
});

export default router;
