import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { useLanguage } from "../../i18n/LanguageContext";
import { ClientRow, Appointment } from "../../types";
import { adminGetClients, adminGetClientAppointments } from "../../api/client";

export default function ClientsTab() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ClientRow | null>(null);
  const [history, setHistory] = useState<Appointment[]>([]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      adminGetClients(search)
        .then(setClients)
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!selected) return;
    adminGetClientAppointments(selected.client_phone).then(setHistory);
  }, [selected]);

  return (
    <div>
      <input
        className="input-field mb-4"
        placeholder={t.searchClient}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl2 bg-ink-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <button
              key={c.client_phone}
              onClick={() => setSelected(c)}
              className="card w-full px-4 py-3 flex items-center gap-3 text-start hover:border-ink-600"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{c.client_name || c.client_phone}</p>
                <p className="text-xs text-zinc-500">{c.client_phone}</p>
                <p className="text-[10px] text-zinc-600">
                  {t.firstVisit}: {dayjs(c.first_visit).format("D MMM YYYY")}
                </p>
              </div>
              <div className="text-end shrink-0">
                <p className="text-sm font-semibold text-gold-500">{c.total_appointments}</p>
                <p className="text-[10px] text-zinc-500">{t.totalVisits}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-ink-900 border border-ink-700 rounded-t-2xl sm:rounded-xl2 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800 sticky top-0 bg-ink-900">
              <div>
                <p className="font-semibold">{selected.client_name || selected.client_phone}</p>
                <p className="text-xs text-zinc-500">{selected.client_phone}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-400 hover:text-zinc-100">
                ✕
              </button>
            </div>
            <div className="px-5 py-4 space-y-2">
              {history.map((h) => (
                <div key={h.id} className="card px-3 py-2 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">
                      {dayjs(h.date).format("D MMM YYYY")} • {h.start_time}
                      {h.service_duration ? ` (${h.service_duration} min)` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {h.staff_name} • {h.service_name_fr}
                    </p>
                    {h.notes && (
                      <p className="text-xs text-zinc-600 italic">{h.notes}</p>
                    )}
                  </div>
                  <span className="text-xs text-zinc-400">{t[h.status as keyof typeof t] as string}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}