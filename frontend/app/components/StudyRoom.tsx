import { Link, useNavigate, useParams } from "react-router";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, Lock, LogOut, RefreshCw, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatDuration } from "@/lib/format";
import { TopNav } from "./shared/TopNav";

type Data = Awaited<ReturnType<typeof api.getRoom>>;

const REFRESH_MS = 15000;

export function StudyRoom() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [needsJoin, setNeedsJoin] = useState<{ hasPasscode: boolean } | null>(null);
  const [passcode, setPasscode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = async () => {
    if (!slug) return;
    try {
      const res = await api.getRoom(slug);
      setData(res);
      setNeedsJoin(null);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setNeedsJoin({ hasPasscode: /passcode/i.test(err.message) });
          setError(err.message);
          return;
        }
        if (err.status === 404) {
          setNotFound(true);
          return;
        }
      }
      setError(err instanceof ApiError ? err.message : "Failed to load room");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Poll while joined
  useEffect(() => {
    if (!data || needsJoin) return;
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, needsJoin]);

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    setJoining(true);
    setError(null);
    try {
      await api.joinRoom(slug, passcode || undefined);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to join");
    } finally {
      setJoining(false);
    }
  };

  const onLeave = async () => {
    if (!slug) return;
    if (!confirm("Leave this room?")) return;
    try {
      await api.leaveRoom(slug);
      navigate("/community");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to leave");
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans">
        <TopNav />
        <main className="max-w-3xl mx-auto px-8 py-16 space-y-8">
          <div className="text-xs text-red-400 font-medium">Room not found.</div>
          <Link
            to="/community"
            className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-[#ccff00]"
          >
            Back to community
          </Link>
        </main>
      </div>
    );
  }

  if (needsJoin) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans">
        <TopNav />
        <main className="max-w-md mx-auto px-8 py-16 space-y-8">
          <h1 className="text-3xl font-medium tracking-tighter">Join room</h1>
          <form onSubmit={onJoin} className="space-y-6">
            {needsJoin.hasPasscode && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Lock className="w-3 h-3" /> Passcode
                </label>
                <input
                  type="password"
                  required
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 py-2 focus:outline-none focus:border-[#ccff00]"
                />
              </div>
            )}
            {error && (
              <p className="text-xs text-red-400" role="alert">{error}</p>
            )}
            <button
              type="submit"
              disabled={joining}
              className="w-full py-3 rounded-full text-xs font-bold tracking-widest uppercase bg-[#ccff00] text-black hover:bg-[#b3e600] transition-colors disabled:opacity-50"
            >
              {joining ? "Joining…" : "Join"}
            </button>
          </form>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans">
        <TopNav />
        <main className="max-w-3xl mx-auto px-8 py-16 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Loading room…
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans">
      <TopNav />
      <main className="max-w-4xl mx-auto px-8 py-16 space-y-12">
        <Link
          to="/community"
          className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest hover:text-[#ccff00] transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Community
        </Link>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ccff00] mb-4">
              <Users className="w-4 h-4" />
              Study room
            </div>
            <h1 className="text-4xl font-medium tracking-tighter flex items-center gap-3">
              {data.room.name}
              {data.room.has_passcode && <Lock className="w-5 h-5 text-zinc-500" />}
            </h1>
            {data.room.description && (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 font-light leading-relaxed max-w-2xl">
                {data.room.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              <RefreshCw className="w-3 h-3" /> Auto-refresh {REFRESH_MS / 1000}s
            </span>
            <button
              onClick={onLeave}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-red-400 transition-colors border border-zinc-200 dark:border-white/10 px-3 py-1.5 rounded-full"
            >
              <LogOut className="w-3 h-3" />
              Leave
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
              Members ({data.members.length})
            </h2>
            <ul className="space-y-2">
              {data.members.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-2">
                  {m.username && m.is_public ? (
                    <Link
                      to={`/u/${m.username}`}
                      className="text-sm hover:text-[#ccff00]"
                    >
                      {m.display_name || m.username}
                      <span className="text-zinc-500 font-light"> @{m.username}</span>
                    </Link>
                  ) : (
                    <span className="text-sm text-zinc-500 font-light">
                      {m.display_name || m.username || "Private member"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="lg:col-span-2 space-y-4">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
              Recent activity (48h)
            </h2>
            {data.recent_activity.length === 0 ? (
              <div className="text-xs text-zinc-500 font-light">
                No sessions in the last 48 hours. Be the first!
              </div>
            ) : (
              <ul className="space-y-0">
                {data.recent_activity.map((s) => (
                  <li
                    key={s.id}
                    className="py-3 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm">
                        <span className="font-medium">
                          {s.display_name || s.username || "Member"}
                        </span>
                        <span className="text-zinc-500 font-light">
                          {" "}studied{" "}
                        </span>
                        <span className="font-medium text-[#ccff00]">
                          {formatDuration(s.duration_minutes)}
                        </span>
                        <span className="text-zinc-500 font-light"> on </span>
                        <span className="font-medium">{s.goal_title}</span>
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-1">
                        {formatDate(s.logged_at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
