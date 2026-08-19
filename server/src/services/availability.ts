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

export function getBusySlotsForStaffDate(staffId: number, date: string): BusySlot[] {
  const rows = db
    .prepare(
      `SELECT start_time, end_time FROM appointments
       WHERE staff_id = ? AND date = ? AND status IN ('confirmed', 'blocked')`
    )
    .all(staffId, date) as { start_time: string; end_time: string }[];

  return rows.map((r) => ({ start: toMinutes(r.start_time), end: toMinutes(r.end_time) }));
}

/**
 * Calcule tous les créneaux de début disponibles pour un coiffeur donné, une date
 * et une durée de service donnée. Prend en compte : jours fermés (lundi), pause
 * 13h-14h, chevauchements avec les rendez-vous existants, et l'heure actuelle si
 * la date demandée est aujourd'hui.
 */
export function computeAvailableSlots(
  staffId: number,
  date: string,
  durationMinutes: number
): string[] {
  if (isClosedDay(date)) return [];

  const today = todayInSalonTz();
  if (date < today) return []; // une date entièrement passée n'a plus aucun créneau

  const busy = getBusySlotsForStaffDate(staffId, date);
  const isToday = date === today;
  const now = nowInSalonTz();
  const nowMinutes = now.hour() * 60 + now.minute();

  const slots: string[] = [];

  for (const window of WORK_WINDOWS) {
    for (
      let start = window.start;
      start + durationMinutes <= window.end;
      start += SLOT_STEP_MINUTES
    ) {
      if (isToday && start < nowMinutes + BOOKING_MIN_LEAD_MINUTES) continue;

      const end = start + durationMinutes;
      const conflict = busy.some((b) => overlaps(start, end, b.start, b.end));
      if (!conflict) slots.push(toHHMM(start));
    }
  }

  return slots;
}

export function isSlotStillAvailable(
  staffId: number,
  date: string,
  startTime: string,
  durationMinutes: number
): boolean {
  if (isClosedDay(date)) return false;

  const today = todayInSalonTz();
  if (date < today) return false; // date entièrement passée

  const start = toMinutes(startTime);
  const end = start + durationMinutes;

  const withinWindow = WORK_WINDOWS.some((w) => start >= w.start && end <= w.end);
  if (!withinWindow) return false;

  const isToday = date === today;
  if (isToday) {
    const now = nowInSalonTz();
    const nowMinutes = now.hour() * 60 + now.minute();
    if (start < nowMinutes + BOOKING_MIN_LEAD_MINUTES) return false;
  }

  const busy = getBusySlotsForStaffDate(staffId, date);
  return !busy.some((b) => overlaps(start, end, b.start, b.end));
}

export function countClientsBefore(staffId: number, date: string, startTime: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM appointments
       WHERE staff_id = ? AND date = ? AND status = 'confirmed' AND start_time < ?`
    )
    .get(staffId, date, startTime) as { c: number };
  return row.c;
}

export function getUpcomingForStaffDate(staffId: number, date: string): Appointment[] {
  return db
    .prepare(
      `SELECT * FROM appointments WHERE staff_id = ? AND date = ? AND status = 'confirmed'
       ORDER BY start_time ASC`
    )
    .all(staffId, date) as Appointment[];
}