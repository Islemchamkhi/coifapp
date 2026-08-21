import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ============================================================
 * DATABASE PATH
 * ============================================================
 *
 * LOCAL :
 *   server/data/salon.db
 *
 * PRODUCTION :
 *   DB_PATH=/var/data/salon.db
 *
 * IMPORTANT :
 * En production, /var/data doit être le mountPath d'un
 * Persistent Disk Render.
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

// Crée le dossier si nécessaire
fs.mkdirSync(path.dirname(dbPath), {
  recursive: true,
});

console.log("==============================================");
console.log("🗄️  DATABASE");
console.log("==============================================");
console.log(`📁 DB path: ${dbPath}`);

if (process.env.DB_PATH) {
  console.log("✅ DB_PATH configuré");
} else {
  console.log("⚠️ DB_PATH non configuré");
  console.log("   Utilisation du chemin local par défaut.");
}

console.log("==============================================");

// Connexion SQLite
export const db = new Database(dbPath);

// SQLite configuration
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

  CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email ON clients(email);

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

    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,

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

  /**
   * Empêche uniquement deux rendez-vous ACTIFS
   * d'avoir exactement le même début pour le même coiffeur.
   *
   * La vérification du chevauchement réel doit également
   * être faite dans le service de disponibilité / création
   * de réservation.
   */
  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_appt_slot
    ON appointments(staff_id, date, start_time)
    WHERE status IN ('confirmed', 'blocked');

  /**
   * Notifications
   */
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
`);

/**
 * ============================================================
 * SAFE MIGRATIONS
 * ============================================================
 *
 * Ces migrations ajoutent uniquement les colonnes manquantes.
 * Aucune donnée existante n'est supprimée.
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

addColumnIfMissing(
  "appointments",
  "client_id",
  "INTEGER REFERENCES clients(id) ON DELETE SET NULL"
);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_appt_client_id
    ON appointments(client_id);
`);

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

/**
 * ============================================================
 * SEED STAFF
 * ============================================================
 *
 * Les seeds ne sont exécutés que si la table est vide.
 * Les données existantes ne sont jamais supprimées.
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
      active
    )
    VALUES (?, ?, ?, 1)
  `);

  const insertMany = db.transaction(() => {
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
  });

  insertMany();
}

console.log("✅ SQLite initialisée avec succès.");

export default db;