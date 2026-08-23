import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db.js";
import {
  requireClient,
  signClientToken,
  ClientAuthedRequest,
} from "../middleware/clientAuth.js";
import { Appointment, ServiceRow, Staff } from "../types.js";
import { isValidDateStr, toHHMM } from "../lib/time.js";
import {
  validateBookingTime,
  getBusySlotsForStaffDate,
  hasConflict,
  isExceptionalSlot,
  computeSlotsWithStatus,
} from "../services/availability.js";
import { BookingError } from "../services/booking.js";

const router = Router();

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizePhone(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeName(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * ============================================================
 * HEURE DE FERMETURE (pour messages d'erreur)
 * ============================================================
 *
 * Lundi -> Vendredi : fermeture à 21:00
 * Samedi -> Dimanche : fermeture à 22:00
 *
 * Ne duplique pas la logique de calcul des créneaux (elle
 * reste entièrement dans availability.ts) : sert uniquement
 * à afficher la bonne heure dans le message d'erreur.
 */
function closingTimeLabel(date: string): string {
  const day = new Date(`${date}T12:00:00`).getDay();
  const isWeekend = day === 0 || day === 6;
  return isWeekend ? "22:00" : "21:00";
}

/**
 * ============================================================
 * TRADUCTION DES ERREURS DE VALIDATION (validateBookingTime)
 * ============================================================
 *
 * Réutilise EXACTEMENT la même fonction de validation que le
 * reste du système (réservation invité, disponibilité,
 * modification admin) — voir services/availability.ts.
 */
function validationErrorResponse(
  reason: string | undefined,
  date: string
): { status: number; error: string; message: string } {
  switch (reason) {
    case "CLOSED_DAY":
      return {
        status: 400,
        error: "CLOSED_DAY",
        message: "Le salon est fermé ce jour-là.",
      };
    case "PAST_DATE":
      return {
        status: 400,
        error: "PAST_DATE",
        message:
          "Impossible de modifier une réservation à une date déjà passée.",
      };
    case "TOO_SOON":
      return {
        status: 400,
        error: "TOO_SOON",
        message:
          "Cet horaire est trop proche de l'heure actuelle. Merci de choisir un créneau plus tard.",
      };
    case "OUTSIDE_OPENING_HOURS":
      return {
        status: 400,
        error: "OUTSIDE_OPENING_HOURS",
        message: `Nous sommes désolés, ce service ne peut pas être réservé à cette heure car le salon ferme à ${closingTimeLabel(
          date
        )}.`,
      };
    case "INVALID_DURATION":
      return {
        status: 400,
        error: "INVALID_SERVICE_DURATION",
        message: "La durée du service est invalide.",
      };
    default:
      return {
        status: 400,
        error: "INVALID_TIME",
        message: "Heure invalide.",
      };
  }
}

function sanitizeClient(client: {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    email: client.email ?? "",
    createdAt: client.created_at,
    updatedAt: client.updated_at,
  };
}

/**
 * ============================================================
 * REGISTER
 * ============================================================
 *
 * POST /api/client-auth/register
 *
 * Crée un compte client.
 *
 * IMPORTANT :
 * Chaque nouveau compte créé génère également une
 * notification visible dans l'espace administrateur.
 */
router.post("/register", async (req, res) => {
  try {
    const name = normalizeName(req.body?.name);
    const phone = normalizePhone(req.body?.phone);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");

    // ---------------------------------------------------------
    // VALIDATION
    // ---------------------------------------------------------

    if (!name || !phone || !password) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message:
          "Nom, téléphone et mot de passe sont requis.",
      });
    }

    if (name.length < 2) {
      return res.status(400).json({
        error: "INVALID_NAME",
        message: "Le nom est invalide.",
      });
    }

    if (phone.length < 6) {
      return res.status(400).json({
        error: "INVALID_PHONE",
        message: "Le numéro de téléphone est invalide.",
      });
    }

    // -------------------------------------------------------
    // EMAIL (FACULTATIF)
    //
    // Tout le monde n'a pas d'adresse email, mais tout le
    // monde a un numéro de téléphone. L'email n'est donc
    // jamais obligatoire ; s'il est fourni, son format est
    // vérifié et il doit rester unique.
    // -------------------------------------------------------

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        error: "INVALID_EMAIL",
        message: "L'adresse email est invalide.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "WEAK_PASSWORD",
        message:
          "Le mot de passe doit contenir au moins 6 caractères.",
      });
    }

    // ---------------------------------------------------------
    // EMAIL UNIQUE (SEULEMENT SI FOURNI)
    // ---------------------------------------------------------

    if (email) {
      const existingByEmail = db
        .prepare(
          `
          SELECT id
          FROM clients
          WHERE email = ?
          LIMIT 1
          `
        )
        .get(email) as { id: number } | undefined;

      if (existingByEmail) {
        return res.status(409).json({
          error: "EMAIL_ALREADY_EXISTS",
          message:
            "Un compte existe déjà avec cette adresse email.",
        });
      }
    }

    // ---------------------------------------------------------
    // PHONE UNIQUE
    // ---------------------------------------------------------

    const existingByPhone = db
      .prepare(
        `
        SELECT id
        FROM clients
        WHERE phone = ?
        LIMIT 1
        `
      )
      .get(phone) as { id: number } | undefined;

    if (existingByPhone) {
      return res.status(409).json({
        error: "PHONE_ALREADY_EXISTS",
        message:
          "Un compte existe déjà avec ce numéro de téléphone.",
      });
    }

    // ---------------------------------------------------------
    // HASH PASSWORD
    // ---------------------------------------------------------

    const passwordHash = await bcrypt.hash(password, 12);

    // ---------------------------------------------------------
    // CREATE CLIENT
    // ---------------------------------------------------------

    const result = db
      .prepare(
        `
        INSERT INTO clients
        (
          name,
          phone,
          email,
          password_hash
        )
        VALUES (?, ?, ?, ?)
        `
      )
      .run(
        name,
        phone,
        email || null,
        passwordHash
      );

    const clientId = Number(result.lastInsertRowid);

    // ---------------------------------------------------------
    // NOTIFICATION ADMIN
    // ---------------------------------------------------------
    //
    // Chaque nouveau compte client crée une notification
    // dans l'espace administrateur.
    //
    // La notification ne doit jamais empêcher la création
    // du compte si son insertion rencontre un problème.
    // ---------------------------------------------------------

    try {
      db.prepare(
        `
        INSERT INTO notifications
        (
          type,
          title,
          message,
          created_at
        )
        VALUES (?, ?, ?, datetime('now'))
        `
      ).run(
        "client_registered",
        "Nouveau compte client",
        `${name} vient de créer un compte client.`
      );
    } catch (notificationError) {
      console.error(
        "❌ Client registration notification error:",
        notificationError
      );
    }

    // ---------------------------------------------------------
    // GET CREATED CLIENT
    // ---------------------------------------------------------

    const client = db
      .prepare(
        `
        SELECT
          id,
          name,
          phone,
          email,
          created_at,
          updated_at
        FROM clients
        WHERE id = ?
        LIMIT 1
        `
      )
      .get(clientId) as
      | {
          id: number;
          name: string;
          phone: string;
          email: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!client) {
      return res.status(500).json({
        error: "CLIENT_CREATE_FAILED",
        message:
          "Impossible de récupérer le compte créé.",
      });
    }

    // ---------------------------------------------------------
    // CREATE CLIENT TOKEN
    // ---------------------------------------------------------

    const token = signClientToken(client.id);

    return res.status(201).json({
      token,
      client: sanitizeClient(client),
    });
  } catch (error) {
    console.error(
      "❌ Client registration error:",
      error
    );

    if (
      error instanceof Error &&
      /UNIQUE constraint failed/i.test(error.message)
    ) {
      return res.status(409).json({
        error: "CLIENT_ALREADY_EXISTS",
        message:
          "Un compte existe déjà avec ces informations.",
      });
    }

    return res.status(500).json({
      error: "REGISTER_FAILED",
      message:
        "Impossible de créer le compte client.",
    });
  }
});

