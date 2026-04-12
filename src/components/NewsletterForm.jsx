import { useState } from "react";
import { trackEvent } from "../lib/analytics.js";

const ACTION_URL = import.meta.env.VITE_NEWSLETTER_ACTION_URL?.trim() || "";

/** Shown on the home newsletter card (also rendered from `App` when the headline is lifted into the card head row). */
export const NEWSLETTER_SPOTLIGHT_HEADLINE = "A curated collection in your inbox weekly.";

/**
 * @param {{
 *   variant: "spotlight" | "poemModal";
 *   surface: string;
 *   onSuccess?: () => void;
 *   className?: string;
 *   omitSpotlightHeadline?: boolean;
 * }} props
 */
export function NewsletterForm({ variant, surface, onSuccess, className = "", omitSpotlightHeadline = false }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const configured = Boolean(ACTION_URL);
  const rootClass = `newsletter-form newsletter-form--${variant}${
    variant === "spotlight" && omitSpotlightHeadline ? " newsletter-form--spotlight-no-title" : ""
  }${className ? ` ${className}` : ""}`;
  const fieldId = `versery-news-${String(surface).replace(/[^a-zA-Z0-9_-]/g, "-")}-${variant}`;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!email.trim() || status === "sending") return;
    if (!configured) {
      setMessage("We’re not taking signups yet — check back soon.");
      return;
    }
    setStatus("sending");
    setMessage("");
    trackEvent("newsletter_submit", { surface, variant });
    try {
      const body = new URLSearchParams();
      body.set("email", email.trim());
      const res = await fetch(ACTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body,
        mode: "cors",
      });
      if (res.ok || res.status === 302 || res.status === 204) {
        setStatus("ok");
        setMessage("You’re on the list.");
        setEmail("");
        onSuccess?.();
        trackEvent("newsletter_submit_ok", { surface, variant });
      } else {
        setStatus("error");
        setMessage("Couldn’t subscribe — try again later.");
        trackEvent("newsletter_submit_error", { surface, variant, status: res.status });
      }
    } catch {
      setStatus("error");
      setMessage("Couldn’t subscribe — check your connection.");
      trackEvent("newsletter_submit_error", { surface, variant, status: "network" });
    }
  }

  function renderPillForm() {
    return (
      <form className="newsletter-form__pill-form" onSubmit={handleSubmit} noValidate>
        <label className="visually-hidden" htmlFor={fieldId}>
          Email
        </label>
        <div className="newsletter-form__pill">
          <input
            id={fieldId}
            className="newsletter-form__pill-input"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@email.com"
            value={email}
            disabled={status === "sending"}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            className={
              "newsletter-form__pill-action" +
              (status === "sending" ? " newsletter-form__pill-action--busy" : "")
            }
            disabled={status === "sending" || !email.trim()}
            aria-label="Join newsletter"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {status === "sending" ? "progress_activity" : "arrow_forward"}
            </span>
          </button>
        </div>
      </form>
    );
  }

  if (variant === "spotlight") {
    return (
      <div className={rootClass}>
        {!omitSpotlightHeadline ? (
          <h3 className="newsletter-form__title">{NEWSLETTER_SPOTLIGHT_HEADLINE}</h3>
        ) : null}
        {renderPillForm()}
        {configured ? (
          <p className="newsletter-form__hint">No spam — unsubscribe anytime.</p>
        ) : null}
        {message ? <p className="newsletter-form__feedback">{message}</p> : null}
      </div>
    );
  }

  if (variant === "poemModal") {
    return (
      <div className={rootClass}>
        <p className="newsletter-form__poem-modal-label">Newsletter</p>
        <h2 id="poem-subscribe-heading" className="newsletter-form__poem-modal-heading">
          Weekly Curated Poems in your Inbox
        </h2>
        {renderPillForm()}
        {configured ? (
          <p className="newsletter-form__hint newsletter-form__hint--poem-modal">No spam — unsubscribe anytime.</p>
        ) : null}
        {message ? <p className="newsletter-form__feedback">{message}</p> : null}
      </div>
    );
  }

  return null;
}
