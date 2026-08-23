import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { useLanguage } from "../i18n/LanguageContext";
import { useClientAuth } from "../auth/ClientAuthContext";
import {
  clientGetAppointments,
  clientCancelAppointment,
  getServices,
  getStaff,
  ApiRequestError,
} from "../api/client";
import { Appointment, ServiceItem, Staff } from "../types";
import ClientAppointmentEditModal from "../components/ClientAppointmentEditModal";

export default function ClientAccountPage() {
  const { t, dir } = useLanguage();
  const { client, loading, logout, updateProfile, forceLogout } = useClientAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Réservation en cours de modification (ouvre ClientAppointmentEditModal).
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  // Réservation dont l'annulation est en cours de confirmation.
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // Si le compte n'existe plus côté serveur (ex. base réinitialisée
  // lors d'un redéploiement), on déconnecte proprement et on renvoie
  // vers la connexion avec un message clair, plutôt que de laisser
  // l'utilisateur face à des infos en cache et une erreur confuse.
  function handleAccountGone() {
    forceLogout();
    navigate("/auth", {
      replace: true,
      state: { message: t.sessionExpired },
    });
  }

  function refreshAppointments() {
    return clientGetAppointments()
      .then(r => setAppointments(r.appointments))
      .catch(err => {
        if (err instanceof ApiRequestError && err.code === "CLIENT_NOT_FOUND") {
          handleAccountGone();
          return;
        }
        setError(err instanceof ApiRequestError ? err.message : t.errorGeneric);
      });
  }

  useEffect(() => {
    if (!client) return;
    setName(client.name); setPhone(client.phone); setEmail(client.email);
    refreshAppointments();
    getServices().then(setServices).catch(() => {});
    getStaff().then(setStaffList).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, t.errorGeneric]);

  const upcoming = useMemo(() => {
    const now = dayjs();
    return appointments.filter(a => a.status !== "cancelled" && dayjs(`${a.date} ${a.start_time}`).isAfter(now));
  }, [appointments]);
  const history = useMemo(() => {
    const now = dayjs();
    return appointments.filter(a => a.status === "cancelled" || !dayjs(`${a.date} ${a.start_time}`).isAfter(now));
  }, [appointments]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-zinc-400">{t.loading}</div>;
  if (!client) return <Navigate to="/auth" replace />;

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try { await updateProfile({ name, phone, email }); setProfileOpen(false); }
    catch (err) {
      if (err instanceof ApiRequestError && err.code === "CLIENT_NOT_FOUND") {
        handleAccountGone();
        return;
      }
      setError(err instanceof ApiRequestError ? err.message : t.errorGeneric);
    }
    finally { setSaving(false); }
  }

  function handleEditSaved() {
    setEditingAppointment(null);
    refreshAppointments();
  }

  async function confirmCancel() {
    if (!cancellingId) return;
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      await clientCancelAppointment(cancellingId);
      setCancellingId(null);
      await refreshAppointments();
    } catch (err) {
      setCancelError(err instanceof ApiRequestError ? err.message : t.errorGeneric);
    } finally {
      setCancelSubmitting(false);
    }
  }

  return (
    <div dir={dir} className="min-h-screen px-4 py-5">
      <div className="max-w-md mx-auto">
        <header className="flex items-center justify-between mb-5">
          <Link to="/" className="font-semibold">{t.brand}</Link>
          <div className="flex items-center gap-2"><Link to="/" className="text-sm text-zinc-400">{t.newBooking}</Link><button onClick={logout} className="text-sm text-zinc-400 hover:text-zinc-100">{t.logout}</button></div>
        </header>
        <section className="card p-5 mb-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs text-gold-500 uppercase tracking-wide">{t.myAccount}</p><h1 className="text-xl font-semibold mt-1">{client.name}</h1><p className="text-sm text-zinc-400 mt-1">{client.phone} · {client.email}</p></div>
            <button onClick={() => setProfileOpen(v => !v)} className="btn-secondary px-3 py-2 text-sm">{t.editMyInfo}</button>
          </div>
          {profileOpen && <form onSubmit={saveProfile} className="mt-5 pt-5 border-t border-ink-800 space-y-3"><input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder={t.fullName} required /><input className="input-field" value={phone} onChange={e => setPhone(e.target.value)} placeholder={t.phone} required inputMode="tel" /><input className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t.email} required />{error && <p className="text-red-400 text-sm">{error}</p>}<button disabled={saving} className="btn-primary w-full">{saving ? t.loading : t.save}</button></form>}
        </section>
        {error && !profileOpen && <p className="text-red-400 text-sm mb-4">{error}</p>}
        <AccountAppointments
          title={t.upcomingAppointments}
          appointments={upcoming}
          empty={t.noUpcomingAppointments}
          emptyAction={t.bookNow}
          editable
          onEdit={setEditingAppointment}
          onCancel={(id) => { setCancelError(null); setCancellingId(id); }}
        />
        <AccountAppointments title={t.appointmentHistory} appointments={history} empty={t.noHistory} emptyAction={t.bookNow} />
      </div>

      {editingAppointment && services.length > 0 && staffList.length > 0 && (
        <ClientAppointmentEditModal
          appointment={editingAppointment}
          services={services}
          staffList={staffList}
          onClose={() => setEditingAppointment(null)}
          onSaved={handleEditSaved}
        />
      )}

      {cancellingId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-sm bg-ink-900 border border-ink-700 rounded-t-2xl sm:rounded-xl2 p-5">
            <h3 className="font-semibold mb-2">{t.cancelAppointmentConfirmTitle}</h3>
            <p className="text-sm text-zinc-400 mb-4">{t.cancelAppointmentConfirmMessage}</p>
            {cancelError && <p className="text-red-400 text-sm mb-3">{cancelError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setCancellingId(null); setCancelError(null); }}
                className="btn-secondary flex-1"
                disabled={cancelSubmitting}
              >
                {t.keepAppointment}
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                className="btn-primary flex-1"
                disabled={cancelSubmitting}
              >
                {cancelSubmitting ? t.loading : t.confirmCancelAction}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountAppointments({
  title,
  appointments,
  empty,
  emptyAction,
  editable,
  onEdit,
  onCancel,
}: {
  title: string;
  appointments: Appointment[];
  empty: string;
  emptyAction: string;
  editable?: boolean;
  onEdit?: (a: Appointment) => void;
  onCancel?: (id: string) => void;
}) {
  const { t } = useLanguage();
  return <section className="mb-6"><h2 className="text-lg font-semibold mb-3">{title}</h2>{appointments.length === 0 ? <div className="card p-5 text-center"><p className="text-sm text-zinc-500">{empty}</p><Link to="/" className="btn-primary inline-block mt-4">{emptyAction}</Link></div> : <div className="space-y-3">{appointments.map(a => <div key={a.id} className="card p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{a.service_name_fr || "—"}</p><p className="text-sm text-zinc-400 mt-1">{a.staff_name || "—"}</p></div><span className="pill bg-ink-800 text-zinc-300">{statusLabel(a.status, t)}</span></div><div className="grid grid-cols-2 gap-2 mt-3 text-sm"><div><p className="text-xs text-zinc-500">{t.date}</p><p>{dayjs(a.date).format("DD/MM/YYYY")}</p></div><div><p className="text-xs text-zinc-500">{t.time}</p><p>{a.start_time}</p></div></div>{editable && (a.status === "confirmed" || a.status === "pending") && <div className="flex gap-2 mt-3"><button type="button" onClick={() => onEdit?.(a)} className="btn-secondary flex-1 text-sm">{t.edit}</button><button type="button" onClick={() => onCancel?.(a.id)} className="btn-secondary flex-1 text-sm text-red-400">{t.cancel}</button></div>}</div>)}</div>}</section>;
}

function statusLabel(status: Appointment["status"], t: Record<string, string>) {
  const map: Record<string, string> = { confirmed: t.confirmed, pending: t.pending, cancelled: t.cancelled, completed: t.completed, blocked: t.blocked };
  return map[status] || status;
}