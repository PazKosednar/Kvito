import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE, STORAGE_KEYS, SUPPORTED_LOCALES, type Locale } from "@/constants";
import { storage } from "@/lib/storage";
import en from "./locales/en.json";
import sl from "./locales/sl.json";

const saved = storage.get(STORAGE_KEYS.locale);
const initial: Locale = SUPPORTED_LOCALES.includes(saved as Locale) ? (saved as Locale) : DEFAULT_LOCALE;

void i18n.use(initReactI18next).init({
  resources: { sl: { translation: sl }, en: { translation: en } },
  lng: initial,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
  storage.set(STORAGE_KEYS.locale, lng);
});
document.documentElement.lang = initial;

export default i18n;
