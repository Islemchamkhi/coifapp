import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Link } from "react-router-dom";
import { useClientAuth } from "../auth/ClientAuthContext";

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
  BookingSettings,
} from "../types";

import {
  getServices,
  getStaff,
  getAvailability,
  getBookingSettings,
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
  const { client } = useClientAuth();

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [service, setService] = useState<ServiceItem | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);

  const [customTime, setCustomTime] = useState("");
  const [useCustomTime, setUseCustomTime] = useState(false);

  /**
   * ============================================================
   * CONFIGURATION DE RÉSERVATION (mode interval / flexible)
   * ============================================================
   *
   * Par défaut "interval" pendant le chargement, pour reproduire
   * exactement le comportement historique tant que la config
   * n'est pas encore arrivée du serveur (aucune régression
   * visible si l'appel est lent).
   */
  const [bookingSettings, setBookingSettings] =
    useState<BookingSettings>({
      bookingMode: "interval",
      bookingIntervalMinutes: 5,
    });

  useEffect(() => {
    getBookingSettings()
      .then(setBookingSettings)
      .catch(() => {
        // En cas d'échec, on reste en mode "interval" par défaut
        // (comportement historique) plutôt que de bloquer la
        // réservation.
      });
  }, []);

  const isFlexibleMode = bookingSettings.bookingMode === "flexible";

  const [slots, setSlots] = useState<SlotWithStatus[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmation, setConfirmation] =
    useState<BookingConfirmation | null>(null);

  /**
   * ============================================================
   * CLIENT CONNECTÉ
   * ============================================================
   */
  useEffect(() => {
    if (client) {
      setClientName(client.name);
      setClientPhone(client.phone);
    }
  }, [client]);

  /**
   * ============================================================
   * CHARGEMENT SERVICES + COIFFEURS
   * ============================================================
   */
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

  /**
   * ============================================================
   * RÉINITIALISATION DE L'HEURE CHOISIE
   * ============================================================
   *
   * Dès que service, coiffeur ou date change, toute heure
   * précédemment choisie (grille ou heure libre) n'est plus
   * valable et doit être réinitialisée — que le salon soit en
   * mode "interval" ou "flexible".
   */
  useEffect(() => {
    if (!service || !staff || !date) {
      return;
    }

    setTime(null);
    setCustomTime("");
    setUseCustomTime(false);
    setFormError(null);
  }, [service, staff, date]);

  /**
   * ============================================================
   * CHARGEMENT DES CRÉNEAUX
   * ============================================================
   *
   * En mode "flexible", il n'y a pas de grille à afficher : le
   * client saisit directement une heure précise. On évite donc
   * cet appel réseau inutile.
   */
  useEffect(() => {
    if (!service || !staff || !date || isFlexibleMode) {
      return;
    }

    setLoadingSlots(true);

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
  }, [service, staff, date, isFlexibleMode]);

  /**
   * ============================================================
   * ACTUALISATION DE LA DISPONIBILITÉ
   * ============================================================
   */
  useEffect(() => {
    if (
      !service ||
      !staff ||
      !date ||
      time ||
      useCustomTime ||
      isFlexibleMode
    ) {
      return;
    }

    const refreshAvailability = () => {
      getAvailability(staff.id, service.id, date)
        .then((res) => {
          setSlots(res.slots);
        })
        .catch(() => {});
    };

    const interval = setInterval(refreshAvailability, 60000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshAvailability();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    window.addEventListener("focus", refreshAvailability);

    return () => {
      clearInterval(interval);

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      window.removeEventListener("focus", refreshAvailability);
    };
  }, [service, staff, date, time, useCustomTime, isFlexibleMode]);

  /**
   * ============================================================
   * HEURE EFFECTIVE
   * ============================================================
   */
  const effectiveTime = useCustomTime ? customTime : time;

  /**
   * ============================================================
   * ÉTAPE ACTUELLE
   * ============================================================
   */
  const step: Step = confirmation
    ? "confirmed"
    : !service
      ? "service"
      : !staff
        ? "staff"
        : !date
          ? "date"
          : !effectiveTime
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
    step === "confirmed" ? stepOrder.length : stepOrder.indexOf(step);

  /**
   * ============================================================
   * RETOUR
   * ============================================================
   */
  function resetFrom(target: Step) {
    if (target === "service") {
      setService(null);
      setStaff(null);
      setDate(null);
      setTime(null);
      setCustomTime("");
      setUseCustomTime(false);
      setFormError(null);
      return;
    }

    if (target === "staff") {
      setStaff(null);
      setDate(null);
      setTime(null);
      setCustomTime("");
      setUseCustomTime(false);
      setFormError(null);
      return;
    }

    if (target === "date") {
      setDate(null);
      setTime(null);
      setCustomTime("");
      setUseCustomTime(false);
      setFormError(null);
      return;
    }

    if (target === "slot") {
      setTime(null);
      setCustomTime("");
      setUseCustomTime(false);
      setFormError(null);
    }
  }

  /**
   * ============================================================
   * NORMALISATION HEURE
   * ============================================================
   */
  function normalizeTime(value: string): string {
    const cleaned = value.replace(/[^\d]/g, "").slice(0, 4);

    if (cleaned.length <= 2) {
      return cleaned;
    }

    return `${cleaned.slice(0, 2)}:${cleaned.slice(2)}`;
  }

  /**
   * ============================================================
   * VALIDATION HEURE PERSONNALISÉE
   * ============================================================
   */
  function isValidCustomTime(value: string): boolean {
    if (!/^\d{2}:\d{2}$/.test(value)) {
      return false;
    }

    const [hours, minutes] = value.split(":").map(Number);

    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes)
    ) {
      return false;
    }

    if (
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return false;
    }

    return true;
  }

  /**
   * ============================================================
   * CHOIX CRÉNEAU
   * ============================================================
   */
  function handleSlotSelect(selectedTime: string) {
    setUseCustomTime(false);
    setCustomTime("");
    setTime(selectedTime);
    setFormError(null);
  }

  /**
   * ============================================================
   * CHOIX HEURE PERSONNALISÉE
   * ============================================================
   */
  function handleCustomTimeChange(value: string) {
    const normalized = normalizeTime(value);

    setCustomTime(normalized);
    setTime(null);
    setUseCustomTime(true);
    setFormError(null);
  }

  /**
   * ============================================================
   * CRÉATION RÉSERVATION
   * ============================================================
   */
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

    if (
      !service ||
      !staff ||
      !date ||
      !effectiveTime
    ) {
      return;
    }

    if (
      useCustomTime &&
      !isValidCustomTime(customTime)
    ) {
      setFormError(t.invalidCustomTime);
      return;
    }

    setSubmitting(true);

    try {
      const result = await createBooking({
        staffId: staff.id,
        serviceId: service.id,
        date,
        time: effectiveTime,
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

        if (useCustomTime) {
          setUseCustomTime(true);
        }

        if (service && staff && date) {
          getAvailability(staff.id, service.id, date)
            .then((result) => {
              setSlots(result.slots);
            })
            .catch(() => {});
        }

        if (!useCustomTime) {
          setTime(null);
        }

        return;
      }

      setFormError(t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * ============================================================
   * NOUVELLE RÉSERVATION
   * ============================================================
   */
  function startOver() {
    setConfirmation(null);

    setService(null);
    setStaff(null);
    setDate(null);

    setTime(null);

    setCustomTime("");
    setUseCustomTime(false);

    if (!client) {
      setClientName("");
      setClientPhone("");
    }

    setFormError(null);
  }

  return (
    <div
      dir={dir}
      className="min-h-screen flex flex-col"
    >
      {/* =====================================================
          HEADER
      ====================================================== */}
      <header className="sticky top-0 z-20 bg-ink-950/95 backdrop-blur border-b border-ink-800 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          {/* Logo / Nom */}
          <Link
            to="/"
            className="font-semibold text-zinc-100 text-base whitespace-nowrap"
          >
            {t.brand}
          </Link>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {client ? (
              /*
               * CLIENT DÉJÀ CONNECTÉ
               */
              <Link
                to="/account"
                className="inline-flex items-center gap-1.5 rounded-xl border border-gold-500/50 bg-gold-500/10 px-3 py-2 text-sm font-medium text-gold-400 transition-colors hover:bg-gold-500/20 hover:text-gold-300"
              >
                <span>👤</span>
                <span>{t.myAccount}</span>
              </Link>
            ) : (
              /*
               * PAS CONNECTÉ
               *
               * Ce bouton permet :
               * - Connexion
               * - Création de compte
               *
               * La réservation reste possible sans compte.
               */
              <Link
                to="/auth"
                className="inline-flex items-center gap-1.5 rounded-xl border border-gold-500/50 bg-gold-500/10 px-3 py-2 text-sm font-medium text-gold-400 transition-colors hover:bg-gold-500/20 hover:bg-gold-500/20 hover:text-gold-300"
              >
                <span>👤</span>
                <span>{t.login}</span>
              </Link>
            )}

            <LanguageToggle />
          </div>
        </div>
      </header>

      {/* =====================================================
          MAIN
      ====================================================== */}
      <main className="flex-1 px-4 py-5 max-w-md mx-auto w-full">
        {/* =====================================================
            MESSAGE COMPTE CLIENT
        ====================================================== */}
        {!client && step === "service" && (
          <div className="mb-5 rounded-xl border border-gold-500/20 bg-gold-500/5 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="text-lg">👤</div>

              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-200">
                  {t.clientAccount}
                </p>

                <p className="text-xs text-zinc-500 mt-1">
                  {t.clientAccountHint}
                </p>

                <Link
                  to="/auth"
                  className="inline-block mt-2 text-xs font-medium text-gold-400 hover:text-gold-300 underline underline-offset-2"
                >
                  {t.login} / {t.createAccount}
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            PROGRESSION
        ====================================================== */}
        {step !== "confirmed" && (
          <>
            <p className="text-zinc-400 text-sm mb-4">
              {t.tagline}
            </p>

            <div className="flex items-center gap-1.5 mb-6">
              {stepOrder.map(
                (currentStep, index) => (
                  <div
                    key={currentStep}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      index <= currentIndex
                        ? "bg-gold-500"
                        : "bg-ink-800"
                    }`}
                  />
                )
              )}
            </div>
          </>
        )}

        {/* =====================================================
            CHARGEMENT
        ====================================================== */}
        {loadingCatalog &&
          step !== "confirmed" && (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-16 rounded-xl bg-ink-800 animate-pulse"
                />
              ))}
            </div>
          )}

        {/* =====================================================
            SERVICE
        ====================================================== */}
        {!loadingCatalog &&
          step === "service" && (
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

        {/* =====================================================
            BARBIER
        ====================================================== */}
        {!loadingCatalog &&
          step === "staff" && (
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

        {/* =====================================================
            DATE
        ====================================================== */}
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

        {/* =====================================================
            CRÉNEAU
        ====================================================== */}
        {step === "slot" &&
          service &&
          staff &&
          date && (
            <section className="animate-fade-in-up">
              <BackBar
                label={t.step4Title}
                onBack={() => resetFrom("date")}
                backLabel={t.back}
              />

              {!isFlexibleMode && (
                <>
                  <TimeSlotGrid
                    slots={slots}
                    selected={
                      useCustomTime ? null : time
                    }
                    onSelect={handleSlotSelect}
                    loading={loadingSlots}
                    emptyMessage={t.noSlot}
                    availableLabel={t.slotAvailable}
                    bookedLabel={t.slotBooked}
                    exceptionalLabel={
                      t.exceptionalSlot
                    }
                  />

                  {/* Légende */}
                  {!loadingSlots &&
                    slots.length > 0 && (
                      <div className="flex items-center gap-4 mt-3 text-xs text-zinc-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          🟢 {t.slotAvailable}
                        </span>

                        <span className="flex items-center gap-1">
                          🔴 {t.slotBooked}
                        </span>
                      </div>
                    )}
                </>
              )}

              {/* =================================================
                  HEURE PERSONNALISÉE
                  (contrôle principal en mode "flexible" ;
                  alternative optionnelle en mode "interval")
              ================================================== */}
              <div
                className={
                  isFlexibleMode
                    ? "mt-1"
                    : "mt-5 border-t border-ink-800 pt-4"
                }
              >
                <p className="text-sm font-medium text-zinc-200 mb-2">
                  {isFlexibleMode
                    ? t.chooseYourTime
                    : t.customTimeTitle}
                </p>

                <p className="text-xs text-zinc-500 mb-3">
                  {t.customTimeHint}
                </p>

                <div className="flex gap-2">
                  <input
                    type="time"
                    value={customTime}
                    onChange={(event) =>
                      handleCustomTimeChange(
                        event.target.value
                      )
                    }
                    className="input-field flex-1"
                    aria-label={
                      t.customTimeAriaLabel
                    }
                  />

                  <button
                    type="button"
                    onClick={() => {
                      if (
                        !isValidCustomTime(
                          customTime
                        )
                      ) {
                        setFormError(
                          t.invalidCustomTime
                        );
                        return;
                      }

                      setUseCustomTime(true);
                      setTime(null);
                      setFormError(null);
                    }}
                    disabled={
                      !isValidCustomTime(
                        customTime
                      )
                    }
                    className={`px-4 rounded-xl text-sm font-medium border transition-all ${
                      isValidCustomTime(
                        customTime
                      )
                        ? "border-gold-500 bg-gold-500 text-ink-950 hover:bg-gold-400"
                        : "border-ink-800 bg-ink-900 text-zinc-600 cursor-not-allowed"
                    }`}
                  >
                    {t.useCustomTimeButton}
                  </button>
                </div>

                {useCustomTime &&
                  customTime && (
                    <div className="mt-3 rounded-xl border border-gold-500/40 bg-gold-500/10 px-3 py-2">
                      <p className="text-sm text-gold-400">
                        {t.customTimeSelectedLabel}

                        <span className="font-semibold ml-1">
                          {customTime}
                        </span>
                      </p>

                      <button
                        type="button"
                        onClick={() => {
                          setUseCustomTime(false);
                          setCustomTime("");
                          setTime(null);
                          setFormError(null);
                        }}
                        className="text-xs text-zinc-400 hover:text-zinc-200 mt-1 underline"
                      >
                        {isFlexibleMode
                          ? t.changeTime
                          : t.chooseAnotherSlot}
                      </button>
                    </div>
                  )}

                {formError &&
                  !time &&
                  useCustomTime === true && (
                    <p className="text-red-400 text-sm mt-3">
                      {formError}
                    </p>
                  )}
              </div>

              {/* Durée */}
              <div className="mt-4 rounded-xl bg-ink-900 border border-ink-800 px-3 py-3">
                <p className="text-xs text-zinc-500">
                  {t.serviceDurationLabel}
                </p>

                <p className="text-sm text-zinc-200 mt-1">
                  {service.duration_minutes}{" "}
                  {t.minutesShort}
                </p>
              </div>
            </section>
          )}

        {/* =====================================================
            INFORMATIONS CLIENT
        ====================================================== */}
        {step === "details" &&
          service &&
          staff &&
          date &&
          effectiveTime && (
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
                  value={effectiveTime}
                />

                <SummaryLine
                  label={t.duration}
                  value={`${service.duration_minutes} min`}
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

        {/* =====================================================
            CONFIRMATION
        ====================================================== */}
        {step === "confirmed" &&
          confirmation && (
            <ConfirmationView
              confirmation={confirmation}
              onNewBooking={startOver}
            />
          )}
      </main>

      {/* =====================================================
          FOOTER
      ====================================================== */}
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

/* ============================================================
   BACK BAR
============================================================ */

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

/* ============================================================
   SUMMARY LINE
============================================================ */

function SummaryLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-zinc-500">
        {label}
      </span>

      <span className="text-zinc-100 font-medium capitalize text-right">
        {value}
      </span>
    </div>
  );
}

/* ============================================================
   CONFIRMATION
============================================================ */

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

        <SummaryLine
          label={t.duration}
          value={`${service.duration_minutes} min`}
        />
      </div>

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