import Database from "libsql";

/**
 * ============================================================
 * CONNEXION TURSO (libSQL cloud)
 * ============================================================
 *
 * Le projet n'utilise plus de fichier SQLite local en
 * production : la base de données vit désormais chez Turso
 * (cloud, SQLite-compatible, persistante).
 *
 * Pourquoi ce changement :
 * Render Free ne fournit pas de disque persistant — le
 * fichier SQLite local était donc effacé à chaque redémarrage
 * / redéploiement, ce qui faisait "disparaître" les comptes
 * clients et les rendez-vous.
 *
 * IMPORTANT (sécurité / fiabilité) :
 * Si TURSO_DATABASE_URL ou TURSO_AUTH_TOKEN manquent, le
 * serveur s'arrête avec une erreur explicite plutôt que de
 * retomber silencieusement sur une base locale vide — une
 * base vide qui "marche" sans prévenir serait bien pire qu'un
 * crash au démarrage.
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
    "   Le serveur refuse de démarrer plutôt que de créer"
  );
  console.error(
    "   silencieusement une base de données vide."
  );
  console.error("==============================================");

  throw new Error(
    "TURSO_DATABASE_URL et TURSO_AUTH_TOKEN doivent être définis dans les variables d'environnement."
  );
}

console.log(`📡 URL Turso : ${TURSO_DATABASE_URL}`);
console.log("✅ TURSO_DATABASE_URL configuré");
console.log("✅ TURSO_AUTH_TOKEN configuré");
console.log("==============================================");

// ------------------------------------------------------------
// `authToken` fonctionne bien à l'exécution (voir la doc
// officielle libsql-js), mais manque encore dans les
// définitions TypeScript fournies par le package à l'heure où
// ce code est écrit. Le cast ci-dessous contourne uniquement
// ce trou de typage, sans rien changer au comportement réel.
// ------------------------------------------------------------

export const db = new Database(TURSO_DATABASE_URL, {
  authToken: TURSO_AUTH_TOKEN,
} as unknown as Database.Options);

// ------------------------------------------------------------
// PARITÉ DE COMPORTEMENT AVEC better-sqlite3
//
// Contrairement à better-sqlite3, ce driver ajoute un champ
// `_metadata` (durée de la requête) sur les résultats de
// `.get()`, et un champ `duration` sur les résultats de
// `.run()`. Comme plusieurs routes existantes renvoient un
// résultat de `.get()` directement au client
// (`res.json(appointment)`, etc.), ce champ technique se
// retrouverait sinon dans les réponses de l'API.
//
// On l'enlève une seule fois ici, pour TOUTES les requêtes,
// plutôt que de modifier chaque route une par une.
// ------------------------------------------------------------

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
      } = result as unknown as Record
        string,
        unknown
      >;

      return rest as unknown as typeof result;
    }

    return result;
  };

  return stmt;
}) as typeof db.prepare;

// L'intégrité référentielle (ON DELETE SET NULL, etc.) doit
// rester active. `.pragma()` n'est pas supporté par ce
// driver ; on passe donc par du SQL brut via `.exec()`. Ne
// bloque jamais le démarrage si le pragma échoue à distance :
// c'est une protection supplémentaire, pas une exigence dure.
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
 *
 * Base neuve chez Turso : le schéma ci-dessous est directement
 * la version FINALE (déjà avec email facultatif sur clients,
 * déjà avec toutes les colonnes de appointments). Comme il n'y
 * a pas d'anciennes lignes à transformer, on n'a plus besoin
 * de la migration de reconstruction de table qui existait pour
 * l'ancienne base SQLite locale.
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
 * SAFE MIGRATIONS
 * ============================================================
 *
 * Conservées pour la même raison qu'avant : si Turso est un
 * jour réinitialisé à partir d'un ancien dump, ou si de
 * nouvelles colonnes sont ajoutées plus tard, ces migrations
 * additives restent utiles et sans danger (elles ne font rien
 * si la colonne existe déjà).
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
    // Le schéma créé ci-dessus contient déjà toutes ces
    // colonnes sur une base Turso neuve : si PRAGMA
    // table_info n'est pas disponible à distance, ce n'est
    // pas bloquant.
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
  "INTEGER NOT NULL DEFAULT 0"
);

/**
 * ============================================================
 * SEED STAFF
 * ============================================================
 *
 * IMPORTANT (correction du bug "Abdou disparu après Turso") :
 * L'ancienne version de ce bloc ne vérifiait que
 * `COUNT(*) === 0` sur toute la table `staff`. Après le passage
 * à Turso, la table contenait déjà 1 ligne (Rayen) au moment du
 * premier démarrage du serveur sur Turso : la condition
 * `staffCount.c === 0` était donc fausse dès le premier lancement,
 * et Abdou n'a plus jamais été recréé automatiquement, même après
 * de nombreux redéploiements.
 *
 * Correction : on vérifie désormais l'existence de CHAQUE
 * coiffeur requis individuellement, par son nom, plutôt que de se
 * fier au nombre total de lignes. Un coiffeur déjà présent
 * (Rayen) n'est jamais recréé ni dupliqué ; seul un coiffeur
 * manquant (Abdou) est ajouté, avec exactement les mêmes champs
 * que l'ancien système (name, active = 1). Aucune autre donnée
 * (id, rendez-vous, clients, services) n'est touchée.
 */

