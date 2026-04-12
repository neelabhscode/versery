/**
 * Curated corpus compiler and publisher.
 *
 * Source of truth: corpus/curated/*.json (editorial files)
 * Runtime artifacts: public/poems.json + public/poets.json + public/collections.json
 *
 * Usage:
 *   node scripts/curated-corpus.mjs compile
 *   node scripts/curated-corpus.mjs validate
 *   node scripts/curated-corpus.mjs apply --force
 */

import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, extname, join } from "path";
import { fileURLToPath } from "url";
import { orderedPortalTagsFromLines } from "./lean-portal-tags.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CURATED = join(ROOT, "corpus", "curated");
const PUBLIC = join(ROOT, "public");

const CANONICAL_POEMS = join(CURATED, "poems.json");
const CANONICAL_POETS = join(CURATED, "poets.json");
const POET_PROFILES = join(CURATED, "poet-profiles.json");
const CANONICAL_COLLECTIONS = join(CURATED, "collections.json");
const POEM_OF_DAY_POOL = join(CURATED, "poem-of-day-pool.json");
const PUBLIC_POEMS = join(PUBLIC, "poems.json");
const PUBLIC_POETS = join(PUBLIC, "poets.json");
const PUBLIC_COLLECTIONS = join(PUBLIC, "collections.json");

const HOMEPAGE_MOODS = ["Melancholic", "Ethereal", "Radiant", "Solitary"];
const REQUIRED_MOOD_COUNT = 6;
const VALID_PORTALS = new Set([
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
]);

const SOURCE_FILE_AUTHOR_MAP = {
  "eliot-excerpts.json": "T. S. Eliot",
  "frost-excerpts.json": "Robert Frost",
  "ghalib-excerpts.json": "Mirza Ghalib",
  "kipling-excerpts.json": "Rudyard Kipling",
  "tagore-excerpts.json": "Rabindranath Tagore",
  "kabir-excerpts-pd.json": "Kabir",
  "hafez-excerpts-pd.json": "Hafez",
  "keats-excerpts-pd.json": "John Keats",
  "dickinson-excerpts-pd.json": "Emily Dickinson",
  "rilke-excerpts-pd.json": "Rainer Maria Rilke",
  "gibran-excerpts-pd.json": "Kahlil Gibran",
  "ryokan-excerpts-pd.json": "Ryokan",
  "lao-tzu-excerpts-pd.json": "Lao Tzu",
  "bhagvada-gita-excerpts.json": "Bhagavad Gita",
};

const MOOD_TO_PORTALS = {
  melancholic: ["Melancholic", "Static"],
  grief: ["Melancholic", "Static"],
  longing: ["Drift", "Melancholic"],
  ethereal: ["Ethereal", "Calm"],
  wonder: ["Ethereal", "Lush", "Focus"],
  devotion: ["Ethereal", "Warmth", "Echo"],
  nature: ["Lush", "Calm", "Radiant"],
  radiant: ["Radiant", "Pulse"],
  joy: ["Radiant", "Pulse"],
  love: ["Warmth", "Radiant"],
  peace: ["Calm", "Echo", "Ethereal"],
  solitary: ["Solitary", "Echo", "Calm"],
  mortality: ["Solitary", "Melancholic", "Static"],
};

