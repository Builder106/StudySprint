import { Link } from "react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Activity,
  Clock,
  CalendarDays,
  PieChart as PieIcon,
  Flame,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiError } from "@/lib/api";
import { TopNav } from "./shared/TopNav";

type Summary = Awaited<ReturnType<typeof api.analyticsSummary>>;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PIE_COLORS = ["#ccff00", "#22f5cb", "#f4a261", "#e49eea", "#56a0c5", "#e17be0", "#e9c46a"];

function formatHoursShort(mins: number): string {
  if (mins === 0) return "0";
  if (mins < 60) return `${mins}m`;
  const h = mins / 60;
  return h < 10 ? `${Math.round(h * 10) / 10}h` : `${Math.round(h)}h`;
}

function buildHeatmap(daily: Summary["daily"]) {
  // daily comes ordered oldest → newest, one row per day for 365 days
  // Find the Sunday on/before the first day so our columns align to weeks
  if (daily.length === 0) return { weeks: [] as { date: string; minutes: number }[][], max: 0 };
  const map = new Map<string, number>();
  let max = 0;
  for (const row of daily) {
    map.set(row.date, row.minutes);
    if (row.minutes > max) max = row.minutes;
  }
  const firstDate = new Date(daily[0].date + "T00:00:00Z");
  const firstDow = firstDate.getUTCDay();
  const start = new Date(firstDate);
  start.setUTCDate(start.getUTCDate() - firstDow);

  const lastDate = new Date(daily[daily.length - 1].date + "T00:00:00Z");
  const totalDays = Math.round((lastDate.getTime() - start.getTime()) / 86400000) + 1;
  const weeksCount = Math.ceil(totalDays / 7);
  const weeks: { date: string; minutes: number }[][] = [];
  for (let w = 0; w < weeksCount; w++) {
    const col: { date: string; minutes: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + w * 7 + d);
      const iso = day.toISOString().slice(0, 10);
      col.push({ date: iso, minutes: map.get(iso) ?? 0 });
    }
    weeks.push(col);
  }
  return { weeks, max };
}

