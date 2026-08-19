import { v4 as uuidv4 } from "uuid";
import { db } from "../db.js";
import { Appointment, ServiceRow, Staff } from "../types.js";
import {
  isSlotStillAvailable,
  countClientsBefore,
  isExceptionalSlot,
} from "./availability.js";
import { toMinutes, toHHMM } from "../lib/time.js";

export class BookingError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface CreateBookingInput {
  staffId: number;
  serviceId: number;
  date: string;
  time: string;
  clientName: string;
  clientPhone: string;
}

export interface BookingConfirmation {
  appointment: Appointment;
  service: ServiceRow;
  staff: Staff;
  clientsBefore: number;
  estimatedTime: string;
}

/**
 * Crée un rendez-vous de façon atomique.
 *
 * Règles :
 *
 * Lundi -> Vendredi
 * 08:00 -> 20:00 : confirmed
 * 20:00 -> 21:00 : pending
 *
 * Samedi -> Dimanche
 * 08:00 -> 22:00 : confirmed
 *
 * La validation de l'horaire et de la durée complète
 * du service est effectuée par isSlotStillAvailable().
 */
export function createBooking(
  input: CreateBookingInput
): BookingConfirmation {
  const staff = db
    .prepare(
      "SELECT * FROM staff WHERE id = ? AND active = 1"
    )
    .get(input.staffId) as Staff | undefined;

  if (!staff) {
    throw new BookingError(
      "STAFF_NOT_FOUND",
      "Coiffeur introuvable."
    );
  }

  const service = db
    .prepare(
      "SELECT * FROM services WHERE id = ? AND active = 1"
    )
    .get(input.serviceId) as ServiceRow | undefined;

  if (!service) {
    throw new BookingError(
      "SERVICE_NOT_FOUND",
      "Service introuvable."
    );
  }

  if (
    !input.clientName?.trim() ||
    !input.clientPhone?.trim()
  ) {
    throw new BookingError(
      "MISSING_CLIENT_INFO",
      "Nom et téléphone requis."
    );
  }

  const run = db.transaction(() => {
    /**
     * Vérification backend de la disponibilité.
     *
     * Cette fonction vérifie également :
     * - les horaires du salon ;
     * - la durée complète du service ;
     * - le coiffeur ;
     * - les chevauchements ;
     * - le délai minimum ;
     * - le pas correspondant à la durée.
     */
    const stillAvailable =
      isSlotStillAvailable(
        input.staffId,
        input.date,
        input.time,
        service.duration_minutes
      );

    if (!stillAvailable) {
      throw new BookingError(
        "SLOT_UNAVAILABLE",
        "Ce créneau vient d'être réservé ou n'est plus disponible. Merci d'en choisir un autre."
      );
    }

    const startMinutes =
      toMinutes(input.time);

    const endTime =
      toHHMM(
        startMinutes +
          service.duration_minutes
      );

    /**
     * Détermine si le créneau correspond
     * à une demande exceptionnelle.
     *
     * Semaine :
     * 20:00 -> 21:00 = pending
     *
     * Tout le reste = confirmed.
     */
    const exceptional =
      isExceptionalSlot(
        input.date,
        input.time,
        service.duration_minutes
      );

    const status = exceptional
      ? "pending"
      : "confirmed";

    const id = uuidv4();

    try {
      db.prepare(
        `INSERT INTO appointments
          (
            id,
            staff_id,
            service_id,
            date,
            start_time,
            end_time,
            client_name,
            client_phone,
            status
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.staffId,
        input.serviceId,
        input.date,
        input.time,
        endTime,
        input.clientName.trim(),
        input.clientPhone.trim(),
        status
      );
    } catch (err) {
      /**
       * Filet de sécurité :
       * l'index unique en base peut intercepter
       * une course concurrente.
       */
      if (
        err instanceof Error &&
        /UNIQUE constraint failed/i.test(
          err.message
        )
      ) {
        throw new BookingError(
          "SLOT_UNAVAILABLE",
          "Ce créneau vient d'être réservé ou n'est plus disponible. Merci d'en choisir un autre."
        );
      }

      throw err;
    }

    const appointment =
      db
        .prepare(
          "SELECT * FROM appointments WHERE id = ?"
        )
        .get(id) as Appointment;

    const clientsBefore =
      countClientsBefore(
        input.staffId,
        input.date,
        input.time
      );

    return {
      appointment,
      clientsBefore,
    };
  });

  const {
    appointment,
    clientsBefore,
  } = run();

  return {
    appointment,
    service,
    staff,
    clientsBefore,

    // L'estimation correspond à l'heure demandée.
    estimatedTime:
      appointment.start_time,
  };
}