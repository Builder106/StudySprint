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
// openrouter/free meta-router: picks randomly from free models that
// support our requested features (structured outputs filter applies),
// which spreads load across the pool and dodges single-model 429s.
// OPENROUTER_MODEL env can override with a specific model or a
// comma-separated fallback chain (max 3, OpenRouter limit).
const DEFAULT_MODELS = ["openrouter/free"];
const MAX_INPUT_CHARS = 20000;

const SYSTEM_PROMPT = `You extract structured study goals from course syllabi.
Rules:
- title: 3-80 chars, concrete ("Master integration techniques", not "Study calculus")
- description: 1-2 sentences explaining scope
- target_hours: realistic (5-50 per goal)
- target_date: a YYYY-MM-DD date if mentioned in the syllabus (exam, deadline, end of term), otherwise null
- subjects: 1-3 short tags (e.g. "Calculus", "Data Structures")
- aim for 3-8 goals that partition the course meaningfully`;

const GOALS_SCHEMA = {
  type: "object",
  properties: {
    goals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Concrete goal title, 3-80 chars" },
          description: { type: "string", description: "1-2 sentences explaining scope" },
          target_hours: { type: "number", description: "Realistic estimate, 5-50" },
          target_date: {
            type: ["string", "null"],
            description: "YYYY-MM-DD if a deadline is mentioned, else null",
          },
          subjects: {
            type: "array",
            items: { type: "string" },
            description: "1-3 short tags like 'Calculus' or 'Data Structures'",
          },
        },
        required: ["title", "description", "target_hours", "target_date", "subjects"],
        additionalProperties: false,
      },
    },
  },
  required: ["goals"],
  additionalProperties: false,
};

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

  // OPENROUTER_MODEL accepts a single id or a comma-separated fallback chain.
  const modelEnv = process.env.OPENROUTER_MODEL?.trim();
  const modelList = (
    modelEnv
      ? modelEnv.split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_MODELS
  ).slice(0, 3);
  const modelField =
    modelList.length > 1 ? { models: modelList } : { model: modelList[0] };
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
        ...modelField,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "study_goals",
            // strict + require_parameters filters the free pool to zero
            // endpoints (404). Send the schema as a hint instead and rely
            // on extractJsonObject + the prompt for shape adherence.
            strict: false,
            schema: GOALS_SCHEMA,
          },
        },
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });
  } catch (err) {
    console.error("openrouter fetch failed:", err);
    return res.status(502).json({ error: "Could not reach OpenRouter" });
  }

  if (!llmResponse.ok) {
    const bodyText = await llmResponse.text();
    console.error("openrouter error:", llmResponse.status, bodyText.slice(0, 500));
    let reason = bodyText.slice(0, 300);
    try {
      const parsed = JSON.parse(bodyText);
      reason = parsed?.error?.message || parsed?.error || reason;
      if (typeof reason !== "string") reason = JSON.stringify(reason).slice(0, 300);
    } catch {
      // not JSON; keep raw slice
    }
    return res.status(502).json({
      error: `LLM request failed (${llmResponse.status}): ${reason}`,
    });
  }

  const data = await llmResponse.json();
  const choice = data?.choices?.[0];
  const message = choice?.message;
  let content = typeof message?.content === "string" ? message.content : "";
  // Some thinking-class free models route their answer through reasoning fields
  // and leave content empty; fall back so we don't 502 on a usable response.
  if (!content.trim()) {
    const alt = message?.reasoning_content ?? message?.reasoning;
    if (typeof alt === "string" && alt.trim()) content = alt;
  }
  if (!content.trim()) {
    const usedModel = data?.model ?? modelList[0];
    const provider = data?.provider ?? "unknown";
    const finish = choice?.finish_reason ?? "unknown";
    console.error("openrouter empty content:", { usedModel, provider, finish, raw: JSON.stringify(data).slice(0, 1000) });
    return res.status(502).json({
      error: `Empty response from ${usedModel} (${provider}, finish=${finish}). Try again or set OPENROUTER_MODEL to a specific free model.`,
    });
  }

  const parsed = extractJsonObject(content);
  if (!parsed) {
    console.error("openrouter non-JSON content:", content.slice(0, 800));
    const preview = content.slice(0, 200).replace(/\s+/g, " ").trim();
    return res.status(502).json({
      error: `LLM returned non-JSON content. Preview: ${preview}`,
    });
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

  res.json({ goals, model: data?.model ?? modelList[0] });
});

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n * 10) / 10));
}

function extractJsonObject(content) {
  const tryParse = (s) => {
    try { return JSON.parse(s); } catch { return null; }
  };
  // 1. straight parse
  let parsed = tryParse(content);
  if (parsed) return parsed;
  // 2. strip markdown code fence: ```json ... ``` or ``` ... ```
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    parsed = tryParse(fence[1].trim());
    if (parsed) return parsed;
  }
  // 3. greedy first-{ to last-} (handles leading/trailing prose)
  const obj = content.match(/\{[\s\S]*\}/);
  if (obj) {
    parsed = tryParse(obj[0]);
    if (parsed) return parsed;
  }
  return null;
}

function validateDate(value) {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return value;
}

export default router;
