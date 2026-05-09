import { defineConfig } from "vite";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

// import.meta.dirname is ES2024 and works in both Deno and Node 20+.
const root = import.meta.dirname ?? new URL(".", import.meta.url).pathname;

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the frontend directory
      "@": path.resolve(root, "./frontend"),
    },
  },
  build: {
    rollupOptions: {
      external: ["@vercel/analytics"],
    },
  },

  // Static assets live under frontend/public, not the Vite default of ./public.
  // Without this override the favicon at /logo.svg would 404.
  publicDir: path.resolve(root, "./frontend/public"),

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ["**/*.svg", "**/*.csv"],
});
