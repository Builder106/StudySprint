import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, Eye, Pencil, Volume2, VolumeX } from "lucide-react";
import { createAmbientNoise, type NoiseMode } from "@/lib/ambientNoise";

const NOISE_OPTIONS: { value: NoiseMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "white", label: "White" },
  { value: "pink", label: "Pink" },
  { value: "brown", label: "Brown" },
];

export function focusNotesKey(goalId: number | string): string {
  return `studysprint.focus.notes.${goalId}`;
}

export function readFocusNotes(goalId: number | string): string {
  try {
    return localStorage.getItem(focusNotesKey(goalId)) ?? "";
  } catch {
    return "";
  }
}

export function clearFocusNotes(goalId: number | string) {
  try {
    localStorage.removeItem(focusNotesKey(goalId));
  } catch {
    // storage unavailable
  }
}

interface Props {
  goalId: number | string;
}

export function FocusTools({ goalId }: Props) {
  const [open, setOpen] = useState(false);
  const [noise, setNoise] = useState<NoiseMode>("off");
  const [volume, setVolume] = useState(0.2);
  const [notes, setNotes] = useState<string>(() => readFocusNotes(goalId));
  const [preview, setPreview] = useState(false);
  const controllerRef = useRef<ReturnType<typeof createAmbientNoise> | null>(null);

  useEffect(() => {
    controllerRef.current = createAmbientNoise();
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.start(noise);
  }, [noise]);

  useEffect(() => {
    controllerRef.current?.setVolume(volume);
  }, [volume]);

  // Debounced autosave
  useEffect(() => {
    const handle = setTimeout(() => {
      try {
        if (notes.trim().length > 0) {
          localStorage.setItem(focusNotesKey(goalId), notes);
        } else {
          localStorage.removeItem(focusNotesKey(goalId));
        }
      } catch {
        // storage unavailable
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [notes, goalId]);

  // Hydrate when goalId changes
  useEffect(() => {
    setNotes(readFocusNotes(goalId));
  }, [goalId]);

  const savedHint = useMemo(() => {
    if (notes.length === 0) return "Empty draft.";
    return `${notes.length} character${notes.length === 1 ? "" : "s"} — auto-saved locally.`;
  }, [notes]);

  return (
    <section
      aria-label="Focus tools"
      className="border border-zinc-200 dark:border-white/10 rounded-2xl overflow-hidden"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-900 dark:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-3">
          {noise === "off" ? (
            <VolumeX className="w-4 h-4 text-zinc-500" />
          ) : (
            <Volume2 className="w-4 h-4 text-[#ccff00]" />
          )}
          Focus tools
        </span>
        <ChevronDown
          className={`w-4 h-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-6 border-t border-zinc-200 dark:border-white/10">
          <div className="pt-6 space-y-4">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Ambient noise
            </div>
            <div className="flex flex-wrap gap-2">
              {NOISE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setNoise(opt.value)}
                  aria-pressed={noise === opt.value}
                  className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors ${
                    noise === opt.value
                      ? "border-[#ccff00] bg-[#ccff00]/10 text-[#ccff00]"
                      : "border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <VolumeX className="w-4 h-4 text-zinc-500" />
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
                aria-label="Volume"
                className="flex-1 accent-[#ccff00]"
                disabled={noise === "off"}
              />
              <Volume2 className="w-4 h-4 text-zinc-500" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                Session notes (markdown)
              </div>
              <button
                onClick={() => setPreview((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                {preview ? (
                  <>
                    <Pencil className="w-3 h-3" /> Edit
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" /> Preview
                  </>
                )}
              </button>
            </div>
            {preview ? (
              <div className="min-h-[160px] p-4 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.02] prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:mt-4 prose-headings:mb-2 prose-li:my-0">
                {notes.trim().length === 0 ? (
                  <p className="text-zinc-400 dark:text-zinc-600 italic">
                    Nothing to preview.
                  </p>
                ) : (
                  <ReactMarkdown>{notes}</ReactMarkdown>
                )}
              </div>
            ) : (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Jot down what you're working on — supports **bold**, *italics*, lists, links."
                rows={7}
                className="w-full bg-transparent border border-zinc-200 dark:border-white/10 rounded-xl p-4 text-sm font-light focus:outline-none focus:border-[#ccff00] resize-y"
              />
            )}
            <p className="text-[10px] text-zinc-500 tracking-wide">{savedHint}</p>
          </div>
        </div>
      )}
    </section>
  );
}
