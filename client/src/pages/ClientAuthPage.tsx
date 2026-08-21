import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

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
    e: React.FormEvent
  ) {
    e.preventDefault();

    setError(null);

    if (
      mode === "register" &&
      password.length < 8
    ) {
      setError(t.passwordMinLength);
      return;
    }

    setSaving(true);

    try {
      if (mode === "login") {
        await login(
          identifier.trim(),
          password
        );
      } else {
        await register({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          password,
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