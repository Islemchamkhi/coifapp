import { db } from "../db.js";
import { Appointment } from "../types.js";

import {
  BOOKING_MIN_LEAD_MINUTES,
  isClosedDay,
  toMinutes,
  toHHMM,
  overlaps,
  nowInSalonTz,
  todayInSalonTz,
} from "../lib/time.js";

import { getBookingSettings } from "./bookingSettings.js";

export interface BusySlot {
  start: number;
  end: number;
}

/**
 * ============================================================
 * HORAIRES DU SALON
 * ============================================================
 *
 * LUNDI -> VENDREDI
 *
 * 09:00 -> 21:00 : réservation normale
 *
 * SAMEDI -> DIMANCHE
 *
 * 09:00 -> 22:00 : réservation normale
 *
 * IMPORTANT :
 *
 * La disponibilité dépend de la FIN RÉELLE du service.
 *
 * Exemple semaine :
 *
 * 19:30 + 90 min = 21:00
 * => AUTORISÉ
 *
 * 19:31 + 90 min = 21:01
 * => REFUSÉ
 *
 * 20:30 + 90 min = 22:00
 * => REFUSÉ
 *
 * Exemple weekend :
 *
 * 20:30 + 90 min = 22:00
 * => AUTORISÉ
 *
 * 20:31 + 90 min = 22:01
 * => REFUSÉ
 *
 * Le service doit TOUJOURS être complètement terminé
 * avant ou exactement à l'heure de fermeture.
 */

interface BookingWindow {
  start: number;
  end: number;
  type: "normal";
}

function getBookingWindows(date: string): BookingWindow[] {
  const dateObject = new Date(`${date}T12:00:00`);

  const day = dateObject.getDay();

  const isWeekend = day === 0 || day === 6;

  if (isWeekend) {
    return [
      {
        start: toMinutes("09:00"),
        end: toMinutes("22:00"),
        type: "normal",
      },
    ];
  }

  return [
    {
      start: toMinutes("09:00"),
      end: toMinutes("21:00"),
      type: "normal",
    },
  ];
}

/**
 * ============================================================
 * RENDEZ-VOUS OCCUPÉS
 * ============================================================
 *
 * IMPORTANT :
 *
 * On ne prend en compte que les rendez-vous du
 * coiffeur sélectionné.
 *
 * confirmed = occupé
 * pending   = occupé
 * blocked   = occupé
 *
 * cancelled ne bloque PAS la disponibilité.
 */

export function getBusySlotsForStaffDate(
  staffId: number,
  date: string,
  excludeAppointmentId?: string
): BusySlot[] {
  const rows = db
    .prepare(
      `
      SELECT
        id,
        start_time,
        end_time
      FROM appointments
      WHERE staff_id = ?
        AND date = ?
        AND status IN (
          'confirmed',
          'pending',
          'blocked'
        )
        ${excludeAppointmentId ? "AND id != ?" : ""}
      ORDER BY start_time ASC
      `
    )
    .all(
      ...(excludeAppointmentId
        ? [staffId, date, excludeAppointmentId]
        : [staffId, date])
    ) as {
    id: string;
    start_time: string;
    end_time: string;
  }[];

  return rows
    .map((row) => ({
      start: toMinutes(row.start_time),
      end: toMinutes(row.end_time),
    }))
    .filter(
      (slot) =>
        Number.isFinite(slot.start) &&
        Number.isFinite(slot.end) &&
        slot.end > slot.start
    );
}

/**
 * ============================================================
 * UTILITAIRES DE BASE — DURÉE / CHEVAUCHEMENT
 * ============================================================
 */

export function calculateReservationEnd(
  start: number,
  durationMinutes: number
): number {
  return start + durationMinutes;
}

export function hasTimeOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return overlaps(aStart, aEnd, bStart, bEnd);
}

/**
 * ============================================================
 * PAS DE LA GRILLE
 * ============================================================
 *
 * Configurable par salon via booking_settings.
 *
 * Ce pas sert uniquement à générer les créneaux affichés.
 * Il ne change PAS la validation réelle côté serveur.
 */

function getSlotStepMinutes(): number {
  const settings = getBookingSettings();
  return settings.bookingIntervalMinutes;
}

/**
 * ============================================================
 * TROUVER LA FENÊTRE
 * ============================================================
 */

function getWindowForSlot(
  windows: BookingWindow[],
  start: number,
  end: number
): BookingWindow | null {
  return (
    windows.find(
      (window) =>
        start >= window.start &&
        end <= window.end
    ) ?? null
  );
}

/**
 * ============================================================
 * DEMANDE EXCEPTIONNELLE
 * ============================================================
 *
 * Il n'y a plus de plage exceptionnelle permettant
 * de dépasser l'heure maximale de fermeture.
 *
 * La fonction est conservée pour compatibilité avec
 * le reste de l'application.
 */

