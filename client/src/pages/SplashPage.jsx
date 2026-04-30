import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import BrandLogo from "../components/common/BrandLogo";

export default function SplashPage() {
  const navigate = useNavigate();

  return (
    <main className="relative min-h-screen overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-28 h-64 w-64 rounded-full bg-brandBlue/25 blur-3xl" />
        <div className="absolute right-10 top-8 h-72 w-72 rounded-full bg-electric/25 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center">
        <motion.section
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="glass-panel w-full max-w-2xl rounded-3xl p-8 text-center md:p-14"
        >
          <div className="mx-auto flex w-fit justify-center">
            <BrandLogo />
          </div>
          <p className="mt-8 text-lg text-slate-300 md:text-xl">
            Secure premium conversations, crafted with startup luxury for modern private messaging.
          </p>
          <button
            onClick={() => navigate("/auth")}
            className="mt-10 animate-pulseGlow rounded-2xl bg-gradient-to-r from-indigo-500 via-brandBlue to-electric px-8 py-4 text-base font-semibold text-white shadow-neon transition hover:scale-[1.02]"
          >
            Get Started
          </button>
        </motion.section>
      </div>
    </main>
  );
}
