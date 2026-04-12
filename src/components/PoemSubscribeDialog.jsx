import { useEffect, useRef } from "react";
import { trackEvent } from "../lib/analytics.js";
import { NewsletterForm } from "./NewsletterForm.jsx";

/**
 * Centered subscribe modal for poem reader (faint backdrop blur).
 *
 * @param {{ open: boolean; onClose: () => void }} props
 */
export function PoemSubscribeDialog({ open, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const el = dialogRef.current;
    if (!el) return undefined;
    try {
      if (!el.open) {
        el.showModal();
        trackEvent("newsletter_subscribe_dialog_opened", { surface: "poem_modal" });
      }
    } catch {
      /* showModal can throw in rare timing cases */
    }
    return () => {
      try {
        if (el.open) el.close();
      } catch {
        /* */
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="subscribe-dialog"
      aria-labelledby="poem-subscribe-heading"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="subscribe-dialog__panel" onClick={(e) => e.stopPropagation()}>
        <div className="whats-new-panel__head">
          <p className="feature-card-main__heading">Newsletter</p>
          <button type="button" className="whats-new-panel__close" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>
        <NewsletterForm variant="poemModal" surface="poem_modal" />
      </div>
    </dialog>
  );
}
