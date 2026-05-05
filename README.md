# StudySprint

A study tracker that turns focus sessions into a growing garden. Set goals, run a focus timer, watch plants grow with time logged, and compare streaks on a public leaderboard.

**Live app:** https://studysprint-frontend.onrender.com · **Demo account:** `demo@example.com` / `demo123`

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
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4, Radix UI, Framer Motion, Recharts |
| Backend | Node.js, Express, PostgreSQL (`pg`), JWT auth (`bcryptjs` + `jsonwebtoken`) |
| AI | OpenRouter (multi-model fallback chain for syllabus parsing) |
| Integrations | Google Calendar API (`googleapis`) |
| Testing | Playwright + playwright-bdd (Gherkin scenarios, demo-mode video capture) |
| Deploy | Render (web service + static site + managed Postgres) |

## Architecture

```
frontend/  React + Vite SPA
  app/components/   page-level components (Dashboard, Garden, StudyRoom, ...)
  lib/              API client, hooks, utilities
backend/   Express API
  routes/           auth, goals, sessions, subjects, syllabus, social, analytics, gamification, integrations, admin
  middleware/       JWT auth
  scripts/          migrate.js, seed.js
  sql/              schema.sql
e2e/       Playwright + Gherkin BDD suite (QA + demo-recording configs)
```

## Local setup

Requires Node.js 18+ and a local PostgreSQL instance.

```bash
npm run setup                       # installs frontend + backend deps
cp backend/.env.example backend/.env
createdb study_sprint
cd backend && npm run migrate && npm run seed && cd ..
npm run dev                         # frontend on :5173, backend on :4000
```

The seed script creates `demo@example.com` / `demo123` with starter goals and sessions.

### Environment variables

**Backend** (`backend/.env`)

| Key | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `PORT` | API port (default `4000`) |
| `CLIENT_ORIGIN` | Frontend origin for CORS |
| `OPENROUTER_API_KEY` | API key for the syllabus parser |

**Frontend** (`.env` in repo root)

| Key | Description |
|---|---|
| `VITE_API_URL` | Backend URL (defaults to `http://localhost:4000`) |

## Tests

```bash
npm test            # Gherkin E2E suite, headless
npm run test:e2e:ui # Playwright UI mode
npm run demo        # records narrated walkthrough videos (DEMO=1)
```

## License

MIT — see [LICENSE](LICENSE).
