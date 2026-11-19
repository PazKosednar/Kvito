import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// Generates favicon, PWA (incl. maskable) and Apple touch icons from the Kvito app icon (CGP v3: "two sides" house on stone).
// The icon is full-bleed; Apple gets no padding (iOS rounds the corners), maskable a little so the house stays inside the circular safe zone.
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.1, resizeOptions: { background: "#eeece7" } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: "#eeece7" } },
  },
  images: ["public/logo.svg"],
});
