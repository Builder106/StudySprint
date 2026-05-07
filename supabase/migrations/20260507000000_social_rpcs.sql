-- Phase 2.4c — RPCs for cross-user reads + study rooms.
-- These endpoints can't be served by direct Supabase queries because RLS
-- (correctly) denies cross-user access. SECURITY DEFINER functions enforce
-- per-call access checks (auth.uid() membership, profiles.is_public, etc.)
-- before returning data.

-- pgcrypto provides crypt() / gen_salt('bf', ...) — bcrypt-compatible hashing
-- so passcodes hashed server-side here verify against the same format the
-- original Express bcryptjs handler used.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- leaderboard()
-- Top 25 public users by minutes logged in the last 7 days.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.leaderboard()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entries json;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.weekly_minutes DESC, t.username ASC), '[]'::json)
  INTO v_entries
  FROM (
    SELECT p.username,
           p.display_name,
           COALESCE(SUM(s.duration_minutes), 0)::int AS weekly_minutes
    FROM public.profiles p
    LEFT JOIN public.study_goals g ON g.user_id = p.id
    LEFT JOIN public.study_sessions s
      ON s.goal_id = g.id
     AND s.logged_at >= NOW() - INTERVAL '7 days'
    WHERE p.is_public = TRUE AND p.username IS NOT NULL
    GROUP BY p.id, p.username, p.display_name
    ORDER BY weekly_minutes DESC, p.username ASC
    LIMIT 25
  ) t;

  RETURN json_build_object('entries', v_entries);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leaderboard() TO authenticated;

