export default function BrandLogo({ compact = false, lightMode = false }) {
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-4"}`}>
      <div className={`${compact ? "h-10 w-10 rounded-lg" : "h-16 w-16 rounded-2xl"} overflow-hidden bg-transparent shadow-[0_8px_20px_rgba(28,147,255,0.25)]`}>
        <img src="/nexvocal-logo.png" alt="NexVocal" className="h-full w-full object-contain" />
      </div>
      <div>
        <h1 className={`${compact ? "text-xl" : "text-3xl"} font-display font-bold ${lightMode ? "text-slate-900" : "text-slate-100"}`}>NexVocal</h1>
        <p className={`${compact ? "text-xs" : "text-sm"} font-medium ${lightMode ? "text-slate-600" : "text-slate-300"}`}>By <span className={`font-bold ${lightMode ? "text-cyan-700" : "text-brandBlue"}`}>NexLabs</span></p>
      </div>
    </div>
  );
}
