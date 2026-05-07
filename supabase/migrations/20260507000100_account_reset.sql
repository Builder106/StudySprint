-- Phase 2.4d — account reset RPC.
-- Wipes the caller's goals/sessions/rooms/google-tokens and reinstalls
-- the starter goal set. Scoped to the caller only; no other user's data
-- is touched. Replaces the original Express POST /api/admin/reset.

-- Starter subjects + goals are seeded into a couple of helper functions
-- so the RPC stays readable. The data here mirrors backend/lib/starterData.js.

CREATE OR REPLACE FUNCTION public.seed_starter_subjects()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'Computer Science',
    'Mathematics',
    'Languages',
    'Writing',
    'Science'
  ] LOOP
    INSERT INTO public.subjects (name) VALUES (v_name)
    ON CONFLICT (name) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_starter_subjects() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_starter_data_for(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal_id uuid;
  v_subject_id uuid;
BEGIN
  PERFORM public.seed_starter_subjects();

  -- Goal 1: Welcome sprint (Writing)
  INSERT INTO public.study_goals (user_id, title, description, target_hours, status)
  VALUES (
    p_user_id,
    'Welcome sprint',
    'Your first study goal. Log a quick session to see how tracking works, then edit or delete this anytime.',
    5,
    'Active'
  )
  RETURNING id INTO v_goal_id;

  SELECT id INTO v_subject_id FROM public.subjects WHERE name = 'Writing';
  IF v_subject_id IS NOT NULL THEN
    INSERT INTO public.goal_subjects (goal_id, subject_id) VALUES (v_goal_id, v_subject_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Goal 2: Weekly reading (Languages)
  INSERT INTO public.study_goals (user_id, title, description, target_hours, status)
  VALUES (
    p_user_id,
    'Weekly reading',
    'Read for 30 minutes a day across the week.',
    3.5,
    'Active'
  )
  RETURNING id INTO v_goal_id;

  SELECT id INTO v_subject_id FROM public.subjects WHERE name = 'Languages';
  IF v_subject_id IS NOT NULL THEN
    INSERT INTO public.goal_subjects (goal_id, subject_id) VALUES (v_goal_id, v_subject_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_starter_data_for(uuid) FROM PUBLIC;

-- ============================================================================
-- reset_account()
-- Caller wipes own data and gets the starter goals reinstalled.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_account()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- study_sessions and goal_subjects cascade from study_goals via ON DELETE CASCADE.
  DELETE FROM public.study_goals       WHERE user_id = v_user_id;
  DELETE FROM public.user_google_tokens WHERE user_id = v_user_id;
  DELETE FROM public.room_members      WHERE user_id = v_user_id;

  PERFORM public.create_starter_data_for(v_user_id);

  RETURN json_build_object('ok', true, 'message', 'Account reset to starter state');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_account() TO authenticated;
