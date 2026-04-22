import { Link } from "react-router";
import type { ReactNode } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/auth";
import { LogoMark } from "./Logo";

export function TopNav({ right }: { right?: ReactNode }) {
  const { user, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="px-8 py-6 flex justify-between items-center border-b border-zinc-200 dark:border-white/10 sticky top-0 bg-white dark:bg-[#0a0a0a] z-20">
      <Link
        to={user ? "/dashboard" : "/"}
        className="font-medium text-lg tracking-tight flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <LogoMark size={28} />
        StudySprint
      </Link>

      <div className="flex gap-4 items-center">
        {right}
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
          className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
        >
          {resolvedTheme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        {user && (
          <button
            onClick={logout}
            className="text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
