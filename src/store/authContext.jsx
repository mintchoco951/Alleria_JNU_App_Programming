import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createUser, getSession, loginUser, logoutUser } from "../services/storage";
import { uuid } from "../utils/uuid";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);

  useEffect(() => {
    setSession(getSession());
  }, []);

  const value = useMemo(() => {
    const isAuthed = Boolean(session?.token && session?.userId);

    return {
      session,
      isAuthed,
      register: async ({ email, password }) => {
        const id = uuid();
        createUser({ id, email, password });
        const token = uuid();
        const s = loginUser({ email, password, token });
        setSession(s);
        return s;
      },
      login: async ({ email, password }) => {
        const token = uuid();
        const s = loginUser({ email, password, token });
        setSession(s);
        return s;
      },
      logout: () => {
        logoutUser();
        setSession(null);
      },
    };
  }, [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 내부에서 사용해야 합니다.");
  return ctx;
}