/**
 * ============================================================
 * LOGIN
 * ============================================================
 *
 * POST /api/client-auth/login
 *
 * Connexion avec email OU téléphone.
 */
router.post("/login", async (req, res) => {
  try {
    const identifierRaw = String(
      req.body?.identifier ??
        req.body?.email ??
        ""
    ).trim();

    const password = String(
      req.body?.password ?? ""
    );

    if (!identifierRaw || !password) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message:
          "Email/téléphone et mot de passe sont requis.",
      });
    }

    const identifierEmail =
      normalizeEmail(identifierRaw);

    const identifierPhone =
      normalizePhone(identifierRaw);

    const client = db
      .prepare(
        `
        SELECT
          id,
          name,
          phone,
          email,
          password_hash,
          created_at,
          updated_at
        FROM clients
        WHERE email = ?
           OR phone = ?
        LIMIT 1
        `
      )
      .get(
        identifierEmail,
        identifierPhone
      ) as
      | {
          id: number;
          name: string;
          phone: string;
          email: string | null;
          password_hash: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!client) {
      return res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message:
          "Email/téléphone ou mot de passe incorrect.",
      });
    }

    const validPassword =
      await bcrypt.compare(
        password,
        client.password_hash
      );

    if (!validPassword) {
      return res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message:
          "Email/téléphone ou mot de passe incorrect.",
      });
    }

    const token =
      signClientToken(client.id);

    return res.status(200).json({
      token,
      client: sanitizeClient(client),
    });
  } catch (error) {
    console.error(
      "❌ Client login error:",
      error
    );

    return res.status(500).json({
      error: "LOGIN_FAILED",
      message:
        "Impossible de se connecter.",
    });
  }
});

