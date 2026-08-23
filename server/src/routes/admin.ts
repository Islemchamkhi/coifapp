import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import { db } from "../db.js";
import {
  Appointment,
  ServiceRow,
  Staff,
} from "../types.js";

import {
  requireAdmin,
  signAdminToken,
} from "../middleware/adminAuth.js";

import {
  toHHMM,
  toMinutes,
  isValidDateStr,
  todayInSalonTz,
} from "../lib/time.js";

import {
  getBusySlotsForStaffDate,
  hasConflict,
} from "../services/availability.js";

import {
  getBookingSettings,
  updateBookingSettings,
  BookingSettingsError,
} from "../services/bookingSettings.js";

const router = Router();

// =========================================================
// AUTH
// =========================================================

router.post("/login", (req, res) => {
  const { password } = req.body || {};

  if (
    !password ||
    password !== (process.env.ADMIN_PASSWORD || "changeme123")
  ) {
    return res.status(401).json({
      error: "INVALID_CREDENTIALS",
      message: "Mot de passe incorrect.",
    });
  }

  res.json({
    token: signAdminToken(),
  });
});

router.use(requireAdmin);

// =========================================================
// PARAMÈTRES DE RÉSERVATION (mode interval / flexible)
// =========================================================

router.get("/booking-settings", (_req, res) => {
  res.json(getBookingSettings());
});

const bookingSettingsSchema = z.object({
  bookingMode: z.enum(["interval", "flexible"]),
  bookingIntervalMinutes: z.coerce.number().int(),
});

router.put("/booking-settings", (req, res) => {
  const parsed = bookingSettingsSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "Paramètres invalides.",
    });
  }

  try {
    const settings = updateBookingSettings(parsed.data);
    return res.status(200).json(settings);
  } catch (error) {
    if (error instanceof BookingSettingsError) {
      return res.status(400).json({
        error: error.code,
        message: error.message,
      });
    }

    console.error("❌ Booking settings update error:", error);

    return res.status(500).json({
      error: "UPDATE_FAILED",
      message: "Impossible de mettre à jour les paramètres.",
    });
  }
});

// =========================================================
// APPOINTMENTS
// =========================================================

router.get("/appointments", (req, res) => {
  const date =
    typeof req.query.date === "string"
      ? req.query.date
      : undefined;

  const staffId = req.query.staffId
    ? Number(req.query.staffId)
    : undefined;

  const status =
    typeof req.query.status === "string" &&
    req.query.status !== "all"
      ? req.query.status
      : undefined;

  let query = `
    SELECT
      a.*,
      s.name_fr AS service_name_fr,
      s.duration_minutes AS service_duration,
      st.name AS staff_name
    FROM appointments a
    LEFT JOIN services s ON s.id = a.service_id
    LEFT JOIN staff st ON st.id = a.staff_id
    WHERE 1=1
  `;

  const params: (string | number)[] = [];

  if (date) {
    query += " AND a.date = ?";
    params.push(date);
  }

  if (staffId) {
    query += " AND a.staff_id = ?";
    params.push(staffId);
  }

  if (status) {
    query += " AND a.status = ?";
    params.push(status);
  }

  query += `
    ORDER BY
      a.date ASC,
      a.start_time ASC
  `;

  const rows = db
    .prepare(query)
    .all(...params);

  res.json(rows);
});

// ---------------------------------------------------------
// CREATE APPOINTMENT
// ---------------------------------------------------------

const manualAppointmentSchema = z.object({
  staffId: z.coerce.number().int().positive(),

  serviceId: z
    .coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),

  date: z.string(),

  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/),

  durationMinutes: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

  clientName: z
    .string()
    .min(1)
    .max(80)
    .optional(),

  clientPhone: z
    .string()
    .max(30)
    .optional(),

  notes: z
    .string()
    .max(300)
    .optional(),

  status: z
    .enum(["confirmed", "blocked"])
    .default("confirmed"),
});

