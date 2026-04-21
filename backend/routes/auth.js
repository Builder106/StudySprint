import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { createStarterDataForUser } from "../lib/starterData.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/register", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Valid email required" });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Email already registered" });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, hash],
    );
    const user = rows[0];

    await createStarterDataForUser(client, user.id);
    await client.query("COMMIT");

    const token = signToken(user.id);
    res.status(201).json({ token, user });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("register error:", err);
    res.status(500).json({ error: "Registration failed" });
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }
  const { rows } = await pool.query(
    "SELECT id, email, password_hash, created_at FROM users WHERE email = $1",
    [email],
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(user.id);
  res.json({
    token,
    user: { id: user.id, email: user.email, created_at: user.created_at },
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, email, created_at FROM users WHERE id = $1",
    [req.userId],
  );
  if (rows.length === 0) return res.status(404).json({ error: "User not found" });
  res.json({ user: rows[0] });
});

export default router;
