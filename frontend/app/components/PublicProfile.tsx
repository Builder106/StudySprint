import { Link, useParams } from "react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Target } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatDuration, minutesToHours } from "@/lib/format";
import { TopNav } from "./shared/TopNav";

type Data = Awaited<ReturnType<typeof api.getProfile>>;

export function PublicProfile() {
  const { username } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    api
      .getProfile(username)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Failed to load profile"),
      );
  }, [username]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans">
      <TopNav />
      <main className="max-w-3xl mx-auto px-8 py-16 space-y-12">
        <Link
          to="/community"
          className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest hover:text-[#ccff00] transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back
        </Link>

        {error && (
          <div className="text-xs text-red-400 font-medium" role="alert">{error}</div>
        )}

        {data && (
          <>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                Public profile
              </div>
              <h1 className="text-4xl md:text-5xl font-medium tracking-tighter">
                {data.user.display_name}
              </h1>
              <div className="text-zinc-500 font-light mt-1">@{data.user.username}</div>
              {data.user.bio && (
                <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 font-light leading-relaxed max-w-xl">
                  {data.user.bio}
                </p>
              )}
              <div className="text-xs text-zinc-500 mt-4">
                Joined {formatDate(data.user.joined_at)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-[#ccff00]/30 bg-[#ccff00]/5">
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                  <Clock className="w-4 h-4" /> Total hours
                </div>
                <div className="text-2xl font-medium tracking-tighter text-[#ccff00] tabular-nums">
                  {minutesToHours(data.stats.total_minutes)}h
                </div>
              </div>
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-white/10">
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                  Sessions
                </div>
                <div className="text-2xl font-medium tracking-tighter tabular-nums">
                  {data.stats.total_sessions}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-white/10">
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                  <Target className="w-4 h-4" /> Goals
                </div>
                <div className="text-2xl font-medium tracking-tighter tabular-nums">
                  {data.stats.total_goals}
                </div>
              </div>
            </div>

            <section className="space-y-4">
              <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
                Recent sessions
              </h2>
              {data.recent_sessions.length === 0 ? (
                <div className="text-xs text-zinc-500 font-light">No recent sessions.</div>
              ) : (
                <ul className="space-y-0">
                  {data.recent_sessions.map((s, i) => (
                    <li
                      key={i}
                      className="py-3 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{s.goal_title}</div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          {formatDate(s.logged_at)}
                        </div>
                      </div>
                      <div className="text-sm text-[#ccff00] tabular-nums flex-shrink-0">
                        {formatDuration(s.duration_minutes)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
