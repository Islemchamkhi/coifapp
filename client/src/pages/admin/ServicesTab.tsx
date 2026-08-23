import React, { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { ServiceItem, Staff } from "../../types";
import { adminGetServices, adminUpdateService, adminCreateService, adminGetStaff, adminUpdateStaff } from "../../api/client";

export default function ServicesTab() {
  const { t } = useLanguage();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [svc, staff] = await Promise.all([adminGetServices(), adminGetStaff()]);
      setServices(svc);
      setStaffList(staff);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function updateDuration(s: ServiceItem, duration_minutes: number) {
    setServices((prev) => prev.map((x) => (x.id === s.id ? { ...x, duration_minutes } : x)));
    await adminUpdateService(s.id, { duration_minutes });
  }

  async function updatePrice(s: ServiceItem, price: number | null) {
    setServices((prev) => prev.map((x) => (x.id === s.id ? { ...x, price } : x)));
    await adminUpdateService(s.id, { price });
  }

  async function toggleActive(s: ServiceItem) {
    const active = s.active ? false : true;
    setServices((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: active ? 1 : 0 } : x)));
    await adminUpdateService(s.id, { active });
  }

  async function toggleStaffActive(s: Staff) {
    const active = s.active ? false : true;
    setStaffList((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: active ? 1 : 0 } : x)));
    await adminUpdateStaff(s.id, { active });
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl2 bg-ink-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{t.services}</h3>
          <button onClick={() => setShowNew(true)} className="btn-secondary text-sm">
            + {t.services}
          </button>
        </div>
        <div className="space-y-2">
          {services.map((s) => (
            <div key={s.id} className="card px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{s.name_fr}</p>
                <p className="text-xs text-zinc-500">{s.name_ar}</p>
              </div>
              <input
                type="number"
                min={5}
                max={240}
                value={s.duration_minutes}
                onChange={(e) => updateDuration(s, Number(e.target.value))}
                className="input-field w-20 text-center"
              />
              <span className="text-xs text-zinc-500">{t.minutesShort}</span>
              <input
                type="number"
                min={0}
                step="0.001"
                placeholder="—"
                value={s.price === null || s.price === undefined ? "" : s.price}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.trim() === "") {
                    updatePrice(s, null);
                    return;
                  }
                  const value = Number(raw);
                  if (Number.isNaN(value) || value < 0) return;
                  updatePrice(s, value);
                }}
                className="input-field w-20 text-center"
              />
              <span className="text-xs text-zinc-500">{t.currency}</span>
              <button
                onClick={() => toggleActive(s)}
                className={`pill border ${
                  s.active
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                }`}
              >
                {s.active ? t.active : t.inactive}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3">{t.barber}</h3>
        <div className="space-y-2">
          {staffList.map((s) => (
            <div key={s.id} className="card px-4 py-3 flex items-center gap-3">
              <div className="flex-1">
                <p className="font-medium text-sm">{s.name}</p>
              </div>
              <button
                onClick={() => toggleStaffActive(s)}
                className={`pill border ${
                  s.active
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                }`}
              >
                {s.active ? t.active : t.inactive}
              </button>
            </div>
          ))}
        </div>
      </div>

      {showNew && (
        <NewServiceModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewServiceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useLanguage();
  const [nameFr, setNameFr] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [duration, setDuration] = useState(30);
  // Prix stocké en string pour distinguer "champ vide" (pas de
  // prix) de "0" (prix explicite à zéro) : un state number ne le
  // permettrait pas (Number('') === 0).
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedPrice = price.trim();
    let priceValue: number | null = null;

    if (trimmedPrice !== "") {
      priceValue = Number(trimmedPrice);
      if (Number.isNaN(priceValue) || priceValue < 0) {
        setError(t.invalidForm);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await adminCreateService({
        name_fr: nameFr,
        name_ar: nameAr,
        duration_minutes: duration,
        price: priceValue,
      });
      onSaved();
    } catch {
      setError(t.errorGeneric);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-sm bg-ink-900 border border-ink-700 rounded-t-2xl sm:rounded-xl2 p-5">
        <h3 className="font-semibold mb-4">+ {t.services}</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="input-field"
            placeholder="Nom (FR)"
            value={nameFr}
            onChange={(e) => setNameFr(e.target.value)}
            required
          />
          <input
            className="input-field"
            placeholder="الاسم (AR)"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            required
            dir="rtl"
          />
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">{t.duration}</label>
            <input
              type="number"
              className="input-field"
              value={duration}
              min={5}
              max={240}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">
              {t.price} ({t.currency}) — optionnel
            </label>
            <input
              type="number"
              className="input-field"
              placeholder="—"
              value={price}
              min={0}
              step="0.001"
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2">
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