import React from "react";
import { SlotWithStatus } from "../types";

interface Props {
  slots: SlotWithStatus[];
  selected: string | null;
  onSelect: (time: string) => void;
  loading?: boolean;
  emptyMessage?: string;
  availableLabel?: string;
  bookedLabel?: string;
}

export default function TimeSlotGrid({
  slots,
  selected,
  onSelect,
  loading,
  emptyMessage,
  availableLabel,
  bookedLabel,
}: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="h-11 rounded-xl bg-ink-800 animate-pulse"
          />
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
      {slots.map(({ time, status, isExceptional }) => {
        const active = selected === time;

        /**
         * SEUL "booked" est réellement indisponible.
         *
         * "available" = réservation normale
         * "request"   = demande exceptionnelle
         *
         * Les deux peuvent être sélectionnés.
         */
        const booked = status === "booked";
        const exceptional = status === "request";

        const label = booked
          ? bookedLabel
          : exceptional
          ? "Demande"
          : availableLabel;

        return (
          <button
            key={`${time}-${status}`}
            type="button"
            onClick={() => {
              if (!booked) {
                onSelect(time);
              }
            }}
            disabled={booked}
            aria-disabled={booked}
            aria-pressed={active}
            title={label}
            className={`h-11 rounded-xl text-sm font-medium border transition-all flex flex-col items-center justify-center leading-tight ${
              booked
                ? "border-ink-800 bg-ink-900/60 text-zinc-600 cursor-not-allowed opacity-60"
                : active
                ? "border-gold-500 bg-gold-500 text-ink-950 shadow-glow font-semibold"
                : exceptional || isExceptional
                ? "border-amber-700/60 bg-amber-950/20 text-amber-300 hover:border-amber-600"
                : "border-ink-700 bg-ink-900 text-zinc-200 hover:border-ink-600"
            }`}
          >
            <span className="flex items-center gap-1">
              <span aria-hidden="true">
                {booked
                  ? "🔴"
                  : exceptional
                  ? "🟠"
                  : "🟢"}
              </span>

              {time}
            </span>
          </button>
        );
      })}
    </div>
  );
}