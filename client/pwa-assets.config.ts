import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// Generates favicon, PWA (incl. maskable) and Apple touch icons from the temporary Kvita logo.
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: "#1f7a72" } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: "#1f7a72" } },
  },
  images: ["public/logo.svg"],
});
