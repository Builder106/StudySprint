import { supabase } from "./supabase";
import type { TablesUpdate } from "./database.types";
import {
   computeGamificationProfile,
   type GamificationProfile,
   type GamificationSession,
} from "./gamification";
import type { Goal, GoalStatus, SessionQuality, StudySession } from "./types";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "");

async function getAuthToken(): Promise<string | null> {
   const { data } = await supabase.auth.getSession();
   return data.session?.access_token ?? null;
}

async function getUserId(): Promise<string> {
   const { data } = await supabase.auth.getSession();
   if (!data.session) throw new ApiError(401, "Not authenticated");
   return data.session.user.id;
}

// Edge Function fetch — used for sub-route dispatch on `google-calendar` (the
// Supabase JS `functions.invoke()` helper doesn't expose path/method overrides
// cleanly, so we hit the function URL directly with the user's auth header).
async function functionsFetch<T>(
   path: string,
   options: RequestInit = {},
): Promise<T> {
   const headers = new Headers(options.headers);
   if (
      options.body &&
      !headers.has("Content-Type") &&
      !(options.body instanceof FormData)
   ) {
      headers.set("Content-Type", "application/json");
   }
   const token = await getAuthToken();
   if (token) headers.set("Authorization", `Bearer ${token}`);

   const res = await fetch(`${SUPABASE_URL}/functions/v1${path}`, { ...options, headers });
   if (res.status === 204) return undefined as T;

   const data = res.headers.get("content-type")?.includes("application/json")
      ? await res.json()
      : null;
   if (!res.ok) {
      throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
   }
   return data as T;
}

export class ApiError extends Error {
   status: number;
   constructor(status: number, message: string) {
      super(message);
      this.status = status;
   }
}

// Phase 2.3a — goal CRUD now goes direct to Supabase Postgres (RLS-protected).

interface GoalRow {
   id: string;
   title: string;
   description: string | null;
   target_hours: number | string;
   status: GoalStatus;
   target_date: string | null;
   created_at: string;
   updated_at: string;
   logged_minutes: number | null;
   subjects: string[] | null;
}

function rowToGoal(row: GoalRow | null | undefined): Goal {
   if (!row) throw new ApiError(404, "Goal not found");
   return {
      id: row.id,
      title: row.title,
      description: row.description,
      target_hours: row.target_hours,
      status: row.status,
      target_date: row.target_date,
      created_at: row.created_at,
      updated_at: row.updated_at,
      logged_minutes: row.logged_minutes ?? 0,
      subjects: row.subjects ?? [],
   };
}

async function listGoalsImpl(): Promise<{ goals: Goal[] }> {
   const { data, error } = await supabase
      .from("goals_with_stats")
      .select("*")
      .order("created_at", { ascending: false });
   if (error) throw new ApiError(500, error.message);
   return { goals: (data ?? []).map((r) => rowToGoal(r as GoalRow)) };
}

async function getGoalImpl(id: string): Promise<{ goal: Goal }> {
   const { data, error } = await supabase
      .from("goals_with_stats")
      .select("*")
      .eq("id", id)
      .maybeSingle();
   if (error) throw new ApiError(500, error.message);
   if (!data) throw new ApiError(404, "Goal not found");
   return { goal: rowToGoal(data as GoalRow) };
}

interface CreateGoalInput {
   title: string;
   description?: string;
   target_hours: number;
   status?: string;
   target_date?: string | null;
   subjects?: string[];
}

async function createGoalImpl(input: CreateGoalInput): Promise<{ goal: Goal }> {
   const userId = await getUserId();
   const { data: inserted, error } = await supabase
      .from("study_goals")
      .insert({
         user_id: userId,
         title: input.title,
         description: input.description ?? null,
         target_hours: input.target_hours,
         status: (input.status as GoalStatus) ?? "Active",
         target_date: input.target_date ?? null,
      })
      .select("id")
      .single();
   if (error) throw new ApiError(500, error.message);

   if (input.subjects && input.subjects.length > 0) {
      const { error: rpcError } = await supabase.rpc("set_goal_subjects", {
         p_goal_id: inserted.id,
         p_names: input.subjects,
      });
      if (rpcError) throw new ApiError(500, rpcError.message);
   }

   return getGoalImpl(inserted.id);
}

