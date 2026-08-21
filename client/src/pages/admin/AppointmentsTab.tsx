import React, { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  Appointment,
  Staff,
  ServiceItem,
} from "../../types";
import {
  adminGetAppointments,
  adminCancelAppointment,
  adminGetStaff,
  adminGetServices,
} from "../../api/client";
import AppointmentFormModal from "../../components/AppointmentFormModal";

const statusColors: Record<string, string> = {
  confirmed:
    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  pending:
    "bg-amber-500/15 text-amber-400 border-amber-500/30",
  cancelled:
    "bg-red-500/15 text-red-400 border-red-500/30",
  completed:
    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  blocked:
    "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

export default function AppointmentsTab() {
  const { t, dir } = useLanguage();

  // --------------------------------------------------
  // Date sélectionnée
  // --------------------------------------------------
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  // --------------------------------------------------
  // Filtre coiffeur
  // --------------------------------------------------
  const [staffFilter, setStaffFilter] = useState<number | "all">("all");

  // --------------------------------------------------
  // Filtre statut (inclut désormais "pending" pour les
  // demandes exceptionnelles 20h-21h)
  // --------------------------------------------------
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // --------------------------------------------------
  // Données
  // --------------------------------------------------
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);

  const [loading, setLoading] = useState(true);

  // --------------------------------------------------
  // Modal
  // --------------------------------------------------
  const [modal, setModal] = useState<{
    mode: "create" | "edit" | "block";
    appt?: Appointment;
  } | null>(null);

  // --------------------------------------------------
  // Charger les rendez-vous
  //
  // IMPORTANT :
  // Aucun filtre selon l'heure n'est appliqué ici.
  //
  // Donc :
  // 14:40 reste affiché après 14:40
  // 15:10 reste affiché après 15:10
  // --------------------------------------------------
  async function load() {
    setLoading(true);

    try {
      const [appts, staff, svc] = await Promise.all([
        adminGetAppointments({
          date,
          staffId:
            staffFilter === "all"
              ? undefined
              : staffFilter,
          status:
            statusFilter === "all"
              ? undefined
              : statusFilter,
        }),
        adminGetStaff(),
        adminGetServices(),
      ]);

      // On affiche exactement les rendez-vous
      // retournés par le backend.
      // Aucun rendez-vous passé n'est supprimé.
      setAppointments(appts);

      setStaffList(staff);
      setServices(svc);
    } catch (error) {
      console.error(
        "Erreur lors du chargement des rendez-vous :",
        error
      );
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // Chargement initial + changement date/coiffeur
  // --------------------------------------------------
  useEffect(() => {
    load();

    // load est volontairement exclu des dépendances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, staffFilter, statusFilter]);

  // --------------------------------------------------
  // Annulation MANUELLE uniquement
  //
  // Aucun rendez-vous n'est annulé automatiquement
  // lorsque son heure est dépassée.
  // --------------------------------------------------
  async function handleCancel(id: string) {
    try {
      await adminCancelAppointment(id);
      await load();
    } catch (error) {
      console.error(
        "Erreur lors de l'annulation du rendez-vous :",
        error
      );
    }
  }

  return (
    <div dir={dir}>

      {/* ================================================= */}
      {/* FILTRES + BOUTONS */}
      {/* ================================================= */}

      <div className="flex flex-wrap items-center gap-2 mb-4">

        {/* Date */}
        <input
          type="date"
          className="input-field w-auto"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        {/* Coiffeur */}
        <select
          className="input-field w-auto"
          value={staffFilter}
          onChange={(e) =>
            setStaffFilter(
              e.target.value === "all"
                ? "all"
                : Number(e.target.value)
            )
          }
        >
          <option value="all">
            {t.allStaff}
          </option>

          {staffList.map((staff) => (
            <option
              key={staff.id}
              value={staff.id}
            >
              {staff.name}
            </option>
          ))}
        </select>

        {/* Statut */}
        <select
          className="input-field w-auto"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">{t.allStatuses}</option>
          <option value="confirmed">{t.confirmed}</option>
          <option value="pending">{t.pending}</option>
          <option value="completed">{t.completed}</option>
          <option value="cancelled">{t.cancelled}</option>
          <option value="blocked">{t.blocked}</option>
        </select>

        <div className="flex-1" />

        {/* Bloquer un créneau */}
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            setModal({
              mode: "block",
            })
          }
        >
          🚫 {t.blockSlot}
        </button>

        {/* Ajouter un rendez-vous */}
        <button
          type="button"
          className="btn-primary"
          onClick={() =>
            setModal({
              mode: "create",
            })
          }
        >
          + {t.addAppointment}
        </button>
      </div>

      {/* ================================================= */}
      {/* CHARGEMENT */}
      {/* ================================================= */}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl2 bg-ink-800 animate-pulse"
            />
          ))}
        </div>

      ) : appointments.length === 0 ? (

        /* ================================================= */
        /* AUCUN RENDEZ-VOUS */
        /* ================================================= */

        <div className="card px-4 py-8 text-center text-zinc-400 text-sm">
          {t.noAppointments}
        </div>

      ) : (

        /* ================================================= */
        /* LISTE DES RENDEZ-VOUS */
        /* ================================================= */

        <div className="space-y-2">

          {appointments.map((appointment) => (

            <div
              key={appointment.id}
              className="card px-4 py-3 flex items-center gap-3"
            >

              {/* ================================================= */}
              {/* HEURE */}
              {/* ================================================= */}

              <div className="w-14 text-center shrink-0">

                <p className="font-bold text-gold-500 text-sm">
                  {appointment.start_time}
                </p>

                <p className="text-[10px] text-zinc-500">
                  {appointment.end_time}
                </p>

              </div>

              {/* ================================================= */}
              {/* INFORMATIONS CLIENT */}
              {/* ================================================= */}

              <div className="flex-1 min-w-0">

                <p className="font-medium text-sm truncate">
                  {appointment.client_name ||
                    (
                      appointment.status === "blocked"
                        ? t.blocked
                        : "—"
                    )}
                </p>

                <p className="text-xs text-zinc-500 truncate">
                  {appointment.client_phone || "—"}
                </p>

                <p className="text-xs text-zinc-500 truncate">
                  {appointment.service_name_fr || "—"}
                  {appointment.staff_name
                    ? ` • ${appointment.staff_name}`
                    : ""}
                </p>

              </div>

              {/* ================================================= */}
              {/* STATUT */}
              {/* ================================================= */}

              <span
                className={`pill border ${
                  statusColors[appointment.status] ||
                  statusColors.confirmed
                }`}
              >
                {
                  t[
                    appointment.status as
                      | "confirmed"
                      | "pending"
                      | "cancelled"
                      | "completed"
                      | "blocked"
                  ]
                }
              </span>

              {/* ================================================= */}
              {/* ACTIONS */}
              {/* ================================================= */}

              {appointment.status !== "cancelled" && (
                <div className="flex items-center gap-1 shrink-0">

                  {/* Modifier */}
                  <button
                    type="button"
                    onClick={() =>
                      setModal({
                        mode: "edit",
                        appt: appointment,
                      })
                    }
                    className="text-xs text-zinc-400 hover:text-gold-500 px-2 py-1"
                  >
                    {t.edit}
                  </button>

                  {/* Annuler manuellement */}
                  <button
                    type="button"
                    onClick={() =>
                      handleCancel(appointment.id)
                    }
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

      {/* ================================================= */}
      {/* MODAL */}
      {/* ================================================= */}

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