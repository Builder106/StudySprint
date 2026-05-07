-- Phase 3 — Google Calendar OAuth state store.
-- Replaces the in-memory Map in the original Express integrations route.
-- Edge Functions are stateless across cold starts, so we persist the short-
-- lived state -> userId mapping in a table instead. Rows expire after 10
-- minutes; reaping happens lazily on each auth-url request.

CREATE TABLE public.oauth_states (
  state      TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX oauth_states_expires_at_idx ON public.oauth_states(expires_at);

-- Service-role only — never read or written by the client. Edge Functions
-- use the service-role key when interacting with this table.
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
-- (No policies = no anon/authenticated access. Service role bypasses RLS.)