router.post("/appointments", (req, res) => {
  const parsed =
    manualAppointmentSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "INVALID_BODY",
      message: "Données invalides.",
    });
  }

  const input = parsed.data;

  if (!isValidDateStr(input.date)) {
    return res.status(400).json({
      error: "INVALID_DATE",
      message: "Date invalide.",
    });
  }

  let duration = input.durationMinutes;

  if (!duration && input.serviceId) {
    const svc = db
      .prepare(
        "SELECT * FROM services WHERE id = ?"
      )
      .get(input.serviceId) as
      | ServiceRow
      | undefined;

    duration = svc?.duration_minutes;
  }

  if (!duration) {
    duration = 30;
  }

  const start = toMinutes(input.time);
  const end = start + duration;

  // ---------------------------------------------------------
  // CORRECTIF : utilise désormais la même fonction de
  // vérification que TOUT le reste du système (booking public,
  // disponibilité affichée), au lieu d'une logique dupliquée.
  // Ceci inclut bien les statuts 'confirmed', 'pending' ET
  // 'blocked' — plus aucune divergence possible entre les
  // différents points de création de rendez-vous.
  // ---------------------------------------------------------
  const busy =
    getBusySlotsForStaffDate(
      input.staffId,
      input.date
    );

  const conflict = hasConflict(
    start,
    end,
    busy
  );

  if (conflict) {
    return res.status(409).json({
      error: "SLOT_UNAVAILABLE",
      message:
        "Ce créneau chevauche un autre rendez-vous existant.",
    });
  }

  const id = uuidv4();

  try {
    db.prepare(
      `
      INSERT INTO appointments (
        id,
        staff_id,
        service_id,
        date,
        start_time,
        end_time,
        client_name,
        client_phone,
        status,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      id,
      input.staffId,
      input.serviceId ?? null,
      input.date,
      input.time,
      toHHMM(end),
      input.clientName ??
        (input.status === "blocked"
          ? "Créneau bloqué"
          : null),
      input.clientPhone ?? null,
      input.status,
      input.notes ?? null
    );
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed/i.test(
        err.message
      )
    ) {
      return res.status(409).json({
        error: "SLOT_UNAVAILABLE",
        message:
          "Ce créneau chevauche un autre rendez-vous existant.",
      });
    }

    throw err;
  }

  const appointment = db
    .prepare(
      "SELECT * FROM appointments WHERE id = ?"
    )
    .get(id);

  res.status(201).json(appointment);
});

// ---------------------------------------------------------
// UPDATE APPOINTMENT
// ---------------------------------------------------------

const updateAppointmentSchema = z.object({
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
    .nullable()
    .optional(),

  date: z.string().optional(),

  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),

  durationMinutes: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

  clientName: z
    .string()
    .max(80)
    .nullable()
    .optional(),

  clientPhone: z
    .string()
    .max(30)
    .nullable()
    .optional(),

  notes: z
    .string()
    .max(300)
    .nullable()
    .optional(),

  status: z
    .enum([
      "confirmed",
      "cancelled",
      "completed",
      "blocked",
    ])
    .optional(),

  arrivedAt: z
    .string()
    .nullable()
    .optional(),

  completedAt: z
    .string()
    .nullable()
    .optional(),

  delayMinutes: z
    .coerce
    .number()
    .int()
    .min(0)
    .optional(),
});

router.put("/appointments/:id", (req, res) => {
  const existing = db
    .prepare(
      "SELECT * FROM appointments WHERE id = ?"
    )
    .get(req.params.id) as
    | Appointment
    | undefined;

  if (!existing) {
    return res.status(404).json({
      error: "NOT_FOUND",
      message: "Rendez-vous introuvable.",
    });
  }

  const parsed =
    updateAppointmentSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "INVALID_BODY",
      message: "Données invalides.",
    });
  }

  const input = parsed.data;

  const staffId =
    input.staffId ?? existing.staff_id;

  const date =
    input.date ?? existing.date;

  const time =
    input.time ?? existing.start_time;

  let duration =
    input.durationMinutes;

  if (!duration) {
    duration =
      toMinutes(existing.end_time) -
      toMinutes(existing.start_time);
  }

  const start = toMinutes(time);
  const end = start + duration;

  // -------------------------------------------------------
  // CHECK OVERLAPPING APPOINTMENTS
  //
  // CORRECTIF IMPORTANT :
  // L'ancienne requête ne vérifiait que les statuts
  // 'confirmed' et 'blocked' — elle oubliait 'pending'
  // (les créneaux "demande exceptionnelle" 20h-21h), ce qui
  // permettait à une modification admin de chevaucher un
  // rendez-vous pending existant sans être détectée.
  //
  // On utilise maintenant EXACTEMENT la même fonction que
  // partout ailleurs dans le système (booking public,
  // création admin, calcul de disponibilité affiché), avec
  // exclusion du rendez-vous en cours de modification.
  // -------------------------------------------------------

  const busy = getBusySlotsForStaffDate(
    staffId,
    date,
    existing.id
  );

  const conflict = hasConflict(
    start,
    end,
    busy
  );

  const newStatus =
    input.status ?? existing.status;

  if (
    conflict &&
    newStatus !== "cancelled"
  ) {
    return res.status(409).json({
      error: "SLOT_UNAVAILABLE",
      message:
        "Ce créneau chevauche un autre rendez-vous existant.",
    });
  }

  // -------------------------------------------------------
  // UPDATE
  // -------------------------------------------------------

  try {
    db.prepare(
      `
      UPDATE appointments SET

        staff_id = ?,
        service_id = ?,
        date = ?,
        start_time = ?,
        end_time = ?,

        client_name = ?,
        client_phone = ?,

        notes = ?,
        status = ?,

        arrived_at = ?,
        completed_at = ?,
        delay_minutes = ?

      WHERE id = ?
      `
    ).run(
      staffId,

      input.serviceId !== undefined
        ? input.serviceId
        : existing.service_id,

      date,
      time,
      toHHMM(end),

      input.clientName !== undefined
        ? input.clientName
        : existing.client_name,

      input.clientPhone !== undefined
        ? input.clientPhone
        : existing.client_phone,

      input.notes !== undefined
        ? input.notes
        : existing.notes,

      newStatus,

      input.arrivedAt !== undefined
        ? input.arrivedAt
        : existing.arrived_at,

      input.completedAt !== undefined
        ? input.completedAt
        : existing.completed_at,

      input.delayMinutes !== undefined
        ? input.delayMinutes
        : existing.delay_minutes,

      existing.id
    );
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed/i.test(
        err.message
      )
    ) {
      return res.status(409).json({
        error: "SLOT_UNAVAILABLE",
        message:
          "Ce créneau chevauche un autre rendez-vous existant.",
      });
    }

    throw err;
  }

  const updated = db
    .prepare(
      "SELECT * FROM appointments WHERE id = ?"
    )
    .get(existing.id);

  res.json(updated);
});

// ---------------------------------------------------------
// CANCEL APPOINTMENT
// ---------------------------------------------------------

router.delete(
  "/appointments/:id",
  (req, res) => {
    const existing = db
      .prepare(
        "SELECT * FROM appointments WHERE id = ?"
      )
      .get(req.params.id);

    if (!existing) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Rendez-vous introuvable.",
      });
    }

    db.prepare(
      `
      UPDATE appointments
      SET status = 'cancelled'
      WHERE id = ?
      `
    ).run(req.params.id);

    res.json({
      ok: true,
    });
  }
);

// =========================================================
// SERVICES
// =========================================================

router.get("/services", (_req, res) => {
  const services = db
    .prepare(`
      SELECT
        id,
        name_fr,
        name_ar,
        duration_minutes,
        price,
        active
      FROM services
      ORDER BY id ASC
    `)
    .all();

  res.json(services);
});

const serviceSchema = z.object({
  name_fr: z
    .string()
    .min(1)
    .max(60),

  name_ar: z
    .string()
    .min(1)
    .max(60),

  duration_minutes: z
    .coerce
    .number()
    .int()
    .min(5)
    .max(240),

  price: z
    .coerce
    .number()
    .min(0)
    .max(1000000),

  active: z
    .coerce
    .boolean()
    .optional(),
});

// ---------------------------------------------------------
// CREATE SERVICE
// ---------------------------------------------------------

router.post("/services", (req, res) => {
  const parsed = serviceSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "INVALID_BODY",
      message: "Données du service invalides.",
      details: parsed.error.flatten(),
    });
  }

  const {
    name_fr,
    name_ar,
    duration_minutes,
    price,
    active,
  } = parsed.data;

  const result = db
    .prepare(`
      INSERT INTO services (
        name_fr,
        name_ar,
        duration_minutes,
        price,
        active
      )
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(
      name_fr.trim(),
      name_ar.trim(),
      duration_minutes,
      price,
      active === false ? 0 : 1
    );

  const service = db
    .prepare(`
      SELECT
        id,
        name_fr,
        name_ar,
        duration_minutes,
        price,
        active
      FROM services
      WHERE id = ?
    `)
    .get(result.lastInsertRowid);

  return res.status(201).json(service);
});

