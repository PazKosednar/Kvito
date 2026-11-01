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
        name: "Kvito",
        short_name: "Kvito",
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
        // Web Push handlers (push + notificationclick).
        importScripts: ["push-sw.js"],
        // Offline reading: the last successful answer of every read-only API call. The network always wins
        // when it is there; the cache only answers when it is not. Cleared on sign-out (see useAuth).
        runtimeCaching: [
          {
            urlPattern: ({ url, request }: { url: URL; request: Request }) =>
              request.method === "GET" &&
              url.pathname.startsWith("/api/") &&
              !/^\/api\/(auth|push|files|upn)\b/.test(url.pathname) &&
              !url.pathname.endsWith("/qr.png"),
            handler: "NetworkFirst",
            options: {
              cacheName: "kvito-api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 150, maxAgeSeconds: 14 * 24 * 60 * 60 },
            },
          },
        ],
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
    proxy: {
      "/api": { target: "http://localhost:4180", changeOrigin: false },
      // Realtime messages (Socket.IO over WebSocket).
      "/socket.io": { target: "http://localhost:4180", ws: true, changeOrigin: false },
    },
  },
});
