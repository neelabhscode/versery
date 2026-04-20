import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import html2canvas from "html2canvas";
import { portalTagsForTopRankedMood } from "./lib/moods.js";
import { buildShareGradientFromAccent, tagPastelHex, TAG_PASTEL_HEX } from "./lib/tag-pastels.js";
import { filterByPortal, filterByPortals, filterByPoet } from "./lib/search.js";
import { captureFirstTouchAttribution, trackEvent } from "./lib/analytics.js";
import { poetInitialsFromAuthor, poetPortraitUrl } from "./lib/poet-portraits.js";
import { CollectionCoverImg, PoetPortraitImg } from "./lib/responsive-public-images.jsx";
import { applyTheme, readStoredTheme, subscribeThemeStorage, THEME_LIGHT_ONLY } from "./lib/theme.js";
import { NewsletterForm } from "./components/NewsletterForm.jsx";
import { InstallAppButton } from "./components/InstallAppButton.jsx";
import { PoemSubscribeDialog } from "./components/PoemSubscribeDialog.jsx";
import { ArcCarousel, ArcCarouselStaticCard } from "./components/ArcCarousel";
import ZAxisTransition from "./components/ZAxisTransition";

const DEFAULT_META_DESCRIPTION =
  "Read poetry online by mood, poet, or theme—without noisy feeds. Versery is a calm reader for daily picks, archives, and slow discovery.";

const DEFAULT_OG_DESCRIPTION =
  "Read poetry online by mood, poet, or theme—without noisy feeds. Daily picks, archives, and calm discovery.";

const DEFAULT_TWITTER_DESCRIPTION =
  "Poetry by mood, poet, or theme—daily picks and themed archives in a quiet reader.";

const DEFAULT_DOCUMENT_TITLE = "Versery — Curated poetry for quiet reading";

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

const prefetchedVerseryPaths = new Set();

