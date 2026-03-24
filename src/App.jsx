import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { filterByPortal, filterByPortals, filterByPoet } from "./lib/search.js";

const feelings = ["Melancholic", "Ethereal", "Radiant", "Solitary"];

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
const COLLECTION_TEMPLATES = [
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
    curator: { name: "Neelabh Srivastava", role: "Editor-in-Chief" },
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
    curator: { name: "Neelabh Srivastava", role: "Archive Curator" },
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
    curator: { name: "Neelabh Srivastava", role: "Field Editor" },
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
    curator: { name: "Neelabh Srivastava", role: "Guest Editor" },
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
    curator: { name: "Neelabh Srivastava", role: "Resident Curator" },
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
    curator: { name: "Neelabh Srivastava", role: "Guest Editor" },
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
    curator: { name: "Neelabh Srivastava", role: "Guest Curator" },
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
    curator: { name: "Neelabh Srivastava", role: "Night Editor" },
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
    // Quality pool: 8–50 lines, excluding specified poet
    const quality = poems.filter((p) => {
      const isQuality = p.linecount >= 8 && p.linecount <= 50;
      const notExcluded = !excludePoetId || p.poetId !== excludePoetId;
      return isQuality && notExcluded;
    });
    const recentCutoff = now - AVOID_MS;
    const recent = new Set(
      (stored.recent ?? []).filter((r) => r.at > recentCutoff).map((r) => r.id),
    );
    const fresh = quality.filter((p) => !recent.has(p.id));
    const pool = fresh.length >= 20 ? fresh : quality;
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

function chunkedStanzas(flatLines) {
  const STANZA_SIZE = 4;
  const stanzas = [];
  for (let i = 0; i < flatLines.length; i += STANZA_SIZE) {
    stanzas.push(flatLines.slice(i, i + STANZA_SIZE));
  }
  return stanzas.length ? stanzas : [[""]];
}

function poemToEntry(rawPoem) {
  return {
    id: rawPoem.id,
    title: rawPoem.title,
    subtitle: rawPoem.excerpt,
    translator: `By ${rawPoem.author}`,
    lines: chunkedStanzas(rawPoem.lines),
    note: rawPoem.excerpt,
    icon: "ink_highlighter",
    footerIcon: "eco",
    poetId: rawPoem.poetId ?? null,
    author: rawPoem.author ?? null,
  };
}

function poetToVoice(p) {
  const diedStr = p.died ? String(p.died) : "Present";
  return {
    id: p.id,
    name: p.name,
    tag: p.tag,
    image: `/poets/${p.id}.jpg`,
    icon: "auto_stories",
    era: `${p.born} – ${diedStr}`,
    origin: p.from,
    title: p.essence,
    bio: p.bio,
    works: p.works,
    stats: [
      { label: "Poems", value: String(p.poemCount), icon: "auto_stories" },
      { label: "Era", value: p.era, icon: "schedule" },
    ],
    quote: p.essence,
    quoteSource: "Versery Archive",
  };
}

/**
 * Generate daily collection image mapping using a day-based seed
 * Uses deterministic pseudo-random selection based on daily date
 */
function generateDailyCollectionImages(collections) {
  const today = new Date().toDateString();
  const cachedDate = localStorage.getItem('versery_collection_images_date');
  const cachedMapping = localStorage.getItem('versery_collection_images');

  if (cachedDate === today && cachedMapping) {
    // Use cached mapping for today
    try {
      return JSON.parse(cachedMapping);
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

  // Create mapping: assign images to collections using seeded randomness
  const mapping = {};
  collections.forEach((collection, collectionIndex) => {
    const randomIndex = Math.floor(pseudoRandom(collectionIndex) * allImages.length);
    mapping[collection.id] = allImages[randomIndex];
  });

  // Cache the mapping with today's date
  localStorage.setItem('versery_collection_images_date', today);
  localStorage.setItem('versery_collection_images', JSON.stringify(mapping));

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

  useEffect(() => {
    Promise.all([
      fetch("/poems.json").then((r) => r.json()),
      fetch("/poets.json").then((r) => r.json()),
    ]).then(([poemsData, poetsData]) => {
      setRawPoems(poemsData);
      setRawPoets(poetsData);
    });
  }, []);

  if (!rawPoems || !rawPoets) {
    return (
      <div className="page-shell loading-screen">
        <span className="material-symbols-outlined loading-icon">auto_stories</span>
        <p>Loading poems…</p>
      </div>
    );
  }

  return <AppLoaded poems={rawPoems} poets={rawPoets} />;
}

function AppLoaded({ poems, poets }) {
  // --- Derived data (computed once, stable across re-renders) ---
  const voices = useMemo(() => {
    const voiceList = poets.map(poetToVoice);

    // Daily voice card shuffle (like featured poem)
    const today = new Date().toDateString();
    const cachedDate = localStorage.getItem('versery_voices_shuffle_date');
    const cachedOrder = localStorage.getItem('versery_voices_shuffle_order');

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
    const order = shuffled.map(v => v.id);
    localStorage.setItem('versery_voices_shuffle_date', today);
    localStorage.setItem('versery_voices_shuffle_order', JSON.stringify(order));
    return shuffled;
  }, [poets]);

  const poemMap = useMemo(() => {
    const map = {};
    poems.forEach((p) => { map[p.id] = poemToEntry(p); });
    return map;
  }, [poems]);

  const poetOfWeek = useMemo(() => {
    const id = getPoetOfWeekId(voices.map((v) => v.id));
    return voices.find((v) => v.id === id) ?? voices[0];
  }, [voices]);

  const featuredPoem = useMemo(() => {
    const raw = getDailyFeaturedPoem(poems, poetOfWeek.id);
    return poemToEntry(raw);
  }, [poems, poetOfWeek.id]);

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

  const curatedCollections = useMemo(() => {
    return COLLECTION_TEMPLATES.map((template, index) => {
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
  }, [poems, voices]);

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
          year: voice.era,
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
      year: voice?.era ?? "",
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
  const [visibleVoiceCount, setVisibleVoiceCount] = useState(6);
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
  const loadMoreButtonRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Initialize daily collection image mapping
  useEffect(() => {
    const mapping = generateDailyCollectionImages(COLLECTION_TEMPLATES);
    setCollectionImages(mapping);
  }, []);

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
  const visibleVoices = voices.slice(0, visibleVoiceCount);
  const nextPoemData = getNextPoemForOrigin({
    origin: poemContext.sourceOrigin,
    poemId: activePoemId,
    voiceId: poemContext.sourceVoiceId,
    collectionId: poemContext.sourceCollectionId,
    feeling: poemContext.feeling,
  });

  // Filter voices by search query and era filter
  const filteredVoices = useMemo(() => {
    let filtered = visibleVoices;

    // Apply search filter
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter(v =>
        v.name.toLowerCase().includes(lower) ||
        v.tag.toLowerCase().includes(lower) ||
        v.origin.toLowerCase().includes(lower)
      );
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
    const normalizedVisibleVoiceCount = clamp(snapshot.visibleVoiceCount ?? 6, 6, voices.length);
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
      visibleVoiceCount: normalizedVisibleVoiceCount,
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
      visibleVoiceCount,
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
    setVisibleVoiceCount(snapshot.visibleVoiceCount);
    setDiscoveryContext(snapshot.discoveryContext);
    setVoiceDetailContext(snapshot.voiceDetailContext);
    setVoiceWorksContext(snapshot.voiceWorksContext);
    setCollectionDetailContext(snapshot.collectionDetailContext);
    setActivePoemId(snapshot.activePoemId);
    setPoemContext(snapshot.poemContext);
  }

  function navigateBack(fallback) {
    if (historyReadyRef.current && historyIndexRef.current > 0) {
      window.history.back();
      return;
    }
    fallback?.();
  }

  function openVoice(voiceId, previousScreen = "voices") {
    setActiveVoiceId(voiceId);
    setVoiceDetailContext({ previousScreen });
    setScreen("voiceDetail");
  }

  function openCollection(collectionId, previousScreen = "collections") {
    setActiveCollectionId(collectionId);
    setCollectionDetailContext({ previousScreen });
    setScreen("collectionDetail");
  }

  function openDiscovery(key, previousScreen, source) {
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
    setActivePoemId(poemId);
    setPoemContext({ previousScreen, sourceOrigin, sourceVoiceId, sourceCollectionId, feeling });
    setScreen("poemDetail");
  }

  function handlePoemBack() {
    navigateBack(() => setScreen(poemContext.previousScreen));
  }

  function openNextPoem() {
    openPoem({
      poemId: nextPoemData.poem.id,
      previousScreen: poemContext.previousScreen,
      sourceOrigin: nextPoemData.sourceOrigin ?? poemContext.sourceOrigin,
      sourceVoiceId: nextPoemData.sourceVoiceId ?? poemContext.sourceVoiceId,
      sourceCollectionId: nextPoemData.sourceCollectionId ?? poemContext.sourceCollectionId,
      feeling: poemContext.feeling,
    });
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
  const canLoadMoreVoices = visibleVoiceCount < voices.length;
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
      window.history.replaceState(
        { ...(window.history.state ?? {}), verseryApp: createSnapshot(), verseryIndex: 0 },
        "",
      );
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
    window.history.pushState(
      {
        ...(window.history.state ?? {}),
        verseryApp: createSnapshot(),
        verseryIndex: historyIndexRef.current,
      },
      "",
    );
  }, [
    screen,
    activeVoiceId,
    activeCollectionId,
    collectionPage,
    activeFeeling,
    visibleVoiceCount,
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
  }, [screen, activeVoiceId, activeCollectionId, activePoemId, collectionPage, visibleVoiceCount, voiceWorksPage]);

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
          <div className="top-app-bar__inner">
            <h1
              className="top-app-bar__title"
              onClick={() => {
                if (isDesktop && screen !== "home") {
                  setScreen("home");
                }
              }}
              style={{ cursor: isDesktop ? "pointer" : "default" }}
            >
              Versery
            </h1>
          </div>
        </header>
      )}

      {onCompass ? (
        <main className="screen-content screen-content--compass">
          <header className="compass-header">
            <h2>Emotional Compass</h2>
            <p>Select your current sensory resonance</p>
          </header>

          <section className="portal-grid" aria-label="Emotional portals">
            {portals.map((portal) => (
              <button
                key={portal.name}
                className={`portal-card portal-card--${portal.tone}`}
                type="button"
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
        <main className="screen-content screen-content--voices">
          <section className="voices-header">
            <h2>20 Voices</h2>
            <p>
              A curated collection of experimental poets exploring the boundaries of rhythm and digital resonance.
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
                  <p>{voice.tag}</p>
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

          <div className="voices-more">
            {canLoadMoreVoices && (
              <button
                ref={loadMoreButtonRef}
                className="load-more"
                type="button"
                onClick={() => {
                  setVisibleVoiceCount((count) => Math.min(count + 6, voices.length));
                  setTimeout(() => {
                    loadMoreButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }, 50);
                }}
              >
                <span className="load-more__icon material-symbols-outlined">expand_more</span>
                <span>Load More Voices</span>
              </button>
            )}
          </div>
        </main>
      ) : onCollections ? (
        <main className="screen-content screen-content--collections">
          <section className="collections-archive" aria-label="Curated collections archive">
            <header className="collections-archive__header">
              <span>Seasonal Selection</span>
              <h2>Curated Collections</h2>
              <p>
                A digital gallery of human thought, organized into thematic vessels of art, literature,
                and philosophy.
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
        <main className="screen-content screen-content--discovery">
          <section className="discovery-results-page">
            <header className="screen-actions screen-actions--static discovery-results-page__header">
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
              <h2>{activeDiscovery.title}</h2>
              <p>{activeDiscovery.subtitle}</p>
            </header>

            {activeDiscovery.showFeaturedPoem && discoveryFeaturedPoem && (
              <button
                type="button"
                className="discovery-feature"
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
                <h3>Poets in the current resonance</h3>
              </div>
              <div className="discovery-poets__rail">
                {discoveryPoets.map((voice) => (
                  <button
                    key={voice.id}
                    type="button"
                    className="discovery-poet-chip"
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
        <main className="screen-content screen-content--collection-detail">
          <section className="collection-detail">
            <header className="screen-actions screen-actions--static collection-detail__back">
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
        <main className="screen-content screen-content--voice-detail">
          <header className="voice-hero">
            <img src={activeVoice.image} alt={`Portrait of ${activeVoice.name}`} />
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
              <span>Historical Figure</span>
              <h2>{activeVoice.name}</h2>
              <p>
                <span>{activeVoice.era}</span>
                <span className="voice-hero__dot"></span>
                <span>{activeVoice.origin}</span>
              </p>
            </div>
          </header>

          <section className="voice-body">
            <div className="voice-section">
              <h3>{activeVoice.title}</h3>
              <p>
                {activeVoice.bio} <span className="voice-body__highlight">Transcends national borders</span> and remembers the quiet parts between languages.
              </p>
            </div>

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

            <div className="voice-section">
              <h3>Global Resonance</h3>
              <p>
                {activeVoice.name}'s work travels across languages, formats, and digital stages, quietly influencing new generations of readers.
              </p>
            </div>
          </section>

          <section className="voice-works">
            <div className="voice-works__header">
              <h3>Essential Works</h3>
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

          <section className="voice-quote">
            <div className="voice-quote__glow voice-quote__glow--one"></div>
            <div className="voice-quote__glow voice-quote__glow--two"></div>
            <div className="voice-quote__content">
              <span className="material-symbols-outlined">format_quote</span>
              <p>
                "{activeVoice.quote}"
                <span>{activeVoice.quoteSource}</span>
              </p>
              <div className="voice-quote__divider"></div>
            </div>
          </section>
        </main>
      ) : onVoiceWorks ? (
        <main className="screen-content screen-content--voice-works">
          <section className="voice-works-page">
            <header className="screen-actions screen-actions--static voice-works-page__header">
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
              <h2>{activeVoice.name}</h2>
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
        <main className="screen-content screen-content--poem-detail">
          <header className="screen-actions screen-actions--reader">
            <button className="screen-action-btn" type="button" aria-label="Go back" onClick={handlePoemBack}>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
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

            <section className="poem-reader__body">
              {activePoem.lines.map((stanza, index) => (
                <div key={`${activePoem.id}-${index}`} className="poem-reader__stanza">
                  {stanza.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              ))}
            </section>

            <div className="poem-reader__mark poem-reader__mark--bottom">
              <span className="material-symbols-outlined">{activePoem.footerIcon}</span>
            </div>

            <footer className="poem-reader__note">
              <h4>Contextual Note</h4>
              <p>{activePoem.note}</p>
            </footer>
          </article>

          <aside className="poem-next">
            <div className="poem-next__glow poem-next__glow--one"></div>
            <div className="poem-next__glow poem-next__glow--two"></div>
            <div className="poem-next__content">
              <div>
                <span>Continue Reading</span>
                <h3>{nextPoemData.poem.title}</h3>
              </div>
              <p>{nextPoemData.poem.subtitle}</p>
              <button className="primary-action" type="button" onClick={openNextPoem}>
                Open Poem
              </button>
              <div className="poem-next__divider"></div>
            </div>
          </aside>
        </main>
      ) : (
        <main className="screen-content">
          <section className="feeling-section">
            <div className="eyebrow-pill">Daily Resonance</div>

            <div className="feeling-card">
              <h2>How are you feeling today?</h2>

              <div className="feeling-grid" aria-label="Feeling options">
                {feelings.map((feeling) => (
                  <button
                    key={feeling}
                    className={`feeling-chip${activeFeeling === feeling ? " is-active" : ""}`}
                    type="button"
                    onClick={() => {
                      setActiveFeeling(feeling);
                      openDiscovery(feeling, "home", "feeling");
                    }}
                  >
                    {feeling}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="feature-stack" aria-label="Featured poem">
            <div className="feature-stack__layer feature-stack__layer--back"></div>
            <div className="feature-stack__layer feature-stack__layer--mid"></div>

            <article className="feature-card-main">
              <div className="feature-card-main__badge">
                <span className="material-symbols-outlined">auto_awesome</span>
                <span>4m read</span>
              </div>

              <div className="feature-card-main__content">
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
                <div className="poet-avatar">
                  <img
                    src={`/poets/${featuredPoem.poetId}.jpg`}
                    alt={`Portrait of ${featuredPoem.author}`}
                  />
                </div>

                <button
                  className="excerpt-link"
                  type="button"
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

          <section className="poet-feature" aria-label="Poet of the week">
            <div className="poet-feature__badge">Poet of the Week</div>
            <div className="poet-feature__content">
              <div className="poet-feature__avatar">
                <img
                  src={poetOfWeek?.image}
                  alt={`Portrait of ${poetOfWeek?.name}`}
                  loading="lazy"
                />
              </div>
              <div>
                <h3>{poetOfWeek?.name}</h3>
                <p>"{poetOfWeek?.quote}"</p>
              </div>
            </div>
          </section>

          <section className="collections-section" aria-label="Curated collections">
            <div className="section-header">
              <div>
                <p className="section-label">Archives</p>
                <h4>Curated Collections</h4>
              </div>

              <button className="section-link inline-action" type="button" onClick={() => setScreen("collections")}>
                View All
              </button>
            </div>

            <div className="collection-grid">
              {curatedCollections.slice(0, 3).map((collection, index) => (
                <button
                  key={collection.id}
                  className={`collections-archive-card home-collection-card${
                    index === 2 ? " home-collection-card--wide" : ""
                  }${collection.image ? " collections-archive-card--image" : ""}${
                    collection.tone ? ` collections-archive-card--${collection.tone}` : ""
                  }`}
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
                    <span>{collection.label}</span>
                    <h3>{collection.title}</h3>
                    <p>{collection.archiveDescription ?? collection.description}</p>
                    <strong>{collection.count}</strong>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </main>
      )}

      <nav className="bottom-nav" aria-label="Bottom navigation">
        <div className="bottom-nav__inner">
          <a
            className={`bottom-nav__item${navState === "home" ? " is-active" : ""}`}
            href="/"
            aria-label="Poetry home"
            onClick={(event) => {
              event.preventDefault();
              setScreen("home");
            }}
          >
            <span className="material-symbols-outlined">home</span>
          </a>
          <a
            className={`bottom-nav__item${navState === "compass" ? " is-active" : ""}`}
            href="/"
            aria-label="Compass"
            onClick={(event) => {
              event.preventDefault();
              setScreen("compass");
            }}
          >
            <span className="material-symbols-outlined">explore</span>
          </a>
          <a
            className={`bottom-nav__item${navState === "voices" || navState === "voiceDetail" ? " is-active" : ""}`}
            href="/"
            aria-label="Library"
            onClick={(event) => {
              event.preventDefault();
              setScreen("voices");
            }}
          >
            <span className="material-symbols-outlined">menu_book</span>
          </a>
          <a
            className={`bottom-nav__item${
              navState === "collections" || navState === "collectionDetail" ? " is-active" : ""
            }`}
            href="/"
            aria-label="Collection"
            onClick={(event) => {
              event.preventDefault();
              setScreen("collections");
            }}
          >
            <span className="material-symbols-outlined">collections_bookmark</span>
          </a>
        </div>
      </nav>
    </div>
  );
}
