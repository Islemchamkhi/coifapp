import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath =
  process.env.DB_PATH || path.join(__dirname, "..", "data", "salon.db");

// Ensure data directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_fr TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  service_id INTEGER REFERENCES services(id),
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  client_name TEXT,
  client_phone TEXT,

  status TEXT NOT NULL DEFAULT 'confirmed',

  notes TEXT,

  -- Heure réelle d'arrivée du client
  arrived_at TEXT,

  -- Heure de fin réelle du rendez-vous
  completed_at TEXT,

  -- Retard en minutes
  delay_minutes INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appt_staff_date
  ON appointments(staff_id, date);

CREATE INDEX IF NOT EXISTS idx_appt_date
  ON appointments(date);

CREATE INDEX IF NOT EXISTS idx_appt_phone
  ON appointments(client_phone);

-- Anti double-booking
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_appt_slot
  ON appointments(staff_id, date, start_time)
  WHERE status IN ('confirmed', 'blocked');

-- Notifications admin (nouvelle réservation, etc.)
-- Table purement additive : ne touche jamais aux données existantes.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'new_booking',
  appointment_id TEXT REFERENCES appointments(id),

  title TEXT NOT NULL,
  message TEXT NOT NULL,

  -- Copie dénormalisée au moment de la création : la notification reste
  -- lisible même si le rendez-vous est ensuite modifié ou annulé.
  date TEXT,
  start_time TEXT,
  client_name TEXT,
  service_name_fr TEXT,
  staff_name TEXT,

  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_read_created
  ON notifications(read_at, created_at);
`);

/*
 * ---------------------------------------------------------
 * MIGRATION
 * ---------------------------------------------------------
 *
 * Si la base existe déjà, les nouvelles colonnes sont ajoutées
 * sans supprimer les rendez-vous existants.
 */

function addColumnIfMissing(
  table: string,
  column: string,
  definition: string
) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];

  const exists = columns.some((c) => c.name === column);

  if (!exists) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
  }
}

addColumnIfMissing(
  "appointments",
  "arrived_at",
  "TEXT"
);

addColumnIfMissing(
  "appointments",
  "completed_at",
  "TEXT"
);

addColumnIfMissing(
  "appointments",
  "delay_minutes",
  "INTEGER NOT NULL DEFAULT 0"
);

/*
 * ---------------------------------------------------------
 * SEED STAFF
 * ---------------------------------------------------------
 */

const staffCount = db.prepare(
  "SELECT COUNT(*) as c FROM staff"
).get() as { c: number };

if (staffCount.c === 0) {
  const insertStaff = db.prepare(
    "INSERT INTO staff (name, active) VALUES (?, 1)"
  );

  insertStaff.run("Abdou");
  insertStaff.run("Rayen");
}

/*
 * ---------------------------------------------------------
 * SEED SERVICES
 * ---------------------------------------------------------
 */

const serviceCount = db.prepare(
  "SELECT COUNT(*) as c FROM services"
).get() as { c: number };

if (serviceCount.c === 0) {
  const insertService = db.prepare(
    `INSERT INTO services
      (name_fr, name_ar, duration_minutes, active)
     VALUES (?, ?, ?, 1)`
  );

  insertService.run(
    "Coupe cheveux",
    "قص شعر",
    20
  );

  insertService.run(
    "Coupe cheveux + barbe",
    "قص شعر + لحية",
    30
  );

  insertService.run(
    "Autre service",
    "خدمة أخرى",
    30
  );
}

export default db;