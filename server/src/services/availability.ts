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
 *
 * Ces fonctions sont la SEULE source de vérité pour tout calcul
 * de période de réservation dans l'application (frontend ET
 * backend passent par la même logique côté serveur — le
 * frontend ne fait qu'un affichage, jamais une décision finale).
 */

/**
 * calculateReservationEnd
 * ------------------------------------------------------------
 * heure de fin = heure de début + durée réelle du service.
 *
 * Aucun arrondi, aucune dépendance à une grille de créneaux.
 * `start` et le résultat sont exprimés en minutes depuis minuit.
 */
export function calculateReservationEnd(
  start: number,
  durationMinutes: number
): number {
  return start + durationMinutes;
}

/**
 * hasTimeOverlap
 * ------------------------------------------------------------
 * Vraie logique d'intersection entre deux périodes [aStart,aEnd)
 * et [bStart,bEnd). Deux réservations qui se touchent exactement
 * (aEnd === bStart) ne sont PAS en conflit — c'est le comparateur
 * strict (<, >) qui garantit ce comportement.
 *
 * Réutilise `overlaps()` de lib/time.ts (déjà exact et déjà
 * utilisé ailleurs dans l'app) plutôt que de dupliquer la même
 * comparaison à deux endroits différents.
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
 * PAS DE LA GRILLE (mode "interval")
 * ============================================================
 *
 * Configurable par salon via booking_settings.
 * Par défaut : 5 minutes (comportement historique inchangé).
 *
 * IMPORTANT : ce pas ne sert QU'à générer la liste de créneaux
 * affichés dans la grille. Il n'a aucune influence sur la
 * validation réelle d'une réservation (voir isSlotAvailable /
 * validateBookingTime), qui accepte toujours n'importe quelle
 * minute valide — y compris en mode "interval".
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
      (window) => start >= window.start && end <= window.end
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

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return false;
  }

  const start = toMinutes(startTime);
  const end = calculateReservationEnd(start, durationMinutes);

  const windows = getBookingWindows(date);
  const window = getWindowForSlot(windows, start, end);

  return window?.type === "request";
}

/**
 * ============================================================
 * VÉRIFICATION DE CHEVAUCHEMENT (contre une liste de créneaux)
 * ============================================================
 *
 * C'est LA règle principale, appliquée partout dans l'app.
 *
 * Nouveau rendez-vous :     [newStart, newEnd]
 * Rendez-vous existant :    [busyStart, busyEnd]
 *
 * Il y a conflit uniquement si :
 *
 *     newStart < busyEnd  ET  newEnd > busyStart
 *
 * Exemples :
 *
 * 16:40 -> 17:10  contre  17:10 -> 17:40   => PAS de conflit
 *                                             (elles se touchent,
 *                                              c'est autorisé)
 *
 * 16:35 -> 17:05  contre  16:50 -> 17:20   => CONFLIT
 *                                             (16:35 empiète bien
 *                                              sur le rendez-vous
 *                                              de 16:50 car le
 *                                              SERVICE CHOISI dure
 *                                              assez longtemps
 *                                              pour l'atteindre —
 *                                              ce n'est PAS un bug,
 *                                              c'est le calcul
 *                                              correct)
 */
export function hasConflict(
  start: number,
  end: number,
  busySlots: BusySlot[]
): boolean {
  return busySlots.some((busySlot) =>
    hasTimeOverlap(start, end, busySlot.start, busySlot.end)
  );
}

/**
 * ============================================================
 * VALIDATION D'UNE HEURE DE DÉBUT
 * ============================================================
 *
 * Regroupe toutes les vérifications de format/plage/fenêtre qui
 * ne dépendent PAS des rendez-vous déjà pris. Utilisée aussi
 * bien pour le mode grille que pour le mode heure libre : les
 * deux modes valident exactement la même chose côté serveur.
 *
 * Ne vérifie PAS les chevauchements (voir isSlotAvailable pour
 * la validation complète).
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
    return { valid: false, start: -1, end: -1, window: null, reason: "CLOSED_DAY" };
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { valid: false, start: -1, end: -1, window: null, reason: "INVALID_DURATION" };
  }

  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    return { valid: false, start: -1, end: -1, window: null, reason: "INVALID_TIME_FORMAT" };
  }

  const start = toMinutes(startTime);

  if (!Number.isFinite(start) || start < 0 || start >= 24 * 60) {
    return { valid: false, start: -1, end: -1, window: null, reason: "INVALID_TIME_RANGE" };
  }

  const end = calculateReservationEnd(start, durationMinutes);

  const today = todayInSalonTz();

  if (date < today) {
    return { valid: false, start, end, window: null, reason: "PAST_DATE" };
  }

  /**
   * Le service complet (début -> fin réelle) doit tenir entièrement
   * dans une seule fenêtre d'ouverture. Un service qui déborderait
   * après la fermeture n'est jamais proposé (cf. point 10 du cahier
   * des charges : dernier créneau possible = fermeture - durée).
   */
  const windows = getBookingWindows(date);
  const window = getWindowForSlot(windows, start, end);

  if (!window) {
    return { valid: false, start, end, window: null, reason: "OUTSIDE_OPENING_HOURS" };
  }

  if (date === today) {
    const now = nowInSalonTz();
    const nowMinutes = now.hour() * 60 + now.minute();

    if (start < nowMinutes + BOOKING_MIN_LEAD_MINUTES) {
      return { valid: false, start, end, window, reason: "TOO_SOON" };
    }
  }

  return { valid: true, start, end, window };
}

