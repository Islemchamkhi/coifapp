import React, { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { Staff, ServiceItem, Appointment } from "../types";
import { adminCreateAppointment, adminUpdateAppointment, ApiRequestError } from "../api/client";

interface Props {
  mode: "create" | "edit" | "block";
  staffList: Staff[];
  services: ServiceItem[];
  initial?: Appointment | null;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function AppointmentFormModal({
  mode,
  staffList,
  services,
  initial,
  defaultDate,
  onClose,
  onSaved,
}: Props) {
  const { t, lang } = useLanguage();

  const [staffId, setStaffId] = useState<number>(initial?.staff_id ?? staffList[0]?.id ?? 0);
  const [serviceId, setServiceId] = useState<number | null>(
    initial?.service_id ?? (mode === "block" ? null : services[0]?.id ?? null)
  );
  const [date, setDate] = useState(initial?.date ?? defaultDate ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(initial?.start_time ?? "09:00");
  const [duration, setDuration] = useState<number>(
    initial ? diffMinutes(initial.start_time, initial.end_time) : 30
  );
  const [clientName, setClientName] = useState(initial?.client_name ?? "");
  const [clientPhone, setClientPhone] = useState(initial?.client_phone ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState(initial?.status ?? (mode === "block" ? "blocked" : "confirmed"));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function diffMinutes(a: string, b: string) {
    const [ah, am] = a.split(":").map(Number);
    const [bh, bm] = b.split(":").map(Number);
    return bh * 60 + bm - (ah * 60 + am);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload: Record<string, unknown> = {
      staffId,
      serviceId: mode === "block" ? null : serviceId,
      date,
      time,
      durationMinutes: duration,
      clientName: clientName || undefined,
      clientPhone: clientPhone || undefined,
      notes: notes || undefined,
      status: mode === "block" ? "blocked" : status,
    };

    try {
      if (initial) {
        await adminUpdateAppointment(initial.id, payload);
      } else {
        await adminCreateAppointment(payload);
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.message);
      else setError(t.errorGeneric);
    } finally {
      setSaving(false);
    }
  }

  const title = initial ? t.edit : mode === "block" ? t.blockSlot : t.addAppointment;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-ink-900 border border-ink-700 rounded-t-2xl sm:rounded-xl2 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800 sticky top-0 bg-ink-900">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">{t.barber}</label>
            <select
              className="input-field"
              value={staffId}
              onChange={(e) => setStaffId(Number(e.target.value))}
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {mode !== "block" && (
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">{t.service}</label>
              <select
                className="input-field"
                value={serviceId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setServiceId(id);
                  const svc = services.find((s) => s.id === id);
                  if (svc) setDuration(svc.duration_minutes);
                }}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {lang === "ar" ? s.name_ar : s.name_fr} ({s.duration_minutes} {t.minutesShort})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">{t.date}</label>
              <input
                type="date"
                className="input-field"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">{t.time}</label>
              <input
                type="time"
                className="input-field"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">
              {t.duration} ({t.minutesShort})
            </label>
            <input
              type="number"
              min={5}
              max={240}
              className="input-field"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>

          {mode === "block" ? (
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">{t.reason}</label>
              <input
                className="input-field"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.reason}
              />
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">{t.fullName}</label>
                <input
                  className="input-field"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">{t.phone}</label>
                <input
                  className="input-field"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                />
              </div>
              {initial && (
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Status</label>
                  <select
                    className="input-field"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as typeof status)}
                  >
                    <option value="confirmed">{t.confirmed}</option>
                    <option value="completed">{t.completed}</option>
                    <option value="cancelled">{t.cancelled}</option>
                  </select>
                </div>
              )}
            </>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {t.close}
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
