"use client";

import { useLanguage } from "@/lib/language";

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="fixed top-6 right-6 z-50 flex items-center gap-1 rounded-full bg-white/80 p-1 shadow-lg backdrop-blur-md ring-1 ring-slate-900/10">
      <button
        onClick={() => setLanguage("en")}
        aria-label="English"
        className={`flex h-10 w-10 items-center justify-center rounded-full text-xl transition-all duration-200 ${
          language === "en"
            ? "bg-slate-100 shadow-sm ring-1 ring-slate-200 scale-100 opacity-100"
            : "scale-95 hover:scale-100 opacity-50 hover:opacity-100"
        }`}
        title="English"
      >
        🇬🇧
      </button>
      <button
        onClick={() => setLanguage("vi")}
        aria-label="Tiếng Việt"
        className={`flex h-10 w-10 items-center justify-center rounded-full text-xl transition-all duration-200 ${
          language === "vi"
            ? "bg-slate-100 shadow-sm ring-1 ring-slate-200 scale-100 opacity-100"
            : "scale-95 hover:scale-100 opacity-50 hover:opacity-100"
        }`}
        title="Tiếng Việt"
      >
        🇻🇳
      </button>
    </div>
  );
}