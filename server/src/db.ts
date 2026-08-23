import Database from "libsql";

/**
 * ============================================================
 * TURSO / LIBSQL DATABASE
 * ============================================================
 *
 * Production database = Turso Cloud.
 *
 * IMPORTANT:
 * - aucune base SQLite locale en production
 * - aucun fallback vers un fichier local
 * - si les variables Turso manquent, le serveur refuse de démarrer
 */

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

console.log("==============================================");
console.log("🗄️ DATABASE (Turso)");
console.log("==============================================");

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error(
    "❌ TURSO_DATABASE_URL et/ou TURSO_AUTH_TOKEN manquant(s)."
  );

  console.error(
    "Le serveur refuse de démarrer plutôt que de créer une base locale vide."
  );

  console.error("==============================================");

  throw new Error(
    "TURSO_DATABASE_URL et TURSO_AUTH_TOKEN doivent être définis."
  );
}

console.log(`📡 URL Turso : ${TURSO_DATABASE_URL}`);
console.log("✅ TURSO_DATABASE_URL configuré");
console.log("✅ TURSO_AUTH_TOKEN configuré");
console.log("==============================================");

export const db = new Database(TURSO_DATABASE_URL, {
  authToken: TURSO_AUTH_TOKEN,
} as unknown as Database.Options);

/**
 * ============================================================
 * COMPATIBILITÉ AVEC BETTER-SQLITE3
 * ============================================================
 */

const originalPrepare = db.prepare.bind(db);

db.prepare = ((sql: string) => {
  const stmt = originalPrepare(sql);

  const originalGet = stmt.get.bind(stmt);
  const originalRun = stmt.run.bind(stmt);

  stmt.get = (...args: unknown[]) => {
    const row = originalGet(...(args as []));

    if (
      row &&
      typeof row === "object" &&
      "_metadata" in row
    ) {
      const {
        _metadata,
        ...rest
      } = row as Record<string, unknown>;

      return rest;
    }

    return row;
  };

  stmt.run = (...args: unknown[]) => {
    const result = originalRun(...(args as []));

    if (
      result &&
      typeof result === "object" &&
      "duration" in result
    ) {
      const {
        duration,
        ...rest
      } = result as unknown as Record<string, unknown>;

      return rest as unknown as typeof result;
    }

    return result;
  };

  return stmt;
}) as typeof db.prepare;

/**
 * ============================================================
 * FOREIGN KEYS
 * ============================================================
 */

try {
  db.exec("PRAGMA foreign_keys = ON;");
} catch (error) {
  console.warn(
    "⚠️ Impossible d'activer PRAGMA foreign_keys sur Turso :",
    error
  );
}

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
    price REAL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone
    ON clients(phone);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email
    ON clients(email)
    WHERE email IS NOT NULL;

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

  CREATE INDEX IF NOT EXISTS idx_appt_client_id
    ON appointments(client_id);

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
 * SAFE ADDITIVE MIGRATIONS
 * ============================================================
 */

function addColumnIfMissing(
  table: string,
  column: string,
  definition: string
) {
  try {
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
  } catch (error) {
    console.warn(
      `⚠️ Vérification de ${table}.${column} ignorée :`,
      error
    );
  }
}

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

addColumnIfMissing(
  "services",
  "price",
  "REAL"
);

/**
 * ============================================================
 * MIGRATION SERVICES.PRICE
 * ============================================================
 *
 * Ancien schéma possible :
 *
 * price REAL NOT NULL DEFAULT 0
 *
 * Nouveau schéma :
 *
 * price REAL
 *
 * Donc :
 *
 * NULL = aucun prix renseigné
 * 25   = 25 DT
 * 30.5 = 30.5 DT
 *
 * IMPORTANT :
 * On ne doit PAS faire DROP TABLE services avec les
 * foreign keys actives car appointments.service_id référence
 * services(id).
 *
 * On désactive temporairement les foreign keys pendant la
 * reconstruction de la table.
 *
 * Les IDs sont conservés.
 * Les rendez-vous sont conservés.
 */

