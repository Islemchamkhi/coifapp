import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import publicRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

app.use("/api", publicRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
  });
});

// Serveur le frontend React/Vite en production
const clientDist = path.join(__dirname, "..", "..", "client", "dist");

if (fs.existsSync(clientDist)) {
  console.log(`📁 Frontend trouvé : ${clientDist}`);

  app.use(express.static(clientDist));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  console.log("⚠️ Dossier client/dist non trouvé.");
}

// Route 404
app.use((req, res) => {
  res.status(404).json({
    error: "NOT_FOUND",
    message: "Route introuvable.",
  });
});

// Démarrage du serveur
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Salon booking API en écoute sur le port ${PORT}`);
});