// ---------------------------------------------------------
// UPDATE SERVICE
// ---------------------------------------------------------

router.put("/services/:id", (req, res) => {
  const existing = db
    .prepare(`
      SELECT *
      FROM services
      WHERE id = ?
    `)
    .get(req.params.id) as
    | ServiceRow
    | undefined;

  if (!existing) {
    return res.status(404).json({
      error: "NOT_FOUND",
      message: "Service introuvable.",
    });
  }

  const parsed = serviceSchema
    .partial()
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "INVALID_BODY",
      message: "Données du service invalides.",
      details: parsed.error.flatten(),
    });
  }

  const input = parsed.data;

  const nameFr =
    input.name_fr !== undefined
      ? input.name_fr.trim()
      : existing.name_fr;

  const nameAr =
    input.name_ar !== undefined
      ? input.name_ar.trim()
      : existing.name_ar;

  const duration =
    input.duration_minutes !== undefined
      ? input.duration_minutes
      : existing.duration_minutes;

  const price =
    input.price !== undefined
      ? input.price
      : existing.price ?? 0;

  const active =
    input.active !== undefined
      ? input.active
        ? 1
        : 0
      : existing.active;

  db.prepare(`
    UPDATE services
    SET
      name_fr = ?,
      name_ar = ?,
      duration_minutes = ?,
      price = ?,
      active = ?
    WHERE id = ?
  `).run(
    nameFr,
    nameAr,
    duration,
    price,
    active,
    existing.id
  );

  const updated = db
    .prepare(`
      SELECT
        id,
        name_fr,
        name_ar,
        duration_minutes,
        price,
        active
      FROM services
      WHERE id = ?
    `)
    .get(existing.id);

  return res.json(updated);
});
// =========================================================
// STAFF
// =========================================================

