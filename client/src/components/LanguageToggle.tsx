import React from "react";
import { useLanguage } from "../i18n/LanguageContext";

export default function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="inline-flex items-center bg-ink-800 border border-ink-600 rounded-full p-1 text-sm">
      <button
        onClick={() => setLang("ar")}
        className={`px-3 py-1.5 rounded-full transition-colors ${
          lang === "ar" ? "bg-gold-500 text-ink-950 font-semibold" : "text-zinc-400"
        }`}
      >
        العربية
      </button>
      <span className="text-zinc-600 px-0.5">|</span>
      <button
        onClick={() => setLang("fr")}
        className={`px-3 py-1.5 rounded-full transition-colors ${
          lang === "fr" ? "bg-gold-500 text-ink-950 font-semibold" : "text-zinc-400"
        }`}
      >
        Français
      </button>
    </div>
  );
}