/**
 * ============================================================
 * CURRENT CLIENT
 * ============================================================
 *
 * GET /api/client-auth/me
 */
router.get(
  "/me",
  requireClient,
  (req: ClientAuthedRequest, res) => {
    try {
      const clientId = req.clientId;

      if (!clientId) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message:
            "Authentification client requise.",
        });
      }

      const client = db
        .prepare(
          `
          SELECT
            id,
            name,
            phone,
            email,
            created_at,
            updated_at
          FROM clients
          WHERE id = ?
          LIMIT 1
          `
        )
        .get(clientId) as
        | {
            id: number;
            name: string;
            phone: string;
            email: string;
            created_at: string;
            updated_at: string;
          }
        | undefined;

      if (!client) {
        return res.status(401).json({
          error: "CLIENT_NOT_FOUND",
          message:
            "Compte client introuvable.",
        });
      }

      return res.status(200).json({
        client: sanitizeClient(client),
      });
    } catch (error) {
      console.error(
        "❌ Client profile error:",
        error
      );

      return res.status(500).json({
        error: "PROFILE_FAILED",
        message:
          "Impossible de récupérer le compte client.",
      });
    }
  }
);

/**
 * ============================================================
 * UPDATE MY PROFILE
 * ============================================================
 *
 * PUT /api/client-auth/me
 */