router.get("/staff", (_req, res) => {
  res.json(
    db
      .prepare(
        "SELECT * FROM staff ORDER BY id ASC"
      )
      .all()
  );
});

router.put(
  "/staff/:id",
  (req, res) => {
    const existing = db
      .prepare(
        "SELECT * FROM staff WHERE id = ?"
      )
      .get(req.params.id) as
      | Staff
      | undefined;

    if (!existing) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Coiffeur introuvable.",
      });
    }

    const schema = z.object({
      name: z
        .string()
        .min(1)
        .max(60)
        .optional(),

      active: z
        .coerce
        .boolean()
        .optional(),
    });

    const parsed =
      schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "INVALID_BODY",
        message: "Données invalides.",
      });
    }

    db.prepare(
      `
      UPDATE staff
      SET
        name = ?,
        active = ?
      WHERE id = ?
      `
    ).run(
      parsed.data.name ??
        existing.name,

      parsed.data.active !== undefined
        ? parsed.data.active
          ? 1
          : 0
        : existing.active,

      existing.id
    );

    res.json(
      db
        .prepare(
          "SELECT * FROM staff WHERE id = ?"
        )
        .get(existing.id)
    );
  }
);

// =========================================================
// CLIENTS
// =========================================================
//
// IMPORTANT :
// La liste admin vient maintenant de la table `clients`.
//
// Ainsi, TOUS les comptes créés par les clients apparaissent
// dans l'administration, même s'ils n'ont encore aucune
// réservation.
//
// Les anciens clients qui ont réservé sans compte restent
// également visibles grâce à UNION.
// =========================================================

