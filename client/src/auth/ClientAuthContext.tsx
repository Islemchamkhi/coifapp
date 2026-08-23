import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  clientGetMe,
  clientLogin,
  clientRegister,
  clientLogout,
  clientUpdateProfile,
} from "../api/client";

import { ClientAccount } from "../types";

interface ClientAuthContextValue {
  client: ClientAccount | null;

  loading: boolean;

  login: (
    identifier: string,
    password: string
  ) => Promise<ClientAccount>;

  register: (payload: {
    name: string;
    phone: string;
    email?: string;
    password: string;
  }) => Promise<ClientAccount>;

  updateProfile: (payload: {
    name: string;
    phone: string;
    email: string;
  }) => Promise<ClientAccount>;

  logout: () => void;

  refresh: () => Promise<void>;

  forceLogout: () => void;
}

const ClientAuthContext =
  createContext<ClientAuthContextValue | null>(null);

export function ClientAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [client, setClient] =
    useState<ClientAccount | null>(null);

  const [loading, setLoading] = useState(true);

  /**
   * ============================================================
   * REFRESH CLIENT
   * ============================================================
   */

  const refresh = async () => {
    const token = localStorage.getItem(
      "rayen_client_token"
    );

    if (!token) {
      setClient(null);
      return;
    }

    try {
      const result = await clientGetMe();

      setClient(result.client);
    } catch {
      clientLogout();
      setClient(null);
    }
  };

  /**
   * ============================================================
   * INITIALISATION
   * ============================================================
   */

  useEffect(() => {
    refresh().finally(() => {
      setLoading(false);
    });
  }, []);

  /**
   * ============================================================
   * LOGIN
   * ============================================================
   */

  const login = async (
    identifier: string,
    password: string
  ): Promise<ClientAccount> => {
    const result = await clientLogin(
      identifier.trim(),
      password
    );

    setClient(result.client);

    return result.client;
  };

  /**
   * ============================================================
   * REGISTER
   * ============================================================
   *
   * EMAIL FACULTATIF
   *
   * Si l'utilisateur ne possède pas d'adresse email,
   * on n'envoie pas une chaîne vide au serveur.
   *
   * Exemple :
   *
   * email = "test@gmail.com"
   *       -> "test@gmail.com"
   *
   * email = ""
   *       -> undefined
   */

  const register = async (payload: {
    name: string;
    phone: string;
    email?: string;
    password: string;
  }): Promise<ClientAccount> => {
    const cleanedPayload = {
      name: payload.name.trim(),

      phone: payload.phone.trim(),

      email:
        payload.email &&
        payload.email.trim().length > 0
          ? payload.email.trim().toLowerCase()
          : undefined,

      password: payload.password,
    };

    const result =
      await clientRegister(cleanedPayload);

    setClient(result.client);

    return result.client;
  };

  /**
   * ============================================================
   * UPDATE PROFILE
   * ============================================================
   *
   * Ici aussi l'email peut être vide.
   */

  const updateProfile = async (payload: {
    name: string;
    phone: string;
    email: string;
  }): Promise<ClientAccount> => {
    const cleanedPayload = {
      name: payload.name.trim(),

      phone: payload.phone.trim(),

      email:
        payload.email.trim().length > 0
          ? payload.email.trim().toLowerCase()
          : "",
    };

    const result =
      await clientUpdateProfile(cleanedPayload);

    setClient(result.client);

    return result.client;
  };

  /**
   * ============================================================
   * LOGOUT
   * ============================================================
   */

  const logout = () => {
    clientLogout();
    setClient(null);
  };

  /**
   * ============================================================
   * FORCE LOGOUT
   * ============================================================
   *
   * Utilisé lorsqu'un compte n'existe plus côté serveur.
   */

  const forceLogout = () => {
    clientLogout();
    setClient(null);
  };

  /**
   * ============================================================
   * PROVIDER
   * ============================================================
   */

  return (
    <ClientAuthContext.Provider
      value={{
        client,
        loading,
        login,
        register,
        updateProfile,
        logout,
        refresh,
        forceLogout,
      }}
    >
      {children}
    </ClientAuthContext.Provider>
  );
}

/**
 * ============================================================
 * HOOK
 * ============================================================
 */

export function useClientAuth() {
  const context = useContext(ClientAuthContext);

  if (!context) {
    throw new Error(
      "useClientAuth must be used inside ClientAuthProvider"
    );
  }

  return context;
}