export function isExceptionalSlot(
  date: string,
  startTime: string,
  durationMinutes: number
): boolean {
  return false;
}

/**
 * ============================================================
 * VÉRIFICATION DE CHEVAUCHEMENT
 * ============================================================
 *
 * Il y a conflit uniquement si :
 *
 * newStart < busyEnd
 * ET
 * newEnd > busyStart
 *
 * Deux rendez-vous qui se touchent exactement
 * restent autorisés.
 */

export function hasConflict(
  start: number,
  end: number,
  busySlots: BusySlot[]
): boolean {
  return busySlots.some((busySlot) =>
    hasTimeOverlap(
      start,
      end,
      busySlot.start,
      busySlot.end
    )
  );
}

/**
 * ============================================================
 * VALIDATION D'UNE HEURE DE DÉBUT
 * ============================================================
 *
 * RÈGLE PRINCIPALE :
 *
 * start + durée <= fermeture
 *
 * La durée complète du service doit être terminée
 * avant ou exactement à l'heure de fermeture.
 */

export interface BookingTimeValidation {
  valid: boolean;
  start: number;
  end: number;
  window: BookingWindow | null;
  reason?:
    | "CLOSED_DAY"
    | "INVALID_DURATION"
    | "INVALID_TIME_FORMAT"
    | "INVALID_TIME_RANGE"
    | "PAST_DATE"
    | "OUTSIDE_OPENING_HOURS"
    | "TOO_SOON";
}

export function validateBookingTime(
  date: string,
  startTime: string,
  durationMinutes: number
): BookingTimeValidation {
  if (isClosedDay(date)) {
    return {
      valid: false,
      start: -1,
      end: -1,
      window: null,
      reason: "CLOSED_DAY",
    };
  }

  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return {
      valid: false,
      start: -1,
      end: -1,
      window: null,
      reason: "INVALID_DURATION",
    };
  }

  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    return {
      valid: false,
      start: -1,
      end: -1,
      window: null,
      reason: "INVALID_TIME_FORMAT",
    };
  }

  const start = toMinutes(startTime);

  if (
    !Number.isFinite(start) ||
    start < 0 ||
    start >= 24 * 60
  ) {
    return {
      valid: false,
      start: -1,
      end: -1,
      window: null,
      reason: "INVALID_TIME_RANGE",
    };
  }

  const end = calculateReservationEnd(
    start,
    durationMinutes
  );

  const today = todayInSalonTz();

  if (date < today) {
    return {
      valid: false,
      start,
      end,
      window: null,
      reason: "PAST_DATE",
    };
  }

  /**
   * ========================================================
   * RÈGLE FONDAMENTALE
   * ========================================================
   *
   * Le service ENTIER doit tenir dans les horaires.
   *
   * SEMAINE :
   * fermeture = 21:00
   *
   * WEEKEND :
   * fermeture = 22:00
   *
   * Exemple semaine :
   *
   * 20:30 + 90 = 22:00
   * => REFUSÉ
   *
   * 19:30 + 90 = 21:00
   * => ACCEPTÉ
   */

  const windows = getBookingWindows(date);

  const window = getWindowForSlot(
    windows,
    start,
    end
  );

  if (!window) {
    return {
      valid: false,
      start,
      end,
      window: null,
      reason: "OUTSIDE_OPENING_HOURS",
    };
  }

  /**
   * Vérification du délai minimum pour aujourd'hui.
   */

  if (date === today) {
    const now = nowInSalonTz();

    const nowMinutes =
      now.hour() * 60 + now.minute();

    if (
      start <
      nowMinutes + BOOKING_MIN_LEAD_MINUTES
    ) {
      return {
        valid: false,
        start,
        end,
        window,
        reason: "TOO_SOON",
      };
    }
  }

  return {
    valid: true,
    start,
    end,
    window,
  };
}

/**
 * ============================================================
 * DISPONIBILITÉ D'UN CRÉNEAU PRÉCIS
 * ============================================================
 *
 * Source de vérité côté backend.
 */

export function isSlotAvailable(
  staffId: number,
  date: string,
  startTime: string,
  durationMinutes: number,
  excludeAppointmentId?: string
): boolean {
  const validation =
    validateBookingTime(
      date,
      startTime,
      durationMinutes
    );

  if (!validation.valid) {
    return false;
  }

  const busy =
    getBusySlotsForStaffDate(
      staffId,
      date,
      excludeAppointmentId
    );

  return !hasConflict(
    validation.start,
    validation.end,
    busy
  );
}

/**
 * Alias conservé pour compatibilité.
 */

export function isSlotStillAvailable(
  staffId: number,
  date: string,
  startTime: string,
  durationMinutes: number
): boolean {
  return isSlotAvailable(
    staffId,
    date,
    startTime,
    durationMinutes
  );
}

