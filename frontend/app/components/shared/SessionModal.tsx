import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Clock, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { StudySession } from "@/lib/types";

interface Props {
  goalId: number | string;
  initialMinutes?: number;
  session?: StudySession | null;
  onClose: () => void;
  onSaved: (session: StudySession) => void;
}

export function SessionModal({ goalId, initialMinutes, session, onClose, onSaved }: Props) {
  const [hours, setHours] = useState<string>(
    session
      ? String(Math.round((session.duration_minutes / 60) * 10) / 10)
      : initialMinutes
        ? String(Math.round((initialMinutes / 60) * 10) / 10)
        : "1.0",
  );
  const [notes, setNotes] = useState<string>(session?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDurationError(null);
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) {
      setDurationError("Duration must be greater than 0 hours.");
      return;
    }
    const minutes = Math.max(1, Math.round(h * 60));
    setSubmitting(true);
    try {
      const res = session
        ? await api.updateSession(session.id, { duration_minutes: minutes, notes })
        : await api.createSession(goalId, { duration_minutes: minutes, notes });
      onSaved(res.session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save session");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-white/10 rounded-2xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-zinc-200 dark:border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-widest uppercase text-zinc-900 dark:text-zinc-50">
            {session ? "Edit Session" : "Log Study Session"}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-8 space-y-8">
          <div className="space-y-4">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Duration (hours)
            </label>
            <div className="relative">
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={hours}
                aria-invalid={!!durationError}
                aria-describedby="session-duration-help"
                onChange={(e) => {
                  setHours(e.target.value);
                  if (durationError) setDurationError(null);
                }}
                className={`w-full bg-transparent border-b pl-8 pr-0 py-3 text-zinc-900 dark:text-zinc-50 text-xl font-medium focus:outline-none transition-colors rounded-none ${
                  durationError
                    ? "border-red-400 focus:border-red-400"
                    : "border-zinc-300 dark:border-white/20 focus:border-[#ccff00]"
                }`}
              />
              <Clock className="w-5 h-5 text-zinc-500 absolute left-0 top-3.5" />
            </div>
            <p
              id="session-duration-help"
              className={`text-[10px] font-medium tracking-wide ${
                durationError ? "text-red-400" : "text-zinc-400 dark:text-zinc-600"
              }`}
              role={durationError ? "alert" : undefined}
            >
              {durationError ?? "Must be greater than 0 hours."}
            </p>
          </div>

          <div className="space-y-4">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Session Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you focus on?"
              rows={4}
              className="w-full bg-transparent border border-zinc-300 dark:border-white/20 p-4 text-zinc-900 dark:text-zinc-50 text-sm font-light focus:outline-none focus:border-[#ccff00] transition-colors rounded-xl resize-none"
            />
          </div>

          {error && (
            <div className="text-xs text-red-400 font-medium" role="alert">
              {error}
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 px-4 rounded-full text-xs font-bold tracking-widest uppercase text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/20 hover:border-zinc-500 dark:hover:border-white/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-4 px-4 rounded-full text-xs font-bold tracking-widest uppercase text-black bg-[#ccff00] hover:bg-[#b3e600] transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving…" : session ? "Save changes" : "Save session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
