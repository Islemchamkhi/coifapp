import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import {
  requireClient,
  signClientToken,
  ClientAuthedRequest,
} from "../middleware/clientAuth.js";

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

function sanitizeClient(client: {
  id: number;
  name: string;
  phone: string;
  email: string;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    email: client.email,
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
 */
router.post("/register", async (req, res) => {
  try {
    const name = normalizeName(req.body?.name);
    const phone = normalizePhone(req.body?.phone);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");

    if (!name || !phone || !email || !password) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message:
          "Nom, téléphone, email et mot de passe sont requis.",
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

    const passwordHash = await bcrypt.hash(password, 12);

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
        email,
        passwordHash
      );

    const clientId = Number(result.lastInsertRowid);

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
      return res.status(500).json({
        error: "CLIENT_CREATE_FAILED",
        message:
          "Impossible de récupérer le compte créé.",
      });
    }

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
 */
router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");

    if (!email || !password) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message:
          "Email et mot de passe sont requis.",
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
          password_hash,
          created_at,
          updated_at
        FROM clients
        WHERE email = ?
        LIMIT 1
        `
      )
      .get(email) as
      | {
          id: number;
          name: string;
          phone: string;
          email: string;
          password_hash: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!client) {
      return res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message:
          "Email ou mot de passe incorrect.",
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
          "Email ou mot de passe incorrect.",
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

      if (!name || !phone || !email) {
        return res.status(400).json({
          error: "MISSING_FIELDS",
          message:
            "Nom, téléphone et email sont requis.",
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

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          error: "INVALID_EMAIL",
          message: "L'adresse email est invalide.",
        });
      }

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
        .get(email, clientId) as { id: number } | undefined;

      if (existingByEmail) {
        return res.status(409).json({
          error: "EMAIL_ALREADY_EXISTS",
          message:
            "Un compte existe déjà avec cette adresse email.",
        });
      }

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
        .get(phone, clientId) as { id: number } | undefined;

      if (existingByPhone) {
        return res.status(409).json({
          error: "PHONE_ALREADY_EXISTS",
          message:
            "Un compte existe déjà avec ce numéro de téléphone.",
        });
      }

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
      ).run(name, phone, email, clientId);

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
        "❌ Client profile update error:",
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
        String(req.params.id ?? "").trim();

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
            id,
            status,
            date,
            start_time
          FROM appointments
          WHERE id = ?
            AND client_id = ?
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
        appointment.status ===
          "cancelled" ||
        appointment.status ===
          "completed"
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