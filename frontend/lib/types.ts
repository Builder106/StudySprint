export type GoalStatus = "Active" | "Paused" | "Completed";

export interface User {
  id: number;
  email: string;
  created_at: string;
}

export interface Goal {
  id: number;
  title: string;
  description: string | null;
  target_hours: number | string;
  status: GoalStatus;
  target_date: string | null;
  created_at: string;
  updated_at: string;
  logged_minutes: number;
  subjects: string[];
}

export type SessionQuality = 1 | 2 | 3 | 4 | 5;

export interface StudySession {
  id: number;
  goal_id: number;
  duration_minutes: number;
  notes: string | null;
  logged_at: string;
  quality: SessionQuality | null;
  next_review_at: string | null;
  gcal_event_id?: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}