const DEFAULT_COLLECTIONS = [
  {
    id: "romantics",
    label: "Seasonal Selection",
    title: "The Romantics",
    description: "Intensity, nature, and the sublime in lyrical focus.",
    archiveDescription: "Exploring nature's intensity and interior weather.",
    image: "/collections/romantics.webp",
    artwork: "/collections/romantics.webp",
    featured: true,
    tone: "deep",
    curator: { name: "Neelabh", role: "Editor-in-Chief" },
    portalTags: ["Lush", "Ethereal", "Drift"],
  },
  {
    id: "mystics",
    label: "Eternal Knowledge",
    title: "Devotion & Mystery",
    description: "Poems of surrender, inner light, and spiritual wonder.",
    archiveDescription: "Where lyric prayer and philosophical awe converge.",
    image: "/collections/mystics.webp",
    artwork: "/collections/mystics.webp",
    tone: "sand",
    curator: { name: "Neelabh", role: "Archive Curator" },
    portalTags: ["Ethereal", "Calm", "Echo"],
  },
  {
    id: "nature",
    label: "Living Rhythm",
    title: "Nature's Pulse",
    description: "Leaf-light, weather, seasons, and elemental movement.",
    archiveDescription: "Quiet observations from the living world.",
    image: "/collections/nature.webp",
    artwork: "/collections/nature.webp",
    tone: "mist",
    curator: { name: "Neelabh", role: "Field Editor" },
    portalTags: ["Lush", "Calm", "Radiant"],
  },
  {
    id: "solitude",
    label: "Inner Life",
    title: "The Solitary Hour",
    description: "Poems for stillness, introspection, and private distance.",
    archiveDescription: "Lines for contemplative and solitary reading sessions.",
    image: "/collections/solitude.webp",
    artwork: "/collections/solitude.webp",
    tone: "plain",
    curator: { name: "Neelabh", role: "Resident Curator" },
    portalTags: ["Solitary", "Calm", "Echo"],
  },
  {
    id: "witness",
    label: "Against Forgetting",
    title: "Conflict & Testimony",
    description: "Poetry shaped by pressure, rupture, and historical witness.",
    archiveDescription: "Testimony, memory, and difficult truth in verse.",
    image: "/collections/witness.webp",
    artwork: "/collections/witness.webp",
    tone: "plain",
    curator: { name: "Neelabh", role: "Guest Editor" },
    portalTags: ["Static", "Pulse", "Melancholic"],
  },
];

const EXCLUDED_SOURCE_FILES = new Set([
  "japanese-haiku-masters.json",
]);

