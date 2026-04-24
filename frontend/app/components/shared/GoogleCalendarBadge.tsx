import { useEffect, useState } from "react";
import { Calendar, Link as LinkIcon, Unlink } from "lucide-react";
import { api, ApiError } from "@/lib/api";

interface Props {
  onChange?: (connected: boolean) => void;
}

export function GoogleCalendarBadge({ onChange }: Props) {
  const [status, setStatus] = useState<{ configured: boolean; connected: boolean } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .googleStatus()
      .then((s) => {
        setStatus(s);
        onChange?.(s.connected);
      })
      .catch(() => setStatus({ configured: false, connected: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.googleAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start Google connect");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.googleDisconnect();
      setStatus({ configured: true, connected: false });
      onChange?.(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  };

  if (!status || !status.configured) return null;

  return (
    <div className="flex items-center gap-3">
      {status.connected ? (
        <>
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#ccff00]">
            <Calendar className="w-4 h-4" /> Calendar linked
          </span>
          <button
            onClick={disconnect}
            disabled={busy}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
            aria-label="Disconnect Google Calendar"
          >
            <Unlink className="w-3 h-3" /> Unlink
          </button>
        </>
      ) : (
        <button
          onClick={connect}
          disabled={busy}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-[#ccff00] transition-colors disabled:opacity-50"
        >
          <LinkIcon className="w-3 h-3" /> {busy ? "Connecting…" : "Connect Calendar"}
        </button>
      )}
      {error && (
        <span className="text-[10px] text-red-400 font-medium" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
