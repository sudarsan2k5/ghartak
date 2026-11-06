"use client";

import type { AdminSessionResponse } from "@ghartak/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createApiClient, type ApiClient } from "@/lib/api/client";
import { readApiBaseUrl } from "@/lib/api/config";
import { signIn as requestSignIn, type LoginFields } from "@/lib/auth/login";
import { endSession, restoreSession, type SessionStatus } from "@/lib/auth/session";

type Profile = AdminSessionResponse["admin"];

type SessionContextValue = {
  status: SessionStatus;
  profile: Profile | null;
  client: ApiClient | null;
  configError: string | null;
  refresh: () => Promise<void>;
  signIn: (input: LoginFields) => ReturnType<typeof requestSignIn>;
  signOut: () => Promise<boolean>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<ApiClient | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client) {
      return;
    }
    const next = await restoreSession(client);
    setStatus(next);
    if (next !== "authenticated") {
      setProfile(null);
    }
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    try {
      const nextClient = createApiClient({ baseUrl: readApiBaseUrl() });
      setClient(nextClient);
      void restoreSession(nextClient).then((next) => {
        if (!cancelled) {
          setStatus(next);
        }
      });
    } catch (error) {
      if (!cancelled) {
        setConfigError(error instanceof Error ? error.message : "The API address is not configured.");
        setStatus("unavailable");
      }
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (input: LoginFields) => {
      if (!client) {
        throw new Error("The API address is not configured.");
      }
      const result = await requestSignIn(client, input);
      if (result.ok) {
        setProfile(result.data.admin);
        setStatus("authenticated");
      }
      return result;
    },
    [client],
  );

  const signOut = useCallback(async () => {
    if (!client) {
      return false;
    }
    const result = await endSession(client);
    if (result.ok || result.kind === "unauthorized") {
      setProfile(null);
      setStatus("anonymous");
      return true;
    }
    return false;
  }, [client]);

  const value = useMemo(
    () => ({ status, profile, client, configError, refresh, signIn, signOut }),
    [status, profile, client, configError, refresh, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("SessionProvider is missing");
  }
  return value;
}
