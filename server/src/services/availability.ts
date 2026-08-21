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
 * 08:00 -> 20:00 : réservation normale
 * 20:00 -> 21:00 : demande exceptionnelle
 *
 * SAMEDI -> DIMANCHE
 *
 * 08:00 -> 22:00 : réservation normale
 *
 * La totalité du service doit être comprise
 * dans une seule fenêtre.
 */

interface BookingWindow {
  start: number;
  end: number;
  type: "normal" | "request";
}

function getBookingWindows(
  date: string
): BookingWindow[] {
  const dateObject =
    new Date(`${date}T12:00:00`);

  const day =
    dateObject.getDay();

  const isWeekend =
    day === 0 || day === 6;

  if (isWeekend) {
    return [
      {
        start: toMinutes("08:00"),
        end: toMinutes("22:00"),
        type: "normal",
      },
    ];
  }

  return [
    {
      start: toMinutes("08:00"),
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
  date: string
): BusySlot[] {
  const rows = db
    .prepare(
      `
      SELECT
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
      ORDER BY start_time ASC
      `
    )
    .all(
      staffId,
      date
    ) as {
    start_time: string;
    end_time: string;
  }[];

  return rows
    .map((row) => ({
      start: toMinutes(
        row.start_time
      ),
      end: toMinutes(
        row.end_time
      ),
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
 * PAS DES CRÉNEAUX
 * ============================================================
 *
 * Toujours 5 minutes.
 *
 * Exemple :
 *
 * 09:00
 * 09:05
 * 09:10
 * 09:15
 * ...
 *
 * Cela permet de proposer la première heure réellement
 * disponible après la fin d'une réservation.
 */

function getSlotStepMinutes(
  _durationMinutes: number
): number {
  return 5;
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
    !Number.isFinite(
      durationMinutes
    ) ||
    durationMinutes <= 0
  ) {
    return false;
  }

  const start =
    toMinutes(startTime);

  const end =
    start + durationMinutes;

  const windows =
    getBookingWindows(date);

  const window =
    getWindowForSlot(
      windows,
      start,
      end
    );

  return (
    window?.type === "request"
  );
}

/**
 * ============================================================
 * VÉRIFICATION DE CHEVAUCHEMENT
 * ============================================================
 *
 * C'est LA règle principale.
 *
 * Nouveau rendez-vous :
 *
 *     [newStart, newEnd]
 *
 * Rendez-vous existant :
 *
 *     [busyStart, busyEnd]
 *
 * Il y a conflit uniquement si :
 *
 *     newStart < busyEnd
 *     &&
 *     newEnd > busyStart
 *
 * Donc :
 *
 * 20:00 -> 20:20
 * contre
 * 20:40 -> 21:00
 *
 * => PAS de conflit
 *
 * 20:20 -> 20:40
 * contre
 * 20:40 -> 21:00
 *
 * => PAS de conflit
 *
 * 20:25 -> 20:45
 * contre
 * 20:40 -> 21:00
 *
 * => CONFLIT
 *
 * 20:40 -> 21:00
 * contre
 * 20:40 -> 21:00
 *
 * => CONFLIT
 */

function hasConflict(
  start: number,
  end: number,
  busySlots: BusySlot[]
): boolean {
  return busySlots.some(
    (busySlot) =>
      start < busySlot.end &&
      end > busySlot.start
  );
}

/**
 * ============================================================
 * CALCUL DES CRÉNEAUX DISPONIBLES
 * ============================================================
 */

export function computeAvailableSlots(
  staffId: number,
  date: string,
  durationMinutes: number
): string[] {
  if (isClosedDay(date)) {
    return [];
  }

  if (
    !Number.isFinite(
      durationMinutes
    ) ||
    durationMinutes <= 0
  ) {
    return [];
  }

  const today =
    todayInSalonTz();

  if (date < today) {
    return [];
  }

  const busy =
    getBusySlotsForStaffDate(
      staffId,
      date
    );

  const isToday =
    date === today;

  const now =
    nowInSalonTz();

  const nowMinutes =
    now.hour() * 60 +
    now.minute();

  const minimumStart =
    nowMinutes +
    BOOKING_MIN_LEAD_MINUTES;

  const slots: string[] = [];

  const step =
    getSlotStepMinutes(
      durationMinutes
    );

  const windows =
    getBookingWindows(date);

  for (const window of windows) {
    for (
      let start = window.start;
      start + durationMinutes <=
        window.end;
      start += step
    ) {
      /**
       * Réservation dans le passé
       * ou trop proche.
       */
      if (
        isToday &&
        start < minimumStart
      ) {
        continue;
      }

      const end =
        start + durationMinutes;

      /**
       * Le service doit être entièrement
       * contenu dans la fenêtre.
       */
      if (
        end > window.end
      ) {
        continue;
      }

      /**
       * VRAIE vérification de conflit.
       *
       * On ne bloque PAS les heures avant
       * une réservation simplement parce qu'elles
       * sont proches.
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
 * Cette fonction est utilisée lorsque le frontend doit
 * afficher également les créneaux déjà occupés.
 *
 * IMPORTANT :
 *
 * booked = vrai chevauchement
 *
 * request = créneau libre mais situé dans la période
 *           exceptionnelle 20:00 -> 21:00
 *
 * available = créneau libre dans les horaires normaux.
 */

export function computeSlotsWithStatus(
  staffId: number,
  date: string,
  durationMinutes: number
): SlotWithStatus[] {
  if (isClosedDay(date)) {
    return [];
  }

  if (
    !Number.isFinite(
      durationMinutes
    ) ||
    durationMinutes <= 0
  ) {
    return [];
  }

  const today =
    todayInSalonTz();

  if (date < today) {
    return [];
  }

  const busy =
    getBusySlotsForStaffDate(
      staffId,
      date
    );

  const isToday =
    date === today;

  const now =
    nowInSalonTz();

  const nowMinutes =
    now.hour() * 60 +
    now.minute();

  const minimumStart =
    nowMinutes +
    BOOKING_MIN_LEAD_MINUTES;

  const result: SlotWithStatus[] =
    [];

  const step =
    getSlotStepMinutes(
      durationMinutes
    );

  const windows =
    getBookingWindows(date);

  for (const window of windows) {
    for (
      let start = window.start;
      start + durationMinutes <=
        window.end;
      start += step
    ) {
      /**
       * Aujourd'hui :
       * ne pas afficher les heures déjà passées
       * ou trop proches.
       */
      if (
        isToday &&
        start < minimumStart
      ) {
        continue;
      }

      const end =
        start + durationMinutes;

      /**
       * Le service doit tenir entièrement
       * dans la fenêtre.
       */
      if (
        end > window.end
      ) {
        continue;
      }

      /**
       * Vérification du chevauchement réel.
       */
      const conflict =
        hasConflict(
          start,
          end,
          busy
        );

      /**
       * CONFLIT
       */
      if (conflict) {
        result.push({
          time: toHHMM(start),
          status: "booked",
          isExceptional:
            window.type ===
            "request",
        });

        continue;
      }

      /**
       * LIBRE
       *
       * Si la plage est exceptionnelle,
       * elle reste "request" et non "booked".
       */
      result.push({
        time: toHHMM(start),
        status:
          window.type ===
          "request"
            ? "request"
            : "available",
        isExceptional:
          window.type ===
          "request",
      });
    }
  }

  return result;
}

/**
 * ============================================================
 * VALIDATION BACKEND
 * ============================================================
 *
 * Cette fonction doit obligatoirement être appelée
 * au moment de créer une réservation.
 *
 * Le frontend ne suffit jamais pour garantir
 * la disponibilité.
 */

export function isSlotStillAvailable(
  staffId: number,
  date: string,
  startTime: string,
  durationMinutes: number
): boolean {
  if (isClosedDay(date)) {
    return false;
  }

  if (
    !Number.isFinite(
      durationMinutes
    ) ||
    durationMinutes <= 0
  ) {
    return false;
  }

  /**
   * Validation du format.
   */
  if (
    !/^\d{2}:\d{2}$/.test(
      startTime
    )
  ) {
    return false;
  }

  const start =
    toMinutes(startTime);

  if (
    !Number.isFinite(start) ||
    start < 0 ||
    start >= 24 * 60
  ) {
    return false;
  }

  const end =
    start + durationMinutes;

  const today =
    todayInSalonTz();

  if (date < today) {
    return false;
  }

  /**
   * Vérifier que le service tient entièrement
   * dans une fenêtre autorisée.
   */
  const windows =
    getBookingWindows(date);

  const window =
    getWindowForSlot(
      windows,
      start,
      end
    );

  if (!window) {
    return false;
  }

  /**
   * Pour aujourd'hui :
   * empêcher une réservation passée
   * ou trop proche.
   */
  if (date === today) {
    const now =
      nowInSalonTz();

    const nowMinutes =
      now.hour() * 60 +
      now.minute();

    if (
      start <
      nowMinutes +
        BOOKING_MIN_LEAD_MINUTES
    ) {
      return false;
    }
  }

  /**
   * Vérification finale contre TOUS
   * les rendez-vous occupés du coiffeur.
   */
  const busy =
    getBusySlotsForStaffDate(
      staffId,
      date
    );

  /**
   * Aucun chevauchement autorisé.
   */
  return !hasConflict(
    start,
    end,
    busy
  );
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
  const row =
    db
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
      ) as {
      c: number;
    };

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