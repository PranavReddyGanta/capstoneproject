import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { signIn as doSignIn, signUp as doSignUp } from "../lib/auth";

const AuthContext = createContext<any>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) return setLoading(false);

    try {
      const decoded = JSON.parse(atob(token));

      supabase
        .from("users")
        .select("user_id, full_name, email, role, created_at")
        .eq("user_id", decoded.userId)
        .single()
        .then(({ data }) => {
          if (data) {
            setUser({
              id: data.user_id,
              name: data.full_name,
              email: data.email,
              role: data.role,
              created_at: data.created_at,
            });
          }
          setLoading(false);
        });
    } catch {
      localStorage.removeItem("auth_token");
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await doSignIn(email, password);
    if (data) {
      localStorage.setItem("auth_token", data.token);
      setUser({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        created_at: data.user.created_at,
      });
    }
    return { error };
  };

  const signUp = async (email: string, password: string, name: string, role: string) => {
    const result = await doSignUp(email, password, name, role);
    return result;
  };

  const signOut = () => {
    localStorage.removeItem("auth_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
