import { db } from "../db.js";
import { Appointment } from "../types.js";
import {
  WORK_WINDOWS,
  SLOT_STEP_MINUTES,
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
 * Un rendez-vous confirmé reste occupé même lorsque son heure est passée.
 * Il n'est jamais supprimé automatiquement.
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
 * Calcule les créneaux disponibles pour un client.
 *
 * Règles :
 * - Un jour fermé ne propose aucun créneau.
 * - Une date passée ne propose aucun créneau.
 * - Aujourd'hui, les créneaux déjà passés ne sont pas proposés.
 * - BOOKING_MIN_LEAD_MINUTES est respecté.
 * - Les rendez-vous existants bloquent leur période.
 *
 * IMPORTANT :
 * Cette fonction ne modifie JAMAIS la base de données.
 * Elle ne supprime et n'annule aucun rendez-vous.
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

  const busy = getBusySlotsForStaffDate(staffId, date);

  const isToday = date === today;

  const now = nowInSalonTz();
  const nowMinutes = now.hour() * 60 + now.minute();

  const minimumStart =
    nowMinutes + BOOKING_MIN_LEAD_MINUTES;

  const slots: string[] = [];

  for (const window of WORK_WINDOWS) {
    for (
      let start = window.start;
      start + durationMinutes <= window.end;
      start += SLOT_STEP_MINUTES
    ) {
      // Pour aujourd'hui :
      // on empêche uniquement les NOUVELLES réservations
      // sur les horaires trop proches ou déjà passés.
      if (isToday && start < minimumStart) {
        continue;
      }

      const end = start + durationMinutes;

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
 * Calcule TOUS les créneaux valides de la journée (disponibles ET réservés),
 * pour affichage côté client.
 *
 * Différence avec computeAvailableSlots :
 * - computeAvailableSlots ne renvoie QUE les créneaux libres.
 * - computeSlotsWithStatus renvoie aussi les créneaux occupés par un
 *   rendez-vous existant, avec le statut "booked", SANS jamais exposer
 *   d'information sur le client qui a réservé (nom, téléphone, etc.) :
 *   seules les heures de début/fin sont utilisées (cf. getBusySlotsForStaffDate).
 *
 * Les règles de fenêtre horaire, jour fermé, date passée et délai minimum
 * pour aujourd'hui restent identiques à computeAvailableSlots : un créneau
 * déjà passé aujourd'hui n'est pas affiché (il ne serait de toute façon
 * plus réservable), qu'il soit occupé ou non.
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

  const busy = getBusySlotsForStaffDate(staffId, date);

  const isToday = date === today;

  const now = nowInSalonTz();
  const nowMinutes = now.hour() * 60 + now.minute();

  const minimumStart = nowMinutes + BOOKING_MIN_LEAD_MINUTES;

  const result: SlotWithStatus[] = [];

  for (const window of WORK_WINDOWS) {
    for (
      let start = window.start;
      start + durationMinutes <= window.end;
      start += SLOT_STEP_MINUTES
    ) {
      if (isToday && start < minimumStart) {
        continue;
      }

      const end = start + durationMinutes;

      const conflict = busy.some((busySlot) =>
        overlaps(start, end, busySlot.start, busySlot.end)
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
 * Cette fonction vérifie uniquement la possibilité de CRÉER
 * une nouvelle réservation.
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

  // Le créneau doit être entièrement dans les horaires d'ouverture.
  const withinWindow = WORK_WINDOWS.some(
    (window) =>
      start >= window.start &&
      end <= window.end
  );

  if (!withinWindow) {
    return false;
  }

  // Pour aujourd'hui, empêcher une nouvelle réservation
  // trop proche ou déjà passée.
  if (date === today) {
    const now = nowInSalonTz();
    const nowMinutes = now.hour() * 60 + now.minute();

    if (
      start <
      nowMinutes + BOOKING_MIN_LEAD_MINUTES
    ) {
      return false;
    }
  }

  // Vérifier les rendez-vous existants.
  const busy = getBusySlotsForStaffDate(
    staffId,
    date
  );

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
 * On compte uniquement les rendez-vous confirmés.
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
 * à 14:21 → toujours visible
 * à 15:00 → toujours visible
 * à 18:00 → toujours visible
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