/** Predictive prefetch for bottom-nav targets (wiki: prefetch-use-selectively). */
function prefetchVerseryPath(href) {
  if (!href || typeof href !== "string" || href === "/" || prefetchedVerseryPaths.has(href)) return;
  prefetchedVerseryPaths.add(href);
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = href;
  document.head.appendChild(link);
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

/** Home-only FAQ: HTML mirror + injected FAQPage JSON-LD must stay in sync. */
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

const feelings = ["Melancholic", "Ethereal", "Radiant", "Solitary", "Calm", "Pulse"];

const POEM_AUDIO_TRACKS = {
  "rudyard-kipling--if": {
    sources: ["/audio/if-ai-reading.wav", "/Generated Audio April 16, 2026 - 7_05PM.wav"],
    lineStartTimes: [
      0,
      8,
      16,
      21,
      25,
      30,
      37,
      43,
      48,
      52,
      56,
      66,
      73,
      82,
      90,
      98,
      105,
      115,
      125,
      132,
      136,
      138,
    ],
  },
  "robert-frost--the-road-not-taken": {
    sources: ["/audio/roadnot-ai-reading.wav"],
  },
  "robert-frost--stopping-by-woods-on-snowy-evening": {
    sources: ["/audio/snowy-ai-reading.wav"],
  },
  "emily-dickinson--hope-is-the-thing-with-feathers": {
    sources: ["/audio/hopefeather-ai-reading.wav"],
  },
  "emily-dickinson--because-i-could-not-stop-for-death": {
    sources: ["/audio/deathemily-ai-reading.wav"],
  },
  "kahlil-gibran--on-children": {
    sources: ["/audio/onchildren-ai-reading.wav"],
  },
  "john-keats--bright-star": {
    sources: ["/audio/brightstar-ai-reading.wav"],
  },
  "rudyard-kipling--the-way-through-the-woods": {
    sources: ["/audio/throughwoods-ai-reading.wav"],
  },
  "bhagavad-gita--endurance-doctrine": {
    sources: ["/audio/edurancegita-ai-reading.wav"],
  },
  "bhagavad-gita--from-reaction-to-ruin": {
    sources: ["/audio/reactiontoruin-ai-reading.wav"],
  },
};

const AUDIO_WAVE_BARS = 36;

function tokenizePoemLine(lineText, lineKey) {
  const text = String(lineText ?? "");
  const chunks = text.match(/\S+\s*/g) ?? [text];
  return chunks.map((chunk, index) => {
    const trimmed = chunk.trim();
    return {
      id: `${lineKey}-${index}`,
      text: trimmed,
      trailing: chunk.slice(trimmed.length),
      pronounceable: /[A-Za-z0-9]/.test(trimmed),
    };
  });
}

const DAILY_HOME_DATA = import.meta.glob("./data/daily/day-*.json", {
  eager: true,
  import: "default",
});

const DAILY_HOME_DATA_BY_KEY = Object.fromEntries(
  Object.entries(DAILY_HOME_DATA).map(([path, data]) => {
    const match = path.match(/day-(\d{2})\.json$/);
    return [match ? `day-${match[1]}` : path, data];
  }),
);

const COLLECTION_IMAGE_ASSETS = import.meta.glob("/public/collections/*.{png,jpg,jpeg,webp,avif}", {
  eager: true,
  query: "?url",
  import: "default",
});

const COLLECTION_IMAGE_POOL = Object.values(COLLECTION_IMAGE_ASSETS)
  .filter((value) => typeof value === "string" && value.length > 0)
  .map((value) => value.replace(/\?url$/, ""))
  // Exclude low-res derivatives from random assignment; cards should always start from base assets.
  .filter((value) => !/-1x\.(webp|avif|png|jpe?g)$/i.test(value));

function getDayFile(launchDate = "2026-04-14") {
  const launch = new Date(launchDate);
  const today = new Date();
  const launchMidnight = new Date(launch.getFullYear(), launch.getMonth(), launch.getDate());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.max(
    0,
    Math.floor((todayMidnight.getTime() - launchMidnight.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const dayIndex = (diffDays % 15) + 1;
  return `day-${String(dayIndex).padStart(2, "0")}`;
}

function readDailyHomeData() {
  const key = getDayFile();
  const selected = DAILY_HOME_DATA_BY_KEY[key];
  if (selected && Array.isArray(selected.heroPoems) && Array.isArray(selected.collections)) {
    return selected;
  }
  return DAILY_HOME_DATA_BY_KEY["day-01"] ?? { date: "day-01", heroPoems: [], collections: [] };
}

const CAROUSEL_CARD_COLORS = [
  "rgba(147, 197, 253, 0.7)",
  "rgba(110, 231, 183, 0.7)",
  "rgba(251, 191, 36, 0.6)",
  "rgba(196, 181, 253, 0.68)",
  "rgba(251, 146, 60, 0.65)",
  "rgba(244, 114, 182, 0.62)",
  "rgba(52, 211, 153, 0.64)",
  "rgba(125, 211, 252, 0.66)",
  "rgba(253, 186, 116, 0.63)",
  "rgba(165, 180, 252, 0.67)",
  "rgba(248, 180, 207, 0.66)",
  "rgba(186, 230, 253, 0.68)",
];

const CAROUSEL_MOOD_ICON_BY_TAG = {
  Calm: "waves",
  Pulse: "bolt",
  Focus: "lens_blur",
  Warmth: "light_mode",
  Static: "grain",
  Lush: "eco",
  Drift: "flare",
  Echo: "graphic_eq",
  Melancholic: "cloud",
  Ethereal: "auto_awesome",
  Radiant: "light_mode",
  Solitary: "grain",
};

const CAROUSEL_SAFE_ICONS = [
  "waves",
  "bolt",
  "lens_blur",
  "light_mode",
  "grain",
  "eco",
  "flare",
  "graphic_eq",
  "auto_awesome",
  "cloud",
  "format_quote",
  "ink_highlighter",
];

const CAROUSEL_ICON_BY_POEM_ID = {
  "rudyard-kipling--if": "bolt",
  "robert-frost--the-road-not-taken": "flare",
  "robert-frost--stopping-by-woods-on-snowy-evening": "cloud",
  "emily-dickinson--because-i-could-not-stop-for-death": "grain",
  "emily-dickinson--hope-is-the-thing-with-feathers": "auto_awesome",
  "rudyard-kipling--the-way-through-the-woods": "eco",
  "kahlil-gibran--on-children": "light_mode",
  "john-keats--bright-star": "light_mode",
  "bhagavad-gita--endurance-doctrine": "waves",
  "bhagavad-gita--from-reaction-to-ruin": "graphic_eq",
};

const CAROUSEL_ICON_FALLBACKS_BY_ICON = {
  bolt: ["flare", "lens_blur", "waves", "auto_awesome"],
  flare: ["lens_blur", "cloud", "auto_awesome", "waves"],
  cloud: ["grain", "waves", "auto_awesome", "flare"],
  grain: ["lens_blur", "cloud", "waves", "ink_highlighter"],
  auto_awesome: ["flare", "light_mode", "cloud", "eco"],
  eco: ["waves", "cloud", "grain", "light_mode"],
  light_mode: ["auto_awesome", "flare", "format_quote", "eco"],
  waves: ["lens_blur", "grain", "eco", "graphic_eq"],
  graphic_eq: ["bolt", "waves", "lens_blur", "ink_highlighter"],
  lens_blur: ["waves", "grain", "flare", "graphic_eq"],
  format_quote: ["ink_highlighter", "light_mode", "auto_awesome", "cloud"],
  ink_highlighter: ["format_quote", "lens_blur", "grain", "graphic_eq"],
};

const LOCKED_CAROUSEL_START_DATE = "2026-04-17";
const LOCKED_CAROUSEL_DURATION_DAYS = 15;
const LOCKED_CAROUSEL_POEM_IDS = [
  "rudyard-kipling--if",
  "robert-frost--the-road-not-taken",
  "robert-frost--stopping-by-woods-on-snowy-evening",
  "emily-dickinson--because-i-could-not-stop-for-death",
  "emily-dickinson--hope-is-the-thing-with-feathers",
  "rudyard-kipling--the-way-through-the-woods",
  "kahlil-gibran--on-children",
  "john-keats--bright-star",
  "bhagavad-gita--endurance-doctrine",
  "bhagavad-gita--from-reaction-to-ruin",
];

function isLockedCarouselActive(today = new Date()) {
  const start = new Date(LOCKED_CAROUSEL_START_DATE);
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((todayMidnight.getTime() - startMidnight.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays < LOCKED_CAROUSEL_DURATION_DAYS;
}

function resolveCarouselMoodIcon(poem) {
  if (!poem || typeof poem !== "object") return "auto_awesome";
  if (typeof poem.id === "string" && CAROUSEL_ICON_BY_POEM_ID[poem.id]) {
    return CAROUSEL_ICON_BY_POEM_ID[poem.id];
  }
  const tags = Array.isArray(poem.portalTags) ? poem.portalTags : [];
  for (const tag of tags) {
    if (CAROUSEL_MOOD_ICON_BY_TAG[tag]) return CAROUSEL_MOOD_ICON_BY_TAG[tag];
  }
  const moods = Array.isArray(poem.moods) ? poem.moods : [];
  for (const mood of moods) {
    if (CAROUSEL_MOOD_ICON_BY_TAG[mood]) return CAROUSEL_MOOD_ICON_BY_TAG[mood];
  }
  if (typeof poem.mood_chip === "string" && CAROUSEL_MOOD_ICON_BY_TAG[poem.mood_chip]) {
    return CAROUSEL_MOOD_ICON_BY_TAG[poem.mood_chip];
  }
  return "auto_awesome";
}

function carouselIconCandidatesForPoem(poem) {
  const primary = resolveCarouselMoodIcon(poem);
  const candidates = [primary, ...(CAROUSEL_ICON_FALLBACKS_BY_ICON[primary] ?? []), ...CAROUSEL_SAFE_ICONS];
  return [...new Set(candidates)].filter((icon) => CAROUSEL_SAFE_ICONS.includes(icon));
}

function topSixPoemLines(poem) {
  if (!poem || typeof poem !== "object") return "";
  const lines = Array.isArray(poem.lines) ? poem.lines : [];
  const cleaned = lines.map((line) => (typeof line === "string" ? line.trim() : "")).filter(Boolean);
  if (cleaned.length) return cleaned.slice(0, 6).join("\n");
  if (typeof poem.excerpt === "string" && poem.excerpt.trim()) return poem.excerpt.trim();
  return "";
}

function firstStanza(poem) {
  if (!poem || typeof poem !== "object") return "";
  const lines = Array.isArray(poem.lines) ? poem.lines : [];
  const cleaned = lines.map((line) => (typeof line === "string" ? line.trim() : ""));
  const stanza = [];
  for (const line of cleaned) {
    if (!line) {
      if (stanza.length) break;
      continue;
    }
    stanza.push(line);
    if (stanza.length >= 4) break;
  }
  if (stanza.length) return stanza.join(" ");
  if (typeof poem.excerpt === "string" && poem.excerpt.trim()) return poem.excerpt.trim();
  return "";
}

function cleanupTaglinePhrase(text) {
  return String(text ?? "")
    .replace(/["'`]/g, "")
    .replace(/[.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizePoemIdentity(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isIfByRudyardKipling(poemLike) {
  if (!poemLike || typeof poemLike !== "object") return false;
  const title = normalizePoemIdentity(poemLike.title);
  const author = normalizePoemIdentity(poemLike.author ?? poemLike.poet);
  return title === "if" && author === "rudyardkipling";
}

function isRoadNotTakenByRobertFrost(poemLike) {
  if (!poemLike || typeof poemLike !== "object") return false;
  const title = normalizePoemIdentity(poemLike.title);
  const author = normalizePoemIdentity(poemLike.author ?? poemLike.poet);
  return title === "theroadnottaken" && author === "robertfrost";
}

function isStoppingByWoodsByRobertFrost(poemLike) {
  if (!poemLike || typeof poemLike !== "object") return false;
  const title = normalizePoemIdentity(poemLike.title);
  const author = normalizePoemIdentity(poemLike.author ?? poemLike.poet);
  return title === "stoppingbywoodsonsnowyevening" && author === "robertfrost";
}

function findIfByRudyardKipling(poems) {
  if (!Array.isArray(poems)) return null;
  return poems.find((poem) => isIfByRudyardKipling(poem)) ?? null;
}

function findRoadNotTakenByRobertFrost(poems) {
  if (!Array.isArray(poems)) return null;
  return poems.find((poem) => isRoadNotTakenByRobertFrost(poem)) ?? null;
}

function findStoppingByWoodsByRobertFrost(poems) {
  if (!Array.isArray(poems)) return null;
  return poems.find((poem) => isStoppingByWoodsByRobertFrost(poem)) ?? null;
}

function ensureRequiredPoems(chosenPoems, requiredPoems, maxCards = 10) {
  const chosen = Array.isArray(chosenPoems) ? [...chosenPoems] : [];
  const required = (Array.isArray(requiredPoems) ? requiredPoems : []).filter(Boolean);
  if (!required.length) return chosen.slice(0, maxCards);

  const requiredIds = new Set(required.map((poem) => poem.id).filter(Boolean));
  const chosenIds = new Set(chosen.map((poem) => poem?.id).filter(Boolean));

  for (const poem of required) {
    if (!poem?.id || chosenIds.has(poem.id)) continue;
    if (chosen.length < maxCards) {
      chosen.push(poem);
      chosenIds.add(poem.id);
      continue;
    }

    const replaceIndex = chosen
      .map((entry, index) => ({ entry, index }))
      .reverse()
      .find(({ entry }) => !requiredIds.has(entry?.id))?.index;

    if (typeof replaceIndex === "number") {
      chosenIds.delete(chosen[replaceIndex]?.id);
      chosen[replaceIndex] = poem;
      chosenIds.add(poem.id);
    }
  }

  return chosen.slice(0, maxCards);
}

function ensureRequiredHeroPoems(curatedHeroes, requiredHeroEntries, maxCards = 10) {
  const heroes = Array.isArray(curatedHeroes) ? [...curatedHeroes] : [];
  const required = (Array.isArray(requiredHeroEntries) ? requiredHeroEntries : []).filter(Boolean);
  if (!required.length) return heroes.slice(0, maxCards);

  const identityKey = (poemLike) =>
    `${normalizePoemIdentity(poemLike?.title)}::${normalizePoemIdentity(poemLike?.poet ?? poemLike?.author)}`;

  const requiredKeys = new Set(required.map(identityKey).filter(Boolean));
  const heroKeys = new Set(heroes.map(identityKey).filter(Boolean));

  for (const requiredHero of required) {
    const key = identityKey(requiredHero);
    if (!key || heroKeys.has(key)) continue;

    if (heroes.length < maxCards) {
      heroes.push(requiredHero);
      heroKeys.add(key);
      continue;
    }

    const replaceIndex = heroes
      .map((entry, index) => ({ entry, index }))
      .reverse()
      .find(({ entry }) => !requiredKeys.has(identityKey(entry)))?.index;

    if (typeof replaceIndex === "number") {
      heroKeys.delete(identityKey(heroes[replaceIndex]));
      heroes[replaceIndex] = requiredHero;
      heroKeys.add(key);
    }
  }

  return heroes.slice(0, maxCards);
}

function taglineFromPoem(poem) {
  const title = cleanupTaglinePhrase(poem?.title);
  const poet = cleanupTaglinePhrase(poem?.author ?? poem?.poet);
  const stanza = cleanupTaglinePhrase(firstStanza(poem));
  const firstLine = cleanupTaglinePhrase(
    Array.isArray(poem?.lines) && poem.lines.length ? poem.lines[0] : ""
  );

  const stanzaWords = stanza.split(" ").filter(Boolean);
  const lineWords = firstLine.split(" ").filter(Boolean);

  const candidates = [
    stanzaWords.slice(0, 4).join(" "),
    lineWords.slice(0, 4).join(" "),
    title.split(" ").slice(0, 3).join(" "),
    poet ? `${poet.split(" ")[0]} at dusk` : "",
    "the hush before sleep",
  ]
    .map((phrase) => cleanupTaglinePhrase(phrase))
    .filter(Boolean);

  const phrase = candidates.find(Boolean) ?? "the hush before sleep";
  const words = phrase.split(" ").filter(Boolean).slice(0, 6);
  return `For ${words.join(" ")}`.trim();
}

function normalizeCarouselAuthor(poem) {
  if (!poem || typeof poem !== "object") return "unknown";
  const raw = (poem.author ?? poem.poet ?? poem.poetName ?? "").toString().trim().toLowerCase();
  return raw || "unknown";
}

function reorderPoemsToAvoidAdjacentAuthors(poems) {
  if (!Array.isArray(poems) || poems.length <= 1) return poems ?? [];
  const byAuthor = new Map();
  for (const poem of poems) {
    const key = normalizeCarouselAuthor(poem);
    if (!byAuthor.has(key)) byAuthor.set(key, []);
    byAuthor.get(key).push(poem);
  }

  const ordered = [];
  let previousAuthor = null;

  while (ordered.length < poems.length) {
    const availableAuthors = [...byAuthor.entries()]
      .filter(([, bucket]) => bucket.length > 0)
      .sort((a, b) => b[1].length - a[1].length);
    if (!availableAuthors.length) break;

    let selected = availableAuthors.find(([author]) => author !== previousAuthor);
    if (!selected) selected = availableAuthors[0];

    const [selectedAuthor, bucket] = selected;
    const nextPoem = bucket.shift();
    if (!nextPoem) break;
    ordered.push(nextPoem);
    previousAuthor = selectedAuthor;
  }

  return ordered;
}

function mapPoemsToCarouselCards(poems) {
  const usedIcons = new Set();
  return poems.map((poem, index) => {
    const poemAudioTrack = POEM_AUDIO_TRACKS[poem.id] ?? null;
    const candidates = carouselIconCandidatesForPoem(poem);
    const moodIcon = candidates.find((icon) => !usedIcons.has(icon)) ?? candidates[0] ?? "auto_awesome";
    usedIcons.add(moodIcon);

    return {
      id: index + 1,
      poemId: poem.id,
      title: poem.title ?? "Untitled",
      author: poem.author ?? "Unknown",
      content: topSixPoemLines(poem),
      fullLines: Array.isArray(poem.lines) ? poem.lines.filter((line) => typeof line === "string") : [],
      audioSources: poemAudioTrack?.sources ?? [],
      lineStartTimes: poemAudioTrack?.lineStartTimes ?? [],
      tagline: taglineFromPoem(poem),
      moodIcon,
      color: CAROUSEL_CARD_COLORS[index % CAROUSEL_CARD_COLORS.length],
    };
  });
}

function buildLockedCarouselCards(poems, maxCards = 10) {
  if (!Array.isArray(poems) || !poems.length) return [];
  const poemById = new Map(poems.map((poem) => [poem.id, poem]));
  const lockedPoems = LOCKED_CAROUSEL_POEM_IDS
    .map((poemId) => poemById.get(poemId))
    .filter(Boolean)
    .slice(0, maxCards);
  return mapPoemsToCarouselCards(reorderPoemsToAvoidAdjacentAuthors(lockedPoems));
}

function relatabilityScoreFor2026(poem) {
  if (!poem || typeof poem !== "object") return -Infinity;

  const title = typeof poem.title === "string" ? poem.title.toLowerCase() : "";
  const excerpt = typeof poem.excerpt === "string" ? poem.excerpt.toLowerCase() : "";
  const subtitle = typeof poem.subtitle === "string" ? poem.subtitle.toLowerCase() : "";
  const tags = Array.isArray(poem.portalTags) ? poem.portalTags.map((t) => String(t).toLowerCase()) : [];
  const moods = Array.isArray(poem.moods) ? poem.moods.map((t) => String(t).toLowerCase()) : [];
  const lines = Array.isArray(poem.lines)
    ? poem.lines.map((line) => (typeof line === "string" ? line.toLowerCase() : "")).filter(Boolean)
    : [];
  const textBlob = [title, excerpt, subtitle, tags.join(" "), moods.join(" "), lines.join(" ")].join(" ");

  // Emotional + contemporary-life resonance cues for readers in their 20s/30s.
  const weightedKeywords = [
    ["anxiety", 2.4], ["lonely", 2.2], ["alone", 1.7], ["belong", 1.5], ["identity", 1.6],
    ["work", 1.2], ["job", 1.1], ["burnout", 2.3], ["tired", 1.4], ["hope", 1.3],
    ["love", 1.2], ["heart", 1.0], ["home", 1.2], ["healing", 1.6], ["grief", 1.7],
    ["change", 1.2], ["future", 1.1], ["self", 1.0], ["quiet", 1.0], ["city", 1.0],
    ["night", 0.8], ["distance", 1.0], ["memory", 1.1], ["body", 1.0], ["friend", 0.9],
  ];

  let score = 0;
  for (const [keyword, weight] of weightedKeywords) {
    if (textBlob.includes(keyword)) score += weight;
  }

  // Favor concise card-friendly poems so top-six lines feel complete.
  const lineCount = lines.length;
  if (lineCount >= 4 && lineCount <= 18) score += 1.2;
  else if (lineCount >= 2 && lineCount <= 28) score += 0.6;
  else if (lineCount > 40) score -= 0.4;

  // Light boost for already curated poems.
  if (poem.poemOfDay === true) score += 1.3;

  return score;
}

function buildTopCarouselCards(poems, maxCards = 10) {
  if (!Array.isArray(poems) || !poems.length) return [];

  const uniquePoems = [];
  const seenPoemIds = new Set();
  for (const poem of poems) {
    if (!poem || !poem.id || seenPoemIds.has(poem.id)) continue;
    seenPoemIds.add(poem.id);
    uniquePoems.push(poem);
  }

  const ranked = uniquePoems
    .map((poem) => ({ poem, score: relatabilityScoreFor2026(poem) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.poem);

  // Diversity guardrail: no poet should dominate the 10-card rail.
  const chosen = [];
  const authorCounts = new Map();
  const maxPerAuthor = 2;

  for (const poem of ranked) {
    if (chosen.length >= maxCards) break;
    const authorKey = normalizeCarouselAuthor(poem);
    const count = authorCounts.get(authorKey) ?? 0;
    if (count >= maxPerAuthor) continue;
    chosen.push(poem);
    authorCounts.set(authorKey, count + 1);
  }

  // Fill any remaining slots from ranked list if data is too author-concentrated.
  if (chosen.length < maxCards) {
    for (const poem of ranked) {
      if (chosen.length >= maxCards) break;
      if (!chosen.includes(poem)) chosen.push(poem);
    }
  }

  const ifPoem = findIfByRudyardKipling(uniquePoems);
  const roadNotTakenPoem = findRoadNotTakenByRobertFrost(uniquePoems);
  const stoppingByWoodsPoem = findStoppingByWoodsByRobertFrost(uniquePoems);
  const mustIncludePoems = [ifPoem, roadNotTakenPoem, stoppingByWoodsPoem].filter(Boolean);
  const finalChosen = ensureRequiredPoems(chosen, mustIncludePoems, maxCards);
  const reordered = reorderPoemsToAvoidAdjacentAuthors(finalChosen);

  return mapPoemsToCarouselCards(reordered);
}

function buildTopCarouselCardsFromDaily(dailyHeroPoems, allPoems) {
  if (!Array.isArray(dailyHeroPoems) || !dailyHeroPoems.length) return [];

  const poemLookup = new Map();
  for (const poem of allPoems ?? []) {
    const key = `${String(poem.title ?? "").toLowerCase()}::${String(poem.author ?? "").toLowerCase()}`;
    if (!poemLookup.has(key)) poemLookup.set(key, poem);
  }

  const curatedHeroes = dailyHeroPoems.slice(0, 10);
  const ifPoem = findIfByRudyardKipling(allPoems ?? []);
  const roadNotTakenPoem = findRoadNotTakenByRobertFrost(allPoems ?? []);
  const stoppingByWoodsPoem = findStoppingByWoodsByRobertFrost(allPoems ?? []);

  const requiredHeroEntries = [
    ifPoem
      ? {
          title: ifPoem.title,
          poet: ifPoem.author,
          firstStanza: topSixPoemLines(ifPoem),
          tagline: taglineFromPoem(ifPoem),
        }
      : null,
    roadNotTakenPoem
      ? {
          title: roadNotTakenPoem.title,
          poet: roadNotTakenPoem.author,
          firstStanza: topSixPoemLines(roadNotTakenPoem),
          tagline: taglineFromPoem(roadNotTakenPoem),
        }
      : null,
    stoppingByWoodsPoem
      ? {
          title: stoppingByWoodsPoem.title,
          poet: stoppingByWoodsPoem.author,
          firstStanza: topSixPoemLines(stoppingByWoodsPoem),
          tagline: taglineFromPoem(stoppingByWoodsPoem),
        }
      : null,
  ].filter(Boolean);

  const finalCuratedHeroes = reorderPoemsToAvoidAdjacentAuthors(
    ensureRequiredHeroPoems(curatedHeroes, requiredHeroEntries, 10),
  );

  return finalCuratedHeroes.map((heroPoem, index) => {
    const key = `${String(heroPoem.title ?? "").toLowerCase()}::${String(heroPoem.poet ?? "").toLowerCase()}`;
    const matchedPoem =
      poemLookup.get(key) ??
      (isIfByRudyardKipling(heroPoem) ? ifPoem : null) ??
      (isRoadNotTakenByRobertFrost(heroPoem) ? roadNotTakenPoem : null) ??
      (isStoppingByWoodsByRobertFrost(heroPoem) ? stoppingByWoodsPoem : null);
    const poemAudioTrack = matchedPoem?.id ? POEM_AUDIO_TRACKS[matchedPoem.id] ?? null : null;
    const content =
      typeof heroPoem.firstStanza === "string" && heroPoem.firstStanza.trim()
        ? heroPoem.firstStanza
        : topSixPoemLines(matchedPoem);

    return {
      id: index + 1,
      poemId: matchedPoem?.id,
      title: heroPoem.title ?? matchedPoem?.title ?? "Untitled",
      author: heroPoem.poet ?? matchedPoem?.author ?? "Unknown",
      content,
      fullLines: Array.isArray(matchedPoem?.lines) ? matchedPoem.lines.filter((line) => typeof line === "string") : [],
      audioSources: poemAudioTrack?.sources ?? [],
      lineStartTimes: poemAudioTrack?.lineStartTimes ?? [],
      tagline: heroPoem.tagline ?? taglineFromPoem(matchedPoem),
      moodIcon: resolveCarouselMoodIcon(matchedPoem),
      color: CAROUSEL_CARD_COLORS[index % CAROUSEL_CARD_COLORS.length],
    };
  });
}

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
    image: "/collections/romantics.webp",
    artwork: "/collections/romantics.webp",
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
    image: "/collections/mystics.webp",
    artwork: "/collections/mystics.webp",
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
    image: "/collections/nature.webp",
    artwork: "/collections/nature.webp",
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
    image: "/collections/love.webp",
    artwork: "/collections/love.webp",
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
    image: "/collections/solitude.webp",
    artwork: "/collections/solitude.webp",
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
    image: "/collections/witness.webp",
    artwork: "/collections/witness.webp",
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
    image: "/collections/transcendentalists.webp",
    artwork: "/collections/transcendentalists.webp",
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
    image: "/collections/after-hours.webp",
    artwork: "/collections/after-hours.webp",
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
    cachedDate = localStorage.getItem("versery_collection_images_date_v2");
    cachedMapping = localStorage.getItem("versery_collection_images_v2");
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

  const allImages = COLLECTION_IMAGE_POOL;
  if (!allImages.length) return {};

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
    localStorage.setItem("versery_collection_images_date_v2", today);
    localStorage.setItem("versery_collection_images_v2", JSON.stringify(mapping));
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

function analyzeCollectionReadabilityMode(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve("dark");
      return;
    }
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const width = 64;
        const height = 64;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve("dark");
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const data = ctx.getImageData(0, 0, width, height).data;
        let luminanceSum = 0;
        let count = 0;
        const startY = Math.floor(height * 0.45);
        for (let y = startY; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            luminanceSum += luminance;
            count += 1;
          }
        }
        const avg = count > 0 ? luminanceSum / count : 140;
        // Bright lower zones should use dark text treatment; darker zones keep light text treatment.
        resolve(avg >= 150 ? "light" : "dark");
      } catch {
        resolve("dark");
      }
    };
    img.onerror = () => resolve("dark");
    img.src = src;
  });
}

function extractCollectionDominantBorderColor(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve("rgba(173, 179, 180, 0.55)");
      return;
    }

    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const width = 56;
        const height = 56;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve("rgba(173, 179, 180, 0.55)");
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const data = ctx.getImageData(0, 0, width, height).data;
        const bins = new Map();

        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 160) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;
          const brightness = (r + g + b) / 3;
          if (brightness < 18 || brightness > 242) continue;

          // Favor richer, more legible tones over near-gray bins.
          const weight = 1 + saturation * 1.4;
          const qr = Math.round(r / 32) * 32;
          const qg = Math.round(g / 32) * 32;
          const qb = Math.round(b / 32) * 32;
          const key = `${qr},${qg},${qb}`;
          bins.set(key, (bins.get(key) ?? 0) + weight);
        }

        if (!bins.size) {
          resolve("rgba(173, 179, 180, 0.55)");
          return;
        }

        let bestKey = "";
        let bestScore = -1;
        for (const [key, score] of bins.entries()) {
          if (score > bestScore) {
            bestKey = key;
            bestScore = score;
          }
        }

        const [rRaw, gRaw, bRaw] = bestKey.split(",").map((v) => Number.parseInt(v, 10));
        const r = clamp(Number.isFinite(rRaw) ? rRaw : 173, 28, 230);
        const g = clamp(Number.isFinite(gRaw) ? gRaw : 179, 28, 230);
        const b = clamp(Number.isFinite(bRaw) ? bRaw : 180, 28, 230);
        resolve(`rgba(${r}, ${g}, ${b}, 0.95)`);
      } catch {
        resolve("rgba(173, 179, 180, 0.55)");
      }
    };
    img.onerror = () => resolve("rgba(173, 179, 180, 0.55)");
    img.src = src;
  });
}

// Thin wrapper that handles data fetching. Renders AppLoaded once both JSON
// files are available so AppLoaded always starts with non-empty data.
export default function App() {
  const [rawPoems, setRawPoems] = useState(null);
  const [rawPoets, setRawPoets] = useState(null);
  const [rawCollections] = useState([]);
  const [dailyHomeData, setDailyHomeData] = useState(() => readDailyHomeData());
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

    setDailyHomeData(readDailyHomeData());
    Promise.all([loadJson("/poems.json"), loadJson("/poets.json")])
      .then(([poemsData, poetsData]) => {
        if (!Array.isArray(poemsData) || !Array.isArray(poetsData)) {
          setLoadError(true);
          return;
        }
        setRawPoems(poemsData);
        setRawPoets(poetsData);
        trackEvent("content_loaded", {
          poems_count: poemsData.length,
          poets_count: poetsData.length,
          collections_count: 3,
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

  return <AppLoaded poems={rawPoems} poets={rawPoets} collections={rawCollections} dailyHomeData={dailyHomeData} />;
}

function AppLoaded({ poems, poets, collections, dailyHomeData }) {
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
  const carouselCards = useMemo(() => {
    if (isLockedCarouselActive()) {
      const lockedCards = buildLockedCarouselCards(poems, 10);
      if (lockedCards.length) return lockedCards;
    }
    const cards = buildTopCarouselCardsFromDaily(dailyHomeData?.heroPoems ?? [], poems);
    return cards.length ? cards : buildTopCarouselCards(poems, 10);
  }, [dailyHomeData, poems]);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  useEffect(() => {
    if (!carouselCards.length) return;
    if (activeCarouselIndex > carouselCards.length - 1) {
      setActiveCarouselIndex(0);
    }
  }, [activeCarouselIndex, carouselCards.length]);
  const activeCarouselMoodIcon =
    carouselCards[Math.max(0, Math.min(activeCarouselIndex, carouselCards.length - 1))]?.moodIcon ??
    "auto_awesome";
  const activeCarouselIconColor =
    carouselCards[Math.max(0, Math.min(activeCarouselIndex, carouselCards.length - 1))]?.color ??
    "#8aa0a3";
  const [heroIconSwipeDirection, setHeroIconSwipeDirection] = useState(1);
  const [shouldReduceMotion, setShouldReduceMotion] = useState(false);
  const [isActiveCarouselAudioPlaying, setIsActiveCarouselAudioPlaying] = useState(false);
  const previousCarouselIndexRef = useRef(activeCarouselIndex);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setShouldReduceMotion(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (!carouselCards.length) return;
    previousCarouselIndexRef.current = Math.max(0, Math.min(previousCarouselIndexRef.current, carouselCards.length - 1));
  }, [carouselCards.length]);

  useEffect(() => {
    const totalCards = carouselCards.length;
    if (totalCards <= 1) return;
    const previousIndex = previousCarouselIndexRef.current;
    const nextIndex = Math.max(0, Math.min(activeCarouselIndex, totalCards - 1));
    if (nextIndex === previousIndex) return;
    const forwardDistance = (nextIndex - previousIndex + totalCards) % totalCards;
    const backwardDistance = (previousIndex - nextIndex + totalCards) % totalCards;
    // +1: advancing to the next card, -1: going back.
    setHeroIconSwipeDirection(forwardDistance <= backwardDistance ? 1 : -1);
    previousCarouselIndexRef.current = nextIndex;
  }, [activeCarouselIndex, carouselCards.length]);

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
            image: "/collections/karacis-studio-RYPKIJdaxUg-unsplash.webp",
            artwork: "/collections/karacis-studio-RYPKIJdaxUg-unsplash.webp",
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

    const baseCollections = annex ? [annex, ...themed] : themed;
    const dailyCollections = Array.isArray(dailyHomeData?.collections) ? dailyHomeData.collections : [];
    if (!dailyCollections.length) return baseCollections;

    const poemLookup = new Map();
    for (const poem of poems) {
      const key = `${String(poem.title ?? "").toLowerCase()}::${String(poem.author ?? "").toLowerCase()}`;
      if (!poemLookup.has(key)) poemLookup.set(key, poem);
    }

    const mappedDaily = dailyCollections.slice(0, 3).map((collection, index) => {
      const poemEntries = [];

      if (collection?.featuredPoem) {
        const featuredKey = `${String(collection.featuredPoem.title ?? "").toLowerCase()}::${String(collection.featuredPoem.poet ?? "").toLowerCase()}`;
        const featuredMatch = poemLookup.get(featuredKey);
        if (featuredMatch) {
          const voice = voices.find((v) => v.id === featuredMatch.poetId);
          poemEntries.push({
            poet: featuredMatch.author ?? collection.featuredPoem.poet,
            year: String(voice?.born ?? ""),
            title: featuredMatch.title ?? collection.featuredPoem.title,
            excerpt: featuredMatch.excerpt ?? "",
            poemId: featuredMatch.id,
          });
        }
      }

      for (const entry of collection?.poems ?? []) {
        const key = `${String(entry.title ?? "").toLowerCase()}::${String(entry.poet ?? "").toLowerCase()}`;
        const match = poemLookup.get(key);
        if (!match) continue;
        const voice = voices.find((v) => v.id === match.poetId);
        poemEntries.push({
          poet: match.author ?? entry.poet,
          year: String(voice?.born ?? ""),
          title: match.title ?? entry.title,
          excerpt: match.excerpt ?? "",
          poemId: match.id,
        });
      }

      return {
        id: `daily-${dailyHomeData?.date ?? "day-01"}-${index + 1}`,
        label: index === 0 ? "Primary Collection" : "Secondary Collection",
        title: collection?.name ?? "Untitled Collection",
        description: collection?.theme ?? "",
        archiveDescription: collection?.tagline ?? "",
        image: null,
        artwork: null,
        featured: index === 0,
        tone: "plain",
        curator: { name: "Versery", role: "Daily Curator" },
        portalTags: [],
        poems: poemEntries,
        count: `${poemEntries.length} poem${poemEntries.length === 1 ? "" : "s"}`,
        homeShelf: index > 0,
        dailyCard: true,
        dailyTagline: collection?.tagline ?? "",
        dailyFeaturedLines: collection?.featuredPoem?.firstLines ?? "",
      };
    });

    return [...mappedDaily, ...baseCollections];
  }, [poems, poets, voices, collectionTemplates, dailyHomeData]);

  const desktopCollectionLayout = useMemo(
    () => createDesktopCollectionLayout(curatedCollections),
    [curatedCollections],
  );
  const homepageCollections = useMemo(
    () => curatedCollections.filter((collection) => collection.dailyCard).slice(0, 3),
    [curatedCollections],
  );
  const homepageCollectionTransitionItems = useMemo(
    () => homepageCollections.map((collection, homeIndex) => ({ ...collection, homeIndex })),
    [homepageCollections],
  );

  // --- Helper functions (close over computed data) ---
  function getVoiceById(id) {
    return voices.find((v) => v.id === id) ?? voices[0];
  }
  function getCollectionCardImage(collection) {
    if (!collection || typeof collection !== "object") return "";
    return collectionImages[collection.id] || collection.image || collection.artwork || "";
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
  const homeReturnCarouselIndex = useMemo(() => {
    const idx = carouselCards.findIndex((card) => card.poemId === activePoemId);
    return idx >= 0 ? idx : 0;
  }, [carouselCards, activePoemId]);
  const [poemContext, setPoemContext] = useState({
    previousScreen: "home",
    sourceOrigin: "home",
    sourceVoiceId: null,
    sourceCollectionId: null,
    feeling: null,
  });
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [isHomeDesktopLayout, setIsHomeDesktopLayout] = useState(
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [voiceWorksSearchQuery, setVoiceWorksSearchQuery] = useState("");
  const [activeEraFilter, setActiveEraFilter] = useState("All Eras");
  const [collectionImages, setCollectionImages] = useState({});
  const [collectionBorderColors, setCollectionBorderColors] = useState({});
  const [collectionReadabilityModes, setCollectionReadabilityModes] = useState({});
  const [selectedPoemText, setSelectedPoemText] = useState("");
  const [selectedVisibleCharCount, setSelectedVisibleCharCount] = useState(0);
  const [shareToast, setShareToast] = useState("");
  const [isGeneratingShareCard, setIsGeneratingShareCard] = useState(false);
  const [shareCardMode, setShareCardMode] = useState("full");
  const [showShareOverflowHint, setShowShareOverflowHint] = useState(false);
  const heroSectionRef = useRef(null);
  const heroCarouselRef = useRef(null);
  const heroViewportRef = useRef(null);
  const moodBridgeRef = useRef(null);
  const collectionsBridgeRef = useRef(null);
  const collectionsPrimaryRef = useRef(null);
  const collectionsSecondaryLeftRef = useRef(null);
  const collectionsSecondaryRightRef = useRef(null);
  const shareCardRef = useRef(null);
  const poemBodyRef = useRef(null);
  const poemAudioRef = useRef(null);
  const poemWaveAnimationRef = useRef(null);
  const poemWaveAnalyserRef = useRef(null);
  const poemWaveSourceRef = useRef(null);
  const poemAudioContextRef = useRef(null);
  const skipNextFadeRef = useRef(false);
  const [isHeroCarouselExited, setIsHeroCarouselExited] = useState(false);
  const [isMoodBridgePrimed, setIsMoodBridgePrimed] = useState(false);
  const [isHeroViewportCleared, setIsHeroViewportCleared] = useState(false);
  const [hasDesktopV2SnapRun, setHasDesktopV2SnapRun] = useState(false);
  const [isMoodBridgeVisible, setIsMoodBridgeVisible] = useState(false);
  const [areMoodOptionsVisible, setAreMoodOptionsVisible] = useState(false);
  const [isV2RevealLocked, setIsV2RevealLocked] = useState(false);
  const supportsCustomHighlight =
    typeof window !== "undefined" &&
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof Highlight !== "undefined";
  const [showBottomNav, setShowBottomNav] = useState(false);
  const [pendingPoemAudioAutoplayId, setPendingPoemAudioAutoplayId] = useState(null);
  const [isPoemAudioPlaying, setIsPoemAudioPlaying] = useState(false);
  const [poemAudioCurrentTime, setPoemAudioCurrentTime] = useState(0);
  const [poemAudioDuration, setPoemAudioDuration] = useState(0);
  const [poemAudioSourceIndex, setPoemAudioSourceIndex] = useState(0);
  const [poemWaveBars, setPoemWaveBars] = useState(() => Array.from({ length: AUDIO_WAVE_BARS }, () => 0.08));
  const [isHomeCollectionTransitioning, setIsHomeCollectionTransitioning] = useState(false);
  const [isHomePoemTransitioning, setIsHomePoemTransitioning] = useState(false);
  const [homeTransitionPoemId, setHomeTransitionPoemId] = useState(null);
  const [showHomeTransitionPoemPage, setShowHomeTransitionPoemPage] = useState(false);
  const [poemSubscribeOpen, setPoemSubscribeOpen] = useState(false);
  const [newsletterSpotlightHeadSuccess, setNewsletterSpotlightHeadSuccess] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [wordmarkSecretPulse, setWordmarkSecretPulse] = useState(false);
  const [uiTheme, setUiTheme] = useState(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const lastTrackedScreenRef = useRef(null);
  const homePoemTransitionCompleteTimerRef = useRef(null);
  const homePoemTransitionPageTimerRef = useRef(null);

  useEffect(() => {
    if (!curatedCollections.length) return;
    if (curatedCollections.some((collection) => collection.id === activeCollectionId)) return;
    setActiveCollectionId(curatedCollections[0].id);
  }, [activeCollectionId, curatedCollections]);
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
    if (typeof document === "undefined" || typeof window === "undefined") return undefined;
    const root = document.documentElement;
    const setDaypart = () => {
      const hour = new Date().getHours();
      const daypart = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
      root.dataset.daypart = daypart;
    };
    setDaypart();
    const intervalId = window.setInterval(setDaypart, 60 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(min-width: 1024px)");
    const syncHomeDesktop = () => setIsHomeDesktopLayout(mq.matches);
    syncHomeDesktop();
    mq.addEventListener?.("change", syncHomeDesktop);
    return () => mq.removeEventListener?.("change", syncHomeDesktop);
  }, []);

  useEffect(() => {
    if (isHomeDesktopLayout) return undefined;
    const node = heroCarouselRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsHeroCarouselExited(entry.intersectionRatio < 0.2);
      },
      {
        threshold: [0, 0.2, 1],
        rootMargin: "0px 0px -55% 0px",
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isHomeDesktopLayout]);

  useEffect(() => {
    if (screen !== "home") return;
    // Mobile: carousel starts in view; desktop: no carousel — hero mood is primary, treat as "passed" for staging.
    setIsHeroCarouselExited(isHomeDesktopLayout);
  }, [screen, isHomeDesktopLayout]);

  useEffect(() => {
    const node = moodBridgeRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsMoodBridgePrimed(entry.isIntersecting && entry.intersectionRatio >= 0.25);
      },
      { threshold: [0, 0.25, 0.5, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [screen, isHomeDesktopLayout]);

  const renderHomeFeelingChipButtons = () =>
    feelings.map((feeling, index) => (
      <button
        key={feeling}
        className={`feeling-chip mood-transition-chip${activeFeeling === feeling ? " is-active" : ""}${
          areMoodOptionsVisible ? " is-visible" : ""
        }`}
        type="button"
        data-feeling={feeling.toLowerCase()}
        style={{ "--chip-stagger-index": index }}
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
    ));

  useEffect(() => {
    if (screen !== "home") {
      setIsHeroViewportCleared(false);
      setHasDesktopV2SnapRun(false);
      return undefined;
    }
    if (!isDesktop) {
      setIsHeroViewportCleared(true);
      setHasDesktopV2SnapRun(false);
      return undefined;
    }

    const compute = () => {
      const heroViewport = heroViewportRef.current;
      if (!heroViewport) {
        setIsHeroViewportCleared(false);
        return;
      }
      const header = document.querySelector(".top-app-bar");
      const headerHeight = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
      const rect = heroViewport.getBoundingClientRect();
      setIsHeroViewportCleared(rect.bottom <= headerHeight + 1);
    };

    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [screen, isDesktop]);

  useEffect(() => {
    if (screen !== "home" || !isDesktop || !isHeroViewportCleared || hasDesktopV2SnapRun) {
      return undefined;
    }
    const target = heroSectionRef.current;
    if (!target) return undefined;

    const header = document.querySelector(".top-app-bar");
    const headerHeight = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
    const targetTop = target.getBoundingClientRect().top + window.scrollY - headerHeight;

    setHasDesktopV2SnapRun(true);
    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth",
    });
    return undefined;
  }, [screen, isDesktop, isHeroViewportCleared, hasDesktopV2SnapRun]);

  useEffect(() => {
    if (screen !== "home") {
      setIsMoodBridgePrimed(false);
      setIsMoodBridgeVisible(false);
      setAreMoodOptionsVisible(false);
      setIsV2RevealLocked(false);
      return undefined;
    }

    // Once revealed, keep v2 stable while scrolling forward so it doesn't fade out.
    if (isMoodBridgeVisible && areMoodOptionsVisible) {
      setIsV2RevealLocked(false);
      return undefined;
    }

    const canRevealDesktop = isHomeDesktopLayout ? true : isDesktop ? isHeroViewportCleared : true;
    const shouldWaitForPrime = !isDesktop;
    const heroGateOk = isHomeDesktopLayout ? true : isHeroCarouselExited;
    if (!heroGateOk || !canRevealDesktop || (shouldWaitForPrime && !isMoodBridgePrimed)) {
      return undefined;
    }

    // Sequence: recede -> brief silence -> question -> options.
    setIsV2RevealLocked(false);
    const questionDelay = isHomeDesktopLayout ? 0 : isDesktop ? 0 : 240;
    const optionsDelay = isHomeDesktopLayout ? 80 : isDesktop ? 120 : 860;
    const unlockDelay = isHomeDesktopLayout ? 900 : isDesktop ? 1200 : 3700;
    const questionTimer = window.setTimeout(() => {
      setIsMoodBridgeVisible(true);
    }, questionDelay);

    const optionsTimer = window.setTimeout(() => {
      setAreMoodOptionsVisible(true);
    }, optionsDelay);

    return () => {
      window.clearTimeout(questionTimer);
      window.clearTimeout(optionsTimer);
    };
  }, [
    isHeroCarouselExited,
    isMoodBridgePrimed,
    isDesktop,
    isHomeDesktopLayout,
    isHeroViewportCleared,
    screen,
    isMoodBridgeVisible,
    areMoodOptionsVisible,
  ]);

  useEffect(() => {
    if (!isV2RevealLocked || screen !== "home") return undefined;

    let lastTouchY = 0;
    const shouldBlock = (deltaY) => deltaY > 0;

    const onWheel = (event) => {
      if (!shouldBlock(event.deltaY)) return;
      event.preventDefault();
    };

    const onTouchStart = (event) => {
      if (!event.touches?.length) return;
      lastTouchY = event.touches[0].clientY;
    };

    const onTouchMove = (event) => {
      if (!event.touches?.length) return;
      const nextY = event.touches[0].clientY;
      const deltaY = lastTouchY - nextY;
      if (shouldBlock(deltaY)) {
        event.preventDefault();
      }
      lastTouchY = nextY;
    };

    const onKeyDown = (event) => {
      const blockedKeys = ["PageDown", " ", "ArrowDown"];
      if (!blockedKeys.includes(event.key)) return;
      event.preventDefault();
    };

    const root = document.documentElement;
    const body = document.body;
    const prevRootOverflow = root.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevRootTouchAction = root.style.touchAction;
    const prevBodyTouchAction = body.style.touchAction;

    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    root.style.touchAction = "none";
    body.style.touchAction = "none";

    window.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("touchstart", onTouchStart, { passive: false });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("wheel", onWheel);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKeyDown);
      root.style.overflow = prevRootOverflow;
      body.style.overflow = prevBodyOverflow;
      root.style.touchAction = prevRootTouchAction;
      body.style.touchAction = prevBodyTouchAction;
    };
  }, [isV2RevealLocked, screen]);

  useEffect(() => {
    if (screen !== "poemDetail") setPoemSubscribeOpen(false);
  }, [screen]);

  useEffect(() => {
    if (screen !== "home") {
      setIsHomeCollectionTransitioning(false);
    }
  }, [screen]);

  useEffect(() => () => {
    if (homePoemTransitionCompleteTimerRef.current !== null) {
      window.clearTimeout(homePoemTransitionCompleteTimerRef.current);
    }
    if (homePoemTransitionPageTimerRef.current !== null) {
      window.clearTimeout(homePoemTransitionPageTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isHomePoemTransitioning) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - html.clientWidth;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
    };
  }, [isHomePoemTransitioning]);

  useEffect(() => {
    if (screen !== "home") {
      setNewsletterSpotlightHeadSuccess(false);
    }
  }, [screen]);

  useEffect(() => {
    setPoemSubscribeOpen(false);
  }, [activePoemId]);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setVoiceWorksPage(0);
  }, [voiceWorksSearchQuery, activeVoiceId]);

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

  useEffect(() => {
    if (screen !== "home") return undefined;
    const cards = homepageCollections
      .map((collection) => ({
        id: collection.id,
        src: collectionImages[collection.id] || "",
      }))
      .filter((item) => item.src);

    if (!cards.length) return undefined;

    let cancelled = false;
    (async () => {
      const nextModes = {};
      for (const card of cards) {
        nextModes[card.id] = await analyzeCollectionReadabilityMode(card.src);
      }
      if (!cancelled) {
        setCollectionReadabilityModes((prev) => ({ ...prev, ...nextModes }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [screen, homepageCollections, collectionImages]);

  useEffect(() => {
    if (screen !== "home") return undefined;
    const cards = homepageCollections
      .map((collection) => ({
        id: collection.id,
        src: collectionImages[collection.id] || "",
      }))
      .filter((item) => item.src);

    if (!cards.length) return undefined;

    let cancelled = false;
    (async () => {
      const nextColors = {};
      for (const card of cards) {
        nextColors[card.id] = await extractCollectionDominantBorderColor(card.src);
      }
      if (!cancelled) {
        setCollectionBorderColors((prev) => ({ ...prev, ...nextColors }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [screen, homepageCollections, collectionImages]);

  useEffect(() => {
    if (screen !== "home") return undefined;
    const nodes = [
      collectionsBridgeRef.current,
      collectionsPrimaryRef.current,
      collectionsSecondaryLeftRef.current,
      collectionsSecondaryRightRef.current,
    ].filter(Boolean);
    if (!nodes.length) return undefined;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      nodes.forEach((node) => node.classList.add("in-view"));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: "0px 0px -40px 0px",
    });

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [screen, homepageCollections.length]);

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
  const activePoemAudioTrack = POEM_AUDIO_TRACKS[activePoem.id] ?? null;
  const activePoemAudioSrc = activePoemAudioTrack?.sources?.[poemAudioSourceIndex] ?? null;
  const homeTransitionPoem = homeTransitionPoemId ? getPoemById(homeTransitionPoemId) : null;
  const homeTransitionCard = useMemo(
    () => carouselCards.find((card) => card.poemId === homeTransitionPoemId) ?? null,
    [carouselCards, homeTransitionPoemId],
  );
  const worksPerPage = 20;
  const activeVoiceAllPoems = useMemo(
    () => filterByPoet(poems, activeVoiceId),
    [poems, activeVoiceId],
  );
  const filteredVoiceWorks = useMemo(() => {
    const query = voiceWorksSearchQuery.trim().toLowerCase();
    if (!query) return activeVoiceAllPoems;
    return activeVoiceAllPoems.filter((poem) => {
      const haystack = [
        poem.title,
        poem.author,
        poem.excerpt,
        ...(Array.isArray(poem.moods) ? poem.moods : []),
        ...(Array.isArray(poem.portalTags) ? poem.portalTags : []),
        ...(Array.isArray(poem.lines) ? poem.lines.flat() : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [activeVoiceAllPoems, voiceWorksSearchQuery]);
  const totalWorksPages = Math.max(1, Math.ceil(filteredVoiceWorks.length / worksPerPage));
  const visibleWorks = filteredVoiceWorks.slice(
    voiceWorksPage * worksPerPage,
    voiceWorksPage * worksPerPage + worksPerPage,
  );
  useEffect(() => {
    setVoiceWorksPage((page) => Math.min(page, Math.max(totalWorksPages - 1, 0)));
  }, [totalWorksPages]);
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
  const poemTokenLines = useMemo(
    () =>
      activePoem.lines.map((stanza, stanzaIndex) =>
        stanza.map((line, lineIndex) => tokenizePoemLine(line, `${activePoem.id}-${stanzaIndex}-${lineIndex}`)),
      ),
    [activePoem.id, activePoem.lines],
  );
  const poemWordTimeline = useMemo(() => {
    if (!poemAudioDuration || !Number.isFinite(poemAudioDuration) || poemAudioDuration <= 0) return [];
    const entries = [];
    let cursor = 0;
    poemTokenLines.forEach((stanza, stanzaIndex) => {
      stanza.forEach((lineTokens, lineIndex) => {
        lineTokens.forEach((token, tokenIndex) => {
          if (!token.pronounceable) return;
          entries.push({
            key: `${stanzaIndex}-${lineIndex}-${tokenIndex}`,
            weight: Math.max(1, token.text.length * 0.72),
          });
        });
      });
    });
    const totalWeight = entries.reduce((sum, item) => sum + item.weight, 0) || 1;
    const leadIn = Math.min(0.55, poemAudioDuration * 0.03);
    const tail = Math.min(0.7, poemAudioDuration * 0.04);
    const speakingDuration = Math.max(0.2, poemAudioDuration - leadIn - tail);
    return entries.map((item) => {
      const duration = (item.weight / totalWeight) * speakingDuration;
      const start = cursor + leadIn;
      const end = start + duration;
      cursor += duration;
      return { ...item, start, end };
    });
  }, [poemTokenLines, poemAudioDuration]);
  const activePoemWordKey = useMemo(() => {
    if (!poemWordTimeline.length || !isPoemAudioPlaying) return null;
    const now = poemAudioCurrentTime;
    const idx = poemWordTimeline.findIndex((entry) => now >= entry.start && now < entry.end);
    if (idx >= 0) return poemWordTimeline[idx].key;
    if (now >= poemWordTimeline[poemWordTimeline.length - 1].end) return poemWordTimeline[poemWordTimeline.length - 1].key;
    return null;
  }, [poemWordTimeline, poemAudioCurrentTime, isPoemAudioPlaying]);
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

  function openCollectionFromTransition(collectionId, previousScreen) {
    // Atomically reset scroll + commit screen change in one synchronous paint.
    // flushSync forces React to flush state synchronously so the real page
    // never paints at a stale scroll offset, eliminating the load-shift jitter.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    flushSync(() => {
      setActiveCollectionId(collectionId);
      setCollectionDetailContext({ previousScreen });
      setScreen("collectionDetail");
      trackEvent("collection_opened", {
        collection_id: collectionId,
        source_screen: previousScreen,
      });
    });
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

  function renderCollectionDetailContent(collection, onBack) {
    return (
      <main className="screen-content screen-content--collection-detail" data-testid="screen-collection-detail">
        <section className="collection-detail">
          <header className="screen-actions screen-actions--static screen-actions--split collection-detail__back">
            <button className="screen-action-btn" type="button" aria-label="Back to collections" onClick={onBack}>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          </header>

          <header className="collection-detail__hero">
            <div className="collection-detail__art">
              {getCollectionCardImage(collection) ? (
                <CollectionCoverImg src={getCollectionCardImage(collection)} alt={collection.title} />
              ) : (
                <div className="collection-detail__art-placeholder" aria-hidden="true"></div>
              )}
            </div>
            <h1>{collection.title}</h1>
            <p>{collection.description}</p>
          </header>

          <section className="collection-detail__list" aria-label={`${collection.title} poems`}>
            {collection.poems.map((poem) => (
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
                      sourceCollectionId: collection.id,
                    })
                  }
                >
                  Read Full Poem
                </button>
              </article>
            ))}
          </section>

          {collection.curator && (
            <footer className="collection-detail__curator">
              <p>Curated by {collection.curator.name}</p>
              <span>{collection.curator.role}</span>
            </footer>
          )}
        </section>
      </main>
    );
  }

  function renderPoemDetailContent(
    poem,
    onBack,
    { isTransitionPreview = false } = {},
  ) {
    if (!poem) return null;

    return (
      <main className="screen-content screen-content--poem-detail" data-testid={isTransitionPreview ? undefined : "screen-poem"}>
        <header className="screen-actions screen-actions--reader">
          <button
            className="screen-action-btn"
            type="button"
            aria-label="Go back"
            onClick={isTransitionPreview ? undefined : onBack}
            disabled={isTransitionPreview}
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          {isTransitionPreview ? (
            <button className="screen-action-btn" type="button" aria-hidden="true" disabled>
              <span className="material-symbols-outlined">download</span>
            </button>
          ) : (
            <InstallAppButton
              surface="poem"
              className="screen-action-btn"
              deferredPrompt={deferredInstallPrompt}
              onConsumedPrompt={() => setDeferredInstallPrompt(null)}
              movingBorder
              tooltip="Add Versery to your home screen for quicker access—like an app shortcut on your device."
            />
          )}
        </header>

        <article className="poem-reader">
          <div className="poem-reader__meta">
            <div className="poem-reader__meta-row">
              <span className="poem-reader__meta-label">Poem Selection</span>
              <div className="poem-reader__meta-actions">
                {!isTransitionPreview && activePoemAudioTrack ? (
                  <>
                    <button
                      type="button"
                      className={`poem-reader__audio-btn${isPoemAudioPlaying ? " is-playing" : ""}`}
                      onClick={togglePoemAudio}
                      aria-label={isPoemAudioPlaying ? "Pause poem audio" : "Play poem audio"}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {isPoemAudioPlaying ? "pause" : "play_arrow"}
                      </span>
                    </button>
                    {isPoemAudioPlaying ? (
                      <div className="poem-reader__meta-wave is-waveform-active">
                        <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
                          <polyline
                            points={poemWaveBars
                              .map((value, index) => {
                                const x = (index / (poemWaveBars.length - 1 || 1)) * 100;
                                const y = 6 - value * 4.5;
                                return `${x},${y}`;
                              })
                              .join(" ")}
                          />
                        </svg>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <header className="poem-reader__title">
            <h1>{poem.title}</h1>
            <p>{poem.translator}</p>
          </header>

          <div className="poem-reader__mark">
            <span className="material-symbols-outlined">{poem.icon}</span>
          </div>

          <section
            ref={isTransitionPreview ? null : poemBodyRef}
            className={`poem-reader__body${!isTransitionPreview ? " poem-reader__body--page-scroll" : ""}${
              !isTransitionPreview && supportsCustomHighlight ? " has-custom-highlight" : ""
            }${
              !isTransitionPreview && selectedSnippetOverflow && !supportsCustomHighlight ? " is-selection-overflow" : ""
            }${!isTransitionPreview && isPoemAudioPlaying ? " is-audio-playing" : ""}`}
          >
            {poem.lines.map((stanza, index) => (
              <div key={`${poem.id}-${index}`} className="poem-reader__stanza">
                {stanza.map((line, lineIndex) => {
                  const lineTokens = poemTokenLines[index]?.[lineIndex] ?? [];
                  return (
                  <p key={`${poem.id}-${index}-${lineIndex}`} className="poem-reader__line">
                    {lineTokens.map((token, tokenIndex) => {
                      const wordKey = `${index}-${lineIndex}-${tokenIndex}`;
                      const isActiveWord = wordKey === activePoemWordKey;
                      return (
                        <span
                          key={token.id}
                          data-word-key={token.pronounceable ? wordKey : undefined}
                          className={isActiveWord ? "poem-reader__word is-active" : "poem-reader__word"}
                        >
                          {token.text}
                          {token.trailing}
                        </span>
                      );
                    })}
                  </p>
                  );
                })}
              </div>
            ))}
          </section>
          {!isTransitionPreview && activePoemAudioTrack && activePoemAudioSrc ? (
            <audio
              ref={poemAudioRef}
              src={activePoemAudioSrc}
              preload="metadata"
              onError={handlePoemAudioSourceError}
            />
          ) : null}

          <div className="poem-reader__actions">
            <button
              className="secondary-action poem-reader__share-btn"
              type="button"
              disabled={isTransitionPreview || isGeneratingShareCard}
              onClick={isTransitionPreview ? undefined : handleShareButtonClick}
            >
              <span className="material-symbols-outlined" aria-hidden="true">ios_share</span>
              <span>{isGeneratingShareCard ? "Generating..." : shareButtonLabel}</span>
            </button>
          </div>
          {!isTransitionPreview && shareHelperText ? <p className="poem-reader__share-hint">{shareHelperText}</p> : null}
          {!isTransitionPreview ? (
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
          ) : null}

          <div className="poem-reader__mark poem-reader__mark--bottom">
            <span className="material-symbols-outlined">{poem.footerIcon}</span>
          </div>
        </article>

        {!isTransitionPreview && shareToast ? (
          <div className="share-toast" role="status" aria-live="polite">
            {shareToast}
          </div>
        ) : null}

        {!isTransitionPreview ? (
          <>
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
          </>
        ) : null}
      </main>
    );
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

  function commitPoemOpen({
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

  function openPoem(args) {
    commitPoemOpen(args);
  }

  function openPoemFromTransition(args) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    flushSync(() => {
      setShowHomeTransitionPoemPage(false);
      setIsHomePoemTransitioning(false);
      setHomeTransitionPoemId(null);
      commitPoemOpen(args);
    });
  }

  function beginHomeCarouselPoemTransition(poemId) {
    if (!poemId || isHomePoemTransitioning) return;
    if (homePoemTransitionCompleteTimerRef.current !== null) {
      window.clearTimeout(homePoemTransitionCompleteTimerRef.current);
    }
    if (homePoemTransitionPageTimerRef.current !== null) {
      window.clearTimeout(homePoemTransitionPageTimerRef.current);
    }

    setHomeTransitionPoemId(poemId);
    setShowHomeTransitionPoemPage(false);
    setIsHomePoemTransitioning(true);

    homePoemTransitionPageTimerRef.current = window.setTimeout(() => {
      setShowHomeTransitionPoemPage(true);
    }, 1760);

    homePoemTransitionCompleteTimerRef.current = window.setTimeout(() => {
      openPoemFromTransition({
        poemId,
        previousScreen: "home",
        sourceOrigin: "home_carousel",
      });
    }, 2080);
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
    setPoemAudioSourceIndex(0);
    setPoemAudioCurrentTime(0);
    setPoemAudioDuration(0);
    setIsPoemAudioPlaying(false);
    setPoemWaveBars(Array.from({ length: AUDIO_WAVE_BARS }, () => 0.08));
  }, [activePoemId]);

  useEffect(() => {
    if (screen !== "poemDetail") return;
    if (!pendingPoemAudioAutoplayId || pendingPoemAudioAutoplayId !== activePoem.id) return;
    const audio = poemAudioRef.current;
    if (!audio || !activePoemAudioTrack) return;
    const tryPlay = async () => {
      try {
        await audio.play();
      } catch {
        // Browser autoplay policies may block play until user gesture.
      } finally {
        setPendingPoemAudioAutoplayId(null);
      }
    };
    tryPlay();
  }, [screen, activePoem.id, pendingPoemAudioAutoplayId, activePoemAudioTrack]);

  useEffect(() => {
    const audio = poemAudioRef.current;
    if (!audio || !activePoemAudioTrack) return;
    let cancelled = false;

    const tickWave = () => {
      if (cancelled) return;
      const analyser = poemWaveAnalyserRef.current;
      if (!analyser) return;
      const bins = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(bins);
      const bars = Array.from({ length: AUDIO_WAVE_BARS }, (_, index) => {
        const from = Math.floor((index / AUDIO_WAVE_BARS) * bins.length);
        const to = Math.floor(((index + 1) / AUDIO_WAVE_BARS) * bins.length);
        let total = 0;
        let count = 0;
        for (let i = from; i < to; i += 1) {
          total += bins[i] ?? 0;
          count += 1;
        }
        const avg = count ? total / count : 0;
        return Math.max(0.06, Math.min(1, avg / 178));
      });
      setPoemWaveBars(bars);
      poemWaveAnimationRef.current = window.requestAnimationFrame(tickWave);
    };

    const handlePlay = async () => {
      try {
        if (!poemAudioContextRef.current) {
          poemAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const audioContext = poemAudioContextRef.current;
        if (!poemWaveAnalyserRef.current) {
          poemWaveAnalyserRef.current = audioContext.createAnalyser();
          poemWaveAnalyserRef.current.fftSize = 512;
          poemWaveAnalyserRef.current.smoothingTimeConstant = 0.88;
        }
        if (!poemWaveSourceRef.current) {
          poemWaveSourceRef.current = audioContext.createMediaElementSource(audio);
          poemWaveSourceRef.current.connect(poemWaveAnalyserRef.current);
          poemWaveAnalyserRef.current.connect(audioContext.destination);
        }
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }
      } catch {
        // If audio analyzer setup fails, playback still continues.
      }
      setIsPoemAudioPlaying(true);
      if (poemWaveAnimationRef.current) {
        window.cancelAnimationFrame(poemWaveAnimationRef.current);
      }
      poemWaveAnimationRef.current = window.requestAnimationFrame(tickWave);
    };

    const handlePause = () => {
      setIsPoemAudioPlaying(false);
      if (poemWaveAnimationRef.current) {
        window.cancelAnimationFrame(poemWaveAnimationRef.current);
      }
      setPoemWaveBars(Array.from({ length: AUDIO_WAVE_BARS }, () => 0.08));
    };

    const handleLoaded = () => {
      setPoemAudioDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setPoemAudioCurrentTime(audio.currentTime || 0);
    };
    const handleTime = () => setPoemAudioCurrentTime(audio.currentTime || 0);
    const handleEnded = () => {
      handlePause();
      setPoemAudioCurrentTime(audio.duration || 0);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("timeupdate", handleTime);
    audio.addEventListener("ended", handleEnded);
    return () => {
      cancelled = true;
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("timeupdate", handleTime);
      audio.removeEventListener("ended", handleEnded);
      handlePause();
    };
  }, [activePoemAudioTrack, activePoem.id]);

  useEffect(() => {
    if (!isPoemAudioPlaying || !activePoemWordKey) return;
    const body = poemBodyRef.current;
    if (!body) return;
    const target = body.querySelector(`[data-word-key="${activePoemWordKey}"]`);
    if (!(target instanceof HTMLElement)) return;
    const bodyRect = body.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetMid = targetRect.top + targetRect.height / 2;
    const desired = bodyRect.top + bodyRect.height * 0.34;
    const delta = targetMid - desired;
    body.scrollTo({
      top: body.scrollTop + delta,
      behavior: "smooth",
    });
  }, [activePoemWordKey, isPoemAudioPlaying]);

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
        const wordNodes = lineNode.querySelectorAll(".poem-reader__word");
        const nodes = wordNodes.length ? Array.from(wordNodes) : [lineNode];
        nodes.forEach((node) => {
          const textNodes = Array.from(node.childNodes).filter(
            (child) => child instanceof Text && child.textContent?.length,
          );
          if (!textNodes.length) return;

          textNodes.forEach((textNode) => {
            if (!range.intersectsNode(textNode)) return;

            const textValue = textNode.textContent ?? "";
            let start = 0;
            let end = textValue.length;

            if (textNode === range.startContainer) {
              start = range.startOffset;
            }
            if (textNode === range.endContainer) {
              end = range.endOffset;
            }

            start = Math.max(0, Math.min(start, textValue.length));
            end = Math.max(0, Math.min(end, textValue.length));
            if (end <= start) return;

            const text = textValue.slice(start, end);
            if (!text.trim()) return;
            selectedParts.push(text);
            selectedOffsets.push({ textNode, start, end });
          });
        });
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

  async function togglePoemAudio() {
    const audio = poemAudioRef.current;
    if (!audio || !activePoemAudioTrack) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        // Playback remains user-controlled when blocked.
      }
      return;
    }
    audio.pause();
  }

  function handlePoemAudioSourceError() {
    if (!activePoemAudioTrack?.sources?.length) return;
    setPoemAudioSourceIndex((prev) => {
      if (prev + 1 >= activePoemAudioTrack.sources.length) return prev;
      return prev + 1;
    });
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
                <span className="top-app-bar__pad" aria-hidden="true" />
              ) : (
                <span className="top-app-bar__pad" aria-hidden="true" />
              )}
            </div>
            <p
              className={`top-app-bar__title${wordmarkSecretPulse ? " top-app-bar__title--secret" : ""}`}
              onClick={() => {
                if (isDesktop && screen !== "home") {
                  setScreen("home");
                }
              }}
              onDoubleClick={() => {
                setWordmarkSecretPulse(true);
                window.setTimeout(() => setWordmarkSecretPulse(false), 1150);
              }}
              title="Double-click for a quiet spark."
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
                  {!THEME_LIGHT_ONLY ? (
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
                  ) : null}
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
                  <PoetPortraitImg src={voice.image} alt={`Portrait of ${voice.name}`} />
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
                  }${getCollectionCardImage(collection) ? " collections-archive-card--image" : ""}${
                    collection.tone ? ` collections-archive-card--${collection.tone}` : ""
                  }${
                    desktopCollectionLayout[collection.id] === "full"
                      ? " collections-archive-card--desktop-full"
                      : " collections-archive-card--desktop-half"
                  }`}
                  type="button"
                  onClick={() => openCollection(collection.id, "collections")}
                >
                  {getCollectionCardImage(collection) ? (
                    <div className="collections-archive-card__media">
                      <CollectionCoverImg
                        src={getCollectionCardImage(collection)}
                        alt={collection.title}
                      />
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
                      <PoetPortraitImg src={voice.image} alt={voice.name} intrinsicSize="chip" />
                    </span>
                    <span className="discovery-poet-chip__name">{voice.name}</span>
                  </button>
                ))}
              </div>
            </section>
          </section>
        </main>
      ) : onCollectionDetail ? (
        renderCollectionDetailContent(activeCollection, handleCollectionBack)
      ) : onVoiceDetail ? (
        <main className="screen-content screen-content--voice-detail" data-testid="screen-voice-detail">
          <header className="voice-hero">
            <PoetPortraitImg
              src={activeVoice.image}
              alt={`Portrait of ${activeVoice.name}`}
              loading="eager"
              fetchPriority="high"
              intrinsicSize="hero"
            />
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
              <input
                placeholder="Search poems, themes, or keywords..."
                type="text"
                value={voiceWorksSearchQuery}
                onChange={(e) => setVoiceWorksSearchQuery(e.target.value)}
              />
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
              {visibleWorks.length === 0 && voiceWorksSearchQuery.trim() && (
                <p style={{ textAlign: "center", padding: "2rem", color: "var(--ink-soft)" }}>
                  No poems match "{voiceWorksSearchQuery.trim()}".
                </p>
              )}
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
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      ) : onPoemDetail ? (
        renderPoemDetailContent(activePoem, handlePoemBack)
      ) : (
        <main
          className={`screen-content screen-content--home${isHomeCollectionTransitioning ? " is-collection-transitioning" : ""}${
            isHomePoemTransitioning ? " is-poem-transitioning" : ""
          }`}
          data-testid="screen-home"
        >
          <section
            ref={heroViewportRef}
            className="mobile-hero-clean-viewport"
            aria-label={isHomeDesktopLayout ? "Home hero" : "Mobile hero carousel"}
          >
            <div className="mobile-hero-intro-bridge">
              <div className="mobile-hero-intro-bridge__inner seo-hidden">
                <h1 className="mobile-hero-intro-bridge__headline">Curated poetry for how you feel</h1>
                <p className="mobile-hero-intro-bridge__lead">
                  Versery is a calm place to read poems online.
                </p>
              </div>
              {!isHomeDesktopLayout ? (
                <p
                  className="mobile-hero-intro-bridge__tagline"
                  aria-live="polite"
                >
                  <span
                    className={`mobile-hero-intro-bridge__tagline-frame${isActiveCarouselAudioPlaying ? " mobile-hero-intro-bridge__tagline-frame--audio-playing" : ""}`}
                    style={{ "--tagline-icon-accent": activeCarouselIconColor }}
                    aria-hidden="true"
                  >
                    <span className="mobile-hero-intro-bridge__tagline-halo" />
                    <span className="mobile-hero-intro-bridge__tagline-icon-slot">
                      <AnimatePresence initial={false} custom={heroIconSwipeDirection} mode="sync">
                        <motion.span
                          key={`${activeCarouselMoodIcon}-${activeCarouselIndex}`}
                          className="material-symbols-outlined mobile-hero-intro-bridge__tagline-icon"
                          custom={heroIconSwipeDirection}
                          style={{ color: activeCarouselIconColor }}
                          initial={
                            shouldReduceMotion
                              ? { opacity: 1 }
                              : (direction) => ({ opacity: 0, x: direction > 0 ? 12 : -12, filter: "blur(0.35px)" })
                          }
                          animate={
                            shouldReduceMotion
                              ? { opacity: 1 }
                              : { opacity: 1, x: 0, filter: "blur(0px)" }
                          }
                          exit={
                            shouldReduceMotion
                              ? { opacity: 1 }
                              : (direction) => ({ opacity: 0, x: direction > 0 ? -12 : 12, filter: "blur(0.35px)" })
                          }
                          transition={
                            shouldReduceMotion
                              ? { duration: 0 }
                              : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }
                          }
                        >
                          {activeCarouselMoodIcon}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  </span>
                </p>
              ) : null}
            </div>
            {isHomeDesktopLayout ? (
              <div ref={heroCarouselRef} className="desktop-hero-mood-cluster home-hero-cluster">
                <div className="desktop-hero-bento">
                  <div className="desktop-hero-bento__left desktop-hero-left-carousel" aria-label="Featured poems">
                    <ArcCarousel
                      cards={carouselCards}
                      initialIndex={homeReturnCarouselIndex}
                      onOpenPoem={beginHomeCarouselPoemTransition}
                      embeddedMode="leftHero"
                    />
                  </div>
                  <div className="desktop-hero-bento__right">
                    <p
                      ref={moodBridgeRef}
                      className={`mood-transition-bridge${isMoodBridgeVisible ? " is-visible" : ""}`}
                    >
                      Start with your mood.
                    </p>
                    <div className="feeling-grid mood-transition-grid" aria-label="Feeling options">
                      {renderHomeFeelingChipButtons()}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                ref={heroCarouselRef}
                className={`mobile-hero-carousel-wrap${isHeroCarouselExited ? " mobile-hero-carousel-wrap--exited" : ""}`}
              >
                <ArcCarousel
                  cards={carouselCards}
                  initialIndex={homeReturnCarouselIndex}
                  paginationClassName={isHeroCarouselExited ? "arc-carousel-pagination--exited" : ""}
                  onActiveIndexChange={setActiveCarouselIndex}
                  onActiveCardAudioPlayingChange={setIsActiveCarouselAudioPlaying}
                  onOpenPoem={beginHomeCarouselPoemTransition}
                />
              </div>
            )}
          </section>

          <div className="home-desktop-lower-flow">
          <section
            className="collections-section collections-section--v2"
            aria-labelledby="home-collections-heading"
          >
            <ZAxisTransition
              items={homepageCollectionTransitionItems}
              renderCard={(collection) => {
                const isPrimary = collection.homeIndex === 0;
                const isLight = collectionReadabilityModes[collection.id] === "light";
                const delay = isPrimary ? "200ms" : collection.homeIndex === 1 ? "350ms" : "450ms";
                const cardClass = isPrimary
                  ? `v2-collection-card v2-collection-card--primary animate-in${
                      collectionImages[collection.id] ? " v2-collection-card--has-image" : ""
                    }${isLight ? " v2-collection-card--readability-light" : " v2-collection-card--readability-dark"}`
                  : `v2-collection-card v2-collection-card--secondary animate-in${
                      collectionImages[collection.id] ? " v2-collection-card--has-image" : ""
                    }${isLight ? " v2-collection-card--readability-light" : " v2-collection-card--readability-dark"}`;

                return (
                  <button
                    ref={
                      isPrimary
                        ? collectionsPrimaryRef
                        : collection.homeIndex === 1
                          ? collectionsSecondaryLeftRef
                          : collectionsSecondaryRightRef
                    }
                    className={cardClass}
                    style={{
                      transitionDelay: delay,
                      borderWidth: collectionImages[collection.id] ? "6px" : undefined,
                      borderColor: collectionBorderColors[collection.id] || undefined,
                      "--collection-accent": collectionBorderColors[collection.id] || "rgba(173, 179, 180, 0.55)",
                    }}
                    type="button"
                  >
                    {collectionImages[collection.id] ? (
                      <div
                        className={
                          isPrimary
                            ? "v2-collection-card__image v2-collection-card__image--primary"
                            : "v2-collection-card__image v2-collection-card__image--secondary"
                        }
                      >
                        <CollectionCoverImg src={collectionImages[collection.id]} alt={collection.title} />
                      </div>
                    ) : null}
                    <div
                      className={
                        isPrimary
                          ? "v2-collection-card__body"
                          : "v2-collection-card__body v2-collection-card__body--secondary"
                      }
                    >
                      <h3
                        className={
                          isPrimary
                            ? "v2-collection-card__title v2-collection-card__title--primary"
                            : "v2-collection-card__title"
                        }
                      >
                        {collection.title}
                      </h3>
                      <p className="v2-collection-card__tagline">{collection.dailyTagline}</p>
                      {isPrimary ? (
                        <div className="v2-collection-card__preview">
                          <p className="v2-collection-card__preview-poet">
                            {collection.poems?.[0]?.poet ?? "Versery Archive"}
                          </p>
                          <p className="v2-collection-card__preview-lines">
                            {String(collection.dailyFeaturedLines ?? "")
                              .split("\n")
                              .filter(Boolean)
                              .slice(0, 2)
                              .join("\n")}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              }}
              renderGrid={(cards) => (
                <>
                  <h2
                    id="home-collections-heading"
                    ref={collectionsBridgeRef}
                    className="collections-thread-bridge animate-in"
                    style={{ transitionDelay: "100ms" }}
                  >
                    Or start with a collection
                  </h2>
                  {cards[0] ?? null}
                  <div className="v2-collection-secondary-grid">
                    {cards.slice(1, 3)}
                  </div>
                </>
              )}
              renderNextPage={({ activeItem }) =>
                renderCollectionDetailContent(activeItem, () => openCollection(activeItem.id, "home"))
              }
              onTransitionStart={() => setIsHomeCollectionTransitioning(true)}
              onTransitionComplete={(collectionId) => {
                setIsHomeCollectionTransitioning(false);
                openCollectionFromTransition(collectionId, "home");
              }}
            />
          </section>

          <section ref={heroSectionRef} className="feeling-section">
            <div
              className={`eyebrow-pill home-v2-stage${isHeroCarouselExited ? " is-ready" : ""}`}
              style={{ "--v2-stage-delay": "70ms" }}
            >
              Prefer a quick read?
            </div>

            <div
              className={`home-intro home-intro--hero home-v2-stage${isHeroCarouselExited ? " is-ready" : ""}`}
              style={{ "--v2-stage-delay": "130ms" }}
            >
              <p className="home-intro__headline">Read today, or leave it to chance.</p>
              <p className="home-intro__lead">
                Start with today&apos;s poem or open a random page from the archive.
              </p>
            </div>

            <div className="home-hero-cluster">
              {!isHomeDesktopLayout ? (
                <>
                  <p
                    ref={moodBridgeRef}
                    className={`mood-transition-bridge${isMoodBridgeVisible ? " is-visible" : ""}`}
                  >
                    What are you carrying today?
                  </p>

                  <div className="feeling-grid mood-transition-grid" aria-label="Feeling options">
                    {renderHomeFeelingChipButtons()}
                  </div>
                </>
              ) : null}

              <div
                className={`daily-resonance-wrap home-v2-stage${isHeroCarouselExited ? " is-ready" : ""}`}
                style={{ "--v2-stage-delay": "230ms" }}
              >
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
            <section
              className={
                "home-spotlight-aside" +
                (newsletterSpotlightHeadSuccess ? " home-spotlight-aside--success" : "")
              }
              aria-labelledby="home-spotlight-heading"
            >
              <div
                className={
                  "home-spotlight-aside__head" +
                  (newsletterSpotlightHeadSuccess ? " home-spotlight-aside__head--success" : "")
                }
              >
                <div className="home-spotlight-aside__head-pair">
                  <h2 id="home-spotlight-heading" className="poet-feature__badge home-spotlight-aside__solo-label">
                    A POEM IN YOUR INBOX, EVERY WEEK.
                  </h2>
                </div>
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
          </div>

          <section className="home-faq" aria-labelledby="home-faq-heading">
            <h2 id="home-faq-heading" className="home-faq__title">
              Quick answers
            </h2>
            <p className="home-faq__intro">A few things readers often ask before settling in.</p>
            <div className="home-faq__list">
              {HOME_FAQ_ITEMS.map((item) => (
                <details key={item.question} className="home-faq__item">
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

      <AnimatePresence>
        {isHomePoemTransitioning && homeTransitionPoem && showHomeTransitionPoemPage ? (
          <motion.div
            key={`home-poem-transition-page-${homeTransitionPoem.id}`}
            className="fixed inset-0 z-40 bg-[var(--surface-lowest)] overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
          >
            {renderPoemDetailContent(homeTransitionPoem, () => {}, { isTransitionPreview: true })}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isHomePoemTransitioning && homeTransitionCard ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <motion.div
              animate={{
                scale: isDesktop ? [1, 1.01, 1.22] : [1, 1.03, 30],
                rotateZ: isDesktop ? [0, -1.2, 0.8] : [0, -5, 14],
                rotateY: isDesktop ? [0, -3, 0] : [0, -10, 0],
                opacity: [1, 1, 0],
              }}
              transition={{
                scale: {
                  times: [0, 0.6, 1],
                  duration: isDesktop ? 0.55 : 2,
                  ease: [0.4, 0, 0.2, 1],
                },
                rotateZ: {
                  times: [0, 0.5, 1],
                  duration: isDesktop ? 0.55 : 2,
                  ease: [0.4, 0, 0.2, 1],
                },
                rotateY: {
                  times: [0, 0.45, 1],
                  duration: isDesktop ? 0.55 : 2,
                  ease: [0.4, 0, 0.2, 1],
                },
                opacity: {
                  times: [0, 0.7, 1],
                  duration: isDesktop ? 0.48 : 2,
                  ease: "easeOut",
                },
              }}
              style={{
                willChange: "transform, opacity",
                backfaceVisibility: "hidden",
                transformPerspective: 1200,
                transformStyle: "preserve-3d",
              }}
            >
              <ArcCarouselStaticCard card={homeTransitionCard} />
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <nav className={`bottom-nav${showBottomNav ? " is-visible" : " is-hidden"}`} aria-label="Primary">
        <div className="bottom-nav__inner">
          <a
            className={`bottom-nav__item${navState === "home" ? " is-active" : ""}`}
            href={pathFromVerserySnapshot({ screen: "home" })}
            aria-label="Home — daily poem and moods"
            aria-current={navState === "home" ? "page" : undefined}
            onPointerEnter={() => prefetchVerseryPath(pathFromVerserySnapshot({ screen: "home" }))}
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
            onPointerEnter={() => prefetchVerseryPath(pathFromVerserySnapshot({ screen: "compass" }))}
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
            onPointerEnter={() => prefetchVerseryPath(pathFromVerserySnapshot({ screen: "voices" }))}
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
            onPointerEnter={() => prefetchVerseryPath(pathFromVerserySnapshot({ screen: "collections" }))}
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