function migratePriceToNullable() {
  try {
    const columns = db
      .prepare("PRAGMA table_info(services)")
      .all() as {
        name: string;
        notnull: number;
      }[];

    const priceColumn = columns.find(
      (column) => column.name === "price"
    );

    if (!priceColumn) {
      return;
    }

    if (priceColumn.notnull === 0) {
      console.log(
        "✅ services.price est déjà nullable."
      );
      return;
    }

    console.log(
      "🔧 Migration services.price -> nullable..."
    );

    /**
     * Vérification préalable :
     * tous les appointments doivent référencer des services
     * existants ou avoir service_id = NULL.
     */
    const invalidReferences = db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM appointments a
        LEFT JOIN services s
          ON s.id = a.service_id
        WHERE a.service_id IS NOT NULL
          AND s.id IS NULL
      `)
      .get() as { count: number };

    if (invalidReferences.count > 0) {
      throw new Error(
        `Impossible de migrer services.price : ${invalidReferences.count} rendez-vous ont un service_id invalide.`
      );
    }

    /**
     * IMPORTANT :
     * PRAGMA foreign_keys doit être désactivé AVANT
     * la reconstruction de la table.
     */
    db.exec("PRAGMA foreign_keys = OFF;");

    try {
      db.exec(`
        CREATE TABLE services_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name_fr TEXT NOT NULL,
          name_ar TEXT NOT NULL,
          duration_minutes INTEGER NOT NULL,
          price REAL,
          active INTEGER NOT NULL DEFAULT 1
        );
      `);

      /**
       * Conservation exacte des IDs.
       *
       * Les anciens 0 deviennent NULL car ils représentaient
       * l'absence de prix dans l'ancien système.
       */
      db.exec(`
        INSERT INTO services_new (
          id,
          name_fr,
          name_ar,
          duration_minutes,
          price,
          active
        )
        SELECT
          id,
          name_fr,
          name_ar,
          duration_minutes,
          CASE
            WHEN price = 0 THEN NULL
            ELSE price
          END,
          active
        FROM services;
      `);

      /**
       * Suppression de l'ancienne table.
       *
       * Les foreign keys sont temporairement désactivées.
       */
      db.exec(`
        DROP TABLE services;
      `);

      db.exec(`
        ALTER TABLE services_new
        RENAME TO services;
      `);

      /**
       * Vérification finale.
       */
      const migratedColumns = db
        .prepare("PRAGMA table_info(services)")
        .all() as {
          name: string;
          notnull: number;
        }[];

      const migratedPrice = migratedColumns.find(
        (column) => column.name === "price"
      );

      if (!migratedPrice || migratedPrice.notnull !== 0) {
        throw new Error(
          "La migration services.price n'a pas rendu la colonne nullable."
        );
      }

      console.log(
        "✅ Migration services.price terminée."
      );
    } finally {
      /**
       * On réactive les foreign keys même si une erreur
       * survient pendant la migration.
       */
      db.exec("PRAGMA foreign_keys = ON;");
    }

    /**
     * Vérification d'intégrité référentielle.
     */
    const foreignKeyCheck = db
      .prepare("PRAGMA foreign_key_check")
      .all();

    if (foreignKeyCheck.length > 0) {
      console.error(
        "❌ PRAGMA foreign_key_check a détecté des problèmes :",
        foreignKeyCheck
      );

      throw new Error(
        "La migration services.price a créé une incohérence de foreign keys."
      );
    }

    console.log(
      "✅ Vérification des foreign keys terminée."
    );
  } catch (error) {
    console.error(
      "❌ Migration services.price -> nullable échouée :",
      error
    );

    throw error;
  }
}

migratePriceToNullable();

/**
 * ============================================================
 * SEED STAFF
 * ============================================================
 *
 * IMPORTANT :
 * On vérifie chaque coiffeur individuellement.
 *
 * Cela permet de restaurer Abdou si absent sans recréer Rayen.
 */

const REQUIRED_STAFF = [
  "Rayen",
  "Abdou",
];

const findStaffByName = db.prepare(
  "SELECT id FROM staff WHERE name = ?"
);

const insertStaff = db.prepare(
  "INSERT INTO staff (name, active) VALUES (?, 1)"
);

for (const staffName of REQUIRED_STAFF) {
  const existing = findStaffByName.get(
    staffName
  ) as { id: number } | undefined;

  if (!existing) {
    console.log(
      `🌱 Coiffeur manquant détecté : ${staffName}`
    );

    insertStaff.run(staffName);
  }
}

/**
 * ============================================================
 * SEED SERVICES
 * ============================================================
 *
 * Les services manquants sont ajoutés individuellement.
 *
 * IMPORTANT :
 * price = null signifie :
 * "aucun prix renseigné".
 *
 * Aucun service sans prix ne recevra 0 DT.
 */

const REQUIRED_SERVICES: {
  name_fr: string;
  name_ar: string;
  duration_minutes: number;
  price: number | null;
}[] = [
  {
    name_fr: "Coupe cheveux",
    name_ar: "قص شعر",
    duration_minutes: 30,
    price: null,
  },

  {
    name_fr: "Coupe cheveux + barbe",
    name_ar: "قص شعر + لحية",
    duration_minutes: 45,
    price: null,
  },

  {
    name_fr: "Autre service",
    name_ar: "خدمة أخرى",
    duration_minutes: 50,
    price: null,
  },

  {
    name_fr: "Coloration",
    name_ar: "صبغة",
    duration_minutes: 60,
    price: null,
  },

  {
    name_fr: "Kératine",
    name_ar: "كيراتين",
    duration_minutes: 90,
    price: null,
  },
];

const findServiceByNameFr = db.prepare(
  "SELECT id FROM services WHERE name_fr = ?"
);

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

for (const service of REQUIRED_SERVICES) {
  const existing = findServiceByNameFr.get(
    service.name_fr
  ) as { id: number } | undefined;

  if (!existing) {
    console.log(
      `🌱 Service manquant détecté : ${service.name_fr}`
    );

    insertService.run(
      service.name_fr,
      service.name_ar,
      service.duration_minutes,
      service.price
    );
  }
}

/**
 * ============================================================
 * MIGRATION ANCIENNES DURÉES
 * ============================================================
 *
 * On corrige uniquement les anciennes valeurs connues.
 *
 * Si l'admin a déjà modifié une durée vers une autre valeur,
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
 * BOOKING SETTINGS
 * ============================================================
 */

const bookingSettingsCount = db
  .prepare(
    "SELECT COUNT(*) AS c FROM booking_settings"
  )
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

/**
 * ============================================================
 * FIN
 * ============================================================
 */

console.log(
  "=============================================="
);

console.log(
  "✅ Turso connecté et schéma vérifié avec succès."
);

console.log(
  "👨‍💇 Coiffeurs requis : Rayen + Abdou"
);

console.log(
  "✂️ Services requis vérifiés."
);

console.log(
  "💰 Prix optionnel : NULL = aucun prix."
);

console.log(
  "=============================================="
);

export default db;