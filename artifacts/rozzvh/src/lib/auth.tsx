import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { isSupabaseConfigured, requireSupabaseClient } from "@/lib/supabase";

export type AuthStatus =
  | "loading"
  | "unconfigured"
  | "anonymous"
  | "authenticated"
  | "error";

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    isSupabaseConfigured ? "loading" : "unconfigured",
  );
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStatus("unconfigured");
      return;
    }

    const client = requireSupabaseClient();
    let active = true;
    let authEventCount = 0;

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      authEventCount += 1;
      if (!active) return;
      setSession(nextSession);
      setError(null);
      setStatus(nextSession?.user ? "authenticated" : "anonymous");
    });

    const eventCountAtStart = authEventCount;
    void client.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active || authEventCount !== eventCountAtStart) return;
        if (sessionError) {
          setSession(null);
          setError(sessionError.message);
          setStatus("error");
          return;
        }

        const nextSession = data.session;
        setSession(nextSession);
        setStatus(nextSession?.user ? "authenticated" : "anonymous");
      })
      .catch((sessionError: unknown) => {
        if (!active || authEventCount !== eventCountAtStart) return;
        setSession(null);
        setError(
          sessionError instanceof Error
            ? sessionError.message
            : "Nepodařilo se ověřit přihlášení.",
        );
        setStatus("error");
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      error,
      signIn: async (email, password) => {
        const { error: signInError } = await requireSupabaseClient().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      },
      signUp: async (email, password) => {
        const redirectTo = new URL(
          import.meta.env.BASE_URL,
          window.location.origin,
        ).toString();
        const { data, error: signUpError } =
          await requireSupabaseClient().auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: redirectTo },
          });
        if (signUpError) throw signUpError;
        return Boolean(data.session);
      },
      signOut: async () => {
        const { error: signOutError } =
          await requireSupabaseClient().auth.signOut();
        if (signOutError) throw signOutError;
      },
    }),
    [error, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}