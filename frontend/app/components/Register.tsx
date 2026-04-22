import { Link, useNavigate } from "react-router";
import { ArrowRight, ArrowLeft, Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { LogoMark } from "./shared/Logo";

export function Register() {
  const navigate = useNavigate();
  const { user, register } = useAuth();
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
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans flex flex-col">
      <header className="px-8 py-6 flex justify-between items-center border-b border-zinc-200 dark:border-white/10">
        <Link to="/" className="font-medium text-lg tracking-tight flex items-center gap-2 hover:opacity-80 transition-opacity">
          <LogoMark size={28} />
          StudySprint
        </Link>
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
          className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
        >
          {resolvedTheme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-8 py-16">
        <div className="w-full max-w-sm">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest hover:text-[#ccff00] mb-12 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back
          </Link>

          <h1 className="text-4xl md:text-5xl font-medium tracking-tighter mb-10">
            Create account.
          </h1>

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
                Password <span className="text-zinc-400 dark:text-zinc-700">(min. 6 characters)</span>
              </label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
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

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#ccff00] text-black h-14 rounded-full text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#b3e600] transition-colors disabled:opacity-50"
            >
              {submitting ? "Creating account…" : (
                <>
                  Create account <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center">
              <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                Already have an account? Sign in
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
