import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";
import { adminLogout, adminGetNotifications, adminMarkNotificationRead, adminMarkAllNotificationsRead } from "../../api/client";
import { AdminNotification } from "../../types";
import AppointmentsTab from "./AppointmentsTab";
import ServicesTab from "./ServicesTab";
import ClientsTab from "./ClientsTab";
import StatsTab from "./StatsTab";
import SettingsTab from "./SettingsTab";

type Tab = "appointments" | "services" | "clients" | "stats" | "settings";

const NOTIFICATIONS_POLL_MS = 20000;

export default function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const { t, dir } = useLanguage();
  const [tab, setTab] = useState<Tab>("appointments");

  // --------------------------------------------------
  // Notifications : polling léger (20s) + rafraîchissement
  // au retour de focus, sans dépendance supplémentaire.
  // --------------------------------------------------
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  async function loadNotifications() {
    try {
      const res = await adminGetNotifications();
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // silencieux : la notification n'est pas critique pour l'usage courant
    }
  }

  useEffect(() => {
    loadNotifications();

    const interval = setInterval(loadNotifications, NOTIFICATIONS_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") loadNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", loadNotifications);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", loadNotifications);
    };
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    }
    if (panelOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [panelOpen]);

  async function handleMarkRead(id: string) {
    await adminMarkNotificationRead(id);
    loadNotifications();
  }

  async function handleMarkAllRead() {
    await adminMarkAllNotificationsRead();
    loadNotifications();
  }

  function handleLogout() {
    adminLogout();
    onLogout();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "appointments", label: t.appointments },
    { id: "services", label: t.services },
    { id: "clients", label: t.clients },
    { id: "stats", label: t.stats },
    { id: "settings", label: t.settings },
  ];

  return (
    <div dir={dir} className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-ink-950/90 backdrop-blur border-b border-ink-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full border-2 border-gold-500 overflow-hidden">
            <img
            src="/icons/icon-192.png"
            alt={t.brand}
            className="w-full h-full object-cover"
            />
</div>
          <p className="font-semibold text-sm">{t.adminTitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Cloche de notifications */}
          <div className="relative" ref={panelRef}>
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="relative text-zinc-300 hover:text-gold-500 transition-colors p-1.5"
              aria-label={t.notifications}
            >
              🔔
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {panelOpen && (
              <div className="absolute end-0 mt-2 w-80 max-w-[90vw] max-h-96 overflow-y-auto bg-ink-900 border border-ink-700 rounded-xl2 shadow-card z-20">
                <div className="flex items-center justify-between px-4 py-3 border-b border-ink-800 sticky top-0 bg-ink-900">
                  <p className="font-semibold text-sm">{t.notifications}</p>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-xs text-gold-500 hover:text-gold-400"
                    >
                      {t.markAllRead}
                    </button>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-zinc-500">{t.noNotifications}</p>
                ) : (
                  <div className="divide-y divide-ink-800">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`px-4 py-3 text-sm ${!n.read_at ? "bg-gold-500/5" : ""}`}
                      >
                        <p className="font-medium text-zinc-100">{n.title}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{n.message}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[10px] text-zinc-600">
                            {new Date(n.created_at).toLocaleString()}
                          </span>
                          {!n.read_at && (
                            <button
                              type="button"
                              onClick={() => handleMarkRead(n.id)}
                              className="text-[10px] text-gold-500 hover:text-gold-400"
                            >
                              {t.markRead}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <LanguageToggle />
          <button onClick={handleLogout} className="text-xs text-zinc-400 hover:text-red-400 px-2">
            {t.logout}
          </button>
        </div>
      </header>

      <nav className="flex gap-1 px-4 py-2 overflow-x-auto border-b border-ink-800">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              tab === tb.id ? "bg-gold-500 text-ink-950" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 px-4 py-5 max-w-2xl mx-auto w-full">
        {tab === "appointments" && <AppointmentsTab />}
        {tab === "services" && <ServicesTab />}
        {tab === "clients" && <ClientsTab />}
        {tab === "stats" && <StatsTab />}
      </main>
    </div>
  );
}