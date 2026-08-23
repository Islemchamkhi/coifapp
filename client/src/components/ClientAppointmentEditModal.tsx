import React, { useEffect, useState } from "react";

import { useLanguage } from "../i18n/LanguageContext";

import ServiceSelector from "./ServiceSelector";
import StaffSelector from "./StaffSelector";
import DateStrip from "./DateStrip";
import TimeSlotGrid from "./TimeSlotGrid";

import {
  Appointment,
  ServiceItem,
  Staff,
  SlotWithStatus,
} from "../types";

import {
  clientGetAppointmentAvailability,
  clientUpdateAppointment,
  ApiRequestError,
} from "../api/client";

interface Props {
  appointment: Appointment;
  services: ServiceItem[];
  staffList: Staff[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * ============================================================
 * MODIFICATION D'UNE RÉSERVATION CLIENT
 * ============================================================
 *
 * Réutilise EXACTEMENT les mêmes composants et la même logique
 * de disponibilité que la réservation initiale (BookingPage) :
 * ServiceSelector, StaffSelector, DateStrip, TimeSlotGrid.
 *
 * Aucun deuxième système de disponibilité n'est créé : la seule
 * différence avec la réservation publique est que le créneau
 * ACTUEL de la réservation en cours de modification est exclu
 * du calcul d'occupation (voir clientGetAppointmentAvailability).
 *
 * Le backend refait TOUJOURS toute la validation lors de
 * l'enregistrement — cet écran ne fait qu'aider le client à
 * choisir un créneau probablement valide.
 */
export default function ClientAppointmentEditModal({
  appointment,
  services,
  staffList,
  onClose,
  onSaved,
}: Props) {
  const { t } = useLanguage();

  const [service, setService] =
    useState<ServiceItem | null>(
      services.find(
        (s) => s.id === appointment.service_id
      ) ?? null
    );

  const [staff, setStaff] = useState<Staff | null>(
    staffList.find(
      (s) => s.id === appointment.staff_id
    ) ?? null
  );

  const [date, setDate] = useState<string>(
    appointment.date
  );

  const [time, setTime] = useState<string | null>(
    appointment.start_time
  );

  const [slots, setSlots] = useState<
    SlotWithStatus[]
  >([]);

  const [loadingSlots, setLoadingSlots] =
    useState(false);

  const [error, setError] = useState<
    string | null
  >(null);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!service || !staff || !date) {
      setSlots([]);
      return;
    }

    setLoadingSlots(true);

    clientGetAppointmentAvailability(
      appointment.id,
      staff.id,
      service.id,
      date
    )
      .then((res) => {
        setSlots(res.slots);
      })
      .catch(() => {
        setSlots([]);
      })
      .finally(() => {
        setLoadingSlots(false);
      });
  }, [appointment.id, service, staff, date]);

  function handleServiceSelect(s: ServiceItem) {
    setService(s);
    setTime(null);
  }

  function handleStaffSelect(s: Staff) {
    setStaff(s);
    setTime(null);
  }

  function handleDateSelect(d: string) {
    setDate(d);
    setTime(null);
  }

  async function handleSubmit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    if (!service || !staff || !date || !time) {
      setError(t.invalidForm);
      return;
    }

    setError(null);
    setSaving(true);

    try {
      await clientUpdateAppointment(
        appointment.id,
        {
          staffId: staff.id,
          serviceId: service.id,
          date,
          time,
        }
      );

      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : t.errorGeneric
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-ink-900 border border-ink-700 rounded-t-2xl sm:rounded-xl2 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800 sticky top-0 bg-ink-900">
          <h3 className="font-semibold">
            {t.editAppointmentTitle}
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="px-5 py-4 space-y-5"
        >
          <div>
            <p className="text-sm text-zinc-400 mb-2">
              {t.service}
            </p>
            <ServiceSelector
              services={services}
              selectedId={service?.id ?? null}
              onSelect={handleServiceSelect}
            />
          </div>

          <div>
            <p className="text-sm text-zinc-400 mb-2">
              {t.barber}
            </p>
            <StaffSelector
              staff={staffList}
              selectedId={staff?.id ?? null}
              onSelect={handleStaffSelect}
            />
          </div>

          <div>
            <p className="text-sm text-zinc-400 mb-2">
              {t.selectDate}
            </p>
            <DateStrip
              selected={date}
              onSelect={handleDateSelect}
            />
          </div>

          <div>
            <p className="text-sm text-zinc-400 mb-2">
              {t.chooseYourTime}
            </p>
            <TimeSlotGrid
              slots={slots}
              selected={time}
              onSelect={setTime}
              loading={loadingSlots}
              emptyMessage={t.noSlot}
              availableLabel={t.slotAvailable}
              bookedLabel={t.slotBooked}
              exceptionalLabel={
                t.exceptionalSlot
              }
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              {t.close}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving ? t.loading : t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}