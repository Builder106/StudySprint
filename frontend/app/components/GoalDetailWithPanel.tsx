import { Link, useNavigate, useParams } from "react-router";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, Play, Pause, X, Edit2, Check, Calendar, CheckCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  formatDate,
  formatDuration,
  minutesToHours,
  progressPercent,
} from "@/lib/format";
import type { Goal, GoalStatus, StudySession } from "@/lib/types";
import { ProgressBar } from "./shared/ProgressBar";
import { TopNav } from "./shared/TopNav";
import { SessionModal } from "./shared/SessionModal";
import { TimerCard } from "./shared/TimerCard";
import { FocusTools, clearFocusNotes, readFocusNotes } from "./shared/FocusTools";

export function GoalDetailWithPanel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showPanel, setShowPanel] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalInitialMinutes, setModalInitialMinutes] = useState<number | undefined>(undefined);
  const [modalInitialNotes, setModalInitialNotes] = useState<string>("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [exportingSessionId, setExportingSessionId] = useState<number | null>(null);

  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editHoursError, setEditHoursError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    target_hours: "",
    target_date: "",
    subjects: "",
  });

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getGoal(id), api.listSessions(id)])
      .then(([g, s]) => {
        setGoal(g.goal);
        setSessions(s.sessions);
      })
      .catch((err: unknown) =>
        setLoadError(err instanceof ApiError ? err.message : "Failed to load goal"),
      );
    api
      .googleStatus()
      .then((s) => setGoogleConnected(s.connected))
      .catch(() => setGoogleConnected(false));
  }, [id]);

  const exportToCalendar = async (sessionId: number) => {
    setExportingSessionId(sessionId);
    try {
      await api.googleExportSession(sessionId);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, gcal_event_id: "synced" } : s,
        ),
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Calendar export failed");
    } finally {
      setExportingSessionId(null);
    }
  };

  useEffect(() => {
    if (!goal) return;
    setForm({
      title: goal.title,
      description: goal.description ?? "",
      target_hours: String(goal.target_hours),
      target_date: goal.target_date?.slice(0, 10) ?? "",
      subjects: goal.subjects.join(", "),
    });
  }, [goal]);

  const reload = async () => {
    if (!id) return;
    const g = await api.getGoal(id);
    setGoal(g.goal);
  };

  const openLogSession = (suggestedMinutes: number) => {
    if (!id) return;
    setModalInitialMinutes(suggestedMinutes > 0 ? suggestedMinutes : undefined);
    setModalInitialNotes(readFocusNotes(id));
    setShowModal(true);
  };

  const onSessionSaved = (saved: StudySession) => {
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...prev];
    });
    setShowModal(false);
    setModalInitialMinutes(undefined);
    setModalInitialNotes("");
    if (id) clearFocusNotes(id);
    reload().catch(() => {});
  };

  const togglePauseGoal = async () => {
    if (!goal) return;
    const nextStatus: GoalStatus = goal.status === "Active" ? "Paused" : "Active";
    try {
      const res = await api.updateGoal(goal.id, { status: nextStatus });
      setGoal(res.goal);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update goal");
    }
  };

  const markComplete = async () => {
    if (!goal) return;
    try {
      const res = await api.updateGoal(goal.id, { status: "Completed" });
      setGoal(res.goal);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update goal");
    }
  };

  const deleteGoal = async () => {
    if (!goal) return;
    if (!confirm(`Delete goal "${goal.title}"? This removes all sessions too.`)) return;
    try {
      await api.deleteGoal(goal.id);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete goal");
    }
  };

  const saveEdits = async (e: FormEvent) => {
    e.preventDefault();
    if (!goal) return;
    setEditError(null);
    setEditHoursError(null);
    const target = Number(form.target_hours);
    if (!Number.isFinite(target) || target <= 0) {
      setEditHoursError("Must be greater than 0.");
      return;
    }
    try {
      const res = await api.updateGoal(goal.id, {
        title: form.title.trim(),
        description: form.description,
        target_hours: target,
        target_date: form.target_date || null,
        subjects: form.subjects
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setGoal(res.goal);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Failed to save goal");
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50">
        <TopNav />
        <main className="max-w-5xl mx-auto px-8 py-16 text-xs text-red-400 font-medium">
          {loadError}
        </main>
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50">
        <TopNav />
        <main className="max-w-5xl mx-auto px-8 py-16 text-xs font-bold text-zinc-500 uppercase tracking-widest">
          Loading…
        </main>
      </div>
    );
  }

  const targetHours = Number(goal.target_hours);
  const loggedHours = minutesToHours(goal.logged_minutes);
  const remainingHours = Math.max(0, Math.round((targetHours - loggedHours) * 10) / 10);
  const percent = progressPercent(goal.logged_minutes, goal.target_hours);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans selection:bg-[#ccff00] selection:text-black flex flex-col">
      <TopNav
        right={
          !showPanel ? (
            <button
              onClick={() => setShowPanel(true)}
              className="text-[10px] font-bold uppercase tracking-widest text-[#ccff00] border border-[#ccff00]/20 bg-[#ccff00]/10 px-3 py-1.5 rounded-full hover:bg-[#ccff00]/20 transition-colors"
            >
              Details
            </button>
          ) : null
        }
      />

      <div className="flex flex-1 relative overflow-hidden">
        <main
          className={`flex-1 px-8 py-12 lg:py-16 transition-all duration-300 ease-out overflow-y-auto ${
            showPanel ? "mr-[380px] xl:mr-[460px]" : ""
          }`}
        >
          <div className="max-w-4xl mx-auto">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest hover:text-[#ccff00] mb-12 transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Back to sprints
            </Link>

            <div className="flex flex-col lg:flex-row gap-16 xl:gap-24">
              <div className="flex-1 lg:max-w-xl space-y-12">
                <h1 className="text-3xl md:text-5xl font-medium tracking-tighter text-zinc-900 dark:text-zinc-50 leading-[1.1]">
                  {goal.title}
                </h1>

                <TimerCard onLogSession={openLogSession} />

                <FocusTools goalId={goal.id} />
              </div>

              <div className="flex-1 space-y-16 max-w-sm xl:max-w-md">
                <div className="flex gap-8 sm:gap-12 border-b border-zinc-200 dark:border-white/10 pb-8">
                  <div>
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Target</div>
                    <div className="text-2xl font-medium tracking-tighter text-zinc-900 dark:text-zinc-50">
                      {targetHours}
                      <span className="text-zinc-500 font-light">h</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#ccff00] uppercase tracking-widest mb-2">Logged</div>
                    <div className="text-2xl font-medium tracking-tighter text-[#ccff00]">
                      {loggedHours}
                      <span className="text-[#ccff00]/50 font-light">h</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Remaining</div>
                    <div className="text-2xl font-medium tracking-tighter text-zinc-900 dark:text-zinc-50">
                      {remainingHours}
                      <span className="text-zinc-500 font-light">h</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                    <span>Overall Progress</span>
                    <span className="text-[#ccff00]">{percent}%</span>
                  </div>
                  <ProgressBar percent={percent} />
                </div>

                <div className="pt-8">
                  <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-8">Recent Sessions</h2>
                  {sessions.length === 0 ? (
                    <div className="text-xs text-zinc-500 font-light">No sessions yet.</div>
                  ) : (
                    <div className="space-y-0">
                      {sessions.slice(0, 6).map((session) => (
                        <div
                          key={session.id}
                          className="py-6 border-b border-zinc-100 dark:border-white/5 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors -mx-4 px-4 rounded-xl flex flex-col gap-2 group"
                        >
                          <div className="flex gap-4 justify-between items-baseline">
                            <div className="text-xl font-medium tracking-tighter text-[#ccff00]">
                              {formatDuration(session.duration_minutes)}
                            </div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                              {formatDate(session.logged_at)}
                            </div>
                          </div>
                          {session.notes && (
                            <div className="text-sm text-zinc-600 dark:text-zinc-400 font-light leading-relaxed">
                              {session.notes}
                            </div>
                          )}
                          {googleConnected && (
                            <div className="flex justify-end">
                              {session.gcal_event_id ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#ccff00]">
                                  <CheckCheck className="w-3 h-3" /> On calendar
                                </span>
                              ) : (
                                <button
                                  onClick={() => exportToCalendar(session.id)}
                                  disabled={exportingSessionId === session.id}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-[#ccff00] transition-colors disabled:opacity-50"
                                >
                                  <Calendar className="w-3 h-3" />
                                  {exportingSessionId === session.id
                                    ? "Exporting…"
                                    : "Add to Calendar"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside
          aria-label="Goal details panel"
          aria-hidden={!showPanel}
          className={`w-[380px] xl:w-[460px] bg-white dark:bg-[#0a0a0a] border-l border-zinc-200 dark:border-white/10 absolute right-0 top-0 bottom-0 flex flex-col z-20 shadow-2xl transition-transform duration-300 ease-out ${
            showPanel ? "translate-x-0" : "translate-x-full"
          }`}
        >
            <div className="px-8 py-8 border-b border-zinc-200 dark:border-white/10 flex justify-between items-center">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 uppercase tracking-widest">Goal Details</h3>
              <button
                onClick={() => setShowPanel(false)}
                aria-label="Close panel"
                tabIndex={showPanel ? 0 : -1}
                className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-12">
              {editing ? (
                <form onSubmit={saveEdits} className="space-y-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Title</label>
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      required
                      className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 py-2 focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      rows={4}
                      className="w-full bg-transparent border border-zinc-300 dark:border-white/20 p-3 rounded-xl text-sm focus:outline-none focus:border-[#ccff00] resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Target hours</label>
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={form.target_hours}
                        aria-invalid={!!editHoursError}
                        onChange={(e) => {
                          setForm({ ...form, target_hours: e.target.value });
                          if (editHoursError) setEditHoursError(null);
                        }}
                        required
                        className={`w-full bg-transparent border-b py-2 focus:outline-none ${
                          editHoursError
                            ? "border-red-400 focus:border-red-400"
                            : "border-zinc-300 dark:border-white/20 focus:border-[#ccff00]"
                        }`}
                      />
                      {editHoursError && (
                        <p className="text-[10px] text-red-400 font-medium" role="alert">{editHoursError}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Target date</label>
                      <input
                        type="date"
                        value={form.target_date}
                        onChange={(e) => setForm({ ...form, target_date: e.target.value })}
                        className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 py-2 focus:outline-none focus:border-[#ccff00]"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Subjects (comma-separated)</label>
                    <input
                      value={form.subjects}
                      onChange={(e) => setForm({ ...form, subjects: e.target.value })}
                      placeholder="Math, Languages"
                      className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 py-2 focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>
                  {editError && (
                    <p className="text-xs text-red-400 font-medium" role="alert">{editError}</p>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="flex-1 py-3 rounded-full text-xs font-bold uppercase tracking-widest bg-[#ccff00] text-black hover:bg-[#b3e600] transition-colors flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setEditError(null);
                        setEditHoursError(null);
                      }}
                      className="flex-1 py-3 rounded-full text-xs font-bold uppercase tracking-widest border border-zinc-300 dark:border-white/20 hover:border-zinc-500 dark:hover:border-white/50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Subject Tags</label>
                    <div className="flex flex-wrap gap-2">
                      {goal.subjects.length === 0 && (
                        <span className="text-xs text-zinc-400 dark:text-zinc-600 font-light">None</span>
                      )}
                      {goal.subjects.map((tag) => (
                        <span
                          key={tag}
                          className="bg-transparent border border-zinc-300 dark:border-white/20 text-zinc-700 dark:text-zinc-300 px-3 py-1 rounded-full text-xs font-medium"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 border-t border-zinc-200 dark:border-white/10 pt-10">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Created</label>
                      <div className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{formatDate(goal.created_at)}</div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-[#ccff00] uppercase tracking-widest">Target Date</label>
                      <div className="text-lg font-medium text-[#ccff00]">
                        {goal.target_date ? formatDate(goal.target_date) : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 border-t border-zinc-200 dark:border-white/10 pt-10">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Description</label>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 font-light leading-relaxed">
                      {goal.description || (
                        <span className="text-zinc-400 dark:text-zinc-600">No description yet.</span>
                      )}
                    </p>
                  </div>

                  <div className="space-y-4 pt-12 border-t border-zinc-200 dark:border-white/10">
                    <button
                      onClick={() => setEditing(true)}
                      className="w-full py-4 px-4 rounded-full text-xs font-bold uppercase tracking-widest text-zinc-900 dark:text-zinc-50 bg-transparent border border-zinc-300 dark:border-white/20 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors flex items-center justify-center gap-2"
                    >
                      <Edit2 className="w-3 h-3 text-zinc-500" /> Edit goal
                    </button>
                    <button
                      onClick={togglePauseGoal}
                      className="w-full py-4 px-4 rounded-full text-xs font-bold uppercase tracking-widest text-zinc-900 dark:text-zinc-50 bg-transparent border border-zinc-300 dark:border-white/20 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors flex items-center justify-center gap-2"
                    >
                      {goal.status === "Active" ? (
                        <>
                          <Pause className="w-3 h-3 text-zinc-500" fill="currentColor" /> Pause goal
                        </>
                      ) : goal.status === "Paused" ? (
                        <>
                          <Play className="w-3 h-3 text-zinc-500" fill="currentColor" /> Resume goal
                        </>
                      ) : (
                        <>Reactivate goal</>
                      )}
                    </button>
                    {goal.status !== "Completed" && (
                      <button
                        onClick={markComplete}
                        className="w-full py-4 px-4 rounded-full text-xs font-bold uppercase tracking-widest text-emerald-400 bg-transparent border border-emerald-400/20 hover:bg-emerald-400/10 transition-colors"
                      >
                        Mark complete
                      </button>
                    )}
                    <button
                      onClick={deleteGoal}
                      className="w-full py-4 px-4 rounded-full text-xs font-bold uppercase tracking-widest text-red-500 bg-transparent border border-red-500/20 hover:bg-red-500/10 transition-colors mt-8"
                    >
                      Delete goal
                    </button>
                  </div>
                </>
              )}
            </div>
        </aside>
      </div>

      {showModal && (
        <SessionModal
          goalId={goal.id}
          initialMinutes={modalInitialMinutes}
          initialNotes={modalInitialNotes}
          onClose={() => {
            setShowModal(false);
            setModalInitialMinutes(undefined);
            setModalInitialNotes("");
          }}
          onSaved={onSessionSaved}
        />
      )}
    </div>
  );
}
