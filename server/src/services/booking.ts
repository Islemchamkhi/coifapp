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
  clientId?: number | null;
}

export interface BookingConfirmation {
  appointment: Appointment;
  service: ServiceRow;
  staff: Staff;
  clientsBefore: number;
  estimatedTime: string;
}

/**
 * ============================================================
 * CRÉATION D'UNE RÉSERVATION
 * ============================================================
 *
 * Règles :
 *
 * Lundi -> Vendredi
 * 09:00 -> 20:00 : confirmed
 * 20:00 -> 21:00 : pending
 *
 * Samedi -> Dimanche
 * 09:00 -> 22:00 : confirmed
 *
 * IMPORTANT :
 *
 * La disponibilité est calculée sur TOUTE la durée du service.
 *
 * Exemple :
 *
 * réservation existante :
 * 17:30 -> 17:50
 *
 * nouvelle réservation :
 * 17:55 -> 18:15
 *
 * => AUTORISÉE
 *
 * nouvelle réservation :
 * 17:45 -> 18:05
 *
 * => REFUSÉE
 */
export function createBooking(
  input: CreateBookingInput
): BookingConfirmation {
  /**
   * ==========================================================
   * COIFFEUR
   * ==========================================================
   */

  const staff = db
    .prepare(
      `
      SELECT *
      FROM staff
      WHERE id = ?
        AND active = 1
      `
    )
    .get(input.staffId) as Staff | undefined;

  if (!staff) {
    throw new BookingError(
      "STAFF_NOT_FOUND",
      "Coiffeur introuvable."
    );
  }

  /**
   * ==========================================================
   * SERVICE
   * ==========================================================
   */

  const service = db
    .prepare(
      `
      SELECT *
      FROM services
      WHERE id = ?
        AND active = 1
      `
    )
    .get(input.serviceId) as ServiceRow | undefined;

  if (!service) {
    throw new BookingError(
      "SERVICE_NOT_FOUND",
      "Service introuvable."
    );
  }

  /**
   * ==========================================================
   * INFORMATIONS CLIENT
   * ==========================================================
   */

  const clientName = input.clientName?.trim();
  const clientPhone = input.clientPhone?.trim();

  if (!clientName || !clientPhone) {
    throw new BookingError(
      "MISSING_CLIENT_INFO",
      "Nom et téléphone requis."
    );
  }

  /**
   * Vérification basique de l'heure.
   */

  if (!/^\d{2}:\d{2}$/.test(input.time)) {
    throw new BookingError(
      "INVALID_TIME",
      "Heure invalide."
    );
  }

  /**
   * Vérifier que l'heure peut être transformée
   * correctement en minutes.
   */

  const startMinutes = toMinutes(input.time);

  if (
    !Number.isFinite(startMinutes) ||
    startMinutes < 0 ||
    startMinutes >= 24 * 60
  ) {
    throw new BookingError(
      "INVALID_TIME",
      "Heure invalide."
    );
  }

  /**
   * Durée complète du service.
   */

  const durationMinutes = service.duration_minutes;

  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    throw new BookingError(
      "INVALID_SERVICE_DURATION",
      "La durée du service est invalide."
    );
  }

  const endMinutes =
    startMinutes + durationMinutes;

  const endTime =
    toHHMM(endMinutes);

  /**
   * ==========================================================
   * TRANSACTION
   * ==========================================================
   *
   * Toutes les vérifications critiques et l'INSERT
   * sont effectués dans la même transaction.
   */

  const run = db.transaction(() => {
    /**
     * ========================================================
     * ÉTAPE 1
     * Vérification générale de disponibilité.
     * ========================================================
     *
     * Cette vérification regarde :
     * - jour fermé
     * - date passée
     * - délai minimum
     * - horaires du salon
     * - durée complète
     * - conflits
     *
     * IMPORTANT :
     * elle accepte désormais une heure personnalisée.
     *
     * Exemple :
     * service 20 min
     * 17:55 -> 18:15
     *
     * est accepté si toute la période est libre.
     */

    const stillAvailable =
      isSlotStillAvailable(
        input.staffId,
        input.date,
        input.time,
        durationMinutes
      );

    if (!stillAvailable) {
      throw new BookingError(
        "SLOT_UNAVAILABLE",
        "Ce créneau n'est plus disponible. Merci d'en choisir un autre."
      );
    }

    /**
     * ========================================================
     * ÉTAPE 2
     * VÉRIFICATION FINALE DIRECTEMENT EN BASE
     * ========================================================
     *
     * On vérifie une deuxième fois les périodes occupées
     * juste avant l'INSERT.
     *
     * Condition de conflit :
     *
     * existing.start < new.end
     * ET
     * existing.end > new.start
     *
     * Exemple :
     *
     * EXISTANT 17:30 -> 17:50
     *
     * NOUVEAU 17:50 -> 18:10
     *
     * => PAS de conflit
     *
     * ---------------------------------
     *
     * EXISTANT 17:30 -> 17:50
     *
     * NOUVEAU 17:45 -> 18:05
     *
     * => CONFLIT
     */

    const conflictingAppointment =
      db
        .prepare(
          `
          SELECT id
          FROM appointments
          WHERE staff_id = ?
            AND date = ?
            AND status IN (
              'confirmed',
              'pending',
              'blocked'
            )
            AND start_time < ?
            AND end_time > ?
          LIMIT 1
          `
        )
        .get(
          input.staffId,
          input.date,
          endTime,
          input.time
        ) as { id: string } | undefined;

    if (conflictingAppointment) {
      throw new BookingError(
        "SLOT_UNAVAILABLE",
        "Ce créneau vient d'être réservé ou chevauche un autre rendez-vous. Merci d'en choisir un autre."
      );
    }

    /**
     * ========================================================
     * ÉTAPE 3
     * TYPE DE RÉSERVATION
     * ========================================================
     *
     * Semaine :
     * 20:00 -> 21:00 = pending
     *
     * Sinon = confirmed
     */

    const exceptional =
      isExceptionalSlot(
        input.date,
        input.time,
        durationMinutes
      );

    const status =
      exceptional
        ? "pending"
        : "confirmed";

    /**
     * ========================================================
     * ÉTAPE 4
     * INSERT
     * ========================================================
     */

    const id = uuidv4();

    // Par défaut (réservation SANS compte / invité) :
    // accountClientId reste null, et finalClientName/
    // finalClientPhone restent les valeurs saisies
    // dans le formulaire.

    let accountClientId: number | null =
      input.clientId ?? null;

    let finalClientName = clientName;
    let finalClientPhone = clientPhone;

    if (accountClientId !== null) {
      const client = db
        .prepare(
          "SELECT id, name, phone FROM clients WHERE id = ?"
        )
        .get(accountClientId) as
        | {
            id: number;
            name: string;
            phone: string;
          }
        | undefined;

      if (!client) {
        // Le token JWT est valide mais le compte auquel
        // il fait référence n'existe plus.
        //
        // On bascule simplement en mode invité afin
        // de ne pas bloquer la réservation.

        accountClientId = null;
      } else {
        // Pour un compte connecté valide, les coordonnées
        // de la réservation proviennent toujours du compte
        // validé côté serveur.

        accountClientId = client.id;
        finalClientName = client.name;
        finalClientPhone = client.phone;
      }
    }

    try {
      db.prepare(
        `
        INSERT INTO appointments
        (
          id,
          staff_id,
          service_id,
          date,
          start_time,
          end_time,
          client_name,
          client_phone,
          client_id,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        id,
        input.staffId,
        input.serviceId,
        input.date,
        input.time,
        endTime,
        finalClientName,
        finalClientPhone,
        accountClientId,
        status
      );
    } catch (err) {
      /**
       * Filet de sécurité supplémentaire.
       *
       * Si la DB possède un index/contrainte UNIQUE,
       * on transforme également l'erreur en SLOT_UNAVAILABLE.
       */

      if (
        err instanceof Error &&
        /UNIQUE constraint failed/i.test(
          err.message
        )
      ) {
        throw new BookingError(
          "SLOT_UNAVAILABLE",
          "Ce créneau vient d'être réservé. Merci d'en choisir un autre."
        );
      }

      throw err;
    }

    /**
     * ========================================================
     * ÉTAPE 5
     * RÉCUPÉRATION DU RENDEZ-VOUS CRÉÉ
     * ========================================================
     */

    const appointment =
      db
        .prepare(
          `
          SELECT *
          FROM appointments
          WHERE id = ?
          `
        )
        .get(id) as Appointment;

    if (!appointment) {
      throw new BookingError(
        "BOOKING_CREATE_FAILED",
        "Impossible de créer le rendez-vous."
      );
    }

    /**
     * ========================================================
     * ÉTAPE 6 BIS
     * NOTIFICATION ADMIN
     * ========================================================
     *
     * Créée dans la même transaction que le rendez-vous.
     */

    const notificationId = uuidv4();

    db.prepare(
      `
      INSERT INTO notifications
      (
        id,
        type,
        appointment_id,
        title,
        message,
        date,
        start_time,
        client_name,
        service_name_fr,
        staff_name
      )
      VALUES (?, 'new_booking', ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      notificationId,
      appointment.id,
      "Nouvelle réservation",
      `${finalClientName} — ${service.name_fr} (${durationMinutes} min) avec ${staff.name} le ${input.date} à ${input.time}`,
      appointment.date,
      appointment.start_time,
      finalClientName,
      service.name_fr,
      staff.name
    );

    /**
     * ========================================================
     * ÉTAPE 7
     * NOMBRE DE CLIENTS AVANT
     * ========================================================
     */

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

  /**
   * ==========================================================
   * EXÉCUTION
   * ==========================================================
   */

  const {
    appointment,
    clientsBefore,
  } = run();

  /**
   * ==========================================================
   * CONFIRMATION
   * ==========================================================
   */

  return {
    appointment,
    service,
    staff,
    clientsBefore,
    estimatedTime:
      appointment.start_time,
  };
}