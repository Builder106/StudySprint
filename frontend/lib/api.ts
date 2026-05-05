import { supabase } from "./supabase";
import type { TablesUpdate } from "./database.types";
import {
   computeGamificationProfile,
   type GamificationProfile,
   type GamificationSession,
} from "./gamification";
import type { Goal, GoalStatus, SessionQuality, StudySession } from "./types";

const API_BASE =
   (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
   "http://localhost:4000";

async function getAuthToken(): Promise<string | null> {
   const { data } = await supabase.auth.getSession();
   return data.session?.access_token ?? null;
}

async function getUserId(): Promise<string> {
   const { data } = await supabase.auth.getSession();
   if (!data.session) throw new ApiError(401, "Not authenticated");
   return data.session.user.id;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
   const headers = new Headers(options.headers);
   if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
   }
   const token = await getAuthToken();
   if (token) headers.set("Authorization", `Bearer ${token}`);

   const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

   if (res.status === 401) throw new ApiError(401, "Unauthorized");
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

// Endpoints below still hit Express until Phase 2.4 makes them RPCs
// (analytics, gamification, leaderboard, rooms, public profile lookup) or
// Phase 3 makes them Deno Edge Functions (syllabus, integrations).

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

   async analyticsSummary() {
      const { data, error } = await supabase.rpc("analytics_summary");
      if (error) throw new ApiError(500, error.message);
      return data as unknown as {
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
      };
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
      return request<{ configured: boolean; connected: boolean }>(
         "/api/integrations/google/status",
      );
   },
   googleAuthUrl() {
      return request<{ url: string }>("/api/integrations/google/auth-url", {
         method: "POST",
      });
   },
   googleDisconnect() {
      return request<void>("/api/integrations/google", { method: "DELETE" });
   },
   googleExportSession(sessionId: string) {
      return request<{ event_id: string; html_link: string }>(
         `/api/integrations/google/export-session/${sessionId}`,
         { method: "POST" },
      );
   },
   googleUpcomingEvents(opts?: { from?: string; to?: string }) {
      const qs = new URLSearchParams();
      if (opts?.from) qs.set("from", opts.from);
      if (opts?.to) qs.set("to", opts.to);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return request<{
         events: {
            id: string;
            summary: string;
            start: string | null;
            end: string | null;
            all_day: boolean;
            html_link: string;
            imported: { session_id: string; goal_id: string; goal_title: string } | null;
         }[];
      }>(`/api/integrations/google/upcoming-events${suffix}`);
   },
   googleImportEvent(eventId: string, goalId: string) {
      return request<{ session: StudySession }>(
         "/api/integrations/google/import-event",
         {
            method: "POST",
            body: JSON.stringify({ event_id: eventId, goal_id: goalId }),
         },
      );
   },

   resetAccount() {
      return request<{ ok: boolean; message: string }>("/api/admin/reset", {
         method: "POST",
      });
   },

   getMyProfile: () => getMyProfileImpl(),
   updateMyProfile: (input: UpdateMyProfileInput) => updateMyProfileImpl(input),
   getProfile(username: string) {
      return request<{
         user: { username: string; display_name: string; bio: string | null; joined_at: string };
         stats: { total_minutes: number; total_sessions: number; total_goals: number };
         recent_sessions: { duration_minutes: number; logged_at: string; goal_title: string }[];
      }>(`/api/profiles/${encodeURIComponent(username)}`);
   },
   leaderboard() {
      return request<{
         entries: { username: string; display_name: string | null; weekly_minutes: number }[];
      }>("/api/leaderboard");
   },
   listRooms() {
      return request<{
         rooms: {
            slug: string;
            name: string;
            description: string | null;
            created_at: string;
            has_passcode: boolean;
            member_count: number;
         }[];
      }>("/api/rooms");
   },
   createRoom(input: { name: string; description?: string; passcode?: string }) {
      return request<{ slug: string }>("/api/rooms", {
         method: "POST",
         body: JSON.stringify(input),
      });
   },
   getRoom(slug: string) {
      return request<{
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
      }>(`/api/rooms/${encodeURIComponent(slug)}`);
   },
   joinRoom(slug: string, passcode?: string) {
      return request<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(slug)}/join`, {
         method: "POST",
         body: JSON.stringify({ passcode }),
      });
   },
   leaveRoom(slug: string) {
      return request<void>(`/api/rooms/${encodeURIComponent(slug)}/leave`, {
         method: "POST",
      });
   },

   async parseSyllabus(input: { text?: string; file?: File }) {
      const headers = new Headers();
      const token = await getAuthToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      let body: BodyInit;
      if (input.file) {
         const form = new FormData();
         form.append("pdf", input.file);
         if (input.text) form.append("text", input.text);
         body = form;
      } else {
         headers.set("Content-Type", "application/json");
         body = JSON.stringify({ text: input.text ?? "" });
      }
      const res = await fetch(`${API_BASE}/api/syllabus/parse`, {
         method: "POST",
         headers,
         body,
      });
      const data = res.headers.get("content-type")?.includes("application/json")
         ? await res.json()
         : null;
      if (!res.ok) {
         throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
      }
      return data as {
         goals: {
            title: string;
            description: string;
            target_hours: number;
            target_date: string | null;
            subjects: string[];
         }[];
         model: string;
      };
   },
};