router.put(
  "/me",
  requireClient,
  (req: ClientAuthedRequest, res) => {
    try {
      const clientId = req.clientId;

      if (!clientId) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message:
            "Authentification client requise.",
        });
      }

      const name = normalizeName(req.body?.name);
      const phone = normalizePhone(req.body?.phone);
      const email = normalizeEmail(req.body?.email);

      if (!name || !phone) {
        return res.status(400).json({
          error: "MISSING_FIELDS",
          message:
            "Nom et téléphone sont requis.",
        });
      }

      if (name.length < 2) {
        return res.status(400).json({
          error: "INVALID_NAME",
          message: "Le nom est invalide.",
        });
      }

      if (phone.length < 6) {
        return res.status(400).json({
          error: "INVALID_PHONE",
          message:
            "Le numéro de téléphone est invalide.",
        });
      }

      // -------------------------------------------------------
      // EMAIL (FACULTATIF)
      // -------------------------------------------------------

      if (
        email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        return res.status(400).json({
          error: "INVALID_EMAIL",
          message:
            "L'adresse email est invalide.",
        });
      }

      // -------------------------------------------------------
      // EMAIL UNIQUE (SEULEMENT SI FOURNI)
      // -------------------------------------------------------

      if (email) {
        const existingByEmail = db
          .prepare(
            `
            SELECT id
            FROM clients
            WHERE email = ?
              AND id != ?
            LIMIT 1
            `
          )
          .get(
            email,
            clientId
          ) as { id: number } | undefined;

        if (existingByEmail) {
          return res.status(409).json({
            error: "EMAIL_ALREADY_EXISTS",
            message:
              "Un compte existe déjà avec cette adresse email.",
          });
        }
      }

      // -------------------------------------------------------
      // PHONE UNIQUE
      // -------------------------------------------------------

      const existingByPhone = db
        .prepare(
          `
          SELECT id
          FROM clients
          WHERE phone = ?
            AND id != ?
          LIMIT 1
          `
        )
        .get(
          phone,
          clientId
        ) as { id: number } | undefined;

      if (existingByPhone) {
        return res.status(409).json({
          error: "PHONE_ALREADY_EXISTS",
          message:
            "Un compte existe déjà avec ce numéro de téléphone.",
        });
      }

      // -------------------------------------------------------
      // UPDATE
      // -------------------------------------------------------

      db.prepare(
        `
        UPDATE clients
        SET
          name = ?,
          phone = ?,
          email = ?,
          updated_at = datetime('now')
        WHERE id = ?
        `
      ).run(
        name,
        phone,
        email || null,
        clientId
      );

      const client = db
        .prepare(
          `
          SELECT
            id,
            name,
            phone,
            email,
            created_at,
            updated_at
          FROM clients
          WHERE id = ?
          LIMIT 1
          `
        )
        .get(clientId) as
        | {
            id: number;
            name: string;
            phone: string;
            email: string | null;
            created_at: string;
            updated_at: string;
          }
        | undefined;

      if (!client) {
        return res.status(401).json({
          error: "CLIENT_NOT_FOUND",
          message:
            "Compte client introuvable.",
        });
      }

      return res.status(200).json({
        client: sanitizeClient(client),
      });
    } catch (error) {
      console.error(
        "❌ Client profile update error:",
        error
      );

      if (
        error instanceof Error &&
        /UNIQUE constraint failed/i.test(
          error.message
        )
      ) {
        return res.status(409).json({
          error: "CLIENT_ALREADY_EXISTS",
          message:
            "Un compte existe déjà avec ces informations.",
        });
      }

      return res.status(500).json({
        error: "UPDATE_FAILED",
        message:
          "Impossible de mettre à jour le compte client.",
      });
    }
  }
);

/**
 * ============================================================
 * MY APPOINTMENTS
 * ============================================================
 *
 * GET /api/client-auth/me/appointments
 */
router.get(
  "/me/appointments",
  requireClient,
  (req: ClientAuthedRequest, res) => {
    try {
      const clientId = req.clientId;

      if (!clientId) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message:
            "Authentification client requise.",
        });
      }

      const appointments = db
        .prepare(
          `
          SELECT
            a.*,

            s.name_fr AS service_name_fr,
            s.name_ar AS service_name_ar,
            s.duration_minutes,

            st.name AS staff_name

          FROM appointments a

          LEFT JOIN services s
            ON s.id = a.service_id

          LEFT JOIN staff st
            ON st.id = a.staff_id

          WHERE a.client_id = ?

          ORDER BY
            a.date DESC,
            a.start_time DESC
          `
        )
        .all(clientId);

      return res.status(200).json({
        appointments,
      });
    } catch (error) {
      console.error(
        "❌ Client appointments error:",
        error
      );

      return res.status(500).json({
        error: "APPOINTMENTS_FAILED",
        message:
          "Impossible de récupérer vos réservations.",
      });
    }
  }
);

/**
 * ============================================================
 * MY APPOINTMENT DETAIL
 * ============================================================
 *
 * GET /api/client-auth/me/appointments/:id
 *
 * SÉCURITÉ :
 * Le rendez-vous doit appartenir au client connecté
 * (client_id = req.clientId). Aucun autre client ne peut
 * consulter les détails d'une réservation qui n'est pas la
 * sienne.
 */
