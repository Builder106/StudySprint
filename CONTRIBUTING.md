# Contributing to StudySprint

Thanks for taking the time to contribute. This guide covers the workflow,
project conventions, and what to check before opening a PR.

## Getting set up

Requires [Deno 2.x](https://deno.com/) and the
[Supabase CLI](https://supabase.com/docs/guides/cli). There is no
`package.json` — `deno.json` is the source of truth for tasks and npm
dependencies.

```bash
deno install                        # materialize node_modules from deno.json
cp .env.example .env                # fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
deno task supabase:link             # link to your Supabase project
deno task dev                       # frontend :5173 (Vite via Deno)
```

Sign up via the in-app register flow to create your account. See
[README.md](README.md#environment-variables) for the full env-var list.

If `deno install` warns about ignored build scripts, re-run with
`deno install --allow-scripts=npm:supabase,npm:@tailwindcss/oxide`.

## Project layout

```
frontend/  React + Vite SPA (run via `deno task dev`)
  app/components/   page-level components
  lib/              Supabase client, API wrappers, hooks, utilities
supabase/
  migrations/       SQL schema, views, RPC definitions
  functions/        Deno Edge Functions (shared deno.json import map)
e2e/       Playwright + Gherkin BDD suite (QA + demo configs)
deno.json  Tasks, npm imports, fmt + lint config
```

## Workflow

1. Branch off `main` (`git checkout -b feat/short-description`).
2. Make focused commits. Keep unrelated changes in separate PRs.
3. Run `deno task test` locally before pushing.
4. Open a PR against `main` with a description of *why* the change is needed,
   not just *what* it does.

## Commit messages

This repo follows [Conventional Commits](https://www.conventionalcommits.org/).
Prefixes in active use:

- `feat(scope): ...` — user-visible new behavior
- `fix(scope): ...` — bug fix
- `chore(scope): ...` — tooling, deps, internal cleanup
- `docs: ...` — documentation only

Scope is the area touched (`auth`, `goals`, `sessions`, `syllabus`, `community`,
`db`, `gamification`, etc.). Keep the subject under ~72 characters and write
in the imperative mood.

Do not add `Co-Authored-By` trailers attributing work to AI assistants.

## Code style

- TypeScript strict mode is on; don't disable it per-file.
- Prefer accessible UI primitives (Radix, semantic HTML). New components should
  reach for `getByRole`-friendly markup so E2E tests can target them without
  `data-testid`.
- Tailwind v4 conventions — utility classes inline, use `clsx` / `tailwind-merge`
  for conditional classes.
- Format with `deno task fmt`. Lint with `deno task lint`. Both run on the
  frontend tree and the Supabase functions tree.
- New Supabase tables / RPCs go in a timestamped file under
  `supabase/migrations/`.
- Don't add comments that restate what the code does. Reserve them for
  non-obvious *why*.

## Adding dependencies

```bash
deno add npm:<package>@<version>          # frontend dep
```

This updates `deno.json` and re-materializes `node_modules`. For Edge Function
deps, add them to `supabase/functions/deno.json` instead.

## Tests

```bash
deno task test:setup      # one-time per machine: bootstrap the demo account
deno task test            # Gherkin E2E suite, headless
deno task test:e2e:ui     # Playwright UI mode for debugging
deno task demo            # records narrated walkthrough videos (DEMO=1)
```

### Test fixtures

Most non-auth scenarios begin with `Given I am logged in as
"demo@studysprint.app"`. That account has to exist in Supabase Auth for
the suite to clear the login screen, so the suite ships with
[`e2e/setup/bootstrap-demo.ts`](e2e/setup/bootstrap-demo.ts) which
create-or-updates it and reseeds starter goals.

Required env vars (loaded automatically from `.env`, no exports needed):

```env
# .env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=<service-role>   # only for test:setup
```

The service-role key never leaves your machine — `bootstrap-demo.ts` is
the only place that needs it, and it's not used by the running suite or
the application itself. `.env` is gitignored.

```bash
deno task test:setup    # one-time per machine
deno task test          # full suite — picks up .env automatically
```

E2E tests themselves run with the publishable anon key only. The suite
skips cleanup of registered users in scenarios that test sign-up;
periodically sweep them with:

```sql
delete from auth.users where email like 'demo_signup_%@studysprint.app';
```

When adding a feature:

- Add or extend a Gherkin scenario in `e2e/features/`. Write step text as
  natural English (`When I click the "Save" button`), not selectors.
- Reuse step definitions from `e2e/steps/` where possible. Add new steps only
  when no existing phrasing fits.
- Cleanup of test-created rows belongs in `After` hooks via API requests, not
  direct DB access. See `e2e/steps/hooks.ts`.
- See [e2e/AGENTS.md](e2e/AGENTS.md) for detailed conventions on locators,
  hydration, and the demo-recording infrastructure.

Validation / error-path scenarios are high-value — keep them. Plain
"page renders" smoke tests for features that already have CRUD coverage are
not worth the upkeep.

## Database changes

- Schema changes ship as a new file in `supabase/migrations/` (timestamped).
- Don't edit a migration that has already been applied to the deployed
  database. Add a follow-up migration instead.
- If the change affects RLS, include the policy in the same migration.

## Reporting bugs

Open a GitHub issue with:

- What you expected vs. what happened
- Reproduction steps (account state, exact clicks/inputs)
- Browser + OS, or `deno --version` for tooling bugs
- Relevant excerpt from the browser console or function logs (`supabase functions logs`)

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
