import { Link, useNavigate } from "react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { TopNav } from "./shared/TopNav";

export function NewGoal() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetHours, setTargetHours] = useState("10");
  const [targetDate, setTargetDate] = useState("");
  const [subjects, setSubjects] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const hours = Number(targetHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      setHoursError("Must be greater than 0.");
      setError(null);
      return;
    }
    setError(null);
    setHoursError(null);
    setSubmitting(true);
    try {
      const res = await api.createGoal({
        title: title.trim(),
        description: description || undefined,
        target_hours: hours,
        target_date: targetDate || null,
        subjects: subjects
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      navigate(`/goal/${res.goal.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create goal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans">
      <TopNav />
      <main className="max-w-2xl mx-auto px-8 py-16">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest hover:text-[#ccff00] mb-12 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back
        </Link>

        <h1 className="text-4xl md:text-5xl font-medium tracking-tighter mb-12">
          New sprint.
        </h1>

        <form onSubmit={onSubmit} className="space-y-10">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Title
            </label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Finish calculus review"
              className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 py-3 text-lg focus:outline-none focus:border-[#ccff00]"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What does success look like?"
              className="w-full bg-transparent border border-zinc-300 dark:border-white/20 p-4 rounded-xl text-sm font-light focus:outline-none focus:border-[#ccff00] resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                Target hours
              </label>
              <input
                type="number"
                min={0.5}
                step={0.5}
                required
                aria-invalid={!!hoursError}
                aria-describedby="target-hours-help"
                value={targetHours}
                onChange={(e) => {
                  setTargetHours(e.target.value);
                  if (hoursError) setHoursError(null);
                }}
                className={`w-full bg-transparent border-b py-3 text-lg focus:outline-none ${
                  hoursError
                    ? "border-red-400 focus:border-red-400"
                    : "border-zinc-300 dark:border-white/20 focus:border-[#ccff00]"
                }`}
              />
              <p
                id="target-hours-help"
                className={`text-[10px] font-medium tracking-wide ${
                  hoursError ? "text-red-400" : "text-zinc-400 dark:text-zinc-600"
                }`}
                role={hoursError ? "alert" : undefined}
              >
                {hoursError ?? "Must be greater than 0."}
              </p>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                Target date (optional)
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 py-3 text-lg focus:outline-none focus:border-[#ccff00]"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Subjects (comma-separated)
            </label>
            <input
              value={subjects}
              onChange={(e) => setSubjects(e.target.value)}
              placeholder="Math, Computer Science"
              className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 py-3 text-lg focus:outline-none focus:border-[#ccff00]"
            />
          </div>

          {error && (
            <div className="text-xs text-red-400 font-medium" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#ccff00] text-black h-14 rounded-full text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#b3e600] transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating…" : (
              <>
                Create goal <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
