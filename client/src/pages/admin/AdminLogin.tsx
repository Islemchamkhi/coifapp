import React, { useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";
import { adminLogin, ApiRequestError } from "../../api/client";

export default function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const { t, dir } = useLanguage();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await adminLogin(password);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiRequestError) setError(t.wrongPassword);
      else setError(t.errorGeneric);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir={dir} className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="absolute top-4 end-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm card px-6 py-8">
        <div className="w-14 h-14 mx-auto rounded-full border-2 border-gold-500 flex items-center justify-center text-gold-500 font-bold text-xl mb-4">
          <img
          src="/icons/icon-192.png"
          alt={t.brand}
          className="w-10 h-10 object-contain rounded-lg"
/>
        </div>
        <h1 className="text-lg font-semibold text-center mb-6">{t.adminLoginTitle}</h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            className="input-field"
            placeholder={t.password}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {t.login}
          </button>
        </form>
      </div>
    </div>
  );
}
