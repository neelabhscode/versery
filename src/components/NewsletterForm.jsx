import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import { CheckCheck } from "lucide-react";
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
  const containerRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [validationHint, setValidationHint] = useState(false);
  const [apiHint, setApiHint] = useState("");
  const [shake, setShake] = useState(false);
  const shakeTimerRef = useRef(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { stiffness: 150, damping: 25, mass: 0.5 };
  const springX = useSpring(mouseX, springConfig);
  const springY = useSpring(mouseY, springConfig);
  const paleGradient =
    "radial-gradient(circle, rgba(147, 197, 253, 0.45) 0%, rgba(196, 181, 253, 0.35) 30%, rgba(253, 186, 116, 0.15) 60%, transparent 80%)";

  const rootClass = `newsletter-form newsletter-form--${variant}${
    variant === "spotlight" && omitSpotlightHeadline ? " newsletter-form--spotlight-no-title" : ""
  }${variant === "spotlight" && isSubscribed ? " newsletter-form--spotlight-done" : ""}${
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

  const handleMouseMove = useCallback(
    (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouseX.set(e.clientX - rect.left);
      mouseY.set(e.clientY - rect.top);
    },
    [mouseX, mouseY],
  );

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
        setIsSubscribed(true);
        setIsHovered(false);
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
      <motion.form
        key="form"
        className="newsletter-form__pill-form newsletter-form__pill-form--fold flex flex-col origin-bottom relative z-10"
        onSubmit={handleSubmit}
        noValidate
        style={{
          transformOrigin: "bottom center",
          backfaceVisibility: "hidden",
        }}
        initial={{ opacity: 0, rotateX: 90 }}
        animate={{ opacity: 1, rotateX: 0 }}
        exit={{ opacity: 0, rotateX: -90, filter: "blur(8px)" }}
        transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      >
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
      </motion.form>
    );
  }

  if (variant === "spotlight") {
    return (
      <motion.div
        ref={containerRef}
        layout
        transition={{ layout: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } }}
        className={`${rootClass}`}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ perspective: "1000px" }}
      >
        {/* Layer 1: Default Ambient Wash */}
        {!isSubscribed && (
          <div className="absolute inset-0 z-0 pointer-events-none">
            <motion.div
              animate={{
                scale: [1, 1.08, 1.14, 1.08, 1],
                x: ["-50%", "-47%", "-42%", "-47%", "-50%"],
                y: ["-50%", "-52%", "-55%", "-52%", "-50%"],
                opacity: [0.54, 0.64, 0.76, 0.64, 0.54],
              }}
              transition={{ duration: 16, ease: "easeInOut", repeat: Infinity }}
              className="absolute top-1/2 left-1/2 w-[140%] aspect-square rounded-full mix-blend-multiply blur-[50px]"
              style={{ background: paleGradient }}
            />
          </div>
        )}

        {/* Layer 2: Cursor Tracking Stained Glass */}
        {!isSubscribed && (
          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden hidden sm:block">
            <motion.div
              initial={false}
              animate={{ opacity: isHovered ? 1 : 0 }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
              className="absolute rounded-full pointer-events-none mix-blend-multiply blur-[40px]"
              style={{
                x: springX,
                y: springY,
                translateX: "-50%",
                translateY: "-50%",
                width: 350,
                height: 350,
                background:
                  "radial-gradient(circle, rgba(147, 197, 253, 0.6) 0%, rgba(196, 181, 253, 0.4) 30%, transparent 70%)",
              }}
            />
          </div>
        )}

        {/* Layer 3: Seeping Success Wash */}
        <AnimatePresence>
          {isSubscribed && (
            <div className="absolute inset-0 z-0 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.5, x: "-50%", y: "-50%" }}
                animate={{
                  opacity: [0.52, 0.74, 0.86, 0.74, 0.52],
                  scale: [2.22, 2.4, 2.58, 2.4, 2.22],
                  x: ["-50%", "-49.5%", "-48.5%", "-49.5%", "-50%"],
                  y: ["-50%", "-49.8%", "-49.1%", "-49.8%", "-50%"],
                }}
                transition={{
                  duration: 18,
                  ease: "easeInOut",
                  repeat: Infinity,
                }}
                className="absolute top-1/2 left-1/2 w-[120%] aspect-square rounded-full mix-blend-multiply blur-[60px]"
                style={{
                  background:
                    "radial-gradient(circle, rgba(147, 197, 253, 0.55) 0%, rgba(196, 181, 253, 0.4) 30%, rgba(253, 186, 116, 0.25) 60%, transparent 80%)",
                }}
              />
            </div>
          )}
        </AnimatePresence>

        <motion.div
          layout
          transition={{ layout: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } }}
          className="relative z-10"
          style={{
            perspective: "1200px",
            transformStyle: "preserve-3d",
          }}
        >
          {!omitSpotlightHeadline ? (
            <h3 className="newsletter-form__title">{NEWSLETTER_SPOTLIGHT_HEADLINE}</h3>
          ) : null}
          <AnimatePresence mode="popLayout" initial={false}>
            {!isSubscribed ? (
              renderPillForm()
            ) : (
              <motion.div
                key="success"
                style={{
                  transformOrigin: "top center",
                  backfaceVisibility: "hidden",
                }}
                initial={{ opacity: 0, rotateX: 90, filter: "blur(8px)" }}
                animate={{ opacity: 1, rotateX: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1], delay: 0.05 }}
                className="newsletter-form__spotlight-success origin-top relative z-10"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.4 }}
                  className="newsletter-form__spotlight-success-icon"
                >
                  <CheckCheck className="newsletter-form__spotlight-success-icon-glyph" strokeWidth={2.2} />
                </motion.div>
                <h4 className="newsletter-form__spotlight-success-title">
                  You&rsquo;re in. A poem finds you soon.
                </h4>
                <p className="newsletter-form__spotlight-success-copy">Your first poem arrives Sunday.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
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
