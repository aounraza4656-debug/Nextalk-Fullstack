import { useMemo, useState } from "react";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import toast from "react-hot-toast";
import BrandLogo from "../components/common/BrandLogo";
import { authApi } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthPage() {
  const { setVerificationState } = useAuth();
  const { isLightTheme } = useTheme();
  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [form, setForm] = useState({ fullName: "", username: "", email: "", password: "", confirmPassword: "" });

  const oauthStartUrl = useMemo(() => {
    const apiBase = import.meta.env.VITE_API_URL || "https://nexvocal.com/api";
    const normalizedApiBase = apiBase.replace(/\/+$/, "");
    return `${normalizedApiBase}/auth/google`;
  }, []);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!emailRegex.test(form.email)) return toast.error("Please enter a valid email address.");
    if (mode === "signup") {
      if (!form.fullName || !form.username) return toast.error("Please complete all signup fields.");
      if (form.password !== form.confirmPassword) return toast.error("Passwords do not match.");
    }

    try {
      setLoading(true);
      const payload = mode === "signup"
        ? { fullName: form.fullName, username: form.username, email: form.email.toLowerCase(), password: form.password }
        : { email: form.email.toLowerCase(), password: form.password, rememberMe };
      const { data } = mode === "signup" ? await authApi.signupInit(payload) : await authApi.loginInit(payload);
      setVerificationState({ verificationId: data.verificationId, email: payload.email, mode });
      window.location.href = "/verify";
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to continue.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    window.location.assign(oauthStartUrl);
  };

  return (
    <main className={`min-h-screen overflow-hidden px-6 py-8 ${isLightTheme ? "bg-white text-slate-900" : "bg-[#0F172A] text-slate-100"}`}>
      <div
        className={`pointer-events-none absolute inset-0 ${isLightTheme
          ? "bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,0.12),transparent_40%),radial-gradient(circle_at_85%_20%,rgba(59,130,246,0.11),transparent_35%),radial-gradient(circle_at_45%_90%,rgba(15,23,42,0.06),transparent_35%)]"
          : "bg-[radial-gradient(circle_at_15%_10%,rgba(59,130,246,0.32),transparent_42%),radial-gradient(circle_at_85%_20%,rgba(6,182,212,0.18),transparent_35%),radial-gradient(circle_at_50%_95%,rgba(30,64,175,0.24),transparent_42%)]"}`}
      />
      <div className="relative mx-auto flex max-w-5xl items-center justify-center">
        <section className={`w-full max-w-2xl rounded-3xl border p-8 shadow-[0_18px_48px_rgba(15,23,42,0.12)] md:p-10 ${isLightTheme ? "border-slate-200 bg-[#FFFFFF]" : "border-cyan-400/20 bg-[#0F172A]"}`}>
          <BrandLogo lightMode={isLightTheme} />
          <div className="mt-8 space-y-2">
            <h2 className={`font-display text-3xl font-semibold tracking-tight ${isLightTheme ? "text-slate-900" : "text-slate-100"}`}>Secure Access</h2>
            <p className={isLightTheme ? "text-slate-600" : "text-slate-300"}>Enter your credentials to continue into NexVocal</p>
          </div>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === "signup" && (
              <>
                <InputField icon={User} placeholder="Full Name" value={form.fullName} onChange={(v) => update("fullName", v)} lightMode={isLightTheme} />
                <InputField icon={User} placeholder="Username" value={form.username} onChange={(v) => update("username", v)} lightMode={isLightTheme} />
              </>
            )}
            <InputField icon={Mail} placeholder="Email Address" value={form.email} onChange={(v) => update("email", v)} type="email" lightMode={isLightTheme} />
            <PasswordField placeholder="Password" value={form.password} onChange={(v) => update("password", v)} visible={showPassword} setVisible={setShowPassword} lightMode={isLightTheme} />
            {mode === "signup" && <PasswordField placeholder="Confirm Password" value={form.confirmPassword} onChange={(v) => update("confirmPassword", v)} visible={showConfirm} setVisible={setShowConfirm} lightMode={isLightTheme} />}

            {mode === "login" && (
              <div className="flex items-center justify-between text-sm">
                <label className={`flex items-center gap-2 ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>
                  <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className={`h-4 w-4 rounded ${isLightTheme ? "border-slate-300 bg-white" : "border-slate-500 bg-slate-900"}`} />
                  Remember Me
                </label>
                <button type="button" className="text-brandBlue hover:text-blue-300" onClick={() => toast("Password reset can be added via OTP flow.")}>Forgot Password</button>
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-brandBlue via-electric to-cyan-400 px-4 py-3 font-semibold text-white shadow-[0_12px_30px_rgba(49,125,255,0.45)] transition hover:-translate-y-0.5 disabled:opacity-50">
              {loading ? "Please wait..." : "Continue"}
            </button>
          </form>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleGoogle}
              className={`flex w-full items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition ${isLightTheme ? "border-slate-300 bg-white text-slate-800 shadow-[0_10px_22px_rgba(15,23,42,0.08)] hover:border-slate-400" : "border-slate-600 bg-[#111c34] text-slate-100 hover:border-cyan-300/50"}`}
            >
              <GoogleLogoIcon className="mr-2 h-4 w-4 shrink-0" />
              Continue with Google
            </button>
          </div>

          <p className={`mt-6 text-center text-sm ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button type="button" className="font-semibold text-brandBlue hover:text-blue-300" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Sign Up" : "Login"}</button>
          </p>
          <p className={`mt-3 text-center text-xs ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>
            © 2026 NexVocal. A product of NexLabs
          </p>
        </section>
      </div>
    </main>
  );
}

function InputField({ icon: Icon, value, onChange, placeholder, type = "text", lightMode = false }) {
  return (
    <label className={`flex items-center gap-3 rounded-xl border px-4 py-3 focus-within:border-brandBlue ${lightMode ? "border-slate-300 bg-white" : "border-slate-600 bg-[#111c34]"}`}>
      <Icon size={18} className={lightMode ? "text-slate-500" : "text-slate-400"} />
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`w-full bg-transparent text-sm outline-none ${lightMode ? "text-slate-900 placeholder:text-slate-500" : "text-slate-100 placeholder:text-slate-400"}`} />
    </label>
  );
}

function PasswordField({ value, onChange, placeholder, visible, setVisible, lightMode = false }) {
  return (
    <label className={`flex items-center gap-3 rounded-xl border px-4 py-3 focus-within:border-brandBlue ${lightMode ? "border-slate-300 bg-white" : "border-slate-600 bg-[#111c34]"}`}>
      <Lock size={18} className={lightMode ? "text-slate-500" : "text-slate-400"} />
      <input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`w-full bg-transparent text-sm outline-none ${lightMode ? "text-slate-900 placeholder:text-slate-500" : "text-slate-100 placeholder:text-slate-400"}`} />
      <button type="button" onClick={() => setVisible((prev) => !prev)} className={lightMode ? "text-slate-500 hover:text-slate-800" : "text-slate-400 hover:text-slate-200"}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </label>
  );
}

function GoogleLogoIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.29h6.44a5.51 5.51 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.57-5.14 3.57-8.64z" fill="#4285F4" />
      <path d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3c-1.07.72-2.44 1.15-4.08 1.15-3.13 0-5.79-2.11-6.74-4.95H1.27v3.09A12 12 0 0 0 12 24z" fill="#34A853" />
      <path d="M5.26 14.29A7.2 7.2 0 0 1 4.88 12c0-.79.14-1.56.38-2.29V6.62H1.27A12 12 0 0 0 0 12c0 1.93.46 3.76 1.27 5.38l3.99-3.09z" fill="#FBBC05" />
      <path d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.2 15.23 0 12 0A12 12 0 0 0 1.27 6.62l3.99 3.09c.95-2.84 3.61-4.94 6.74-4.94z" fill="#EA4335" />
    </svg>
  );
}
