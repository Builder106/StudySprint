import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const needsSSL = /render\.com|amazonaws\.com|neon\.tech|supabase\.co/.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
});

export const query = (text, params) => pool.query(text, params);
