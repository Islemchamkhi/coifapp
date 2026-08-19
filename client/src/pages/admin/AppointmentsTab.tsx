import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { useLanguage } from "../../i18n/LanguageContext";
import { Appointment, Staff, ServiceItem } from "../../types";
import { adminGetAppointments, adminCancelAppointment, adminGetStaff, adminGetServices } from "../../api/client";
import AppointmentFormModal from "../../components/AppointmentFormModal";

const statusColors: Record<string, string> = {
  confirmed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
  completed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  blocked: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

export default function AppointmentsTab() {
  const { t, lang } = useLanguage();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [staffFilter, setStaffFilter] = useState<number | "all">("all");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: "create" | "edit" | "block"; appt?: Appointment } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [appts, staff, svc] = await Promise.all([
        adminGetAppointments({ date, staffId: staffFilter === "all" ? undefined : staffFilter }),
        adminGetStaff(),
        adminGetServices(),
      ]);
      setAppointments(appts);
      setStaffList(staff);
      setServices(svc);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, staffFilter]);

  async function handleCancel(id: string) {
    await adminCancelAppointment(id);
    load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="date"
          className="input-field w-auto"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <select
          className="input-field w-auto"
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">{t.allStaff}</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        <button className="btn-secondary" onClick={() => setModal({ mode: "block" })}>
          🚫 {t.blockSlot}
        </button>
        <button className="btn-primary" onClick={() => setModal({ mode: "create" })}>
          + {t.addAppointment}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl2 bg-ink-800 animate-pulse" />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <div className="card px-4 py-8 text-center text-zinc-400 text-sm">{t.noAppointments}</div>
      ) : (
        <div className="space-y-2">
          {appointments.map((a) => (
            <div key={a.id} className="card px-4 py-3 flex items-center gap-3">
              <div className="w-14 text-center shrink-0">
                <p className="font-bold text-gold-500 text-sm">{a.start_time}</p>
                <p className="text-[10px] text-zinc-500">{a.end_time}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {a.client_name || (a.status === "blocked" ? t.blocked : "—")}
                </p>
                <p className="text-xs text-zinc-500 truncate">
                  {a.staff_name} • {a.service_name_fr || "—"}
                  {a.client_phone ? ` • ${a.client_phone}` : ""}
                </p>
              </div>
              <span className={`pill border ${statusColors[a.status]}`}>
                {t[a.status as "confirmed" | "cancelled" | "completed" | "blocked"]}
              </span>
              {a.status !== "cancelled" && (
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => setModal({ mode: "edit", appt: a })}
                    className="text-xs text-zinc-400 hover:text-gold-500 px-2 py-1"
                  >
                    {t.edit}
                  </button>
                  <button
                    onClick={() => handleCancel(a.id)}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                  >
                    {t.cancel}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <AppointmentFormModal
          mode={modal.mode}
          initial={modal.appt}
          defaultDate={date}
          staffList={staffList}
          services={services}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}
