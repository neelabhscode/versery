import { track } from "@vercel/analytics";

const FIRST_TOUCH_KEY = "versery_first_touch";

function getCurrentUtmParams() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") || null,
    utm_medium: params.get("utm_medium") || null,
    utm_campaign: params.get("utm_campaign") || null,
    utm_content: params.get("utm_content") || null,
    utm_term: params.get("utm_term") || null,
  };
}

function hasAnyUtm(utm) {
  return Object.values(utm).some(Boolean);
}

export function captureFirstTouchAttribution() {
  if (typeof window === "undefined") return;
  const utm = getCurrentUtmParams();
  const existing = localStorage.getItem(FIRST_TOUCH_KEY);
  if (existing) return;

  const payload = {
    ...utm,
    referrer: document.referrer || null,
    landing_path: window.location.pathname || "/",
    captured_at: new Date().toISOString(),
  };

  if (!hasAnyUtm(utm) && !payload.referrer) return;
  localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(payload));
}

export function getAttributionContext() {
  if (typeof window === "undefined") return {};
  const currentUtm = getCurrentUtmParams();
  let firstTouch = {};
  try {
    firstTouch = JSON.parse(localStorage.getItem(FIRST_TOUCH_KEY) || "{}");
  } catch {
    firstTouch = {};
  }

  return {
    ...Object.fromEntries(
      Object.entries(currentUtm).map(([key, value]) => [`current_${key}`, value]),
    ),
    first_utm_source: firstTouch.utm_source || null,
    first_utm_medium: firstTouch.utm_medium || null,
    first_utm_campaign: firstTouch.utm_campaign || null,
    first_utm_content: firstTouch.utm_content || null,
    first_utm_term: firstTouch.utm_term || null,
    first_referrer: firstTouch.referrer || null,
    first_landing_path: firstTouch.landing_path || null,
  };
}

export function trackEvent(name, properties = {}) {
  if (typeof window === "undefined") return;
  const payload = {
    ...getAttributionContext(),
    path: window.location.pathname || "/",
    ...properties,
  };
  track(name, payload);
}
