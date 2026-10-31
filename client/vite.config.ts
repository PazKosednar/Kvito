import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Brand primary for browser UI chrome; keep in sync with --background in src/styles/tokens.css.
const THEME_COLOR = "#eeece7";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        name: "Kvita",
        short_name: "Kvita",
        description: "Najemnina, položnice in sporočila med najemodajalcem in najemnikom na enem mestu.",
        lang: "sl",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: THEME_COLOR,
        background_color: "#eeece7",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        // TODO(faza 1+): runtime caching of the latest API data for offline reading.
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    port: 5180,
    strictPort: true,
    // Same-origin API in development so the httpOnly refresh cookie just works.
    proxy: { "/api": { target: "http://localhost:4180", changeOrigin: false } },
  },
});
