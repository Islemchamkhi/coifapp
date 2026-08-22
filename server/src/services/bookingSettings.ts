import { db } from "../db.js";

export type BookingMode = "interval" | "flexible";

export const VALID_INTERVALS = [5, 10, 15, 30] as const;

export interface BookingSettings {
  bookingMode: BookingMode;
  bookingIntervalMinutes: number;
}

interface BookingSettingsRow {
  booking_mode: string;
  booking_interval_minutes: number;
}

const DEFAULT_SETTINGS: BookingSettings = {
  bookingMode: "interval",
  bookingIntervalMinutes: 5,
};

/**
 * ============================================================
 * LECTURE DES PARAMÈTRES DE RÉSERVATION
 * ============================================================
 *
 * Toujours une lecture fraîche en base (pas de cache en mémoire) :
 * la config peut être modifiée par l'admin à tout moment, et ce
 * n'est pas un chemin assez chaud pour justifier un cache.
 */
export function getBookingSettings(): BookingSettings {
  const row = db
    .prepare(
      `
      SELECT booking_mode, booking_interval_minutes
      FROM booking_settings
      WHERE id = 1
      `
    )
    .get() as BookingSettingsRow | undefined;

  if (!row) {
    return DEFAULT_SETTINGS;
  }

  const bookingMode: BookingMode =
    row.booking_mode === "flexible" ? "flexible" : "interval";

  return {
    bookingMode,
    bookingIntervalMinutes: row.booking_interval_minutes,
  };
}

export class BookingSettingsError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * ============================================================
 * MISE À JOUR (admin uniquement)
 * ============================================================
 */
export function updateBookingSettings(input: {
  bookingMode: string;
  bookingIntervalMinutes: number;
}): BookingSettings {
  if (input.bookingMode !== "interval" && input.bookingMode !== "flexible") {
    throw new BookingSettingsError(
      "INVALID_BOOKING_MODE",
      "Le mode de réservation doit être 'interval' ou 'flexible'."
    );
  }

  if (
    !VALID_INTERVALS.includes(
      input.bookingIntervalMinutes as (typeof VALID_INTERVALS)[number]
    )
  ) {
    throw new BookingSettingsError(
      "INVALID_INTERVAL",
      "L'intervalle doit être 5, 10, 15 ou 30 minutes."
    );
  }

  db.prepare(
    `
    UPDATE booking_settings
    SET
      booking_mode = ?,
      booking_interval_minutes = ?,
      updated_at = datetime('now')
    WHERE id = 1
    `
  ).run(input.bookingMode, input.bookingIntervalMinutes);

  return getBookingSettings();
}