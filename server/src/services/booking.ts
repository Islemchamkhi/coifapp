import { v4 as uuidv4 } from "uuid";
import { db } from "../db.js";
import { Appointment, ServiceRow, Staff } from "../types.js";
import { isSlotStillAvailable, countClientsBefore } from "./availability.js";
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
 * Crée un rendez-vous de façon atomique. better-sqlite3 est synchrone : toute
 * la transaction (vérif de dispo + insertion) s'exécute sans interruption
 * possible par une autre requête concurrente sur ce process, ce qui empêche
 * tout chevauchement en pratique (double-booking).
 */
export function createBooking(input: CreateBookingInput): BookingConfirmation {
  const staff = db.prepare("SELECT * FROM staff WHERE id = ? AND active = 1").get(input.staffId) as
    | Staff
    | undefined;
  if (!staff) throw new BookingError("STAFF_NOT_FOUND", "Coiffeur introuvable.");

  const service = db
    .prepare("SELECT * FROM services WHERE id = ? AND active = 1")
    .get(input.serviceId) as ServiceRow | undefined;
  if (!service) throw new BookingError("SERVICE_NOT_FOUND", "Service introuvable.");

  if (!input.clientName?.trim() || !input.clientPhone?.trim()) {
    throw new BookingError("MISSING_CLIENT_INFO", "Nom et téléphone requis.");
  }

  const run = db.transaction(() => {
    const stillAvailable = isSlotStillAvailable(
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

    const startMinutes = toMinutes(input.time);
    const endTime = toHHMM(startMinutes + service.duration_minutes);
    const id = uuidv4();

    try {
      db.prepare(
        `INSERT INTO appointments
          (id, staff_id, service_id, date, start_time, end_time, client_name, client_phone, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')`
      ).run(
        id,
        input.staffId,
        input.serviceId,
        input.date,
        input.time,
        endTime,
        input.clientName.trim(),
        input.clientPhone.trim()
      );
    } catch (err) {
      // Filet de sécurité : l'index unique en base a intercepté une course
      // concurrente que la vérification ci-dessus n'aurait pas eu le temps de voir.
      if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
        throw new BookingError(
          "SLOT_UNAVAILABLE",
          "Ce créneau vient d'être réservé ou n'est plus disponible. Merci d'en choisir un autre."
        );
      }
      throw err;
    }

    const appointment = db.prepare("SELECT * FROM appointments WHERE id = ?").get(id) as Appointment;
    const clientsBefore = countClientsBefore(input.staffId, input.date, input.time);

    return { appointment, clientsBefore };
  });

  const { appointment, clientsBefore } = run();

  return {
    appointment,
    service,
    staff,
    clientsBefore,
    // L'estimation de passage correspond à l'heure planifiée : le système
    // garantit déjà l'absence de chevauchement, donc l'heure du rdv EST
    // l'estimation de passage.
    estimatedTime: appointment.start_time,
  };
}