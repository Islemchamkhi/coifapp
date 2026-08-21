import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { useLanguage } from "../../i18n/LanguageContext";
import { ClientRow, Appointment, Staff } from "../../types";
import {
  adminGetClients,
  adminGetClientAppointments,
  adminGetAppointments,
  adminGetStaff,
  ApiRequestError,
  adminLogout,
} from "../../api/client";

type Mode = "search" | "byDay";

export default function ClientsTab() {
  const { t } = useLanguage();

  // --------------------------------------------------
  // Mode d'affichage : recherche globale (existant) ou
  // historique d'une journée précise (nouveau).
  // --------------------------------------------------
  const [mode, setMode] = useState<Mode>("search");

  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ClientRow | null>(null);
  const [history, setHistory] = useState<Appointment[]>([]);

  // --------------------------------------------------
  // Vue "par jour"
  // --------------------------------------------------
  const [dayDate, setDayDate] = useState(
    dayjs().format("YYYY-MM-DD")
  );
  const [dayStaffFilter, setDayStaffFilter] = useState<number | "all">("all");
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [dayAppointments, setDayAppointments] = useState<Appointment[]>([]);

  function handleAuthError(error: unknown): boolean {
    if (
      error instanceof ApiRequestError &&
      (error.code === "UNAUTHORIZED" || error.code === "INVALID_TOKEN")
    ) {
      adminLogout();
      window.location.reload();
      return true;
    }
    return false;
  }

  // --------------------------------------------------
  // Recherche globale (existant)
  // --------------------------------------------------
  useEffect(() => {
    if (mode !== "search") return;

    const timeout = setTimeout(() => {
      setLoading(true);
      setLoadError(null);

      adminGetClients(search)
        .then(setClients)
        .catch((error) => {
          console.error("Erreur lors du chargement des clients :", error);
          if (handleAuthError(error)) return;
          setLoadError(t.errorGeneric);
          setClients([]);
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, mode]);

  // --------------------------------------------------
  // Vue par jour : charge tous les rendez-vous du jour
  // sélectionné (source = backend, comme dans l'onglet
  // Rendez-vous), pour lister tous les clients de la
  // journée.
  // --------------------------------------------------
  useEffect(() => {
    if (mode !== "byDay") return;

    setLoading(true);
    setLoadError(null);

    Promise.all([
      adminGetAppointments({
        date: dayDate,
        staffId: dayStaffFilter === "all" ? undefined : dayStaffFilter,
      }),
      adminGetStaff(),
    ])
      .then(([appts, staff]) => {
        setDayAppointments(appts);
        setStaffList(staff);
      })
      .catch((error) => {
        console.error("Erreur lors du chargement de l'historique du jour :", error);
        if (handleAuthError(error)) return;
        setLoadError(t.errorGeneric);
        setDayAppointments([]);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dayDate, dayStaffFilter]);

  useEffect(() => {
    if (!selected) return;
    adminGetClientAppointments(selected.client_phone)
      .then(setHistory)
      .catch((error) => {
        console.error("Erreur lors du chargement de l'historique client :", error);
        handleAuthError(error);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function openClientFromAppointment(appointment: Appointment) {
    if (!appointment.client_phone) return;
    setSelected({
      client_phone: appointment.client_phone,
      client_name: appointment.client_name || appointment.client_phone,
      total_appointments: 0,
      first_visit: appointment.date,
      last_visit: appointment.date,
      cancellations: 0,
    });
  }

  return (
    <div>
      {/* ================================================= */}
      {/* BASCULE RECHERCHE / PAR JOUR */}
      {/* ================================================= */}
      <div className="flex gap-1 mb-4 bg-ink-900 border border-ink-700 rounded-full p-1 w-fit">
        <button
          type="button"
          onClick={() => setMode("search")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            mode === "search" ? "bg-gold-500 text-ink-950" : "text-zinc-400"
          }`}
        >
          {t.searchClient}
        </button>
        <button
          type="button"
          onClick={() => setMode("byDay")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            mode === "byDay" ? "bg-gold-500 text-ink-950" : "text-zinc-400"
          }`}
        >
          {t.dailyHistory}
        </button>
      </div>

      {mode === "search" && (
        <input
          className="input-field mb-4"
          placeholder={t.searchClient}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {mode === "byDay" && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            type="date"
            className="input-field w-auto"
            value={dayDate}
            onChange={(e) => setDayDate(e.target.value)}
          />
          <select
            className="input-field w-auto"
            value={dayStaffFilter}
            onChange={(e) =>
              setDayStaffFilter(e.target.value === "all" ? "all" : Number(e.target.value))
            }
          >
            <option value="all">{t.allStaff}</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl2 bg-ink-800 animate-pulse" />
          ))}
        </div>
      ) : loadError ? (
        <div className="card px-4 py-8 text-center text-red-400 text-sm space-y-3">
          <p>{loadError}</p>
        </div>
      ) : mode === "search" ? (
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
      ) : dayAppointments.length === 0 ? (
        <div className="card px-4 py-8 text-center text-zinc-400 text-sm">{t.noAppointments}</div>
      ) : (
        <div className="space-y-2">
          {dayAppointments.map((a) => (
            <button
              key={a.id}
              onClick={() => openClientFromAppointment(a)}
              disabled={!a.client_phone}
              className="card w-full px-4 py-3 flex items-center gap-3 text-start hover:border-ink-600 disabled:cursor-default disabled:hover:border-ink-700"
            >
              <div className="w-14 text-center shrink-0">
                <p className="font-bold text-gold-500 text-sm">{a.start_time}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {a.client_name || (a.status === "blocked" ? t.blocked : "—")}
                </p>
                <p className="text-xs text-zinc-500 truncate">
                  {a.client_phone || "—"} • {a.staff_name} • {a.service_name_fr || "—"}
                </p>
              </div>
              <span className="text-xs text-zinc-400">
                {t[a.status as keyof typeof t] as string}
              </span>
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