/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Manrope", "sans-serif"]
      },
      colors: {
        panel: "#0f1424",
        surface: "#0b1120",
        accent: "#5f6fff",
        electric: "#7447ff",
        brandBlue: "#3f7cff"
      },
      boxShadow: {
        neon: "0 0 35px rgba(95,111,255,0.35)",
        glass: "0 12px 45px rgba(3, 7, 18, 0.55)"
      },
      backdropBlur: {
        xs: "2px"
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 rgba(95,111,255,0.25)" },
          "50%": { boxShadow: "0 0 35px rgba(95,111,255,0.4)" }
        },
        floatIn: {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0px)" }
        }
      },
      animation: {
        pulseGlow: "pulseGlow 2.6s ease-in-out infinite",
        floatIn: "floatIn 450ms ease-out"
      }
    }
  },
  plugins: []
};
