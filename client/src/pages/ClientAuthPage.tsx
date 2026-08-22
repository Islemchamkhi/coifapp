import React, { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";

import { useLanguage } from "../i18n/LanguageContext";
import { useClientAuth } from "../auth/ClientAuthContext";
import { ApiRequestError } from "../api/client";

export default function ClientAuthPage() {
  const { t, dir } = useLanguage();

  const {
    client,
    login,
    register,
  } = useClientAuth();

  const navigate = useNavigate();
  const location = useLocation();
  // Message optionnel transmis lors d'une redirection forcée
  // (ex. compte introuvable côté serveur -> déconnexion auto).
  const redirectMessage = (location.state as { message?: string } | null)?.message ?? null;

  const [mode, setMode] =
    useState<"login" | "register">("login");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [identifier, setIdentifier] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [error, setError] =
    useState<string | null>(null);

  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    if (client) {
      navigate("/account", {
        replace: true,
      });
    }
  }, [client, navigate]);

  async function submit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setError(null);

    // Certains navigateurs (Chrome/Edge) remplissent les champs via
    // leur gestionnaire de mots de passe sans déclencher l'événement
    // React onChange. Résultat : les champs sont visuellement remplis
    // mais l'état React (identifier/password/...) reste vide, et le
    // formulaire est soumis avec des valeurs vides.
    //
    // On lit donc les valeurs réellement présentes dans le <form>
    // via FormData au moment du submit, plutôt que de faire confiance
    // uniquement à l'état React — c'est la valeur "vraie" que
    // l'utilisateur voit à l'écran.
    const formData = new FormData(e.currentTarget);

    const identifierValue = String(
      formData.get("identifier") ?? identifier
    ).trim();

    const passwordValue = String(
      formData.get("password") ?? password
    ).trim();

    const nameValue = String(
      formData.get("name") ?? name
    ).trim();

    const phoneValue = String(
      formData.get("phone") ?? phone
    ).trim();

    const emailValue = String(
      formData.get("email") ?? email
    ).trim();

    if (
      mode === "register" &&
      passwordValue.length < 8
    ) {
      setError(t.passwordMinLength);
      return;
    }

    setSaving(true);

    try {
      if (mode === "login") {
        await login(
          identifierValue,
          passwordValue
        );
      } else {
        await register({
          name: nameValue,
          phone: phoneValue,
          email: emailValue,
          password: passwordValue,
        });
      }

      navigate("/account", {
        replace: true,
      });
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : t.errorGeneric
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      dir={dir}
      className="min-h-screen px-4 py-6"
    >
      <div className="max-w-md mx-auto">

        {/* HEADER */}
        <header className="flex items-center justify-between mb-6">
          <Link
            to="/"
            className="font-semibold text-zinc-100"
          >
            {t.brand}
          </Link>

          <Link
            to="/"
            className="text-sm text-zinc-400 hover:text-zinc-100"
          >
            {t.continueWithoutAccount}
          </Link>
        </header>

        {/* CARD */}
        <div className="card p-5">

          {redirectMessage && (
            <p className="text-amber-400 text-sm mb-4 pb-4 border-b border-ink-800">
              {redirectMessage}
            </p>
          )}

          <h1 className="text-xl font-semibold mb-1">
            {t.clientAccount}
          </h1>

          <p className="text-sm text-zinc-500 mb-5">
            {t.clientAccountHint}
          </p>

          {/* LOGIN / REGISTER */}
          <div className="grid grid-cols-2 gap-2 mb-5">

            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={
                mode === "login"
                  ? "btn-primary"
                  : "btn-secondary"
              }
            >
              {t.login}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className={
                mode === "register"
                  ? "btn-primary"
                  : "btn-secondary"
              }
            >
              {t.createAccount}
            </button>

          </div>

          {/* FORM */}
          <form
            onSubmit={submit}
            className="space-y-3"
          >

            {mode === "register" ? (
              <>
                {/* NAME */}
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">
                    {t.fullName}
                  </label>

                  <input
                    className="input-field"
                    name="name"
                    value={name}
                    onChange={(e) =>
                      setName(e.target.value)
                    }
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="name"
                  />
                </div>

                {/* PHONE */}
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">
                    {t.phone}
                  </label>

                  <input
                    className="input-field"
                    name="phone"
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value)
                    }
                    required
                    maxLength={30}
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </div>

                {/* EMAIL */}
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">
                    {t.email}
                  </label>

                  <input
                    className="input-field"
                    type="email"
                    name="email"
                    value={email}
                    onChange={(e) =>
                      setEmail(e.target.value)
                    }
                    required
                    maxLength={160}
                    autoComplete="email"
                  />
                </div>
              </>
            ) : (
              /* LOGIN IDENTIFIER */
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">
                  {t.emailOrPhone}
                </label>

                <input
                  className="input-field"
                  name="identifier"
                  value={identifier}
                  onChange={(e) =>
                    setIdentifier(e.target.value)
                  }
                  required
                  autoComplete="username"
                />
              </div>
            )}

            {/* PASSWORD */}
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">
                {t.password}
              </label>

              <input
                className="input-field"
                type="password"
                name="password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                required
                minLength={
                  mode === "register"
                    ? 8
                    : 1
                }
                autoComplete={
                  mode === "register"
                    ? "new-password"
                    : "current-password"
                }
              />

              {mode === "register" && (
                <p className="text-xs text-zinc-500 mt-1">
                  {t.passwordHint}
                </p>
              )}
            </div>

            {/* ERROR */}
            {error && (
              <p className="text-red-400 text-sm">
                {error}
              </p>
            )}

            {/* SUBMIT */}
            <button
              disabled={saving}
              className="btn-primary w-full"
              type="submit"
            >
              {saving
                ? t.loading
                : mode === "login"
                ? t.login
                : t.createAccount}
            </button>

          </form>

          {/* CONTINUE WITHOUT ACCOUNT */}
          <Link
            to="/"
            className="btn-secondary block text-center mt-3"
          >
            {t.continueWithoutAccount}
          </Link>

        </div>
      </div>
    </div>
  );
}