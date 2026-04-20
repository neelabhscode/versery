import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const POEMS_PATH = join(ROOT, "public", "poems.json");
const OUT_DIR = join(ROOT, "src", "data", "daily");

const DAYS = 15;
const HERO_PER_DAY = 10;
const COLLECTIONS_PER_DAY = 3;
const SUPPORTING_PER_COLLECTION = 6;

const COLLECTION_NAMES = [
  "The Quiet Between Bells", "Where Dust Remembers", "Rooms Without Clocks",
  "The Weight of Small Things", "A Window Left Open", "What Stays After Rain",
  "The Long Stairwell", "Under the Same Lamp", "When Evening Leans In",
  "The Folded Map", "A House of Soft Echoes", "What the Silence Kept",
  "After the Last Footstep", "The Hour of Thin Light", "Where Pages Breathe",
  "The Nearness of Distant Days", "A Corridor of Weather", "What Remains Unsaid",
  "The Space Beside Your Name", "At the Edge of Warm Tea", "The Harbor of Unfinished Lines",
  "Where Winter Listens", "The Stillness Near Departure", "A Pocket of Late Sun",
  "The Sound of Returning", "Before the Door Opens", "A Small Province of Night",
  "Where Stone Learns Water", "The Distance Inside Home", "A Room Made of Waiting",
  "The Shape of Lingering", "When Lamps Forget to Sleep", "The Province of Faint Music",
  "A Narrow Bridge of Air", "Where Letters Grow Quiet", "The Grammar of Ash and Light",
  "A Field Behind Memory", "The Kindness of Empty Chairs", "What Lingers in Hallways",
  "The Far End of Tenderness", "A Weather of Half-Voices", "Where Morning Arrives Slowly",
  "The Drift of Old Keys", "A Margin for Breathing", "The Quiet That Carries",
];

const COLLECTION_TAGLINES = [
  "For when dusk sits beside you.", "For the hour after everyone leaves.", "For when the room keeps listening.",
  "For nights that move without noise.", "For when the kettle cools untouched.", "For when footsteps feel far away.",
  "For moments lit by a single lamp.", "For when memory leans over your shoulder.", "For the pause before speaking.",
  "For when rain writes on windows.", "For when pages feel like shelter.", "For when the hallway feels endless.",
  "For evenings with no clear ending.", "For when names return softly.", "For the quiet after long days.",
  "For when sleep arrives in fragments.", "For rooms heavy with old light.", "For when language is your company.",
  "For the minute before the call.", "For when clocks feel unusually loud.", "For when home feels slightly distant.",
  "For hours held by thin sunlight.", "For when doors stay half-open.", "For when streets empty too early.",
  "For when a chair remembers you.", "For the warmth after cold air.", "For when breath slows at last.",
  "For when silence feels inhabited.", "For when letters stay unsent.", "For when the night keeps watch.",
  "For mornings that begin quietly.", "For when shadows soften the room.", "For when footsteps fade downstairs.",
  "For when memory arrives uninvited.", "For the hush before dawn.", "For when waiting becomes gentle.",
  "For evenings touched by old songs.", "For when pages smell like rain.", "For when windows hold moonlight.",
  "For when the kettle starts again.", "For rooms full of held breaths.", "For when words stay close.",
  "For slow hours with open books.", "For when light falls in stripes.", "For when small sounds matter most.",
];

const COLLECTION_THEMES = [
  "A shelf of poems for evenings when ordinary objects feel quietly charged with meaning.",
  "Poems that stay close to thresholds, departures, and the soft mechanics of return.",
  "An inward territory of lamplight, weather, and private observation.",
  "Poems that hold small domestic scenes until they become almost sacred.",
  "Language for the suspended hour between conversation and sleep.",
  "A gathering of poems where memory and present tense overlap gently.",
  "Poems that move through corridors, stairwells, and rooms as emotional architecture.",
  "A restrained current of longing that never announces itself directly.",
  "Poems for the slow pivot from day-noise toward interior quiet.",
  "A thread of attention to rain, glass, paper, and hands at rest.",
  "Poems that make waiting feel textured rather than empty.",
  "A muted field of recollection, where detail carries the emotional weight.",
  "Poems that trace the distance between nearness and speech.",
  "An atmosphere of low light, small rituals, and unhurried noticing.",
  "A compact emotional landscape of return, pause, and half-spoken thought.",
];

