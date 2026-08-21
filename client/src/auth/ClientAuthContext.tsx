import React, { createContext, useContext, useEffect, useState } from "react";
import { clientGetMe, clientLogin, clientRegister, clientLogout, clientUpdateProfile } from "../api/client";
import { ClientAccount } from "../types";

interface ClientAuthContextValue {
  client: ClientAccount | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<ClientAccount>;
  register: (payload: { name: string; phone: string; email: string; password: string }) => Promise<ClientAccount>;
  updateProfile: (payload: { name: string; phone: string; email: string }) => Promise<ClientAccount>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthContextValue | null>(null);

export function ClientAuthProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<ClientAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!localStorage.getItem("rayen_client_token")) {
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

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const login = async (identifier: string, password: string) => {
    const result = await clientLogin(identifier, password);
    setClient(result.client);
    return result.client;
  };

  const register = async (payload: { name: string; phone: string; email: string; password: string }) => {
    const result = await clientRegister(payload);
    setClient(result.client);
    return result.client;
  };

  const updateProfile = async (payload: { name: string; phone: string; email: string }) => {
    const result = await clientUpdateProfile(payload);
    setClient(result.client);
    return result.client;
  };

  const logout = () => {
    clientLogout();
    setClient(null);
  };

  return (
    <ClientAuthContext.Provider value={{ client, loading, login, register, updateProfile, logout, refresh }}>
      {children}
    </ClientAuthContext.Provider>
  );
}

export function useClientAuth() {
  const context = useContext(ClientAuthContext);
  if (!context) throw new Error("useClientAuth must be used inside ClientAuthProvider");
  return context;
}
