import { createContext, useContext, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { authApi } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verificationState, setVerificationState] = useState(null);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const { data } = await authApi.me();
        setUser(data.user);
      } catch (_error) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, []);

  useEffect(() => {
    if (!user?.theme?.mode) return;
    document.documentElement.setAttribute("data-theme", user.theme.mode);
  }, [user?.theme?.mode]);

  const value = useMemo(
    () => ({
      user,
      loading,
      verificationState,
      setVerificationState,
      async consumeOtp(payload) {
        const { data } = await authApi.verifyOtp(payload);
        if (data.access_token) localStorage.setItem("nextalk_access_token", data.access_token);
        if (data.refresh_token) localStorage.setItem("nextalk_refresh_token", data.refresh_token);
        setUser(data.user);
        setVerificationState(null);
        toast.success("Welcome to Nextalk");
        return data;
      },
      async saveProfile(payload) {
        const { data } = await authApi.updateProfile(payload);
        setUser(data.user);
      },
      async saveSettings(payload) {
        const { data } = await authApi.updateSettings(payload);
        setUser(data.user);
      },
      async logout() {
        await authApi.logout();
        localStorage.removeItem("nextalk_access_token");
        localStorage.removeItem("nextalk_refresh_token");
        setUser(null);
        toast.success("Logged out");
      }
    }),
    [user, loading, verificationState]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
