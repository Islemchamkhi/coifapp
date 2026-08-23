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
 * 09:00 -> 20:00 : réservation normale
 * 20:00 -> 21:00 : réservation exceptionnelle / pending
 * 21:00           : FERMETURE
 *
 * SAMEDI -> DIMANCHE
 *
 * 09:00 -> 22:00 : réservation normale
 * 22:00           : FERMETURE
 *
 * IMPORTANT :
 *
 * La totalité du service doit être terminée avant ou exactement
 * à l'heure de fermeture.
 *
 * Exemples en semaine :
 *
 * 19:00 + 90 min = 20:30 => OK normal
 * 19:30 + 90 min = 21:00 => OK exceptionnel
 * 20:00 + 60 min = 21:00 => OK exceptionnel
 * 20:30 + 30 min = 21:00 => OK exceptionnel
 * 20:30 + 90 min = 22:00 => REFUSÉ
 * 20:45 + 30 min = 21:15 => REFUSÉ
 *
 * Exemple weekend :
 *
 * 20:30 + 90 min = 22:00 => OK
 * 20:31 + 90 min = 22:01 => REFUSÉ
 */

interface BookingWindow {
  start: number;
  end: number;
  type: "normal" | "request";
}

function getBookingWindows(date: string): BookingWindow[] {
  const dateObject = new Date(`${date}T12:00:00`);
  const day = dateObject.getDay();

  const isWeekend = day === 0 || day === 6;

  /**
   * SAMEDI + DIMANCHE
   *
   * 09:00 -> 22:00
   */
  if (isWeekend) {
    return [
      {
        start: toMinutes("09:00"),
        end: toMinutes("22:00"),
        type: "normal",
      },
    ];
  }

  /**
   * LUNDI -> VENDREDI
   *
   * 09:00 -> 20:00 : normal
   * 20:00 -> 21:00 : exceptionnel
   */
  return [
    {
      start: toMinutes("09:00"),
      end: toMinutes("20:00"),
      type: "normal",
    },
    {
      start: toMinutes("20:00"),
      end: toMinutes("21:00"),
      type: "request",
    },
  ];
}

/**
 * ============================================================
 * RENDEZ-VOUS OCCUPÉS
 * ============================================================
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
 * CALCUL DE FIN DE SERVICE
 * ============================================================
 */

export function calculateReservationEnd(
  start: number,
  durationMinutes: number
): number {
  return start + durationMinutes;
}

/**
 * ============================================================
 * CHEVAUCHEMENT
 * ============================================================
 */

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
 */

function getSlotStepMinutes(): number {
  const settings = getBookingSettings();
  return settings.bookingIntervalMinutes;
}

/**
 * ============================================================
 * TROUVER LA FENÊTRE COMPATIBLE
 * ============================================================
 *
 * Le service ENTIER doit rentrer dans la fenêtre.
 *
 * start >= window.start
 * ET
 * end <= window.end
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
 * Une réservation est exceptionnelle uniquement si :
 *
 * - elle est en semaine
 * - elle commence à partir de 20:00
 * - elle termine au plus tard à 21:00
 *
 * Exemple :
 *
 * 19:30 + 90 = 21:00 => request
 * 20:00 + 60 = 21:00 => request
 * 20:30 + 90 = 22:00 => false car réservation invalide
 */

export function isExceptionalSlot(
  date: string,
  startTime: string,
  durationMinutes: number
): boolean {
  if (isClosedDay(date)) {
    return false;
  }

  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return false;
  }

  const start = toMinutes(startTime);

  if (!Number.isFinite(start)) {
    return false;
  }

  const end = calculateReservationEnd(
    start,
    durationMinutes
  );

  const windows = getBookingWindows(date);

  const window = getWindowForSlot(
    windows,
    start,
    end
  );

  return window?.type === "request";
}

/**
 * ============================================================
 * VÉRIFICATION DE CONFLIT
 * ============================================================
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
  /**
   * JOUR FERMÉ
   */
  if (isClosedDay(date)) {
    return {
      valid: false,
      start: -1,
      end: -1,
      window: null,
      reason: "CLOSED_DAY",
    };
  }

  /**
   * DURÉE INVALIDE
   */
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

  /**
   * FORMAT HEURE
   */
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

  /**
   * HEURE INVALIDE
   */
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

  /**
   * CALCUL DE LA FIN RÉELLE DU SERVICE
   */
  const end = calculateReservationEnd(
    start,
    durationMinutes
  );

  const today = todayInSalonTz();

  /**
   * DATE PASSÉE
   */
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
   * ==========================================================
   * RÈGLE PRINCIPALE :
   *
   * LE SERVICE ENTIER DOIT TERMINER AVANT LA FERMETURE.
   *
   * SEMAINE :
   * fermeture = 21:00
   *
   * WEEKEND :
   * fermeture = 22:00
   *
   * C'est ici que :
   *
   * 20:30 + 90 = 22:00
   *
   * est refusé en semaine.
   * ==========================================================
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
   * RÉSERVATION TROP PROCHE DE L'HEURE ACTUELLE
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
 * DISPONIBILITÉ D'UN CRÉNEAU
 * ============================================================
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
 * ============================================================
 * ALIAS COMPATIBILITÉ
 * ============================================================
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
      /**
       * Délai minimum pour aujourd'hui
       */
      if (
        isToday &&
        start < minimumStart
      ) {
        continue;
      }

      /**
       * Calcul de la fin réelle
       */
      const end =
        calculateReservationEnd(
          start,
          durationMinutes
        );

      /**
       * Le service ne doit jamais dépasser
       * la fermeture de la fenêtre.
       */
      if (
        end > window.end
      ) {
        continue;
      }

      /**
       * Vérification conflits
       */
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
 * ============================================================
 * ALIAS COMPATIBILITÉ
 * ============================================================
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
 * CALCUL DES CRÉNEAUX AVEC STATUT
 * ============================================================
 */

export function computeSlotsWithStatus(
  staffId: number,
  date: string,
  durationMinutes: number,
  stepMinutes: number = getSlotStepMinutes(),
  excludeAppointmentId?: string
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

  /**
   * CORRECTIF (modification d'une réservation existante) :
   *
   * Lorsqu'un client modifie sa propre réservation, son
   * créneau actuel ne doit pas apparaître comme "booked"
   * juste parce qu'il l'occupe déjà lui-même.
   *
   * excludeAppointmentId permet d'ignorer cette réservation
   * précise dans le calcul d'occupation — exactement le même
   * mécanisme que celui déjà utilisé par isSlotAvailable et
   * par la modification admin (getBusySlotsForStaffDate).
   */
  const busy =
    getBusySlotsForStaffDate(
      staffId,
      date,
      excludeAppointmentId
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
      /**
       * Délai minimum
       */
      if (
        isToday &&
        start < minimumStart
      ) {
        continue;
      }

      /**
       * Fin réelle du service
       */
      const end =
        calculateReservationEnd(
          start,
          durationMinutes
        );

      /**
       * Ne jamais dépasser la fermeture
       */
      if (
        end > window.end
      ) {
        continue;
      }

      /**
       * Vérification conflit
       */
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
          isExceptional:
            window.type === "request",
        });

        continue;
      }

      /**
       * Créneau libre
       */
      result.push({
        time: toHHMM(start),
        status:
          window.type === "request"
            ? "request"
            : "available",
        isExceptional:
          window.type === "request",
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