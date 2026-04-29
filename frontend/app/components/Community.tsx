import { Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  Users,
  Trophy,
  Plus,
  Lock,
  ExternalLink,
  Check,
  Sparkles,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { getAvatarUrl } from "@/lib/avatar";
import { formatDuration } from "@/lib/format";
import { TopNav } from "./shared/TopNav";

type Me = Awaited<ReturnType<typeof api.getMyProfile>>["user"];

function initials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Community() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [rooms, setRooms] = useState<Awaited<ReturnType<typeof api.listRooms>>["rooms"]>([]);
  const [board, setBoard] = useState<
    Awaited<ReturnType<typeof api.leaderboard>>["entries"]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);

  const load = async () => {
    try {
      const [profileRes, roomsRes, boardRes] = await Promise.all([
        api.getMyProfile(),
        api.listRooms(),
        api.leaderboard(),
      ]);
      setMe(profileRes.user);
      setRooms(roomsRes.rooms);
      setBoard(boardRes.entries);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load community");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totalWeeklyMinutes = board.reduce((sum, e) => sum + e.weekly_minutes, 0);
  const champion = board[0];
  const rest = board.slice(1);
  const hasUsername = !!me?.username;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans">
      <TopNav />
      <main className="max-w-6xl mx-auto px-8 py-12 space-y-12">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest hover:text-[#ccff00] transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back
        </Link>

        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-[#ccff00] text-black p-10 md:p-14">
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest mb-8">
            <Users className="w-4 h-4" />
            Community
          </div>
          <h1 className="text-6xl md:text-8xl font-medium tracking-tighter leading-[0.9]">
            Study<br />together.
          </h1>
          <p className="mt-6 max-w-md text-base md:text-lg font-light leading-relaxed">
            See who's putting in the hours. Spin up rooms with friends. Stay accountable.
          </p>

          <div className="mt-12 flex flex-wrap items-end gap-x-12 gap-y-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">
                This week
              </div>
              <div className="text-3xl md:text-4xl font-medium tracking-tighter tabular-nums">
                {totalWeeklyMinutes > 0 ? formatDuration(totalWeeklyMinutes) : "0m"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">
                On the board
              </div>
              <div className="text-3xl md:text-4xl font-medium tracking-tighter tabular-nums">
                {board.length}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">
                Your rooms
              </div>
              <div className="text-3xl md:text-4xl font-medium tracking-tighter tabular-nums">
                {rooms.length}
              </div>
            </div>
          </div>

          {board.length > 0 && (
            <div className="absolute right-10 top-10 hidden md:flex -space-x-3">
              {board.slice(0, 5).map((e) => (
                <div
                  key={e.username}
                  title={e.display_name || e.username}
                  className="w-12 h-12 rounded-full bg-white dark:bg-zinc-900 ring-2 ring-[#ccff00] overflow-hidden"
                >
                  <img
                    src={getAvatarUrl(e.username)}
                    alt={e.display_name || e.username}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {error && (
          <div className="text-xs text-red-400 font-medium" role="alert">{error}</div>
        )}

        {/* Profile */}
        {me && (
          hasUsername ? (
            <section className="p-6 md:p-8 rounded-2xl border border-zinc-200 dark:border-white/10 flex items-center gap-6">
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center text-xl font-bold tracking-tighter shrink-0 ${
                  me.is_public
                    ? "bg-[#ccff00] text-black"
                    : "bg-zinc-100 dark:bg-white/10 text-zinc-500"
                }`}
              >
                {initials(me.display_name || me.username || "?")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                  Your profile
                </div>
                <div className="text-2xl font-medium tracking-tighter truncate">
                  {me.display_name || me.username}
                  <span className="text-zinc-500 font-light"> @{me.username}</span>
                </div>
                {me.bio && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 font-light leading-relaxed mt-1 line-clamp-2">
                    {me.bio}
                  </p>
                )}
                <div className="text-xs text-zinc-500 mt-2 flex items-center gap-3 flex-wrap">
                  {me.is_public ? (
                    <>
                      <span className="inline-flex items-center gap-1 text-[#ccff00] font-medium">
                        <Check className="w-3 h-3" /> Public
                      </span>
                      <Link
                        to={`/u/${me.username}`}
                        className="inline-flex items-center gap-1 hover:text-[#ccff00]"
                      >
                        <ExternalLink className="w-3 h-3" /> View profile
                      </Link>
                    </>
                  ) : (
                    <span>Private (hidden from leaderboards)</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setEditingProfile(true)}
                className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-[#ccff00] border border-zinc-300 dark:border-white/20 px-4 py-2 rounded-full hover:border-[#ccff00] transition-colors shrink-0"
              >
                Edit
              </button>
            </section>
          ) : (
            <section className="p-6 md:p-8 rounded-2xl border-2 border-dashed border-[#ccff00] bg-[#ccff00]/5 flex items-center justify-between gap-6 flex-wrap">
              <div className="flex items-center gap-5 min-w-0">
                <div className="w-16 h-16 rounded-full bg-[#ccff00] text-black flex items-center justify-center shrink-0">
                  <Sparkles className="w-7 h-7" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                    Set up your profile
                  </div>
                  <div className="text-lg md:text-xl font-medium tracking-tighter">
                    Pick a username to unlock profiles and leaderboards.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setEditingProfile(true)}
                className="text-xs font-bold uppercase tracking-widest bg-[#ccff00] text-black px-5 py-3 rounded-full hover:bg-[#b3e600] transition-colors shrink-0"
              >
                Get started
              </button>
            </section>
          )
        )}

        {/* Leaderboard */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Weekly leaderboard
            </h2>
            {board.length > 0 && (
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 tabular-nums">
                {board.length} learner{board.length === 1 ? "" : "s"}
              </div>
            )}
          </div>

          {board.length === 0 ? (
            <div className="p-10 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-white/15 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#ccff00]/15 flex items-center justify-center mb-4">
                <Trophy className="w-6 h-6 text-[#ccff00]" />
              </div>
              <div className="text-base font-medium tracking-tighter">
                No one's on the board yet.
              </div>
              <div className="text-xs text-zinc-500 mt-1 font-light">
                {me?.is_public
                  ? "Log a session this week to claim #1."
                  : "Go public to claim #1."}
              </div>
              {me && !me.is_public && (
                <button
                  onClick={() => setEditingProfile(true)}
                  className="mt-5 text-[10px] font-bold uppercase tracking-widest bg-[#ccff00] text-black px-4 py-2 rounded-full hover:bg-[#b3e600] transition-colors"
                >
                  Go public
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {champion && (
                <Link
                  to={`/u/${champion.username}`}
                  className="block bg-[#ccff00] text-black rounded-2xl p-6 md:p-8 hover:opacity-95 transition-opacity"
                >
                  <div className="flex items-center gap-4 md:gap-6">
                    <div className="text-4xl md:text-6xl font-medium tracking-tighter tabular-nums">
                      #1
                    </div>
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-white overflow-hidden shrink-0 ring-2 ring-black">
                      <img
                        src={getAvatarUrl(champion.username)}
                        alt={champion.display_name || champion.username}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xl md:text-2xl font-medium tracking-tighter truncate">
                        {champion.display_name || champion.username}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 truncate">
                        @{champion.username}
                      </div>
                    </div>
                    <div className="text-2xl md:text-3xl font-medium tracking-tighter tabular-nums shrink-0">
                      {formatDuration(champion.weekly_minutes)}
                    </div>
                  </div>
                </Link>
              )}
              {rest.length > 0 && (
                <ol className="space-y-1.5">
                  {rest.map((entry, i) => (
                    <li
                      key={entry.username}
                      className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl border border-zinc-100 dark:border-white/5 hover:border-[#ccff00]/40 transition-colors"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="text-sm font-bold tabular-nums text-zinc-500 w-8">
                          #{i + 2}
                        </span>
                        <div className="w-9 h-9 rounded-full bg-white dark:bg-zinc-900 overflow-hidden shrink-0 ring-1 ring-zinc-200 dark:ring-white/10">
                          <img
                            src={getAvatarUrl(entry.username)}
                            alt={entry.display_name || entry.username}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <Link
                          to={`/u/${entry.username}`}
                          className="text-sm font-medium hover:text-[#ccff00] truncate"
                        >
                          {entry.display_name || entry.username}
                          <span className="text-zinc-500 font-light"> @{entry.username}</span>
                        </Link>
                      </div>
                      <div className="text-sm tabular-nums text-[#ccff00] flex-shrink-0">
                        {formatDuration(entry.weekly_minutes)}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>

        {/* Rooms */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Users className="w-4 h-4" /> Your study rooms
            </h2>
            {rooms.length > 0 && (
              <button
                onClick={() => setShowCreateRoom(true)}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-black bg-[#ccff00] hover:bg-[#b3e600] px-3 py-1.5 rounded-full transition-colors"
              >
                <Plus className="w-3 h-3" /> New room
              </button>
            )}
          </div>

          {rooms.length === 0 ? (
            <button
              onClick={() => setShowCreateRoom(true)}
              className="w-full p-12 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-white/20 hover:border-[#ccff00] hover:bg-[#ccff00]/5 transition-colors text-center group"
            >
              <div className="w-14 h-14 mx-auto rounded-full bg-zinc-100 dark:bg-white/5 group-hover:bg-[#ccff00] group-hover:text-black flex items-center justify-center mb-4 transition-colors">
                <Plus className="w-6 h-6" />
              </div>
              <div className="text-base font-medium tracking-tighter">
                Create your first room
              </div>
              <div className="text-xs text-zinc-500 mt-1 font-light">
                Study alongside friends and watch the timer tick together.
              </div>
            </button>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rooms.map((room) => (
                <Link
                  key={room.slug}
                  to={`/rooms/${room.slug}`}
                  className="p-5 rounded-xl border border-zinc-100 dark:border-white/5 hover:border-[#ccff00]/40 hover:bg-[#ccff00]/5 transition-colors block"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50 flex items-center gap-2 tracking-tighter">
                      {room.name}
                      {room.has_passcode && <Lock className="w-3 h-3 text-zinc-500" />}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 tabular-nums shrink-0">
                      {room.member_count} member{room.member_count === 1 ? "" : "s"}
                    </div>
                  </div>
                  {room.description && (
                    <p className="text-xs text-zinc-500 font-light mt-2 line-clamp-2">
                      {room.description}
                    </p>
                  )}
                </Link>
              ))}
              <button
                onClick={() => setShowCreateRoom(true)}
                className="p-5 rounded-xl border-2 border-dashed border-zinc-200 dark:border-white/10 hover:border-[#ccff00] hover:bg-[#ccff00]/5 transition-colors flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-[#ccff00]"
              >
                <Plus className="w-4 h-4" /> New room
              </button>
            </div>
          )}
        </section>
      </main>

      {editingProfile && me && (
        <ProfileEditor
          me={me}
          onClose={() => setEditingProfile(false)}
          onSaved={(u) => {
            setMe(u);
            setEditingProfile(false);
          }}
        />
      )}

      {showCreateRoom && (
        <CreateRoom
          onClose={() => setShowCreateRoom(false)}
          onCreated={(slug) => {
            setShowCreateRoom(false);
            navigate(`/rooms/${slug}`);
          }}
        />
      )}
    </div>
  );
}

function ProfileEditor({
  me,
  onClose,
  onSaved,
}: {
  me: Me;
  onClose: () => void;
  onSaved: (u: Me) => void;
}) {
  const [username, setUsername] = useState(me.username ?? "");
  const [displayName, setDisplayName] = useState(me.display_name ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [isPublic, setIsPublic] = useState(me.is_public);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await api.updateMyProfile({
        username: username || undefined,
        display_name: displayName || null,
        bio: bio || null,
        is_public: isPublic,
      });
      onSaved(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-white/10 rounded-2xl w-full max-w-md p-8 space-y-6"
      >
        <h3 className="text-sm font-bold tracking-widest uppercase">Edit profile</h3>
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            pattern="[a-z0-9_]{3,30}"
            className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 py-2 focus:outline-none focus:border-[#ccff00]"
            placeholder="3-30 chars: a-z, 0-9, _"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Display name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 py-2 focus:outline-none focus:border-[#ccff00]"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Bio
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="w-full bg-transparent border border-zinc-300 dark:border-white/20 rounded-xl p-3 text-sm focus:outline-none focus:border-[#ccff00] resize-none"
          />
        </div>
        <label className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 cursor-pointer">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="accent-[#ccff00]"
          />
          Make profile public (appears on leaderboards)
        </label>
        {error && (
          <p className="text-xs text-red-400" role="alert">{error}</p>
        )}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-full text-xs font-bold tracking-widest uppercase border border-zinc-300 dark:border-white/20 hover:border-zinc-500 dark:hover:border-white/50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 rounded-full text-xs font-bold tracking-widest uppercase bg-[#ccff00] text-black hover:bg-[#b3e600] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateRoom({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [passcode, setPasscode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await api.createRoom({
        name,
        description: description || undefined,
        passcode: passcode || undefined,
      });
      onCreated(res.slug);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create room");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-white/10 rounded-2xl w-full max-w-md p-8 space-y-6"
      >
        <h3 className="text-sm font-bold tracking-widest uppercase">New study room</h3>
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Name
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 py-2 focus:outline-none focus:border-[#ccff00]"
            placeholder="Finals week sprint"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-transparent border border-zinc-300 dark:border-white/20 rounded-xl p-3 text-sm focus:outline-none focus:border-[#ccff00] resize-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Passcode (optional)
          </label>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 py-2 focus:outline-none focus:border-[#ccff00]"
          />
        </div>
        {error && (
          <p className="text-xs text-red-400" role="alert">{error}</p>
        )}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-full text-xs font-bold tracking-widest uppercase border border-zinc-300 dark:border-white/20 hover:border-zinc-500 dark:hover:border-white/50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 rounded-full text-xs font-bold tracking-widest uppercase bg-[#ccff00] text-black hover:bg-[#b3e600] transition-colors disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
