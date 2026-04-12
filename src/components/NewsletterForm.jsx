import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "../lib/analytics.js";

const CUSTOM_NEWSLETTER_URL = import.meta.env.VITE_NEWSLETTER_ACTION_URL?.trim() || "";
const ACTION_URL = CUSTOM_NEWSLETTER_URL || "/api/newsletter-signup";

function isValidEmail(value) {
  const v = String(value).trim();
  if (!v) return false;
  const el = document.createElement("input");
  el.type = "email";
  el.value = v;
  return el.validity.valid;
}

/** Homepage + modal tagline (lowercase). */
export const NEWSLETTER_SPOTLIGHT_HEADLINE = "A poem in your inbox, every week.";

/**
 * @param {{
 *   variant: "spotlight" | "poemModal";
 *   surface: string;
 *   onSuccess?: () => void;
 *   className?: string;
 *   omitSpotlightHeadline?: boolean;
 *   onSpotlightHeadSuccess?: () => void;
 * }} props
 */
export function NewsletterForm({
  variant,
  surface,
  onSuccess,
  className = "",
  omitSpotlightHeadline = false,
  onSpotlightHeadSuccess,
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [validationHint, setValidationHint] = useState(false);
  const [apiHint, setApiHint] = useState("");
  const [shake, setShake] = useState(false);
  const shakeTimerRef = useRef(null);

  const rootClass = `newsletter-form newsletter-form--${variant}${
    variant === "spotlight" && omitSpotlightHeadline ? " newsletter-form--spotlight-no-title" : ""
  }${variant === "spotlight" && status === "ok" ? " newsletter-form--spotlight-done" : ""}${
    className ? ` ${className}` : ""
  }`;
  const fieldId = `versery-news-${String(surface).replace(/[^a-zA-Z0-9_-]/g, "-")}-${variant}`;

  const triggerShake = useCallback(() => {
    if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
    setShake(true);
    shakeTimerRef.current = window.setTimeout(() => {
      setShake(false);
      shakeTimerRef.current = null;
    }, 420);
  }, []);

  useEffect(() => {
    return () => {
      if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === "sending") return;

    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setValidationHint(true);
      setApiHint("");
      triggerShake();
      trackEvent("newsletter_submit_invalid", { surface, variant });
      return;
    }

    setValidationHint(false);
    setApiHint("");
    setStatus("sending");
    trackEvent("newsletter_submit", { surface, variant });

    try {
      const body = new URLSearchParams();
      body.set("email", trimmed);
      const res = await fetch(ACTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body,
        mode: "cors",
      });
      if (res.ok || res.status === 302 || res.status === 204) {
        setStatus("ok");
        setEmail("");
        if (variant === "spotlight") onSpotlightHeadSuccess?.();
        onSuccess?.();
        trackEvent("newsletter_submit_ok", {
          surface,
          variant,
          mode: CUSTOM_NEWSLETTER_URL ? "external" : "versery_store",
        });
      } else {
        setStatus("idle");
        setApiHint("Couldn’t subscribe — try again later.");
        trackEvent("newsletter_submit_error", { surface, variant, status: res.status });
      }
    } catch {
      setStatus("idle");
      setApiHint("Couldn’t subscribe — check your connection.");
      trackEvent("newsletter_submit_error", { surface, variant, status: "network" });
    }
  }

  function renderSuccess() {
    return (
      <p className="newsletter-form__success" role="status">
        You&rsquo;re in. A poem finds you soon.
      </p>
    );
  }

  function renderPillForm() {
    return (
      <form className="newsletter-form__pill-form" onSubmit={handleSubmit} noValidate>
        <label className="visually-hidden" htmlFor={fieldId}>
          Email
        </label>
        <div
          className={
            "newsletter-form__pill" + (shake ? " newsletter-form__pill--shake" : "")
          }
        >
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
            onChange={(e) => {
              setEmail(e.target.value);
              if (validationHint) setValidationHint(false);
              if (apiHint) setApiHint("");
            }}
          />
          <button
            type="submit"
            className={
              "newsletter-form__pill-action" +
              (status === "sending" ? " newsletter-form__pill-action--busy" : "")
            }
            disabled={status === "sending"}
            aria-label="Join newsletter"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {status === "sending" ? "progress_activity" : "arrow_forward"}
            </span>
          </button>
        </div>
        {validationHint ? (
          <p className="newsletter-form__field-hint">A valid email helps.</p>
        ) : null}
        {apiHint ? (
          <p className="newsletter-form__field-hint newsletter-form__field-hint--api">{apiHint}</p>
        ) : null}
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
      </div>
    );
  }

  if (variant === "poemModal") {
    return (
      <div className={rootClass}>
        <h2 id="poem-subscribe-heading" className="newsletter-form__poem-modal-heading">
          {NEWSLETTER_SPOTLIGHT_HEADLINE}
        </h2>
        {status === "ok" ? renderSuccess() : null}
        {renderPillForm()}
      </div>
    );
  }

  return null;
}
