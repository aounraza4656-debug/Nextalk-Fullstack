import { http } from "./http";

export const authApi = {
  signupInit: (payload) => http.post("/auth/signup-init", payload),
  loginInit: (payload) => http.post("/auth/login-init", payload),
  verifyOtp: (payload) => http.post("/auth/verify-otp", payload),
  googleLogin: (idToken) => http.post("/auth/google", { idToken }),
  resendOtp: (payload) => http.post("/auth/resend-otp", payload),
  me: () => http.get("/auth/me"),
  updateProfile: (payload) => {
    if (payload instanceof FormData) {
      return http.patch("/auth/profile", payload, { headers: { "Content-Type": "multipart/form-data" } });
    }
    return http.patch("/auth/profile", payload);
  },
  updateSettings: (payload) => http.patch("/auth/settings", payload),
  logout: () => http.post("/auth/logout")
};
