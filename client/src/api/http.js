import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://nexvocal.com/api";

export const http = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
});

let refreshPromise = null;

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("nexvocal_access_token") || localStorage.getItem("nextalk_access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes("/auth/refresh")) {
      originalRequest._retry = true;
      if (!refreshPromise) {
        refreshPromise = http.post("/auth/refresh").then((res) => {
          if (res.data?.access_token) {
            localStorage.setItem("nexvocal_access_token", res.data.access_token);
            localStorage.removeItem("nextalk_access_token");
          }
          return res;
        }).finally(() => {
          refreshPromise = null;
        });
      }
      await refreshPromise;
      return http(originalRequest);
    }
    return Promise.reject(error);
  }
);