router.get("/clients", (req, res) => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const searchPattern = `%${search}%`;

    // -------------------------------------------------------
    // CLIENTS AVEC COMPTE
    // -------------------------------------------------------
    //
    // On part de la table clients.
    //
    // LEFT JOIN appointments permet d'avoir le client même
    // s'il n'a encore aucune réservation.
    //
    const accountClients = db
      .prepare(
        `
        SELECT
          c.id AS client_id,

          c.name AS client_name,
          c.phone AS client_phone,
          c.email AS client_email,

          c.created_at AS account_created_at,
          c.updated_at AS account_updated_at,

          COUNT(a.id) AS total_appointments,

          MIN(
            CASE
              WHEN a.id IS NOT NULL
              THEN a.date || ' ' || a.start_time
            END
          ) AS first_visit,

          MAX(
            CASE
              WHEN a.id IS NOT NULL
              THEN a.date || ' ' || a.start_time
            END
          ) AS last_visit,

          SUM(
            CASE
              WHEN a.status = 'cancelled'
              THEN 1
              ELSE 0
            END
          ) AS cancellations

        FROM clients c

        LEFT JOIN appointments a
          ON a.client_id = c.id

        WHERE
          (
            ? = ''
            OR c.name LIKE ?
            OR c.phone LIKE ?
            OR c.email LIKE ?
          )

        GROUP BY
          c.id,
          c.name,
          c.phone,
          c.email,
          c.created_at,
          c.updated_at

        ORDER BY
          c.created_at DESC
        `
      )
      .all(
        search,
        searchPattern,
        searchPattern,
        searchPattern
      );

    // -------------------------------------------------------
    // ANCIENS CLIENTS SANS COMPTE
    // -------------------------------------------------------
    //
    // On conserve les personnes ayant réservé avant le système
    // de compte client.
    //
    // Elles n'ont pas de client_id.
    //
    const legacyClients = db
      .prepare(
        `
        SELECT
          NULL AS client_id,

          MAX(a.client_name) AS client_name,
          a.client_phone AS client_phone,
          NULL AS client_email,

          NULL AS account_created_at,
          NULL AS account_updated_at,

          COUNT(*) AS total_appointments,

          MIN(
            a.date || ' ' || a.start_time
          ) AS first_visit,

          MAX(
            a.date || ' ' || a.start_time
          ) AS last_visit,

          SUM(
            CASE
              WHEN a.status = 'cancelled'
              THEN 1
              ELSE 0
            END
          ) AS cancellations

        FROM appointments a

        WHERE
          a.client_id IS NULL
          AND a.client_phone IS NOT NULL
          AND a.client_phone != ''

          AND (
            ? = ''
            OR a.client_name LIKE ?
            OR a.client_phone LIKE ?
          )

        GROUP BY
          a.client_phone

        ORDER BY
          last_visit DESC
        `
      )
      .all(
        search,
        searchPattern,
        searchPattern
      );

    // -------------------------------------------------------
    // COMBINAISON
    // -------------------------------------------------------

    const clients = [
      ...accountClients.map((client: any) => ({
        ...client,
        has_account: true,
      })),

      ...legacyClients.map((client: any) => ({
        ...client,
        has_account: false,
      })),
    ];

    // Les comptes sont prioritaires.
    // Ensuite on trie par dernière activité.
    clients.sort((a: any, b: any) => {
      const aDate =
        a.last_visit ||
        a.account_created_at ||
        "";

      const bDate =
        b.last_visit ||
        b.account_created_at ||
        "";

      return String(bDate).localeCompare(
        String(aDate)
      );
    });

    return res.json(clients);
  } catch (error) {
    console.error(
      "❌ Admin clients error:",
      error
    );

    return res.status(500).json({
      error: "CLIENTS_FAILED",
      message:
        "Impossible de récupérer les clients.",
    });
  }
});

// =========================================================
// DELETE CLIENT ACCOUNT
// =========================================================
//
// DELETE /api/admin/clients/:id
//
// Supprime définitivement un compte client (table `clients`)
// ainsi que TOUS ses rendez-vous (passés et à venir), comme
// demandé explicitement par l'admin depuis l'interface.
//
// Portée volontairement limitée : ne touche qu'à ce client et
// à ses propres rendez-vous. Ne modifie rien d'autre (autres
// clients, staff, services, notifications d'autres RDV, etc.).
// =========================================================

