import { createContext, useContext, useState, useCallback } from "react";
import api, { setAccessToken } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  // Step 1: password login. Students get tokens immediately.
  // Faculty/Admin/SuperAdmin get { requiresTotp: true } and must call verifyTotp next.
  const login = useCallback(async (userId, password) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { userId, password });
      if (data.accessToken) {
        setAccessToken(data.accessToken);
        setUser(data.user);
      }
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  // Called during first-time 2FA setup: returns { secret, otpauthUrl }
  const initTotpSetup = useCallback(async (userId, password) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/setup-totp", { userId, password });
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyTotp = useCallback(async (userId, token) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/verify-totp", { userId, token });
      setAccessToken(data.accessToken);
      setUser(data.user);
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => {});
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, initTotpSetup, verifyTotp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
