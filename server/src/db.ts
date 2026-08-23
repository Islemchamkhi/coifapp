import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ============================================================
 * DATABASE PATH
 * ============================================================
 */

const defaultDbPath = path.join(
  __dirname,
  "..",
  "data",
  "salon.db"
);

export const dbPath = path.resolve(
  process.env.DB_PATH || defaultDbPath
);

fs.mkdirSync(path.dirname(dbPath), {
  recursive: true,
});

console.log("==============================================");
console.log("🗄️ DATABASE");
console.log("==============================================");
console.log(`📁 DB path: ${dbPath}`);

if (process.env.DB_PATH) {
  console.log("✅ DB_PATH configuré");
} else {
  console.log("⚠️ DB_PATH non configuré");
  console.log("   Utilisation du chemin local par défaut.");
}

console.log("==============================================");

export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

/**
 * ============================================================
 * TABLES
 * ============================================================
 */

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
    price INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone
    ON clients(phone);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email
    ON clients(email);

  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,

    staff_id INTEGER NOT NULL
      REFERENCES staff(id),

    service_id INTEGER
      REFERENCES services(id),

    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,

    client_name TEXT,
    client_phone TEXT,

    client_id INTEGER
      REFERENCES clients(id)
      ON DELETE SET NULL,

    status TEXT NOT NULL DEFAULT 'confirmed',

    notes TEXT,

    arrived_at TEXT,
    completed_at TEXT,

    delay_minutes INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_appt_staff_date
    ON appointments(staff_id, date);

  CREATE INDEX IF NOT EXISTS idx_appt_date
    ON appointments(date);

  CREATE INDEX IF NOT EXISTS idx_appt_phone
    ON appointments(client_phone);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_appt_slot
    ON appointments(staff_id, date, start_time)
    WHERE status IN ('confirmed', 'blocked');

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,

    type TEXT NOT NULL DEFAULT 'new_booking',

    appointment_id TEXT
      REFERENCES appointments(id),

    title TEXT NOT NULL,
    message TEXT NOT NULL,

    date TEXT,
    start_time TEXT,

    client_name TEXT,
    service_name_fr TEXT,
    staff_name TEXT,

    read_at TEXT,

    created_at TEXT NOT NULL
      DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_read_created
    ON notifications(read_at, created_at);

  CREATE TABLE IF NOT EXISTS booking_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),

    booking_mode TEXT NOT NULL DEFAULT 'interval'
      CHECK (booking_mode IN ('interval', 'flexible')),

    booking_interval_minutes INTEGER NOT NULL DEFAULT 5
      CHECK (booking_interval_minutes IN (5, 10, 15, 30)),

    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/**
 * ============================================================
 * SAFE MIGRATIONS
 * ============================================================
 */

function addColumnIfMissing(
  table: string,
  column: string,
  definition: string
) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];

  const exists = columns.some(
    (item) => item.name === column
  );

  if (!exists) {
    console.log(
      `🔧 Migration: ajout de ${table}.${column}`
    );

    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
  }
}

/**
 * ------------------------------------------------------------
 * APPOINTMENTS MIGRATIONS
 * ------------------------------------------------------------
 */

addColumnIfMissing(
  "appointments",
  "client_id",
  "INTEGER REFERENCES clients(id) ON DELETE SET NULL"
);

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

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_appt_client_id
    ON appointments(client_id);
`);

/**
 * ------------------------------------------------------------
 * SERVICES MIGRATION
 * ------------------------------------------------------------
 *
 * Ajoute le prix aux anciennes bases.
 */

addColumnIfMissing(
  "services",
  "price",
  "INTEGER NOT NULL DEFAULT 0"
);

/**
 * ============================================================
 * SEED STAFF
 * ============================================================
 */

const staffCount = db
  .prepare("SELECT COUNT(*) AS c FROM staff")
  .get() as { c: number };

if (staffCount.c === 0) {
  console.log("🌱 Création des coiffeurs par défaut...");

  const insertStaff = db.prepare(
    "INSERT INTO staff (name, active) VALUES (?, 1)"
  );

  const insertMany = db.transaction(() => {
    insertStaff.run("Abdou");
    insertStaff.run("Rayen");
  });

  insertMany();
}

/**
 * ============================================================
 * SEED SERVICES
 * ============================================================
 *
 * IMPORTANT :
 * Le seed ne remplace JAMAIS les modifications faites par
 * l'admin.
 *
 * Les nouveaux services sont ajoutés uniquement si la table
 * est vide.
 */

const serviceCount = db
  .prepare("SELECT COUNT(*) AS c FROM services")
  .get() as { c: number };

if (serviceCount.c === 0) {
  console.log("🌱 Création des services par défaut...");

  const insertService = db.prepare(`
    INSERT INTO services (
      name_fr,
      name_ar,
      duration_minutes,
      price,
      active
    )
    VALUES (?, ?, ?, ?, 1)
  `);

  const insertMany = db.transaction(() => {
    insertService.run(
      "Coupe cheveux",
      "قص شعر",
      30,
      0
    );

    insertService.run(
      "Coupe cheveux + barbe",
      "قص شعر + لحية",
      45,
      0
    );

    insertService.run(
      "Autre service",
      "خدمة أخرى",
      50,
      0
    );

    insertService.run(
      "Coloration",
      "صبغة",
      60,
      0
    );

    insertService.run(
      "Kératine",
      "كيراتين",
      90,
      0
    );
  });

  insertMany();
}

/**
 * ============================================================
 * MIGRATION DES ANCIENS SERVICES
 * ============================================================
 *
 * IMPORTANT :
 * On corrige uniquement les anciennes valeurs par défaut.
 *
 * Si l'admin avait déjà changé manuellement une durée,
 * elle n'est PAS écrasée.
 */

db.prepare(`
  UPDATE services
  SET duration_minutes = 30
  WHERE name_fr = 'Coupe cheveux'
    AND duration_minutes = 20
`).run();

db.prepare(`
  UPDATE services
  SET duration_minutes = 45
  WHERE name_fr = 'Coupe cheveux + barbe'
    AND duration_minutes = 30
`).run();

db.prepare(`
  UPDATE services
  SET duration_minutes = 50
  WHERE name_fr = 'Autre service'
    AND duration_minutes = 30
`).run();

/**
 * ============================================================
 * SEED BOOKING SETTINGS
 * ============================================================
 */

const bookingSettingsCount = db
  .prepare("SELECT COUNT(*) AS c FROM booking_settings")
  .get() as { c: number };

if (bookingSettingsCount.c === 0) {
  console.log(
    "🌱 Création des paramètres de réservation par défaut..."
  );

  db.prepare(`
    INSERT INTO booking_settings (
      id,
      booking_mode,
      booking_interval_minutes
    )
    VALUES (1, 'interval', 5)
  `).run();
}

console.log("✅ SQLite initialisée avec succès.");

export default db;