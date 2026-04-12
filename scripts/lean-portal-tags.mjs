/**
 * Build-time only: ordered top-4 portal tags from poem lines.
 * Mirrors vocabulary in src/lib/moods.js (MOOD_KEYWORDS + MOOD_TO_PORTALS + ALL_PORTALS).
 */

export const MOOD_KEYWORDS = {
  grief: [
    "death",
    "dead",
    "died",
    "loss",
    "lost",
    "mourn",
    "grave",
    "weep",
    "tears",
    "sorrow",
    "dark",
    "shadow",
    "cold",
    "pale",
    "night",
    "never",
    "gone",
    "woe",
    "funeral",
    "tomb",
    "ghost",
  ],
  longing: [
    "miss",
    "far",
    "away",
    "return",
    "remember",
    "dream",
    "wish",
    "wait",
    "seek",
    "yearning",
    "desire",
    "hope",
    "long",
    "distant",
    "apart",
    "absence",
    "again",
    "once",
    "when",
    "memory",
    "past",
  ],
  joy: [
    "happy",
    "joy",
    "laugh",
    "bright",
    "sun",
    "dance",
    "sing",
    "light",
    "free",
    "alive",
    "merry",
    "delight",
    "glad",
    "sweet",
    "bliss",
    "spring",
    "morning",
    "golden",
    "radiant",
    "smile",
    "young",
  ],
  wonder: [
    "wonder",
    "star",
    "sky",
    "infinite",
    "vast",
    "heaven",
    "eternity",
    "sublime",
    "mystery",
    "deep",
    "divine",
    "beauty",
    "awe",
    "eternal",
    "truth",
    "silence",
    "universe",
    "earth",
    "sea",
    "mountain",
    "cloud",
  ],
  love: [
    "love",
    "heart",
    "kiss",
    "tender",
    "dear",
    "embrace",
    "together",
    "beloved",
    "thee",
    "thy",
    "gentle",
    "soft",
    "warm",
    "sweet",
    "beautiful",
    "lips",
    "arms",
    "eyes",
    "soul",
    "mine",
  ],
  solitude: [
    "alone",
    "silence",
    "quiet",
    "still",
    "empty",
    "lonely",
    "single",
    "solitary",
    "apart",
    "hollow",
    "one",
    "dark",
    "shadow",
    "room",
    "door",
    "window",
    "wall",
    "grey",
    "fog",
  ],
  rage: [
    "rage",
    "anger",
    "fury",
    "fire",
    "burn",
    "fight",
    "war",
    "blood",
    "violent",
    "storm",
    "force",
    "sword",
    "battle",
    "hate",
    "thunder",
    "scream",
    "iron",
    "wound",
    "slaughter",
    "gun",
  ],
  peace: [
    "peace",
    "calm",
    "rest",
    "breathe",
    "ease",
    "gentle",
    "soft",
    "slow",
    "still",
    "tranquil",
    "sleep",
    "green",
    "meadow",
    "river",
    "quiet",
    "breeze",
    "leaf",
    "grass",
    "shore",
    "evening",
  ],
};

export const MOOD_TO_PORTALS = {
  grief: ["Static", "Melancholic"],
  longing: ["Drift", "Melancholic"],
  joy: ["Pulse", "Radiant"],
  wonder: ["Lush", "Ethereal", "Focus"],
  love: ["Warmth", "Radiant"],
  solitude: ["Calm", "Echo", "Solitary"],
  rage: ["Pulse", "Static"],
  peace: ["Calm", "Ethereal"],
};

/** Tie-break order when scores are equal (matches src/lib/moods.js ALL_PORTALS). */
export const ALL_PORTALS = [
  "Calm",
  "Pulse",
  "Focus",
  "Warmth",
  "Static",
  "Lush",
  "Drift",
  "Echo",
  "Melancholic",
  "Ethereal",
  "Radiant",
  "Solitary",
];

/** Diversity groups: at most one portal per group in the first pass. */
export const PORTAL_GROUP = {
  Calm: "cool_still",
  Echo: "cool_still",
  Solitary: "cool_still",
  Pulse: "heat_motion",
  Radiant: "heat_motion",
  Warmth: "heat_motion",
  Melancholic: "shadow_weight",
  Static: "shadow_weight",
  Drift: "mist_veil",
  Ethereal: "mist_veil",
  Lush: "living_green",
  Focus: "lucid_edge",
};

function tokenCount(lines) {
  const n = lines.join(" ").split(/\W+/).filter(Boolean).length;
  return Math.max(1, n);
}

function moodKeywordScores(lines) {
  const text = lines.join(" ").toLowerCase();
  const words = new Set(text.split(/\W+/).filter(Boolean));
  const scores = {};
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    scores[mood] = keywords.reduce((acc, kw) => acc + (words.has(kw) ? 1 : 0), 0);
  }
  return scores;
}

function portalScoresFromMoods(moodScores) {
  const out = Object.fromEntries(ALL_PORTALS.map((p) => [p, 0]));
  for (const [mood, raw] of Object.entries(moodScores)) {
    if (raw <= 0) continue;
    for (const portal of MOOD_TO_PORTALS[mood] ?? []) {
      out[portal] += raw;
    }
  }
  return out;
}

function compareByScoreThenIndex(portalScores) {
  return (a, b) => {
    const sa = portalScores[a] ?? 0;
    const sb = portalScores[b] ?? 0;
    if (sb !== sa) return sb - sa;
    return ALL_PORTALS.indexOf(a) - ALL_PORTALS.indexOf(b);
  };
}

/**
 * @param {string[]} lines
 * @returns {string[]} exactly four VALID portal names, rank order
 */
export function orderedPortalTagsFromLines(lines) {
  const safe = Array.isArray(lines) ? lines.map((l) => String(l).trim()).filter(Boolean) : [];
  if (!safe.length) {
    return ["Ethereal", "Calm", "Lush", "Focus"];
  }

  let moodScores = moodKeywordScores(safe);
  const hadSignal = Object.values(moodScores).some((s) => s > 0);
  if (!hadSignal) {
    moodScores = { ...moodScores, wonder: 1 };
  }

  const rawPortal = portalScoresFromMoods(moodScores);
  const norm = Math.sqrt(tokenCount(safe)) + 1;
  const portalScores = {};
  for (const p of ALL_PORTALS) {
    portalScores[p] = (rawPortal[p] ?? 0) / norm;
  }

  const sorted = [...ALL_PORTALS].sort(compareByScoreThenIndex(portalScores));

  const picked = [];
  const usedGroups = new Set();
  for (const p of sorted) {
    if (picked.length >= 4) break;
    if ((portalScores[p] ?? 0) <= 0) continue;
    const g = PORTAL_GROUP[p] ?? "other";
    if (usedGroups.has(g)) continue;
    usedGroups.add(g);
    picked.push(p);
  }

  for (const p of sorted) {
    if (picked.length >= 4) break;
    if (picked.includes(p)) continue;
    picked.push(p);
  }

  for (const p of ALL_PORTALS) {
    if (picked.length >= 4) break;
    if (!picked.includes(p)) picked.push(p);
  }

  return picked.slice(0, 4);
}
