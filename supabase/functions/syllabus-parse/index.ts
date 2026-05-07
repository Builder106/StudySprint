// Edge Function: syllabus-parse
// Replaces backend/routes/syllabus.js. Accepts JSON { text } or multipart
// with a "pdf" file. PDF text extraction uses unpdf (serverless-friendly,
// no canvas dependency). Calls OpenRouter to extract structured study goals.
//
// Required env vars (set via `supabase secrets set ...`):
//   OPENROUTER_API_KEY  — required
//   OPENROUTER_MODEL    — optional override (single id or comma-separated chain, max 3)
//   CLIENT_ORIGIN       — optional, used as HTTP-Referer for OpenRouter analytics

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function authedUser(req: Request): Promise<{ userId: string; client: SupabaseClient } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  // Edge Function runtime auto-injects SUPABASE_URL + SUPABASE_ANON_KEY +
  // SUPABASE_SERVICE_ROLE_KEY under those legacy names regardless of whether
  // the project uses API Keys v2 (publishable / secret). Read what's injected.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !publishableKey) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");
  const client = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { userId: data.user.id, client };
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODELS = ["openrouter/free"];
const MAX_INPUT_CHARS = 20_000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

const SYSTEM_PROMPT = `You extract structured study goals from course syllabi.

Output format (CRITICAL): Respond with ONE JSON object and nothing else.
- No preamble, no explanation, no markdown fences, no commentary.
- Start your reply with the character "{" and end with "}".
- Shape: {"goals": [{"title": string, "description": string, "target_hours": number, "target_date": string|null, "subjects": string[]}]}

Field rules:
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
          target_date: { type: ["string", "null"], description: "YYYY-MM-DD if a deadline is mentioned, else null" },
          subjects: { type: "array", items: { type: "string" }, description: "1-3 short tags like 'Calculus' or 'Data Structures'" },
        },
        required: ["title", "description", "target_hours", "target_date", "subjects"],
        additionalProperties: false,
      },
    },
  },
  required: ["goals"],
  additionalProperties: false,
};

interface RawGoal {
  title?: unknown;
  description?: unknown;
  target_hours?: unknown;
  target_date?: unknown;
  subjects?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await authedUser(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);

  let text = "";
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const formText = form.get("text");
      if (typeof formText === "string") text = formText;
      const pdf = form.get("pdf");
      if (!text && pdf instanceof File) {
        if (pdf.size > MAX_PDF_BYTES) return jsonResponse({ error: "PDF exceeds 10MB limit" }, 400);
        text = await extractPdfText(pdf);
      }
    } else {
      const body = await req.json();
      if (body && typeof body.text === "string") text = body.text;
    }
  } catch (err) {
    console.error("syllabus-parse: bad request body:", err);
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  if (!text || text.trim().length < 50) {
    return jsonResponse({ error: "Provide syllabus text (min 50 chars) or a PDF with readable content" }, 400);
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return jsonResponse({ error: "OpenRouter not configured on the server" }, 500);

  const modelEnv = Deno.env.get("OPENROUTER_MODEL")?.trim();
  const modelList = (modelEnv ? modelEnv.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_MODELS).slice(0, 3);
  const modelField = modelList.length > 1 ? { models: modelList } : { model: modelList[0] };
  const trimmed = text.slice(0, MAX_INPUT_CHARS);

  let llmResponse: Response;
  try {
    llmResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("CLIENT_ORIGIN") ?? "http://localhost:5173",
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
            // endpoints (404). Send the schema as a hint and rely on the
            // prompt + extractJsonObject for shape adherence.
            strict: false,
            schema: GOALS_SCHEMA,
          },
        },
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });
  } catch (err) {
    console.error("openrouter fetch failed:", err);
    return jsonResponse({ error: "Could not reach OpenRouter" }, 502);
  }

  if (!llmResponse.ok) {
    const bodyText = await llmResponse.text();
    console.error("openrouter error:", llmResponse.status, bodyText.slice(0, 500));
    let reason: string = bodyText.slice(0, 300);
    try {
      const parsed = JSON.parse(bodyText);
      const msg = parsed?.error?.message ?? parsed?.error ?? reason;
      reason = typeof msg === "string" ? msg : JSON.stringify(msg).slice(0, 300);
    } catch { /* not JSON; keep raw slice */ }
    return jsonResponse({ error: `LLM request failed (${llmResponse.status}): ${reason}` }, 502);
  }

  const data = await llmResponse.json();
  const choice = data?.choices?.[0];
  const message = choice?.message;
  let content = typeof message?.content === "string" ? message.content : "";
  if (!content.trim()) {
    const alt = message?.reasoning_content ?? message?.reasoning;
    if (typeof alt === "string" && alt.trim()) content = alt;
  }
  if (!content.trim()) {
    const usedModel = data?.model ?? modelList[0];
    const provider = data?.provider ?? "unknown";
    const finish = choice?.finish_reason ?? "unknown";
    console.error("openrouter empty content:", { usedModel, provider, finish });
    return jsonResponse({ error: `Empty response from ${usedModel} (${provider}, finish=${finish}). Try again or set OPENROUTER_MODEL to a specific free model.` }, 502);
  }

  const parsed = extractJsonObject(content);
  if (!parsed) {
    const preview = content.slice(0, 500).replace(/\s+/g, " ").trim();
    return jsonResponse({ error: `LLM returned non-JSON content. Preview: ${preview}` }, 502);
  }

  const rawGoals: RawGoal[] = Array.isArray(parsed?.goals) ? parsed.goals : [];
  const goals = rawGoals
    .filter((g): g is RawGoal & { title: string } => !!g && typeof g.title === "string" && g.title.trim().length > 0)
    .slice(0, 20)
    .map((g) => ({
      title: String(g.title).trim().slice(0, 200),
      description: typeof g.description === "string" ? g.description.trim().slice(0, 500) : "",
      target_hours: clampNumber(g.target_hours, 1, 200, 10),
      target_date: validateDate(g.target_date),
      subjects: Array.isArray(g.subjects)
        ? (g.subjects as unknown[])
            .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
            .map((s) => s.trim().slice(0, 50))
            .slice(0, 5)
        : [],
    }));

  return jsonResponse({ goals, model: data?.model ?? modelList[0] });
});

async function extractPdfText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n * 10) / 10));
}

function extractJsonObject(content: string): { goals?: unknown } | null {
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
  let parsed = tryParse(content);
  if (parsed) return parsed;
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { parsed = tryParse(fence[1].trim()); if (parsed) return parsed; }
  const obj = content.match(/\{[\s\S]*\}/);
  if (obj) { parsed = tryParse(obj[0]); if (parsed) return parsed; }
  return null;
}

function validateDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return value;
}
