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
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { TopNav } from "./shared/TopNav";

type Me = Awaited<ReturnType<typeof api.getMyProfile>>["user"];

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

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans">
      <TopNav />
      <main className="max-w-5xl mx-auto px-8 py-16 space-y-16">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest hover:text-[#ccff00] transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back
        </Link>

        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ccff00] mb-4">
            <Users className="w-4 h-4" />
            Community
          </div>
          <h1 className="text-4xl md:text-5xl font-medium tracking-tighter">Study together.</h1>
        </div>

        {error && (
          <div className="text-xs text-red-400 font-medium" role="alert">{error}</div>
        )}

        {me && (
          <section className="p-6 rounded-2xl border border-zinc-200 dark:border-white/10 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                  Your profile
                </div>
                {me.username ? (
                  <>
                    <div className="text-2xl font-medium tracking-tighter">
                      {me.display_name || me.username}{" "}
                      <span className="text-zinc-500 font-light">@{me.username}</span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1 flex items-center gap-2">
                      {me.is_public ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-[#ccff00]">
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
                        <span className="text-zinc-500">Private (hidden from leaderboards)</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-zinc-600 dark:text-zinc-400 font-light">
                    Pick a username to unlock profiles and leaderboards.
                  </div>
                )}
              </div>
              <button
                onClick={() => setEditingProfile(true)}
                className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-[#ccff00] border border-zinc-300 dark:border-white/20 px-3 py-1.5 rounded-full hover:border-[#ccff00] transition-colors"
              >
                Edit
              </button>
            </div>
            {me.bio && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 font-light leading-relaxed">
                {me.bio}
              </p>
            )}
          </section>
        )}

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Weekly leaderboard
            </h2>
          </div>
          {board.length === 0 ? (
            <div className="text-xs text-zinc-500 font-light">
              No public users yet. Go public to appear here.
            </div>
          ) : (
            <ol className="space-y-2">
              {board.map((entry, i) => (
                <li
                  key={entry.username}
                  className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl border border-zinc-100 dark:border-white/5 hover:border-[#ccff00]/30 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-xs font-bold tabular-nums text-zinc-500 w-6">
                      #{i + 1}
                    </span>
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
        </section>

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Users className="w-4 h-4" /> Your study rooms
            </h2>
            <button
              onClick={() => setShowCreateRoom(true)}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-black bg-[#ccff00] hover:bg-[#b3e600] px-3 py-1.5 rounded-full transition-colors"
            >
              <Plus className="w-3 h-3" /> New room
            </button>
          </div>
          {rooms.length === 0 ? (
            <div className="text-xs text-zinc-500 font-light">
              No rooms yet — create one to study alongside friends.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rooms.map((room) => (
                <Link
                  key={room.slug}
                  to={`/rooms/${room.slug}`}
                  className="p-4 rounded-xl border border-zinc-100 dark:border-white/5 hover:border-[#ccff00]/30 transition-colors block"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                      {room.name}
                      {room.has_passcode && <Lock className="w-3 h-3 text-zinc-500" />}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 tabular-nums">
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
