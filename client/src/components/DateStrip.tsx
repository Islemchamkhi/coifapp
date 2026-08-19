import React from "react";
import dayjs from "dayjs";
import "dayjs/locale/ar";
import "dayjs/locale/fr";
import { useLanguage } from "../i18n/LanguageContext";

interface Props {
  selected: string | null;
  onSelect: (date: string) => void;
  daysAhead?: number;
}

export default function DateStrip({ selected, onSelect, daysAhead = 21 }: Props) {
  const { lang, t } = useLanguage();
  dayjs.locale(lang);

  const days = Array.from({ length: daysAhead }, (_, i) => dayjs().add(i, "day"));

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
      {days.map((d) => {
        const dateStr = d.format("YYYY-MM-DD");
        const isMonday = d.day() === 1;
        const active = selected === dateStr;
        const label =
          d.isSame(dayjs(), "day") ? t.today : d.isSame(dayjs().add(1, "day"), "day") ? t.tomorrow : d.format("D MMM");

        return (
          <button
            key={dateStr}
            disabled={isMonday}
            onClick={() => onSelect(dateStr)}
            className={`snap-start shrink-0 flex flex-col items-center justify-center w-16 h-20 rounded-xl2 border transition-all ${
              isMonday
                ? "border-ink-800 bg-ink-900/40 text-zinc-600 cursor-not-allowed"
                : active
                ? "border-gold-500 bg-gold-500 text-ink-950 shadow-glow font-semibold"
                : "border-ink-700 bg-ink-900 text-zinc-200 hover:border-ink-600"
            }`}
          >
            <span className="text-[11px] uppercase opacity-80">{d.format("ddd")}</span>
            <span className="text-lg font-bold">{d.format("D")}</span>
            <span className="text-[10px] opacity-70">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
