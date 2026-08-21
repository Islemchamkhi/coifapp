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
 * 08:00 -> 20:00 : réservation normale
 * 20:00 -> 21:00 : demande exceptionnelle
 *
 * SAMEDI -> DIMANCHE
 * 08:00 -> 22:00 : réservation normale
 *
 * IMPORTANT :
 * toute la durée du service doit être comprise
 * dans une plage autorisée.
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
 * Seuls les rendez-vous du coiffeur sélectionné sont pris
 * en compte.
 *
 * confirmed  = occupé
 * pending    = occupé
 * blocked    = occupé
 */
export function getBusySlotsForStaffDate(
  staffId: number,
  date: string
): BusySlot[] {
  const rows = db
    .prepare(
      `SELECT start_time, end_time
       FROM appointments
       WHERE staff_id = ?
         AND date = ?
         AND status IN ('confirmed', 'pending', 'blocked')
       ORDER BY start_time ASC`
    )
    .all(staffId, date) as {
    start_time: string;
    end_time: string;
  }[];

  return rows
    .map((row) => ({
      start: toMinutes(row.start_time),
      end: toMinutes(row.end_time),
    }))
    .filter((slot) => slot.end > slot.start);
}

/**
 * ============================================================
 * PAS DES CRÉNEAUX (GRANULARITÉ DE RECHERCHE)
 * ============================================================
 *
 * IMPORTANT — CORRECTIF :
 * Le pas ne doit JAMAIS être calé sur la durée du service.
 *
 * Avant : step = durationMinutes (ex: 60 min) faisait sauter
 * la grille de 08:00 à 09:00 à 10:00... et ratait complètement
 * un vrai créneau libre comme 09:45 (juste après la fin d'un
 * rendez-vous existant de 09:00->09:45), car 09:45 n'est pas un
 * multiple de 60 depuis 08:00.
 *
 * Cela contredit directement la règle métier : "le système doit
 * proposer la première heure réellement possible" — la grille
 * doit pouvoir se caler sur la fin de N'IMPORTE QUEL rendez-vous
 * existant, pas seulement sur des multiples de la durée choisie.
 *
 * Un pas fixe et fin (5 min) couvre tous les cas réels (les
 * rendez-vous démarrent à des multiples de 5 : 00, 05, 15, 20,
 * 30, 45...) sans exploser la taille de la grille affichée.
 */
function getSlotStepMinutes(durationMinutes: number): number {
  return 5;
}

/**
 * ============================================================
 * FENÊTRE POUR UNE PÉRIODE
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
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return false;
  }

  const start = toMinutes(startTime);
  const end = start + durationMinutes;

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
 * CALCUL DES CRÉNEAUX DISPONIBLES
 * ============================================================
 *
 * IMPORTANT :
 * Un créneau est disponible uniquement si :
 *
 *     [start, end]
 *
 * ne chevauche AUCUN rendez-vous existant du coiffeur.
 *
 * Exemple :
 *
 * rendez-vous :
 * 17:30 -> 17:50
 *
 * service 20 min :
 *
 * 17:30 -> 17:50  ❌
 * 17:40 -> 18:00  ❌
 * 17:50 -> 18:10  ✅
 * 18:00 -> 18:20  ✅
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
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return [];
  }

  const today = todayInSalonTz();

  if (date < today) {
    return [];
  }

  const busy = getBusySlotsForStaffDate(
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

  const slotStepMinutes =
    getSlotStepMinutes(durationMinutes);

  const windows = getBookingWindows(date);

  for (const window of windows) {
    for (
      let start = window.start;
      start + durationMinutes <= window.end;
      start += slotStepMinutes
    ) {
      if (
        isToday &&
        start < minimumStart
      ) {
        continue;
      }

      const end =
        start + durationMinutes;

      /**
       * Toute la durée du service doit rester
       * dans la fenêtre d'ouverture.
       */
      if (
        end > window.end
      ) {
        continue;
      }

      /**
       * VRAIE vérification de chevauchement.
       *
       * Exemple :
       *
       * réservation existante :
       * 17:30 -> 17:50
       *
       * nouveau créneau :
       * 17:50 -> 18:10
       *
       * => PAS de conflit
       */
      const conflict = busy.some(
        (busySlot) =>
          overlaps(
            start,
            end,
            busySlot.start,
            busySlot.end
          )
      );

      if (!conflict) {
        slots.push(
          toHHMM(start)
        );
      }
    }
  }

  return slots;
}

/**
 * ============================================================
 * CRÉNEAUX AVEC STATUT
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
 * AFFICHAGE DE TOUS LES CRÉNEAUX
 * ============================================================
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

  const result: SlotWithStatus[] = [];

  const slotStepMinutes =
    getSlotStepMinutes(
      durationMinutes
    );

  const windows =
    getBookingWindows(date);

  for (const window of windows) {
    for (
      let start = window.start;
      start + durationMinutes <= window.end;
      start += slotStepMinutes
    ) {
      if (
        isToday &&
        start < minimumStart
      ) {
        continue;
      }

      const end =
        start + durationMinutes;

      if (
        end > window.end
      ) {
        continue;
      }

      const conflict =
        busy.some(
          (busySlot) =>
            overlaps(
              start,
              end,
              busySlot.start,
              busySlot.end
            )
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
 * VALIDATION BACKEND
 * ============================================================
 *
 * ATTENTION :
 *
 * Cette fonction accepte une heure personnalisée.
 *
 * Donc :
 *
 * service = 20 min
 * heure = 17:55
 *
 * est VALIDE si :
 *
 * 17:55 -> 18:15
 *
 * est entièrement libre.
 *
 * ON NE FAIT PLUS :
 *
 * (start - window.start) % duration === 0
 *
 * car cette règle empêchait les heures personnalisées.
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
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return false;
  }

  /**
   * Validation du format horaire.
   */
  if (
    !/^\d{2}:\d{2}$/.test(startTime)
  ) {
    return false;
  }

  const start =
    toMinutes(startTime);

  /**
   * Sécurité :
   * une heure invalide doit être refusée.
   */
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

  const windows =
    getBookingWindows(date);

  /**
   * La totalité du service doit tenir
   * dans une plage autorisée.
   */
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
   * pas de réservation passée
   * ni trop proche.
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
   * ==========================================================
   * VÉRIFICATION CRITIQUE
   * ==========================================================
   *
   * On vérifie la période entière :
   *
   * [start, end]
   *
   * contre toutes les périodes occupées :
   *
   * [busyStart, busyEnd]
   *
   * Exemple :
   *
   * busy   = 17:30 -> 17:50
   *
   * new    = 17:55 -> 18:15
   *
   * => false conflict => DISPONIBLE
   *
   * new    = 17:45 -> 18:05
   *
   * => conflict => REFUSÉ
   */
  const busy =
    getBusySlotsForStaffDate(
      staffId,
      date
    );

  const conflict =
    busy.some(
      (busySlot) =>
        overlaps(
          start,
          end,
          busySlot.start,
          busySlot.end
        )
    );

  return !conflict;
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
      `SELECT COUNT(*) as c
       FROM appointments
       WHERE staff_id = ?
         AND date = ?
         AND status = 'confirmed'
         AND start_time < ?`
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
      `SELECT *
       FROM appointments
       WHERE staff_id = ?
         AND date = ?
         AND status = 'confirmed'
       ORDER BY start_time ASC`
    )
    .all(
      staffId,
      date
    ) as Appointment[];
}