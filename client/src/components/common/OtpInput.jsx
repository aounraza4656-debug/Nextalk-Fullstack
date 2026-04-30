import { useEffect, useRef } from "react";

export default function OtpInput({ value, onChange }) {
  const refs = useRef([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const updateAt = (index, digit) => {
    const chars = value.split("");
    chars[index] = digit;
    onChange(chars.join(""));
  };

  const handleChange = (index, next) => {
    const digit = next.replace(/\D/g, "").slice(-1);
    updateAt(index, digit || "");
    if (digit && index < 5) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (event, index) => {
    if (event.key === "Backspace" && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="flex gap-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          value={value[index] || ""}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          className="h-12 w-12 rounded-xl border border-slate-600/70 bg-slate-950/70 text-center text-lg font-semibold text-slate-100 outline-none transition focus:border-brandBlue focus:ring-2 focus:ring-brandBlue/50"
          maxLength={1}
          inputMode="numeric"
        />
      ))}
    </div>
  );
}
