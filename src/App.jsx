import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import html2canvas from "html2canvas";
import { portalTagsForTopRankedMood } from "./lib/moods.js";
import { buildShareGradientFromAccent, tagPastelHex, TAG_PASTEL_HEX } from "./lib/tag-pastels.js";
import { filterByPortal, filterByPortals, filterByPoet } from "./lib/search.js";
import { captureFirstTouchAttribution, trackEvent } from "./lib/analytics.js";
import { poetInitialsFromAuthor, poetPortraitUrl } from "./lib/poet-portraits.js";
import { applyTheme, readStoredTheme, subscribeThemeStorage } from "./lib/theme.js";
import { NewsletterForm, NEWSLETTER_SPOTLIGHT_HEADLINE } from "./components/NewsletterForm.jsx";
import { InstallAppButton } from "./components/InstallAppButton.jsx";
import { PoemSubscribeDialog } from "./components/PoemSubscribeDialog.jsx";

const DEFAULT_META_DESCRIPTION =
  "Read poetry online by mood, poet, or theme—without noisy feeds. Versery is a calm reader for daily picks, archives, and slow discovery.";

const DEFAULT_OG_DESCRIPTION =
  "Read poetry online by mood, poet, or theme—without noisy feeds. Daily picks, archives, and calm discovery.";

const DEFAULT_TWITTER_DESCRIPTION =
  "Poetry by mood, poet, or theme—daily picks and themed archives in a quiet reader.";

const DEFAULT_DOCUMENT_TITLE = "Versery — Curated poetry for quiet reading";

const WHATS_NEW_BULLETS = [
  "Dark mode — switch anytime from the navbar",
  "More voices — Ghalib, Tagore, Rilke, Hafez, and more",
  "Share a poem — pick lines, generate a card, send it",
  "Weekly poem — sign up to get one in your inbox",
  "Install as App — add Versery to your home screen",
];

const WHATS_NEW_EMDASH = " — ";

function splitWhatsNewBulletLine(text) {
  const idx = text.indexOf(WHATS_NEW_EMDASH);
  if (idx === -1) return { lead: text, rest: null };
  return { lead: text.slice(0, idx), rest: text.slice(idx + WHATS_NEW_EMDASH.length) };
}

function trimTo160Chars(text) {
  if (!text || typeof text !== "string") return "";
  const t = text.trim();
  if (t.length <= 160) return t;
  return `${t.slice(0, 157)}…`;
}

function upsertNamedMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertPropertyMeta(property, content) {
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonicalLink(href) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function pathFromVerserySnapshot(snap) {
  if (!snap || typeof snap !== "object") return "/";
  switch (snap.screen) {
    case "home":
      return "/";
    case "compass":
      return "/compass";
    case "voices":
      return "/voices";
    case "voiceDetail":
      return snap.activeVoiceId ? `/voices/${encodeURIComponent(snap.activeVoiceId)}` : "/voices";
    case "voiceWorks":
      return snap.activeVoiceId
        ? `/voices/${encodeURIComponent(snap.activeVoiceId)}/works`
        : "/voices";
    case "collections":
      return "/collections";
    case "collectionDetail":
      return snap.activeCollectionId
        ? `/collections/${encodeURIComponent(snap.activeCollectionId)}`
        : "/collections";
    case "discoveryResults": {
      const key = snap.discoveryContext?.key;
      if (!key || typeof key !== "string") return "/";
      const slug = key.toLowerCase();
      if (snap.discoveryContext?.source === "compass") return `/compass/${encodeURIComponent(slug)}`;
      return `/mood/${encodeURIComponent(slug)}`;
    }
    case "poemDetail":
      return snap.activePoemId ? `/poem/${encodeURIComponent(snap.activePoemId)}` : "/";
    default:
      return "/";
  }
}

/** Home-only FAQ: visible copy must stay in sync with injected FAQPage JSON-LD. */
const HOME_FAQ_ITEMS = [
  {
    question: "What is Versery?",
    answer:
      "Versery is a web reader for hand-picked poetry. You can browse by mood, open poet profiles, or explore themed collections—without ads or cluttered feeds.",
  },
  {
    question: "How do I find poems by mood?",
    answer:
      "Pick a feeling on the home screen, or use the Emotional Compass for atmosphere-led browsing. Each path surfaces a rotating set of poems from the archive.",
  },
  {
    question: "Is Versery free to read?",
    answer:
      "Yes. Reading and browsing the archive is free; Versery is built for quiet, intentional discovery rather than paywalls or aggressive upsells.",
  },
  {
    question: "Can I read classic poets alongside contemporary work?",
    answer:
      "Yes. The Poet voices library mixes historical figures and modern voices so you can move between eras in one place.",
  },
];

function homeFaqJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

const FAQ_DETAILS_ANIM =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("selector(details::details-content)");

/** Native <details> removes [open] before paint, so collapse snaps. Defer close until ::details-content exit runs. */
function handleHomeFaqDetailsClick(event) {
  const el = event.currentTarget;
  if (!(el instanceof HTMLDetailsElement)) return;
  if (!event.target.closest("summary")) return;
  if (el.dataset.faqClosing === "1") {
    event.preventDefault();
    return;
  }
  if (!el.open) return;
  if (!FAQ_DETAILS_ANIM) return;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  event.preventDefault();
  el.dataset.faqClosing = "1";
  el.classList.add("home-faq__item--closing");

  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    el.removeEventListener("transitionend", onTransitionEnd);
    window.clearTimeout(fallbackTimer);
    el.classList.remove("home-faq__item--closing");
    el.dataset.faqClosing = "";
    el.open = false;
  };

  const onTransitionEnd = (ev) => {
    if (ev.target !== el) return;
    const pe = ev.pseudoElement || "";
    if (pe && pe !== "::details-content") return;
    if (ev.propertyName !== "block-size" && ev.propertyName !== "height") return;
    cleanup();
  };

  el.addEventListener("transitionend", onTransitionEnd);
  const fallbackTimer = window.setTimeout(cleanup, 520);
}

const feelings = ["Melancholic", "Ethereal", "Radiant", "Solitary"];

const SHARE_SELECTION_LIMIT = 600;

/** html2canvas edge fill — theme-independent so share PNGs stay consistent in dark mode. */
const SHARE_CAPTURE_BG = "#fdfcfb";

function normalizeSelectedText(rawText) {
  return rawText.replace(/\r\n/g, "\n");
}

const COMPASS_PORTAL_KEYS = ["Calm", "Pulse", "Focus", "Warmth", "Static", "Lush", "Drift", "Echo"];
const HOME_FEELING_KEYS = ["Melancholic", "Ethereal", "Radiant", "Solitary"];

/** Curator mood chip → palette when possible; else rank-1 portalTags[0]; then legacy fallbacks. */
function resolvePoemAccentHex(poemLike, fallbackFeeling = "Melancholic") {
  if (!poemLike || typeof poemLike !== "object") return tagPastelHex("Melancholic");
  const chip = poemLike.moodChip;
  if (chip && TAG_PASTEL_HEX[chip]) return tagPastelHex(chip);
  const tags = poemLike.portalTags ?? [];
  const primary = tags[0];
  if (primary && TAG_PASTEL_HEX[primary]) return tagPastelHex(primary);
  const portalHit = tags.find((t) => COMPASS_PORTAL_KEYS.includes(t));
  if (portalHit) return tagPastelHex(portalHit);
  const feelingHit = tags.find((t) => HOME_FEELING_KEYS.includes(t));
  if (feelingHit) return tagPastelHex(feelingHit);
  const any = tags.find((t) => TAG_PASTEL_HEX[t]);
  if (any) return tagPastelHex(any);
  if (fallbackFeeling && TAG_PASTEL_HEX[fallbackFeeling]) return tagPastelHex(fallbackFeeling);
  return tagPastelHex("Melancholic");
}

/** Accent from keyword-ranked top mood → portal tags (matches fetch-poems classifier shape). */
function accentHexFromRankedLineClassification(flatLines) {
  const tags = portalTagsForTopRankedMood(flatLines);
  for (const tag of tags) {
    if (TAG_PASTEL_HEX[tag]) return tagPastelHex(tag);
  }
  return tagPastelHex("Melancholic");
}

const portals = [
  { name: "Calm", subtitle: "Cyan Void", icon: "waves", tone: "cyan" },
  { name: "Pulse", subtitle: "Rose Flow", icon: "bolt", tone: "rose" },
  { name: "Focus", subtitle: "Indigo Deep", icon: "lens_blur", tone: "indigo" },
  { name: "Warmth", subtitle: "Solar Glow", icon: "light_mode", tone: "amber" },
  { name: "Static", subtitle: "Monochrome", icon: "grain", tone: "neutral" },
  { name: "Lush", subtitle: "Verdan Drift", icon: "eco", tone: "verdant" },
  { name: "Drift", subtitle: "Nebula Mist", icon: "flare", tone: "neutral" },
  { name: "Echo", subtitle: "Minimal Resonance", icon: "graphic_eq", tone: "neutral" },
];

const voiceFilters = ["All Eras", "Modernism", "Beat", "Digital", "Surrealist"];

const ERA_FILTER_MAPPING = {
  "All Eras": [],
  "Modernism": ["Pulse", "Static"],
  "Beat": ["Radiant", "Pulse"],
  "Digital": ["Ethereal", "Focus"],
  "Surrealist": ["Drift", "Focus"],
};

const PORTAL_META = {
  Melancholic: { subtitle: "Poems for softened light, returning ache, and rooms that keep listening after the door closes.", showFeaturedPoem: true },
  Ethereal:    { subtitle: "A brighter drift of poems where water, breath, and sky keep brushing past one another.", showFeaturedPoem: true },
  Radiant:     { subtitle: "Poems with a little lift in them, where brightness arrives as movement rather than noise.", showFeaturedPoem: true },
  Solitary:    { subtitle: "Quiet poems for edges, thresholds, and the long private distance between one thought and the next.", showFeaturedPoem: true },
  Calm:        { subtitle: "Cyan Void. Still-water poems and slow, clean lines for a steadier inner weather.", showFeaturedPoem: false },
  Pulse:       { subtitle: "Rose Flow. Poems with motion in the bloodstream and a little voltage under the skin.", showFeaturedPoem: false },
  Focus:       { subtitle: "Indigo Deep. Composed, precise poems for concentration, structure, and interior clarity.", showFeaturedPoem: false },
  Warmth:      { subtitle: "Solar Glow. Poems with ember, welcome, and a little shared light held inside them.", showFeaturedPoem: false },
  Static:      { subtitle: "Monochrome. Fragmented poems, grainy edges, and signal caught half inside the page.", showFeaturedPoem: false },
  Lush:        { subtitle: "Verdan Drift. Dense, breathing poems shaped by leaf-light, water, and organic repetition.", showFeaturedPoem: false },
  Drift:       { subtitle: "Nebula Mist. Atmospheres first, edges second. Poems that move in half-light and afterimage.", showFeaturedPoem: false },
  Echo:        { subtitle: "Minimal Resonance. Repetition, return, and the soft persistence of one line meeting another.", showFeaturedPoem: false },
};

// Curated collection metadata — poems are derived dynamically via portal tags
const DEFAULT_COLLECTION_TEMPLATES = [
  {
    id: "romantics",
    label: "Seasonal Selection",
    title: "The Romantics",
    description: "Intensity, nature, and the sublime — the great English Romantics in full voice.",
    archiveDescription: "Exploring the sublime intersection of nature's chaos and the human heart.",
    image: "/collections/romantics.jpg",
    artwork: "/collections/romantics.jpg",
    count: "32 Collections",
    featured: true,
    tone: "deep",
    curator: { name: "Neelabh", role: "Editor-in-Chief" },
    portalTags: ["Lush", "Ethereal", "Drift"],
  },
  {
    id: "mystics",
    label: "Eternal Knowledge",
    title: "Devotion & Mystery",
    description: "Poems that reach past the visible world — spiritual light, inner surrender, and awe.",
    archiveDescription: "Where poetry becomes prayer and wonder becomes theology.",
    image: "/collections/mystics.jpg",
    artwork: "/collections/mystics.jpg",
    count: "24 Collections",
    tone: "sand",
    curator: { name: "Neelabh", role: "Archive Curator" },
    portalTags: ["Ethereal", "Calm", "Echo"],
  },
  {
    id: "nature",
    label: "Living Rhythm",
    title: "Nature's Pulse",
    description: "Poems rooted in the living world — leaf-light, river-sound, and the turning of seasons.",
    archiveDescription: "The biological symmetry found within the quietest corners of the wild.",
    image: "/collections/nature.jpg",
    artwork: "/collections/nature.jpg",
    count: "18 Collections",
    tone: "mist",
    curator: { name: "Neelabh", role: "Field Editor" },
    portalTags: ["Lush", "Calm", "Drift"],
  },
  {
    id: "love",
    label: "Heart Archive",
    title: "Love & Longing",
    description: "Devotion, absence, and the tender machinery of the heart across the centuries.",
    archiveDescription: "Devotion, absence, and the tender machinery of the heart across the centuries.",
    image: "/collections/love.jpg",
    artwork: "/collections/love.jpg",
    count: "21 Collections",
    tone: "sand",
    curator: { name: "Neelabh", role: "Guest Editor" },
    portalTags: ["Warmth", "Radiant"],
  },
  {
    id: "solitude",
    label: "Inner Life",
    title: "The Solitary Hour",
    description: "Poems composed in quietness, for the reader who sits apart from the noise.",
    archiveDescription: "Poems composed in quietness, for the reader who sits apart from the noise.",
    image: "/collections/solitude.jpg",
    artwork: "/collections/solitude.jpg",
    count: "15 Collections",
    tone: "plain",
    curator: { name: "Neelabh", role: "Resident Curator" },
    portalTags: ["Calm", "Solitary", "Echo"],
  },
  {
    id: "witness",
    label: "Against Forgetting",
    title: "Conflict & Testimony",
    description: "Poetry forged under pressure — the weight of war, loss, and difficult truth.",
    archiveDescription: "Poetry forged in the fire of conflict — the weight of testimony.",
    image: "/collections/witness.jpg",
    artwork: "/collections/witness.jpg",
    count: "11 Collections",
    tone: "plain",
    curator: { name: "Neelabh", role: "Guest Editor" },
    portalTags: ["Static", "Pulse"],
  },
  {
    id: "transcendentalists",
    label: "American Wild",
    title: "The Open Road",
    description: "Expansive, democratic, radiant — poems of self-reliance, freedom, and the wide earth.",
    archiveDescription: "The moral weather of solitude, landscape, and self-reliance.",
    image: "/collections/transcendentalists.jpg",
    artwork: "/collections/transcendentalists.jpg",
    count: "14 Collections",
    tone: "mist",
    curator: { name: "Neelabh", role: "Guest Curator" },
    portalTags: ["Lush", "Radiant", "Focus"],
  },
  {
    id: "after-hours",
    label: "Night Archive",
    title: "After Hours",
    description: "A shelf of works for insomniac rooms, dim streets, and the hush after conversation.",
    archiveDescription: "A shelf of works for insomniac rooms, dim streets, and the hush after conversation.",
    image: "/collections/after-hours.jpg",
    artwork: "/collections/after-hours.jpg",
    count: "12 Collections",
    tone: "deep",
    curator: { name: "Neelabh", role: "Night Editor" },
    portalTags: ["Static", "Melancholic", "Solitary"],
  },
];

