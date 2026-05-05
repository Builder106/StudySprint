-- StudySprint initial schema (Supabase)
-- Replaces the original backend/sql/schema.sql:
--   * `users` is gone — Supabase Auth owns identity in `auth.users` (UUID PKs).
--   * A `profiles` table mirrors `auth.users.id` and holds the social fields
--     (username, display_name, bio, is_public).
--   * All FKs that pointed to `users(id)` now point to `auth.users(id)`.

-- ============================================================================
-- Tables
-- ============================================================================

CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT UNIQUE,
  display_name TEXT,
  bio          TEXT,
  is_public    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.subjects (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE public.study_goals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  target_hours NUMERIC(6,2) NOT NULL CHECK (target_hours > 0),
  status       TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Paused','Completed')),
  target_date  DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX study_goals_user_id_idx ON public.study_goals(user_id);

CREATE TABLE public.goal_subjects (
  goal_id    UUID NOT NULL REFERENCES public.study_goals(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, subject_id)
);

CREATE TABLE public.study_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id          UUID NOT NULL REFERENCES public.study_goals(id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  notes            TEXT,
  logged_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quality          INTEGER CHECK (quality BETWEEN 1 AND 5),
  next_review_at   TIMESTAMPTZ,
  gcal_event_id    TEXT
);

CREATE INDEX study_sessions_goal_id_idx ON public.study_sessions(goal_id);

CREATE TABLE public.user_google_tokens (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token  TEXT,
  refresh_token TEXT,
  expiry_date   BIGINT,
  scope         TEXT,
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.study_rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  passcode_hash TEXT,
  created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.room_members (
  room_id   UUID NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX room_members_user_id_idx ON public.room_members(user_id);

-- ============================================================================
-- Auto-create a profile row when a new auth user signs up
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- The function is only meant to be invoked by the trigger above, never via
-- PostgREST RPC. Revoke EXECUTE so anon/authenticated can't call it directly.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_goals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_subjects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_google_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members        ENABLE ROW LEVEL SECURITY;

-- profiles: SELECT public rows or your own; INSERT/UPDATE only your own
CREATE POLICY "profiles_select_public_or_own" ON public.profiles
  FOR SELECT USING (is_public OR auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- subjects: any authenticated user can read; writes are service-role only
CREATE POLICY "subjects_select_authenticated" ON public.subjects
  FOR SELECT TO authenticated USING (true);

-- study_goals: owner-only CRUD
CREATE POLICY "study_goals_owner_all" ON public.study_goals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- goal_subjects: ownership transitive via study_goals
CREATE POLICY "goal_subjects_owner_all" ON public.goal_subjects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.study_goals g
      WHERE g.id = goal_subjects.goal_id AND g.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.study_goals g
      WHERE g.id = goal_subjects.goal_id AND g.user_id = auth.uid()
    )
  );

-- study_sessions: ownership transitive via study_goals
CREATE POLICY "study_sessions_owner_all" ON public.study_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.study_goals g
      WHERE g.id = study_sessions.goal_id AND g.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.study_goals g
      WHERE g.id = study_sessions.goal_id AND g.user_id = auth.uid()
    )
  );

-- user_google_tokens: owner-only including SELECT (OAuth tokens never leave the owner)
CREATE POLICY "user_google_tokens_owner_all" ON public.user_google_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- study_rooms: any authenticated user can browse; creator manages
CREATE POLICY "study_rooms_select_authenticated" ON public.study_rooms
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "study_rooms_insert_creator" ON public.study_rooms
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "study_rooms_update_creator" ON public.study_rooms
  FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "study_rooms_delete_creator" ON public.study_rooms
  FOR DELETE USING (auth.uid() = created_by);

-- room_members: members can see membership of rooms they're in; join/leave self
CREATE POLICY "room_members_select_members" ON public.room_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm2
      WHERE rm2.room_id = room_members.room_id AND rm2.user_id = auth.uid()
    )
  );
CREATE POLICY "room_members_insert_self" ON public.room_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "room_members_delete_self" ON public.room_members
  FOR DELETE USING (auth.uid() = user_id);
