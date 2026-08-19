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
 *   08:00 -> 20:00 : réservation normale
 *   20:00 -> 21:00 : demande exceptionnelle
 *   après 21:00    : fermé
 *
 * SAMEDI -> DIMANCHE
 *   08:00 -> 22:00 : réservation normale
 *   après 22:00    : fermé
 *
 * IMPORTANT :
 * La durée complète du service doit toujours rentrer
 * dans la plage autorisée.
 */

interface BookingWindow {
  start: number;
  end: number;
  type: "normal" | "request";
}

/**
 * Retourne les plages horaires du salon selon le jour.
 */
function getBookingWindows(date: string): BookingWindow[] {
  const dateObject = new Date(`${date}T12:00:00`);

  const day = dateObject.getDay();

  // Samedi = 6
  // Dimanche = 0
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

  // Lundi -> Vendredi
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
 * Retourne les créneaux occupés par un coiffeur
 * pour une date donnée.
 *
 * IMPORTANT :
 * - Le planning est indépendant pour chaque coiffeur.
 * - Un rendez-vous d'Abdou ne bloque jamais automatiquement Rayen.
 * - Un rendez-vous confirmé reste occupé même lorsque son heure est passée.
 * - Les rendez-vous pending sont également considérés comme occupés.
 * - Les rendez-vous bloqués sont également considérés comme occupés.
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
         AND status IN ('confirmed', 'pending', 'blocked')`
    )
    .all(staffId, date) as {
    start_time: string;
    end_time: string;
  }[];

  return rows.map((r) => ({
    start: toMinutes(r.start_time),
    end: toMinutes(r.end_time),
  }));
}

/**
 * Retourne le pas entre deux créneaux.
 *
 * Le pas dépend directement de la durée du service :
 *
 * 20 min -> 20 min
 * 30 min -> 30 min
 * 45 min -> 45 min
 * 60 min -> 60 min
 */
function getSlotStepMinutes(durationMinutes: number): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return 10;
  }

  return Math.floor(durationMinutes);
}

/**
 * Vérifie si un créneau est dans une plage horaire.
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
 * Retourne true si le créneau correspond à une demande
 * exceptionnelle en semaine.
 *
 * Lundi -> vendredi :
 * 20:00 -> 21:00
 */
export function isExceptionalSlot(
  date: string,
  startTime: string,
  durationMinutes: number
): boolean {
  if (isClosedDay(date)) {
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
 * Retourne les créneaux disponibles pour un client.
 *
 * Règles :
 *
 * - Un jour fermé ne propose aucun créneau.
 * - Une date passée ne propose aucun créneau.
 * - Aujourd'hui, les créneaux déjà passés ou trop proches
 *   ne sont pas proposés.
 * - BOOKING_MIN_LEAD_MINUTES est respecté.
 * - Les rendez-vous existants du coiffeur sélectionné
 *   bloquent leur période.
 * - Les rendez-vous pending bloquent également leur période.
 * - Le pas entre deux créneaux correspond à la durée du service.
 * - Les créneaux 20:00 -> 21:00 en semaine sont également
 *   proposés car ils peuvent faire l'objet d'une demande.
 *
 * IMPORTANT :
 * Cette fonction ne modifie JAMAIS la base de données.
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

  // Une date entièrement passée n'est plus réservable.
  if (date < today) {
    return [];
  }

  // Rendez-vous du coiffeur sélectionné uniquement.
  // confirmed + pending + blocked
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

  // Le pas dépend de la durée du service.
  const slotStepMinutes =
    getSlotStepMinutes(durationMinutes);

  const windows = getBookingWindows(date);

  for (const window of windows) {
    for (
      let start = window.start;
      start + durationMinutes <= window.end;
      start += slotStepMinutes
    ) {
      // Pour aujourd'hui :
      // empêcher les réservations trop proches
      // ou déjà passées.
      if (
        isToday &&
        start < minimumStart
      ) {
        continue;
      }

      const end =
        start + durationMinutes;

      // Vérification supplémentaire de toute
      // la durée du service.
      if (end > window.end) {
        continue;
      }

      // Vérifier les conflits avec les rendez-vous
      // du coiffeur sélectionné.
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
        slots.push(toHHMM(start));
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
 * Calcule TOUS les créneaux valides de la journée
 * pour affichage côté client.
 *
 * Statuts :
 *
 * available
 *   = réservation normale
 *
 * request
 *   = demande exceptionnelle nécessitant
 *     la confirmation du salon
 *
 * booked
 *   = créneau déjà occupé par un rendez-vous.
 *
 * IMPORTANT :
 * Les informations privées du client ne sont jamais exposées.
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

  // Rendez-vous du coiffeur sélectionné uniquement.
  // confirmed + pending + blocked
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
      // Pour aujourd'hui :
      // ne pas afficher les créneaux passés
      // ou trop proches.
      if (
        isToday &&
        start < minimumStart
      ) {
        continue;
      }

      const end =
        start + durationMinutes;

      // Sécurité : toute la durée doit
      // être comprise dans la fenêtre.
      if (end > window.end) {
        continue;
      }

      // Vérification des rendez-vous existants.
      // confirmed + pending + blocked
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

      // Créneau normal ou demande exceptionnelle.
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
 */

/**
 * Vérifie si un client peut encore réserver un créneau.
 *
 * IMPORTANT :
 * Le backend est la source de vérité.
 *
 * Cette fonction vérifie :
 *
 * - le jour ;
 * - les horaires d'ouverture ;
 * - la durée complète du service ;
 * - le coiffeur sélectionné ;
 * - le pas correspondant à la durée du service ;
 * - les rendez-vous existants du coiffeur ;
 * - les rendez-vous pending ;
 * - le délai minimum pour aujourd'hui.
 *
 * Les créneaux exceptionnels 20:00 -> 21:00
 * sont autorisés ici.
 *
 * Ils doivent ensuite être enregistrés avec le statut
 * approprié par la route de création de réservation.
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

  const today =
    todayInSalonTz();

  // Une date passée n'est plus réservable.
  if (date < today) {
    return false;
  }

  const start =
    toMinutes(startTime);

  const end =
    start + durationMinutes;

  const windows =
    getBookingWindows(date);

  /**
   * Le service complet doit rentrer
   * dans une fenêtre autorisée.
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
   * Le backend vérifie également que
   * l'heure demandée respecte le pas
   * correspondant à la durée du service.
   */
  const slotStepMinutes =
    getSlotStepMinutes(
      durationMinutes
    );

  const alignedToWindow =
    (start - window.start) %
      slotStepMinutes ===
    0;

  if (!alignedToWindow) {
    return false;
  }

  /**
   * Pour aujourd'hui :
   * empêcher une réservation trop proche
   * ou déjà passée.
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
   * Vérifier uniquement les rendez-vous
   * du coiffeur sélectionné.
   *
   * IMPORTANT :
   * confirmed + pending + blocked
   * bloquent tous le créneau.
   */
  const busy =
    getBusySlotsForStaffDate(
      staffId,
      date
    );

  /**
   * Vérification sur toute la durée
   * du nouveau service.
   */
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

/**
 * Nombre de clients ayant un rendez-vous avant
 * celui demandé.
 *
 * On compte uniquement les rendez-vous confirmés
 * du coiffeur sélectionné.
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

/**
 * Retourne les rendez-vous confirmés d'un coiffeur
 * pour une journée complète.
 *
 * IMPORTANT :
 * Le filtre porte uniquement sur la date.
 * Il n'y a volontairement AUCUN filtre sur l'heure.
 *
 * Ainsi :
 *
 * rendez-vous 14:20
 * à 14:21 -> toujours visible
 * à 15:00 -> toujours visible
 * à 18:00 -> toujours visible
 *
 * Il disparaît uniquement s'il est annulé/modifié.
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