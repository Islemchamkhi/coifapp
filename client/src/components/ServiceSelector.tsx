import React from "react";
import { ServiceItem } from "../types";
import { useLanguage } from "../i18n/LanguageContext";

interface Props {
  services: ServiceItem[];
  selectedId: number | null;
  onSelect: (s: ServiceItem) => void;
}

export default function ServiceSelector({ services, selectedId, onSelect }: Props) {
  const { lang, t } = useLanguage();

  return (
    <div className="grid grid-cols-1 gap-3">
      {services.map((s) => {
        const name = lang === "ar" ? s.name_ar : s.name_fr;
        const active = selectedId === s.id;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className={`card flex items-center justify-between px-4 py-4 text-start transition-all ${
              active ? "border-gold-500 shadow-glow" : "hover:border-ink-600"
            }`}
          >
            <span className="font-medium text-zinc-100">{name}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`pill ${
                  active ? "bg-gold-500 text-ink-950" : "bg-ink-800 text-zinc-400"
                }`}
              >
                {s.duration_minutes} {t.minutes}
              </span>
              <span
                className={`pill ${
                  active ? "bg-gold-500 text-ink-950" : "bg-ink-800 text-zinc-400"
                }`}
              >
                {formatPrice(s.price)} {t.currency}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function formatPrice(price: number): string {
  // Affiche un entier proprement (15) mais garde les décimales
  // utiles si elles existent (15.5), sans jamais aller au-delà
  // de 3 décimales (ex: 15.500 -> "15.5").
  return Number.isInteger(price)
    ? String(price)
    : String(Number(price.toFixed(3)));
}