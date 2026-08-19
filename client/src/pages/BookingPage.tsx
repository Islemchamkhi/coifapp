import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Link } from "react-router-dom";

import { useLanguage } from "../i18n/LanguageContext";
import LanguageToggle from "../components/LanguageToggle";
import ServiceSelector from "../components/ServiceSelector";
import StaffSelector from "../components/StaffSelector";
import DateStrip from "../components/DateStrip";
import TimeSlotGrid from "../components/TimeSlotGrid";

import {
  ServiceItem,
  Staff,
  BookingConfirmation,
  SlotWithStatus,
} from "../types";

import {
  getServices,
  getStaff,
  getAvailability,
  createBooking,
  ApiRequestError,
} from "../api/client";

type Step =
  | "service"
  | "staff"
  | "date"
  | "slot"
  | "details"
  | "confirmed";

export default function BookingPage() {
  const { t, lang, dir } = useLanguage();

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [service, setService] = useState<ServiceItem | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);

  const [slots, setSlots] = useState<SlotWithStatus[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmation, setConfirmation] =
    useState<BookingConfirmation | null>(null);

  // Chargement des services et des barbiers
  useEffect(() => {
    Promise.all([getServices(), getStaff()])
      .then(([servicesData, staffData]) => {
        setServices(servicesData);
        setStaffList(staffData);
      })
      .finally(() => {
        setLoadingCatalog(false);
      });
  }, []);

  // Chargement des créneaux disponibles
  useEffect(() => {
    if (!service || !staff || !date) {
      return;
    }

    setLoadingSlots(true);
    setTime(null);

    getAvailability(staff.id, service.id, date)
      .then((res) => {
        setSlots(res.slots);
      })
      .catch(() => {
        setSlots([]);
      })
      .finally(() => {
        setLoadingSlots(false);
      });
  }, [service, staff, date]);

  // Actualisation de la disponibilité toutes les 60 secondes
  // et lorsque l'utilisateur revient sur la page.
  useEffect(() => {
    if (!service || !staff || !date || time) {
      return;
    }

    const refreshAvailability = () => {
      getAvailability(staff.id, service.id, date)
        .then((res) => {
          setSlots(res.slots);
        })
        .catch(() => {});
    };

    const interval = setInterval(
      refreshAvailability,
      60000
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshAvailability();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    window.addEventListener(
      "focus",
      refreshAvailability
    );

    return () => {
      clearInterval(interval);

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      window.removeEventListener(
        "focus",
        refreshAvailability
      );
    };
  }, [service, staff, date, time]);

  // Détermination de l'étape actuelle
  const step: Step = confirmation
    ? "confirmed"
    : !service
    ? "service"
    : !staff
    ? "staff"
    : !date
    ? "date"
    : !time
    ? "slot"
    : "details";

  const stepOrder: Exclude<Step, "confirmed">[] = [
    "service",
    "staff",
    "date",
    "slot",
    "details",
  ];

  const currentIndex =
    step === "confirmed"
      ? stepOrder.length
      : stepOrder.indexOf(step);

  // Retour à une étape précédente
  function resetFrom(target: Step) {
    if (target === "service") {
      setService(null);
      setStaff(null);
      setDate(null);
      setTime(null);
      return;
    }

    if (target === "staff") {
      setStaff(null);
      setDate(null);
      setTime(null);
      return;
    }

    if (target === "date") {
      setDate(null);
      setTime(null);
      return;
    }

    if (target === "slot") {
      setTime(null);
    }
  }

  // Création de la réservation
  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    setFormError(null);

    if (
      clientName.trim().length < 2 ||
      clientPhone.trim().length < 6
    ) {
      setFormError(t.invalidForm);
      return;
    }

    if (!service || !staff || !date || !time) {
      return;
    }

    setSubmitting(true);

    try {
      const result = await createBooking({
        staffId: staff.id,
        serviceId: service.id,
        date,
        time,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
      });

      setConfirmation(result);
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.code === "SLOT_UNAVAILABLE"
      ) {
        setFormError(t.slotTaken);
        setTime(null);

        if (service && staff && date) {
          getAvailability(
            staff.id,
            service.id,
            date
          ).then((result) => {
            setSlots(result.slots);
          });
        }
      } else {
        setFormError(t.errorGeneric);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Nouvelle réservation
  function startOver() {
    setConfirmation(null);
    setService(null);
    setStaff(null);
    setDate(null);
    setTime(null);

    setClientName("");
    setClientPhone("");
    setFormError(null);
  }

  return (
    <div
      dir={dir}
      className="min-h-screen flex flex-col"
    >
      {/* ================= HEADER ================= */}
      <header className="sticky top-0 z-10 bg-ink-950/90 backdrop-blur border-b border-ink-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <p className="font-semibold text-zinc-100 text-base">
            {t.brand}
          </p>
        </div>

        <LanguageToggle />
      </header>

      {/* ================= MAIN ================= */}
      <main className="flex-1 px-4 py-5 max-w-md mx-auto w-full">
        {/* Progression */}
        {step !== "confirmed" && (
          <>
            <p className="text-zinc-400 text-sm mb-4">
              {t.tagline}
            </p>

            <div className="flex items-center gap-1.5 mb-6">
              {stepOrder.map((currentStep, index) => (
                <div
                  key={currentStep}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    index <= currentIndex
                      ? "bg-gold-500"
                      : "bg-ink-800"
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {/* Chargement */}
        {loadingCatalog && step !== "confirmed" && (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-16 rounded-xl2 bg-ink-800 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* ================= SERVICE ================= */}
        {!loadingCatalog && step === "service" && (
          <section className="animate-fade-in-up">
            <h2 className="text-lg font-semibold mb-3">
              {t.step1Title}
            </h2>

            <ServiceSelector
              services={services}
              selectedId={service?.id ?? null}
              onSelect={setService}
            />
          </section>
        )}

        {/* ================= BARBIER ================= */}
        {!loadingCatalog && step === "staff" && (
          <section className="animate-fade-in-up">
            <BackBar
              label={t.step2Title}
              onBack={() => resetFrom("service")}
              backLabel={t.back}
            />

            <StaffSelector
              staff={staffList}
              selectedId={staff?.id ?? null}
              onSelect={setStaff}
            />
          </section>
        )}

        {/* ================= DATE ================= */}
        {step === "date" && (
          <section className="animate-fade-in-up">
            <BackBar
              label={t.step3Title}
              onBack={() => resetFrom("staff")}
              backLabel={t.back}
            />

            <DateStrip
              selected={date}
              onSelect={setDate}
            />
          </section>
        )}

        {/* ================= CRÉNEAU ================= */}
        {step === "slot" && service && (
          <section className="animate-fade-in-up">
            <BackBar
              label={t.step4Title}
              onBack={() => resetFrom("date")}
              backLabel={t.back}
            />

            <TimeSlotGrid
              slots={slots}
              selected={time}
              onSelect={setTime}
              loading={loadingSlots}
              emptyMessage={t.noSlot}
              availableLabel={t.slotAvailable}
              bookedLabel={t.slotBooked}
            />

            {/* Légende */}
            {!loadingSlots && slots.length > 0 && (
              <div className="flex items-center gap-4 mt-3 text-xs text-zinc-400">
                <span className="flex items-center gap-1">
                  🟢 {t.slotAvailable}
                </span>
                <span className="flex items-center gap-1">
                  🔴 {t.slotBooked}
                </span>
              </div>
            )}
          </section>
        )}

        {/* ================= INFORMATIONS CLIENT ================= */}
        {step === "details" &&
          service &&
          staff &&
          date &&
          time && (
            <section className="animate-fade-in-up">
              <BackBar
                label={t.step5Title}
                onBack={() => resetFrom("slot")}
                backLabel={t.back}
              />

              {/* Résumé */}
              <div className="card px-4 py-3 mb-4 text-sm space-y-1 text-zinc-300">
                <SummaryLine
                  label={t.service}
                  value={
                    lang === "ar"
                      ? service.name_ar
                      : service.name_fr
                  }
                />

                <SummaryLine
                  label={t.barber}
                  value={staff.name}
                />

                <SummaryLine
                  label={t.date}
                  value={dayjs(date).format(
                    "dddd D MMMM"
                  )}
                />

                <SummaryLine
                  label={t.time}
                  value={time}
                />
              </div>

              {/* Formulaire */}
              <form
                onSubmit={handleSubmit}
                className="space-y-3"
              >
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">
                    {t.fullName}
                  </label>

                  <input
                    className="input-field"
                    value={clientName}
                    onChange={(event) =>
                      setClientName(
                        event.target.value
                      )
                    }
                    placeholder={
                      t.fullNamePlaceholder
                    }
                    required
                  />
                </div>

                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">
                    {t.phone}
                  </label>

                  <input
                    className="input-field"
                    value={clientPhone}
                    onChange={(event) =>
                      setClientPhone(
                        event.target.value
                      )
                    }
                    placeholder={
                      t.phonePlaceholder
                    }
                    type="tel"
                    required
                  />
                </div>

                {formError && (
                  <p className="text-red-400 text-sm">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full mt-2"
                >
                  {submitting
                    ? t.booking
                    : t.confirmBooking}
                </button>
              </form>
            </section>
          )}

        {/* ================= CONFIRMATION ================= */}
        {step === "confirmed" && confirmation && (
          <ConfirmationView
            confirmation={confirmation}
            onNewBooking={startOver}
          />
        )}
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="px-4 py-6 text-center space-y-3">
        <div>
          <a
            href="https://www.google.com/maps/@37.267738,9.836307,15z/data=!4m2!7m1!2e1?authuser=4&entry=ttu"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-block text-sm"
          >
            {t.findUsButton}
          </a>

          <p className="text-xs text-zinc-500 mt-2">
            {t.salonAddress}
          </p>

          <a
            href="https://www.google.com/search?client=safari&sca_esv=9956c2809c48c428&hl=fr-tn&cs=1&output=search&kgmid=/g/11xggr3ykb&q=rayen+coiff"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-600 hover:text-gold-500 transition-colors underline underline-offset-2"
          >
            {t.findUsSecondary}
          </a>
        </div>

        {/* Accès administrateur */}
        <Link
          to="/admin"
          className="block text-xs text-zinc-600 hover:text-gold-500 transition-colors"
        >
          {t.adminLink}
        </Link>
      </footer>
    </div>
  );
}

/* ================================================= */
/* BACK BAR */
/* ================================================= */

function BackBar({
  label,
  backLabel,
  onBack,
}: {
  label: string;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-semibold">
        {label}
      </h2>

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-gold-500 hover:text-gold-400"
      >
        ← {backLabel}
      </button>
    </div>
  );
}

/* ================================================= */
/* SUMMARY LINE */
/* ================================================= */

function SummaryLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">
        {label}
      </span>

      <span className="text-zinc-100 font-medium capitalize">
        {value}
      </span>
    </div>
  );
}

/* ================================================= */
/* CONFIRMATION */
/* ================================================= */

function ConfirmationView({
  confirmation,
  onNewBooking,
}: {
  confirmation: BookingConfirmation;
  onNewBooking: () => void;
}) {
  const { t, lang } = useLanguage();

  const {
    appointment,
    service,
    staff,
    clientsBefore,
    estimatedTime,
  } = confirmation;

  const serviceName =
    lang === "ar"
      ? service.name_ar
      : service.name_fr;

  return (
    <section className="animate-fade-in-up text-center">
      {/* Icône de confirmation */}
      <div className="w-16 h-16 mx-auto rounded-full bg-gold-500/15 border border-gold-500 flex items-center justify-center text-3xl mb-4">
        ✅
      </div>

      <h2 className="text-xl font-bold mb-1">
        {t.confirmedTitle}
      </h2>

      <p className="text-zinc-400 text-sm mb-6">
        {t.yourAppointmentAt}{" "}
        <span className="text-gold-500 font-semibold">
          {appointment.start_time}
        </span>
      </p>

      {/* Détails */}
      <div className="card px-4 py-4 text-start space-y-2.5 mb-4">
        <SummaryLine
          label={t.service}
          value={serviceName}
        />

        <SummaryLine
          label={t.barber}
          value={staff.name}
        />

        <SummaryLine
          label={t.date}
          value={dayjs(
            appointment.date
          ).format("dddd D MMMM")}
        />

        <SummaryLine
          label={t.time}
          value={appointment.start_time}
        />
      </div>

      {/* Informations supplémentaires */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="card px-3 py-4">
          <p className="text-2xl font-bold text-gold-500">
            👥 {clientsBefore}
          </p>

          <p className="text-xs text-zinc-400 mt-1">
            {t.clientsBefore}
          </p>
        </div>

        <div className="card px-3 py-4">
          <p className="text-2xl font-bold text-gold-500">
            ⏱️ {estimatedTime}
          </p>

          <p className="text-xs text-zinc-400 mt-1">
            {t.estimatedPassage}
          </p>
        </div>
      </div>

      {/* Nouvelle réservation */}
      <button
        type="button"
        onClick={onNewBooking}
        className="btn-secondary w-full"
      >
        {t.newBooking}
      </button>
    </section>
  );
}