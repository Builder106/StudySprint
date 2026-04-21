import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const VALID_STATUSES = new Set(["Active", "Paused", "Completed"]);

async function loadGoal(goalId, userId) {
  const { rows } = await pool.query(
    `SELECT
       g.id, g.user_id, g.title, g.description, g.target_hours, g.status,
       g.target_date, g.created_at, g.updated_at,
       COALESCE(SUM(s.duration_minutes), 0)::int AS logged_minutes,
       COALESCE(
         ARRAY_AGG(DISTINCT sub.name) FILTER (WHERE sub.name IS NOT NULL),
         '{}'
       ) AS subjects
     FROM study_goals g
     LEFT JOIN study_sessions s ON s.goal_id = g.id
     LEFT JOIN goal_subjects gs ON gs.goal_id = g.id
     LEFT JOIN subjects sub ON sub.id = gs.subject_id
     WHERE g.id = $1 AND g.user_id = $2
     GROUP BY g.id`,
    [goalId, userId],
  );
  return rows[0] ?? null;
}

router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       g.id, g.title, g.description, g.target_hours, g.status,
       g.target_date, g.created_at, g.updated_at,
       COALESCE(SUM(s.duration_minutes), 0)::int AS logged_minutes,
       COALESCE(
         ARRAY_AGG(DISTINCT sub.name) FILTER (WHERE sub.name IS NOT NULL),
         '{}'
       ) AS subjects
     FROM study_goals g
     LEFT JOIN study_sessions s ON s.goal_id = g.id
     LEFT JOIN goal_subjects gs ON gs.goal_id = g.id
     LEFT JOIN subjects sub ON sub.id = gs.subject_id
     WHERE g.user_id = $1
     GROUP BY g.id
     ORDER BY g.created_at DESC`,
    [req.userId],
  );
  res.json({ goals: rows });
});

router.post("/", async (req, res) => {
  const { title, description, target_hours, status, target_date, subjects } = req.body ?? {};
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "Title is required" });
  }
  const hours = Number(target_hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return res.status(400).json({ error: "target_hours must be greater than 0" });
  }
  const goalStatus = status && VALID_STATUSES.has(status) ? status : "Active";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO study_goals (user_id, title, description, target_hours, status, target_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [req.userId, title, description ?? null, hours, goalStatus, target_date ?? null],
    );
    const goalId = rows[0].id;

    if (Array.isArray(subjects)) {
      for (const name of subjects) {
        if (typeof name !== "string" || !name.trim()) continue;
        const trimmed = name.trim();
        await client.query(
          "INSERT INTO subjects (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
          [trimmed],
        );
        await client.query(
          `INSERT INTO goal_subjects (goal_id, subject_id)
           SELECT $1, id FROM subjects WHERE name = $2
           ON CONFLICT DO NOTHING`,
          [goalId, trimmed],
        );
      }
    }
    await client.query("COMMIT");
    const goal = await loadGoal(goalId, req.userId);
    res.status(201).json({ goal });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("create goal error:", err);
    res.status(500).json({ error: "Failed to create goal" });
  } finally {
    client.release();
  }
});

router.get("/:id", async (req, res) => {
  const goal = await loadGoal(Number(req.params.id), req.userId);
  if (!goal) return res.status(404).json({ error: "Goal not found" });
  res.json({ goal });
});

router.put("/:id", async (req, res) => {
  const goalId = Number(req.params.id);
  const existing = await loadGoal(goalId, req.userId);
  if (!existing) return res.status(404).json({ error: "Goal not found" });

  const { title, description, target_hours, status, target_date, subjects } = req.body ?? {};

  const updates = [];
  const values = [];
  let idx = 1;
  const push = (col, val) => {
    updates.push(`${col} = $${idx++}`);
    values.push(val);
  };

  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Title cannot be empty" });
    }
    push("title", title);
  }
  if (description !== undefined) push("description", description);
  if (target_hours !== undefined) {
    const hours = Number(target_hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      return res.status(400).json({ error: "target_hours must be greater than 0" });
    }
    push("target_hours", hours);
  }
  if (status !== undefined) {
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    push("status", status);
  }
  if (target_date !== undefined) push("target_date", target_date);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(goalId, req.userId);
      await client.query(
        `UPDATE study_goals SET ${updates.join(", ")} WHERE id = $${idx++} AND user_id = $${idx}`,
        values,
      );
    }

    if (Array.isArray(subjects)) {
      await client.query("DELETE FROM goal_subjects WHERE goal_id = $1", [goalId]);
      for (const name of subjects) {
        if (typeof name !== "string" || !name.trim()) continue;
        const trimmed = name.trim();
        await client.query(
          "INSERT INTO subjects (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
          [trimmed],
        );
        await client.query(
          `INSERT INTO goal_subjects (goal_id, subject_id)
           SELECT $1, id FROM subjects WHERE name = $2
           ON CONFLICT DO NOTHING`,
          [goalId, trimmed],
        );
      }
    }

    await client.query("COMMIT");
    const goal = await loadGoal(goalId, req.userId);
    res.json({ goal });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("update goal error:", err);
    res.status(500).json({ error: "Failed to update goal" });
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res) => {
  const goalId = Number(req.params.id);
  const { rowCount } = await pool.query(
    "DELETE FROM study_goals WHERE id = $1 AND user_id = $2",
    [goalId, req.userId],
  );
  if (rowCount === 0) return res.status(404).json({ error: "Goal not found" });
  res.status(204).end();
});

export default router;
