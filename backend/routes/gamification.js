import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// XP curve: level L requires 100 * L^2 total XP.
// Level 1 = 100 XP, Level 2 = 400 XP, Level 3 = 900 XP, ...
function levelFromXp(xp) {
  return Math.max(0, Math.floor(Math.sqrt(xp / 100)));
}
function xpForLevel(level) {
  return 100 * level * level;
}

// Visual pet/plant stages keyed to level
const PET_STAGES = [
  { level: 0, key: "seed" },
  { level: 1, key: "sprout" },
  { level: 4, key: "sapling" },
  { level: 8, key: "young_tree" },
  { level: 14, key: "mature_tree" },
  { level: 22, key: "blooming" },
];

function stageForLevel(level) {
  let current = PET_STAGES[0];
  for (const stage of PET_STAGES) {
    if (level >= stage.level) current = stage;
    else break;
  }
  return current.key;
}

const ACHIEVEMENTS = [
  { id: "first_step", label: "First Step", description: "Log your first session." },
  { id: "hot_streak", label: "Hot Streak", description: "7 days in a row." },
  { id: "dedicated", label: "Dedicated", description: "30 days in a row." },
  { id: "marathon", label: "Marathon", description: "Log 100 total hours." },
  { id: "century", label: "Century", description: "Log 100 sessions." },
  { id: "polymath", label: "Polymath", description: "Study 5 different subjects." },
  { id: "mastered_five", label: "Sharpened", description: "Rate 5 sessions as Mastered." },
  { id: "dawn_patrol", label: "Dawn Patrol", description: "Study before 7am." },
  { id: "night_owl", label: "Night Owl", description: "Study after midnight." },
  { id: "sprint_day", label: "Sprint Day", description: "Log 10 sessions in a single day." },
];

// Resolve the hour-of-day for a UTC instant in a given IANA timezone.
// Falls back to UTC if the tz string is invalid.
function localHour(loggedAt, tz) {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    });
    return Number(fmt.format(new Date(loggedAt)));
  } catch {
    return new Date(loggedAt).getUTCHours();
  }
}

// Resolve the calendar date (YYYY-MM-DD) for a UTC instant in a given IANA timezone.
function localDateKey(loggedAt, tz) {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(new Date(loggedAt)); // en-CA yields YYYY-MM-DD
  } catch {
    return new Date(loggedAt).toISOString().slice(0, 10);
  }
}

router.get("/profile", async (req, res) => {
  const userId = req.userId;
  const tz = typeof req.query.tz === "string" && req.query.tz ? req.query.tz : "UTC";

  const { rows: sessionsRows } = await pool.query(
    `SELECT s.id, s.duration_minutes, s.quality, s.logged_at
     FROM study_sessions s
     JOIN study_goals g ON g.id = s.goal_id
     WHERE g.user_id = $1`,
    [userId],
  );

  const { rows: subjectsRows } = await pool.query(
    `SELECT DISTINCT sub.name
     FROM goal_subjects gs
     JOIN subjects sub ON sub.id = gs.subject_id
     JOIN study_goals g ON g.id = gs.goal_id
     WHERE g.user_id = $1`,
    [userId],
  );

  // Streaks — compute first so XP can use a streak multiplier.
  // Bucket sessions into local-tz dates so the streak boundary matches
  // the user's calendar day, not UTC midnight.
  const dayMinutes = new Map();
  for (const s of sessionsRows) {
    const key = localDateKey(s.logged_at, tz);
    dayMinutes.set(key, (dayMinutes.get(key) ?? 0) + s.duration_minutes);
  }

  const todayKey = localDateKey(new Date(), tz);
  const daily = [];
  // Build a 365-day window ending today in the user's local tz.
  const today = new Date(`${todayKey}T00:00:00Z`);
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    daily.push({ date: key, minutes: dayMinutes.get(key) ?? 0 });
  }

  // streakEndingOn[i] = consecutive non-zero days up to and including day i.
  const streakEndingOn = new Array(daily.length).fill(0);
  for (let i = 0; i < daily.length; i++) {
    if (daily[i].minutes > 0) {
      streakEndingOn[i] = (i > 0 ? streakEndingOn[i - 1] : 0) + 1;
    }
  }

  const currentStreak = streakEndingOn[streakEndingOn.length - 1];
  let longestStreak = 0;
  for (const v of streakEndingOn) if (v > longestStreak) longestStreak = v;

  const streakByDate = new Map();
  for (let i = 0; i < daily.length; i++) {
    streakByDate.set(daily[i].date, streakEndingOn[i]);
  }

  // Core XP: (minutes + quality bonus) × streak multiplier of the day the
  // session was logged. Multiplier ramps from 1.0× → 2.0× across a 30-day
  // streak. Using the streak-as-of-that-day means breaking a streak does NOT
  // retroactively shrink old XP — past achievements stay earned.
  let totalMinutes = 0;
  let masteredCount = 0;
  const xpBySession = sessionsRows.map((s) => {
    const base = s.duration_minutes + (s.quality ?? 0) * 10;
    const dateKey = localDateKey(s.logged_at, tz);
    const streakOnDay = streakByDate.get(dateKey) ?? 0;
    const multiplier = 1 + Math.min(streakOnDay / 30, 1);
    totalMinutes += s.duration_minutes;
    if (s.quality === 5) masteredCount++;
    return Math.round(base * multiplier);
  });
  const totalXp = xpBySession.reduce((a, b) => a + b, 0);
  const level = levelFromXp(totalXp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const xpIntoLevel = totalXp - currentLevelXp;
  const xpForNextLevel = nextLevelXp - currentLevelXp;
  const progressToNext =
    xpForNextLevel > 0 ? Math.min(1, xpIntoLevel / xpForNextLevel) : 0;

  // Achievement unlocks
  const totalHours = totalMinutes / 60;
  const subjectCount = subjectsRows.length;
  const hasDawn = sessionsRows.some((s) => localHour(s.logged_at, tz) < 7);
  const hasNight = sessionsRows.some((s) => {
    const h = localHour(s.logged_at, tz);
    return h >= 0 && h < 3;
  });
  const dayCounts = new Map();
  for (const s of sessionsRows) {
    const key = localDateKey(s.logged_at, tz);
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }
  const maxDay = Math.max(0, ...dayCounts.values());

  const unlocked = new Set();
  if (sessionsRows.length >= 1) unlocked.add("first_step");
  if (currentStreak >= 7 || longestStreak >= 7) unlocked.add("hot_streak");
  if (currentStreak >= 30 || longestStreak >= 30) unlocked.add("dedicated");
  if (totalHours >= 100) unlocked.add("marathon");
  if (sessionsRows.length >= 100) unlocked.add("century");
  if (subjectCount >= 5) unlocked.add("polymath");
  if (masteredCount >= 5) unlocked.add("mastered_five");
  if (hasDawn) unlocked.add("dawn_patrol");
  if (hasNight) unlocked.add("night_owl");
  if (maxDay >= 10) unlocked.add("sprint_day");

  res.json({
    level,
    xp: totalXp,
    xp_into_level: xpIntoLevel,
    xp_for_next_level: xpForNextLevel,
    progress_to_next: progressToNext,
    pet_stage: stageForLevel(level),
    current_streak_days: currentStreak,
    longest_streak_days: longestStreak,
    total_sessions: sessionsRows.length,
    total_minutes: totalMinutes,
    mastered_count: masteredCount,
    achievements: ACHIEVEMENTS.map((a) => ({ ...a, unlocked: unlocked.has(a.id) })),
  });
});

export default router;
