import "dotenv/config";

import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import publicRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import clientAuthRoutes from "./routes/clientAuth.js";

import {
  db,
  dbPath,
} from "./db.js";

/**
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT =
  Number(process.env.PORT) || 4000;

/**
 * ============================================================
 * MIDDLEWARES
 * ============================================================
 */

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

/**
 * ============================================================
 * API
 * ============================================================
 */

app.use("/api", publicRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/client-auth", clientAuthRoutes);

/**
 * ============================================================
 * HEALTH CHECK
 * ============================================================
 *
 * Cette route permet de vérifier :
 *
 * - que le serveur fonctionne ;
 * - quel fichier SQLite est utilisé ;
 * - combien de réservations existent ;
 * - quelle est la plus ancienne réservation.
 */

app.get("/api/health", (_req, res) => {
  try {
    const count = db
      .prepare(
        "SELECT COUNT(*) AS c FROM appointments"
      )
      .get() as {
        c: number;
      };

    const oldest = db
      .prepare(
        "SELECT MIN(date) AS d FROM appointments"
      )
      .get() as {
        d: string | null;
      };

    const newest = db
      .prepare(
        "SELECT MAX(date) AS d FROM appointments"
      )
      .get() as {
        d: string | null;
      };

    res.status(200).json({
      ok: true,

      message:
        "Salon Booking API fonctionne correctement.",

      time:
        new Date().toISOString(),

      database: {
        path: dbPath,

        appointmentsCount:
          count.c,

        oldestAppointmentDate:
          oldest.d,

        newestAppointmentDate:
          newest.d,

        dbPathConfigured:
          Boolean(process.env.DB_PATH),

        persistentPath:
          process.env.DB_PATH ===
          "/var/data/salon.db",
      },
    });
  } catch (error) {
    console.error(
      "❌ Health check database error:",
      error
    );

    res.status(500).json({
      ok: false,

      message:
        "La base de données n'est pas accessible.",

      database: {
        path: dbPath,
      },
    });
  }
});

/**
 * ============================================================
 * FRONTEND
 * ============================================================
 */

const clientDist = path.resolve(
  __dirname,
  "../../client/dist"
);

if (fs.existsSync(clientDist)) {
  console.log(
    `📁 Frontend trouvé : ${clientDist}`
  );

  app.use(
    express.static(clientDist)
  );

  app.get("*", (req, res, next) => {
    if (
      req.path.startsWith("/api")
    ) {
      return next();
    }

    res.sendFile(
      path.join(
        clientDist,
        "index.html"
      )
    );
  });
} else {
  console.warn(
    `⚠️ Frontend introuvable : ${clientDist}`
  );
}

/**
 * ============================================================
 * API 404
 * ============================================================
 */

app.use((req, res) => {
  res.status(404).json({
    error: "NOT_FOUND",

    message:
      "Route introuvable.",
  });
});

/**
 * ============================================================
 * SERVER
 * ============================================================
 */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `✅ Salon Booking API en écoute sur 0.0.0.0:${PORT}`
    );

    console.log(
      `🗄️ SQLite : ${dbPath}`
    );
  }
);