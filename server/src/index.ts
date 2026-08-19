import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import publicRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import "./db.js"; // initialise + seed la base au démarrage

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// PORT doit être un nombre
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

// En production : le serveur sert aussi le build du client
const clientDist = path.join(__dirname, "..", "..", "client", "dist");

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();

    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Route inconnue
app.use((req, res) => {
  res.status(404).json({
    error: "NOT_FOUND",
    message: "Route introuvable.",
  });
});

// Écoute sur toutes les interfaces réseau
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Salon booking API en écoute sur le port ${PORT}`);
});