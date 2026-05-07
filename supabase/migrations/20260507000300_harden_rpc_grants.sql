-- Harden EXECUTE grants on the new SECURITY DEFINER functions.
-- REVOKE FROM PUBLIC is insufficient on Supabase because the platform
-- separately grants EXECUTE to the `anon` role on function creation.
-- We want every SECURITY DEFINER RPC callable only by `authenticated`.
-- Internal helpers (seed_starter_subjects, create_starter_data_for) are
-- called via PERFORM and should not be exposed as REST RPCs at all.

REVOKE EXECUTE ON FUNCTION public.leaderboard()                                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_public_profile(text)                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_my_rooms()                                FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_room(text, text, text)                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_room(text)                                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.join_room(text, text)                          FROM anon;
REVOKE EXECUTE ON FUNCTION public.leave_room(text)                               FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_account()                                FROM anon;

-- Internal helpers — strip both anon and authenticated. Only postgres + the
-- owner can run them (or other SECURITY DEFINER functions via PERFORM).
REVOKE EXECUTE ON FUNCTION public.seed_starter_subjects()                        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_starter_data_for(uuid)                  FROM anon, authenticated;
