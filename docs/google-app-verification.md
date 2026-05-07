# Google App Verification — playbook

Reference for getting StudySprint's Google Calendar integration usable by
the open internet (not just Test users). Calendar uses the `calendar.events`
scope which Google classifies as **sensitive**, so the only way to remove
the "Google hasn't verified this app" warning for non-test users is full
Brand + Scope verification.

## What's already done

- Privacy policy live at https://getstudysprint.vercel.app/privacy
- Terms of service live at https://getstudysprint.vercel.app/terms
- Both pages include the **Limited Use disclosure** that Google reviewers
  grep for ([Privacy.tsx](../frontend/app/components/Privacy.tsx) §
  "Limited Use disclosure")
- App branding configured in Google Cloud Console (App name "StudySprint",
  logo uploaded, support email, authorized domains)
- OAuth client carries both redirect URIs:
  - `https://eleihbdoivbetccumpet.supabase.co/auth/v1/callback` (sign-in)
  - `https://eleihbdoivbetccumpet.supabase.co/functions/v1/google-calendar/callback` (Calendar)

## Why publishing to Production isn't enough by itself

| Publishing state | Sensitive scope behavior |
|---|---|
| Testing (current) | Hard 403 for any non-test user. Refresh tokens expire after 7 days. Cap of 100 test users. |
| Production, **unverified** | Works for everyone, but consent screen shows "Google hasn't verified this app — Advanced → Continue (unsafe)" warning. Refresh tokens still expire after 7 days. |
| Production, **verified** | Clean consent. Refresh tokens permanent. |

For sign-in scopes (`email`, `profile`, `openid`) — non-sensitive — flipping
to Production is enough; no warning shown. For Calendar specifically,
verification is the only way to drop the warning.

## Prerequisites verification reviewers actually check

1. **Custom domain you own.** Free `.vercel.app` subdomains can't pass —
   you need to verify domain ownership in Google Search Console (DNS TXT
   record), and Vercel doesn't grant you DNS control over `vercel.app`.
2. **Hosted privacy policy URL** that loads without auth and contains the
   Limited Use language.
3. **Hosted terms of service URL.**
4. **Demo video** (30-90s, unlisted YouTube) showing the OAuth flow and
   the actual feature using the data.
5. **Scope justification** — written explanation of why `calendar.events`
   is the minimum scope you need.

## Manual checklist

### 1. Buy a domain (~$12/year)

```bash
vercel domains buy studysprint.app    # check availability first
vercel domains buy studysprint.dev    # alternative
vercel domains buy studysprint.io     # alternative
```

Cheaper alternative: buy through Cloudflare Registrar (at-cost), then
`vercel domains add <yourdomain> studysprint`.

### 2. Point the domain at Vercel

```bash
vercel domains add studysprint.app studysprint
```

After DNS propagates (5 min – 24 h), `https://studysprint.app/privacy`
should serve the same page as
`https://getstudysprint.vercel.app/privacy`. Vercel auto-issues a
Let's Encrypt cert. Promote to "Primary domain" in Vercel project settings.

### 3. Update every reference

| Location | New value |
|---|---|
| Google Cloud Console → OAuth consent screen → **Application home page** | `https://studysprint.app` |
| → **Authorized domains** | Add `studysprint.app`, remove `vercel.app` |
| → **Application privacy policy link** | `https://studysprint.app/privacy` |
| → **Application terms of service link** | `https://studysprint.app/terms` |
| Google Search Console | Verify ownership of `studysprint.app` (DNS TXT record). Required for verification. |
| Supabase → Authentication → URL Configuration → **Site URL** | `https://studysprint.app` |
| → **Redirect URLs** | Add `https://studysprint.app/**` (keep localhost entries for dev) |
| Edge Function secret `CLIENT_ORIGIN` | `https://studysprint.app` (so OAuth post-callback redirects land there) |
| `README.md` "Live app" link | `https://studysprint.app` |

The Edge Function `GOOGLE_REDIRECT_URI` does **not** change — Google's
callback always goes to the Supabase project URL, not your custom domain.

### 4. Record the demo video

Cover, in order, in one continuous take:

1. Open the app from a clean state (signed out, fresh browser profile)
2. Click "Sign in with Google" → consent screen → land on dashboard
3. Click "Connect Calendar" → consent screen showing the
   `calendar.events` scope → grant access
4. Use the integration: export a session to Calendar **or** import an
   upcoming event
5. Show the result (event appeared on Calendar, or session created in
   StudySprint)
6. Show the Disconnect button revoking access (optional but strengthens
   the submission)

Format: 1080p+, screen-only, no music, no narration unless it adds
genuinely useful context. Upload as **unlisted** YouTube and paste the
link in the verification form.

### 5. Submit for verification

In Google Cloud Console → OAuth consent screen, the **Submit for
Verification** button only appears once App name, logo, App domain (home
page + privacy + terms), and authorized domains are all populated.

Form fields:
- **Demo video URL** — the unlisted YouTube link from step 4
- **Scope justification** — sample text:
  > StudySprint lets users export their logged study sessions to Google
  > Calendar as events, and import upcoming Calendar events as scheduled
  > study sessions. The `calendar.events` scope is the minimum needed to
  > read and write events on the user's primary calendar; we don't need
  > read-only-all-calendars or full-account scopes.
- **Limited Use confirmation** — tick the box; the privacy policy already
  contains the required language.

Reviewer turnaround: **1–6 weeks**. Common revision asks:
- Logo too small or doesn't match brand on the consent screen
- Demo video missing a step (especially the disconnect/revoke flow)
- Privacy policy missing one of the four Limited Use bullets
- Domain ownership not verified in Search Console

## Order of operations

1. Buy domain
2. Point at Vercel + verify DNS
3. Update **every** reference in the table above
4. Confirm sign-in + Calendar connect still work end-to-end on the new domain
5. Record the demo video
6. Submit

Don't submit before step 4 — reviewers click each URL in the consent
screen config. A 404 on the privacy or terms link is a guaranteed bounce.

## Fallback: switch to a non-sensitive scope

If verification feels too heavy for a portfolio app, swap
`calendar.events` for `calendar.app.created` in
[supabase/functions/google-calendar/index.ts](../supabase/functions/google-calendar/index.ts).
This is non-sensitive, requires no verification ever, but loses the
"Import existing event" feature (only events StudySprint *created* are
visible/editable). Export-to-Calendar still works fully — and is
arguably the more interesting demo direction.

## Once verified

- Refresh tokens become permanent (no more 7-day expiry)
- Consent screen drops the "unverified" warning
- Up to 100 test users no longer matters; anyone can authorize
- App must keep meeting Limited Use requirements; if you add new
  sensitive scopes later, they need their own verification round
