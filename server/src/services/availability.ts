import { db } from "../db.js";
import { Appointment } from "../types.js";
import {
  WORK_WINDOWS,
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
 * Retourne les créneaux occupés par un coiffeur pour une date donnée.
 *
 * IMPORTANT :
 * - Le planning est indépendant pour chaque coiffeur.
 * - Un rendez-vous d'Abdou ne bloque jamais automatiquement Rayen.
 * - Un rendez-vous confirmé reste occupé même lorsque son heure est passée.
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
         AND status IN ('confirmed', 'blocked')`
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
 * - 20 min -> 20 min
 * - 30 min -> 30 min
 * - 45 min -> 45 min
 * - 60 min -> 60 min
 *
 * Cela permet d'avoir des horaires cohérents avec le service choisi.
 */
function getSlotStepMinutes(durationMinutes: number): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return 10;
  }

  return Math.floor(durationMinutes);
}

/**
 * Calcule les créneaux disponibles pour un client.
 *
 * Règles :
 * - Un jour fermé ne propose aucun créneau.
 * - Une date passée ne propose aucun créneau.
 * - Aujourd'hui, les créneaux déjà passés ou trop proches ne sont pas proposés.
 * - BOOKING_MIN_LEAD_MINUTES est respecté.
 * - Les rendez-vous existants du coiffeur sélectionné bloquent leur période.
 * - Le pas entre deux créneaux correspond à la durée du service.
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

  const today = todayInSalonTz();

  // Une date entièrement passée n'est plus réservable.
  if (date < today) {
    return [];
  }

  // IMPORTANT :
  // On récupère uniquement les rendez-vous du coiffeur sélectionné.
  const busy = getBusySlotsForStaffDate(staffId, date);

  const isToday = date === today;

  const now = nowInSalonTz();
  const nowMinutes = now.hour() * 60 + now.minute();

  const minimumStart =
    nowMinutes + BOOKING_MIN_LEAD_MINUTES;

  const slots: string[] = [];

  // Le pas dépend de la durée du service.
  const slotStepMinutes =
    getSlotStepMinutes(durationMinutes);

  for (const window of WORK_WINDOWS) {
    for (
      let start = window.start;
      start + durationMinutes <= window.end;
      start += slotStepMinutes
    ) {
      // Pour aujourd'hui :
      // empêcher les nouvelles réservations trop proches
      // ou déjà passées.
      if (isToday && start < minimumStart) {
        continue;
      }

      const end = start + durationMinutes;

      // Vérification sur TOUTE la durée du service.
      const conflict = busy.some((busySlot) =>
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

export type SlotStatus = "available" | "booked";

export interface SlotWithStatus {
  time: string;
  status: SlotStatus;
}

/**
 * Calcule TOUS les créneaux valides de la journée
 * (disponibles ET réservés), pour affichage côté client.
 *
 * IMPORTANT :
 * - Les rendez-vous sont calculés uniquement pour le coiffeur sélectionné.
 * - La durée du service détermine le pas entre les créneaux.
 * - Les informations privées du client ne sont jamais exposées.
 *
 * Exemple avec un service de 60 minutes :
 *
 * 09:00
 * 10:00
 * 11:00
 * 12:00
 * 14:00
 * 15:00
 * ...
 *
 * Exemple avec un service de 20 minutes :
 *
 * 09:00
 * 09:20
 * 09:40
 * 10:00
 * ...
 */
export function computeSlotsWithStatus(
  staffId: number,
  date: string,
  durationMinutes: number
): SlotWithStatus[] {
  if (isClosedDay(date)) {
    return [];
  }

  const today = todayInSalonTz();

  if (date < today) {
    return [];
  }

  // IMPORTANT :
  // Seuls les rendez-vous de CE coiffeur sont pris en compte.
  const busy = getBusySlotsForStaffDate(staffId, date);

  const isToday = date === today;

  const now = nowInSalonTz();
  const nowMinutes = now.hour() * 60 + now.minute();

  const minimumStart =
    nowMinutes + BOOKING_MIN_LEAD_MINUTES;

  const result: SlotWithStatus[] = [];

  // Le pas dépend de la durée du service sélectionné.
  const slotStepMinutes =
    getSlotStepMinutes(durationMinutes);

  for (const window of WORK_WINDOWS) {
    for (
      let start = window.start;
      start + durationMinutes <= window.end;
      start += slotStepMinutes
    ) {
      if (isToday && start < minimumStart) {
        continue;
      }

      const end = start + durationMinutes;

      // Le créneau est réservé si la durée complète
      // du nouveau service chevauche un rendez-vous existant.
      const conflict = busy.some((busySlot) =>
        overlaps(
          start,
          end,
          busySlot.start,
          busySlot.end
        )
      );

      result.push({
        time: toHHMM(start),
        status: conflict ? "booked" : "available",
      });
    }
  }

  return result;
}

/**
 * Vérifie si un client peut encore réserver un créneau.
 *
 * IMPORTANT :
 * Le backend est la source de vérité.
 *
 * Cette fonction vérifie :
 * - le jour ;
 * - les horaires d'ouverture ;
 * - la durée complète du service ;
 * - le coiffeur sélectionné ;
 * - le pas correspondant à la durée du service ;
 * - les rendez-vous existants du coiffeur ;
 * - le délai minimum pour aujourd'hui.
 *
 * Elle ne modifie jamais un rendez-vous existant.
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

  const today = todayInSalonTz();

  // Une date passée n'est plus réservable.
  if (date < today) {
    return false;
  }

  const start = toMinutes(startTime);
  const end = start + durationMinutes;

  // Le service doit être entièrement dans les horaires d'ouverture.
  const withinWindow = WORK_WINDOWS.some(
    (window) =>
      start >= window.start &&
      end <= window.end
  );

  if (!withinWindow) {
    return false;
  }

  /*
   * IMPORTANT :
   * Le backend doit également vérifier que l'heure demandée
   * respecte le pas correspondant à la durée du service.
   *
   * Exemple :
   * service 20 min -> 09:00, 09:20, 09:40...
   * service 60 min -> 09:00, 10:00, 11:00...
   */
  const slotStepMinutes =
    getSlotStepMinutes(durationMinutes);

  const alignedToWindow = WORK_WINDOWS.some(
    (window) => {
      if (
        start < window.start ||
        end > window.end
      ) {
        return false;
      }

      return (
        (start - window.start) %
          slotStepMinutes ===
        0
      );
    }
  );

  if (!alignedToWindow) {
    return false;
  }

  // Pour aujourd'hui, empêcher une nouvelle réservation
  // trop proche ou déjà passée.
  if (date === today) {
    const now = nowInSalonTz();
    const nowMinutes =
      now.hour() * 60 + now.minute();

    if (
      start <
      nowMinutes + BOOKING_MIN_LEAD_MINUTES
    ) {
      return false;
    }
  }

  /*
   * IMPORTANT :
   * On vérifie uniquement les rendez-vous du coiffeur sélectionné.
   *
   * Un rendez-vous d'Abdou ne bloque donc jamais Rayen.
   */
  const busy = getBusySlotsForStaffDate(
    staffId,
    date
  );

  // Vérification sur toute la durée du nouveau service.
  const conflict = busy.some((busySlot) =>
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
 * Nombre de clients ayant un rendez-vous avant celui demandé.
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
 * Retourne les rendez-vous confirmés d'un coiffeur
 * pour une journée complète.
 *
 * IMPORTANT :
 * Le filtre porte uniquement sur la date.
 * Il n'y a volontairement AUCUN filtre sur l'heure.
 *
 * Ainsi :
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