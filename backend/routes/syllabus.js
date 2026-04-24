import { Router } from "express";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openrouter/free";
const MAX_INPUT_CHARS = 20000;

const SYSTEM_PROMPT = `You extract structured study goals from course syllabi.
Respond ONLY with a JSON object in this exact shape:
{"goals": [{"title": string, "description": string, "target_hours": number, "target_date": string|null, "subjects": string[]}]}
Rules:
- title: 3-80 chars, concrete ("Master integration techniques", not "Study calculus")
- description: 1-2 sentences explaining scope
- target_hours: realistic (5-50 per goal)
- target_date: a YYYY-MM-DD date if mentioned in the syllabus (exam, deadline, end of term), otherwise null
- subjects: 1-3 short tags (e.g. "Calculus", "Data Structures")
- aim for 3-8 goals that partition the course meaningfully
Do not include any prose outside the JSON object.`;

router.post("/parse", upload.single("pdf"), async (req, res) => {
  let text = typeof req.body?.text === "string" ? req.body.text : "";

  if (!text && req.file) {
    let parser;
    try {
      parser = new PDFParse({ data: req.file.buffer });
      const parsed = await parser.getText();
      text = parsed.text;
    } catch (err) {
      console.error("pdf-parse failed:", err);
      return res.status(400).json({ error: "Could not read PDF content" });
    } finally {
      if (parser) await parser.destroy().catch(() => {});
    }
  }

  if (!text || text.trim().length < 50) {
    return res
      .status(400)
      .json({ error: "Provide syllabus text (min 50 chars) or a PDF with readable content" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OpenRouter not configured on the server" });
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const trimmed = text.slice(0, MAX_INPUT_CHARS);

  let llmResponse;
  try {
    llmResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.CLIENT_ORIGIN || "http://localhost:5173",
        "X-Title": "StudySprint",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
  } catch (err) {
    console.error("openrouter fetch failed:", err);
    return res.status(502).json({ error: "Could not reach OpenRouter" });
  }

  if (!llmResponse.ok) {
    const bodyText = await llmResponse.text();
    console.error("openrouter error:", llmResponse.status, bodyText.slice(0, 500));
    return res.status(502).json({
      error: `LLM request failed (${llmResponse.status})`,
      details: bodyText.slice(0, 200),
    });
  }

  const data = await llmResponse.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return res.status(502).json({ error: "Empty LLM response" });
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to salvage the first JSON object
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return res.status(502).json({ error: "LLM returned non-JSON content" });
      }
    } else {
      return res.status(502).json({ error: "LLM returned non-JSON content" });
    }
  }

  const rawGoals = Array.isArray(parsed?.goals) ? parsed.goals : [];
  const goals = rawGoals
    .filter((g) => g && typeof g.title === "string" && g.title.trim().length > 0)
    .slice(0, 20)
    .map((g) => ({
      title: String(g.title).trim().slice(0, 200),
      description: typeof g.description === "string" ? g.description.trim().slice(0, 500) : "",
      target_hours: clampNumber(g.target_hours, 1, 200, 10),
      target_date: validateDate(g.target_date),
      subjects: Array.isArray(g.subjects)
        ? g.subjects
            .filter((s) => typeof s === "string" && s.trim().length > 0)
            .map((s) => s.trim().slice(0, 50))
            .slice(0, 5)
        : [],
    }));

  res.json({ goals, model });
});

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n * 10) / 10));
}

function validateDate(value) {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return value;
}

export default router;
