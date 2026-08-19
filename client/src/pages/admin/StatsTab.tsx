import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { useLanguage } from "../../i18n/LanguageContext";
import { StatsResponse } from "../../types";
import { adminGetStats } from "../../api/client";

export default function StatsTab() {
  const { t } = useLanguage();
  const [range, setRange] = useState<"7" | "30" | "all">("7");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const to = dayjs().format("YYYY-MM-DD");
    const from =
      range === "all" ? "2000-01-01" : dayjs().subtract(Number(range), "day").format("YYYY-MM-DD");
    adminGetStats(from, to)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [range]);

  if (loading || !stats) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl2 bg-ink-800 animate-pulse" />
        ))}
      </div>
    );
  }

  const maxHour = Math.max(1, ...stats.byHour.map((h) => h.total));

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(["7", "30", "all"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`pill border ${
              range === r ? "bg-gold-500 text-ink-950 border-gold-500" : "border-ink-700 text-zinc-400"
            }`}
          >
            {r === "7" ? "7j" : r === "30" ? "30j" : "Tout"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t.totalToday} value={stats.todayCount} />
        <StatCard label={t.confirmed} value={stats.totals.confirmed} />
        <StatCard label={t.cancelled} value={stats.totals.cancelled} />
      </div>

      <div>
        <h3 className="font-semibold mb-3">{t.perStaff}</h3>
        <div className="space-y-2">
          {stats.byStaff.map((s) => (
            <BarRow key={s.staff_name} label={s.staff_name} value={s.total} max={stats.totals.confirmed || 1} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3">{t.perService}</h3>
        <div className="space-y-2">
          {stats.byService.map((s) => (
            <BarRow key={s.service_name} label={s.service_name} value={s.total} max={stats.totals.confirmed || 1} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3">{t.peakHours}</h3>
        <div className="flex items-end gap-1 h-24">
          {stats.byHour.map((h) => (
            <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-gold-500/70 rounded-t"
                style={{ height: `${(h.total / maxHour) * 100}%`, minHeight: 2 }}
              />
              <span className="text-[9px] text-zinc-500">{h.hour}h</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-3 py-4 text-center">
      <p className="text-2xl font-bold text-gold-500">{value}</p>
      <p className="text-[10px] text-zinc-500 mt-1">{label}</p>
    </div>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-500">{value}</span>
      </div>
      <div className="h-2 bg-ink-800 rounded-full overflow-hidden">
        <div className="h-full bg-gold-500 rounded-full" style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );
}
