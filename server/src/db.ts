import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "salon.db");

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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appt_staff_date ON appointments(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appt_phone ON appointments(client_phone);

-- Filet de sécurité anti double-booking au niveau base de données : deux
-- rendez-vous actifs (confirmé ou bloqué) ne peuvent pas partager exactement
-- le même coiffeur + date + heure de début. La vérification applicative
-- (transaction dans booking.ts) reste la protection principale contre les
-- chevauchements de durées différentes ; cet index couvre le cas exact et
-- protège contre toute course concurrente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_appt_slot
  ON appointments(staff_id, date, start_time)
  WHERE status IN ('confirmed', 'blocked');
`);

// Seed staff & services on first run only
const staffCount = db.prepare("SELECT COUNT(*) as c FROM staff").get() as { c: number };
if (staffCount.c === 0) {
  const insertStaff = db.prepare("INSERT INTO staff (name, active) VALUES (?, 1)");
  insertStaff.run("Abdou");
  insertStaff.run("Rayen");
}

const serviceCount = db.prepare("SELECT COUNT(*) as c FROM services").get() as { c: number };
if (serviceCount.c === 0) {
  const insertService = db.prepare(
    "INSERT INTO services (name_fr, name_ar, duration_minutes, active) VALUES (?, ?, ?, 1)"
  );
  insertService.run("Coupe cheveux", "قص شعر", 20);
  insertService.run("Coupe cheveux + barbe", "قص شعر + لحية", 30);
  insertService.run("Autre service", "خدمة أخرى", 30);
}

export default db;