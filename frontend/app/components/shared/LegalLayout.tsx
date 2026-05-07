import { Link } from "react-router";
import { ArrowLeft, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { LogoMark } from "./Logo";

interface Props {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalLayout({ title, lastUpdated, children }: Props) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 font-sans selection:bg-[#ccff00] selection:text-black flex flex-col">
      <header className="px-8 py-6 flex justify-between items-center border-b border-zinc-200 dark:border-white/10">
        <Link
          to="/"
          className="font-medium text-lg tracking-tight flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
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

      <main className="flex-1 max-w-3xl mx-auto w-full px-8 py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest hover:text-[#ccff00] mb-12 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back
        </Link>

        <h1 className="text-4xl md:text-5xl font-medium tracking-tighter mb-4">{title}</h1>
        <p className="text-xs uppercase tracking-widest text-zinc-500 font-medium mb-12">
          Last updated: {lastUpdated}
        </p>

        <div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-medium prose-headings:tracking-tight prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-2 prose-p:text-zinc-700 dark:prose-p:text-zinc-300 prose-p:leading-relaxed prose-ul:text-zinc-700 dark:prose-ul:text-zinc-300 prose-li:my-1 prose-a:text-[#ccff00] prose-a:no-underline hover:prose-a:underline prose-strong:text-zinc-900 dark:prose-strong:text-zinc-50">
          {children}
        </div>
      </main>

      <footer className="border-t border-zinc-200 dark:border-white/10 px-8 py-8 text-center text-xs text-zinc-500">
        <div className="flex justify-center gap-6">
          <Link to="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
