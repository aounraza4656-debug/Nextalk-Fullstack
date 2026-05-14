import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import BrandLogo from "../components/common/BrandLogo";
import OtpInput from "../components/common/OtpInput";
import { authApi } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function VerifyPage() {
  const navigate = useNavigate();
  const { verificationState, setVerificationState, consumeOtp } = useAuth();
  const { isLightTheme } = useTheme();
  const [otp, setOtp] = useState("");
  const [timer, setTimer] = useState(45);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!verificationState) {
      navigate("/auth", { replace: true });
      return;
    }

    if (timer <= 0) return;
    const id = setInterval(() => setTimer((prev) => prev - 1), 1000);
    return () => clearInterval(id);
  }, [verificationState, timer, navigate]);

  const verify = async () => {
    if (!verificationState) return;
    if (otp.length !== 6) {
      toast.error("Enter all 6 digits.");
      return;
    }

    try {
      setLoading(true);
      await consumeOtp({
        verificationId: verificationState.verificationId,
        code: otp
      });
      navigate("/app");
    } catch (error) {
      toast.error(error.response?.data?.message || "Invalid verification code.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!verificationState || timer > 0) return;
    try {
      await authApi.resendOtp({ verificationId: verificationState.verificationId });
      toast.success("A new code has been sent.");
      setTimer(45);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to resend code.");
    }
  };

  const back = () => {
    setVerificationState(null);
    navigate("/auth");
  };

  if (!verificationState) return null;

  return (
    <main className={`min-h-screen px-6 py-8 ${isLightTheme ? "bg-white text-slate-900" : "text-slate-100"}`}>
      <div className="mx-auto flex max-w-2xl items-center justify-center">
        <section className={`w-full rounded-3xl border p-8 md:p-10 ${isLightTheme ? "border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.12)]" : "glass-panel"}`}>
          <BrandLogo lightMode={isLightTheme} />
          <h2 className={`mt-8 font-display text-3xl font-semibold ${isLightTheme ? "text-slate-900" : "text-white"}`}>Enter Verification Code</h2>
          <p className={`mt-2 text-sm ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>A 6-digit code was sent to your email</p>
          <p className={`mt-1 text-sm font-medium ${isLightTheme ? "text-slate-800" : "text-slate-200"}`}>{verificationState.email}</p>

          <div className="mt-7">
            <OtpInput value={otp} onChange={setOtp} />
          </div>

          <div className={`mt-6 text-sm ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>
            {timer > 0 ? (
              <p>Resend available in {timer}s</p>
            ) : (
              <button onClick={resend} className="font-semibold text-brandBlue hover:text-blue-300">
                Resend Code
              </button>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={verify}
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-brandBlue to-electric px-4 py-3 font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
            <button onClick={back} className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold ${isLightTheme ? "border-slate-300 bg-white text-slate-800" : "border-slate-600 bg-slate-900/60 text-slate-100"}`}>
              <ArrowLeft size={16} />
              Back
            </button>
          </div>

          <button
            onClick={back}
            className="mt-4 text-sm text-brandBlue hover:text-blue-300"
          >
            Change email
          </button>
          <p className="mt-4 text-center text-xs text-slate-400">
            © 2026 NexVocal. A product of NexLabs
          </p>
        </section>
      </div>
    </main>
  );
}
