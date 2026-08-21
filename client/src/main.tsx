import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { ClientAuthProvider } from "./auth/ClientAuthContext";
import { LanguageProvider } from "./i18n/LanguageContext";

import "./styles/index.css";

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