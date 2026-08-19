import React, { useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";
import { adminLogout } from "../../api/client";
import AppointmentsTab from "./AppointmentsTab";
import ServicesTab from "./ServicesTab";
import ClientsTab from "./ClientsTab";
import StatsTab from "./StatsTab";

type Tab = "appointments" | "services" | "clients" | "stats";

export default function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const { t, dir } = useLanguage();
  const [tab, setTab] = useState<Tab>("appointments");

  function handleLogout() {
    adminLogout();
    onLogout();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "appointments", label: t.appointments },
    { id: "services", label: t.services },
    { id: "clients", label: t.clients },
    { id: "stats", label: t.stats },
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
