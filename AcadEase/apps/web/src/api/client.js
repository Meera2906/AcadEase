import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export const api = axios.create({
  baseURL,
  withCredentials: true, // send httpOnly refresh cookie
});

// In-memory access token (PRD 5.1.3: "Access Token: stored in memory, not localStorage")
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

// The CSRF token is held in memory too, and the server now returns it in the
// login / refresh response body.
//
// It used to be read out of `document.cookie`, which works only when the SPA
// and the API share a hostname. Deployed they do not — the cookie belongs to
// the API's origin and is invisible to script on the SPA's origin — so no
// X-CSRF-Token header was ever sent and every POST/PATCH/DELETE came back
// "CSRF token missing or invalid". The cookie is still set and still checked
// server-side; this is just how the client learns the value it must echo.
let csrfToken = null;

export function setCsrfToken(token) {
  if (token) csrfToken = token;
}

// Same-origin deployments keep working off the cookie.
function readCsrfCookie() {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrfToken="))
    ?.split("=")[1];
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  const method = (config.method || "get").toLowerCase();
  if (["post", "put", "patch", "delete"].includes(method)) {
    const token = csrfToken || readCsrfCookie();
    if (token) {
      config.headers["X-CSRF-Token"] = token;
    }
  }

  return config;
});

let isRefreshing = false;
let queue = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url.includes("/auth/")) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      isRefreshing = true;
      try {
        const { data } = await api.post("/auth/refresh");
        setAccessToken(data.accessToken);
        setCsrfToken(data.csrfToken);
        queue.forEach((p) => p.resolve(data.accessToken));
        queue = [];
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        queue.forEach((p) => p.reject(refreshErr));
        queue = [];
        setAccessToken(null);
        csrfToken = null;
        window.location.href = "/login";
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
