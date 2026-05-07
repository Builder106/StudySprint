import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ExternalLink, Download, CheckCheck, X, Plus } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { Goal } from "@/lib/types";
import {
  SelectContent,
  SelectItem,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "./SelectPrimitives";

const NEW_GOAL_OPTION = "__new__";

type ImportedRef = { session_id: string; goal_id: string; goal_title: string };

type Event = {
  id: string;
  summary: string;
  start: string | null;
  end: string | null;
  all_day: boolean;
  html_link: string;
  imported: ImportedRef | null;
};

interface Props {
  refreshKey?: number;
  onImported?: () => void;
}

function formatWhen(start: string | null, allDay: boolean) {
  if (!start) return "—";
  const d = new Date(start);
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (allDay) return day;
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

function formatDuration(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function UpcomingCalendarEvents({ refreshKey, onImported }: Props) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<Event | null>(null);

  useEffect(() => {
    api
      .googleUpcomingEvents()
      .then(({ events }) => setEvents(events))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load events");
        setEvents([]);
      });
  }, [refreshKey]);

  useEffect(() => {
    api
      .listGoals()
      .then(({ goals }) => setGoals(goals.filter((g) => g.status === "Active")))
      .catch(() => setGoals([]));
  }, []);

  const [pastEvents, futureEvents] = useMemo(() => {
    if (!events) return [[], []] as [Event[], Event[]];
    const now = Date.now();
    const past: Event[] = [];
    const future: Event[] = [];
    for (const e of events) {
      const t = e.start ? new Date(e.start).getTime() : 0;
      if (t < now) past.push(e);
      else future.push(e);
    }
    past.reverse(); // most-recent past first
    return [past, future];
  }, [events]);

  if (error) return null;
  if (!events || events.length === 0) return null;

  return (
    <section className="mb-12 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">
        <CalendarClock className="w-4 h-4" />
        Import from Google Calendar
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-600 mb-5 font-light">
        Click <span className="font-medium">Import</span> on an event to log it as a study session.
        Imports are a one-time snapshot — later edits in Google Calendar won't sync back.
      </p>

      {pastEvents.length > 0 && (
        <EventGroup
          label="Past 14 days"
          events={pastEvents}
          onImport={setImporting}
        />
      )}
      {futureEvents.length > 0 && (
        <EventGroup
          label="Next 7 days"
          events={futureEvents}
          onImport={setImporting}
        />
      )}

      {importing && (
        <ImportModal
          event={importing}
          goals={goals ?? []}
          onClose={() => setImporting(null)}
          onImported={(sessionGoal) => {
            setEvents((prev) =>
              prev
                ? prev.map((e) =>
                    e.id === importing.id
                      ? {
                          ...e,
                          imported: {
                            session_id: sessionGoal.session_id,
                            goal_id: sessionGoal.goal_id,
                            goal_title: sessionGoal.goal_title,
                          },
                        }
                      : e,
                  )
                : prev,
            );
            setImporting(null);
            onImported?.();
          }}
        />
      )}
    </section>
  );
}

