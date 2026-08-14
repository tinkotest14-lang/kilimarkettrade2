import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, getLocalSession } from "@/integrations/supabase/client";

interface AuthValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthValue>({ user: null, session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    const refreshSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          throw error;
        }
        setSession(data.session ?? getLocalSession());
      } catch (error) {
        console.error(error);
        setSession(getLocalSession());
      } finally {
        setLoading(false);
      }
    };

    void refreshSession();
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
