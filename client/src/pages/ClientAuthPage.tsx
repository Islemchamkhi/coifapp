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

    phone: isArabic
      ? "رقم الهاتف"
      : "Téléphone",

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

    emptyEmail: isArabic
      ? "يمكنك ترك البريد الإلكتروني فارغًا."
      : "Vous pouvez laisser l'email vide.",
  };

  // ============================================================
  // EMAIL VALIDATION
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
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError("");

    // ==========================================================
    // LOGIN
    // ==========================================================

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

    // ==========================================================
    // REGISTER
    // ==========================================================

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

  // ============================================================
  // UI
  // ============================================================

  return (
    <div
      className="min-h-screen bg-[#0f172a] px-4 py-8 text-white"
      dir={isArabic ? "rtl" : "ltr"}
    >
      <div className="mx-auto w-full max-w-md">

        {/* ======================================================
            HEADER
        ====================================================== */}

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Rayen Coif
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            {mode === "login"
              ? text.loginTitle
              : text.registerTitle}
          </p>
        </div>

        {/* ======================================================
            CARD
        ====================================================== */}

        <div className="rounded-2xl border border-slate-700 bg-[#111827] p-6 shadow-2xl">

          {/* ====================================================
              TABS
          ==================================================== */}

          <div className="mb-6 grid grid-cols-2 rounded-xl bg-[#1e293b] p-1">

            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                mode === "login"
                  ? "bg-[#0f172a] text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {text.connect}
            </button>

            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                mode === "register"
                  ? "bg-[#0f172a] text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {text.createAccount}
            </button>

          </div>

          {/* ====================================================
              ERROR
          ==================================================== */}

          {error && (
            <div className="mb-5 rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* ====================================================
              FORM
          ==================================================== */}

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >

            {/* ==================================================
                NAME
            ================================================== */}

            {mode === "register" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-200">
                  {text.name}
                </label>

                <input
                  type="text"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  autoComplete="name"
                  placeholder={text.name}
                  required
                  className="w-full rounded-xl border border-slate-600 bg-[#1e293b] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-700"
                />
              </div>
            )}

            {/* ==================================================
                PHONE
            ================================================== */}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-200">
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
                placeholder={text.phone}
                className="w-full rounded-xl border border-slate-600 bg-[#1e293b] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-700"
              />
            </div>

            {/* ==================================================
                EMAIL
            ================================================== */}

            {mode === "register" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-200">
                  {text.email}

                  <span className="ml-2 text-xs font-normal text-slate-500">
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
                  placeholder={`${text.email} (${text.optional})`}
                  className="w-full rounded-xl border border-slate-600 bg-[#1e293b] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-700"
                />

                <p className="mt-1.5 text-xs text-slate-500">
                  {text.emptyEmail}
                </p>
              </div>
            )}

            {/* ==================================================
                PASSWORD
            ================================================== */}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-200">
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
                placeholder={text.password}
                className="w-full rounded-xl border border-slate-600 bg-[#1e293b] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-700"
              />
            </div>

            {/* ==================================================
                CONFIRM PASSWORD
            ================================================== */}

            {mode === "register" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-200">
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
                  placeholder={text.confirmPassword}
                  className="w-full rounded-xl border border-slate-600 bg-[#1e293b] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-700"
                />
              </div>
            )}

            {/* ==================================================
                SUBMIT
            ================================================== */}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-white px-4 py-3 font-semibold text-slate-900 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "..."
                : mode === "login"
                ? text.login
                : text.register}
            </button>
          </form>

          {/* ====================================================
              SWITCH MODE
          ==================================================== */}

          <div className="mt-6 text-center text-sm text-slate-400">

            {mode === "login" ? (
              <>
                {text.noAccount}{" "}

                <button
                  type="button"
                  onClick={() =>
                    switchMode("register")
                  }
                  className="font-semibold text-white underline underline-offset-2 hover:text-slate-300"
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
                  className="font-semibold text-white underline underline-offset-2 hover:text-slate-300"
                >
                  {text.connect}
                </button>
              </>
            )}

          </div>
        </div>

        {/* ======================================================
            BACK TO BOOKING
        ====================================================== */}

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-sm text-slate-400 underline underline-offset-2 transition hover:text-white"
          >
            ← {text.back}
          </Link>
        </div>

      </div>
    </div>
  );
}