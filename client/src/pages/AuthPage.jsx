import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Lock, Mail, Sparkles, User } from "lucide-react";
import toast from "react-hot-toast";
import BrandLogo from "../components/common/BrandLogo";
import { authApi } from "../api/auth";
import { useAuth } from "../context/AuthContext";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export default function AuthPage() {
  const { setVerificationState } = useAuth();
  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [form, setForm] = useState({ fullName: "", username: "", email: "", password: "", confirmPassword: "" });

  const googleEnabled = useMemo(() => Boolean(googleClientId), []);

  useEffect(() => {
    if (!googleEnabled || !window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (response) => {
        try {
          const { data } = await authApi.googleLogin(response.credential);
          if (data?.access_token) localStorage.setItem("nextalk_access_token", data.access_token);
          if (data?.refresh_token) localStorage.setItem("nextalk_refresh_token", data.refresh_token);
          toast.success("Signed in with Google");
          window.location.href = "/app";
        } catch (error) {
          toast.error(error.response?.data?.message || "Google sign-in failed");
        }
      }
    });
  }, [googleEnabled]);

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
    if (!googleEnabled) return toast.error("Google sign-in is not configured.");
    if (!window.google?.accounts?.id) return toast.error("Google script not loaded yet.");
    window.google.accounts.id.prompt();
  };

  return (
    <main className="min-h-screen overflow-hidden px-6 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(79,140,255,0.35),transparent_40%),radial-gradient(circle_at_80%_20%,rgba(17,223,210,0.2),transparent_35%),radial-gradient(circle_at_50%_90%,rgba(114,74,255,0.25),transparent_35%)]" />
      <div className="relative mx-auto flex max-w-5xl items-center justify-center">
        <section className="w-full max-w-2xl rounded-3xl border border-white/20 bg-slate-900/45 p-8 shadow-[0_30px_90px_rgba(7,24,65,0.45)] backdrop-blur-2xl md:p-10">
          <BrandLogo />
          <div className="mt-8 space-y-2">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-white">Secure Access</h2>
            <p className="text-slate-300">Enter your credentials to continue into Nextalk</p>
          </div>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === "signup" && (
              <>
                <InputField icon={User} placeholder="Full Name" value={form.fullName} onChange={(v) => update("fullName", v)} />
                <InputField icon={User} placeholder="Username" value={form.username} onChange={(v) => update("username", v)} />
              </>
            )}
            <InputField icon={Mail} placeholder="Email Address" value={form.email} onChange={(v) => update("email", v)} type="email" />
            <PasswordField placeholder="Password" value={form.password} onChange={(v) => update("password", v)} visible={showPassword} setVisible={setShowPassword} />
            {mode === "signup" && <PasswordField placeholder="Confirm Password" value={form.confirmPassword} onChange={(v) => update("confirmPassword", v)} visible={showConfirm} setVisible={setShowConfirm} />}

            {mode === "login" && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-slate-300">
                  <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="h-4 w-4 rounded border-slate-500 bg-slate-900" />
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
            <button type="button" onClick={handleGoogle} className="w-full rounded-xl border border-white/20 bg-gradient-to-r from-slate-900/80 to-slate-800/80 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_12px_24px_rgba(7,15,36,0.45)] transition hover:-translate-y-0.5 hover:border-cyan-300/50">
              <Sparkles size={14} className="mr-2 inline text-cyan-300" />Continue with Google
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-slate-300">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button type="button" className="font-semibold text-brandBlue hover:text-blue-300" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Sign Up" : "Login"}</button>
          </p>
        </section>
      </div>
    </main>
  );
}

function InputField({ icon: Icon, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-950/70 px-4 py-3 focus-within:border-brandBlue">
      <Icon size={18} className="text-slate-400" />
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500" />
    </label>
  );
}

function PasswordField({ value, onChange, placeholder, visible, setVisible }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-950/70 px-4 py-3 focus-within:border-brandBlue">
      <Lock size={18} className="text-slate-400" />
      <input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500" />
      <button type="button" onClick={() => setVisible((prev) => !prev)} className="text-slate-400 hover:text-slate-200">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </label>
  );
}
