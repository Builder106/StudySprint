import { Link, useNavigate } from "react-router";
import { ArrowRight, Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { LogoMark } from "./shared/Logo";

export function Landing() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Sign-in failed";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans selection:bg-[#ccff00] selection:text-black flex flex-col">
      <header className="px-8 py-6 flex justify-between items-center border-b border-zinc-200 dark:border-white/10">
        <div className="font-medium text-lg tracking-tight flex items-center gap-2">
          <LogoMark size={28} />
          StudySprint
        </div>
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
          className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
        >
          {resolvedTheme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row items-center justify-center max-w-7xl mx-auto w-full px-8 py-16 gap-16 lg:gap-24">
        <div className="flex-1 w-full space-y-8">
          <h1 className="text-6xl md:text-8xl font-medium tracking-tighter leading-[1.05]">
            Plan goals.<br />
            Track time.<br />
            <span className="text-[#ccff00]">Study smarter.</span>
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-md font-light leading-relaxed">
            Minimalist time tracking designed for deep focus. No distractions, just progress.
          </p>
        </div>

        <div className="w-full max-w-sm">
          <form className="flex flex-col gap-8" onSubmit={onSubmit}>
            <div className="space-y-3">
              <label className="text-xs uppercase tracking-widest text-zinc-500 font-medium">
                Email address
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 px-0 py-3 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-700 focus:outline-none focus:border-[#ccff00] transition-colors rounded-none"
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs uppercase tracking-widest text-zinc-500 font-medium">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-transparent border-b border-zinc-300 dark:border-white/20 px-0 py-3 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-700 focus:outline-none focus:border-[#ccff00] transition-colors rounded-none"
              />
            </div>

            {error && (
              <div className="text-xs text-red-400 font-medium" role="alert">
                {error}
              </div>
            )}

            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#ccff00] text-black h-14 rounded-full text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#b3e600] transition-colors disabled:opacity-50"
              >
                {submitting ? "Signing in…" : (
                  <>
                    Sign In <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            <div className="text-center">
              <Link
                to="/register"
                className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                Create an account
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