interface UpdateGoalInput {
   title?: string;
   description?: string;
   target_hours?: number;
   status?: string;
   target_date?: string | null;
   subjects?: string[];
}

async function updateGoalImpl(
   id: string,
   input: UpdateGoalInput,
): Promise<{ goal: Goal }> {
   const updateFields: TablesUpdate<"study_goals"> = {};
   if ("title" in input && input.title !== undefined) updateFields.title = input.title;
   if ("description" in input) updateFields.description = input.description ?? null;
   if ("target_hours" in input && input.target_hours !== undefined) updateFields.target_hours = input.target_hours;
   if ("status" in input && input.status !== undefined) updateFields.status = input.status;
   if ("target_date" in input) updateFields.target_date = input.target_date ?? null;

   if (Object.keys(updateFields).length > 0) {
      updateFields.updated_at = new Date().toISOString();
      const { error } = await supabase
         .from("study_goals")
         .update(updateFields)
         .eq("id", id);
      if (error) throw new ApiError(500, error.message);
   }

   if (input.subjects !== undefined) {
      const { error } = await supabase.rpc("set_goal_subjects", {
         p_goal_id: id,
         p_names: input.subjects ?? [],
      });
      if (error) throw new ApiError(500, error.message);
   }

   return getGoalImpl(id);
}

async function deleteGoalImpl(id: string): Promise<void> {
   const { error } = await supabase.from("study_goals").delete().eq("id", id);
   if (error) throw new ApiError(500, error.message);
}

// Phase 2.3b — session CRUD via direct Supabase queries.
// RLS on study_sessions enforces transitive ownership through study_goals
// (must own the parent goal). Spaced-repetition next_review_at is computed
// client-side, mirroring the original Express logic.

const QUALITY_REVIEW_DAYS: Record<1 | 2 | 3 | 4 | 5, number> = {
   1: 1,
   2: 2,
   3: 4,
   4: 7,
   5: 14,
};

function nextReviewFromQuality(
   quality: number | null,
   base: Date = new Date(),
): string | null {
   if (quality === null || !(quality in QUALITY_REVIEW_DAYS)) return null;
   const days = QUALITY_REVIEW_DAYS[quality as 1 | 2 | 3 | 4 | 5];
   const d = new Date(base);
   d.setDate(d.getDate() + days);
   return d.toISOString();
}

interface SessionRow {
   id: string;
   goal_id: string;
   duration_minutes: number;
   notes: string | null;
   logged_at: string;
   quality: number | null;
   next_review_at: string | null;
   gcal_event_id: string | null;
}

function rowToSession(row: SessionRow): StudySession {
   return {
      id: row.id,
      goal_id: row.goal_id,
      duration_minutes: row.duration_minutes,
      notes: row.notes,
      logged_at: row.logged_at,
      quality: row.quality as SessionQuality | null,
      next_review_at: row.next_review_at,
      gcal_event_id: row.gcal_event_id,
   };
}

interface CreateSessionInput {
   duration_minutes: number;
   notes?: string;
   logged_at?: string;
   quality?: number | null;
}

interface UpdateSessionInput {
   duration_minutes?: number;
   notes?: string;
   quality?: number | null;
}

async function listSessionsImpl(goalId: string): Promise<{ sessions: StudySession[] }> {
   const { data, error } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("goal_id", goalId)
      .order("logged_at", { ascending: false });
   if (error) throw new ApiError(500, error.message);
   return { sessions: (data ?? []).map(rowToSession) };
}

async function createSessionImpl(
   goalId: string,
   input: CreateSessionInput,
): Promise<{ session: StudySession }> {
   const mins = Math.round(input.duration_minutes);
   if (!Number.isFinite(mins) || mins <= 0) {
      throw new ApiError(400, "duration_minutes must be greater than 0");
   }
   const quality = input.quality ?? null;
   const reviewAt = quality !== null ? nextReviewFromQuality(quality) : null;
   const { data, error } = await supabase
      .from("study_sessions")
      .insert({
         goal_id: goalId,
         duration_minutes: mins,
         notes: input.notes ?? null,
         logged_at: input.logged_at ?? new Date().toISOString(),
         quality,
         next_review_at: reviewAt,
      })
      .select()
      .single();
   if (error) throw new ApiError(500, error.message);
   return { session: rowToSession(data) };
}

