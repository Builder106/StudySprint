import { Link } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, ChevronRight, Activity, BarChart3, Sparkles, Leaf, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { minutesToHours, progressPercent } from "@/lib/format";
import type { Goal, GoalStatus } from "@/lib/types";
import { StatusBadge } from "./shared/StatusBadge";
import { ProgressBar } from "./shared/ProgressBar";
import { TopNav } from "./shared/TopNav";
import { SyllabusImport } from "./SyllabusImport";
import { GoogleCalendarBadge } from "./shared/GoogleCalendarBadge";

type StatusFilter = "All" | GoalStatus;
type SortKey = "recent" | "logged" | "remaining" | "progress";

const STATUS_FILTERS: StatusFilter[] = ["All", "Active", "Paused", "Completed"];
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "logged", label: "Most logged" },
  { value: "remaining", label: "Least remaining" },
  { value: "progress", label: "Most progress" },
];

export function Dashboard() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [showImport, setShowImport] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const loadGoals = () => {
    return api
      .listGoals()
      .then((res) => setGoals(res.goals))
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Failed to load goals"),
      );
  };

  useEffect(() => {
    loadGoals();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("google");
    if (status === "connected") setBanner("Google Calendar connected.");
    else if (status === "denied") setBanner("Google Calendar connection cancelled.");
    else if (status === "error") setBanner("Google Calendar connection failed. Try again.");
    if (status) {
      params.delete("google");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    }
  }, []);

  const stats = useMemo(() => {
    if (!goals) return { active: 0, hours: 0 };
    const active = goals.filter((g) => g.status === "Active").length;
    const hours = Math.round(
      goals.reduce((sum, g) => sum + g.logged_minutes, 0) / 60,
    );
    return { active, hours };
  }, [goals]);

  const visibleGoals = useMemo(() => {
    if (!goals) return null;
    const filtered =
      statusFilter === "All" ? goals : goals.filter((g) => g.status === statusFilter);
    const sorted = [...filtered];
    switch (sortKey) {
      case "logged":
        sorted.sort((a, b) => b.logged_minutes - a.logged_minutes);
        break;
      case "remaining":
        sorted.sort((a, b) => {
          const aRem = Math.max(0, Number(a.target_hours) * 60 - a.logged_minutes);
          const bRem = Math.max(0, Number(b.target_hours) * 60 - b.logged_minutes);
          return aRem - bRem;
        });
        break;
      case "progress":
        sorted.sort(
          (a, b) =>
            progressPercent(b.logged_minutes, b.target_hours) -
            progressPercent(a.logged_minutes, a.target_hours),
        );
        break;
      case "recent":
      default:
        sorted.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
    }
    return sorted;
  }, [goals, statusFilter, sortKey]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans selection:bg-[#ccff00] selection:text-black">
      <TopNav
        right={
          <div className="flex items-center gap-3">
            <Link
              to="/community"
              aria-label="Community"
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-[#ccff00] transition-colors"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Community</span>
            </Link>
            <Link
              to="/garden"
              aria-label="Garden"
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-[#ccff00] transition-colors"
            >
              <Leaf className="w-4 h-4" />
              <span className="hidden sm:inline">Garden</span>
            </Link>
            <Link
              to="/analytics"
              aria-label="Analytics"
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-[#ccff00] transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Analytics</span>
            </Link>
            <button
              onClick={() => setShowImport(true)}
              aria-label="Import from syllabus"
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-[#ccff00] transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <Link
              to="/goals/new"
              aria-label="New goal"
              className="flex items-center justify-center w-10 h-10 rounded-full bg-[#ccff00] text-black hover:bg-[#b3e600] transition-colors focus:outline-none"
            >
              <Plus className="w-5 h-5" />
            </Link>
          </div>
        }
      />

      <main className="max-w-5xl mx-auto px-8 py-16">
        {banner && (
          <div
            role="status"
            className="mb-8 px-4 py-3 rounded-xl border border-[#ccff00]/30 bg-[#ccff00]/10 text-[#ccff00] text-xs font-bold uppercase tracking-widest flex items-center justify-between"
          >
            <span>{banner}</span>
            <button
              onClick={() => setBanner(null)}
              className="text-[#ccff00] hover:opacity-80"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ccff00] mb-4">
              <Activity className="w-4 h-4" />
              Welcome back
            </div>
            <h1 className="text-4xl md:text-5xl font-medium tracking-tighter text-zinc-900 dark:text-zinc-50">
              Your sprints.
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-2 font-light text-lg">
              Ready to conquer your goals today?
            </p>
          </div>

          <div className="flex flex-col items-end gap-4">
            <GoogleCalendarBadge />
            <div className="flex gap-8 text-right">
              <div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                  Active
                </div>
                <div className="text-3xl font-medium tracking-tighter text-[#ccff00]">
                  {stats.active}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                  Hours Logged
                </div>
                <div className="text-3xl font-medium tracking-tighter text-zinc-900 dark:text-zinc-50">
                  {stats.hours}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-8 text-xs text-red-400 font-medium" role="alert">
            {error}
          </div>
        )}

        {goals === null && !error && (
          <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest py-16">
            Loading goals…
          </div>
        )}

        {goals && goals.length === 0 && (
          <div className="border border-zinc-200 dark:border-white/10 rounded-2xl py-16 px-8 text-center space-y-4">
            <div className="text-sm text-zinc-600 dark:text-zinc-400 font-light">No goals yet.</div>
            <Link
              to="/goals/new"
              className="inline-flex items-center gap-2 py-3 px-6 rounded-full text-xs font-bold tracking-widest uppercase bg-[#ccff00] text-black hover:bg-[#b3e600] transition-colors"
            >
              <Plus className="w-4 h-4" /> Create first goal
            </Link>
          </div>
        )}

        {goals && goals.length > 0 && (
          <div
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-white/10"
            role="toolbar"
            aria-label="Filter and sort goals"
          >
            <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by status">
              {STATUS_FILTERS.map((status) => {
                const count =
                  status === "All"
                    ? goals.length
                    : goals.filter((g) => g.status === status).length;
                const active = statusFilter === status;
                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    aria-pressed={active}
                    className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors ${
                      active
                        ? "border-[#ccff00] bg-[#ccff00]/10 text-[#ccff00]"
                        : "border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
                    }`}
                  >
                    {status}
                    <span className="ml-1.5 opacity-60 tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Sort
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="bg-transparent border border-zinc-200 dark:border-white/10 rounded-full px-3 py-1.5 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-[#ccff00]"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-white dark:bg-[#0a0a0a]">
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {visibleGoals && visibleGoals.length === 0 && goals && goals.length > 0 && (
          <div className="py-16 text-center text-xs font-bold text-zinc-500 uppercase tracking-widest">
            No {statusFilter === "All" ? "" : statusFilter.toLowerCase() + " "}goals match.
          </div>
        )}

        {visibleGoals && visibleGoals.length > 0 && (
          <div className="border-b border-zinc-200 dark:border-white/10">
            {visibleGoals.map((goal) => {
              const percent = progressPercent(goal.logged_minutes, goal.target_hours);
              const logged = minutesToHours(goal.logged_minutes);
              const target = Number(goal.target_hours);
              return (
                <Link to={`/goal/${goal.id}`} key={goal.id} className="block group">
                  <div className="py-8 border-b border-zinc-200 dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-8 group-hover:bg-zinc-50 dark:group-hover:bg-white/[0.02] transition-colors -mx-4 px-4 rounded-xl">
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                        <h3 className="text-xl md:text-2xl font-medium tracking-tight text-zinc-900 dark:text-zinc-50 group-hover:text-[#ccff00] transition-colors">
                          {goal.title}
                        </h3>
                        <div className="flex-shrink-0">
                          <StatusBadge status={goal.status} />
                        </div>
                      </div>

                      <div className="flex gap-6 text-sm text-zinc-500 font-light">
                        <span>
                          Target: <span className="text-zinc-700 dark:text-zinc-300">{target}h</span>
                        </span>
                        <span>
                          Logged: <span className="text-[#ccff00]">{logged}h</span>
                        </span>
                      </div>

                      <div className="w-full max-w-xl flex items-center gap-4 mt-2">
                        <div className="flex-1">
                          <ProgressBar percent={percent} />
                        </div>
                        <span className="text-xs font-medium text-zinc-500 tabular-nums w-10 text-right">
                          {percent}%
                        </span>
                      </div>
                    </div>

                    <div className="hidden md:flex flex-shrink-0 items-center justify-center w-12 h-12 rounded-full border border-zinc-200 dark:border-white/10 group-hover:border-[#ccff00] group-hover:text-[#ccff00] transition-colors">
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      {showImport && (
        <SyllabusImport
          onClose={() => setShowImport(false)}
          onCreated={(count) => {
            setShowImport(false);
            setBanner(`Created ${count} goal${count === 1 ? "" : "s"} from syllabus.`);
            loadGoals();
          }}
        />
      )}
    </div>
  );
}