// Returns the raw poem object to feature today. Rotates daily, avoids
// Pick up to `limit` poems for a portal tag, interleaved across poets so no
// single poet dominates. Each poet's own poems are randomly ordered.
function pickDiverse(poems, portalTag, limit = 20) {
  const matching = poems.filter((p) => p.portalTags?.includes(portalTag));
  // Group by poet, shuffle within each group
  const byPoet = {};
  for (const poem of matching) {
    const key = poem.poetId ?? "unknown";
    if (!byPoet[key]) byPoet[key] = [];
    byPoet[key].push(poem);
  }
  for (const key of Object.keys(byPoet)) {
    byPoet[key] = byPoet[key].sort(() => Math.random() - 0.5);
  }
  // Randomise poet order, then round-robin across groups
  const groups = Object.values(byPoet).sort(() => Math.random() - 0.5);
  const result = [];
  let i = 0;
  while (result.length < limit) {
    let added = false;
    for (const group of groups) {
      if (i < group.length && result.length < limit) {
        result.push(group[i]);
        added = true;
      }
    }
    if (!added) break;
    i++;
  }
  return result;
}

// repeating the same poem within ~60 days. Stored in localStorage.
function getDailyFeaturedPoem(poems, excludePoetId = null) {
  const KEY = "versery_featured_poem";
  const DAY_MS = 86_400_000;
  const AVOID_MS = 60 * DAY_MS;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const now = Date.now();
    if (stored.expiresAt > now && stored.poemId) {
      const poem = poems.find((p) => p.id === stored.poemId);
      // If cached poem exists AND is not excluded, use it
      if (poem && (!excludePoetId || poem.poetId !== excludePoetId)) {
        return poem;
      }
      // If cached poem is excluded, invalidate and regenerate
    }
    // Quality pool for curated excerpts: prefer 4-40 lines, fallback 2+.
    const quality = poems.filter((p) => {
      const isQuality = p.linecount >= 4 && p.linecount <= 40;
      const notExcluded = !excludePoetId || p.poetId !== excludePoetId;
      return isQuality && notExcluded;
    });
    const fallbackQuality = poems.filter((p) => {
      const isQuality = p.linecount >= 2;
      const notExcluded = !excludePoetId || p.poetId !== excludePoetId;
      return isQuality && notExcluded;
    });
    const recentCutoff = now - AVOID_MS;
    const recent = new Set(
      (stored.recent ?? []).filter((r) => r.at > recentCutoff).map((r) => r.id),
    );
    const fresh = quality.filter((p) => !recent.has(p.id));
    const basePool = quality.length > 0 ? quality : fallbackQuality;
    const pool = fresh.length >= 20 ? fresh : basePool;
    const chosen = pool[Math.floor(Math.random() * pool.length)] ?? poems[0];
    localStorage.setItem(
      KEY,
      JSON.stringify({
        poemId: chosen.id,
        expiresAt: now + DAY_MS,
        recent: [
          ...(stored.recent ?? []).filter((r) => r.at > recentCutoff),
          { id: chosen.id, at: now },
        ].slice(-80),
      }),
    );
    return chosen;
  } catch {
    return poems[Math.floor(Math.random() * poems.length)];
  }
}

function getDailyFeaturedPoemFromPool(poemsPool, fallbackPoems, excludePoetId = null) {
  if (poemsPool.length) {
    return getDailyFeaturedPoem(poemsPool, excludePoetId);
  }
  return getDailyFeaturedPoem(fallbackPoems, excludePoetId);
}

// Returns the poet ID for the current week. Rotates weekly, avoids repeating
// the same poet within ~3 weeks. Stored in localStorage.
function getPoetOfWeekId(voiceIds) {
  const KEY = "versery_poet_week";
  const WEEK_MS = 7 * 86_400_000;
  const AVOID_MS = 3 * WEEK_MS;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const now = Date.now();
    if (stored.expiresAt > now && stored.poetId && voiceIds.includes(stored.poetId)) {
      return stored.poetId;
    }
    const recentCutoff = now - AVOID_MS;
    const recent = new Set(
      (stored.recent ?? []).filter((r) => r.at > recentCutoff).map((r) => r.id),
    );
    const available = voiceIds.filter((id) => !recent.has(id));
    const pool = available.length > 0 ? available : voiceIds;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    localStorage.setItem(
      KEY,
      JSON.stringify({
        poetId: chosen,
        expiresAt: now + WEEK_MS,
        recent: [
          ...(stored.recent ?? []).filter((r) => r.at > recentCutoff),
          { id: chosen, at: now },
        ].slice(-30),
      }),
    );
    return chosen;
  } catch {
    return voiceIds[0];
  }
}

function normalizeStanzas(rawPoem) {
  if (Array.isArray(rawPoem.stanzas) && rawPoem.stanzas.length > 0) {
    const cleaned = rawPoem.stanzas
      .map((stanza) => stanza.map((line) => String(line).trim()).filter(Boolean))
      .filter((stanza) => stanza.length > 0);
    if (cleaned.length) return cleaned;
  }
  if (Array.isArray(rawPoem.lines) && rawPoem.lines.length > 0) {
    return [rawPoem.lines.map((line) => String(line).trim()).filter(Boolean)];
  }
  return [[""]];
}

function poemToEntry(rawPoem) {
  const lines = normalizeStanzas(rawPoem);
  const flat = lines.flat();
  return {
    id: rawPoem.id,
    title: rawPoem.title,
    subtitle: rawPoem.excerpt,
    translator: `By ${rawPoem.author}`,
    lines,
    note: rawPoem.excerpt,
    icon: "ink_highlighter",
    footerIcon: "eco",
    poetId: rawPoem.poetId ?? null,
    author: rawPoem.author ?? null,
    portalTags: rawPoem.portalTags ?? [],
    moodChip: rawPoem.mood_chip ?? null,
    rankedAccentHex: (() => {
      const chip = rawPoem.mood_chip ?? null;
      if (chip && TAG_PASTEL_HEX[chip]) return tagPastelHex(chip);
      const tags = rawPoem.portalTags ?? [];
      if (tags.length >= 1 && TAG_PASTEL_HEX[tags[0]]) return tagPastelHex(tags[0]);
      return accentHexFromRankedLineClassification(flat);
    })(),
  };
}

function formatLifeSpan(born, died) {
  if (born == null && died == null) return null;
  const b = born != null ? String(born) : "c.";
  const d = died != null ? String(died) : "";
  if (d) return `${b}–${d}`;
  return b;
}

function buildVoiceStats(p, literaryEra, lifeSpan, origin) {
  const periodValue = [literaryEra, lifeSpan].filter(Boolean).join(" · ") || "Curated archive voice";
  const stats = [
    { label: "Poems in archive", value: String(p.poemCount ?? 0), icon: "auto_stories" },
    { label: "Period", value: periodValue, icon: "schedule" },
  ];
  if (origin) stats.push({ label: "Origin", value: origin, icon: "public" });
  return stats;
}

function poetToVoice(p) {
  const literaryEra = p.era && p.era !== "Unknown" ? p.era : null;
  const lifeSpan = formatLifeSpan(p.born, p.died);
  const origin = p.from && p.from !== "Unknown" ? p.from : null;
  const heroSubtitle = [literaryEra, lifeSpan].filter(Boolean).join(" · ") || null;
  const presentationEra = literaryEra || lifeSpan || "";
  const displayFullName =
    p.fullName && String(p.fullName).trim() && p.fullName.trim() !== p.name ? p.fullName.trim() : null;
  const cardSubtitle = [literaryEra, lifeSpan].filter(Boolean).join(" · ") || null;

  return {
    id: p.id,
    name: p.name,
    fullName: displayFullName,
    poemCount: p.poemCount ?? 0,
    tag: p.tag,
    image: poetPortraitUrl(p.id),
    icon: "auto_stories",
    literaryEra,
    lifeSpan,
    presentationEra,
    heroSubtitle,
    cardSubtitle,
    origin: origin ?? "",
    title: p.essence,
    bio: p.bio,
    works: p.works,
    portalTags: p.portalTags ?? [],
    moods: p.moods ?? [],
    heroLabel: p.heroLabel ?? p.tag ?? "Archive voice",
    resonance: p.resonance ?? null,
    quote: p.quote ?? null,
    quoteSource: p.quoteSource ?? null,
    stats: buildVoiceStats(p, literaryEra, lifeSpan, origin),
  };
}

/**
 * Generate daily collection image mapping using a day-based seed
 * Uses deterministic pseudo-random selection based on daily date
 */