function mulberry32(a) {
  return function rand() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, seed) {
  const out = [...arr];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function titleCase(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function firstStanza(poem) {
  if (Array.isArray(poem.stanzas) && poem.stanzas.length > 0) {
    const stanza = poem.stanzas[0].filter(Boolean).slice(0, 6);
    if (stanza.length > 0) return stanza.join("\n");
  }
  const lines = Array.isArray(poem.lines) ? poem.lines.filter(Boolean).slice(0, 6) : [];
  return lines.join("\n");
}

function firstLines(poem, count = 2) {
  const lines = Array.isArray(poem.lines) ? poem.lines.filter(Boolean).slice(0, count) : [];
  return lines.join("\n");
}

function normalizeTaglineWords(words) {
  return words.trim().split(/\s+/).filter(Boolean).slice(0, 9).join(" ");
}

function heroTagline(poem, day, idx) {
  const motifs = [
    "For the hush before dawn.",
    "For when the street goes quiet.",
    "For slow hours with a warm cup.",
    "For when rain taps the window.",
    "For the minute before sleep.",
    "For when memory sits nearby.",
    "For evenings with no audience.",
    "For when language keeps you company.",
    "For rooms lit by one lamp.",
    "For when footsteps fade downstairs.",
  ];
  const raw = motifs[(day * 11 + idx * 7 + poem.title.length) % motifs.length];
  return normalizeTaglineWords(raw.startsWith("For") ? raw : `For ${raw}`);
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function build() {
  const poems = JSON.parse(readFileSync(POEMS_PATH, "utf8"))
    .filter((p) => p?.title && p?.author && Array.isArray(p.lines) && p.lines.length >= 2)
    .map((p) => ({
      ...p,
      title: titleCase(p.title),
      author: titleCase(p.author),
    }));

  const uniqueByTitle = new Map();
  for (const poem of poems) {
    if (!uniqueByTitle.has(poem.title)) uniqueByTitle.set(poem.title, poem);
  }
  const pool = [...uniqueByTitle.values()];
  assert(pool.length >= 465, `Need >=465 unique poem titles, got ${pool.length}`);

  const byPortal = new Map();
  for (const poem of pool) {
    for (const tag of poem.portalTags ?? []) {
      if (!byPortal.has(tag)) byPortal.set(tag, []);
      byPortal.get(tag).push(poem);
    }
  }

  const portalCycle = ["Melancholic", "Ethereal", "Radiant", "Solitary", "Calm", "Drift", "Echo", "Lush", "Focus", "Warmth", "Static", "Pulse"];
  const allTitlesUsed = new Set();
  const resultDays = [];

  for (let day = 1; day <= DAYS; day += 1) {
    const daySeed = 1000 + day * 97;
    const usedHeroPoets = new Set();
    const picked = [];
    const shuffledPool = shuffle(pool, daySeed);

    const takePoem = (tagHint, fallbackSeedAdd = 0, enforceHeroPoetUnique = false) => {
      const tagged = tagHint ? shuffle(byPortal.get(tagHint) ?? [], daySeed + fallbackSeedAdd) : [];
      const source = tagged.length ? [...tagged, ...shuffledPool] : shuffledPool;
      for (const poem of source) {
        if (allTitlesUsed.has(poem.title)) continue;
        if (enforceHeroPoetUnique && usedHeroPoets.has(poem.author)) continue;
        allTitlesUsed.add(poem.title);
        if (enforceHeroPoetUnique) usedHeroPoets.add(poem.author);
        picked.push(poem);
        return poem;
      }
      throw new Error(`Could not pick poem for day ${day} with unique constraints`);
    };

    const heroPoems = [];
    for (let i = 0; i < HERO_PER_DAY; i += 1) {
      const tagHint = portalCycle[(day + i) % portalCycle.length];
      const poem = takePoem(tagHint, i, true);
      heroPoems.push({
        title: poem.title,
        poet: poem.author,
        firstStanza: firstStanza(poem),
        tagline: heroTagline(poem, day, i),
      });
    }

    const collections = [];
    for (let c = 0; c < COLLECTIONS_PER_DAY; c += 1) {
      const globalCollectionIndex = (day - 1) * COLLECTIONS_PER_DAY + c;
      const portalA = portalCycle[(day + c * 3) % portalCycle.length];
      const portalB = portalCycle[(day + c * 3 + 4) % portalCycle.length];
      const featured = takePoem(portalA, c + 200, false);
      const supporting = [];
      for (let i = 0; i < SUPPORTING_PER_COLLECTION; i += 1) {
        const hint = i % 2 === 0 ? portalA : portalB;
        supporting.push(takePoem(hint, i + c * 20 + 300, false));
      }

      collections.push({
        id: c === 0 ? "primary" : "secondary",
        name: COLLECTION_NAMES[globalCollectionIndex],
        tagline: normalizeTaglineWords(COLLECTION_TAGLINES[globalCollectionIndex]),
        theme: COLLECTION_THEMES[(globalCollectionIndex + day) % COLLECTION_THEMES.length],
        image: null,
        featuredPoem: {
          title: featured.title,
          poet: featured.author,
          firstLines: firstLines(featured, 2),
        },
        poems: supporting.map((poem) => ({
          title: poem.title,
          poet: poem.author,
        })),
      });
    }

    resultDays.push({
      date: `day-${String(day).padStart(2, "0")}`,
      heroPoems,
      collections,
    });
  }

  assert(allTitlesUsed.size === DAYS * (HERO_PER_DAY + COLLECTIONS_PER_DAY * (1 + SUPPORTING_PER_COLLECTION)),
    "Global title uniqueness failed");

  mkdirSync(OUT_DIR, { recursive: true });

  for (const dayData of resultDays) {
    const outPath = join(OUT_DIR, `${dayData.date}.json`);
    writeFileSync(outPath, `${JSON.stringify(dayData, null, 2)}\n`, "utf8");
  }

  const seenCollectionNames = new Set();
  for (const day of resultDays) {
    assert(day.heroPoems.length === 10, `${day.date}: hero count != 10`);
    assert(day.collections.length === 3, `${day.date}: collection count != 3`);
    const poetSet = new Set();
    for (const hp of day.heroPoems) {
      assert(hp.tagline.startsWith("For"), `${day.date}: hero tagline must start with For`);
      assert(hp.tagline.split(/\s+/).length < 10, `${day.date}: hero tagline too long`);
      assert(!poetSet.has(hp.poet), `${day.date}: duplicate hero poet ${hp.poet}`);
      poetSet.add(hp.poet);
    }
    for (const collection of day.collections) {
      assert(collection.image === null, `${day.date}: image must be null`);
      assert(collection.tagline.startsWith("For"), `${day.date}: collection tagline must start with For`);
      assert(collection.tagline.split(/\s+/).length < 10, `${day.date}: collection tagline too long`);
      assert(!seenCollectionNames.has(collection.name), `Duplicate collection name: ${collection.name}`);
      seenCollectionNames.add(collection.name);
      assert(collection.poems.length === SUPPORTING_PER_COLLECTION, `${day.date}: supporting poems count mismatch`);
    }
  }

  console.log(`Generated ${resultDays.length} files in src/data/daily`);
}

build();
