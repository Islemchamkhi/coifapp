import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

// Le salon est à Tunis : toute notion de "maintenant" côté serveur DOIT passer
// par ce fuseau, quel que soit le fuseau système de l'hébergeur (souvent UTC).
export const SALON_TIMEZONE = "Africa/Tunis";

/** Heure actuelle, garantie dans le fuseau du salon (Africa/Tunis). */
export function nowInSalonTz() {
  return dayjs().tz(SALON_TIMEZONE);
}

/** Date du jour (YYYY-MM-DD) dans le fuseau du salon. */
export function todayInSalonTz(): string {
  return nowInSalonTz().format("YYYY-MM-DD");
}

// Salon working windows (minutes since midnight), Tuesday -> Sunday. Monday closed.
export const WORK_WINDOWS = [
  { start: 9 * 60, end: 13 * 60 }, // 09:00 - 13:00
  { start: 14 * 60, end: 20 * 60 }, // 14:00 - 20:00 (13:00-14:00 = pause auto-bloquée)
];

export const SLOT_STEP_MINUTES = 10;
export const BOOKING_MIN_LEAD_MINUTES = 10; // marge mini avant un rdv "aujourd'hui"

// JS Date#getDay(): Sun=0, Mon=1, Tue=2 ... Sat=6
export function isClosedDay(dateStr: string): boolean {
  const day = dayjs(dateStr, "YYYY-MM-DD").day();
  return day === 1; // Lundi fermé
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

export function isValidDateStr(dateStr: string): boolean {
  return dayjs(dateStr, "YYYY-MM-DD", true).isValid();
}