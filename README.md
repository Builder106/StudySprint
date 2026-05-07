# StudySprint

A study tracker that turns focus sessions into a growing garden. Set goals, run a focus timer, watch plants grow with time logged, and compare streaks on a public leaderboard.

**Live app:** https://getstudysprint.vercel.app

<!-- Replace this with a hero screenshot or GIF (recommended: 960px wide). -->
<!-- ![StudySprint dashboard](docs/hero.png) -->

## Features

- **Focus timer + session logging** — start, pause, and resume timed study sessions, tagged by goal and subject.
- **Gamified garden** — every focused minute grows a plant; streaks unlock new species.
- **AI syllabus parser** — paste a syllabus, get goals and deadlines extracted automatically (OpenRouter-backed).
- **Co-study rooms** — join real-time rooms to study alongside other users.
- **Community leaderboard + public profiles** — opt-in social layer with avatars and weekly rankings.
- **Analytics** — per-subject time distribution, weekly trends, and streak history (Recharts).
- **Google Calendar integration** — push study blocks to your calendar.

## Tech stack

| Layer | Tools |
|---|---|
| Runtime | Deno 2 — single TS toolchain across frontend + edge functions, npm specifiers via `deno.json` |
| Frontend | React 18, TypeScript, Vite (run via `deno run -A npm:vite`), Tailwind CSS v4, Radix UI, Framer Motion, Recharts |
| Backend | Supabase — Postgres + Auth + Row Level Security + RPCs + Edge Functions (Deno) |
| AI | OpenRouter (multi-model fallback chain for syllabus parsing) |
| Integrations | Google Calendar API (REST, called from Edge Function) |
| Testing | Playwright + playwright-bdd (Gherkin scenarios, demo-mode video capture) |
| Deploy | Vercel / Deno Deploy (static site) + Supabase (database, auth, edge functions) |

## Architecture

```
frontend/  React + Vite SPA
  app/components/   page-level components (Dashboard, Garden, StudyRoom, ...)
  lib/              Supabase client, API wrappers, hooks, utilities
supabase/
  migrations/       SQL schema, views, and RPC definitions
  functions/        Deno Edge Functions
    syllabus-parse/   syllabus → structured goals via OpenRouter
    google-calendar/  OAuth + Calendar export/import
e2e/       Playwright + Gherkin BDD suite (QA + demo-recording configs)
```

`backend/` (Express + node-postgres) is retained for reference only — every
endpoint has been ported to Supabase RPCs or Edge Functions, and the frontend
no longer talks to it. Safe to delete (`rm -rf backend/`) once you've verified
the deployed app and don't need to consult the original handlers anymore.

## Local setup

Requires [Deno 2.x](https://deno.com/) and the [Supabase CLI](https://supabase.com/docs/guides/cli).
There is no `package.json` — `deno.json` is the source of truth for tasks and
npm dependencies. Deno auto-creates a `node_modules/` directory when needed
(so Vite can resolve plugins), but you don't manage it directly.

```bash
deno install                        # materialize node_modules from deno.json
cp .env.example .env                # fill in VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY

# One-time: link this repo to your Supabase project, push migrations,
# deploy edge functions, and set their secrets.
deno task supabase:link             # supabase link --project-ref <your-project-ref>
deno task supabase:db:push
deno task supabase:functions:deploy
supabase secrets set \
  OPENROUTER_API_KEY=... \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=... \
  GOOGLE_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/google-calendar/callback \
  CLIENT_ORIGIN=http://localhost:5173

deno task dev                       # frontend on :5173 (Vite via Deno)
```

If `deno install` warns about ignored build scripts, re-run with
`deno install --allow-scripts=npm:supabase,npm:@tailwindcss/oxide` — the
Supabase CLI's binary download and Tailwind's native binding both run
postinstall scripts.

Sign up via the in-app register flow to create your account; a `profiles` row
is created automatically by an `auth.users` trigger.

### Environment variables

**Frontend** (`.env` in repo root)

| Key | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (from Project Settings → API) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (`sb_publishable_…`) — safe to ship; RLS guards data |

**Edge Functions** (set via `supabase secrets set ...`)

| Key | Description |
|---|---|
| `OPENROUTER_API_KEY` | API key for the syllabus parser |
| `OPENROUTER_MODEL` | Optional override (single id or comma-separated chain, max 3) |
| `GOOGLE_CLIENT_ID` | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `https://<project-ref>.functions.supabase.co/google-calendar/callback` |
| `CLIENT_ORIGIN` | Frontend origin (used for OAuth post-callback redirect) |

## Tests

```bash
deno task test            # Gherkin E2E suite, headless (Playwright via Deno)
deno task test:e2e:ui     # Playwright UI mode
deno task demo            # records narrated walkthrough videos (DEMO=1)
```

Playwright runs under Deno's Node compatibility layer — its browser drivers
are still Node binaries, but the test runner and step definitions execute
through `deno run -A npm:@playwright/test`. No separate `npm install` is
required.

## License

MIT — see [LICENSE](LICENSE).