/**
 * ============================================================
 * GÉNÉRATION DES CRÉNEAUX
 * ============================================================
 *
 * Le dernier créneau possible dépend de la durée.
 *
 * Exemple :
 *
 * fermeture 21:00
 * service 90 min
 *
 * dernier début possible = 19:30
 */

export function generateAvailableSlots(
  staffId: number,
  date: string,
  durationMinutes: number,
  stepMinutes: number = getSlotStepMinutes()
): string[] {
  if (isClosedDay(date)) {
    return [];
  }

  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return [];
  }

  const today = todayInSalonTz();

  if (date < today) {
    return [];
  }

  const busy =
    getBusySlotsForStaffDate(
      staffId,
      date
    );

  const isToday = date === today;

  const now = nowInSalonTz();

  const nowMinutes =
    now.hour() * 60 + now.minute();

  const minimumStart =
    nowMinutes + BOOKING_MIN_LEAD_MINUTES;

  const slots: string[] = [];

  const windows =
    getBookingWindows(date);

  for (const window of windows) {
    for (
      let start = window.start;
      start + durationMinutes <= window.end;
      start += stepMinutes
    ) {
      if (
        isToday &&
        start < minimumStart
      ) {
        continue;
      }

      const end =
        calculateReservationEnd(
          start,
          durationMinutes
        );

      /**
       * Sécurité supplémentaire :
       * aucune réservation ne peut dépasser
       * la fermeture.
       */

      if (end > window.end) {
        continue;
      }

      if (
        hasConflict(
          start,
          end,
          busy
        )
      ) {
        continue;
      }

      slots.push(
        toHHMM(start)
      );
    }
  }

  return slots;
}

/**
 * Alias conservé pour compatibilité.
 */

export function computeAvailableSlots(
  staffId: number,
  date: string,
  durationMinutes: number
): string[] {
  return generateAvailableSlots(
    staffId,
    date,
    durationMinutes
  );
}

/**
 * ============================================================
 * STATUT DES CRÉNEAUX
 * ============================================================
 */

export type SlotStatus =
  | "available"
  | "booked"
  | "request";

export interface SlotWithStatus {
  time: string;
  status: SlotStatus;
  isExceptional?: boolean;
}

/**
 * ============================================================
 * CALCUL DE TOUS LES CRÉNEAUX AVEC STATUT
 * ============================================================
 *
 * Il n'y a plus de créneau "request" basé sur une heure
 * dépassant la fermeture.
 *
 * Tous les créneaux valides sont "available".
 * Les créneaux occupés sont "booked".
 */

export function computeSlotsWithStatus(
  staffId: number,
  date: string,
  durationMinutes: number,
  stepMinutes: number = getSlotStepMinutes()
): SlotWithStatus[] {
  if (isClosedDay(date)) {
    return [];
  }

  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return [];
  }

  const today = todayInSalonTz();

  if (date < today) {
    return [];
  }

  const busy =
    getBusySlotsForStaffDate(
      staffId,
      date
    );

  const isToday = date === today;

  const now = nowInSalonTz();

  const nowMinutes =
    now.hour() * 60 + now.minute();

  const minimumStart =
    nowMinutes + BOOKING_MIN_LEAD_MINUTES;

  const result: SlotWithStatus[] = [];

  const windows =
    getBookingWindows(date);

  for (const window of windows) {
    for (
      let start = window.start;
      start + durationMinutes <= window.end;
      start += stepMinutes
    ) {
      if (
        isToday &&
        start < minimumStart
      ) {
        continue;
      }

      const end =
        calculateReservationEnd(
          start,
          durationMinutes
        );

      if (end > window.end) {
        continue;
      }

      const conflict =
        hasConflict(
          start,
          end,
          busy
        );

      if (conflict) {
        result.push({
          time: toHHMM(start),
          status: "booked",
          isExceptional: false,
        });

        continue;
      }

      result.push({
        time: toHHMM(start),
        status: "available",
        isExceptional: false,
      });
    }
  }

  return result;
}

/**
 * ============================================================
 * CLIENTS AVANT UN RENDEZ-VOUS
 * ============================================================
 */

export function countClientsBefore(
  staffId: number,
  date: string,
  startTime: string
): number {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS c
      FROM appointments
      WHERE staff_id = ?
        AND date = ?
        AND status = 'confirmed'
        AND start_time < ?
      `
    )
    .get(
      staffId,
      date,
      startTime
    ) as { c: number };

  return row.c;
}

/**
 * ============================================================
 * RENDEZ-VOUS CONFIRMÉS
 * ============================================================
 */

export function getUpcomingForStaffDate(
  staffId: number,
  date: string
): Appointment[] {
  return db
    .prepare(
      `
      SELECT *
      FROM appointments
      WHERE staff_id = ?
        AND date = ?
        AND status = 'confirmed'
      ORDER BY start_time ASC
      `
    )
    .all(
      staffId,
      date
    ) as Appointment[];
}