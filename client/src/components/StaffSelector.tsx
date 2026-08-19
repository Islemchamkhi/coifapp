import React from "react";
import { Staff } from "../types";

interface Props {
  staff: Staff[];
  selectedId: number | null;
  onSelect: (s: Staff) => void;
}

export default function StaffSelector({ staff, selectedId, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {staff.map((s) => {
        const active = selectedId === s.id;
        const initial = s.name.charAt(0).toUpperCase();
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className={`card flex flex-col items-center justify-center gap-2 py-6 transition-all ${
              active ? "border-gold-500 shadow-glow" : "hover:border-ink-600"
            }`}
          >
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${
                active ? "bg-gold-500 text-ink-950" : "bg-ink-800 text-gold-500"
              }`}
            >
              {initial}
            </div>
            <span className="font-medium text-zinc-100">{s.name}</span>
          </button>
        );
      })}
    </div>
  );
}
