/**
 * Appearance: persisted light/dark on <html data-theme="…">.
 * Storage key absent → follow prefers-color-scheme until user toggles (then versery-theme is always light|dark).
 */

export const THEME_STORAGE_KEY = "versery-theme";

/** Matches `--theme-crossfade-duration` in `styles.css` (fallback path timeout buffer). */
export const THEME_TRANSITION_MS = 280;

const THEME_TRANSITION_CLASS = "theme-transition-active";

let themeFallbackTimer = 0;

function clearThemeFallback() {
  if (themeFallbackTimer) {
    clearTimeout(themeFallbackTimer);
    themeFallbackTimer = 0;
  }
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove(THEME_TRANSITION_CLASS);
  }
}

function prefersCrossfadeMotion() {
  if (typeof window === "undefined") return false;
  try {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

/** @param {"light" | "dark"} theme */
function commitTheme(theme) {
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

/**
 * @param {"light" | "dark"} theme
 * @param {{ animate?: boolean, onAfterThemeCommit?: () => void }} [options]
 *   - `animate: true` — root crossfade when motion is allowed (View Transitions API, else a short CSS fallback).
 *   - `onAfterThemeCommit` — runs synchronously after `dataset`/meta/localStorage update; use with `flushSync` so React-controlled UI matches the new snapshot.
 */
export function applyTheme(theme, options = {}) {
  if (typeof document === "undefined") return;
  const { animate = false, onAfterThemeCommit } = options;

  const run = () => {
    commitTheme(theme);
    onAfterThemeCommit?.();
  };

  if (!animate || !prefersCrossfadeMotion()) {
    clearThemeFallback();
    run();
    return;
  }

  const doc = document;
  const startVt = doc.startViewTransition?.bind(doc);
  if (startVt) {
    clearThemeFallback();
    startVt(() => {
      run();
    });
    return;
  }

  clearThemeFallback();
  const root = doc.documentElement;
  root.classList.add(THEME_TRANSITION_CLASS);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      run();
      themeFallbackTimer = window.setTimeout(() => {
        root.classList.remove(THEME_TRANSITION_CLASS);
        themeFallbackTimer = 0;
      }, THEME_TRANSITION_MS + 50);
    });
  });
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
