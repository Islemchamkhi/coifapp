import React from "react";

interface Props {
  slots: string[];
  selected: string | null;
  onSelect: (time: string) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export default function TimeSlotGrid({ slots, selected, onSelect, loading, emptyMessage }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-11 rounded-xl bg-ink-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="card px-4 py-6 text-center text-zinc-400 text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {slots.map((time) => {
        const active = selected === time;
        return (
          <button
            key={time}
            onClick={() => onSelect(time)}
            className={`h-11 rounded-xl text-sm font-medium border transition-all ${
              active
                ? "border-gold-500 bg-gold-500 text-ink-950 shadow-glow font-semibold"
                : "border-ink-700 bg-ink-900 text-zinc-200 hover:border-ink-600"
            }`}
          >
            {time}
          </button>
        );
      })}
    </div>
  );
}
