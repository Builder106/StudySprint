import { supabase } from "./supabase";
import type { Goal, StudySession } from "./types";

const API_BASE =
   (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
   "http://localhost:4000";

async function getAuthToken(): Promise<string | null> {
   const { data } = await supabase.auth.getSession();
   return data.session?.access_token ?? null;
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

// Auth methods (register/login/me) live on supabase.auth via lib/auth.tsx now.
// Endpoints below still hit Express until each Phase 2 sub-task migrates them
// to direct supabase-js queries or (Phase 3) Deno Edge Functions.

export const api = {
   listGoals() {
      return request<{ goals: Goal[] }>("/api/goals");
   },
   createGoal(input: {
      title: string;
      description?: string;
      target_hours: number;
      status?: string;
      target_date?: string | null;
      subjects?: string[];
   }) {
      return request<{ goal: Goal }>("/api/goals", {
         method: "POST",
         body: JSON.stringify(input),
      });
   },
   getGoal(id: number | string) {
      return request<{ goal: Goal }>(`/api/goals/${id}`);
   },
   updateGoal(
      id: number | string,
      input: Partial<{
         title: string;
         description: string;
         target_hours: number;
         status: string;
         target_date: string | null;
         subjects: string[];
      }>,
   ) {
      return request<{ goal: Goal }>(`/api/goals/${id}`, {
         method: "PUT",
         body: JSON.stringify(input),
      });
   },
   deleteGoal(id: number | string) {
      return request<void>(`/api/goals/${id}`, { method: "DELETE" });
   },

   listSessions(goalId: number | string) {
      return request<{ sessions: StudySession[] }>(`/api/goals/${goalId}/sessions`);
   },
   createSession(
      goalId: number | string,
      input: {
         duration_minutes: number;
         notes?: string;
         logged_at?: string;
         quality?: number | null;
      },
   ) {
      return request<{ session: StudySession }>(`/api/goals/${goalId}/sessions`, {
         method: "POST",
         body: JSON.stringify(input),
      });
   },
   updateSession(
      sessionId: number | string,
      input: Partial<{ duration_minutes: number; notes: string; quality: number | null }>,
   ) {
      return request<{ session: StudySession }>(`/api/sessions/${sessionId}`, {
         method: "PUT",
         body: JSON.stringify(input),
      });
   },
   deleteSession(sessionId: number | string) {
      return request<void>(`/api/sessions/${sessionId}`, { method: "DELETE" });
   },

   analyticsSummary() {
      return request<{
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
      }>("/api/analytics/summary");
   },

   gamificationProfile() {
      return request<{
         level: number;
         xp: number;
         xp_into_level: number;
         xp_for_next_level: number;
         progress_to_next: number;
         pet_stage:
            | "seed"
            | "sprout"
            | "sapling"
            | "young_tree"
            | "mature_tree"
            | "blooming";
         current_streak_days: number;
         longest_streak_days: number;
         total_sessions: number;
         total_minutes: number;
         mastered_count: number;
         achievements: {
            id: string;
            label: string;
            description: string;
            unlocked: boolean;
         }[];
      }>(
         `/api/gamification/profile?tz=${encodeURIComponent(
            Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
         )}`,
      );
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
   googleExportSession(sessionId: number | string) {
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
            imported: { session_id: number; goal_id: number; goal_title: string } | null;
         }[];
      }>(`/api/integrations/google/upcoming-events${suffix}`);
   },
   googleImportEvent(eventId: string, goalId: number) {
      return request<{ session: import("./types").StudySession }>(
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

   getMyProfile() {
      return request<{
         user: {
            id: number;
            email: string;
            username: string | null;
            display_name: string | null;
            bio: string | null;
            is_public: boolean;
         };
      }>("/api/profiles/me");
   },
   updateMyProfile(input: {
      username?: string;
      display_name?: string | null;
      bio?: string | null;
      is_public?: boolean;
   }) {
      return request<{
         user: {
            id: number;
            email: string;
            username: string | null;
            display_name: string | null;
            bio: string | null;
            is_public: boolean;
         };
      }>("/api/profiles/me", {
         method: "PUT",
         body: JSON.stringify(input),
      });
   },
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
            id: number;
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