function generateDailyCollectionImages(collections) {
  const today = new Date().toDateString();
  let cachedDate;
  let cachedMapping;
  try {
    cachedDate = localStorage.getItem("versery_collection_images_date");
    cachedMapping = localStorage.getItem("versery_collection_images");
  } catch {
    cachedDate = null;
    cachedMapping = null;
  }

  const requiredIds = collections.map((c) => c.id).filter(Boolean);

  if (cachedDate === today && cachedMapping) {
    try {
      const parsed = JSON.parse(cachedMapping);
      const complete = requiredIds.every((id) => typeof parsed[id] === "string" && parsed[id]);
      if (complete) return parsed;
    } catch (e) {
      // Cache corrupted, fall through to generate new
    }
  }

  // Create deterministic seed from today's date
  // Simple hash: sum of character codes in date string
  let seed = 0;
  for (let i = 0; i < today.length; i++) {
    seed += today.charCodeAt(i);
  }

  // Pseudo-random number generator (seeded)
  const pseudoRandom = (index) => {
    const x = Math.sin(seed + index * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  // All collection images from /public/collections/ (verified files only)
  const allImages = [
    "/collections/ahmed-hossam-5csXP8McYiA-unsplash.jpg",
    "/collections/annie-spratt-1_w7dXWG2A0-unsplash.jpg",
    "/collections/annie-spratt-7-E5o8Uu1iI-unsplash.jpg",
    "/collections/annie-spratt-95LDMJuVDYA-unsplash.jpg",
    "/collections/annie-spratt-CUdhkjtiUng-unsplash.jpg",
    "/collections/annie-spratt-LRe9Lj0IaeY-unsplash.jpg",
    "/collections/annie-spratt-LxFqrbjV_aE-unsplash.jpg",
    "/collections/annie-spratt-NMbHsivBGEM-unsplash.jpg",
    "/collections/annie-spratt-fM0F-zuKjfs-unsplash.jpg",
    "/collections/annie-spratt-yMKimSyBLIo-unsplash.jpg",
    "/collections/anny-cecilia-walter-2zfA9UMHSpI-unsplash.jpg",
    "/collections/anny-cecilia-walter-YB37kGYZSls-unsplash.jpg",
    "/collections/anny-cecilia-walter-hOJyggZpwac-unsplash.jpg",
    "/collections/brigitte-elsner-THp4np6Jqzk-unsplash.jpg",
    "/collections/brigitte-elsner-X_j77zf-FHA-unsplash.jpg",
    "/collections/compagnons-22U1A5JM3EY-unsplash.jpg",
    "/collections/compagnons-D-JfpYnIU80-unsplash.jpg",
    "/collections/compagnons-EvMG6gjrj3s-unsplash.jpg",
    "/collections/compagnons-_huYdLgvdcg-unsplash.jpg",
    "/collections/deep-7Qw_5JzOATY-unsplash.jpg",
    "/collections/deep-7cCdyCztdLM-unsplash.jpg",
    "/collections/deep-B1bKrxnr3-c-unsplash.jpg",
    "/collections/deep-K92pByP9tPQ-unsplash.jpg",
    "/collections/deep-_GzJEfNZ8Mo-unsplash.jpg",
    "/collections/deep-j-yKvTrn5c4-unsplash.jpg",
    "/collections/deep-qAMqqo07Qrs-unsplash.jpg",
    "/collections/deep-tWWfFo5mUjY-unsplash.jpg",
    "/collections/deep-wst8ldk2ADw-unsplash.jpg",
    "/collections/deep-x0fNueZl8J4-unsplash.jpg",
    "/collections/drawchicken-studio-00xvPu7qPIs-unsplash.jpg",
    "/collections/emily-hawke-_EeF_OOPY-g-unsplash.jpg",
    "/collections/esma-melike-sezer-MwJbGqhRZT8-unsplash.jpg",
    "/collections/esma-melike-sezer-WaGnNLRE9QM-unsplash.jpg",
    "/collections/esma-melike-sezer-a2RUchb-fyM-unsplash.jpg",
    "/collections/esma-melike-sezer-k_ZXMgQZVE8-unsplash.jpg",
    "/collections/karacis-studio-RYPKIJdaxUg-unsplash.jpg",
    "/collections/m-umar-farooq-G9CxsOtR-Sg-unsplash.jpg",
    "/collections/m-umar-farooq-V5kF-1ugfBY-unsplash.jpg",
    "/collections/m-umar-farooq-f8ijzjiFh7Q-unsplash.jpg",
    "/collections/m-umar-farooq-w9e54BuRMIo-unsplash.jpg",
    "/collections/mila-okta-safitri-SDZevo8oZz8-unsplash.jpg",
    "/collections/mila-okta-safitri-hutCHBVQyyk-unsplash.jpg",
    "/collections/muhammad-afandi-j-jxImbonQ0-unsplash.jpg",
    "/collections/olli-kilpi-eNPNDMieh88-unsplash.jpg",
    "/collections/pauline-loroy-UdbCZ0JdO_I-unsplash.jpg",
    "/collections/public-domain-vectors-0mDKnbwoo4w-unsplash.jpg",
    "/collections/public-domain-vectors-8x-sfXJdqig-unsplash.jpg",
    "/collections/public-domain-vectors-S-CqekUvf_g-unsplash.jpg",
    "/collections/public-domain-vectors-pXT4CFBvfyM-unsplash.jpg",
    "/collections/public-domain-vectors-vr1v0RV5FpU-unsplash.jpg",
    "/collections/puzzle-creative-z1sS_JPpOk4-unsplash.jpg",
    "/collections/umm-e-hani-ali-7D1Q0huNavA-unsplash.jpg",
    "/collections/umm-e-hani-ali-AU15WzrmKpw-unsplash.jpg",
    "/collections/vanicon-studio-5HzFkZq-M-g-unsplash.jpg",
    "/collections/viktoriya-lissachenko-0H9vIlJ2kDM-unsplash.jpg",
    "/collections/viktoriya-lissachenko-OAvtXaQBl1E-unsplash.jpg",
  ];

  // Assign one image per collection from the same Unsplash pool; avoid repeats
  // so the annex and themed shelves never share the same asset on a given day.
  const mapping = {};
  const usedPaths = new Set();
  collections.forEach((collection, collectionIndex) => {
    let idx = Math.floor(pseudoRandom(collectionIndex + 0.37) * allImages.length);
    let guard = 0;
    while (usedPaths.has(allImages[idx]) && guard < allImages.length) {
      idx = (idx + 1) % allImages.length;
      guard += 1;
    }
    usedPaths.add(allImages[idx]);
    mapping[collection.id] = allImages[idx];
  });

  try {
    localStorage.setItem("versery_collection_images_date", today);
    localStorage.setItem("versery_collection_images", JSON.stringify(mapping));
  } catch {
    /* Private mode / quota — mapping still valid in memory for this session */
  }

  return mapping;
}

function createDesktopCollectionLayout(collections) {
  const layout = {};
  let index = 0;

  while (index < collections.length) {
    const remaining = collections.length - index;
    const shouldUseFullRow =
      remaining === 1 ||
      (remaining !== 2 && Math.random() < 0.42);

    if (shouldUseFullRow) {
      layout[collections[index].id] = "full";
      index += 1;
      continue;
    }

    layout[collections[index].id] = "half";
    layout[collections[index + 1].id] = "half";
    index += 2;
  }

  return layout;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Thin wrapper that handles data fetching. Renders AppLoaded once both JSON
// files are available so AppLoaded always starts with non-empty data.
export default function App() {
  const [rawPoems, setRawPoems] = useState(null);
  const [rawPoets, setRawPoets] = useState(null);
  const [rawCollections, setRawCollections] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const hasTrackedSessionRef = useRef(false);

  useEffect(() => {
    captureFirstTouchAttribution();
    if (!hasTrackedSessionRef.current) {
      trackEvent("session_started", {
        app: "versery",
      });
      hasTrackedSessionRef.current = true;
    }
    const loadJson = (url) =>
      fetch(url).then(async (r) => {
        if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
        return r.json();
      });

    Promise.all([
      loadJson("/poems.json"),
      loadJson("/poets.json"),
      fetch("/collections.json")
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ])
      .then(([poemsData, poetsData, collectionsData]) => {
        if (!Array.isArray(poemsData) || !Array.isArray(poetsData)) {
          setLoadError(true);
          return;
        }
        setRawPoems(poemsData);
        setRawPoets(poetsData);
        setRawCollections(Array.isArray(collectionsData) ? collectionsData : []);
        trackEvent("content_loaded", {
          poems_count: poemsData.length,
          poets_count: poetsData.length,
          collections_count: Array.isArray(collectionsData) ? collectionsData.length : 0,
        });
      })
      .catch(() => {
        setLoadError(true);
      });
  }, []);

  if (loadError) {
    return (
      <div className="page-shell loading-screen" data-testid="screen-load-error" role="alert">
        <p className="loading-label">Could not load Versery</p>
        <p className="load-error-hint">
          This app needs its JSON archive over HTTP. From the project folder run{" "}
          <code style={{ fontSize: "0.82em" }}>npm run dev</code>, then open{" "}
          <code style={{ fontSize: "0.82em" }}>http://localhost:5173</code>
          (do not open the built HTML file directly). Check the browser network tab if this persists.
        </p>
      </div>
    );
  }

  if (!rawPoems || !rawPoets) {
    return (
      <div className="page-shell loading-screen" data-testid="screen-loading">
        <p className="loading-label">Loading poems</p>
        <div className="loading-dots" aria-label="Loading" role="status">
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
        </div>
      </div>
    );
  }

  return <AppLoaded poems={rawPoems} poets={rawPoets} collections={rawCollections} />;
}

function AppLoaded({ poems, poets, collections }) {
  // --- Derived data (computed once, stable across re-renders) ---
  const voices = useMemo(() => {
    const voiceList = poets.map(poetToVoice);

    // Daily voice card shuffle (like featured poem)
    const today = new Date().toDateString();
    let cachedDate;
    let cachedOrder;
    try {
      cachedDate = localStorage.getItem("versery_voices_shuffle_date");
      cachedOrder = localStorage.getItem("versery_voices_shuffle_order");
    } catch {
      cachedDate = null;
      cachedOrder = null;
    }

    if (cachedDate === today && cachedOrder) {
      // Use cached shuffle for today
      try {
        const order = JSON.parse(cachedOrder);
        return [...voiceList].sort((a, b) => {
          const aIndex = order.indexOf(a.id);
          const bIndex = order.indexOf(b.id);
          // If either index is -1 (not found in cache), put at end
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });
      } catch (e) {
        // If cache is corrupted, fall through to create new shuffle
      }
    }

    // Create new daily shuffle
    const shuffled = [...voiceList].sort(() => Math.random() - 0.5);
    const order = shuffled.map((v) => v.id);
    try {
      localStorage.setItem("versery_voices_shuffle_date", today);
      localStorage.setItem("versery_voices_shuffle_order", JSON.stringify(order));
    } catch {
      // Private mode / quota / storage disabled — still return order for this session
    }
    return shuffled;
  }, [poets]);
  const eligibleVoiceIds = useMemo(
    () => new Set(poets.filter((p) => (p.poemCount ?? 0) > 10).map((p) => p.id)),
    [poets],
  );
  const eligibleVoices = useMemo(
    () => voices.filter((voice) => eligibleVoiceIds.has(voice.id)),
    [voices, eligibleVoiceIds],
  );

  const poemOfDayPool = useMemo(
    () => poems.filter((poem) => poem.poemOfDay === true),
    [poems],
  );

  const poemMap = useMemo(() => {
    const map = {};
    poems.forEach((p) => { map[p.id] = poemToEntry(p); });
    return map;
  }, [poems]);

  const poetOfWeek = useMemo(() => {
    const pool = eligibleVoices.length ? eligibleVoices : voices;
    const id = getPoetOfWeekId(pool.map((v) => v.id));
    return pool.find((v) => v.id === id) ?? pool[0];
  }, [eligibleVoices, voices]);

  const featuredPoem = useMemo(() => {
    const raw = getDailyFeaturedPoemFromPool(poemOfDayPool, poems, poetOfWeek.id);
    return poemToEntry(raw);
  }, [poemOfDayPool, poems, poetOfWeek.id]);

  const featuredPortraitSrc = poetPortraitUrl(featuredPoem.poetId);
  const featuredPoemInitials = useMemo(
    () => poetInitialsFromAuthor(featuredPoem.author),
    [featuredPoem.author],
  );
  const [featuredPortraitFailed, setFeaturedPortraitFailed] = useState(false);
  useEffect(() => {
    setFeaturedPortraitFailed(false);
  }, [featuredPoem.id, featuredPoem.poetId, featuredPortraitSrc]);
  const featuredPoemAvatarPlaceholder = !featuredPortraitSrc || featuredPortraitFailed;

  const discoveryConfigs = useMemo(() => {
    return Object.fromEntries(
      Object.entries(PORTAL_META).map(([key, meta]) => {
        const filtered = pickDiverse(poems, key, 20);
        return [key, {
          title: key,
          ...meta,
          poemIds: filtered.map((p) => p.id),
          featuredPoemId: filtered[0]?.id ?? null,
          poetIds: [...new Set(filtered.map((p) => p.poetId))].filter(Boolean),
        }];
      })
    );
  }, [poems]);

  const moodPoemSequence = useMemo(
    () => Object.fromEntries(Object.entries(discoveryConfigs).map(([key, cfg]) => [key, cfg.poemIds])),
    [discoveryConfigs],
  );

  const collectionTemplates = useMemo(
    () => (Array.isArray(collections) && collections.length > 0 ? collections : DEFAULT_COLLECTION_TEMPLATES),
    [collections],
  );

  const curatedCollections = useMemo(() => {
    const smallCorpusPoetIds = new Set(
      poets.filter((p) => (p.poemCount ?? 0) < 10).map((p) => p.id),
    );
    const annexSource = poems
      .filter((poem) => smallCorpusPoetIds.has(poem.poetId))
      .sort((a, b) => {
        const byAuthor = (a.author ?? "").localeCompare(b.author ?? "");
        if (byAuthor !== 0) return byAuthor;
        return a.title.localeCompare(b.title);
      });

    const annexPoems = annexSource.map((rawPoem) => {
      const voice = voices.find((v) => v.id === rawPoem.poetId);
      return {
        poet: rawPoem.author ?? voice?.name ?? "Versery Archive",
        year: String(voice?.born ?? ""),
        title: rawPoem.title,
        excerpt: rawPoem.excerpt ?? "",
        poemId: rawPoem.id,
      };
    });

    const annex =
      annexPoems.length > 0
        ? {
            id: "the-annex",
            label: "House shelf",
            title: "The Annex",
            description:
              "Poems from voices we only keep a handful of lines from—brief guest stays in the archive.",
            archiveDescription:
              "Everything we host from the archive's smaller shelves: occasional voices and single-edition stays.",
            image: "/collections/karacis-studio-RYPKIJdaxUg-unsplash.jpg",
            artwork: "/collections/karacis-studio-RYPKIJdaxUg-unsplash.jpg",
            tone: "plain",
            homeShelf: true,
            featured: false,
            curator: { name: "Neelabh", role: "Editor-in-Chief" },
            portalTags: ["Calm", "Echo", "Ethereal", "Solitary"],
            poems: annexPoems,
            count: `${annexPoems.length} poem${annexPoems.length === 1 ? "" : "s"}`,
          }
        : null;

    const themed = collectionTemplates.map((template, index) => {
      const allPoems = filterByPortals(poems, template.portalTags ?? [], 100); // Get more to ensure diversity

      // Vary poem count per collection: 6-9 poems for variety
      const targetCount = 6 + (index % 4);

      // Ensure author diversity: select poems from different poets
      const selectedPoems = [];
      const seenPoets = new Set();

      // First pass: take one poem per poet
      for (const poem of allPoems) {
        if (selectedPoems.length >= targetCount) break;
        if (!seenPoets.has(poem.poetId)) {
          selectedPoems.push(poem);
          seenPoets.add(poem.poetId);
        }
      }

      // If we don't have enough poems yet, fill in with remaining poems (different poets now)
      if (selectedPoems.length < targetCount) {
        for (const poem of allPoems) {
          if (selectedPoems.length >= targetCount) break;
          if (!selectedPoems.includes(poem)) {
            selectedPoems.push(poem);
          }
        }
      }

      const collectionPoems = selectedPoems
        .map((rawPoem) => {
          const voice = voices.find((v) => v.id === rawPoem.poetId);
          return {
            poet: rawPoem.author ?? voice?.name ?? "Versery Archive",
            year: String(voice?.born ?? ""),
            title: rawPoem.title,
            excerpt: rawPoem.excerpt ?? "",
            poemId: rawPoem.id,
          };
        });
      return {
        ...template,
        poems: collectionPoems,
        count: `${collectionPoems.length} Collection${collectionPoems.length !== 1 ? 's' : ''}`
      };
    });

    return annex ? [annex, ...themed] : themed;
  }, [poems, poets, voices, collectionTemplates]);

  const desktopCollectionLayout = useMemo(
    () => createDesktopCollectionLayout(curatedCollections),
    [curatedCollections],
  );

  // --- Helper functions (close over computed data) ---
  function getVoiceById(id) {
    return voices.find((v) => v.id === id) ?? voices[0];
  }
  function getCollectionById(id) {
    return curatedCollections.find((c) => c.id === id) ?? curatedCollections[0];
  }
  function getVoiceByName(name) {
    return voices.find((v) => v.name === name) ?? null;
  }
  function getPoemById(id) {
    return poemMap[id] ?? featuredPoem;
  }
  function getWorkByPoemId(voice, poemId) {
    return voice.works.find((work) => work.poemId === poemId) ?? voice.works[0];
  }
  function getPoemPresentation(poemId) {
    for (const voice of voices) {
      const work = voice.works.find((entry) => entry.poemId === poemId);
      if (work) {
        return {
          poemId,
          poetId: voice.id,
          poet: voice.name,
          year: voice.presentationEra,
          title: work.title,
          excerpt: getPoemById(poemId).subtitle,
        };
      }
    }
    for (const collection of curatedCollections) {
      const poem = collection.poems.find((entry) => entry.poemId === poemId);
      if (poem) {
        return {
          poemId,
          poetId: getVoiceByName(poem.poet)?.id ?? null,
          poet: poem.poet,
          year: poem.year,
          title: poem.title,
          excerpt: poem.excerpt,
        };
      }
    }
    // Fall back to the raw poem's own poetId / author field
    const rawPoem = poems.find((p) => p.id === poemId);
    const voice = rawPoem?.poetId ? voices.find((v) => v.id === rawPoem.poetId) : null;
    const poem = getPoemById(poemId);
    return {
      poemId,
      poetId: voice?.id ?? null,
      poet: voice?.name ?? rawPoem?.author ?? "Versery Archive",
      year: voice?.presentationEra ?? "",
      title: poem.title,
      excerpt: poem.subtitle,
    };
  }
  function getNextPoemForOrigin({ origin, poemId, voiceId, collectionId, feeling }) {
    if (origin === "collection" && collectionId) {
      const collection = getCollectionById(collectionId);
      const currentIndex = collection.poems.findIndex((poem) => poem.poemId === poemId);
      const nextPoem = collection.poems[(currentIndex + 1 + collection.poems.length) % collection.poems.length];
      return {
        poem: getPoemById(nextPoem.poemId),
        sourceCollectionId: collection.id,
        sourceOrigin: "collection",
      };
    }
    if (origin === "voice" && voiceId) {
      const voice = getVoiceById(voiceId);
      const currentIndex = voice.works.findIndex((work) => work.poemId === poemId);
      const nextWork = voice.works[(currentIndex + 1 + voice.works.length) % voice.works.length];
      return {
        poem: getPoemById(nextWork.poemId),
        sourceVoiceId: voice.id,
        sourceOrigin: "voice",
      };
    }
    if (origin === "mood" && feeling && moodPoemSequence[feeling]?.length) {
      const sequence = moodPoemSequence[feeling];
      const currentIndex = sequence.indexOf(poemId);
      const nextPoemId = sequence[(currentIndex + 1 + sequence.length) % sequence.length];
      return {
        poem: getPoemById(nextPoemId),
        sourceOrigin: "mood",
      };
    }
    // fallback: cycle through first few portal poems
    const fallback = (discoveryConfigs.Melancholic?.poemIds ?? []).slice(0, 3);
    const currentIndex = fallback.indexOf(poemId);
    const nextPoemId = fallback[(currentIndex + 1 + fallback.length) % Math.max(fallback.length, 1)];
    return {
      poem: getPoemById(nextPoemId ?? fallback[0]),
      sourceOrigin: "home",
    };
  }

  // --- State ---
  const historyReadyRef = useRef(false);
  const isApplyingHistoryRef = useRef(false);
  const historyIndexRef = useRef(0);
  const [screen, setScreen] = useState("home");
  const [activeVoiceId, setActiveVoiceId] = useState(voices[0]?.id ?? "");
  const [activeCollectionId, setActiveCollectionId] = useState(curatedCollections[0]?.id ?? "");
  const [collectionPage, setCollectionPage] = useState(0);
  const [voiceWorksPage, setVoiceWorksPage] = useState(0);
  const [activeFeeling, setActiveFeeling] = useState(null);
  const [discoveryContext, setDiscoveryContext] = useState({
    key: null,
    previousScreen: "home",
    source: "feeling",
  });
  const [voiceDetailContext, setVoiceDetailContext] = useState({
    previousScreen: "voices",
  });
  const [voiceWorksContext, setVoiceWorksContext] = useState({
    previousScreen: "voiceDetail",
  });
  const [collectionDetailContext, setCollectionDetailContext] = useState({
    previousScreen: "collections",
  });
  const [activePoemId, setActivePoemId] = useState(featuredPoem.id);
  const [poemContext, setPoemContext] = useState({
    previousScreen: "home",
    sourceOrigin: "home",
    sourceVoiceId: null,
    sourceCollectionId: null,
    feeling: null,
  });
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeEraFilter, setActiveEraFilter] = useState("All Eras");
  const [collectionImages, setCollectionImages] = useState({});
  const [selectedPoemText, setSelectedPoemText] = useState("");
  const [selectedVisibleCharCount, setSelectedVisibleCharCount] = useState(0);
  const [shareToast, setShareToast] = useState("");
  const [isGeneratingShareCard, setIsGeneratingShareCard] = useState(false);
  const [shareCardMode, setShareCardMode] = useState("full");
  const [showShareOverflowHint, setShowShareOverflowHint] = useState(false);
  const heroSectionRef = useRef(null);
  const shareCardRef = useRef(null);
  const poemBodyRef = useRef(null);
  const supportsCustomHighlight =
    typeof window !== "undefined" &&
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof Highlight !== "undefined";
  const [showBottomNav, setShowBottomNav] = useState(false);
  const [poemSubscribeOpen, setPoemSubscribeOpen] = useState(false);
  const [newsletterSpotlightHeadSuccess, setNewsletterSpotlightHeadSuccess] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [uiTheme, setUiTheme] = useState(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const lastTrackedScreenRef = useRef(null);
  const [whatsNewMenuOpen, setWhatsNewMenuOpen] = useState(false);
  const [whatsNewMenuEntered, setWhatsNewMenuEntered] = useState(false);
  const whatsNewTriggerRef = useRef(null);
  const whatsNewPanelRef = useRef(null);

  useLayoutEffect(() => {
    const t = readStoredTheme();
    applyTheme(t, { animate: false });
    setUiTheme(t);
  }, []);

  useEffect(() => subscribeThemeStorage((stored) => {
    applyTheme(stored, {
      animate: true,
      onAfterThemeCommit: () => {
        flushSync(() => {
          setUiTheme(stored);
        });
      },
    });
  }), []);

  useEffect(() => {
    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredInstallPrompt(event);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (screen !== "poemDetail") setPoemSubscribeOpen(false);
  }, [screen]);

  useEffect(() => {
    if (screen !== "home") {
      setWhatsNewMenuOpen(false);
      setWhatsNewMenuEntered(false);
      setNewsletterSpotlightHeadSuccess(false);
    }
  }, [screen]);

  useLayoutEffect(() => {
    if (!whatsNewMenuOpen) {
      setWhatsNewMenuEntered(false);
      return undefined;
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setWhatsNewMenuEntered(true);
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [whatsNewMenuOpen]);

  useEffect(() => {
    if (!whatsNewMenuOpen) return undefined;

    function onPointerDown(event) {
      const t = event.target;
      if (!(t instanceof Node)) return;
      if (whatsNewTriggerRef.current?.contains(t)) return;
      if (whatsNewPanelRef.current?.contains(t)) return;
      setWhatsNewMenuEntered(false);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [whatsNewMenuOpen]);

  useEffect(() => {
    setPoemSubscribeOpen(false);
  }, [activePoemId]);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (lastTrackedScreenRef.current === screen) return;
    trackEvent("screen_viewed", {
      screen,
      is_desktop: isDesktop,
    });
    lastTrackedScreenRef.current = screen;
  }, [screen, isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      // On mobile, keep the dock visible at all times.
      setShowBottomNav(true);
      return;
    }

    if (screen !== "home") {
      setShowBottomNav(true);
      return;
    }

    const updateBottomNavVisibility = () => {
      const heroSection = heroSectionRef.current;
      if (!heroSection) {
        setShowBottomNav(false);
        return;
      }

      const rect = heroSection.getBoundingClientRect();
      const hasScrolledPastHalf = -rect.top >= rect.height * 0.5;
      setShowBottomNav(hasScrolledPastHalf);
    };

    updateBottomNavVisibility();
    window.addEventListener("scroll", updateBottomNavVisibility, { passive: true });
    window.addEventListener("resize", updateBottomNavVisibility);

    return () => {
      window.removeEventListener("scroll", updateBottomNavVisibility);
      window.removeEventListener("resize", updateBottomNavVisibility);
    };
  }, [screen, isDesktop]);

  // Initialize daily collection image mapping (includes synthetic shelves such as the annex)
  useEffect(() => {
    const mapping = generateDailyCollectionImages(curatedCollections);
    setCollectionImages(mapping);
  }, [curatedCollections]);

  const onCompass = screen === "compass";
  const onVoices = screen === "voices";
  const onCollections = screen === "collections";
  const onCollectionDetail = screen === "collectionDetail";
  const onDiscoveryResults = screen === "discoveryResults";
  const onVoiceDetail = screen === "voiceDetail";
  const onVoiceWorks = screen === "voiceWorks";
  const onPoemDetail = screen === "poemDetail";

  const activeVoice = getVoiceById(activeVoiceId);
  const activeCollection = getCollectionById(activeCollectionId);
  const activeDiscovery = discoveryContext.key ? discoveryConfigs[discoveryContext.key] : null;
  const discoveryPoems = (activeDiscovery?.poemIds ?? []).map(getPoemPresentation);
  const discoveryFeaturedPoem = activeDiscovery?.featuredPoemId
    ? getPoemPresentation(activeDiscovery.featuredPoemId)
    : null;
  const discoveryFeaturedPoemContent = activeDiscovery?.featuredPoemId
    ? getPoemById(activeDiscovery.featuredPoemId)
    : null;
  const discoveryFeaturedAccent = useMemo(() => {
    const key = discoveryContext.key;
    if (discoveryFeaturedPoemContent) {
      return (
        discoveryFeaturedPoemContent.rankedAccentHex ??
        resolvePoemAccentHex(discoveryFeaturedPoemContent, key)
      );
    }
    if (key && TAG_PASTEL_HEX[key]) return tagPastelHex(key);
    return tagPastelHex("Melancholic");
  }, [discoveryFeaturedPoemContent, discoveryContext.key]);
  const discoveryPoets = [...new Set([...(activeDiscovery?.poetIds ?? []), ...voices.map((v) => v.id)])]
    .map(getVoiceById)
    .filter(Boolean);
  const activePoem = getPoemById(activePoemId);
  const worksPerPage = 20;
  const activeVoiceAllPoems = useMemo(
    () => filterByPoet(poems, activeVoiceId),
    [poems, activeVoiceId],
  );
  const totalWorksPages = Math.ceil(activeVoiceAllPoems.length / worksPerPage);
  const visibleWorks = activeVoiceAllPoems.slice(
    voiceWorksPage * worksPerPage,
    voiceWorksPage * worksPerPage + worksPerPage,
  );
  const collectionsPerPage = 6;
  const totalCollectionPages = Math.ceil(curatedCollections.length / collectionsPerPage);
  const visibleCollections = curatedCollections.slice(
    collectionPage * collectionsPerPage,
    collectionPage * collectionsPerPage + collectionsPerPage,
  );
  const visibleVoices = eligibleVoices;
  const nextPoemData = getNextPoemForOrigin({
    origin: poemContext.sourceOrigin,
    poemId: activePoemId,
    voiceId: poemContext.sourceVoiceId,
    collectionId: poemContext.sourceCollectionId,
    feeling: poemContext.feeling,
  });
  const flattenedPoemLines = useMemo(() => activePoem.lines.flat(), [activePoem.lines]);
  const fullPoemCharCount = useMemo(
    () => flattenedPoemLines.join("\n").length,
    [flattenedPoemLines],
  );
  const canShareFullPoem = fullPoemCharCount <= SHARE_SELECTION_LIMIT;
  const selectedPoemTextNormalized = useMemo(() => normalizeSelectedText(selectedPoemText), [selectedPoemText]);
  const selectedSnippetCharCount = selectedVisibleCharCount;
  const hasSelectionContent = selectedPoemTextNormalized.trim().length > 0;
  const selectedSnippetOverflow = selectedSnippetCharCount > SHARE_SELECTION_LIMIT;
  const canShareSelectedSnippet = hasSelectionContent && !selectedSnippetOverflow;
  const selectionShareCountLabel = `${selectedSnippetCharCount}/${SHARE_SELECTION_LIMIT}`;
  const shareButtonLabel = hasSelectionContent ? "Share selected lines" : "Share this poem";
  const shareHelperText = hasSelectionContent
    ? selectionShareCountLabel
    : showShareOverflowHint && !canShareFullPoem
      ? `Poem exceeds ${SHARE_SELECTION_LIMIT} characters — select text to share.`
      : "";
  const selectedSnippetLines = useMemo(
    () => selectedPoemTextNormalized.split("\n").filter((line) => line.trim().length > 0),
    [selectedPoemTextNormalized],
  );
  const shareCardLines = useMemo(() => {
    if (shareCardMode === "selection") return selectedSnippetLines;
    return flattenedPoemLines;
  }, [flattenedPoemLines, selectedSnippetLines, shareCardMode]);
  const shareAccentHex = useMemo(
    () => activePoem.rankedAccentHex ?? resolvePoemAccentHex(activePoem, poemContext.feeling),
    [activePoem, poemContext.feeling],
  );
  const shareCardSurfaceStyle = useMemo(
    () => ({ backgroundImage: buildShareGradientFromAccent(shareAccentHex) }),
    [shareAccentHex],
  );
  const poemPoetName = useMemo(() => {
    if (activePoem.translator?.startsWith("By ")) {
      return activePoem.translator.replace(/^By\s+/i, "");
    }
    return activePoem.author ?? "Versery Archive";
  }, [activePoem.author, activePoem.translator]);

  // Filter voices by search query and era filter
  const filteredVoices = useMemo(() => {
    let filtered = visibleVoices;

    // Apply search filter
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter((v) => {
        const hay = [
          v.name,
          v.fullName,
          v.tag,
          v.origin,
          v.literaryEra,
          v.title,
          v.bio,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(lower);
      });
    }

    // Apply era filter
    if (activeEraFilter !== "All Eras") {
      const requiredTags = ERA_FILTER_MAPPING[activeEraFilter] || [];
      filtered = filtered.filter(v =>
        requiredTags.some(tag => v.portalTags?.includes(tag))
      );
    }

    return filtered;
  }, [visibleVoices, searchQuery, activeEraFilter]);

  function normalizeSnapshot(snapshot = {}) {
    const voiceId = (voices.find((v) => v.id === snapshot.activeVoiceId) ?? voices[0])?.id ?? "";
    const collectionId = (curatedCollections.find((c) => c.id === snapshot.activeCollectionId) ?? curatedCollections[0])?.id ?? "";
    const poemId = getPoemById(snapshot.activePoemId ?? featuredPoem.id).id;
    const normalizedCollectionPage = clamp(
      snapshot.collectionPage ?? 0,
      0,
      Math.max(Math.ceil(curatedCollections.length / 6) - 1, 0),
    );
    const discoveryKey =
      typeof snapshot.discoveryContext?.key === "string" && discoveryConfigs[snapshot.discoveryContext.key]
        ? snapshot.discoveryContext.key
        : null;

    return {
      screen: snapshot.screen ?? "home",
      activeVoiceId: voiceId,
      activeCollectionId: collectionId,
      collectionPage: normalizedCollectionPage,
      activeFeeling: typeof snapshot.activeFeeling === "string" ? snapshot.activeFeeling : null,
      discoveryContext: {
        key: discoveryKey,
        previousScreen: snapshot.discoveryContext?.previousScreen ?? "home",
        source: snapshot.discoveryContext?.source ?? "feeling",
      },
      voiceDetailContext: {
        previousScreen: snapshot.voiceDetailContext?.previousScreen ?? "voices",
      },
      voiceWorksContext: {
        previousScreen: snapshot.voiceWorksContext?.previousScreen ?? "voiceDetail",
      },
      collectionDetailContext: {
        previousScreen: snapshot.collectionDetailContext?.previousScreen ?? "collections",
      },
      activePoemId: poemId,
      poemContext: {
        previousScreen: snapshot.poemContext?.previousScreen ?? "home",
        sourceOrigin: snapshot.poemContext?.sourceOrigin ?? "home",
        sourceVoiceId: snapshot.poemContext?.sourceVoiceId ?? null,
        sourceCollectionId: snapshot.poemContext?.sourceCollectionId ?? null,
        feeling: snapshot.poemContext?.feeling ?? null,
      },
    };
  }

  function createSnapshot(overrides = {}) {
    return normalizeSnapshot({
      screen,
      activeVoiceId,
      activeCollectionId,
      collectionPage,
      activeFeeling,
      discoveryContext,
      voiceDetailContext,
      voiceWorksContext,
      collectionDetailContext,
      activePoemId,
      poemContext,
      ...overrides,
    });
  }

  function applySnapshot(snapshot) {
    setScreen(snapshot.screen);
    setActiveVoiceId(snapshot.activeVoiceId);
    setActiveCollectionId(snapshot.activeCollectionId);
    setCollectionPage(snapshot.collectionPage);
    setActiveFeeling(snapshot.activeFeeling);
    setDiscoveryContext(snapshot.discoveryContext);
    setVoiceDetailContext(snapshot.voiceDetailContext);
    setVoiceWorksContext(snapshot.voiceWorksContext);
    setCollectionDetailContext(snapshot.collectionDetailContext);
    setActivePoemId(snapshot.activePoemId);
    setPoemContext(snapshot.poemContext);
  }

  function buildSnapshotFromLocationPath(pathname) {
    const decodePathSeg = (seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    };
    let path = pathname || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

    if (path === "/" || path === "") return null;

    const discoveryKeys = Object.keys(discoveryConfigs);

    const poemMatch = /^\/poem\/([^/]+)$/.exec(path);
    if (poemMatch) {
      const poemId = decodePathSeg(poemMatch[1]);
      if (!poemMap[poemId]) return null;
      return {
        screen: "poemDetail",
        activePoemId: poemId,
        poemContext: {
          previousScreen: "home",
          sourceOrigin: "home",
          sourceVoiceId: null,
          sourceCollectionId: null,
          feeling: null,
        },
      };
    }

    const voiceWorksMatch = /^\/voices\/([^/]+)\/works$/.exec(path);
    if (voiceWorksMatch) {
      const voiceId = decodePathSeg(voiceWorksMatch[1]);
      if (!voices.some((v) => v.id === voiceId)) return null;
      return {
        screen: "voiceWorks",
        activeVoiceId: voiceId,
        voiceWorksContext: { previousScreen: "voiceDetail" },
        voiceDetailContext: { previousScreen: "voices" },
      };
    }

    const voiceMatch = /^\/voices\/([^/]+)$/.exec(path);
    if (voiceMatch) {
      const voiceId = decodePathSeg(voiceMatch[1]);
      if (!voices.some((v) => v.id === voiceId)) return null;
      return {
        screen: "voiceDetail",
        activeVoiceId: voiceId,
        voiceDetailContext: { previousScreen: "voices" },
      };
    }

    if (path === "/voices") {
      return { screen: "voices" };
    }

    if (path === "/compass") {
      return { screen: "compass" };
    }

    if (path === "/collections") {
      return { screen: "collections" };
    }

    const collectionMatch = /^\/collections\/([^/]+)$/.exec(path);
    if (collectionMatch) {
      const collectionId = decodePathSeg(collectionMatch[1]);
      if (!curatedCollections.some((c) => c.id === collectionId)) return null;
      return {
        screen: "collectionDetail",
        activeCollectionId: collectionId,
        collectionDetailContext: { previousScreen: "collections" },
      };
    }

    const moodMatch = /^\/mood\/([^/]+)$/.exec(path);
    if (moodMatch) {
      const slug = decodePathSeg(moodMatch[1]).toLowerCase();
      const key = discoveryKeys.find((k) => k.toLowerCase() === slug);
      if (!key) return null;
      return {
        screen: "discoveryResults",
        discoveryContext: { key, previousScreen: "home", source: "feeling" },
      };
    }

    const compassDiscoveryMatch = /^\/compass\/([^/]+)$/.exec(path);
    if (compassDiscoveryMatch) {
      const slug = decodePathSeg(compassDiscoveryMatch[1]).toLowerCase();
      const key = discoveryKeys.find((k) => k.toLowerCase() === slug);
      if (!key) return null;
      return {
        screen: "discoveryResults",
        discoveryContext: { key, previousScreen: "compass", source: "compass" },
      };
    }

    return null;
  }

  function navigateBack(fallback) {
    if (historyReadyRef.current && historyIndexRef.current > 0) {
      window.history.back();
      return;
    }
    fallback?.();
  }

  function openVoice(voiceId, previousScreen = "voices") {
    trackEvent("voice_opened", {
      voice_id: voiceId,
      source_screen: previousScreen,
    });
    setActiveVoiceId(voiceId);
    setVoiceDetailContext({ previousScreen });
    setScreen("voiceDetail");
  }

  function openCollection(collectionId, previousScreen = "collections") {
    trackEvent("collection_opened", {
      collection_id: collectionId,
      source_screen: previousScreen,
    });
    setActiveCollectionId(collectionId);
    setCollectionDetailContext({ previousScreen });
    setScreen("collectionDetail");
  }

  function openDiscovery(key, previousScreen, source) {
    trackEvent("discovery_opened", {
      discovery_key: key,
      source_screen: previousScreen,
      source_type: source,
    });
    setDiscoveryContext({ key, previousScreen, source });
    setScreen("discoveryResults");
  }

  function handleDiscoveryBack() {
    navigateBack(() => setScreen(discoveryContext.previousScreen));
  }

  function handleCollectionBack() {
    navigateBack(() => setScreen(collectionDetailContext.previousScreen));
  }

  function openVoiceWorks(previousScreen = "voiceDetail") {
    trackEvent("voice_works_opened", {
      voice_id: activeVoiceId,
      source_screen: previousScreen,
    });
    setVoiceWorksPage(0);
    setVoiceWorksContext({ previousScreen });
    setScreen("voiceWorks");
  }

  function handleVoiceWorksBack() {
    navigateBack(() => setScreen(voiceWorksContext.previousScreen));
  }

  function openPoem({
    poemId,
    previousScreen,
    sourceOrigin,
    sourceVoiceId = null,
    sourceCollectionId = null,
    feeling = null,
  }) {
    trackEvent("poem_opened", {
      poem_id: poemId,
      source_origin: sourceOrigin,
      source_screen: previousScreen,
      source_voice_id: sourceVoiceId,
      source_collection_id: sourceCollectionId,
      feeling,
    });
    setActivePoemId(poemId);
    setPoemContext({ previousScreen, sourceOrigin, sourceVoiceId, sourceCollectionId, feeling });
    setScreen("poemDetail");
  }

  function openRandomPoemFromHome() {
    if (!poems.length) return;
    const candidates =
      poems.length > 1 ? poems.filter((p) => p.id !== featuredPoem.id) : poems;
    const pool = candidates.length ? candidates : poems;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    trackEvent("random_poem_clicked", {
      poem_id: picked.id,
      source_screen: "home",
    });
    openPoem({
      poemId: picked.id,
      previousScreen: "home",
      sourceOrigin: "home_random",
    });
  }

  function handlePoemBack() {
    navigateBack(() => setScreen(poemContext.previousScreen));
  }

  function openNextPoem() {
    trackEvent("next_poem_clicked", {
      current_poem_id: activePoem.id,
      next_poem_id: nextPoemData.poem.id,
      source_origin: poemContext.sourceOrigin,
    });
    openPoem({
      poemId: nextPoemData.poem.id,
      previousScreen: poemContext.previousScreen,
      sourceOrigin: nextPoemData.sourceOrigin ?? poemContext.sourceOrigin,
      sourceVoiceId: nextPoemData.sourceVoiceId ?? poemContext.sourceVoiceId,
      sourceCollectionId: nextPoemData.sourceCollectionId ?? poemContext.sourceCollectionId,
      feeling: poemContext.feeling,
    });
  }

  function safeShareBasename(title) {
    const raw = String(title ?? "poem")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 72);
    return (raw || "poem").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "poem";
  }

  function downloadShareCard(blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const base = safeShareBasename(activePoem.title);
    const suffix = shareCardMode === "selection" ? "selection" : "poem";
    link.href = url;
    link.download = `${base}-${suffix}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function canvasToPngBlob(canvas) {
    if (!canvas || canvas.width < 1 || canvas.height < 1) return null;
    return new Promise((resolve) => {
      try {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
              return;
            }
            try {
              const dataUrl = canvas.toDataURL("image/png");
              const comma = dataUrl.indexOf(",");
              if (comma === -1) {
                resolve(null);
                return;
              }
              const bin = atob(dataUrl.slice(comma + 1));
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
              resolve(new Blob([bytes], { type: "image/png" }));
            } catch {
              resolve(null);
            }
          },
          "image/png",
          1,
        );
      } catch {
        resolve(null);
      }
    });
  }

  async function renderShareCardBlob() {
    const el = shareCardRef.current;
    if (!el) return null;
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: SHARE_CAPTURE_BG,
        scale: 2,
        useCORS: true,
        logging: false,
        imageTimeout: 15_000,
      });
      return await canvasToPngBlob(canvas);
    } catch {
      return null;
    }
  }

  async function shareCard(mode) {
    if (isGeneratingShareCard) return;
    const shouldShareSelection = mode === "selection";
    if (shouldShareSelection && !canShareSelectedSnippet) return;
    if (!shouldShareSelection && !canShareFullPoem) return;
    try {
      flushSync(() => {
        setIsGeneratingShareCard(true);
        setShareCardMode(mode);
      });
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      const cardBlob = await renderShareCardBlob();
      if (!cardBlob) {
        setShareToast("Could not create share image");
        return;
      }
      const safeFileName = `${safeShareBasename(activePoem.title)}.png`;
      const shareFile = new File([cardBlob], safeFileName, { type: "image/png" });
      const sharePayload = { files: [shareFile] };
      const canShareFiles =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" || navigator.canShare(sharePayload));

      if (canShareFiles) {
        try {
          await navigator.share({
            title: activePoem.title,
            text: `— ${poemPoetName}`,
            files: [shareFile],
          });
          setShareToast("Shared");
          return;
        } catch (error) {
          if (error?.name === "AbortError") return;
        }
      }
      downloadShareCard(cardBlob);
      setShareToast("Image saved — check downloads");
    } catch {
      setShareToast("Could not create share image");
    } finally {
      setIsGeneratingShareCard(false);
    }
  }

  function handleShareButtonClick() {
    if (hasSelectionContent) {
      setShowShareOverflowHint(false);
      if (!canShareSelectedSnippet) return;
      shareCard("selection");
      return;
    }
    if (!canShareFullPoem) {
      setShowShareOverflowHint(true);
      return;
    }
    setShowShareOverflowHint(false);
    shareCard("full");
  }

  const navState = onPoemDetail
    ? poemContext.previousScreen === "discoveryResults"
      ? discoveryContext.previousScreen
      : poemContext.previousScreen
    : onVoiceDetail
      ? voiceDetailContext.previousScreen === "discoveryResults"
        ? discoveryContext.previousScreen
        : voiceDetailContext.previousScreen
    : onDiscoveryResults
      ? discoveryContext.previousScreen
      : screen;
  const hasCollectionPagination = curatedCollections.length > collectionsPerPage;

  useLayoutEffect(() => {
    const existingSnapshot = window.history.state?.verseryApp
      ? normalizeSnapshot(window.history.state.verseryApp)
      : null;
    const existingIndex = Number.isFinite(window.history.state?.verseryIndex)
      ? window.history.state.verseryIndex
      : 0;

    historyIndexRef.current = existingIndex;

    if (existingSnapshot) {
      isApplyingHistoryRef.current = true;
      applySnapshot(existingSnapshot);
      window.history.replaceState(
        { ...(window.history.state ?? {}), verseryApp: existingSnapshot, verseryIndex: existingIndex },
        "",
      );
    } else {
      isApplyingHistoryRef.current = true;
      const fromUrl = buildSnapshotFromLocationPath(window.location.pathname);
      if (fromUrl) {
        const snap = normalizeSnapshot(fromUrl);
        applySnapshot(snap);
        window.history.replaceState(
          { ...(window.history.state ?? {}), verseryApp: snap, verseryIndex: 0 },
          "",
        );
      } else {
        const snap = createSnapshot();
        window.history.replaceState(
          { ...(window.history.state ?? {}), verseryApp: snap, verseryIndex: 0 },
          "",
        );
        const p = (window.location.pathname || "/").replace(/\/$/, "") || "/";
        if (p !== "/") {
          window.history.replaceState(
            { ...(window.history.state ?? {}), verseryApp: snap, verseryIndex: 0 },
            "",
            "/",
          );
        }
      }
    }

    const handlePopState = (event) => {
      if (!event.state?.verseryApp) {
        return;
      }
      historyIndexRef.current = Number.isFinite(event.state.verseryIndex) ? event.state.verseryIndex : 0;
      isApplyingHistoryRef.current = true;
      applySnapshot(normalizeSnapshot(event.state.verseryApp));
    };

    window.addEventListener("popstate", handlePopState);
    historyReadyRef.current = true;

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useLayoutEffect(() => {
    if (!historyReadyRef.current) {
      return;
    }

    if (isApplyingHistoryRef.current) {
      isApplyingHistoryRef.current = false;
      return;
    }

    historyIndexRef.current += 1;
    const nextSnapshot = createSnapshot();
    window.history.pushState(
      {
        ...(window.history.state ?? {}),
        verseryApp: nextSnapshot,
        verseryIndex: historyIndexRef.current,
      },
      "",
      pathFromVerserySnapshot(nextSnapshot),
    );
  }, [
    screen,
    activeVoiceId,
    activeCollectionId,
    collectionPage,
    activeFeeling,
    discoveryContext.key,
    discoveryContext.previousScreen,
    discoveryContext.source,
    voiceDetailContext.previousScreen,
    voiceWorksContext.previousScreen,
    collectionDetailContext.previousScreen,
    activePoemId,
    poemContext.previousScreen,
    poemContext.sourceOrigin,
    poemContext.sourceVoiceId,
    poemContext.sourceCollectionId,
    poemContext.feeling,
  ]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [screen, activeVoiceId, activeCollectionId, activePoemId, collectionPage, voiceWorksPage]);

  useEffect(() => {
    let title = DEFAULT_DOCUMENT_TITLE;
    let description = DEFAULT_META_DESCRIPTION;
    let ogDescription = DEFAULT_OG_DESCRIPTION;
    let twitterDescription = DEFAULT_TWITTER_DESCRIPTION;

    if (onPoemDetail) {
      title = `${activePoem.title} · Versery`;
      const excerptSource =
        activePoem.subtitle ||
        activePoem.note ||
        activePoem.lines.flat().join(" ");
      const trimmedExcerpt = trimTo160Chars(excerptSource);
      if (trimmedExcerpt) {
        description = trimmedExcerpt;
        ogDescription = trimmedExcerpt;
        twitterDescription = trimmedExcerpt;
      }
    } else if (onCollectionDetail) {
      title = `${activeCollection.title} · Versery`;
      const d = activeCollection.description;
      if (d) {
        const t = trimTo160Chars(d);
        description = t;
        ogDescription = t;
        twitterDescription = t;
      }
    } else if (onVoiceDetail) {
      title = `${activeVoice.name} · Versery`;
      const vd = activeVoice.bio || activeVoice.title;
      if (vd) {
        const t = trimTo160Chars(vd);
        description = t;
        ogDescription = t;
        twitterDescription = t;
      }
    } else if (onVoiceWorks) {
      title = `Works · ${activeVoice.name} · Versery`;
    } else if (onDiscoveryResults && activeDiscovery) {
      title = `${activeDiscovery.title} · Versery`;
      const s = activeDiscovery.subtitle;
      if (s) {
        const t = trimTo160Chars(s);
        description = t;
        ogDescription = t;
        twitterDescription = t;
      }
    } else if (onCompass) {
      title = `Emotional compass · Versery`;
    } else if (onVoices) {
      title = `Poet voices · Versery`;
    } else if (onCollections) {
      title = `Curated poetry collections · Versery`;
    }

    document.title = title;
    upsertNamedMeta("description", description);
    upsertPropertyMeta("og:title", title);
    upsertPropertyMeta("og:description", ogDescription);
    const pageUrl = typeof window !== "undefined" ? window.location.href : "";
    upsertPropertyMeta("og:url", pageUrl);
    upsertNamedMeta("twitter:title", title);
    upsertNamedMeta("twitter:description", twitterDescription);
    upsertCanonicalLink(pageUrl);
  }, [
    screen,
    onPoemDetail,
    onCollectionDetail,
    onVoiceDetail,
    onVoiceWorks,
    onDiscoveryResults,
    onCompass,
    onVoices,
    onCollections,
    activePoem.title,
    activePoem.subtitle,
    activePoem.note,
    activePoem.lines,
    activeCollection.title,
    activeCollection.description,
    activeVoice.name,
    activeVoice.title,
    activeVoice.bio,
    activeDiscovery?.title,
    activeDiscovery?.subtitle,
  ]);

  useEffect(() => {
    const id = "versery-faq-jsonld";
    const existing = document.getElementById(id);
    if (screen !== "home") {
      existing?.remove();
      return;
    }
    const script = existing ?? document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(homeFaqJsonLd(HOME_FAQ_ITEMS));
    if (!existing) document.head.appendChild(script);
  }, [screen]);

  useEffect(() => {
    const poemLdId = "versery-poem-creativework-jsonld";
    const voiceLdId = "versery-voice-person-jsonld";
    document.getElementById(poemLdId)?.remove();
    document.getElementById(voiceLdId)?.remove();

    if (onPoemDetail) {
      const excerptSource =
        activePoem.subtitle ||
        activePoem.note ||
        activePoem.lines.flat().join(" ");
      const ld = {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        name: activePoem.title,
        author: {
          "@type": "Person",
          name: poemPoetName,
        },
        description: trimTo160Chars(excerptSource),
        url: typeof window !== "undefined" ? window.location.href : "",
      };
      const script = document.createElement("script");
      script.id = poemLdId;
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(ld);
      document.head.appendChild(script);
    } else if (onVoiceDetail) {
      const bioSource = activeVoice.bio || activeVoice.title || "";
      const ld = {
        "@context": "https://schema.org",
        "@type": "Person",
        name: activeVoice.name,
        description: trimTo160Chars(bioSource),
        url: typeof window !== "undefined" ? window.location.href : "",
      };
      const script = document.createElement("script");
      script.id = voiceLdId;
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(ld);
      document.head.appendChild(script);
    }
  }, [
    onPoemDetail,
    onVoiceDetail,
    activePoem.title,
    activePoem.subtitle,
    activePoem.note,
    activePoem.lines,
    poemPoetName,
    activeVoice.name,
    activeVoice.bio,
    activeVoice.title,
  ]);

  useEffect(() => {
    setSelectedPoemText("");
    setSelectedVisibleCharCount(0);
  }, [activePoemId]);

  useEffect(() => {
    function clearSelectionHighlights() {
      if (!supportsCustomHighlight) return;
      CSS.highlights.delete("share-within");
      CSS.highlights.delete("share-overflow");
    }

    function handleSelectionChange() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setSelectedPoemText("");
        setSelectedVisibleCharCount(0);
        clearSelectionHighlights();
        return;
      }
      const range = selection.getRangeAt(0);
      const body = poemBodyRef.current;
      if (!body || !body.contains(range.commonAncestorContainer)) {
        setSelectedPoemText("");
        setSelectedVisibleCharCount(0);
        clearSelectionHighlights();
        return;
      }
      const lineNodes = body.querySelectorAll(".poem-reader__line");
      const selectedParts = [];
      const selectedOffsets = [];
      lineNodes.forEach((lineNode) => {
        const textNode = lineNode.firstChild;
        const lineText = lineNode.textContent ?? "";
        if (!textNode || !range.intersectsNode(textNode) || !lineText.length) return;
        let start = 0;
        let end = lineText.length;
        if (lineNode.contains(range.startContainer)) {
          start = range.startOffset;
        }
        if (lineNode.contains(range.endContainer)) {
          end = range.endOffset;
        }
        start = Math.max(0, Math.min(start, lineText.length));
        end = Math.max(0, Math.min(end, lineText.length));
        if (end <= start) return;
        const text = lineText.slice(start, end);
        if (!text.trim()) return;
        selectedParts.push(text);
        selectedOffsets.push({ textNode, start, end });
      });
      const visibleCount = selectedParts.reduce((total, part) => total + part.length, 0);
      setSelectedPoemText(selectedParts.join("\n"));
      setSelectedVisibleCharCount(visibleCount);
      if (supportsCustomHighlight) {
        const within = [];
        const overflow = [];
        let used = 0;
        selectedOffsets.forEach(({ textNode, start, end }) => {
          const partLength = end - start;
          const remaining = SHARE_SELECTION_LIMIT - used;
          if (remaining > 0) {
            const withinEnd = Math.min(end, start + remaining);
            if (withinEnd > start) {
              const part = new Range();
              part.setStart(textNode, start);
              part.setEnd(textNode, withinEnd);
              within.push(part);
              used += withinEnd - start;
            }
            if (withinEnd < end) {
              const part = new Range();
              part.setStart(textNode, withinEnd);
              part.setEnd(textNode, end);
              overflow.push(part);
            }
            return;
          }
          if (partLength > 0) {
            const part = new Range();
            part.setStart(textNode, start);
            part.setEnd(textNode, end);
            overflow.push(part);
          }
        });
        CSS.highlights.set("share-within", new Highlight(...within));
        CSS.highlights.set("share-overflow", new Highlight(...overflow));
      }
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      clearSelectionHighlights();
    };
  }, [supportsCustomHighlight]);

  useEffect(() => {
    if (!shareToast) return undefined;
    const timeout = window.setTimeout(() => setShareToast(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [shareToast]);

  useEffect(() => {
    if (hasSelectionContent || canShareFullPoem) {
      setShowShareOverflowHint(false);
    }
  }, [hasSelectionContent, canShareFullPoem, activePoemId]);

  function handleWhatsNewPillClick() {
    if (whatsNewMenuOpen) {
      setWhatsNewMenuEntered(false);
      return;
    }
    setWhatsNewMenuOpen(true);
  }

  function handleWhatsNewGotIt() {
    setWhatsNewMenuEntered(false);
  }

  function handleWhatsNewPanelTransitionEnd(event) {
    if (event.target !== whatsNewPanelRef.current) return;
    if (event.propertyName !== "opacity") return;
    if (!whatsNewMenuEntered) {
      setWhatsNewMenuOpen(false);
    }
  }

  return (
    <div
      className={`page-shell${onCompass ? " page-shell--compass" : ""}${
        onVoiceDetail ? " page-shell--voice-detail" : ""
      }${onCollectionDetail ? " page-shell--collection-detail" : ""}${
        onVoiceWorks || onDiscoveryResults ? " page-shell--detail" : ""
      }${onPoemDetail ? " page-shell--poem-detail" : ""}`}
    >
      {!onVoiceDetail && !onVoiceWorks && !onCollectionDetail && !onDiscoveryResults && !onPoemDetail && (
        <header className="top-app-bar">
          <div className="top-app-bar__inner top-app-bar__inner--home">
            <div className="top-app-bar__leading">
              {screen === "home" ? (
                <div className="whats-new-anchor" ref={whatsNewTriggerRef}>
                  <button
                    type="button"
                    className="whats-new-trigger"
                    aria-haspopup="true"
                    aria-expanded={whatsNewMenuOpen}
                    aria-controls="versery-whats-new-panel"
                    onClick={handleWhatsNewPillClick}
                  >
                    <span className="material-symbols-outlined whats-new-trigger__icon" aria-hidden="true">
                      notifications
                    </span>
                    <span className="whats-new-trigger__label">What&rsquo;s new</span>
                    <span className="whats-new-trigger__dot" aria-hidden="true" />
                  </button>
                  {whatsNewMenuOpen ? (
                    <div
                      ref={whatsNewPanelRef}
                      id="versery-whats-new-panel"
                      role="region"
                      aria-label="What is new in Versery version 2"
                      className={`whats-new-panel${whatsNewMenuEntered ? " whats-new-panel--visible" : ""}`}
                      onTransitionEnd={handleWhatsNewPanelTransitionEnd}
                    >
                      <div className="whats-new-panel__head">
                        <p className="feature-card-main__heading">What&rsquo;s new in v2</p>
                        <button
                          type="button"
                          className="whats-new-panel__close"
                          aria-label="Close"
                          onClick={handleWhatsNewGotIt}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            close
                          </span>
                        </button>
                      </div>
                      <ul className="whats-new-panel__list">
                        {WHATS_NEW_BULLETS.map((text, index) => {
                          const { lead, rest } = splitWhatsNewBulletLine(text);
                          return (
                            <li key={index} className="whats-new-panel__item">
                              <span className="whats-new-panel__item-dot" aria-hidden="true" />
                              <span className="whats-new-panel__item-text">
                                <span className="whats-new-panel__item-lead">{lead}</span>
                                {rest != null ? (
                                  <span className="whats-new-panel__item-rest">
                                    {WHATS_NEW_EMDASH}
                                    {rest}
                                  </span>
                                ) : null}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <span className="top-app-bar__pad" aria-hidden="true" />
              )}
            </div>
            <p
              className="top-app-bar__title"
              onClick={() => {
                if (isDesktop && screen !== "home") {
                  setScreen("home");
                }
              }}
              style={{ cursor: isDesktop ? "pointer" : "default" }}
            >
              Versery
            </p>
            <div className="top-app-bar__trailing">
              {screen === "home" ? (
                <>
                  <InstallAppButton
                    className="icon-surface top-app-bar__install"
                    surface="home"
                    deferredPrompt={deferredInstallPrompt}
                    onConsumedPrompt={() => setDeferredInstallPrompt(null)}
                    tooltip="Add Versery to your home screen for quicker access—like an app shortcut on your device."
                  />
                  <button
                    type="button"
                    className="top-app-bar__theme icon-surface"
                    aria-label={uiTheme === "dark" ? "Switch to light appearance" : "Switch to dark appearance"}
                    onClick={() => {
                      const next = uiTheme === "dark" ? "light" : "dark";
                      applyTheme(next, {
                        animate: true,
                        onAfterThemeCommit: () => {
                          flushSync(() => {
                            setUiTheme(next);
                          });
                        },
                      });
                      trackEvent("theme_changed", { theme: next });
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {uiTheme === "dark" ? "light_mode" : "dark_mode"}
                    </span>
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </header>
      )}

      {onCompass ? (
        <main className="screen-content screen-content--compass" data-testid="screen-compass">
          <header className="compass-header">
            <h1>Emotional Compass</h1>
            <p>Select your current sensory resonance</p>
          </header>

          <section className="portal-grid" aria-label="Emotional portals">
            {portals.map((portal) => (
              <button
                key={portal.name}
                className={`portal-card portal-card--${portal.tone}`}
                type="button"
                data-portal={portal.name.toLowerCase()}
                aria-label={`Open ${portal.name} portal — ${portal.subtitle}`}
                style={{ "--portal-color": TAG_PASTEL_HEX[portal.name] }}
                onClick={() => openDiscovery(portal.name, "compass", "compass")}
              >
                <span className="portal-card__glow" aria-hidden="true"></span>
                <span className="portal-card__glass">
                  <span className="material-symbols-outlined portal-card__icon">{portal.icon}</span>
                  <span className="portal-card__title">{portal.name}</span>
                  <span className="portal-card__subtitle">{portal.subtitle}</span>
                </span>
              </button>
            ))}
          </section>
        </main>
      ) : onVoices ? (
        <main className="screen-content screen-content--voices" data-testid="screen-voices">
          <section className="voices-header">
            <h1>Poet voices in the archive</h1>
            <p className="voices-header__lead">
              Browse poet profiles to read poetry online in context—eras, origins, and a path into each voice&rsquo;s
              works.
            </p>

            <label className="voices-search" aria-label="Search voices">
              <span className="material-symbols-outlined">search</span>
              <input
                placeholder="Search voices..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>

            <div className="voices-filters" aria-label="Voice filters">
              {voiceFilters.map((filter) => (
                <button
                  key={filter}
                  className={`filter-chip${activeEraFilter === filter ? " is-active" : ""}`}
                  type="button"
                  aria-label={filter === "All Eras" ? "Show all eras" : `Filter poets by ${filter} era`}
                  aria-pressed={activeEraFilter === filter}
                  onClick={() => setActiveEraFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
          </section>

          <section className="voices-grid" aria-label="Poets gallery">
            {filteredVoices.map((voice) => (
              <article
                key={voice.id}
                data-voice-id={voice.id}
                className={`voice-card${voice.offset ? " voice-card--offset" : ""}${
                  voice.offset === "up" ? " voice-card--lift" : ""
                }`}
                onClick={() => openVoice(voice.id, "voices")}
              >
                <div className="voice-card__image">
                  <img src={voice.image} alt={`Portrait of ${voice.name}`} loading="lazy" />
                </div>
                <div className="voice-card__meta">
                  <h3>{voice.name}</h3>
                  <p>{voice.cardSubtitle || voice.tag}</p>
                </div>
              </article>
            ))}

            {(searchQuery.trim() || activeEraFilter !== "All Eras") &&
              filteredVoices.length === 0 && (
                <p style={{ gridColumn: "1 / -1", textAlign: "center", padding: "2rem", color: "var(--ink-soft)" }}>
                  {searchQuery.trim() ? `No voices match "${searchQuery}"` : `No voices in "${activeEraFilter}"`}
                </p>
              )}
          </section>
        </main>
      ) : onCollections ? (
        <main className="screen-content screen-content--collections" data-testid="screen-collections">
          <section className="collections-archive" aria-label="Curated collections archive">
            <header className="collections-archive__header">
              <span>Seasonal Selection</span>
              <h1>Curated poetry collections</h1>
              <p>
                Themed shelves you can open in a few taps—love, nature, solitude, witness, and more—each built for
                longer reading sessions.
              </p>
            </header>

            <div className="collections-archive__grid">
              {visibleCollections.map((collection) => (
                <button
                  key={collection.id}
                  className={`collections-archive-card${
                    collection.featured ? " collections-archive-card--featured" : ""
                  }${collection.image ? " collections-archive-card--image" : ""}${
                    collection.tone ? ` collections-archive-card--${collection.tone}` : ""
                  }${
                    desktopCollectionLayout[collection.id] === "full"
                      ? " collections-archive-card--desktop-full"
                      : " collections-archive-card--desktop-half"
                  }`}
                  type="button"
                  onClick={() => openCollection(collection.id, "collections")}
                >
                  {collection.image ? (
                    <div className="collections-archive-card__media">
                      <img src={collectionImages[collection.id] || collection.image} alt={collection.title} loading="lazy" />
                    </div>
                  ) : (
                    <div className="collections-archive-card__media collections-archive-card__media--plain" aria-hidden="true"></div>
                  )}

                  <div className="collections-archive-card__body">
                    <span>{collection.label}</span>
                    <h3>{collection.title}</h3>
                    <p>{collection.description}</p>
                    <strong>{collection.count}</strong>
                  </div>
                </button>
              ))}
            </div>

            {hasCollectionPagination && (
              <div className="collections-archive__footer">
                <span>View All Volumes</span>
                <div className="collections-archive__pager">
                  <button
                    type="button"
                    className="collections-archive__pager-btn inline-action"
                    disabled={collectionPage === 0}
                    onClick={() => setCollectionPage((page) => Math.max(page - 1, 0))}
                  >
                    <span className="material-symbols-outlined">west</span>
                    <span>Previous</span>
                  </button>
                  <p>{String(collectionPage + 1).padStart(2, "0")} / {String(totalCollectionPages).padStart(2, "0")}</p>
                  <button
                    type="button"
                    className="collections-archive__pager-btn inline-action"
                    disabled={collectionPage === totalCollectionPages - 1}
                    onClick={() =>
                      setCollectionPage((page) => Math.min(page + 1, totalCollectionPages - 1))
                    }
                  >
                    <span>Next</span>
                    <span className="material-symbols-outlined">east</span>
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      ) : onDiscoveryResults ? (
        <main className="screen-content screen-content--discovery" data-testid="screen-discovery">
          <section className="discovery-results-page">
            <header className="screen-actions screen-actions--static screen-actions--split discovery-results-page__header">
              <button
                className="screen-action-btn"
                type="button"
                aria-label={`Back to ${discoveryContext.previousScreen}`}
                onClick={handleDiscoveryBack}
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
            </header>

            <header className="voice-works-page__intro discovery-results-page__intro">
              <span>{discoveryContext.source === "compass" ? "Emotional Compass" : "Daily Resonance"}</span>
              <h1>{activeDiscovery.title}</h1>
              <p>{activeDiscovery.subtitle}</p>
            </header>

            {activeDiscovery.showFeaturedPoem && discoveryFeaturedPoem && (
              <button
                type="button"
                className="discovery-feature"
                style={{ "--discovery-accent": discoveryFeaturedAccent }}
                onClick={() =>
                  openPoem({
                    poemId: discoveryFeaturedPoem.poemId,
                    previousScreen: "discoveryResults",
                    sourceOrigin: "mood",
                    feeling: discoveryContext.key,
                  })
                }
              >
                <span className="discovery-feature__label">Featured Poem</span>
                <div className="discovery-feature__content">
                  <div>
                    <p className="discovery-feature__poet">
                      {discoveryFeaturedPoem.poet} • {discoveryFeaturedPoem.year}
                    </p>
                    <h3>{discoveryFeaturedPoem.title}</h3>
                    {discoveryFeaturedPoemContent && (
                      <div className="discovery-feature__poem">
                        {discoveryFeaturedPoemContent.lines.map((stanza, index) => (
                          <div key={`${discoveryFeaturedPoem.poemId}-${index}`} className="discovery-feature__stanza">
                            {stanza.map((line) => (
                              <p key={line}>{line}</p>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="discovery-feature__cta">Open full poem</p>
                  </div>
                </div>
              </button>
            )}

            <section className="voice-works-page__list" aria-label={`${activeDiscovery.title} poem results`}>
              {discoveryPoems.map((poem) => (
                <button
                  key={poem.poemId}
                  className="voice-works-page__item"
                  type="button"
                  onClick={() =>
                    openPoem({
                      poemId: poem.poemId,
                      previousScreen: "discoveryResults",
                      sourceOrigin: "mood",
                      feeling: discoveryContext.key,
                    })
                  }
                >
                  <div>
                    <h3>{poem.title}</h3>
                    <p>{poem.excerpt}</p>
                  </div>
                  <div className="voice-works-page__meta discovery-results-page__meta">
                    <span>{poem.poet}</span>
                    <span className="material-symbols-outlined">arrow_forward_ios</span>
                  </div>
                </button>
              ))}
            </section>

            <section className="discovery-poets" aria-label={`${activeDiscovery.title} poets`}>
              <div className="discovery-poets__header">
                <h2 className="discovery-poets__heading">Poets in this resonance</h2>
              </div>
              <div className="discovery-poets__rail">
                {discoveryPoets.map((voice) => (
                  <button
                    key={voice.id}
                    type="button"
                    className="discovery-poet-chip"
                    aria-label={`Open poet ${voice.name}`}
                    onClick={() => openVoice(voice.id, "discoveryResults")}
                  >
                    <span className="discovery-poet-chip__avatar">
                      <img src={voice.image} alt={voice.name} loading="lazy" />
                    </span>
                    <span className="discovery-poet-chip__name">{voice.name}</span>
                  </button>
                ))}
              </div>
            </section>
          </section>
        </main>
      ) : onCollectionDetail ? (
        <main className="screen-content screen-content--collection-detail" data-testid="screen-collection-detail">
          <section className="collection-detail">
            <header className="screen-actions screen-actions--static screen-actions--split collection-detail__back">
              <button
                className="screen-action-btn"
                type="button"
                aria-label="Back to collections"
                onClick={handleCollectionBack}
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
            </header>

            <header className="collection-detail__hero">
              <div className="collection-detail__art">
                {activeCollection.artwork ? (
                  <img src={collectionImages[activeCollection.id] || activeCollection.artwork} alt={activeCollection.title} loading="lazy" />
                ) : (
                  <div className="collection-detail__art-placeholder" aria-hidden="true"></div>
                )}
              </div>
              <h1>{activeCollection.title}</h1>
              <p>{activeCollection.description}</p>
            </header>

            <section className="collection-detail__list" aria-label={`${activeCollection.title} poems`}>
              {activeCollection.poems.map((poem) => (
                <article key={poem.poemId} className="collection-poem-card">
                  <div className="collection-poem-card__head">
                    <div>
                      <span>{poem.poet} • {poem.year}</span>
                      <h2>{poem.title}</h2>
                    </div>
                  </div>
                  <div className="collection-poem-card__excerpt">
                    <p>{poem.excerpt}</p>
                  </div>
                  <button
                    type="button"
                    className="collection-poem-card__link inline-action"
                    onClick={() =>
                      openPoem({
                        poemId: poem.poemId,
                        previousScreen: "collectionDetail",
                        sourceOrigin: "collection",
                        sourceCollectionId: activeCollection.id,
                      })
                    }
                  >
                    Read Full Poem
                  </button>
                </article>
              ))}
            </section>

            {activeCollection.curator && (
              <footer className="collection-detail__curator">
                <p>Curated by {activeCollection.curator.name}</p>
                <span>{activeCollection.curator.role}</span>
              </footer>
            )}
          </section>
        </main>
      ) : onVoiceDetail ? (
        <main className="screen-content screen-content--voice-detail" data-testid="screen-voice-detail">
          <header className="voice-hero">
            <img src={activeVoice.image} alt={`Portrait of ${activeVoice.name}`} fetchPriority="high" />
            <div className="voice-hero__overlay"></div>
            <div className="screen-actions screen-actions--overlay">
              <button
                className="screen-action-btn"
                type="button"
                aria-label="Back to voices"
                onClick={() => navigateBack(() => setScreen(voiceDetailContext.previousScreen))}
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
            </div>
            <div className="voice-hero__title">
              <span className="voice-hero__badge">{activeVoice.heroLabel}</span>
              <h1>{activeVoice.name}</h1>
              {activeVoice.fullName ? <p className="voice-hero__full-name">{activeVoice.fullName}</p> : null}
              <p className="voice-hero__meta-line">
                {activeVoice.heroSubtitle ? (
                  <>
                    <span>{activeVoice.heroSubtitle}</span>
                    {activeVoice.origin ? (
                      <>
                        <span className="voice-hero__dot" aria-hidden="true"></span>
                        <span>{activeVoice.origin}</span>
                      </>
                    ) : null}
                  </>
                ) : activeVoice.origin ? (
                  <span>{activeVoice.origin}</span>
                ) : (
                  <span>Versery curated archive</span>
                )}
              </p>
            </div>
          </header>

          <section className="voice-body">
            <div className="voice-section">
              <h2>Introduction</h2>
              <p className="voice-body__lead">{activeVoice.title}</p>
              <p>{activeVoice.bio}</p>
            </div>

            {(activeVoice.moods?.length > 0 || activeVoice.portalTags?.length > 0) && (
              <div className="voice-section voice-section--tags" aria-label="Archive tags for this voice">
                {activeVoice.moods?.length > 0 ? (
                  <div className="voice-tag-block">
                    <h3>Moods</h3>
                    <div className="voice-tag-row">
                      {activeVoice.moods.map((m) => (
                        <span key={m} className="voice-tag-pill">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {activeVoice.portalTags?.length > 0 ? (
                  <div className="voice-tag-block">
                    <h3>Discovery portals</h3>
                    <p className="voice-tag-block__hint">How this voice often surfaces in Versery&rsquo;s mood compass.</p>
                    <div className="voice-tag-row">
                      {activeVoice.portalTags.map((t) => (
                        <span key={t} className="voice-tag-pill voice-tag-pill--portal">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div className="voice-stats">
              {activeVoice.stats.map((stat) => (
                <div key={stat.label} className="voice-stat">
                  <span className="material-symbols-outlined">{stat.icon}</span>
                  <div>
                    <span>{stat.value}</span>
                    <span>{stat.label}</span>
                  </div>
                </div>
              ))}
            </div>

            {activeVoice.resonance ? (
              <div className="voice-section">
                <h2>Reading this voice</h2>
                <p>{activeVoice.resonance}</p>
              </div>
            ) : null}
          </section>

          <section className="voice-works">
            <div className="voice-works__header">
              <h2>Essential works</h2>
              <button className="inline-action" type="button" onClick={() => openVoiceWorks("voiceDetail")}>
                View All
              </button>
            </div>
            <div className="voice-works__list">
              {activeVoice.works.map((work) => (
                <button
                  key={work.id}
                  className="voice-work"
                  type="button"
                  onClick={() =>
                    openPoem({
                      poemId: work.poemId,
                      previousScreen: "voiceDetail",
                      sourceOrigin: "voice",
                      sourceVoiceId: activeVoice.id,
                    })
                  }
                >
                  <span className="voice-work__index">{work.id}</span>
                  <span className="voice-work__text">
                    <strong>{work.title}</strong>
                    <span>{work.subtitle}</span>
                  </span>
                  <span className="material-symbols-outlined">arrow_forward_ios</span>
                </button>
              ))}
            </div>
          </section>

          {activeVoice.quote ? (
            <section className="voice-quote" aria-label="Featured quotation">
              <div className="voice-quote__glow voice-quote__glow--one"></div>
              <div className="voice-quote__glow voice-quote__glow--two"></div>
              <div className="voice-quote__content">
                <span className="material-symbols-outlined">format_quote</span>
                <p>
                  &ldquo;{activeVoice.quote}&rdquo;
                  {activeVoice.quoteSource ? <span>{activeVoice.quoteSource}</span> : null}
                </p>
                <div className="voice-quote__divider"></div>
              </div>
            </section>
          ) : null}
        </main>
      ) : onVoiceWorks ? (
        <main className="screen-content screen-content--voice-works" data-testid="screen-voice-works">
          <section className="voice-works-page">
            <header className="screen-actions screen-actions--static screen-actions--split voice-works-page__header">
              <button
                className="screen-action-btn"
                type="button"
                aria-label="Back to poet page"
                onClick={handleVoiceWorksBack}
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
            </header>

            <header className="voice-works-page__intro">
              <span>The Complete Works</span>
              <h1>{activeVoice.name}</h1>
              <p>{activeVoice.title}</p>
            </header>

            <label className="voices-search voice-works-page__search" aria-label="Search poems">
              <span className="material-symbols-outlined">search</span>
              <input placeholder="Search poems, themes, or keywords..." type="text" />
            </label>

            <section className="voice-works-page__list" aria-label={`Works by ${activeVoice.name}`}>
              {visibleWorks.map((poem) => (
                <button
                  key={poem.id}
                  className="voice-works-page__item"
                  type="button"
                  onClick={() =>
                    openPoem({
                      poemId: poem.id,
                      previousScreen: "voiceWorks",
                      sourceOrigin: "voice",
                      sourceVoiceId: activeVoice.id,
                    })
                  }
                >
                  <div>
                    <h3>{poem.title}</h3>
                    <p>{poem.excerpt}</p>
                  </div>
                  <div className="voice-works-page__meta">
                    <span>{activeVoice.tag}</span>
                    <span className="material-symbols-outlined">arrow_forward_ios</span>
                  </div>
                </button>
              ))}
            </section>
            {totalWorksPages > 1 && (
              <div className="collections-archive__footer">
                <span>Page {voiceWorksPage + 1} of {totalWorksPages}</span>
                <div className="collections-archive__pager">
                  <button
                    type="button"
                    className="collections-archive__pager-btn inline-action"
                    disabled={voiceWorksPage === 0}
                    onClick={() => setVoiceWorksPage((p) => Math.max(p - 1, 0))}
                  >
                    <span className="material-symbols-outlined">west</span>
                    <span>Previous</span>
                  </button>
                  <p>
                    {String(voiceWorksPage + 1).padStart(2, "0")} /{" "}
                    {String(totalWorksPages).padStart(2, "0")}
                  </p>
                  <button
                    type="button"
                    className="collections-archive__pager-btn inline-action"
                    disabled={voiceWorksPage === totalWorksPages - 1}
                    onClick={() => setVoiceWorksPage((p) => Math.min(p + 1, totalWorksPages - 1))}
                  >
                    <span>Next</span>
                    <span className="material-symbols-outlined">east</span>
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      ) : onPoemDetail ? (
        <main className="screen-content screen-content--poem-detail" data-testid="screen-poem">
          <header className="screen-actions screen-actions--reader">
            <button className="screen-action-btn" type="button" aria-label="Go back" onClick={handlePoemBack}>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <InstallAppButton
              surface="poem"
              className="screen-action-btn"
              deferredPrompt={deferredInstallPrompt}
              onConsumedPrompt={() => setDeferredInstallPrompt(null)}
              movingBorder
              tooltip="Add Versery to your home screen for quicker access—like an app shortcut on your device."
            />
          </header>

          <article className="poem-reader">
            <div className="poem-reader__meta">
              <span>Poem Selection</span>
              <div></div>
            </div>

            <header className="poem-reader__title">
              <h1>{activePoem.title}</h1>
              <p>{activePoem.translator}</p>
            </header>

            <div className="poem-reader__mark">
              <span className="material-symbols-outlined">{activePoem.icon}</span>
            </div>

            <section
              ref={poemBodyRef}
              className={`poem-reader__body${supportsCustomHighlight ? " has-custom-highlight" : ""}${
                selectedSnippetOverflow && !supportsCustomHighlight ? " is-selection-overflow" : ""
              }`}
            >
              {activePoem.lines.map((stanza, index) => (
                <div key={`${activePoem.id}-${index}`} className="poem-reader__stanza">
                  {stanza.map((line, lineIndex) => (
                    <p key={`${activePoem.id}-${index}-${lineIndex}`} className="poem-reader__line">
                      {line}
                    </p>
                  ))}
                </div>
              ))}
            </section>

            <div className="poem-reader__actions">
              <button
                className="secondary-action poem-reader__share-btn"
                type="button"
                disabled={isGeneratingShareCard}
                onClick={handleShareButtonClick}
              >
                <span className="material-symbols-outlined" aria-hidden="true">ios_share</span>
                <span>{isGeneratingShareCard ? "Generating..." : shareButtonLabel}</span>
              </button>
            </div>
            {shareHelperText && <p className="poem-reader__share-hint">{shareHelperText}</p>}
            <p className="poem-reader__subscribe-teaser">
              Weekly curated poems in your inbox —{" "}
              <button
                type="button"
                className="poem-reader__subscribe-link"
                onClick={() => {
                  setPoemSubscribeOpen(true);
                  trackEvent("newsletter_subscribe_link_clicked", { surface: "poem_reader" });
                }}
              >
                Subscribe
              </button>
            </p>

            <div className="poem-reader__mark poem-reader__mark--bottom">
              <span className="material-symbols-outlined">{activePoem.footerIcon}</span>
            </div>

          </article>

          {shareToast && (
            <div className="share-toast" role="status" aria-live="polite">
              {shareToast}
            </div>
          )}

          <div className="share-card-render-shell" aria-hidden="true">
            <article
              ref={shareCardRef}
              className={`share-card share-card--${shareCardMode}`}
              style={shareCardSurfaceStyle}
            >
              <div
                className="share-card__mood-dot"
                style={{ backgroundColor: shareAccentHex }}
                aria-hidden="true"
              />
              <div className="share-card__main">
                <div className="share-card__body-wrap">
                  <div className="share-card__frame">
                    <div className="share-card__content">
                      {shareCardLines.map((line, index) => (
                        <p key={`${shareCardMode}-${index}`}>{line}</p>
                      ))}
                    </div>
                    <p className="share-card__poet">— {poemPoetName}</p>
                  </div>
                </div>
                <p className="share-card__brand">Versery</p>
              </div>
            </article>
          </div>

          <PoemSubscribeDialog open={poemSubscribeOpen} onClose={() => setPoemSubscribeOpen(false)} />

          <aside className="poem-next">
            <div className="poem-next__glow poem-next__glow--one"></div>
            <div className="poem-next__glow poem-next__glow--two"></div>
            <div className="poem-next__content">
              <div>
                <span>Continue Reading</span>
                <h3>{nextPoemData.poem.title}</h3>
              </div>
              <p>{nextPoemData.poem.subtitle}</p>
              <button
                className="primary-action"
                type="button"
                aria-label={`Open next poem: ${nextPoemData.poem.title}`}
                onClick={openNextPoem}
              >
                Open Poem
              </button>
              <div className="poem-next__divider"></div>
            </div>
          </aside>
        </main>
      ) : (
        <main className="screen-content screen-content--home" data-testid="screen-home">
          <section ref={heroSectionRef} className="feeling-section">
            <div className="eyebrow-pill">Daily Resonance</div>

            <div className="home-intro home-intro--hero">
              <h1>Curated poetry for how you feel</h1>
              <p className="home-intro__lead">
                Versery is a calm place to read poems online: follow a mood, follow a voice, or open a themed
                archive.
              </p>
            </div>

            <div className="home-hero-cluster">
              <div className="home-daily-resonance-heading">
                <p className="daily-resonance-label">Daily Resonance</p>
              </div>

              <div className="feeling-card">
                <h2>How are you feeling today?</h2>
                <p className="feeling-card__hint">Tap a mood to see poems tuned to that tone.</p>

                <div className="feeling-grid" aria-label="Feeling options">
                  {feelings.map((feeling) => (
                    <button
                      key={feeling}
                      className={`feeling-chip${activeFeeling === feeling ? " is-active" : ""}`}
                      type="button"
                      data-feeling={feeling.toLowerCase()}
                      aria-label={`Browse ${feeling} poems`}
                      onClick={() => {
                        setActiveFeeling(feeling);
                        trackEvent("feeling_selected", {
                          feeling,
                          source_screen: "home",
                        });
                        openDiscovery(feeling, "home", "feeling");
                      }}
                    >
                      {feeling}
                    </button>
                  ))}
                </div>
              </div>

              <div className="daily-resonance-wrap">
                <div
                  className="daily-resonance-actions"
                  role="group"
                  aria-label="Today's poem and random poem"
                >
                  <button
                    className="daily-resonance-pill daily-resonance-pill--primary"
                    type="button"
                    disabled={!poems.length}
                    aria-disabled={!poems.length || undefined}
                    title={!poems.length ? "No poems loaded in this session" : undefined}
                    aria-label={`Open today's poem: ${featuredPoem.title}`}
                    onClick={() => {
                      if (!poems.length) return;
                      openPoem({
                        poemId: featuredPoem.id,
                        previousScreen: "home",
                        sourceOrigin: "home",
                      });
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      today
                    </span>
                    Today&apos;s Poem
                  </button>
                  <button
                    className="daily-resonance-pill daily-resonance-pill--secondary"
                    type="button"
                    disabled={!poems.length}
                    aria-disabled={!poems.length || undefined}
                    title={!poems.length ? "No poems loaded in this session" : undefined}
                    aria-label="Open a random poem from the archive"
                    onClick={() => {
                      if (!poems.length) return;
                      openRandomPoemFromHome();
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      shuffle
                    </span>
                    Random Poem
                  </button>
                </div>
              </div>
            </div>

          </section>

          <div className="home-mid-stack">
            <section className="poet-feature" aria-labelledby="poet-week-heading">
              <h2 id="poet-week-heading" className="poet-feature__badge">
                Poet of the week
              </h2>
              <div className="poet-feature__content">
                <div className="poet-feature__avatar">
                  <img
                    src={poetOfWeek?.image}
                    alt={`Portrait of ${poetOfWeek?.name}`}
                    loading="lazy"
                  />
                </div>
                <div className="poet-feature__text">
                  <h3>{poetOfWeek?.name}</h3>
                  <p>"{poetOfWeek?.quote}"</p>
                </div>
              </div>
            </section>

            <section className="feature-stack" aria-labelledby="home-featured-heading">
              <div className="feature-stack__layer feature-stack__layer--back"></div>
              <div className="feature-stack__layer feature-stack__layer--mid"></div>

              <article className="feature-card-main">
                <div className="feature-card-main__badge">
                  <span className="material-symbols-outlined">auto_awesome</span>
                  <span>4m read</span>
                </div>

                <div className="feature-card-main__content">
                  <h2 id="home-featured-heading" className="feature-card-main__heading">
                    Today&rsquo;s poem
                  </h2>
                  <div className="feature-card-main__icon">
                    <span className="material-symbols-outlined">cloud</span>
                  </div>

                  <div className="feature-card-main__copy">
                    <h3>{featuredPoem.title}</h3>
                    <p className="feature-card-main__author">{featuredPoem.translator}</p>
                    <p className="feature-card-main__excerpt">
                      "{featuredPoem.subtitle}"
                    </p>
                  </div>
                </div>

                <div className="feature-card-main__footer">
                  <div
                    className={`poet-avatar${featuredPoemAvatarPlaceholder ? " poet-avatar--initials" : ""}`}
                    role={featuredPoemAvatarPlaceholder ? "img" : undefined}
                    aria-label={
                      featuredPoemAvatarPlaceholder
                        ? `${featuredPoem.author ?? "Poet"} (initials)` 
                        : undefined
                    }
                  >
                    {featuredPoemAvatarPlaceholder ? (
                      <span className="poet-avatar__initials" aria-hidden="true">
                        {featuredPoemInitials}
                      </span>
                    ) : (
                      <img
                        src={featuredPortraitSrc}
                        alt={`Portrait of ${featuredPoem.author}`}
                        loading="lazy"
                        onError={() => setFeaturedPortraitFailed(true)}
                      />
                    )}
                  </div>

                  <button
                    className="excerpt-link"
                    type="button"
                    aria-label={`Read featured poem: ${featuredPoem.title}`}
                    onClick={() =>
                      openPoem({
                        poemId: featuredPoem.id,
                        previousScreen: "home",
                        sourceOrigin: "home",
                      })
                    }
                  >
                    <span>Read Excerpt</span>
                    <span className="material-symbols-outlined">arrow_forward</span>
                  </button>
                </div>
              </article>
            </section>

            <section
              className="home-spotlight-aside"
              aria-labelledby={
                newsletterSpotlightHeadSuccess ? "home-spotlight-success" : "home-spotlight-heading home-spotlight-title"
              }
            >
              <div
                className={
                  "home-spotlight-aside__head" +
                  (newsletterSpotlightHeadSuccess ? " home-spotlight-aside__head--success" : "")
                }
              >
                <div
                  className="home-spotlight-aside__head-pair"
                  aria-hidden={newsletterSpotlightHeadSuccess}
                >
                  <h2 id="home-spotlight-heading" className="poet-feature__badge">
                    Newsletter
                  </h2>
                  <h3 id="home-spotlight-title" className="newsletter-form__title">
                    {NEWSLETTER_SPOTLIGHT_HEADLINE}
                  </h3>
                </div>
                <p
                  id="home-spotlight-success"
                  className="home-spotlight-aside__head-success"
                  role="status"
                  aria-live="polite"
                >
                  You&rsquo;re in. A poem finds you soon.
                </p>
              </div>
              <div className="home-spotlight-aside__body">
                <NewsletterForm
                  variant="spotlight"
                  surface="home_spotlight"
                  className="home-spotlight-aside__text"
                  omitSpotlightHeadline
                  onSpotlightHeadSuccess={() => setNewsletterSpotlightHeadSuccess(true)}
                />
              </div>
            </section>
          </div>

          <section className="home-intro home-intro--between-sections" aria-label="Homepage introduction">
            <h1>Curated poetry for how you feel</h1>
            <p className="home-intro__lead">
              Versery is a calm place to read poems online: follow a mood, follow a voice, or open a themed archive.
            </p>
          </section>

          <section className="collections-section" aria-label="Curated collections">
            <div className="section-header">
              <div>
                <p className="section-label">Archives</p>
                <h2>Curated Collections</h2>
              </div>

              <button
                className="section-link inline-action"
                type="button"
                aria-label="View all curated collections"
                onClick={() => {
                  trackEvent("collections_view_all_clicked", { source_screen: "home" });
                  setScreen("collections");
                }}
              >
                View All
              </button>
            </div>

            <div className="collection-grid">
              {curatedCollections.slice(0, 3).map((collection, index) => (
                <button
                  key={collection.id}
                  className={`collections-archive-card home-collection-card${
                    index === 2 ? " home-collection-card--wide" : ""
                  }${collection.homeShelf ? " home-collection-card--shelf" : ""}${
                    collection.image ? " collections-archive-card--image" : ""
                  }${collection.tone ? ` collections-archive-card--${collection.tone}` : ""}`}
                  type="button"
                  onClick={() => openCollection(collection.id, "home")}
                >
                  {collection.image ? (
                    <div className="collections-archive-card__media">
                      <img src={collectionImages[collection.id] || collection.image} alt={collection.title} loading="lazy" />
                    </div>
                  ) : (
                    <div className="collections-archive-card__media collections-archive-card__media--plain" aria-hidden="true"></div>
                  )}

                  <div className="collections-archive-card__body">
                    <span
                      className={
                        collection.homeShelf ? "collections-archive-card__label--shelf-gold" : undefined
                      }
                    >
                      {collection.label}
                    </span>
                    <h3>{collection.title}</h3>
                    <p>{collection.archiveDescription ?? collection.description}</p>
                    <strong>{collection.count}</strong>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="home-faq" aria-labelledby="home-faq-heading">
            <h2 id="home-faq-heading" className="home-faq__title">
              Quick answers
            </h2>
            <p className="home-faq__intro">
              A few things readers often ask before settling in.
            </p>
            <div className="home-faq__list">
              {HOME_FAQ_ITEMS.map((item) => (
                <details
                  key={item.question}
                  className="home-faq__item"
                  onClick={handleHomeFaqDetailsClick}
                >
                  <summary>
                    <span className="home-faq__summary-text">{item.question}</span>
                    <span className="home-faq__disclosure" aria-hidden="true">
                      <span className="home-faq__disclosure-glyph home-faq__disclosure-glyph--plus">+</span>
                      <span className="home-faq__disclosure-glyph home-faq__disclosure-glyph--minus">−</span>
                    </span>
                  </summary>
                  <p className="home-faq__answer">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        </main>
      )}

      <nav className={`bottom-nav${showBottomNav ? " is-visible" : " is-hidden"}`} aria-label="Primary">
        <div className="bottom-nav__inner">
          <a
            className={`bottom-nav__item${navState === "home" ? " is-active" : ""}`}
            href={pathFromVerserySnapshot({ screen: "home" })}
            aria-label="Home — daily poem and moods"
            aria-current={navState === "home" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              trackEvent("bottom_nav_clicked", { target_screen: "home" });
              setScreen("home");
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              home
            </span>
          </a>
          <a
            className={`bottom-nav__item${navState === "compass" ? " is-active" : ""}`}
            href={pathFromVerserySnapshot({ screen: "compass" })}
            aria-label="Emotional compass — browse by portal"
            aria-current={navState === "compass" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              trackEvent("bottom_nav_clicked", { target_screen: "compass" });
              setScreen("compass");
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              explore
            </span>
          </a>
          <a
            className={`bottom-nav__item${navState === "voices" || navState === "voiceDetail" ? " is-active" : ""}`}
            href={pathFromVerserySnapshot({ screen: "voices" })}
            aria-label="Poet library — voices and bios"
            aria-current={navState === "voices" || navState === "voiceDetail" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              trackEvent("bottom_nav_clicked", { target_screen: "voices" });
              setScreen("voices");
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              menu_book
            </span>
          </a>
          <a
            className={`bottom-nav__item${
              navState === "collections" || navState === "collectionDetail" ? " is-active" : ""
            }`}
            href={pathFromVerserySnapshot({ screen: "collections" })}
            aria-label="Curated collections archive"
            aria-current={navState === "collections" || navState === "collectionDetail" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              trackEvent("bottom_nav_clicked", { target_screen: "collections" });
              setScreen("collections");
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              collections_bookmark
            </span>
          </a>
        </div>
      </nav>

    </div>
  );
}
