import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import publicRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import "./db.js"; // Initialise + seed la base au démarrage

// ======================================================
// CONFIGURATION
// ======================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Render fournit automatiquement process.env.PORT.
// En local, on utilise 4000.
const PORT = Number(process.env.PORT) || 4000;

// ======================================================
// MIDDLEWARES
// ======================================================

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

// ======================================================
// API ROUTES
// ======================================================

app.use("/api", publicRoutes);
app.use("/api/admin", adminRoutes);

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    message: "Salon Booking API fonctionne correctement.",
    time: new Date().toISOString(),
  });
});

// ======================================================
// FRONTEND REACT / VITE
// ======================================================

// En développement :
// server/dist/index.js
// En production après npm run build :
// server/dist/index.js
//
// On remonte donc de server/dist vers la racine,
// puis vers client/dist.

const clientDist = path.resolve(__dirname, "../../client/dist");

if (fs.existsSync(clientDist)) {
  console.log(`📁 Frontend trouvé : ${clientDist}`);

  // Sert les fichiers statiques du frontend
  app.use(express.static(clientDist));

  // React Router :
  // toutes les routes qui ne sont pas /api
  // renvoient vers index.html.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  console.warn(`⚠️ Frontend introuvable : ${clientDist}`);
}

// ======================================================
// ROUTE 404 API
// ======================================================

app.use((req, res) => {
  res.status(404).json({
    error: "NOT_FOUND",
    message: "Route introuvable.",
  });
});

// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `✅ Salon booking API en écoute sur http://0.0.0.0:${PORT}`
  );
});