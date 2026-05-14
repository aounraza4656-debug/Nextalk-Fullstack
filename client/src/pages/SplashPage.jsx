import { motion } from "framer-motion";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BrandLogo from "../components/common/BrandLogo";

export default function SplashPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const id = setTimeout(() => navigate("/auth"), 2600);
    return () => clearTimeout(id);
  }, [navigate]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-[#030716] via-[#051330] to-[#02040f] px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.35),transparent_38%),radial-gradient(circle_at_75%_8%,rgba(34,211,238,0.22),transparent_35%),radial-gradient(circle_at_50%_85%,rgba(56,189,248,0.16),transparent_40%)]" />
      <motion.section
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.88, 1, 1.03, 1.06] }}
        transition={{ duration: 2.4, times: [0, 0.35, 0.75, 1], ease: "easeInOut" }}
        className="relative flex flex-col items-center text-center"
      >
        <BrandLogo />
        <p className="mt-24 text-sm uppercase tracking-[0.35em] text-slate-400">from NexLabs</p>
      </motion.section>
    </main>
  );
}