-- ============================================================================
-- get_public_profile(p_username)
-- Profile + stats + recent sessions for a user. 404s for non-public profiles
-- (matches the original Express behavior — private profiles are invisible).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_public_profile(p_username text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_stats json;
  v_recent json;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE username = lower(p_username) AND is_public = TRUE;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT json_build_object(
    'total_minutes', COALESCE(SUM(s.duration_minutes), 0)::int,
    'total_sessions', COUNT(s.id)::int,
    'total_goals', COUNT(DISTINCT g.id)::int
  )
  INTO v_stats
  FROM public.study_goals g
  LEFT JOIN public.study_sessions s ON s.goal_id = g.id
  WHERE g.user_id = v_profile.id;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.logged_at DESC), '[]'::json)
  INTO v_recent
  FROM (
    SELECT s.duration_minutes, s.logged_at, g.title AS goal_title
    FROM public.study_sessions s
    JOIN public.study_goals g ON g.id = s.goal_id
    WHERE g.user_id = v_profile.id
    ORDER BY s.logged_at DESC
    LIMIT 8
  ) t;

  RETURN json_build_object(
    'user', json_build_object(
      'username', v_profile.username,
      'display_name', COALESCE(v_profile.display_name, v_profile.username),
      'bio', v_profile.bio,
      'joined_at', v_profile.created_at
    ),
    'stats', v_stats,
    'recent_sessions', v_recent
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO authenticated;

-- ============================================================================
-- list_my_rooms()
-- Rooms the caller is a member of, with member count + has_passcode flag.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_my_rooms()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rooms json;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
  INTO v_rooms
  FROM (
    SELECT r.slug,
           r.name,
           r.description,
           r.created_at,
           (r.passcode_hash IS NOT NULL) AS has_passcode,
           (SELECT COUNT(*)::int FROM public.room_members WHERE room_id = r.id) AS member_count
    FROM public.study_rooms r
    JOIN public.room_members rm ON rm.room_id = r.id AND rm.user_id = v_user_id
    ORDER BY r.created_at DESC
  ) t;

  RETURN json_build_object('rooms', v_rooms);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_my_rooms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_rooms() TO authenticated;

-- ============================================================================
-- create_room(p_name, p_description, p_passcode)
-- Creates a room with a slug derived from the name. Adds the caller as the
-- first member. Resolves slug collisions with random suffixes (max 10 tries).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_room(
  p_name text,
  p_description text DEFAULT NULL,
  p_passcode text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_trimmed_name text;
  v_slug text;
  v_final_slug text;
  v_attempt int := 0;
  v_passcode_hash text;
  v_room_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) < 3 THEN
    RAISE EXCEPTION 'Name must be at least 3 characters' USING ERRCODE = '22000';
  END IF;

  v_trimmed_name := substring(trim(p_name) from 1 for 80);

  -- Slugify: lowercase, strip non-alphanumeric (preserve dashes/spaces),
  -- collapse whitespace to single dash, cap at 50 chars.
  v_slug := substring(
    regexp_replace(
      regexp_replace(lower(v_trimmed_name), '[^a-z0-9\s-]', '', 'g'),
      '\s+', '-', 'g'
    )
    from 1 for 50
  );
  IF v_slug !~ '^[a-z0-9-]{3,50}$' THEN
    RAISE EXCEPTION 'Name must include letters or digits' USING ERRCODE = '22000';
  END IF;

  v_final_slug := v_slug;
  WHILE v_attempt < 10 AND EXISTS (SELECT 1 FROM public.study_rooms WHERE slug = v_final_slug) LOOP
    v_attempt := v_attempt + 1;
    v_final_slug := v_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
  END LOOP;

  IF p_passcode IS NOT NULL AND length(p_passcode) > 0 THEN
    v_passcode_hash := crypt(p_passcode, gen_salt('bf', 10));
  END IF;

  INSERT INTO public.study_rooms (slug, name, description, passcode_hash, created_by)
  VALUES (
    v_final_slug,
    v_trimmed_name,
    CASE WHEN p_description IS NOT NULL THEN substring(p_description from 1 for 500) END,
    v_passcode_hash,
    v_user_id
  )
  RETURNING id INTO v_room_id;

  INSERT INTO public.room_members (room_id, user_id) VALUES (v_room_id, v_user_id);

  RETURN json_build_object('slug', v_final_slug);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_room(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_room(text, text, text) TO authenticated;

-- ============================================================================
-- get_room(p_slug)
-- Full room view: room metadata, member list (with public-or-not flag), and
-- recent activity (sessions logged by members in the last 48h). Caller must
-- be a member; non-members get a 403-equivalent error with has_passcode hint.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_room(p_slug text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_room public.study_rooms;
  v_is_member boolean;
  v_members json;
  v_activity json;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_room FROM public.study_rooms WHERE slug = p_slug;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = v_room.id AND user_id = v_user_id
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    -- Encode the has_passcode hint into the error payload so the frontend can
    -- prompt for a passcode without an extra round-trip.
    RAISE EXCEPTION 'NOT_MEMBER:%', (v_room.passcode_hash IS NOT NULL)::text
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.joined_at ASC), '[]'::json)
  INTO v_members
  FROM (
    SELECT p.username, p.display_name, p.is_public, rm.joined_at
    FROM public.room_members rm
    JOIN public.profiles p ON p.id = rm.user_id
    WHERE rm.room_id = v_room.id
    ORDER BY rm.joined_at ASC
  ) t;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.logged_at DESC), '[]'::json)
  INTO v_activity
  FROM (
    SELECT s.id,
           s.duration_minutes,
           s.logged_at,
           p.username,
           p.display_name,
           g.title AS goal_title
    FROM public.study_sessions s
    JOIN public.study_goals g ON g.id = s.goal_id
    JOIN public.profiles p ON p.id = g.user_id
    JOIN public.room_members rm ON rm.user_id = p.id AND rm.room_id = v_room.id
    WHERE s.logged_at >= NOW() - INTERVAL '48 hours'
    ORDER BY s.logged_at DESC
    LIMIT 30
  ) t;

  RETURN json_build_object(
    'room', json_build_object(
      'slug', v_room.slug,
      'name', v_room.name,
      'description', v_room.description,
      'created_at', v_room.created_at,
      'is_owner', v_room.created_by = v_user_id,
      'has_passcode', v_room.passcode_hash IS NOT NULL
    ),
    'members', v_members,
    'recent_activity', v_activity
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_room(text) TO authenticated;

-- ============================================================================
-- join_room(p_slug, p_passcode)
-- Verifies passcode (if any) and inserts the caller as a member. Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.join_room(p_slug text, p_passcode text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_passcode_hash text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id, passcode_hash INTO v_room_id, v_passcode_hash
  FROM public.study_rooms WHERE slug = p_slug;

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_passcode_hash IS NOT NULL THEN
    IF p_passcode IS NULL OR crypt(p_passcode, v_passcode_hash) <> v_passcode_hash THEN
      RAISE EXCEPTION 'Incorrect passcode' USING ERRCODE = '28P01';
    END IF;
  END IF;

  INSERT INTO public.room_members (room_id, user_id)
  VALUES (v_room_id, v_user_id)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_room(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_room(text, text) TO authenticated;

-- ============================================================================
-- leave_room(p_slug)
-- Removes the caller from the room. If the room has zero members afterward,
-- delete the room itself (matches original Express behavior — orphan cleanup).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.leave_room(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_remaining int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_room_id FROM public.study_rooms WHERE slug = p_slug;
  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.room_members WHERE room_id = v_room_id AND user_id = v_user_id;

  SELECT COUNT(*)::int INTO v_remaining FROM public.room_members WHERE room_id = v_room_id;
  IF v_remaining = 0 THEN
    DELETE FROM public.study_rooms WHERE id = v_room_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.leave_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_room(text) TO authenticated;
