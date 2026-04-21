import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res) => {
  const { rows } = await pool.query("SELECT id, name FROM subjects ORDER BY name ASC");
  res.json({ subjects: rows });
});

router.post("/", async (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Subject name required" });
  }
  const trimmed = name.trim();
  const { rows } = await pool.query(
    `INSERT INTO subjects (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
    [trimmed],
  );
  res.status(201).json({ subject: rows[0] });
});

export default router;
