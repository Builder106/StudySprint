import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import goalsRoutes from "./routes/goals.js";
import sessionsRoutes from "./routes/sessions.js";
import subjectsRoutes from "./routes/subjects.js";
import analyticsRoutes from "./routes/analytics.js";

const app = express();

const origins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
   .split(",")
   .map((s) => s.trim());

app.use(cors({ origin: origins, credentials: false }));
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
   res.json({ api: "StudySprint", version: "0.1.0", status: "ok" });
});

app.get("/api/health", (_req, res) => {
   res.json({ ok: true, uptime: process.uptime() });
});

app.use("/api/auth", authRoutes);
app.use("/api/goals", goalsRoutes);
app.use("/api", sessionsRoutes);
app.use("/api/subjects", subjectsRoutes);
app.use("/api/analytics", analyticsRoutes);

app.use((err, _req, res, _next) => {
   console.error(err);
   res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
   console.log(`StudySprint API listening on :${port}`);
});
