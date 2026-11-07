import axios from "axios";

const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(window.location.hostname);

const api = axios.create({
  withCredentials: true,
  baseURL:
    import.meta.env.VITE_API_URL ||
    (isLocalDevelopment
      ? `${window.location.protocol}//${window.location.hostname}:3000`
      : window.location.origin),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = String(error.config?.url || "");
    const isLoginRequest = /(^|\/)auth\/login(?:\?|$)/.test(requestUrl);
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem("token");
      if (!["/login", "/signin", "/reset-pass"].includes(window.location.pathname)) {
        window.location.assign("/login?reason=session-expired");
      }
    }
    return Promise.reject(error);
  }
);

export default api;