const REQUIRED_STAFF = ["Rayen", "Abdou"];

const findStaffByName = db.prepare(
  "SELECT id FROM staff WHERE name = ?"
);

const insertStaff = db.prepare(
  "INSERT INTO staff (name, active) VALUES (?, 1)"
);

for (const staffName of REQUIRED_STAFF) {
  const existing = findStaffByName.get(staffName) as
    | { id: number }
    | undefined;

  if (!existing) {
    console.log(
      `🌱 Coiffeur manquant détecté sur Turso, création de : ${staffName}`
    );
    insertStaff.run(staffName);
  }
}

/**
 * ============================================================
 * SEED SERVICES
 * ============================================================
 *
 * IMPORTANT (correction du bug "Coupe cheveux disparu après Turso") :
 * Même cause que pour le staff : ce bloc ne vérifiait que
 * `COUNT(*) === 0` sur toute la table `services`. Après le
 * passage à Turso, la table contenait déjà 4 lignes (tous les
 * services sauf "Coupe cheveux") au premier démarrage, donc la
 * condition était fausse dès le départ et "Coupe cheveux" n'a
 * plus jamais été recréé.
 *
 * Correction : on vérifie l'existence de CHAQUE service requis
 * individuellement, par son `name_fr`, plutôt que par le nombre
 * total de lignes. Un service déjà présent n'est jamais recréé
 * ni dupliqué (et ses éventuelles modifications faites depuis
 * l'admin ne sont donc jamais écrasées) ; seul un service
 * manquant est ajouté, avec exactement les mêmes valeurs que
 * l'ancien système.
 */

const REQUIRED_SERVICES: {
  name_fr: string;
  name_ar: string;
  duration_minutes: number;
  price: number;
}[] = [
  {
    name_fr: "Coupe cheveux",
    name_ar: "قص شعر",
    duration_minutes: 30,
    price: 0,
  },
  {
    name_fr: "Coupe cheveux + barbe",
    name_ar: "قص شعر + لحية",
    duration_minutes: 45,
    price: 0,
  },
  {
    name_fr: "Autre service",
    name_ar: "خدمة أخرى",
    duration_minutes: 50,
    price: 0,
  },
  {
    name_fr: "Coloration",
    name_ar: "صبغة",
    duration_minutes: 60,
    price: 0,
  },
  {
    name_fr: "Kératine",
    name_ar: "كيراتين",
    duration_minutes: 90,
    price: 0,
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
      `🌱 Service manquant détecté sur Turso, création de : ${service.name_fr}`
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

console.log("✅ Turso connecté et schéma vérifié avec succès.");

export default db;