router.get(
  "/me/appointments/:id",
  requireClient,
  (req: ClientAuthedRequest, res) => {
    try {
      const clientId = req.clientId;

      const appointmentId = String(
        req.params.id ?? ""
      ).trim();

      if (!clientId) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message:
            "Authentification client requise.",
        });
      }

      if (!appointmentId) {
        return res.status(400).json({
          error: "INVALID_APPOINTMENT",
          message:
            "Réservation invalide.",
        });
      }

      const appointment = db
        .prepare(
          `
          SELECT
            a.*,

            s.name_fr AS service_name_fr,
            s.name_ar AS service_name_ar,
            s.duration_minutes,

            st.name AS staff_name

          FROM appointments a

          LEFT JOIN services s
            ON s.id = a.service_id

          LEFT JOIN staff st
            ON st.id = a.staff_id

          WHERE a.id = ?
            AND a.client_id = ?

          LIMIT 1
          `
        )
        .get(appointmentId, clientId);

      if (!appointment) {
        return res.status(404).json({
          error: "APPOINTMENT_NOT_FOUND",
          message:
            "Réservation introuvable.",
        });
      }

      return res.status(200).json({
        appointment,
      });
    } catch (error) {
      console.error(
        "❌ Client appointment detail error:",
        error
      );

      return res.status(500).json({
        error: "APPOINTMENT_FAILED",
        message:
          "Impossible de récupérer la réservation.",
      });
    }
  }
);

/**
 * ============================================================
 * AVAILABILITY FOR MY APPOINTMENT (MODIFICATION)
 * ============================================================
 *
 * GET /api/client-auth/me/appointments/:id/availability
 *
 * Identique à GET /api/availability (route publique), à un
 * détail près : le créneau ACTUEL de la réservation en cours
 * de modification est exclu du calcul d'occupation, pour
 * qu'il n'apparaisse pas "réservé" simplement parce que le
 * client l'occupe déjà lui-même.
 *
 * Ne crée pas de deuxième système de disponibilité :
 * réutilise exactement computeSlotsWithStatus (services/availability.ts).
 *
 * SÉCURITÉ :
 * Le rendez-vous doit appartenir au client connecté.
 */

const clientAvailabilityQuerySchema = z.object({
  staffId: z
    .coerce
    .number()
    .int()
    .positive(),

  serviceId: z
    .coerce
    .number()
    .int()
    .positive(),

  date: z.string(),
});

router.get(
  "/me/appointments/:id/availability",
  requireClient,
  (req: ClientAuthedRequest, res) => {
    try {
      const clientId = req.clientId;

      const appointmentId = String(
        req.params.id ?? ""
      ).trim();

      if (!clientId) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message:
            "Authentification client requise.",
        });
      }

      const existing = db
        .prepare(
          `
          SELECT id
          FROM appointments
          WHERE id = ?
            AND client_id = ?
          LIMIT 1
          `
        )
        .get(
          appointmentId,
          clientId
        ) as { id: string } | undefined;

      if (!existing) {
        return res.status(404).json({
          error: "APPOINTMENT_NOT_FOUND",
          message:
            "Réservation introuvable.",
        });
      }

      const parsed =
        clientAvailabilityQuerySchema.safeParse(
          req.query
        );

      if (!parsed.success) {
        return res.status(400).json({
          error: "INVALID_QUERY",
          message: "Paramètres invalides.",
        });
      }

      const { staffId, serviceId, date } =
        parsed.data;

      if (!isValidDateStr(date)) {
        return res.status(400).json({
          error: "INVALID_DATE",
          message: "Date invalide.",
        });
      }

      const service = db
        .prepare(
          "SELECT * FROM services WHERE id = ? AND active = 1"
        )
        .get(serviceId) as
        | ServiceRow
        | undefined;

      if (!service) {
        return res.status(404).json({
          error: "SERVICE_NOT_FOUND",
          message: "Service introuvable.",
        });
      }

      const staff = db
        .prepare(
          "SELECT * FROM staff WHERE id = ? AND active = 1"
        )
        .get(staffId) as Staff | undefined;

      if (!staff) {
        return res.status(404).json({
          error: "STAFF_NOT_FOUND",
          message: "Coiffeur introuvable.",
        });
      }

      const slots = computeSlotsWithStatus(
        staffId,
        date,
        service.duration_minutes,
        undefined,
        existing.id
      );

      return res.status(200).json({
        date,
        staffId,
        serviceId,
        durationMinutes:
          service.duration_minutes,
        slots,
      });
    } catch (error) {
      console.error(
        "❌ Client appointment availability error:",
        error
      );

      return res.status(500).json({
        error: "AVAILABILITY_FAILED",
        message:
          "Impossible de récupérer les disponibilités.",
      });
    }
  }
);

