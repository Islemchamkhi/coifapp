import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useClientAuth } from "../auth/ClientAuthContext";
import { useLanguage } from "../i18n/LanguageContext";

type Mode = "login" | "register";

export default function ClientAuthPage() {
  const navigate = useNavigate();

  const { login, register } = useClientAuth();
  const { lang } = useLanguage();

  const [mode, setMode] = useState<Mode>("login");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isArabic = lang === "ar";

  const text = {
    loginTitle: isArabic ? "تسجيل الدخول" : "Connexion",

    registerTitle: isArabic
      ? "إنشاء حساب"
      : "Créer un compte",

    name: isArabic ? "الاسم" : "Nom",

    phone: isArabic ? "رقم الهاتف" : "Téléphone",

    email: isArabic
      ? "البريد الإلكتروني"
      : "Email",

    optional: isArabic
      ? "اختياري"
      : "facultatif",

    password: isArabic
      ? "كلمة المرور"
      : "Mot de passe",

    confirmPassword: isArabic
      ? "تأكيد كلمة المرور"
      : "Confirmer le mot de passe",

    login: isArabic
      ? "دخول"
      : "Se connecter",

    register: isArabic
      ? "إنشاء الحساب"
      : "Créer mon compte",

    noAccount: isArabic
      ? "ليس لديك حساب؟"
      : "Pas encore de compte ?",

    alreadyAccount: isArabic
      ? "لديك حساب بالفعل؟"
      : "Vous avez déjà un compte ?",

    createAccount: isArabic
      ? "إنشاء حساب"
      : "Créer un compte",

    connect: isArabic
      ? "تسجيل الدخول"
      : "Se connecter",

    back: isArabic
      ? "العودة للحجز"
      : "Retour à la réservation",

    passwordMismatch: isArabic
      ? "كلمتا المرور غير متطابقتين."
      : "Les mots de passe ne correspondent pas.",

    invalidPassword: isArabic
      ? "كلمة المرور يجب أن تحتوي على 6 أحرف على الأقل."
      : "Le mot de passe doit contenir au moins 6 caractères.",

    requiredFields: isArabic
      ? "يرجى ملء جميع الحقول المطلوبة."
      : "Veuillez remplir tous les champs obligatoires.",

    invalidEmail: isArabic
      ? "البريد الإلكتروني غير صالح."
      : "L'adresse email n'est pas valide.",

    genericError: isArabic
      ? "حدث خطأ. يرجى المحاولة مرة أخرى."
      : "Une erreur est survenue. Veuillez réessayer.",
  };

  // ============================================================
  // EMAIL
  // ============================================================
  // L'email est facultatif.
  // Vide = accepté.
  // Rempli = validation du format.
  // ============================================================

  const isValidEmail = (value: string) => {
    if (!value.trim()) {
      return true;
    }

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value.trim()
    );
  };

  // ============================================================
  // SUBMIT
  // ============================================================

  const handleSubmit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    setError("");

    // ========================================================
    // LOGIN
    // ========================================================

    if (mode === "login") {
      if (!phone.trim() || !password) {
        setError(text.requiredFields);
        return;
      }

      try {
        setLoading(true);

        await login(
          phone.trim(),
          password
        );

        navigate("/account");
      } catch (err: any) {
        setError(
          err?.message || text.genericError
        );
      } finally {
        setLoading(false);
      }

      return;
    }

    // ========================================================
    // REGISTER
    // ========================================================

    if (
      !name.trim() ||
      !phone.trim() ||
      !password
    ) {
      setError(text.requiredFields);
      return;
    }

    if (password.length < 6) {
      setError(text.invalidPassword);
      return;
    }

    if (password !== confirmPassword) {
      setError(text.passwordMismatch);
      return;
    }

    // ========================================================
    // EMAIL FACULTATIF
    // ========================================================

    const cleanedEmail = email.trim();

    if (
      cleanedEmail &&
      !isValidEmail(cleanedEmail)
    ) {
      setError(text.invalidEmail);
      return;
    }

    try {
      setLoading(true);

      await register({
        name: name.trim(),
        phone: phone.trim(),
        email: cleanedEmail || undefined,
        password,
      });

      navigate("/account");
    } catch (err: any) {
      setError(
        err?.message || text.genericError
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // CHANGE MODE
  // ============================================================

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError("");
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md">

        {/* HEADER */}

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Rayen Coif
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            {mode === "login"
              ? text.loginTitle
              : text.registerTitle}
          </p>
        </div>

        {/* CARD */}

        <div className="rounded-2xl bg-white p-6 shadow-sm">

          {/* TABS */}

          <div className="mb-6 grid grid-cols-2 rounded-xl bg-gray-100 p-1">

            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                mode === "login"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              {text.connect}
            </button>

            <button
              type="button"
              onClick={() =>
                switchMode("register")
              }
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                mode === "register"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              {text.createAccount}
            </button>

          </div>

          {/* ERROR */}

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* FORM */}

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >

            {/* NAME */}

            {mode === "register" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {text.name}
                </label>

                <input
                  type="text"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  autoComplete="name"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-900"
                  placeholder={text.name}
                />
              </div>
            )}

            {/* PHONE */}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {text.phone}
              </label>

              <input
                type="tel"
                value={phone}
                onChange={(event) =>
                  setPhone(event.target.value)
                }
                autoComplete="tel"
                required
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-900"
                placeholder={text.phone}
              />
            </div>

            {/* EMAIL */}

            {mode === "register" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {text.email}

                  <span className="ml-2 text-xs font-normal text-gray-400">
                    ({text.optional})
                  </span>
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  autoComplete="email"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-900"
                  placeholder={`${text.email} (${text.optional})`}
                />

                <p className="mt-1 text-xs text-gray-400">
                  {isArabic
                    ? "يمكنك ترك هذا الحقل فارغًا."
                    : "Vous pouvez laisser ce champ vide."}
                </p>
              </div>
            )}

            {/* PASSWORD */}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {text.password}
              </label>

              <input
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                autoComplete={
                  mode === "login"
                    ? "current-password"
                    : "new-password"
                }
                required
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-900"
                placeholder={text.password}
              />
            </div>

            {/* CONFIRM PASSWORD */}

            {mode === "register" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {text.confirmPassword}
                </label>

                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value
                    )
                  }
                  autoComplete="new-password"
                  required
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-900"
                  placeholder={text.confirmPassword}
                />
              </div>
            )}

            {/* SUBMIT */}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "..."
                : mode === "login"
                ? text.login
                : text.register}
            </button>

          </form>

          {/* SWITCH */}

          <div className="mt-6 text-center text-sm text-gray-500">

            {mode === "login" ? (
              <>
                {text.noAccount}{" "}

                <button
                  type="button"
                  onClick={() =>
                    switchMode("register")
                  }
                  className="font-semibold text-gray-900 underline"
                >
                  {text.createAccount}
                </button>
              </>
            ) : (
              <>
                {text.alreadyAccount}{" "}

                <button
                  type="button"
                  onClick={() =>
                    switchMode("login")
                  }
                  className="font-semibold text-gray-900 underline"
                >
                  {text.connect}
                </button>
              </>
            )}

          </div>
        </div>

        {/* BACK TO BOOKING */}

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-sm text-gray-500 underline hover:text-gray-900"
          >
            ← {text.back}
          </Link>
        </div>

      </div>
    </div>
  );
}