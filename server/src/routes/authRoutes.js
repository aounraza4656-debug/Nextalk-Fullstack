import { Router } from "express";
import { upload } from "../middleware/upload.js";
import {
  loginInit,
  logout,
  me,
  refresh,
  resendOtp,
  googleAuthCallback,
  googleAuthStart,
  googleLogin,
  signupInit,
  updateProfile,
  updateSettings,
  verifyOtp
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/signup-init", signupInit);
router.post("/login-init", loginInit);
router.get("/google", googleAuthStart);
router.get("/google/callback", googleAuthCallback);
router.post("/google", googleLogin);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.get("/me", requireAuth, me);
router.patch("/profile", requireAuth, upload.single("avatar"), updateProfile);
router.put("/profile", requireAuth, upload.single("avatar"), updateProfile);
router.patch("/settings", requireAuth, updateSettings);
router.post("/refresh", refresh);
router.post("/logout", logout, (_req, res) => res.json({ ok: true }));

export default router;
