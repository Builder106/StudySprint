# Gherkin E2E Tests + Demo Video Recording

System instructions for writing Gherkin (BDD) end-to-end tests and recording
narrative demo walkthroughs from those tests. Model-agnostic; written for any
LLM or coding agent driving Playwright + playwright-bdd.

---

## Mental model: two suites, one shared step library

Treat these as **two distinct artifacts** that happen to share infrastructure:

1. **QA suite** — verifies correctness. Runs fast, headless, no videos by
   default. Each scenario tests one behavior or edge case.
2. **Demo suite** — produces narrative video walkthroughs for documentation.
   Each scenario is one continuous, scripted user journey through a feature
   cluster. Videos are the only output that matters.

Do **not** conflate them. A single feature file should never serve both — QA
tests want assertions and edge cases; demos want flow and visibility.

The step library (`*.steps.ts`) is shared. The split lives at the feature-file
level (e.g. `e2e/features/` for QA, `e2e/demo/features/` for demos) and at the
config level (separate `playwright.config.ts` and `playwright.demo.config.ts`).

---

## Writing Gherkin

### Step phrasing

- Phrase steps as natural English a non-technical reader can understand.
  Prefer `When I open the log session modal` over `When I click button[data-testid="log-session"]`.
- Reuse step phrases across features. If two scenarios click the same button,
  they should use the same step text — write the step definition once.
- Parameterize with `{string}` and `{int}` for variable bits, not for the verb.
  `When I click the {string} button` is reusable; `When I click {string} {string}`
  is not.

### Background vs. inline

- Use `Background:` for setup that **every** scenario in the file needs (e.g.
  "logged in as demo user"). Don't inflate Background with steps only some
  scenarios use.
- Demo scenarios usually have a 1–2 line Background or none — the scenario
  itself is the script.

### Scenario shape

- **QA scenario:** one assertion-bearing behavior. Title states what is being
  verified ("Registration fails when password is too short"). Keep under ~10
  steps; longer scenarios usually want splitting.
- **Demo scenario:** one continuous narrative covering a *cluster* of related
  features in the order a real user would encounter them. Title states the
  story ("New student registers and logs their first session").

### Don't test the same thing twice

- If a happy-path CRUD test exists, a "page loads" smoke test for the same
  feature is dead weight. Cut smoke tests that only check `expect(x).toBeVisible()`
  on static elements — those don't catch regressions.
- Validation scenarios (server-side error paths) are high-value. Keep them.

---

## Step definitions

### Locators

- Prefer accessible selectors: `getByRole`, `getByLabel`, `getByText`,
  `getByPlaceholder`. Avoid CSS selectors and never use `data-testid` unless
  the element is genuinely unstyled and unlabeled.
- When a generic label collides (e.g. two "Pause" buttons on the page), narrow
  with `{ exact: true }`, `.filter(...)`, or scope to a parent (`page.getByRole("region", { name: "Foo" }).getByRole("button", ...)`).
- Custom modals built with raw `<div>` overlays (not Radix Dialog) won't have
  `role="dialog"`. Locate them by their heading text or unique placeholder.

### Hydration races

- After clicking a link that navigates to a new page, `waitForLoadState("networkidle")` is necessary but **not sufficient**. Hydration can still
  be in flight. Anchor on a deterministic element the page renders last (e.g.
  `await page.getByRole("button", { name: "Stopwatch" }).waitFor({ state: "visible" })`).

### Cleanup hooks

- For QA scenarios that create persistent rows (registered users, rooms),
  clean up via an `After` hook using API requests, not DB queries — your test
  should never know the schema.
- Track per-test state in a `WeakMap<Page, ...>` so parallel workers don't
  cross-talk.
- **Skip cleanup in demo mode.** API calls in `After` hooks can race with
  Playwright's video finalization and produce 0-byte videos. Demo runs are
  local-only; clean leftover rows manually or with a one-shot script.

---

## Demo recording infrastructure

The goal: a viewer should be able to watch the video at 1× speed and follow
along — no blink-and-miss-it interactions.

### Required ingredients

| Mechanism | Effect | Fragility |
|---|---|---|
| `launchOptions.slowMo` | Pause before each Playwright action (click, fill, etc.) | Doesn't apply to `goto()` or assertions |
| `Locator.prototype.fill` patch → `pressSequentially` | Animates typing character-by-character | Patches global prototype; only patch once per worker |
| `addInitScript` cursor injection | A visible dot follows mouse events | Must be re-injected on every page (init scripts auto-rerun on navigation) |
| `addInitScript` zoom + viewport counter-scale | "Filmed close" feel without losing centered content | `zoom: 1.3` on `<html>` makes `min-h-screen` render at 130vh — counter-scale `min-h-screen { min-height: 76.92vh }` |
| `addInitScript` dark background pin | Prevents white flash before React mounts theme | Inject `<style>` and pre-set `localStorage.theme = 'dark'` |
| Dwell helper (`dwellForDemo`) | Explicit `waitForTimeout` after assertions and navigations | Must be called manually at every "thing just appeared" beat |
| `DEMO_TAIL_MS` in `After` hook | Holds final frame so the end-state reads as a still | Wraps in try/catch; page may already be closed |