/**
 * ============================================================
 * DISPONIBILITÉ D'UN CRÉNEAU PRÉCIS (backend, source de vérité)
 * ============================================================
 *
 * Accepte N'IMPORTE QUELLE minute valide (ex. 19:23), que le
 * salon soit en mode "interval" ou "flexible" — le mode ne
 * change QUE ce que le frontend propose visuellement, jamais ce
 * que le backend accepte de valider.
 *
 * Cette fonction DOIT être appelée au moment de créer une
 * réservation. Le frontend ne suffit jamais pour garantir la
 * disponibilité (double-booking).
 */
export function isSlotAvailable(
  staffId: number,
  date: string,
  startTime: string,
  durationMinutes: number,
  excludeAppointmentId?: string
): boolean {
  const validation = validateBookingTime(date, startTime, durationMinutes);

  if (!validation.valid) {
    return false;
  }

  const busy = getBusySlotsForStaffDate(staffId, date, excludeAppointmentId);

  return !hasConflict(validation.start, validation.end, busy);
}

/**
 * Alias conservé pour compatibilité : c'est le nom utilisé par
 * booking.ts avant ce refactor. Même comportement, même signature
 * (sans le paramètre optionnel, non utilisé côté création).
 */
export function isSlotStillAvailable(
  staffId: number,
  date: string,
  startTime: string,
  durationMinutes: number
): boolean {
  return isSlotAvailable(staffId, date, startTime, durationMinutes);
}

/**
 * ============================================================
 * GÉNÉRATION DES CRÉNEAUX (mode "interval")
 * ============================================================
 *
 * Construit la grille affichée au client : uniquement les heures
 * de début espacées de `stepMinutes` (configurable par salon,
 * 5 par défaut) pour lesquelles le service ENTIER tient dans les
 * horaires d'ouverture ET ne chevauche aucun rendez-vous existant.
 *
 * `stepMinutes` est un paramètre explicite (plutôt que lu en
 * dur) pour rester testable et réutilisable indépendamment de la
 * config actuellement stockée en base.
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

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
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

  const slots: string[] = [];
  const windows = getBookingWindows(date);

  for (const window of windows) {
    for (
      let start = window.start;
      start + durationMinutes <= window.end;
      start += stepMinutes
    ) {
      if (isToday && start < minimumStart) {
        continue;
      }

      const end = calculateReservationEnd(start, durationMinutes);

      if (end > window.end) {
        continue;
      }

      if (hasConflict(start, end, busy)) {
        continue;
      }

      slots.push(toHHMM(start));
    }
  }

  return slots;
}

/**
 * Alias conservé pour compatibilité (ancien nom, même
 * comportement — utilise désormais le pas configuré par salon
 * au lieu d'une valeur figée à 5).
 */
export function computeAvailableSlots(
  staffId: number,
  date: string,
  durationMinutes: number
): string[] {
  return generateAvailableSlots(staffId, date, durationMinutes);
}

/**
 * ============================================================
 * STATUT DES CRÉNEAUX
 * ============================================================
 */

export type SlotStatus = "available" | "booked" | "request";

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
 * booked = vrai chevauchement (calculé sur la période réelle du
 *          service actuellement sélectionné, pas sur celle du
 *          rendez-vous existant)
 *
 * request = créneau libre mais situé dans la période
 *           exceptionnelle 20:00 -> 21:00
 *
 * available = créneau libre dans les horaires normaux.
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

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
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
  const windows = getBookingWindows(date);

  for (const window of windows) {
    for (
      let start = window.start;
      start + durationMinutes <= window.end;
      start += stepMinutes
    ) {
      if (isToday && start < minimumStart) {
        continue;
      }

      const end = calculateReservationEnd(start, durationMinutes);

      if (end > window.end) {
        continue;
      }

      const conflict = hasConflict(start, end, busy);

      if (conflict) {
        result.push({
          time: toHHMM(start),
          status: "booked",
          isExceptional: window.type === "request",
        });

        continue;
      }

      result.push({
        time: toHHMM(start),
        status: window.type === "request" ? "request" : "available",
        isExceptional: window.type === "request",
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
    .get(staffId, date, startTime) as { c: number };

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
    .all(staffId, date) as Appointment[];
}