function EventGroup({
  label,
  events,
  onImport,
}: {
  label: string;
  events: Event[];
  onImport: (e: Event) => void;
}) {
  return (
    <div className="mb-6 last:mb-0">
      <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-2">
        {label}
      </div>
      <ul className="space-y-1">
        {events.map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between gap-4 py-2 border-b border-zinc-100 dark:border-zinc-900 last:border-0"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
                {e.summary}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                {formatWhen(e.start, e.all_day)}
                {!e.all_day && (
                  <span className="ml-2 text-zinc-400 dark:text-zinc-700">
                    · {formatDuration(e.start, e.end) ?? "—"}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {e.imported ? (
                <Link
                  to={`/goal/${e.imported.goal_id}`}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#ccff00] hover:text-[#b3e600] transition-colors"
                  title={`Logged to ${e.imported.goal_title}`}
                >
                  <CheckCheck className="w-3 h-3" />
                  Imported
                </Link>
              ) : e.all_day ? (
                <span
                  className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-700"
                  title="All-day events can't be imported"
                >
                  All-day
                </span>
              ) : (
                <button
                  onClick={() => onImport(e)}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-[#ccff00] transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Import
                </button>
              )}
              <a
                href={e.html_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 dark:text-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors"
                aria-label="Open in Google Calendar"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImportModal({
  event,
  goals,
  onClose,
  onImported,
}: {
  event: Event;
  goals: Goal[];
  onClose: () => void;
  onImported: (ref: ImportedRef) => void;
}) {
  const [goalId, setGoalId] = useState<string>(
    goals[0]?.id ? String(goals[0].id) : NEW_GOAL_OPTION,
  );
  const [newTitle, setNewTitle] = useState<string>(event.summary);
  const [newTargetHours, setNewTargetHours] = useState<string>("10");
  const [submitting, setSubmitting] = useState(false);

  const creatingNew = goalId === NEW_GOAL_OPTION;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    setSubmitting(true);
    try {
      let resolvedGoalId: string;
      let resolvedGoalTitle: string;

      if (creatingNew) {
        const title = newTitle.trim();
        if (!title) {
          toast.error("Goal title is required");
          setSubmitting(false);
          return;
        }
        const hours = Number(newTargetHours);
        if (!Number.isFinite(hours) || hours <= 0) {
          toast.error("Target hours must be greater than 0");
          setSubmitting(false);
          return;
        }
        const created = await api.createGoal({ title, target_hours: hours });
        resolvedGoalId = created.goal.id;
        resolvedGoalTitle = created.goal.title;
      } else {
        if (!goalId) {
          setSubmitting(false);
          return;
        }
        resolvedGoalId = goalId;
        resolvedGoalTitle = goals.find((g) => g.id === goalId)?.title ?? "";
      }

      const res = await api.googleImportEvent(event.id, resolvedGoalId);
      toast.success(
        `Logged ${res.session.duration_minutes} min to ${resolvedGoalTitle}.`,
      );
      onImported({
        session_id: res.session.id,
        goal_id: resolvedGoalId,
        goal_title: resolvedGoalTitle,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Import failed");
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
            Import as study session
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
              Event
            </div>
            <div className="text-base font-medium text-zinc-900 dark:text-zinc-50">
              {event.summary}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {formatWhen(event.start, event.all_day)}
              {!event.all_day && (
                <span className="ml-2">· {formatDuration(event.start, event.end) ?? "—"}</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
              Goal
            </label>
            <SelectRoot value={goalId} onValueChange={setGoalId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a goal" />
              </SelectTrigger>
              <SelectPortal>
                <SelectContent>
                  <SelectItem value={NEW_GOAL_OPTION}>+ Create new goal</SelectItem>
                  {goals.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectPortal>
            </SelectRoot>
          </div>

          {creatingNew && (
            <div className="space-y-4 pt-2 border-t border-zinc-200 dark:border-white/10">
              <div className="flex items-center gap-2 text-[10px] font-bold text-[#ccff00] uppercase tracking-widest pt-4">
                <Plus className="w-3 h-3" />
                New goal
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 px-0 py-2 text-zinc-900 dark:text-zinc-50 text-base font-light focus:outline-none focus:border-[#ccff00] transition-colors rounded-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                  Target hours
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={newTargetHours}
                  onChange={(e) => setNewTargetHours(e.target.value)}
                  className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 px-0 py-2 text-zinc-900 dark:text-zinc-50 text-base font-light focus:outline-none focus:border-[#ccff00] transition-colors rounded-none"
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-8 py-5 border-t border-zinc-200 dark:border-white/10 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 px-4 py-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !goalId || (creatingNew && !newTitle.trim())}
            className="text-[10px] font-bold uppercase tracking-widest bg-[#ccff00] text-black hover:bg-[#b3e600] disabled:opacity-40 disabled:cursor-not-allowed px-6 py-2 rounded-full transition-colors"
          >
            {submitting ? (creatingNew ? "Creating…" : "Importing…") : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
