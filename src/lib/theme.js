/**
 * Appearance: persisted light/dark on <html data-theme="…">.
 * Storage key absent → follow prefers-color-scheme until user toggles (then versery-theme is always light|dark).
 */

export const THEME_STORAGE_KEY = "versery-theme";

/** @returns {"light" | "dark"} */
export function readStoredTheme() {
  if (typeof window === "undefined") return "light";
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** @param {"light" | "dark"} theme */
export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* quota / private mode */
  }
  const meta = document.getElementById("versery-theme-color");
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#161718" : "#f9f9f9");
  }
}

/** Sync React state when another tab changes theme. */
export function subscribeThemeStorage(onChange) {
  if (typeof window === "undefined") return () => {};
  const handler = (e) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    const v = e.newValue;
    if (v === "light" || v === "dark") onChange(v);
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
