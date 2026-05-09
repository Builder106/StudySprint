<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/banner-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/banner-light.svg">
  <img alt="StudySprint — Focus. Track. Grow." src="docs/banner-dark.svg" width="1200" height="300">
</picture>

[![CI](https://github.com/Builder106/StudySprint/actions/workflows/ci.yml/badge.svg)](https://github.com/Builder106/StudySprint/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Deno](https://img.shields.io/badge/Deno-2-black?logo=deno&logoColor=white)](https://deno.com)
[![React](https://img.shields.io/badge/React-18-20232a?logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Vercel-000?logo=vercel&logoColor=white)](https://vercel.com)

A study tracker that turns focus sessions into a growing garden. Set goals, run a focus timer, watch plants grow with time logged, and compare streaks on a public leaderboard.

**Live app:** https://getstudysprint.vercel.app

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/gifs/01-core-new-student-registers-and-logs-their-first-session-dark.gif">
  <source media="(prefers-color-scheme: light)" srcset="docs/gifs/01-core-new-student-registers-and-logs-their-first-session-light.gif">
  <img alt="StudySprint — register, set a goal, log a session, watch the garden grow" src="docs/gifs/01-core-new-student-registers-and-logs-their-first-session-dark.gif">
</picture>

## Core loop, end-to-end

![Core loop sequence diagram — dark](docs/core-loop-dark.svg#gh-dark-mode-only)
![Core loop sequence diagram — light](docs/core-loop-light.svg#gh-light-mode-only)

## Features

<details>
<summary><b>Focus timer + session logging</b></summary>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/gifs/02-timer-demonstrate-timer-modes-and-focus-tools-dark.gif">
  <source media="(prefers-color-scheme: light)" srcset="docs/gifs/02-timer-demonstrate-timer-modes-and-focus-tools-light.gif">
  <img alt="Timer modes and focus tools" src="docs/gifs/02-timer-demonstrate-timer-modes-and-focus-tools-dark.gif">
</picture>

Stopwatch and Pomodoro modes with phase labels, ambient-sound focus tools, and a slide-out goal-detail panel. Sessions are tagged by goal and subject, validated server-side, and feed into the streak counter and garden.

</details>

<details>
<summary><b>Gamified garden + analytics</b></summary>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/gifs/03-analytics-demonstrate-analytics-heatmap-and-garden-plant-dark.gif">
  <source media="(prefers-color-scheme: light)" srcset="docs/gifs/03-analytics-demonstrate-analytics-heatmap-and-garden-plant-light.gif">
  <img alt="Analytics dashboard and growing garden" src="docs/gifs/03-analytics-demonstrate-analytics-heatmap-and-garden-plant-dark.gif">
</picture>

Every focused minute grows a plant; streaks unlock new species. Analytics view shows per-subject time distribution, hour-of-day heatmap, day-of-week breakdown, and current/longest streak — all computed server-side via a single Postgres RPC (`analytics_summary`) and rendered with Recharts.

</details>

<details>
<summary><b>AI syllabus parser + co-study rooms</b></summary>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/gifs/04-power-demonstrate-syllabus-parser-and-study-rooms-dark.gif">
  <source media="(prefers-color-scheme: light)" srcset="docs/gifs/04-power-demonstrate-syllabus-parser-and-study-rooms-light.gif">
  <img alt="Syllabus parser extracts goals; study rooms for accountability" src="docs/gifs/04-power-demonstrate-syllabus-parser-and-study-rooms-dark.gif">
</picture>

Paste a syllabus or upload a PDF; an OpenRouter-backed Edge Function returns structured study goals with target dates and subject tags. Co-study rooms let you join other users' sessions in real time; opt-in public profiles and a weekly leaderboard surface the social layer.

</details>

Also: **Google Calendar integration** (export sessions, import events) via a dedicated OAuth flow; **dark mode** with theme persistence; **one-click account reset** that wipes your data and reseeds starter goals.

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
frontend/                   React + Vite SPA
├── app/components/         Page-level components (Dashboard, Garden, StudyRoom, …)
└── lib/                    Supabase client, API wrappers, hooks, utilities

supabase/
├── migrations/             SQL schema, views, RPC definitions
└── functions/              Deno Edge Functions
    ├── syllabus-parse/     Syllabus → structured goals via OpenRouter
    └── google-calendar/    OAuth + Calendar export/import

e2e/                        Playwright + Gherkin BDD suite (QA + demo configs)
```

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
deno task demo            # records narrated walkthrough videos (dark theme)
deno task demo:light      # same, in light theme — needed for the README hero <picture>
deno task demo:both       # records both themes back-to-back
deno task gif             # convert test-results/videos/*-{dark,light}.mp4 → docs/gifs/*.gif
```

Playwright runs under Deno's Node compatibility layer — its browser drivers
are still Node binaries, but the test runner and step definitions execute
through `deno run -A npm:@playwright/test`. No separate `npm install` is
required.

The same suite runs on every push to `main` via
[GitHub Actions](.github/workflows/ci.yml) (alongside `deno fmt --check`,
`deno lint`, `deno check`, and a build smoke test). The CI badge above
reflects the most recent run. See
[CONTRIBUTING.md](CONTRIBUTING.md#ci) for the secrets the e2e job needs.

## License

MIT — see [LICENSE](LICENSE).