/**
 * ============================================================
 * MODIFY MY APPOINTMENT
 * ============================================================
 *
 * PUT /api/client-auth/me/appointments/:id
 *
 * Un client connecté peut modifier :
 * - le service
 * - le coiffeur
 * - la date
 * - l'heure
 *
 * RÈGLES (identiques à la création — voir services/booking.ts
 * et services/availability.ts, entièrement réutilisées ici) :
 *
 * - le service entier doit se terminer avant la fermeture
 *   (21:00 en semaine, 22:00 le week-end) ;
 * - le backend refait TOUJOURS toute la validation, quoi que
 *   le frontend ait proposé ;
 * - l'ancienne réservation est exclue lors de la vérification
 *   de conflit ;
 * - le statut confirmed/pending est recalculé automatiquement,
 *   il n'est jamais choisi par le client ;
 * - une notification admin est créée avec l'ancienne et la
 *   nouvelle valeur.
 *
 * SÉCURITÉ :
 * Le rendez-vous doit appartenir au client connecté. Le
 * propriétaire vient uniquement du token (req.clientId),
 * jamais d'une valeur envoyée par le frontend.
 */

const updateMyAppointmentSchema = z.object({
  staffId: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

  serviceId: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

  date: z.string().optional(),

  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

router.put(
  "/me/appointments/:id",
  requireClient,
  (req: ClientAuthedRequest, res) => {
    try {
      const clientId = req.clientId;

      const appointmentId = String(
        req.params.id ?? ""
      ).trim();

      if (!clientId) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message:
            "Authentification client requise.",
        });
      }

      if (!appointmentId) {
        return res.status(400).json({
          error: "INVALID_APPOINTMENT",
          message:
            "Réservation invalide.",
        });
      }

      // ---------------------------------------------------------
      // RÉSERVATION EXISTANTE
      //
      // Le propriétaire est vérifié directement dans la requête
      // SQL (client_id = ?) : jamais de clientId envoyé par le
      // frontend pour déterminer l'accès.
      // ---------------------------------------------------------

      const existing = db
        .prepare(
          `
          SELECT *
          FROM appointments
          WHERE id = ?
            AND client_id = ?
          LIMIT 1
          `
        )
        .get(
          appointmentId,
          clientId
        ) as Appointment | undefined;

      if (!existing) {
        return res.status(404).json({
          error: "APPOINTMENT_NOT_FOUND",
          message:
            "Réservation introuvable.",
        });
      }

      if (
        existing.status === "cancelled" ||
        existing.status === "completed"
      ) {
        return res.status(400).json({
          error: "APPOINTMENT_NOT_MODIFIABLE",
          message:
            "Cette réservation ne peut plus être modifiée.",
        });
      }

      const parsed =
        updateMyAppointmentSchema.safeParse(
          req.body
        );

      if (!parsed.success) {
        return res.status(400).json({
          error: "INVALID_BODY",
          message:
            "Données invalides.",
        });
      }

      const input = parsed.data;

      const staffId =
        input.staffId ?? existing.staff_id;

      const serviceId =
        input.serviceId ?? existing.service_id;

      const date =
        input.date ?? existing.date;

      const time =
        input.time ?? existing.start_time;

      if (!isValidDateStr(date)) {
        return res.status(400).json({
          error: "INVALID_DATE",
          message: "Date invalide.",
        });
      }

      if (!serviceId) {
        return res.status(400).json({
          error: "SERVICE_NOT_FOUND",
          message: "Service introuvable.",
        });
      }

      // ---------------------------------------------------------
      // COIFFEUR / SERVICE
      // ---------------------------------------------------------

      const staff = db
        .prepare(
          `
          SELECT *
          FROM staff
          WHERE id = ?
            AND active = 1
          `
        )
        .get(staffId) as Staff | undefined;

      if (!staff) {
        return res.status(404).json({
          error: "STAFF_NOT_FOUND",
          message: "Coiffeur introuvable.",
        });
      }

      const service = db
        .prepare(
          `
          SELECT *
          FROM services
          WHERE id = ?
            AND active = 1
          `
        )
        .get(serviceId) as
        | ServiceRow
        | undefined;

      if (!service) {
        return res.status(404).json({
          error: "SERVICE_NOT_FOUND",
          message: "Service introuvable.",
        });
      }

      // ---------------------------------------------------------
      // VALIDATION DES HORAIRES
      //
      // Réutilise validateBookingTime, EXACTEMENT la même
      // fonction que la réservation invité et la modification
      // admin. Le backend ne fait jamais confiance au frontend :
      // même si le frontend n'a proposé que des créneaux
      // valides, tout est revérifié ici.
      // ---------------------------------------------------------

      const durationMinutes =
        service.duration_minutes;

      const validation = validateBookingTime(
        date,
        time,
        durationMinutes
      );

      if (!validation.valid) {
        const {
          status,
          error,
          message,
        } = validationErrorResponse(
          validation.reason,
          date
        );

        return res.status(status).json({
          error,
          message,
        });
      }

      const endTime = toHHMM(validation.end);

      // ---------------------------------------------------------
      // NOMS ACTUELS (AVANT MODIFICATION) POUR LA NOTIFICATION
      // ---------------------------------------------------------

      const oldStaff = db
        .prepare(
          "SELECT name FROM staff WHERE id = ?"
        )
        .get(existing.staff_id) as
        | { name: string }
        | undefined;

      const oldService = existing.service_id
        ? (db
            .prepare(
              "SELECT name_fr FROM services WHERE id = ?"
            )
            .get(existing.service_id) as
            | { name_fr: string }
            | undefined)
        : undefined;

      try {
        const run = db.transaction(() => {
          // -----------------------------------------------------
          // VÉRIFICATION FINALE DE CONFLIT (DANS LA TRANSACTION)
          //
          // Exclut l'ancienne réservation (existing.id) — voir
          // services/availability.ts::getBusySlotsForStaffDate,
          // qui accepte déjà un excludeAppointmentId.
          // -----------------------------------------------------

          const busy = getBusySlotsForStaffDate(
            staffId,
            date,
            existing.id
          );

          if (
            hasConflict(
              validation.start,
              validation.end,
              busy
            )
          ) {
            throw new BookingError(
              "SLOT_UNAVAILABLE",
              "Ce créneau n'est plus disponible. Merci d'en choisir un autre."
            );
          }

          // -----------------------------------------------------
          // STATUT confirmed / pending
          // -----------------------------------------------------

          const exceptional = isExceptionalSlot(
            date,
            time,
            durationMinutes
          );

          const newStatus = exceptional
            ? "pending"
            : "confirmed";

          db.prepare(
            `
            UPDATE appointments
            SET
              staff_id = ?,
              service_id = ?,
              date = ?,
              start_time = ?,
              end_time = ?,
              status = ?
            WHERE id = ?
              AND client_id = ?
            `
          ).run(
            staffId,
            serviceId,
            date,
            time,
            endTime,
            newStatus,
            existing.id,
            clientId
          );

          // -----------------------------------------------------
          // NOTIFICATION ADMIN
          //
          // Contient l'ancienne et la nouvelle valeur, comme
          // demandé, dans la même transaction que la
          // modification.
          // -----------------------------------------------------

          const notificationId = uuidv4();

          const oldLabel = `${
            oldService?.name_fr ?? "—"
          } avec ${
            oldStaff?.name ?? "—"
          } le ${existing.date} à ${existing.start_time}`;

          const newLabel = `${service.name_fr} avec ${staff.name} le ${date} à ${time}`;

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
            VALUES (?, 'appointment_updated', ?, ?, ?, ?, ?, ?, ?, ?)
            `
          ).run(
            notificationId,
            existing.id,
            "Modification d'une réservation",
            `${
              existing.client_name ??
              "Un client"
            } a modifié sa réservation : ${oldLabel} → ${newLabel}.`,
            date,
            time,
            existing.client_name,
            service.name_fr,
            staff.name
          );
        });

        run();
      } catch (err) {
        if (err instanceof BookingError) {
          const status =
            err.code === "SLOT_UNAVAILABLE"
              ? 409
              : 400;

          return res.status(status).json({
            error: err.code,
            message: err.message,
          });
        }

        if (
          err instanceof Error &&
          /UNIQUE constraint failed/i.test(
            err.message
          )
        ) {
          return res.status(409).json({
            error: "SLOT_UNAVAILABLE",
            message:
              "Ce créneau vient d'être réservé. Merci d'en choisir un autre.",
          });
        }

        throw err;
      }

      const updated = db
        .prepare(
          `
          SELECT
            a.*,

            s.name_fr AS service_name_fr,
            s.name_ar AS service_name_ar,
            s.duration_minutes,

            st.name AS staff_name

          FROM appointments a

          LEFT JOIN services s
            ON s.id = a.service_id

          LEFT JOIN staff st
            ON st.id = a.staff_id

          WHERE a.id = ?
          `
        )
        .get(existing.id);

      return res.status(200).json({
        appointment: updated,
      });
    } catch (error) {
      console.error(
        "❌ Client appointment update error:",
        error
      );

      return res.status(500).json({
        error: "UPDATE_FAILED",
        message:
          "Impossible de modifier la réservation.",
      });
    }
  }
);

/**
 * ============================================================
 * CANCEL MY APPOINTMENT
 * ============================================================
 *
 * DELETE /api/client-auth/me/appointments/:id
 */
router.delete(
  "/me/appointments/:id",
  requireClient,
  (req: ClientAuthedRequest, res) => {
    try {
      const clientId = req.clientId;

      const appointmentId =
        String(
          req.params.id ?? ""
        ).trim();

      if (!clientId) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message:
            "Authentification client requise.",
        });
      }

      if (!appointmentId) {
        return res.status(400).json({
          error: "INVALID_APPOINTMENT",
          message:
            "Réservation invalide.",
        });
      }

      const appointment = db
        .prepare(
          `
          SELECT
            a.id,
            a.status,
            a.date,
            a.start_time,
            a.client_name,

            s.name_fr AS service_name_fr,
            st.name AS staff_name

          FROM appointments a

          LEFT JOIN services s
            ON s.id = a.service_id

          LEFT JOIN staff st
            ON st.id = a.staff_id

          WHERE a.id = ?
            AND a.client_id = ?
          LIMIT 1
          `
        )
        .get(
          appointmentId,
          clientId
        ) as
        | {
            id: string;
            status: string;
            date: string;
            start_time: string;
            client_name: string | null;
            service_name_fr: string | null;
            staff_name: string | null;
          }
        | undefined;

      if (!appointment) {
        return res.status(404).json({
          error: "APPOINTMENT_NOT_FOUND",
          message:
            "Réservation introuvable.",
        });
      }

      if (
        appointment.status === "cancelled" ||
        appointment.status === "completed"
      ) {
        return res.status(400).json({
          error: "APPOINTMENT_NOT_CANCELLABLE",
          message:
            "Cette réservation ne peut plus être annulée.",
        });
      }

      db.prepare(
        `
        UPDATE appointments
        SET status = 'cancelled'
        WHERE id = ?
          AND client_id = ?
        `
      ).run(
        appointmentId,
        clientId
      );

      // ---------------------------------------------------------
      // NOTIFICATION ADMIN
      //
      // Comme pour la création et la modification, chaque
      // annulation client doit être visible côté admin. La
      // notification ne doit jamais empêcher l'annulation si
      // son insertion rencontre un problème.
      // ---------------------------------------------------------

      try {
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
          VALUES (?, 'appointment_cancelled', ?, ?, ?, ?, ?, ?, ?, ?)
          `
        ).run(
          uuidv4(),
          appointment.id,
          "Annulation d'une réservation",
          `${
            appointment.client_name ??
            "Un client"
          } a annulé sa réservation : ${
            appointment.service_name_fr ?? "—"
          } avec ${
            appointment.staff_name ?? "—"
          } le ${appointment.date} à ${appointment.start_time}.`,
          appointment.date,
          appointment.start_time,
          appointment.client_name,
          appointment.service_name_fr,
          appointment.staff_name
        );
      } catch (notificationError) {
        console.error(
          "❌ Client cancellation notification error:",
          notificationError
        );
      }

      return res.status(200).json({
        success: true,
        message:
          "Réservation annulée avec succès.",
      });
    } catch (error) {
      console.error(
        "❌ Client appointment cancellation error:",
        error
      );

      return res.status(500).json({
        error: "CANCEL_FAILED",
        message:
          "Impossible d'annuler la réservation.",
      });
    }
  }
);

export default router;