function intensity(minutes: number, max: number): number {
  if (max === 0 || minutes === 0) return 0;
  const ratio = minutes / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

const HEATMAP_COLORS = [
  "rgba(161,161,170,0.12)", // 0: empty (zinc-400 @ 12%)
  "rgba(204,255,0,0.25)",
  "rgba(204,255,0,0.45)",
  "rgba(204,255,0,0.7)",
  "rgba(204,255,0,1.0)",
];

export function Analytics() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .analyticsSummary()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Failed to load analytics"),
      );
  }, []);

  const heatmap = useMemo(() => buildHeatmap(data?.daily ?? []), [data?.daily]);

  const hourly = useMemo(() => {
    const filled = Array.from({ length: 24 }, (_, h) => ({ hour: h, minutes: 0 }));
    for (const row of data?.hourly ?? []) filled[row.hour].minutes = row.minutes;
    return filled;
  }, [data?.hourly]);

  const weekday = useMemo(() => {
    const filled = DAY_LABELS.map((label, i) => ({ dow: i, label, minutes: 0 }));
    for (const row of data?.weekday ?? []) filled[row.dow].minutes = row.minutes;
    return filled;
  }, [data?.weekday]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans">
      <TopNav />
      <main className="max-w-6xl mx-auto px-8 py-16 space-y-16">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest hover:text-[#ccff00] transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back
        </Link>

        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ccff00] mb-4">
            <Activity className="w-4 h-4" />
            Insights
          </div>
          <h1 className="text-4xl md:text-5xl font-medium tracking-tighter">Your analytics.</h1>
        </div>

        {error && (
          <div className="text-xs text-red-400 font-medium" role="alert">
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
            Loading analytics…
          </div>
        )}

        {data && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Total (365d)"
                value={formatHoursShort(data.totals.minutes)}
                icon={<Clock className="w-4 h-4" />}
              />
              <StatCard
                label="Active days"
                value={String(data.totals.sessions_last_365)}
                icon={<CalendarDays className="w-4 h-4" />}
              />
              <StatCard
                label="Current streak"
                value={`${data.totals.current_streak_days}d`}
                icon={<Flame className="w-4 h-4" />}
                accent
              />
              <StatCard
                label="Longest streak"
                value={`${data.totals.longest_streak_days}d`}
                icon={<Flame className="w-4 h-4" />}
              />
            </section>

            <section className="space-y-6">
              <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
                Contribution heatmap (last 365 days)
              </h2>
              <div className="overflow-x-auto pb-2">
                <svg
                  width={heatmap.weeks.length * 14 + 30}
                  height={7 * 14 + 20}
                  role="img"
                  aria-label="Daily study contribution heatmap"
                >
                  {[1, 3, 5].map((d) => (
                    <text
                      key={d}
                      x={0}
                      y={d * 14 + 12}
                      fontSize={9}
                      fill="currentColor"
                      className="text-zinc-500"
                    >
                      {DAY_LABELS[d]}
                    </text>
                  ))}
                  <g transform="translate(24, 0)">
                    {heatmap.weeks.map((week, wi) =>
                      week.map((cell, di) => (
                        <rect
                          key={`${wi}-${di}`}
                          x={wi * 14}
                          y={di * 14}
                          width={10}
                          height={10}
                          rx={2}
                          fill={HEATMAP_COLORS[intensity(cell.minutes, heatmap.max)]}
                        >
                          <title>{`${cell.date}: ${formatHoursShort(cell.minutes)}`}</title>
                        </rect>
                      )),
                    )}
                  </g>
                </svg>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                Less
                {HEATMAP_COLORS.map((c, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="inline-block w-3 h-3 rounded-sm"
                    style={{ backgroundColor: c }}
                  />
                ))}
                More
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <section className="space-y-6">
                <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-4 h-4" /> By hour of day
                </h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourly}>
                      <XAxis
                        dataKey="hour"
                        tick={{ fontSize: 10, fill: "currentColor" }}
                        tickFormatter={(h) => (h % 3 === 0 ? `${h}` : "")}
                        stroke="currentColor"
                        className="text-zinc-500"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "currentColor" }}
                        tickFormatter={(m) => formatHoursShort(m)}
                        stroke="currentColor"
                        className="text-zinc-500"
                        width={36}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(204,255,0,0.08)" }}
                        contentStyle={{
                          background: "#0a0a0a",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [formatHoursShort(value), "Studied"]}
                        labelFormatter={(h) => `${h}:00`}
                      />
                      <Bar dataKey="minutes" fill="#ccff00" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="space-y-6">
                <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" /> By day of week
                </h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weekday}>
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "currentColor" }}
                        stroke="currentColor"
                        className="text-zinc-500"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "currentColor" }}
                        tickFormatter={(m) => formatHoursShort(m)}
                        stroke="currentColor"
                        className="text-zinc-500"
                        width={36}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(204,255,0,0.08)" }}
                        contentStyle={{
                          background: "#0a0a0a",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [formatHoursShort(value), "Studied"]}
                      />
                      <Bar dataKey="minutes" fill="#22f5cb" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>

            <section className="space-y-6">
              <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <PieIcon className="w-4 h-4" /> By subject
              </h2>
              {data.by_subject.length === 0 ? (
                <div className="text-xs text-zinc-500 font-light">
                  No sessions tagged with a subject yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.by_subject}
                          dataKey="minutes"
                          nameKey="subject"
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {data.by_subject.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#0a0a0a",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(value: number, name: string) => [
                            formatHoursShort(value),
                            name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-3">
                    {data.by_subject.map((row, i) => (
                      <li
                        key={row.subject}
                        className="flex items-center justify-between gap-4 py-2 border-b border-zinc-100 dark:border-white/5"
                      >
                        <span className="flex items-center gap-3 text-sm">
                          <span
                            className="w-3 h-3 rounded-sm"
                            style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          {row.subject}
                        </span>
                        <span className="text-sm tabular-nums text-zinc-500">
                          {formatHoursShort(row.minutes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`p-5 rounded-2xl border ${
        accent
          ? "border-[#ccff00]/30 bg-[#ccff00]/5"
          : "border-zinc-200 dark:border-white/10"
      }`}
    >
      <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
        {icon}
        {label}
      </div>
      <div
        className={`text-3xl font-medium tracking-tighter tabular-nums ${
          accent ? "text-[#ccff00]" : "text-zinc-900 dark:text-zinc-50"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
