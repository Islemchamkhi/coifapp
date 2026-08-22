import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";

import App from "./App";
import { ClientAuthProvider } from "./auth/ClientAuthContext";
import { LanguageProvider } from "./i18n/LanguageContext";

import "./styles/index.css";

/**
 * ============================================================
 * MISE À JOUR AUTOMATIQUE DU SERVICE WORKER (PWA)
 * ============================================================
 *
 * Sans ce code, un onglet resté ouvert avant un déploiement peut
 * continuer d'exécuter l'ancien JavaScript indéfiniment, même
 * après un rechargement partiel côté React (ex. déconnexion),
 * puisqu'une navigation SPA ne re-télécharge pas les fichiers.
 *
 * Ici, dès qu'une nouvelle version est détectée en arrière-plan,
 * on recharge automatiquement la page pour que l'utilisateur ait
 * toujours le code le plus récent, sans avoir à vider son cache
 * manuellement.
 */
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload();
  },
});

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <ClientAuthProvider>
          <App />
        </ClientAuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
);