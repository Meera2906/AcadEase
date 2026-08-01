import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";

// The applicant portal runs on its own axios instance and its own token.
// Deliberately separate from the staff/student client: a pre-admission session
// must never be able to borrow, or be borrowed by, a real account's session.
const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export const applicantApi = axios.create({ baseURL, withCredentials: true });

let applicantToken = null;
export const setApplicantToken = (token) => { applicantToken = token; };

applicantApi.interceptors.request.use((config) => {
  if (applicantToken) config.headers.Authorization = `Bearer ${applicantToken}`;

  if (["post", "put", "patch", "delete"].includes((config.method || "get").toLowerCase())) {
    const csrf = document.cookie.split("; ").find((row) => row.startsWith("csrfToken="))?.split("=")[1];
    if (csrf) config.headers["X-CSRF-Token"] = csrf;
  }
  return config;
});

const ApplicantContext = createContext(null);

export function ApplicantProvider({ children }) {
  const [applicant, setApplicant] = useState(null);
  const [booting, setBooting] = useState(true);

  // Resume an in-progress application after a page reload using the httpOnly
  // refresh cookie, so a half-finished upload session survives a refresh.
  useEffect(() => {
    applicantApi
      .post("/applicant/refresh")
      .then(({ data }) => {
        setApplicantToken(data.accessToken);
        setApplicant(data.applicant);
      })
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await applicantApi.post("/applicant/register", payload);
    setApplicantToken(data.accessToken);
    setApplicant(data.applicant);
    return data;
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await applicantApi.post("/applicant/login", { email, password });
    setApplicantToken(data.accessToken);
    setApplicant(data.applicant);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await applicantApi.post("/applicant/logout").catch(() => {});
    setApplicantToken(null);
    setApplicant(null);
  }, []);

  const value = useMemo(
    () => ({ applicant, setApplicant, booting, register, login, logout }),
    [applicant, booting, register, login, logout]
  );

  return <ApplicantContext.Provider value={value}>{children}</ApplicantContext.Provider>;
}

export function useApplicant() {
  const ctx = useContext(ApplicantContext);
  if (!ctx) throw new Error("useApplicant must be used within ApplicantProvider");
  return ctx;
}