async function updateSessionImpl(
   sessionId: string,
   input: UpdateSessionInput,
): Promise<{ session: StudySession }> {
   const updates: TablesUpdate<"study_sessions"> = {};
   if (input.duration_minutes !== undefined) {
      const mins = Math.round(input.duration_minutes);
      if (!Number.isFinite(mins) || mins <= 0) {
         throw new ApiError(400, "duration_minutes must be greater than 0");
      }
      updates.duration_minutes = mins;
   }
   if ("notes" in input) updates.notes = input.notes ?? null;
   if ("quality" in input) {
      if (input.quality === null || input.quality === undefined) {
         updates.quality = null;
         updates.next_review_at = null;
      } else {
         updates.quality = input.quality;
         updates.next_review_at = nextReviewFromQuality(input.quality);
      }
   }
   const { data, error } = await supabase
      .from("study_sessions")
      .update(updates)
      .eq("id", sessionId)
      .select()
      .single();
   if (error) throw new ApiError(500, error.message);
   return { session: rowToSession(data) };
}

async function deleteSessionImpl(sessionId: string): Promise<void> {
   const { error } = await supabase
      .from("study_sessions")
      .delete()
      .eq("id", sessionId);
   if (error) throw new ApiError(500, error.message);
}

// Phase 2.3c — own-profile read/update via direct Supabase queries.
// Cross-user public profile (getProfile by username) stays on Express until
// Phase 2.4 makes it an RPC (it needs aggregate access to another user's
// study_goals/sessions, which RLS denies for direct queries).

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

interface MyProfileResult {
   user: {
      id: string;
      email: string;
      username: string | null;
      display_name: string | null;
      bio: string | null;
      is_public: boolean;
   };
}

async function getMyProfileImpl(): Promise<MyProfileResult> {
   const { data: sessionData } = await supabase.auth.getSession();
   const session = sessionData.session;
   if (!session) throw new ApiError(401, "Not authenticated");

   const { data: profile, error } = await supabase
      .from("profiles")
      .select("username, display_name, bio, is_public")
      .eq("id", session.user.id)
      .single();
   if (error) throw new ApiError(500, error.message);

   return {
      user: {
         id: session.user.id,
         email: session.user.email ?? "",
         username: profile.username,
         display_name: profile.display_name,
         bio: profile.bio,
         is_public: profile.is_public,
      },
   };
}

interface UpdateMyProfileInput {
   username?: string;
   display_name?: string | null;
   bio?: string | null;
   is_public?: boolean;
}

