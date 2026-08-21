import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import dayjs from "dayjs";
import { useLanguage } from "../i18n/LanguageContext";
import { useClientAuth } from "../auth/ClientAuthContext";
import { clientGetAppointments, ApiRequestError } from "../api/client";
import { Appointment } from "../types";

export default function ClientAccountPage() {
  const { t, dir } = useLanguage();
  const { client, loading, logout, updateProfile } = useClientAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!client) return;
    setName(client.name); setPhone(client.phone); setEmail(client.email);
    clientGetAppointments().then(r => setAppointments(r.appointments)).catch(err => setError(err instanceof ApiRequestError ? err.message : t.errorGeneric));
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
    catch (err) { setError(err instanceof ApiRequestError ? err.message : t.errorGeneric); }
    finally { setSaving(false); }
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
        <AccountAppointments title={t.upcomingAppointments} appointments={upcoming} empty={t.noUpcomingAppointments} emptyAction={t.bookNow} />
        <AccountAppointments title={t.appointmentHistory} appointments={history} empty={t.noHistory} emptyAction={t.bookNow} />
      </div>
    </div>
  );
}

function AccountAppointments({ title, appointments, empty, emptyAction }: { title: string; appointments: Appointment[]; empty: string; emptyAction: string }) {
  const { t } = useLanguage();
  return <section className="mb-6"><h2 className="text-lg font-semibold mb-3">{title}</h2>{appointments.length === 0 ? <div className="card p-5 text-center"><p className="text-sm text-zinc-500">{empty}</p><Link to="/" className="btn-primary inline-block mt-4">{emptyAction}</Link></div> : <div className="space-y-3">{appointments.map(a => <div key={a.id} className="card p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{a.service_name_fr || "—"}</p><p className="text-sm text-zinc-400 mt-1">{a.staff_name || "—"}</p></div><span className="pill bg-ink-800 text-zinc-300">{statusLabel(a.status, t)}</span></div><div className="grid grid-cols-2 gap-2 mt-3 text-sm"><div><p className="text-xs text-zinc-500">{t.date}</p><p>{dayjs(a.date).format("DD/MM/YYYY")}</p></div><div><p className="text-xs text-zinc-500">{t.time}</p><p>{a.start_time}</p></div></div></div>)}</div>}</section>;
}

function statusLabel(status: Appointment["status"], t: Record<string, string>) {
  const map: Record<string, string> = { confirmed: t.confirmed, pending: t.pending, cancelled: t.cancelled, completed: t.completed, blocked: t.blocked };
  return map[status] || status;
}
