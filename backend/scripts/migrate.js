import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "../db.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "sql", "schema.sql");

const sql = await readFile(schemaPath, "utf8");
await pool.query(sql);
console.log("Schema applied.");
await pool.end();