function loadPoetProfileMap() {
  if (!existsSync(POET_PROFILES)) return {};
  const raw = loadJson(POET_PROFILES);
  if (Array.isArray(raw)) {
    return Object.fromEntries(
      raw.filter((row) => row && row.id).map((row) => [row.id, row]),
    );
  }
  if (raw && typeof raw === "object") return raw;
  return {};
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const PREFERRED_POD_LINES_MIN = 4;
const PREFERRED_POD_LINES_MAX = 40;

function applyPoemOfDayFlags(poems) {
  if (!existsSync(POEM_OF_DAY_POOL)) {
    console.warn("Missing poem-of-day-pool.json; no poemOfDay flags will be written.");
    return;
  }
  const raw = loadJson(POEM_OF_DAY_POOL);
  const ids = Array.isArray(raw.ids) ? raw.ids : [];
  const idToPoem = new Map(poems.map((p) => [p.id, p]));
  for (const id of ids) {
    const poem = idToPoem.get(id);
    if (!poem) continue;
    poem.poemOfDay = true;
    const n = poem.linecount;
    if (typeof n === "number" && (n < PREFERRED_POD_LINES_MIN || n > PREFERRED_POD_LINES_MAX)) {
      console.warn(
        `Poem of the day pool: "${id}" has linecount ${n} (reader-friendly band is ${PREFERRED_POD_LINES_MIN}–${PREFERRED_POD_LINES_MAX})`,
      );
    }
  }
}

function validatePoemOfDayPool(poems) {
  const errors = [];
  if (!existsSync(POEM_OF_DAY_POOL)) {
    errors.push(`Missing ${POEM_OF_DAY_POOL}`);
    return errors;
  }
  const raw = loadJson(POEM_OF_DAY_POOL);
  const ids = Array.isArray(raw.ids) ? raw.ids : [];
  if (ids.length < 30) {
    errors.push(`poem-of-day-pool.json must list at least 30 ids (got ${ids.length})`);
  }
  const poemIds = new Set(poems.map((p) => p.id));
  for (const id of ids) {
    if (!poemIds.has(id)) {
      errors.push(`poem-of-day-pool.json references unknown poem id: ${id}`);
    }
  }
  const flagged = poems.filter((p) => p.poemOfDay === true);
  if (flagged.length < 30) {
    errors.push(
      `Expected at least 30 poems with poemOfDay after compile (got ${flagged.length}); check pool ids match compiled poem ids`,
    );
  }
  return errors;
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function toTitleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

function cleanText(raw = "") {
  const marker = "*** END OF THE PROJECT GUTENBERG";
  const truncated = raw.includes(marker) ? raw.slice(0, raw.indexOf(marker)) : raw;
  return truncated.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function parseLines(rawText = "") {
  return cleanText(rawText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseStanzas(rawText = "") {
  const cleaned = cleanText(rawText);
  if (!cleaned) return [];
  return cleaned
    .split(/\n\s*\n+/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((stanza) => stanza.length > 0);
}

function derivePortalsFromMoods(moods = []) {
  const portals = new Set();
  for (const mood of moods) {
    const normalized = String(mood).toLowerCase().trim();
    const mapped = MOOD_TO_PORTALS[normalized] ?? [];
    for (const tag of mapped) portals.add(tag);
  }
  return [...portals];
}

/** 12 compass + feeling tags — used only to pad up to a minimum tag count. */
const PORTAL_TAG_PAD_ORDER = [
  "Ethereal",
  "Calm",
  "Echo",
  "Lush",
  "Radiant",
  "Melancholic",
  "Solitary",
  "Pulse",
  "Drift",
  "Focus",
  "Warmth",
  "Static",
];

function ensureMinPortalTags(baseTags, item, min = 4) {
  const out = [...new Set((baseTags ?? []).filter((tag) => VALID_PORTALS.has(tag)))];
  if (out.length >= min) return out.slice(0, min);
  const extras = [
    ...derivePortalsFromMoods(item.moods ?? []),
    ...derivePortalsFromMoods(item.mood_chip ? [item.mood_chip] : []),
    ...PORTAL_TAG_PAD_ORDER,
  ];
  for (const tag of extras) {
    if (!VALID_PORTALS.has(tag)) continue;
    if (out.includes(tag)) continue;
    out.push(tag);
    if (out.length >= min) return out;
  }
  return out;
}

/**
 * Curator-authored portalTags (>=4 valid, deduped) keep their order.
 * Otherwise merge explicit tags with lean line-based ordering, then pad.
 */
function resolvePortalTagsForPoem(item, lines) {
  const explicit = [];
  const seen = new Set();
  for (const t of item.portalTags ?? []) {
    const tag = String(t).trim();
    if (!VALID_PORTALS.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    explicit.push(tag);
  }
  if (explicit.length >= 4) {
    return explicit.slice(0, 4);
  }
  const lean = orderedPortalTagsFromLines(lines);
  const out = [...explicit];
  for (const tag of lean) {
    if (out.length >= 4) break;
    if (!out.includes(tag)) out.push(tag);
  }
  return ensureMinPortalTags(out, item, 4);
}

function inferAuthor(item, sourceFile) {
  if (item.author && String(item.author).trim()) return String(item.author).trim();
  return SOURCE_FILE_AUTHOR_MAP[sourceFile] ?? "Versery Archive";
}

function inferPoetId(item, sourceFile, author) {
  if (item.poetId && String(item.poetId).trim()) return String(item.poetId).trim();
  if (sourceFile === "japanese-haiku-masters.json" && item.title && !item.author) {
    return slugify(item.title);
  }
  return slugify(author || sourceFile.replace(/\.json$/, ""));
}

function normalizePoem(item, sourceFile) {
  const author = inferAuthor(item, sourceFile);
  const poetId = inferPoetId(item, sourceFile, author);
  const title = String(item.title || item.id || "Untitled").trim();
  const stanzas = Array.isArray(item.stanzas) && item.stanzas.length
    ? item.stanzas
      .map((stanza) => stanza.map((line) => String(line).trim()).filter(Boolean))
      .filter((stanza) => stanza.length > 0)
    : parseStanzas(item.text ?? "");
  const lines = Array.isArray(item.lines)
    ? item.lines.map((line) => String(line).trim()).filter(Boolean)
    : (stanzas.length ? stanzas.flat() : parseLines(item.text ?? ""));
  const outStanzas = stanzas.length ? stanzas : [lines];
  const portalTags = resolvePortalTagsForPoem(item, lines);
  const idBase = item.id && String(item.id).trim() ? String(item.id).trim() : `${poetId}--${slugify(title)}`;
  const excerptFromLines = lines.slice(0, 2).join(" ");
  const excerpt = String(item.excerpt || excerptFromLines || title).trim();
  const moods = Array.isArray(item.moods) ? item.moods.map((m) => String(m).trim()).filter(Boolean) : [];

  return {
    id: idBase,
    title,
    author,
    poetId,
    lines,
    stanzas: outStanzas,
    linecount: lines.length,
    stanza_count: outStanzas.length,
    moods,
    portalTags,
    excerpt: excerpt.slice(0, 280),
    source: item.source ?? sourceFile.replace(/\.json$/, ""),
    mood_chip: item.mood_chip ?? null,
  };
}

function buildWorks(poems) {
  const sampleSize = Math.min(3, poems.length);
  if (sampleSize === 0) return [];
  const step = Math.max(1, Math.floor(poems.length / sampleSize));
  const indices = new Set([0, step, step * 2]);
  return [...indices]
    .map((idx) => poems[Math.min(idx, poems.length - 1)])
    .filter(Boolean)
    .slice(0, 3)
    .map((poem, i) => ({
      id: String(i + 1).padStart(2, "0"),
      title: poem.title,
      subtitle: `${poem.excerpt.split(/\s+/).slice(0, 8).join(" ")}…`,
      poemId: poem.id,
    }));
}

function compileCorpus() {
  const allJson = readdirSync(CURATED)
    .filter((name) => extname(name) === ".json")
    .filter((name) => !["poems.json", "poets.json", "collections.json"].includes(name));

  const rawPoems = [];
  for (const fileName of allJson) {
    if (EXCLUDED_SOURCE_FILES.has(fileName)) continue;
    const rows = loadJson(join(CURATED, fileName));
    if (!Array.isArray(rows)) continue;
    for (const row of rows) rawPoems.push(normalizePoem(row, fileName));
  }

  const dedupedPoems = [];
  const idCount = new Map();
  for (const poem of rawPoems) {
    if (!poem.lines.length) continue;
    const count = (idCount.get(poem.id) ?? 0) + 1;
    idCount.set(poem.id, count);
    if (count > 1) poem.id = `${poem.id}-${count}`;
    dedupedPoems.push(poem);
  }

  const byPoet = new Map();
  for (const poem of dedupedPoems) {
    const list = byPoet.get(poem.poetId) ?? [];
    list.push(poem);
    byPoet.set(poem.poetId, list);
  }

  const profileMap = loadPoetProfileMap();
  const existingPoets = existsSync(CANONICAL_POETS) ? loadJson(CANONICAL_POETS) : [];
  const poetSeedMap = new Map(
    (existingPoets ?? []).map((poet) => [poet.id, { ...poet, ...(profileMap[poet.id] ?? {}) }]),
  );

  const poets = [...byPoet.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([poetId, poems]) => {
      const seed =
        poetSeedMap.get(poetId) ?? (profileMap[poetId] ? { ...profileMap[poetId] } : {});
      const name = seed.name || toTitleCase(poems[0]?.author || poetId.replace(/-/g, " "));
      const portalFreq = {};
      for (const poem of poems) {
        for (const tag of poem.portalTags) {
          portalFreq[tag] = (portalFreq[tag] ?? 0) + 1;
        }
      }
      const topPortals = Object.entries(portalFreq)
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag)
        .slice(0, 4);
      return {
        id: poetId,
        name,
        fullName: seed.fullName ?? name,
        born: seed.born ?? null,
        died: seed.died ?? null,
        from: seed.from ?? "Unknown",
        era: seed.era ?? "Unknown",
        tag: seed.tag ?? "Curated Voice",
        essence: seed.essence ?? `Curated poetry voice: ${name}`,
        bio: seed.bio ?? `${name} appears in the Versery curated corpus.`,
        poemCount: poems.length,
        moods: seed.moods ?? [],
        portalTags: topPortals,
        works: buildWorks(poems),
        heroLabel: seed.heroLabel ?? null,
        resonance: seed.resonance ?? null,
        quote: seed.quote ?? null,
        quoteSource: seed.quoteSource ?? null,
      };
    });

  const collections = DEFAULT_COLLECTIONS.map((collection) => {
    const count = dedupedPoems.filter((poem) =>
      poem.portalTags.some((tag) => (collection.portalTags ?? []).includes(tag))
    ).length;
    return {
      ...collection,
      count: `${count} Collection${count === 1 ? "" : "s"}`,
    };
  });

  applyPoemOfDayFlags(dedupedPoems);

  writeJson(CANONICAL_POEMS, dedupedPoems);
  writeJson(CANONICAL_POETS, poets);
  writeJson(CANONICAL_COLLECTIONS, collections);
  return { poems: dedupedPoems, poets, collections };
}

function validateArtifacts(poems, poets, collections) {
  const errors = [];
  const poemIds = new Set();
  const poetIds = new Set(poets.map((poet) => poet.id));

  for (const poem of poems) {
    if (!poem.id || !poem.title || !poem.poetId) {
      errors.push(`Invalid poem core fields: ${JSON.stringify(poem.id ?? poem.title)}`);
      continue;
    }
    if (poemIds.has(poem.id)) errors.push(`Duplicate poem id: ${poem.id}`);
    poemIds.add(poem.id);
    if (!poetIds.has(poem.poetId)) errors.push(`Poem ${poem.id} references unknown poetId: ${poem.poetId}`);
    if (!Array.isArray(poem.lines) || poem.lines.length < 1) errors.push(`Poem ${poem.id} has empty lines`);
    if (!Array.isArray(poem.portalTags) || poem.portalTags.length < 4) {
      errors.push(`Poem ${poem.id} must have at least 4 portalTags (got ${poem.portalTags?.length ?? 0})`);
    }
    const invalidTag = poem.portalTags.find((tag) => !VALID_PORTALS.has(tag));
    if (invalidTag) errors.push(`Poem ${poem.id} has invalid portal tag: ${invalidTag}`);
  }

  for (const poet of poets) {
    if (!Array.isArray(poet.works)) continue;
    for (const work of poet.works) {
      if (!poemIds.has(work.poemId)) {
        errors.push(`Poet ${poet.id} has dangling works.poemId: ${work.poemId}`);
      }
    }
  }

  for (const mood of HOMEPAGE_MOODS) {
    const count = poems.filter((poem) => poem.portalTags.includes(mood)).length;
    if (count < REQUIRED_MOOD_COUNT) {
      errors.push(`Homepage mood coverage too low for ${mood}: ${count} poems (min ${REQUIRED_MOOD_COUNT})`);
    }
  }

  const collectionIds = new Set();
  for (const collection of collections) {
    if (!collection.id || !collection.title) errors.push(`Invalid collection entry: ${JSON.stringify(collection)}`);
    if (collectionIds.has(collection.id)) errors.push(`Duplicate collection id: ${collection.id}`);
    collectionIds.add(collection.id);
    for (const tag of collection.portalTags ?? []) {
      if (!VALID_PORTALS.has(tag)) errors.push(`Collection ${collection.id} has invalid portal tag: ${tag}`);
    }
  }

  errors.push(...validatePoemOfDayPool(poems));

  return errors;
}

function runValidate() {
  const poems = loadJson(CANONICAL_POEMS);
  const poets = loadJson(CANONICAL_POETS);
  const collections = existsSync(CANONICAL_COLLECTIONS) ? loadJson(CANONICAL_COLLECTIONS) : [];
  const errors = validateArtifacts(poems, poets, collections);
  if (errors.length) {
    console.error("\nValidation errors:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`Validated: ${poems.length} poems, ${poets.length} poets, ${collections.length} collections`);
}

function applyToPublic() {
  copyFileSync(CANONICAL_POEMS, PUBLIC_POEMS);
  copyFileSync(CANONICAL_POETS, PUBLIC_POETS);
  copyFileSync(CANONICAL_COLLECTIONS, PUBLIC_COLLECTIONS);
  console.log(`Copied curated artifacts to public:
  - ${PUBLIC_POEMS}
  - ${PUBLIC_POETS}
  - ${PUBLIC_COLLECTIONS}`);
}

function runCompile() {
  const { poems, poets, collections } = compileCorpus();
  const errors = validateArtifacts(poems, poets, collections);
  if (errors.length) {
    console.error("\nCompile failed validation:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`Compiled curated corpus:
  - poems: ${poems.length}
  - poets: ${poets.length}
  - collections: ${collections.length}`);
}

const cmd = process.argv[2];
const args = process.argv.slice(3);

if (cmd === "compile" || cmd === "sync") {
  runCompile();
} else if (cmd === "validate") {
  runValidate();
} else if (cmd === "apply") {
  if (!args.includes("--force")) {
    console.error("Refusing to overwrite public/*.json without --force");
    process.exit(1);
  }
  runCompile();
  applyToPublic();
} else {
  console.error("Usage: node scripts/curated-corpus.mjs <compile|validate|apply --force>");
  process.exit(1);
}