### Why each ingredient is needed

- **slowMo alone is not enough.** It only pauses *between Playwright actions*.
  `page.goto()` is a navigation, not an action — it fires instantly. Every
  `expect(...).toBeVisible()` resolves the moment the element exists. Modals
  that only "appear and assert" with no follow-up action will flash on screen.
  This is why the dwell helper exists.
- **Slow typing comes from the `fill` patch, not slowMo.** Without the patch,
  forms fill instantly between two slowMo pauses — the user sees the field
  jump from empty to full.
- **The cursor matters.** Headless mode hides the system cursor; without the
  injected dot, the viewer can't see where the test is "looking."

### Dwell helper pattern

```typescript
export async function dwellForDemo(page: Page, ms = 1500) {
  if (process.env.DEMO !== "1") return;
  try { await page.waitForTimeout(ms); } catch { /* page closed */ }
}
```

Call it at every "thing just appeared" beat:
- After `page.goto()` (slowMo doesn't cover navigation)
- After modal-visibility assertions, before the next interaction
- On the final assertion of a scenario (so the end state lingers)

Use longer dwells (2–3s) for the "money shot" — the moment the demo is
showing off — and the default (1.5s) for transitions.

---

## Known Playwright quirks (work around, don't fight)

### The 0-byte first-test video bug

In single-worker runs with `slowMo + video: "on"`, **one** early test slot
records a 0-byte video. Position varies across runs (usually slot 1 or 2).

**Workaround:** add throwaway warmup scenarios at the top of the demo suite.
The reporter detects them by slug prefix and discards their videos.

```gherkin
Feature: Warmup
  Scenario: Warmup A
    Given I am on the home page
  Scenario: Warmup B
    Given I am on the home page
```

Two warmups is the floor; one is sometimes not enough.

**Do not switch to parallel workers as a fix.** Parallel makes it worse —
multiple test contexts compete for the video subsystem and most or all videos
end up 0 bytes.

### Reporter race on video finalization

`onTestEnd` fires before Playwright is guaranteed to have flushed the video
file. **Defer all renames and conversions to `onEnd`.** By then every test's
video is fully written.

### Cleanup hooks vs. video finalization

API calls in scenario `After` hooks (especially `page.evaluate` + `page.request.delete`) can interfere with video write-out for the scenario that just ran. Skip
those cleanups when `process.env.DEMO === "1"`.

---

## Reporter responsibilities

A custom reporter should:

1. Find the video attachment for each test (`result.attachments.find(a => a.name === "video")`).
2. **Defer to `onEnd`**: collect `{ sourcePath, slug }` pairs in `onTestEnd`,
   process them in `onEnd`.
3. Slugify the test title to a stable filename: `<feature>-<scenario>.webm`.
4. Skip warmup tests by slug prefix (`00-warmup-...`) — unlink their webm and
   rmdir their per-test folder so `test-results/` stays clean.
5. Skip 0-byte webms via `statSync` before invoking ffmpeg (don't feed an
   empty file to the encoder).
6. Convert webm → mp4 with `ffmpeg -c:v libx264 -preset veryfast -pix_fmt yuv420p -movflags +faststart`. Delete the source webm only on conversion success.
7. Remove empty per-test output folders after moving the video out.

---

## Demo scenario design

### Pick the right granularity

Goal: produce 3–6 demo videos that together cover every feature worth
showing. Not one video per feature — that's unwieldy. Group related features
by user journey:

- **Core workflow:** auth → main object CRUD → primary nested action
- **Power tool:** the standout feature that differentiates the app
- **Cross-cutting view:** dashboards, analytics, status pages
- **Social/external:** community, integrations, sharing

### Test data for repeatable demos

For accounts the demo creates fresh:
- Use a **deterministic, human-readable email** (e.g. `example@example.com`),
  not a timestamp-suffixed one. Viewers reading the form should see something
  recognizable.
- Make the registration step **idempotent**: before filling the form, attempt
  login + delete on that email. First run: login fails, registration creates.
  Re-runs: existing account is wiped, registration creates fresh.

Don't rely on cleanup hooks for demo accounts — they race with video
finalization (see above).

### Filename and ordering

- Prefix demo feature files with sort order: `01-core.feature`, `02-timer.feature`, etc.
  Playwright runs alphabetically; demos should play in narrative order.
- Warmup files use `00-` prefix so they sort before everything.

---

## Configuration template

Demo config should differ from QA config in:

```typescript
{
  timeout: 180_000,           // demos are long
  fullyParallel: false,       // see "0-byte first-test bug"
  workers: 1,                 // ditto
  retries: 0,                 // re-runs would record over the previous video
  use: {
    headless: true,           // headless still records video; saves a window
    viewport: { width: 2560, height: 1600 },  // max out for sharp playback
    video: {
      mode: "on",             // every test, every run
      size: { width: 2560, height: 1600 },  // must match viewport exactly
    },
    launchOptions: {
      slowMo: 1200,           // tune to taste; 800–1500 is the readable range
    },
  },
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      // Re-pin viewport at project level — the device preset overrides the
      // top-level `use` block silently.
      viewport: { width: 2560, height: 1600 },
      video: { mode: "on", size: { width: 2560, height: 1600 } },
    },
  }],
}
```

QA config inverts everything: `video: "retain-on-failure"`, no `slowMo`,
smaller viewport, parallel workers OK.

---

## Output for documentation

Per-feature GIFs in a README become unwieldy fast. Recommended pattern:

- Generate 3–6 mp4 demo videos via the demo suite.
- Convert each to a GIF (`ffmpeg -i in.mp4 -vf "fps=10,scale=960:-1" out.gif`)
  — keep fps low (8–12) and width ≤ 960px to stay under GitHub's 10 MB attach
  limit.
- Embed in README under collapsed `<details>` sections grouped by feature
  cluster, not by individual feature.

---

## Writing a narration script for the demos

If the user wants voiceover, write a project-specific markdown file
(e.g. `e2e/demo/SCRIPT.md`) with one section per video. Each section should
contain two artifacts:

1. **Clean script** — a single paragraph of prose, no stage directions, no
   timestamps. This is the literal text fed to a TTS LLM (ElevenLabs, OpenAI,
   etc.). The TTS will pace itself; alignment happens later in the editor.
2. **Timed beats** — a table of `(start time | line | on-screen action)`
   rows, for syncing the rendered audio to the video in a non-linear editor.

### Word budget

Target ~150 words per minute of video. Demos pace slow due to slowMo + dwells,
so prefer the **lower** end (130–145 wpm). For a typical demo:

| Video duration | Word target |
|---|---|
| 10–15 s | 25–35 |
| 15–25 s | 40–55 |
| 25–35 s | 60–80 |
| 35+ s   | ~140 wpm × seconds ÷ 60 |

Underwriting is safer than overwriting — the editor can pad silence; they
can't trim a script that runs past the final beat.

### Sound human, not announcer

Most TTS output goes wrong in the same direction: "promotional video" energy
— rising inflection, over-pronounced words, fake enthusiasm. Counter it
deliberately:

- **Use contractions.** "It's" not "it is", "you'll" not "you will". TTS
  models read formal text formally.
- **Vary sentence length.** Mix one short punchy line with one longer
  explanatory one. Uniform sentence length sounds robotic.
- **Avoid superlatives and marketing words.** Cut "powerful", "seamless",
  "intuitive", "robust", "cutting-edge". Describe what the user *does* and
  what *happens*, not how the product *feels*.
- **Don't open with the product name.** "Meet Foo." or "Welcome to Foo." reads
  as ad copy. Lead with the user action: "Sign up with an email…" lands as
  documentation.
- **Skip transition phrases.** "Now let's look at…", "Next, you'll see…" —
  the cuts in the video are the transitions. Narration that announces them
  is redundant.
- **Read it out loud.** If a phrase makes you self-conscious to say, the TTS
  will sound the same way. Rewrite it.

### Voice and delivery direction

When recommending a TTS configuration, suggest:

- **Voice:** understated, conversational. ElevenLabs "Adam"/"Brian", OpenAI
  "alloy"/"echo". Avoid anything labeled "narrator", "advertising",
  "broadcaster", or "promo".
- **Speed:** ~0.95× nominal. Demos already feel deliberate; matching speech
  to that rhythm reads as "considered" rather than "sluggish".
- **Stability / variability** (ElevenLabs-specific): bias toward stability;
  high variability tends to add the very theatrical inflection you're
  trying to avoid.

### Aligning audio to video

- Trim leading silence from the rendered audio. Most TTS adds 200–500 ms of
  ambient noise at the start.
- Offset the **first word** by ~500 ms from the video's first frame. Viewers
  need that beat to register the page before words begin.
- If audio finishes before video, pad with silence — don't cut the video.
  The trailing dwell on the final visual beat is part of the demo's rhythm.

### ffmpeg muxing

```bash
# Replace audio track on an existing demo mp4
ffmpeg -i demo.mp4 -i narration.mp3 \
  -map 0:v -map 1:a -c:v copy -c:a aac -shortest \
  demo-narrated.mp4

# Pad short audio with silence to match a target duration
ffmpeg -i narration.mp3 -af apad -t <video-duration-seconds> narration-padded.mp3
```

`-shortest` truncates to the shorter input — usually unwanted; pad the audio
first instead.

---

## Tuning knobs (env vars)

| Var | Default | Purpose |
|---|---|---|
| `DEMO` | `0` | Master switch. Hooks no-op when not `1`. |
| `DEMO_SLOWMO` | `1200` | Per-action pause in ms |
| `DEMO_TYPE_DELAY` | `70` | Per-character delay in ms for slow typing |
| `DEMO_TAIL_MS` | `1500` | Hold-final-frame duration at end of each scenario |
| `DEMO_DWELL_MS` | `1500` | Default dwell duration for `dwellForDemo()` |
| `DEMO_ZOOM` | `1.3` | CSS `zoom` factor on `<html>` |

Surface these as env vars, not hardcoded constants — different scenarios will
want different pacing.