async function updateMyProfileImpl(
   input: UpdateMyProfileInput,
): Promise<MyProfileResult> {
   const { data: sessionData } = await supabase.auth.getSession();
   const session = sessionData.session;
   if (!session) throw new ApiError(401, "Not authenticated");

   const updates: TablesUpdate<"profiles"> = {};
   if (input.username !== undefined) {
      const normalized = input.username.toLowerCase();
      if (!USERNAME_RE.test(normalized)) {
         throw new ApiError(
            400,
            "Username must be 3-30 chars (lowercase letters, digits, underscore)",
         );
      }
      updates.username = normalized;
   }
   if ("display_name" in input) updates.display_name = input.display_name ?? null;
   if ("bio" in input) updates.bio = input.bio ?? null;
   if ("is_public" in input) updates.is_public = !!input.is_public;

   const { data: profile, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", session.user.id)
      .select("username, display_name, bio, is_public")
      .single();
   if (error) {
      // 23505 = unique_violation (username already taken)
      if (error.code === "23505") throw new ApiError(409, "Username is taken");
      throw new ApiError(500, error.message);
   }

   return {
      user: {
         id: session.user.id,
         email: session.user.email ?? "",
         username: profile.username,
         display_name: profile.display_name,
         bio: profile.bio,
         is_public: profile.is_public,
      },
   };
}

// Phase 2.4 — cross-user reads (leaderboard, public profile) and study rooms
// migrated to RPC functions (SECURITY DEFINER with explicit access checks).
// Phase 3 — syllabus parser and Google Calendar integration migrated to
// Supabase Edge Functions.

interface AnalyticsResult {
   daily: { date: string; minutes: number }[];
   hourly: { hour: number; minutes: number }[];
   weekday: { dow: number; minutes: number }[];
   by_subject: { subject: string; minutes: number }[];
   totals: {
      minutes: number;
      sessions_last_365: number;
      current_streak_days: number;
      longest_streak_days: number;
   };
}

interface LeaderboardResult {
   entries: { username: string; display_name: string | null; weekly_minutes: number }[];
}

interface PublicProfileResult {
   user: {
      username: string;
      display_name: string;
      bio: string | null;
      joined_at: string;
   };
   stats: { total_minutes: number; total_sessions: number; total_goals: number };
   recent_sessions: {
      duration_minutes: number;
      logged_at: string;
      goal_title: string;
   }[];
}

interface RoomSummary {
   slug: string;
   name: string;
   description: string | null;
   created_at: string;
   has_passcode: boolean;
   member_count: number;
}

interface RoomDetail {
   room: {
      slug: string;
      name: string;
      description: string | null;
      created_at: string;
      is_owner: boolean;
      has_passcode: boolean;
   };
   members: {
      username: string | null;
      display_name: string | null;
      is_public: boolean;
      joined_at: string;
   }[];
   recent_activity: {
      id: string;
      duration_minutes: number;
      logged_at: string;
      username: string | null;
      display_name: string | null;
      goal_title: string;
   }[];
}

// PostgREST surfaces RAISE EXCEPTION text on the .error.message field. A few
// of our RPCs encode small status hints into the message (e.g. NOT_MEMBER:true)
// so this helper translates them back into ApiError shapes the UI already
// knows how to handle.
function rpcError(message: string): ApiError {
   if (message.startsWith("NOT_MEMBER:")) {
      const hasPasscode = message.endsWith(":true");
      const err = new ApiError(403, "You are not a member of this room. Join first.");
      (err as ApiError & { hasPasscode?: boolean }).hasPasscode = hasPasscode;
      return err;
   }
   if (message === "Profile not found" || message === "Room not found") {
      return new ApiError(404, message);
   }
   if (message === "Incorrect passcode") return new ApiError(401, message);
   if (message === "Not authenticated") return new ApiError(401, message);
   if (message.startsWith("Name must")) return new ApiError(400, message);
   return new ApiError(500, message);
}

export const api = {
   listGoals: listGoalsImpl,
   getGoal: (id: string) => getGoalImpl(id),
   createGoal: createGoalImpl,
   updateGoal: (id: string, input: UpdateGoalInput) => updateGoalImpl(id, input),
   deleteGoal: (id: string) => deleteGoalImpl(id),

   listSessions: (goalId: string) => listSessionsImpl(goalId),
   createSession: (goalId: string, input: CreateSessionInput) =>
      createSessionImpl(goalId, input),
   updateSession: (sessionId: string, input: UpdateSessionInput) =>
      updateSessionImpl(sessionId, input),
   deleteSession: (sessionId: string) => deleteSessionImpl(sessionId),

   async analyticsSummary(): Promise<AnalyticsResult> {
      const { data, error } = await supabase.rpc("analytics_summary");
      if (error) throw new ApiError(500, error.message);
      return data as unknown as AnalyticsResult;
   },

   async gamificationProfile(): Promise<GamificationProfile> {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      // RLS filters both queries to the caller's own data.
      const [sessionsRes, linksRes] = await Promise.all([
         supabase
            .from("study_sessions")
            .select("id, duration_minutes, quality, logged_at"),
         supabase.from("goal_subjects").select("subjects ( name )"),
      ]);
      if (sessionsRes.error) throw new ApiError(500, sessionsRes.error.message);
      if (linksRes.error) throw new ApiError(500, linksRes.error.message);
      const sessions: GamificationSession[] = sessionsRes.data ?? [];
      const subjectNames = new Set<string>(
         (linksRes.data ?? [])
            .map((row: { subjects: { name: string } | null }) => row.subjects?.name)
            .filter((n): n is string => typeof n === "string"),
      );
      return computeGamificationProfile(sessions, subjectNames, tz);
   },

   googleStatus() {
      return functionsFetch<{ configured: boolean; connected: boolean }>(
         "/google-calendar/status",
      );
   },
   googleAuthUrl() {
      return functionsFetch<{ url: string }>("/google-calendar/auth-url", {
         method: "POST",
      });
   },
   googleDisconnect() {
      return functionsFetch<void>("/google-calendar/", { method: "DELETE" });
   },
   googleExportSession(sessionId: string) {
      return functionsFetch<{ event_id: string; html_link: string }>(
         `/google-calendar/export-session/${sessionId}`,
         { method: "POST" },
      );
   },
   googleUpcomingEvents(opts?: { from?: string; to?: string }) {
      const qs = new URLSearchParams();
      if (opts?.from) qs.set("from", opts.from);
      if (opts?.to) qs.set("to", opts.to);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return functionsFetch<{
         events: {
            id: string;
            summary: string;
            start: string | null;
            end: string | null;
            all_day: boolean;
            html_link: string;
            imported: { session_id: string; goal_id: string; goal_title: string } | null;
         }[];
      }>(`/google-calendar/upcoming-events${suffix}`);
   },
   googleImportEvent(eventId: string, goalId: string) {
      return functionsFetch<{ session: StudySession }>("/google-calendar/import-event", {
         method: "POST",
         body: JSON.stringify({ event_id: eventId, goal_id: goalId }),
      });
   },

   async resetAccount(): Promise<{ ok: boolean; message: string }> {
      const { data, error } = await supabase.rpc("reset_account");
      if (error) throw rpcError(error.message);
      return data as { ok: boolean; message: string };
   },

   getMyProfile: () => getMyProfileImpl(),
   updateMyProfile: (input: UpdateMyProfileInput) => updateMyProfileImpl(input),

   async getProfile(username: string): Promise<PublicProfileResult> {
      const { data, error } = await supabase.rpc("get_public_profile", {
         p_username: username,
      });
      if (error) throw rpcError(error.message);
      return data as unknown as PublicProfileResult;
   },

   async leaderboard(): Promise<LeaderboardResult> {
      const { data, error } = await supabase.rpc("leaderboard");
      if (error) throw rpcError(error.message);
      return data as unknown as LeaderboardResult;
   },

   async listRooms(): Promise<{ rooms: RoomSummary[] }> {
      const { data, error } = await supabase.rpc("list_my_rooms");
      if (error) throw rpcError(error.message);
      return data as unknown as { rooms: RoomSummary[] };
   },

   async createRoom(input: {
      name: string;
      description?: string;
      passcode?: string;
   }): Promise<{ slug: string }> {
      const { data, error } = await supabase.rpc("create_room", {
         p_name: input.name,
         p_description: input.description ?? null,
         p_passcode: input.passcode ?? null,
      });
      if (error) throw rpcError(error.message);
      return data as unknown as { slug: string };
   },

   async getRoom(slug: string): Promise<RoomDetail> {
      const { data, error } = await supabase.rpc("get_room", { p_slug: slug });
      if (error) throw rpcError(error.message);
      return data as unknown as RoomDetail;
   },

   async joinRoom(slug: string, passcode?: string): Promise<{ ok: boolean }> {
      const { data, error } = await supabase.rpc("join_room", {
         p_slug: slug,
         p_passcode: passcode ?? null,
      });
      if (error) throw rpcError(error.message);
      return data as unknown as { ok: boolean };
   },

   async leaveRoom(slug: string): Promise<void> {
      const { error } = await supabase.rpc("leave_room", { p_slug: slug });
      if (error) throw rpcError(error.message);
   },

   async parseSyllabus(input: { text?: string; file?: File }) {
      let body: BodyInit;
      const headers: Record<string, string> = {};
      if (input.file) {
         const form = new FormData();
         form.append("pdf", input.file);
         if (input.text) form.append("text", input.text);
         body = form;
      } else {
         headers["Content-Type"] = "application/json";
         body = JSON.stringify({ text: input.text ?? "" });
      }
      return functionsFetch<{
         goals: {
            title: string;
            description: string;
            target_hours: number;
            target_date: string | null;
            subjects: string[];
         }[];
         model: string;
      }>("/syllabus-parse", { method: "POST", headers, body });
   },
};