router.delete("/clients/:id", (req, res) => {
  const clientId = Number(req.params.id);

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return res.status(400).json({
      error: "INVALID_ID",
      message: "Identifiant client invalide.",
    });
  }

  const existing = db
    .prepare("SELECT id FROM clients WHERE id = ?")
    .get(clientId);

  if (!existing) {
    return res.status(404).json({
      error: "NOT_FOUND",
      message: "Compte client introuvable.",
    });
  }

  try {
    const deleteClientAndAppointments = db.transaction(() => {
      // Les notifications référencent appointment_id avec
      // ON DELETE... non défini explicitement dans le schéma ;
      // on les nettoie donc en premier pour rester cohérent,
      // uniquement pour les RDV de CE client.
      db.prepare(
        `
        DELETE FROM notifications
        WHERE appointment_id IN (
          SELECT id FROM appointments WHERE client_id = ?
        )
        `
      ).run(clientId);

      db.prepare(
        "DELETE FROM appointments WHERE client_id = ?"
      ).run(clientId);

      db.prepare(
        "DELETE FROM clients WHERE id = ?"
      ).run(clientId);
    });

    deleteClientAndAppointments();

    return res.json({ ok: true });
  } catch (error) {
    console.error("❌ Admin delete client error:", error);

    return res.status(500).json({
      error: "DELETE_CLIENT_FAILED",
      message: "Impossible de supprimer ce compte client.",
    });
  }
});

// =========================================================
// CLIENT ACCOUNT DETAILS
// =========================================================
//
// GET /api/admin/clients/account/:id
//
// Permet à l'admin de consulter directement un compte client.
// =========================================================

