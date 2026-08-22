import React, { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { BookingMode, BookingSettings } from "../../types";
import { adminGetBookingSettings, adminUpdateBookingSettings } from "../../api/client";

const INTERVAL_OPTIONS = [5, 10, 15, 30];

export default function SettingsTab() {
  const { t } = useLanguage();

  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminGetBookingSettings()
      .then(setSettings)
      .finally(() => setLoading(false));
  }, []);

  function updateMode(bookingMode: BookingMode) {
    setSettings((prev) => (prev ? { ...prev, bookingMode } : prev));
    setSaved(false);
  }

  function updateInterval(bookingIntervalMinutes: number) {
    setSettings((prev) => (prev ? { ...prev, bookingIntervalMinutes } : prev));
    setSaved(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const result = await adminUpdateBookingSettings(settings);
      setSettings(result);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 rounded-xl2 bg-ink-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-3">{t.bookingModeLabel}</h3>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => updateMode("interval")}
            className={`w-full text-start p-4 rounded-xl2 border transition-colors ${
              settings.bookingMode === "interval"
                ? "border-gold-500 bg-gold-500/10"
                : "border-ink-800 hover:border-ink-700"
            }`}
          >
            <p className="font-medium">{t.bookingModeInterval}</p>
            <p className="text-sm text-zinc-400 mt-1">{t.bookingModeIntervalHint}</p>
          </button>

          <button
            type="button"
            onClick={() => updateMode("flexible")}
            className={`w-full text-start p-4 rounded-xl2 border transition-colors ${
              settings.bookingMode === "flexible"
                ? "border-gold-500 bg-gold-500/10"
                : "border-ink-800 hover:border-ink-700"
            }`}
          >
            <p className="font-medium">{t.bookingModeFlexible}</p>
            <p className="text-sm text-zinc-400 mt-1">{t.bookingModeFlexibleHint}</p>
          </button>
        </div>
      </div>

      {settings.bookingMode === "interval" && (
        <div>
          <h3 className="font-semibold mb-3">{t.bookingIntervalLabel}</h3>
          <div className="grid grid-cols-4 gap-2">
            {INTERVAL_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => updateInterval(minutes)}
                className={`py-2 rounded-xl2 border text-sm font-medium transition-colors ${
                  settings.bookingIntervalMinutes === minutes
                    ? "border-gold-500 bg-gold-500/10 text-gold-500"
                    : "border-ink-800 text-zinc-300 hover:border-ink-700"
                }`}
              >
                {minutes} {t.minutesShort}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? t.loading : t.saveSettings}
        </button>
        {saved && <span className="text-sm text-green-400">{t.settingsSaved}</span>}
      </div>
    </div>
  );
}