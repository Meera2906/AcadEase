import { createContext, useContext, useState, useCallback, useEffect } from "react";
import api, { setAccessToken, setCsrfToken } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  // True until we have finished asking the server whether this browser already
  // holds a session. Without it every guarded route decides "not logged in" on
  // the first render and bounces to /login before the answer arrives.
  const [booting, setBooting] = useState(true);

  // Restore the session after a reload.
  //
  // The access token is deliberately kept in memory and never in localStorage,
  // so a refresh, a new tab or a pasted URL starts with no token at all. The
  // httpOnly refresh cookie is what survives; this exchanges it for a new
  // access token plus the user it belongs to. Without this, opening any page
  // directly was indistinguishable from being logged out.
  useEffect(() => {
    let cancelled = false;

    api.post("/auth/refresh")
      .then(({ data }) => {
        if (cancelled || !data?.accessToken) return;
        setAccessToken(data.accessToken);
        setCsrfToken(data.csrfToken);
        if (data.user) setUser(data.user);
      })
      .catch(() => {
        // No cookie, or it expired. A normal cold start, not an error — the
        // login screen is the right destination.
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Step 1: password login. Students get tokens immediately.
  // Faculty/Admin/SuperAdmin get { requiresTotp: true } and must call verifyTotp next.
  const login = useCallback(async (userId, password) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { userId, password });
      if (data.accessToken) {
        setAccessToken(data.accessToken);
        setCsrfToken(data.csrfToken);
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
      setCsrfToken(data.csrfToken);
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
    <AuthContext.Provider value={{ user, loading, booting, login, initTotpSetup, verifyTotp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
