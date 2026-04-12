import { useCallback, useEffect, useState } from "react";
import { trackEvent } from "../lib/analytics.js";

const HALO_MS = 2800;
const HALO_INTERVAL_MS = 120_000;

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.navigator.standalone === true) return true;
  return false;
}

/**
 * @param {{
 *   surface: string;
 *   className?: string;
 *   label?: string;
 *   deferredPrompt?: Event | null;
 *   onConsumedPrompt?: () => void;
 *   movingBorder?: boolean;
 *   tooltip?: string;
 * }} props
 */
export function InstallAppButton({
  surface,
  className = "",
  label = "Add Versery to your home screen",
  deferredPrompt = null,
  onConsumedPrompt,
  movingBorder = false,
  tooltip,
}) {
  const [haloOn, setHaloOn] = useState(false);

  const runHalo = useCallback(() => {
    setHaloOn(true);
    window.setTimeout(() => setHaloOn(false), HALO_MS);
  }, []);

  useEffect(() => {
    if (!movingBorder || typeof window === "undefined") return undefined;
    let mq;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      mq = null;
    }
    if (mq?.matches) return undefined;

    const id = window.setInterval(runHalo, HALO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [movingBorder, runHalo]);

  if (typeof window !== "undefined" && isStandaloneDisplay()) return null;

  async function handleClick() {
    trackEvent("pwa_install_anchor_clicked", { surface });
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } catch {
        /* */
      }
      onConsumedPrompt?.();
    }
  }

  const btn = (
    <button
      type="button"
      className={className.trim() || "screen-action-btn"}
      aria-label={label}
      title={tooltip || undefined}
      onClick={handleClick}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        download
      </span>
    </button>
  );

  if (!movingBorder) return btn;

  return (
    <span className={`install-app-btn-wrap${haloOn ? " install-app-btn-wrap--halo" : ""}`}>
      <span className="install-app-btn-wrap__ring" aria-hidden="true" />
      {btn}
    </span>
  );
}
