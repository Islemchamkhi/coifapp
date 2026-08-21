import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { ServiceRow, Staff } from "../types.js";
import { computeSlotsWithStatus } from "../services/availability.js";
import { createBooking, BookingError } from "../services/booking.js";
import { isValidDateStr } from "../lib/time.js";
import { optionalClientAuth, ClientAuthedRequest } from "../middleware/clientAuth.js";

const router = Router();

router.get("/staff", (_req, res) => {
  const staff = db.prepare("SELECT id, name, active FROM staff WHERE active = 1").all() as Staff[];
  res.json(staff);
});

router.get("/services", (_req, res) => {
  const services = db
    .prepare("SELECT * FROM services WHERE active = 1 ORDER BY id ASC")
    .all() as ServiceRow[];
  res.json(services);
});

const availabilityQuerySchema = z.object({
  staffId: z.coerce.number().int().positive(),
  serviceId: z.coerce.number().int().positive(),
  date: z.string(),
});

router.get("/availability", (req, res) => {
  const parsed = availabilityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_QUERY", message: "Paramètres invalides." });
  }
  const { staffId, serviceId, date } = parsed.data;

  if (!isValidDateStr(date)) {
    return res.status(400).json({ error: "INVALID_DATE", message: "Date invalide." });
  }

  const service = db
    .prepare("SELECT * FROM services WHERE id = ? AND active = 1")
    .get(serviceId) as ServiceRow | undefined;
  if (!service) {
    return res.status(404).json({ error: "SERVICE_NOT_FOUND", message: "Service introuvable." });
  }

  const staff = db.prepare("SELECT * FROM staff WHERE id = ? AND active = 1").get(staffId) as
    | Staff
    | undefined;
  if (!staff) {
    return res.status(404).json({ error: "STAFF_NOT_FOUND", message: "Coiffeur introuvable." });
  }

  // On renvoie TOUS les créneaux (disponibles + réservés) pour que le client
  // voie l'ensemble de la journée. Seules l'heure et le statut sont exposés :
  // computeSlotsWithStatus ne lit jamais client_name / client_phone.
  const slots = computeSlotsWithStatus(staffId, date, service.duration_minutes);
  res.json({ date, staffId, serviceId, durationMinutes: service.duration_minutes, slots });
});

const createBookingSchema = z.object({
  staffId: z.coerce.number().int().positive(),
  serviceId: z.coerce.number().int().positive(),
  date: z.string(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  clientName: z.string().min(2).max(80),
  clientPhone: z.string().min(6).max(30),
});

router.post("/bookings", optionalClientAuth, (req: ClientAuthedRequest, res) => {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "INVALID_BODY", message: "Merci de vérifier les informations saisies." });
  }

  try {
    const confirmation = createBooking({
      ...parsed.data,
      clientId: req.clientId ?? null,
    });
    res.status(201).json(confirmation);
  } catch (err) {
    if (err instanceof BookingError) {
      const status = err.code === "SLOT_UNAVAILABLE" ? 409 : 400;
      return res.status(status).json({ error: err.code, message: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

router.get("/bookings/:id", (req, res) => {
  const appointment = db
    .prepare(
      `SELECT a.*, s.name_fr as service_name_fr, s.name_ar as service_name_ar, st.name as staff_name
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN staff st ON st.id = a.staff_id
       WHERE a.id = ?`
    )
    .get(req.params.id);

  if (!appointment) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Rendez-vous introuvable." });
  }
  res.json(appointment);
});

export default router;