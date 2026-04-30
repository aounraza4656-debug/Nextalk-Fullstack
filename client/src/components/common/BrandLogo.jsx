export default function BrandLogo({ compact = false }) {
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-4"}`}>
      <div className={`${compact ? "h-10 w-10" : "h-16 w-16"} overflow-hidden rounded-2xl border border-white/15 shadow-[0_8px_20px_rgba(28,147,255,0.35)]`}>
        <img src="/nextalk-logo.svg" alt="Nextalk" className="h-full w-full object-cover" />
      </div>
      <div>
        <h1 className={`${compact ? "text-xl" : "text-3xl"} font-display font-bold text-slate-100`}>Nextalk</h1>
        <p className={`${compact ? "text-xs" : "text-sm"} font-medium text-slate-300`}>From <span className="font-bold text-brandBlue">NexLabs</span></p>
      </div>
    </div>
  );
}
