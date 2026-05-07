-- Fix: generate_series(date, date, interval) returns timestamptz, not date.
-- The original RPC then did `day - row_number()` in active_islands, which
-- triggers `operator does not exist: timestamp with time zone - integer`.
-- Cast the generated column to date in the daily CTE so all downstream
-- arithmetic uses date - int (which is valid and returns a date).

CREATE OR REPLACE FUNCTION public.analytics_summary()
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
   v_user_id uuid := auth.uid();
   v_daily json;
   v_hourly json;
   v_weekday json;
   v_by_subject json;
   v_total_minutes int;
   v_sessions_last_365 int;
   v_current_streak int;
   v_longest_streak int;
BEGIN
   IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
   END IF;

   WITH daily AS (
      SELECT d.day::date AS day,
             COALESCE(SUM(s.duration_minutes), 0)::int AS minutes
      FROM generate_series(
         (CURRENT_DATE - INTERVAL '364 days')::date,
         CURRENT_DATE::date,
         '1 day'
      ) AS d(day)
      LEFT JOIN public.study_sessions s
         ON s.goal_id IN (SELECT id FROM public.study_goals WHERE user_id = v_user_id)
        AND (s.logged_at AT TIME ZONE 'UTC')::date = d.day::date
      GROUP BY d.day::date
   ),
   daily_with_gaps AS (
      SELECT day, minutes,
         SUM(CASE WHEN minutes = 0 THEN 1 ELSE 0 END) OVER (ORDER BY day DESC) AS gaps_after
      FROM daily
   ),
   active_islands AS (
      -- Gap-and-island: consecutive active days share the same (day - row_number()).
      SELECT day,
         day - (ROW_NUMBER() OVER (ORDER BY day))::int AS grp
      FROM daily WHERE minutes > 0
   ),
   streak_lengths AS (
      SELECT COUNT(*) AS len FROM active_islands GROUP BY grp
   )
   SELECT
      (SELECT json_agg(json_build_object(
                  'date', to_char(day, 'YYYY-MM-DD'),
                  'minutes', minutes
              ) ORDER BY day) FROM daily),
      (SELECT COALESCE(SUM(minutes), 0)::int FROM daily),
      (SELECT COUNT(*)::int FROM daily WHERE minutes > 0),
      (SELECT COALESCE(COUNT(*), 0)::int FROM daily_with_gaps
         WHERE gaps_after = 0 AND minutes > 0),
      (SELECT COALESCE(MAX(len), 0)::int FROM streak_lengths)
   INTO v_daily, v_total_minutes, v_sessions_last_365, v_current_streak, v_longest_streak;

   SELECT COALESCE(json_agg(json_build_object('hour', hour, 'minutes', minutes) ORDER BY hour), '[]'::json)
   INTO v_hourly
   FROM (
      SELECT EXTRACT(HOUR FROM s.logged_at AT TIME ZONE 'UTC')::int AS hour,
             SUM(s.duration_minutes)::int AS minutes
      FROM public.study_sessions s
      JOIN public.study_goals g ON g.id = s.goal_id
      WHERE g.user_id = v_user_id
      GROUP BY hour
   ) h;

   SELECT COALESCE(json_agg(json_build_object('dow', dow, 'minutes', minutes) ORDER BY dow), '[]'::json)
   INTO v_weekday
   FROM (
      SELECT EXTRACT(DOW FROM s.logged_at AT TIME ZONE 'UTC')::int AS dow,
             SUM(s.duration_minutes)::int AS minutes
      FROM public.study_sessions s
      JOIN public.study_goals g ON g.id = s.goal_id
      WHERE g.user_id = v_user_id
      GROUP BY dow
   ) w;

   SELECT COALESCE(json_agg(json_build_object('subject', subject, 'minutes', minutes) ORDER BY minutes DESC), '[]'::json)
   INTO v_by_subject
   FROM (
      SELECT sub.name AS subject,
             SUM(s.duration_minutes)::int AS minutes
      FROM public.study_sessions s
      JOIN public.study_goals g ON g.id = s.goal_id
      JOIN public.goal_subjects gs ON gs.goal_id = g.id
      JOIN public.subjects sub ON sub.id = gs.subject_id
      WHERE g.user_id = v_user_id
      GROUP BY sub.name
   ) bs;

   RETURN json_build_object(
      'daily', COALESCE(v_daily, '[]'::json),
      'hourly', v_hourly,
      'weekday', v_weekday,
      'by_subject', v_by_subject,
      'totals', json_build_object(
         'minutes', v_total_minutes,
         'sessions_last_365', v_sessions_last_365,
         'current_streak_days', v_current_streak,
         'longest_streak_days', v_longest_streak
      )
   );
END;
$$;
