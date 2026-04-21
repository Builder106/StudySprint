import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { createStarterDataForUser } from "../lib/starterData.js";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo123";

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT id FROM users WHERE email = $1", [DEMO_EMAIL]);
    if (existing.rowCount > 0) {
      console.log("Demo user already exists. Skipping seed.");
      await client.query("ROLLBACK");
      return;
    }

    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
      [DEMO_EMAIL, hash],
    );
    const user = rows[0];
    console.log(`Created demo user: ${user.email}`);

    await createStarterDataForUser(client, user.id);
    await client.query("COMMIT");

    console.log("Seed complete.");
    console.log(`Demo credentials: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
