import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// Generates favicon, PWA (incl. maskable) and Apple touch icons from the Kvito app icon (CGP v2: signal green + graphite check).
// The icon is full-bleed, so maskable and Apple icons get no padding – the OS rounds the corners itself.
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: "#38e08c" } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: "#38e08c" } },
  },
  images: ["public/logo.svg"],
});
