import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/summary", async (req, res) => {
  const userId = req.userId;

  // Daily minutes for the last 365 days
  const { rows: daily } = await pool.query(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
            COALESCE(SUM(s.duration_minutes), 0)::int AS minutes
     FROM generate_series(
       (CURRENT_DATE - INTERVAL '364 days')::date,
       CURRENT_DATE::date,
       '1 day'
     ) AS d(day)
     LEFT JOIN study_sessions s
       ON s.goal_id IN (SELECT id FROM study_goals WHERE user_id = $1)
      AND (s.logged_at AT TIME ZONE 'UTC')::date = d.day
     GROUP BY d.day
     ORDER BY d.day`,
    [userId],
  );

  // Hour-of-day distribution
  const { rows: hourly } = await pool.query(
    `SELECT EXTRACT(HOUR FROM s.logged_at AT TIME ZONE 'UTC')::int AS hour,
            COALESCE(SUM(s.duration_minutes), 0)::int AS minutes
     FROM study_sessions s
     JOIN study_goals g ON g.id = s.goal_id
     WHERE g.user_id = $1
     GROUP BY hour
     ORDER BY hour`,
    [userId],
  );

  // Day-of-week distribution (0=Sunday)
  const { rows: weekday } = await pool.query(
    `SELECT EXTRACT(DOW FROM s.logged_at AT TIME ZONE 'UTC')::int AS dow,
            COALESCE(SUM(s.duration_minutes), 0)::int AS minutes
     FROM study_sessions s
     JOIN study_goals g ON g.id = s.goal_id
     WHERE g.user_id = $1
     GROUP BY dow
     ORDER BY dow`,
    [userId],
  );

  // Subject distribution
  const { rows: bySubject } = await pool.query(
    `SELECT sub.name AS subject,
            COALESCE(SUM(s.duration_minutes), 0)::int AS minutes
     FROM study_sessions s
     JOIN study_goals g ON g.id = s.goal_id
     JOIN goal_subjects gs ON gs.goal_id = g.id
     JOIN subjects sub ON sub.id = gs.subject_id
     WHERE g.user_id = $1
     GROUP BY sub.name
     ORDER BY minutes DESC`,
    [userId],
  );

  // Totals + streaks
  const totalMinutes = daily.reduce((acc, row) => acc + row.minutes, 0);

  // Current streak: consecutive days ending today (or yesterday) with > 0 minutes
  let currentStreak = 0;
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i].minutes > 0) currentStreak++;
    else break;
  }

  // Longest streak across the 365 window
  let longestStreak = 0;
  let run = 0;
  for (const row of daily) {
    if (row.minutes > 0) {
      run++;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
  }

  res.json({
    daily,
    hourly,
    weekday,
    by_subject: bySubject,
    totals: {
      minutes: totalMinutes,
      sessions_last_365: daily.filter((d) => d.minutes > 0).length,
      current_streak_days: currentStreak,
      longest_streak_days: longestStreak,
    },
  });
});

export default router;
