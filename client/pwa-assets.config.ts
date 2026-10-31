import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// Generates favicon, PWA (incl. maskable) and Apple touch icons from the temporary Kvita logo.
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: "#2f48ff" } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: "#2f48ff" } },
  },
  images: ["public/logo.svg"],
});
