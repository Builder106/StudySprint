import type { AuthResponse, Goal, StudySession, User } from "./types";

const API_BASE =
   (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
   "http://localhost:4000";

const TOKEN_KEY = "studysprint.token";

export function getToken(): string | null {
   return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
   if (token) localStorage.setItem(TOKEN_KEY, token);
   else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
   const headers = new Headers(options.headers);
   if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
   }
   const token = getToken();
   if (token) headers.set("Authorization", `Bearer ${token}`);

   const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

   if (res.status === 401) {
      setToken(null);
      throw new ApiError(401, "Unauthorized");
   }

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

export const api = {
   register(email: string, password: string) {
      return request<AuthResponse>("/api/auth/register", {
         method: "POST",
         body: JSON.stringify({ email, password }),
      });
   },
   login(email: string, password: string) {
      return request<AuthResponse>("/api/auth/login", {
         method: "POST",
         body: JSON.stringify({ email, password }),
      });
   },
   me() {
      return request<{ user: User }>("/api/auth/me");
   },

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
};