router.get(
  "/clients/account/:id",
  (req, res) => {
    try {
      const clientId = Number(req.params.id);

      if (
        !Number.isInteger(clientId) ||
        clientId <= 0
      ) {
        return res.status(400).json({
          error: "INVALID_CLIENT_ID",
          message: "Identifiant client invalide.",
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
        .get(clientId);

      if (!client) {
        return res.status(404).json({
          error: "CLIENT_NOT_FOUND",
          message: "Compte client introuvable.",
        });
      }

      const appointments = db
        .prepare(
          `
          SELECT
            a.*,

            s.name_fr AS service_name_fr,
            s.name_ar AS service_name_ar,
            s.duration_minutes AS service_duration,

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

      return res.json({
        client,
        appointments,
      });
    } catch (error) {
      console.error(
        "❌ Admin client account details error:",
        error
      );

      return res.status(500).json({
        error: "CLIENT_DETAILS_FAILED",
        message:
          "Impossible de récupérer le compte client.",
      });
    }
  }
);

// =========================================================
// CLIENT APPOINTMENTS BY PHONE
// =========================================================
//
// Cette route reste compatible avec ton frontend actuel.
//
// GET /api/admin/clients/:phone/appointments
// =========================================================

router.get(
  "/clients/:phone/appointments",
  (req, res) => {
    try {
      const phone = String(
        req.params.phone ?? ""
      ).trim();

      if (!phone) {
        return res.status(400).json({
          error: "INVALID_PHONE",
          message:
            "Numéro de téléphone invalide.",
        });
      }

      const rows = db
        .prepare(
          `
          SELECT
            a.*,

            s.name_fr AS service_name_fr,
            s.name_ar AS service_name_ar,
            s.duration_minutes AS service_duration,

            st.name AS staff_name

          FROM appointments a

          LEFT JOIN services s
            ON s.id = a.service_id

          LEFT JOIN staff st
            ON st.id = a.staff_id

          WHERE a.client_phone = ?

          ORDER BY
            a.date DESC,
            a.start_time DESC
          `
        )
        .all(phone);

      return res.json(rows);
    } catch (error) {
      console.error(
        "❌ Admin client appointments error:",
        error
      );

      return res.status(500).json({
        error: "CLIENT_APPOINTMENTS_FAILED",
        message:
          "Impossible de récupérer l'historique du client.",
      });
    }
  }
);

// =========================================================
// STATS
// =========================================================

router.get("/stats", (req, res) => {
  const from =
    typeof req.query.from === "string"
      ? req.query.from
      : "0000-01-01";

  const to =
    typeof req.query.to === "string"
      ? req.query.to
      : "9999-12-31";

  // -------------------------------------------------------
  // TOTALS
  // -------------------------------------------------------

  const totals = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total,

        SUM(
          CASE
            WHEN status = 'cancelled'
            THEN 1
            ELSE 0
          END
        ) AS cancelled,

        SUM(
          CASE
            WHEN status = 'confirmed'
            THEN 1
            ELSE 0
          END
        ) AS confirmed,

        SUM(
          CASE
            WHEN status = 'completed'
            THEN 1
            ELSE 0
          END
        ) AS completed

      FROM appointments

      WHERE date BETWEEN ? AND ?
      `
    )
    .get(from, to);

  // -------------------------------------------------------
  // BY STAFF
  // -------------------------------------------------------

  const byStaff = db
    .prepare(
      `
      SELECT
        st.name AS staff_name,
        COUNT(*) AS total

      FROM appointments a

      JOIN staff st
        ON st.id = a.staff_id

      WHERE
        a.date BETWEEN ? AND ?
        AND a.status = 'confirmed'

      GROUP BY a.staff_id

      ORDER BY total DESC
      `
    )
    .all(from, to);

  // -------------------------------------------------------
  // BY SERVICE
  // -------------------------------------------------------

  const byService = db
    .prepare(
      `
      SELECT
        s.name_fr AS service_name,
        COUNT(*) AS total

      FROM appointments a

      JOIN services s
        ON s.id = a.service_id

      WHERE
        a.date BETWEEN ? AND ?
        AND a.status = 'confirmed'

      GROUP BY a.service_id

      ORDER BY total DESC
      `
    )
    .all(from, to);

  // -------------------------------------------------------
  // BY HOUR
  // -------------------------------------------------------

  const byHour = db
    .prepare(
      `
      SELECT
        substr(start_time, 1, 2) AS hour,
        COUNT(*) AS total

      FROM appointments

      WHERE
        date BETWEEN ? AND ?
        AND status = 'confirmed'

      GROUP BY hour

      ORDER BY hour ASC
      `
    )
    .all(from, to);

  // -------------------------------------------------------
  // TODAY
  // -------------------------------------------------------

  const today =
    todayInSalonTz();

  const todayCount = db
    .prepare(
      `
      SELECT COUNT(*) AS c

      FROM appointments

      WHERE
        date = ?
        AND status = 'confirmed'
      `
    )
    .get(today) as {
      c: number;
    };

  // -------------------------------------------------------
  // RESPONSE
  // -------------------------------------------------------

  res.json({
    totals,
    byStaff,
    byService,
    byHour,
    todayCount: todayCount.c,
  });
});

// =========================================================
// NOTIFICATIONS
// =========================================================

router.get("/notifications", (req, res) => {
  const limit = Math.min(
    Number(req.query.limit) || 50,
    200
  );

  const rows = db
    .prepare(
      `
      SELECT *
      FROM notifications
      ORDER BY created_at DESC
      LIMIT ?
      `
    )
    .all(limit);

  const unread = db
    .prepare(
      `SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NULL`
    )
    .get() as { c: number };

  res.json({ notifications: rows, unreadCount: unread.c });
});

router.post("/notifications/:id/read", (req, res) => {
  const existing = db
    .prepare("SELECT id FROM notifications WHERE id = ?")
    .get(req.params.id);

  if (!existing) {
    return res.status(404).json({
      error: "NOT_FOUND",
      message: "Notification introuvable.",
    });
  }

  db.prepare(
    `UPDATE notifications SET read_at = datetime('now') WHERE id = ?`
  ).run(req.params.id);

  res.json({ ok: true });
});

router.post("/notifications/mark-all-read", (_req, res) => {
  db.prepare(
    `UPDATE notifications SET read_at = datetime('now') WHERE read_at IS NULL`
  ).run();

  res.json({ ok: true });
});

export default router;