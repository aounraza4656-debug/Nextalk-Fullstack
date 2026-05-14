import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);
const THEME_STORAGE_KEY = "theme";

function readInitialTheme() {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(THEME_STORAGE_KEY)
    || localStorage.getItem("nexvocal_theme_mode")
    || localStorage.getItem("nextalk_theme_mode");
  if (saved === "light" || saved === "dark") return saved;
  const domTheme = document.documentElement.getAttribute("data-theme");
  if (domTheme === "light" || domTheme === "dark") return domTheme;
  return "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    localStorage.setItem("nexvocal_theme_mode", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(() => ({
    theme,
    isLightTheme: theme === "light",
    setTheme,
    toggleTheme
  }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
