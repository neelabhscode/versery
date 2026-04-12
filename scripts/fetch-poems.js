/**
 * Versery Data Pipeline
 *
 * Fetches poems from PoetryDB (15 poets) and Project Gutenberg (5 poets),
 * normalises them to a unified schema, classifies moods, and writes:
 *   - public/poems.json   (full corpus, ~2-3 MB)
 *   - public/poets.json   (20 poet metadata objects)
 *   - public/poets/*.jpg   (poet portraits, grayscale; run `npm run optimize:images` for WebP)
 *   - public/collections/*.jpg (collection card images; run `npm run optimize:images` for WebP)
 *
 * Run:  node scripts/fetch-poems.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { processPoetImage, processCollectionImage, getDirSizeInMB, ensureDir } from './image-utils.js'
import { MOOD_KEYWORDS, orderedPortalTagsFromLines } from './lean-portal-tags.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const GUTENBERG_CACHE_DIR = join(__dirname, 'gutenberg-sources')
const PUBLIC_DIR = join(ROOT, 'public')

// ---------------------------------------------------------------------------
// 1. POET DEFINITIONS
// ---------------------------------------------------------------------------

const POETS = [
  // ── Persian & Mystical (Gutenberg) ────────────────────────────────────────
  {
    id: 'omar-khayyam',
    name: 'Omar Khayyam',
    fullName: 'Omar Khayyam',
    born: 1048, died: 1131,
    from: 'Persia',
    era: 'Medieval Islamic',
    tag: 'Persian Sage',
    essence: 'Mortality and wine — the fleeting moment seized in quatrains',
    bio: 'Omar Khayyam was a Persian polymath: mathematician, astronomer, and poet. His Rubaiyat — translated into English by Edward FitzGerald — are meditations on fate, pleasure, and the brevity of life.',
    dominantMoods: ['longing', 'wonder', 'peace'],
    source: 'gutenberg',
    gutenbergId: '246',
    gutenbergParser: 'generic',
  },
  {
    id: 'rumi',
    name: 'Rumi',
    fullName: 'Jalal ad-Din Muhammad Rumi',
    born: 1207, died: 1273,
    from: 'Persia',
    era: 'Medieval Islamic',
    tag: 'Sufi Master',
    essence: 'Divine love and longing — the soul dancing toward the infinite',
    bio: 'Rumi was a 13th-century Persian mystic poet and founder of the whirling dervishes. His poetry expresses ecstatic union with the divine, transcending doctrine and dogma through the intoxication of spiritual love.',
    dominantMoods: ['love', 'wonder', 'joy'],
    source: 'gutenberg',
    gutenbergId: '57068',
    gutenbergParser: 'generic',
  },
  {
    id: 'hafez',
    name: 'Hafez',
    fullName: 'Hafez Shirazi',
    born: 1315, died: 1390,
    from: 'Persia',
    era: 'Medieval Islamic',
    tag: 'Persian Mystic',
    essence: 'Wine, ambiguity, and divine hints hidden in earthly pleasures',
    bio: 'Hafez was a Persian poet and mystic whose ghazals are among the most beloved in Persian literature. His poetry speaks in paradox and symbol, where wine and beloved become gateways to the divine.',
    dominantMoods: ['love', 'wonder', 'longing'],
    source: 'gutenberg',
    gutenbergId: '74883',
    gutenbergParser: 'generic',
  },
  {
    id: 'kabir',
    name: 'Kabir',
    fullName: 'Kabir',
    born: 1398, died: 1518,
    from: 'India',
    era: 'Medieval',
    tag: 'Weaver-Saint',
    essence: 'Blunt truth and direct communion — the weaver speaking to God as equal',
    bio: 'Kabir was an Indian mystic poet and saint who broke caste boundaries with radical directness. His vernacular verse attacks hypocrisy and claims direct personal access to the divine without priests or ritual.',
    dominantMoods: ['rage', 'wonder', 'love'],
    source: 'gutenberg',
    gutenbergId: '6519',
    gutenbergParser: 'generic',
  },

  // ── English Renaissance & Metaphysical (PoetryDB) ──────────────────────────
  {
    id: 'john-milton',
    name: 'John Milton',
    fullName: 'John Milton',
    born: 1608, died: 1674,
    from: 'England',
    era: 'Renaissance',
    tag: 'Epic Poet',
    essence: 'The clash of light and shadow — Paradise lost and regained in verse',
    bio: 'John Milton was an English poet and political thinker whose Paradise Lost is one of the greatest epic poems in English. His mastery of blank verse and philosophical depth made him a foundational voice of Western literature.',
    dominantMoods: ['wonder', 'rage', 'grief'],
    source: 'poetrydb',
    poetryDbName: 'John Milton',
  },
  {
    id: 'george-herbert',
    name: 'George Herbert',
    fullName: 'George Herbert',
    born: 1593, died: 1633,
    from: 'England',
    era: 'Renaissance',
    tag: 'Metaphysical Poet',
    essence: 'Devotion in precise form — the soul laid bare in sacred verse',
    bio: 'George Herbert was an English poet and cleric whose metaphysical verses marry technical brilliance with spiritual anguish. Works like The Altar and Love (III) use wit and paradox to explore faith and doubt.',
    dominantMoods: ['love', 'wonder', 'longing'],
    source: 'poetrydb',
    poetryDbName: 'George Herbert',
  },

  // ── English Romantic (PoetryDB) ───────────────────────────────────────────
  {
    id: 'coleridge',
    name: 'Samuel Taylor Coleridge',
    fullName: 'Samuel Taylor Coleridge',
    born: 1772, died: 1834,
    from: 'England',
    era: 'Romantic',
    tag: 'Visionary Poet',
    essence: 'The dream and the nightmare — imagination stretched to its gothic extreme',
    bio: 'Samuel Taylor Coleridge was an English poet, philosopher, and literary critic, co-founder of the Romantic Age. The Rime of the Ancient Mariner and Kubla Khan are masterworks of visionary power and linguistic music.',
    dominantMoods: ['wonder', 'grief', 'solitude'],
    source: 'poetrydb',
    poetryDbName: 'Samuel Taylor Coleridge',
    gutenbergFallbackId: '8208',
    gutenbergFallbackParser: 'generic',
  },
  {
    id: 'william-blake',
    name: 'William Blake',
    fullName: 'William Blake',
    born: 1757, died: 1827,
    from: 'England',
    era: 'Romantic',
    tag: 'Visionary Romantic',
    essence: 'Imagination as the divine force that liberates the human soul',
    bio: 'William Blake was an English poet, painter, and printmaker, a seminal figure of the Romantic Age. His visionary work bridged the spiritual and revolutionary, from Songs of Innocence to the prophetic books.',
    dominantMoods: ['wonder', 'rage', 'joy'],
    source: 'poetrydb',
    poetryDbName: 'William Blake',
  },
  {
    id: 'keats',
    name: 'John Keats',
    fullName: 'John Keats',
    born: 1795, died: 1821,
    from: 'England',
    era: 'Romantic',
    tag: 'Romantic Ode Master',
    essence: 'Beauty, transience, and the ache of the senses pressed against mortality',
    bio: 'John Keats was one of the most celebrated English Romantic poets. Despite dying at 25, he produced sensuous, philosophical verse of extraordinary richness, including his celebrated odes.',
    dominantMoods: ['longing', 'wonder', 'grief'],
    source: 'poetrydb',
    poetryDbName: 'John Keats',
  },

  // ── English Renaissance & Classic (PoetryDB) ──────────────────────────────
  {
    id: 'shakespeare',
    name: 'William Shakespeare',
    fullName: 'William Shakespeare',
    born: 1564, died: 1616,
    from: 'England',
    era: 'Renaissance',
    tag: 'Renaissance Master',
    essence: 'The universal voice of human nature, passion, and time\'s decay',
    bio: 'William Shakespeare was an English playwright and poet, widely regarded as the greatest writer in the English language. His 154 sonnets are meditations on love, beauty, mortality, and the power of time.',
    dominantMoods: ['love', 'wonder', 'longing'],
    source: 'poetrydb',
    poetryDbName: 'William Shakespeare',
  },

  // ── American Voices (PoetryDB) ────────────────────────────────────────────
  {
    id: 'dickinson',
    name: 'Emily Dickinson',
    fullName: 'Emily Dickinson',
    born: 1830, died: 1886,
    from: 'America',
    era: 'Victorian',
    tag: 'American Recluse',
    essence: 'Death, eternity, and the interior life compressed into dashes and hymn',
    bio: 'Emily Dickinson was an American poet whose unconventional syntax and imagery created a body of work unlike anything before it. Her poems speak across time with startling immediacy and psychological depth.',
    dominantMoods: ['solitude', 'wonder', 'grief'],
    source: 'poetrydb',
    poetryDbName: 'Emily Dickinson',
  },
  {
    id: 'whitman',
    name: 'Walt Whitman',
    fullName: 'Walt Whitman',
    born: 1819, died: 1892,
    from: 'America',
    era: 'Transcendentalist',
    tag: 'American Bard',
    essence: 'The democratic soul — all bodies, all voices, one immense song',
    bio: 'Walt Whitman was an American poet whose groundbreaking Leaves of Grass introduced expansive free verse. His long lines and catalogs of American life transformed what poetry could contain and express.',
    dominantMoods: ['joy', 'wonder', 'love'],
    source: 'poetrydb',
    poetryDbName: 'Walt Whitman',
  },
  {
    id: 'poe',
    name: 'Edgar Allan Poe',
    fullName: 'Edgar Allan Poe',
    born: 1809, died: 1849,
    from: 'America',
    era: 'Gothic Romanticism',
    tag: 'Gothic Romantic',
    essence: 'Beauty as shadow — the music of grief, madness, and the sublime dark',
    bio: 'Edgar Allan Poe was an American writer known for poetry and stories of mystery and the macabre. His poems — The Raven, Annabel Lee, The Bells — are masterworks of sonic intensity and psychological darkness.',
    dominantMoods: ['grief', 'longing', 'solitude'],
    source: 'poetrydb',
    poetryDbName: 'Edgar Allan Poe',
  },
  {
    id: 'dunbar',
    name: 'Paul Laurence Dunbar',
    fullName: 'Paul Laurence Dunbar',
    born: 1872, died: 1906,
    from: 'America',
    era: 'Victorian',
    tag: 'American Folk Voice',
    essence: 'Dignity, music, and the double consciousness of joy worn over grief',
    bio: 'Paul Laurence Dunbar was the first African-American poet to gain national prominence. He wrote in both standard English and dialect, weaving folk song, lyric beauty, and unflinching truth about race in America.',
    dominantMoods: ['joy', 'grief', 'solitude'],
    source: 'poetrydb',
    poetryDbName: 'Paul Laurence Dunbar',
  },
  {
    id: 'wheatley',
    name: 'Phillis Wheatley',
    fullName: 'Phillis Wheatley',
    born: 1753, died: 1784,
    from: 'America',
    era: 'Colonial',
    tag: 'Pioneer Voice',
    essence: 'The first published Black poet in English — breaking chains with eloquence',
    bio: 'Phillis Wheatley was an African-American poet and the first Black author to publish a book in English. Enslaved in Boston, she proved her humanity and genius through classical verse that challenged racism itself.',
    dominantMoods: ['wonder', 'love', 'rage'],
    source: 'poetrydb',
    poetryDbName: 'Phillis Wheatley',
  },

  // ── British Modern & Victorian (PoetryDB) ──────────────────────────────────
  {
    id: 'burns',
    name: 'Robert Burns',
    fullName: 'Robert Burns',
    born: 1759, died: 1796,
    from: 'Scotland',
    era: 'Romantic',
    tag: 'Scottish Bard',
    essence: 'Love, nature, and the egalitarian warmth of the Scottish soul',
    bio: "Robert Burns was Scotland's national poet. Writing in Scots dialect and English, he produced love songs, drinking songs, and political verse of enduring power, from A Red, Red Rose to A Man's a Man.",
    dominantMoods: ['love', 'joy', 'longing'],
    source: 'poetrydb',
    poetryDbName: 'Robert Burns',
  },
  {
    id: 'edward-thomas',
    name: 'Edward Thomas',
    fullName: 'Edward Thomas',
    born: 1878, died: 1917,
    from: 'England',
    era: 'Modern',
    tag: 'Nature Poet',
    essence: 'Subtle observation of landscape and memory — the ordinary made luminous',
    bio: 'Edward Thomas was an English poet whose nature poetry subtly captures the English countryside with psychological complexity. Works like Adlestrop and The Path bridge late Romanticism and modernism, melding observation with emotional depth.',
    dominantMoods: ['peace', 'longing', 'wonder'],
    source: 'poetrydb',
    poetryDbName: 'Edward Thomas',
  },
  {
    id: 'hopkins',
    name: 'Gerard Manley Hopkins',
    fullName: 'Gerard Manley Hopkins',
    born: 1844, died: 1889,
    from: 'England',
    era: 'Victorian',
    tag: 'Modern Innovator',
    essence: 'Sprung rhythm and divine radiance — language remade for beauty and faith',
    bio: 'Gerard Manley Hopkins was an English poet whose innovative sprung rhythm and vivid language created a distinctly modern voice. His spiritual intensity and technical brilliance, as in God\'s Grandeur, influenced generations of poets.',
    dominantMoods: ['love', 'wonder', 'joy'],
    source: 'poetrydb',
    poetryDbName: 'Gerard Manley Hopkins',
  },
  {
    id: 'owen',
    name: 'Wilfred Owen',
    fullName: 'Wilfred Owen',
    born: 1893, died: 1918,
    from: 'England',
    era: 'Modern',
    tag: 'War Poet',
    essence: 'The horror and pity of war — beauty twisted into terrible truth',
    bio: 'Wilfred Owen was a British poet of World War I who used traditional forms to convey the psychological and physical devastation of trench warfare. His poems, from Dulce et Decorum Est to Strange Meeting, are testimony and elegy.',
    dominantMoods: ['rage', 'grief', 'solitude'],
    source: 'poetrydb',
    poetryDbName: 'Wilfred Owen',
  },
  {
    id: 'rossetti',
    name: 'Christina Rossetti',
    fullName: 'Christina Georgina Rossetti',
    born: 1830, died: 1894,
    from: 'England',
    era: 'Victorian',
    tag: 'Pre-Raphaelite Voice',
    essence: 'Devotion, longing, and the quiet persistence of love beyond death',
    bio: 'Christina Rossetti was one of the foremost Victorian poets. Her devotional verse and sonnets, including Monna Innominata, combine formal rigour with intense emotional depth and spiritual yearning.',
    dominantMoods: ['longing', 'love', 'grief'],
    source: 'poetrydb',
    poetryDbName: 'Christina Rossetti',
  },
]

// ---------------------------------------------------------------------------
// 2. MOOD CLASSIFICATION (MOOD_KEYWORDS from lean-portal-tags.mjs)
// ---------------------------------------------------------------------------

function classifyMoods(lines) {
  const text = lines.join(' ').toLowerCase()
  const words = text.split(/\W+/)

  const scores = {}
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    scores[mood] = keywords.reduce((acc, kw) => acc + (words.includes(kw) ? 1 : 0), 0)
  }

  const sorted = Object.entries(scores)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([mood]) => mood)

  return sorted.length > 0 ? sorted : ['wonder']
}

// ---------------------------------------------------------------------------
// 3. UTILITIES
// ---------------------------------------------------------------------------

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

function makePoemId(poetId, title) {
  return `${poetId}--${slugify(title)}`
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithRetry(url, attempts = 3, delayMs = 1500) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Versery-DataPipeline/1.0 (poetry app, educational)' },
      })
      if (res.ok) return res
      if (res.status === 404) return null           // not found — don't retry
      if (res.status === 429 || res.status >= 500) {
        if (i < attempts - 1) await sleep(delayMs * (i + 1))
        continue
      }
      return null
    } catch {
      if (i < attempts - 1) await sleep(delayMs * (i + 1))
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// 4. POETRYDB FETCHER
// ---------------------------------------------------------------------------

async function tryPoetryDBName(namesToTry) {
  for (const name of namesToTry) {
    const url = `https://poetrydb.org/author/${encodeURIComponent(name)}`
    const res = await fetchWithRetry(url, 3, 1500)
    if (!res) continue
    let raw
    try { raw = await res.json() } catch { continue }
    if (Array.isArray(raw) && raw.length > 0) return raw
    await sleep(400)
  }
  return null
}

async function fetchFromPoetryDB(poet) {
  const namesToTry = [poet.poetryDbName, poet.poetryDbNameAlt].filter(Boolean)
  console.log(`  Fetching PoetryDB: ${poet.name}…`)

  const raw = await tryPoetryDBName(namesToTry)
  if (!raw) {
    if (poet.gutenbergFallbackId) {
      console.warn(`  ⚠ PoetryDB unavailable for ${poet.name} — trying Gutenberg fallback…`)
      return fetchFromGutenbergFallback(poet)
    }
    console.warn(`  ⚠ Could not fetch ${poet.name} — skipping`)
    return []
  }

  const poems = raw
    .filter(p => p.lines && p.lines.length > 0)
    .map(p => {
      const lines = p.lines.map(l => l.trim()).filter(Boolean)
      const moods = classifyMoods(lines)
      return {
        id: makePoemId(poet.id, p.title),
        title: p.title,
        author: poet.name,
        poetId: poet.id,
        lines,
        linecount: lines.length,
        moods,
        portalTags: orderedPortalTagsFromLines(lines),
        excerpt: lines.slice(0, 2).join(' '),
      }
    })

  console.log(`  ✓ ${poet.name}: ${poems.length} poems`)
  return poems
}

// ---------------------------------------------------------------------------
// 5. GUTENBERG FETCHER + PARSERS
// ---------------------------------------------------------------------------

const GUTENBERG_URL_TEMPLATES = [
  id => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
  id => `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
  id => `https://www.gutenberg.org/files/${id}/${id}.txt`,
]

async function downloadGutenbergText(gutenbergId, cacheFile) {
  if (existsSync(cacheFile)) {
    console.log(`  Using cached: ${cacheFile}`)
    return readFileSync(cacheFile, 'utf8')
  }

  for (const template of GUTENBERG_URL_TEMPLATES) {
    const url = template(gutenbergId)
    console.log(`  Trying: ${url}`)
    const res = await fetchWithRetry(url, 3, 2000)
    if (res) {
      const text = await res.text()
      if (text.length > 1000) {
        writeFileSync(cacheFile, text, 'utf8')
        console.log(`  ✓ Downloaded ${Math.round(text.length / 1024)} KB → cached`)
        return text
      }
    }
    await sleep(1000)
  }

  console.warn(`  ⚠ Could not download Gutenberg #${gutenbergId}`)
  return null
}

// Strip Gutenberg header / footer boilerplate
function stripGutenbergWrapper(text) {
  // Normalise line endings first (Gutenberg uses CRLF)
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Remove everything before the first "*** START OF" marker
  const startMatch = text.match(/\*{3}\s*START OF[^\n]*\n/i)
  if (startMatch) {
    text = text.slice(startMatch.index + startMatch[0].length)
  }
  // Remove everything from "*** END OF" onwards
  const endMatch = text.match(/\*{3}\s*END OF/i)
  if (endMatch) {
    text = text.slice(0, endMatch.index)
  }
  return text.trim()
}

// Titles that are definitely not poems
const SKIP_TITLES = new Set([
  'introduction', 'preface', 'contents', 'notes', 'appendix',
  'advertisement', 'dedication', 'prologue', 'epilogue', 'index',
  'glossary', 'bibliography', 'acknowledgements', 'foreword',
  'about', 'translator', 'transcriber', 'errata', 'colophon',
])

const SKIP_TITLE_PATTERNS = [
  /^chapter\s+[ivxlcdm\d]/i,
  /^volume\s+[ivxlcdm\d]/i,
  /edited\s+(with|by)/i,
  /textual\s+notes/i,
  /^note\s+to/i,
  /^notes?\s+on/i,
  /^by\s+[a-z]/i,           // "By Thomas Hutchinson"
  /transcriber'?s?\s+note/i,
]

// Normalise parsed poem lines: remove blanks at edges, filter junk
function cleanLines(lines) {
  return lines
    .map(l => l.trim())
    .filter(l => l.length > 0 && l.length < 200)
    .filter(l => !/^[IVXLCDM]+\.?\s*$/.test(l))          // lone Roman numerals
    .filter(l => !/^\s*[IVXLCDM]+\.\s+\d+\.\s*_/.test(l)) // Kabir ref headers: "I.  13.  _..._"
    .filter(l => !/^_[^_]{1,80}_$/.test(l))               // full italic-only lines (original language)
}

function buildPoem(poet, title, rawLines) {
  const lines = cleanLines(rawLines)
  if (lines.length < 3) return null

  // Skip obvious non-poem titles
  const titleLower = title.toLowerCase().trim()
  if (SKIP_TITLES.has(titleLower)) return null
  if (SKIP_TITLE_PATTERNS.some(re => re.test(titleLower))) return null

  // Reject entries that look like prose (too many long lines, or editor/publisher text)
  const longLines = lines.filter(l => l.length > 120).length
  if (longLines > lines.length * 0.4) return null                    // >40% lines are prose-length
  if (/edited by|published by|oxford university|macmillan|university press/i.test(lines.slice(0, 4).join(' '))) return null

  const moods = classifyMoods(lines)

  // Build excerpt from first 2 non-short lines
  const excerptLines = lines.filter(l => l.length > 10).slice(0, 2)
  const excerpt = excerptLines.join(' ') || lines.slice(0, 2).join(' ')

  return {
    id: makePoemId(poet.id, title),
    title,
    author: poet.name,
    poetId: poet.id,
    lines,
    linecount: lines.length,
    moods,
    portalTags: orderedPortalTagsFromLines(lines),
    excerpt: excerpt.slice(0, 200),
  }
}

// ── Generic titled-collection parser ──────────────────────────────────────
// Works for most 19th-century English poetry collections on Gutenberg.
// Strategy 1: ALL CAPS or Title Case headings followed by blank line + verse.
// Strategy 2: first-line-as-title paragraph split (for collections without headings).
function parseGeneric(text, poet) {
  text = stripGutenbergWrapper(text)
  const poems = []

  // Match lines in ALL CAPS (3+ chars) separated by double newlines from body
  const parts = text.split(/\n{2,}([A-Z][A-Z\s,'.()\-]{2,80}[A-Z.)])\n{2,}/)

  for (let i = 1; i + 1 < parts.length; i += 2) {
    const title = parts[i].trim()
    if (title.length < 3) continue
    if (SKIP_TITLE_PATTERNS.some(re => re.test(title))) continue
    if (/^(CONTENTS|PREFACE|NOTES|APPENDIX|INTRODUCTION|CHAPTER|VOLUME|ADVERTISEMENT|DEDICATION|ERRATA|COLOPHON|FOOTNOTE|GLOSSARY|BIBLIOGRAPHY|INDEX|FINIS)/.test(title)) continue
    const body = parts[i + 1].split('\n')
    const poem = buildPoem(poet, toTitleCase(title), body)
    if (poem) poems.push(poem)
  }

  // Strategy 2: paragraph split using first line as title
  if (poems.length < 10) {
    const paragraphs = text.split(/\n{3,}/)
    for (const para of paragraphs) {
      const lines = para.trim().split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length < 4 || lines.length > 80) continue
      const avgLen = lines.reduce((s, l) => s + l.length, 0) / lines.length
      if (avgLen > 80 || avgLen < 10) continue
      const firstLine = lines[0]
      // Use first line as title only if it looks like a poem title (not too long, no mid-sentence feel)
      if (firstLine.length > 3 && firstLine.length <= 70 && !/[,;:]$/.test(firstLine)) {
        const poem = buildPoem(poet, firstLine, lines.slice(1))
        if (poem) poems.push(poem)
      }
    }
  }

  console.log(`  ✓ ${poet.name}: ${poems.length} poems parsed`)
  return poems
}

// ── EBB: Sonnets from the Portuguese (#2179) ──────────────────────────────
// Format: numbered sonnets (I. through XLIV.) separated by Roman numerals.
// Uses first line of each sonnet as its title.
function parseEBB(text, poet) {
  text = stripGutenbergWrapper(text)
  const poems = []

  // Split on standalone Roman numerals: "\n\nI.\n\n" style
  const parts = text.split(/\n{2,}([IVXLCDM]+)\.\s*\n{2,}/)

  for (let i = 1; i + 1 < parts.length; i += 2) {
    const body = parts[i + 1].split('\n').map(l => l.trim()).filter(Boolean)
    if (body.length < 4) continue
    // Use opening line as title (standard for untitled sonnets)
    const firstLine = body[0].replace(/["""'']/g, '').trim()
    const title = firstLine.length > 3 && firstLine.length <= 80
      ? firstLine
      : `Sonnet ${parts[i].trim()}`
    const poem = buildPoem(poet, title, body)
    if (poem) poems.push(poem)
  }

  // Fallback: paragraph split (sonnets are ~14 lines)
  if (poems.length < 10) {
    const paragraphs = text.split(/\n{3,}/)
    for (const para of paragraphs) {
      const lines = para.trim().split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length < 8 || lines.length > 20) continue
      const firstLine = lines[0].replace(/["""'']/g, '').trim()
      if (firstLine.length < 4 || firstLine.length > 80) continue
      const poem = buildPoem(poet, firstLine, lines.slice(1))
      if (poem) poems.push(poem)
    }
  }

  console.log(`  ✓ ${poet.name}: ${poems.length} poems parsed`)
  return poems
}

// ── Tennyson: In Memoriam A.H.H. (#521) ───────────────────────────────────
// Format: 131 numbered sections in Roman numerals.
// Falls back to generic parser if text has a different structure (other editions).
function parseTennyson(text, poet) {
  text = stripGutenbergWrapper(text)
  const poems = []

  // In Memoriam sections: "\n\nI.\n\n lines" or "\n\nXXXI.\n\n lines"
  const parts = text.split(/\n{2,}([IVXLCDM]+)\.\s*\n{2,}/)

  for (let i = 1; i + 1 < parts.length; i += 2) {
    const numeral = parts[i].trim()
    const body = parts[i + 1].split('\n')
    const poem = buildPoem(poet, `In Memoriam ${numeral}`, body)
    if (poem) poems.push(poem)
  }

  // If the text has proper titles (a different Tennyson collection), use generic parser
  if (poems.length < 10) {
    return parseGeneric(text, poet)
  }

  console.log(`  ✓ ${poet.name}: ${poems.length} poems parsed`)
  return poems
}

// ── Tagore: Gitanjali (#7164) ─────────────────────────────────────────────
// Format: "GITANJALI\n\n\n1.\n\nThou hast made me endless…\n\n\n2.\n\nWhen thou…"
// Numbered sections separated by blank lines — prose poems.
function parseTagore(text, poet) {
  text = stripGutenbergWrapper(text)
  const poems = []

  // Split on standalone number + period: "\n\n\n1.\n\n" or "\n1.\n\n"
  const parts = text.split(/\n{2,}(\d{1,3})\.\n{2,}/)

  // parts = [preamble, "1", body1, "2", body2, …]
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const num = parts[i].trim()
    const body = parts[i + 1]
    // Each poem is prose — split into logical lines at sentence boundaries
    const prose = body.replace(/\n+/g, ' ').trim()
    if (prose.length < 20) continue

    // Split on period+space to get "lines" (sentence-level)
    const lines = prose.split(/(?<=[.!?])\s+/).filter(l => l.trim().length > 5)

    const poem = buildPoem(poet, `Gitanjali ${num}`, lines)
    if (poem) poems.push(poem)
  }

  if (poems.length < 10) {
    console.warn('  Tagore: numbered split yielded few results, trying paragraph split…')
    const paragraphs = text.split(/\n{3,}/)
    for (let i = 0; i < paragraphs.length; i++) {
      const prose = paragraphs[i].replace(/\n+/g, ' ').trim()
      if (prose.length < 30 || /^\d+\.$/.test(prose)) continue
      const lines = prose.split(/(?<=[.!?])\s+/).filter(l => l.trim().length > 5)
      if (lines.length < 2) continue
      const poem = buildPoem(poet, `Tagore ${i + 1}`, lines)
      if (poem) poems.push(poem)
    }
  }

  console.log(`  ✓ Tagore: ${poems.length} poems parsed`)
  return poems
}

// ── Byron: "Childe Harold's Pilgrimage" (#10774) ─────────────────────────
// This is a cantos-based epic poem — split by Canto headings and stanzas.
function parseByron(text, poet) {
  text = stripGutenbergWrapper(text)
  const poems = []

  // First try: Canto-based split ("CANTO THE FIRST", "CANTO I", etc.)
  const cantoParts = text.split(/\n{2,}(CANTO\s+(?:THE\s+)?[IVXLCDM\w]+[^\n]{0,60})\n{2,}/i)
  if (cantoParts.length > 2) {
    for (let i = 1; i + 1 < cantoParts.length; i += 2) {
      const title = cantoParts[i].trim()
      const body = cantoParts[i + 1].split('\n')
      const poem = buildPoem(poet, toTitleCase(title), body)
      if (poem) poems.push(poem)
    }
  }

  // Fallback: all-caps section headings (for other Byron works in the file)
  if (poems.length < 3) {
    const parts = text.split(/\n{2,}([A-Z][A-Z\s,'.-]{2,80})\n{2,}/)
    for (let i = 1; i + 1 < parts.length; i += 2) {
      const title = parts[i].trim()
      if (title.length < 3) continue
      if (SKIP_TITLE_PATTERNS.some(re => re.test(title))) continue
      if (/^(CONTENTS|PREFACE|NOTES|APPENDIX|INTRODUCTION|CHAPTER|VOLUME|ADVERTISEMENT|DEDICATION)/.test(title)) continue
      const body = parts[i + 1].split('\n')
      const poem = buildPoem(poet, toTitleCase(title), body)
      if (poem) poems.push(poem)
    }
  }

  // Final fallback: stanza-level paragraph split
  if (poems.length < 3) {
    const stanzas = text.split(/\n{3,}/)
    for (let i = 0; i < stanzas.length; i++) {
      const lines = stanzas[i].trim().split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length < 4 || lines.length > 100) continue
      const avgLen = lines.reduce((s, l) => s + l.length, 0) / lines.length
      if (avgLen > 90) continue
      const poem = buildPoem(poet, `Byron ${i + 1}`, lines)
      if (poem) poems.push(poem)
    }
  }

  console.log(`  ✓ Byron (Gutenberg fallback): ${poems.length} poems parsed`)
  return poems
}

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

const GUTENBERG_PARSERS = {
  tagore:   parseTagore,
  generic:  parseGeneric,
  ebb:      parseEBB,
  tennyson: parseTennyson,
  byron:    parseByron,
}

async function fetchFromGutenbergFallback(poet) {
  const cacheFile = join(GUTENBERG_CACHE_DIR, `${poet.id}-fallback.txt`)
  const text = await downloadGutenbergText(poet.gutenbergFallbackId, cacheFile)
  if (!text) return []
  const parser = GUTENBERG_PARSERS[poet.gutenbergFallbackParser]
  return parser ? parser(text, poet) : []
}

async function fetchFromGutenberg(poet) {
  const cacheFile = join(GUTENBERG_CACHE_DIR, `${poet.id}.txt`)
  console.log(`  Fetching Gutenberg #${poet.gutenbergId}: ${poet.name}…`)

  const text = await downloadGutenbergText(poet.gutenbergId, cacheFile)
  if (!text) return []

  const parser = GUTENBERG_PARSERS[poet.gutenbergParser]
  if (!parser) {
    console.warn(`  ⚠ No parser for ${poet.gutenbergParser}`)
    return []
  }

  return parser(text, poet)
}

// ---------------------------------------------------------------------------
// 5. IMAGE FETCHING
// ---------------------------------------------------------------------------

// Fetch poet image from Wikimedia Commons
async function fetchPoetImageFromWikipedia(poetId, poetName) {
  try {
    // Search Commons for images of the poet
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(poetName)}&srnamespace=6&format=json&srlimit=1`
    const searchRes = await fetch(searchUrl, {
      timeout: 5000,
      headers: { 'User-Agent': 'Versery/1.0' }
    })

    if (!searchRes.ok) {
      return null
    }

    const searchData = await searchRes.json()
    if (!searchData.query?.search || searchData.query.search.length === 0) {
      return null
    }

    const imageName = searchData.query.search[0].title

    // Get image URL
    const imageUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(imageName)}&prop=imageinfo&iiprop=url&format=json`
    const imageRes = await fetch(imageUrl, { timeout: 5000 })
    const imageData = await imageRes.json()

    const page = Object.values(imageData.query.pages)[0]
    if (page.imageinfo?.[0]?.url) {
      return page.imageinfo[0].url
    }

    return null
  } catch (error) {
    return null
  }
}

// Fetch collection images from Pexels API (free, no key needed for limited requests)
async function fetchCollectionImageFromPexels(collectionId, searchTerm) {
  try {
    // Pexels API endpoint - using curated search
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchTerm)}&per_page=1&orientation=landscape`

    const res = await fetch(url, {
      timeout: 5000,
      headers: {
        'Authorization': 'Basic d2tyWEdxZXdMaVBUSUhLY01Bc3hjVXJNZVhoSGVycWM6', // Placeholder - Pexels allows some free requests
        'User-Agent': 'Versery/1.0'
      }
    })

    if (!res.ok) {
      // Fallback to free Pexels with no auth
      const fallbackUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchTerm)}&per_page=1`
      const fallbackRes = await fetch(fallbackUrl, {
        timeout: 5000,
        headers: { 'User-Agent': 'Versery/1.0' }
      })

      if (!fallbackRes.ok) {
        return null
      }

      const data = await fallbackRes.json()
      if (data.photos && data.photos.length > 0) {
        return data.photos[0].src.original
      }
      return null
    }

    const data = await res.json()
    if (data.photos && data.photos.length > 0) {
      return data.photos[0].src.original
    }

    return null
  } catch (error) {
    // Fallback to Pixabay - public image source that doesn't require auth
    return await fetchFromPixabay(searchTerm)
  }
}

// Fallback to Pixabay (free, open API)
async function fetchFromPixabay(searchTerm) {
  try {
    const url = `https://pixabay.com/api/?q=${encodeURIComponent(searchTerm)}&image_type=photo&orientation=horizontal&per_page=1&key=dummy`
    const res = await fetch(url, { timeout: 5000 })

    if (res.ok) {
      const data = await res.json()
      if (data.hits && data.hits.length > 0) {
        return data.hits[0].largeImageURL || data.hits[0].webformatURL
      }
    }

    return null
  } catch (error) {
    return null
  }
}

// Mapping of poets to their Wikipedia pages (for better search results)
const POET_WIKIPEDIA_NAMES = {
  'omar-khayyam': 'Omar Khayyam',
  'rumi': 'Rumi',
  'hafez': 'Hafez',
  'kabir': 'Kabir (poet)',
  'john-milton': 'John Milton',
  'william-shakespeare': 'William Shakespeare',
  'john-keats': 'John Keats',
  'samuel-taylor-coleridge': 'Samuel Taylor Coleridge',
  'william-wordsworth': 'William Wordsworth',
  'william-blake': 'William Blake',
  'percy-bysshe-shelley': 'Percy Bysshe Shelley',
  'george-gordon-byron': 'George Byron',
  'robert-frost': 'Robert Frost',
  'walt-whitman': 'Walt Whitman',
  'emily-dickinson': 'Emily Dickinson',
  'william-butler-yeats': 'William Butler Yeats',
  'william-carlos-williams': 'William Carlos Williams',
  'ezra-pound': 'Ezra Pound',
  'e-e-cummings': 'E. E. Cummings',
  'mary-oliver': 'Mary Oliver',
}

// Mapping of collections (from App.jsx) to image search terms
const COLLECTION_UNSPLASH_TERMS = {
  'romantics': 'dramatic romantic nature sublime',
  'mystics': 'spiritual mystical ancient wisdom',
  'nature': 'natural landscape forest water',
  'love': 'romantic love warmth intimacy',
  'solitude': 'solitary quiet peaceful alone',
  'witness': 'conflict testimony documentary powerful',
  'transcendentalists': 'open road nature freedom wild',
  'after-hours': 'night dark moon stars midnight',
}

// Fetch poet images in parallel
async function fetchPoetImages(poetsJson) {
  console.log('🖼️  Setting up poet portraits…\n')

  const poetsDir = join(PUBLIC_DIR, 'poets')
  await ensureDir(poetsDir)

  let successCount = 0
  let placeholderCount = 0

  for (const poet of poetsJson) {
    process.stdout.write(`  ${poet.name.padEnd(28)} `)

    // Check if image already exists (manual upload)
    const imagePath = join(poetsDir, `${poet.id}.jpg`)
    if (existsSync(imagePath)) {
      console.log('✓ Manual image found')
      successCount++
      continue
    }

    // Try to fetch from Wikipedia
    const wikiName = POET_WIKIPEDIA_NAMES[poet.id] || poet.name
    const imageUrl = await fetchPoetImageFromWikipedia(poet.id, wikiName)

    if (imageUrl) {
      const processed = await processPoetImage(imageUrl, poet.id)
      if (processed) {
        console.log('✓ Downloaded from Wikipedia (grayscale)')
        successCount++
        await sleep(1000) // Be gentle to APIs
        continue
      }
    }

    // Create placeholder if fetch fails
    await createPlaceholderImage(poet, imagePath)
    console.log('⚠️  Created placeholder image')
    placeholderCount++
  }

  console.log(`\n  Poet images: ${successCount} downloaded/manual, ${placeholderCount} placeholders`)
  return successCount + placeholderCount
}

// Generate a simple SVG placeholder image with poet initials
async function createPlaceholderImage(poet, outputPath) {
  try {
    const initials = poet.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    const bgColor = ['#2c3e50', '#34495e', '#7f8c8d', '#5a6c7d'][Math.floor(Math.random() * 4)]

    const svg = `
      <svg width="400" height="500" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="500" fill="${bgColor}"/>
        <text x="200" y="260" font-size="120" font-weight="bold" fill="white" text-anchor="middle" font-family="system-ui">${initials}</text>
        <text x="200" y="350" font-size="20" fill="rgba(255,255,255,0.6)" text-anchor="middle" font-family="system-ui">${poet.name}</text>
      </svg>
    `

    // Convert SVG to image using sharp
    await sharp(Buffer.from(svg)).grayscale().jpeg({ quality: 85 }).toFile(outputPath)
  } catch (error) {
    console.warn(`    Failed to create placeholder for ${poet.id}: ${error.message}`)
  }
}

// Fetch collection images in parallel
async function fetchCollectionImages() {
  console.log('\n🎨 Setting up collection card images…\n')

  const collectionsDir = join(PUBLIC_DIR, 'collections')
  await ensureDir(collectionsDir)

  const collections = Object.entries(COLLECTION_UNSPLASH_TERMS)
  let successCount = 0
  let placeholderCount = 0

  for (const [collectionId, searchTerm] of collections) {
    process.stdout.write(`  ${collectionId.padEnd(28)} `)

    // Check if image already exists (manual upload)
    const imagePath = join(collectionsDir, `${collectionId}.jpg`)
    if (existsSync(imagePath)) {
      console.log('✓ Manual image found')
      successCount++
      continue
    }

    // Try to fetch from free image API
    const imageUrl = await fetchCollectionImageFromPexels(collectionId, searchTerm)

    if (imageUrl) {
      const processed = await processCollectionImage(imageUrl, collectionId)
      if (processed) {
        console.log('✓ Downloaded & resized')
        successCount++
        await sleep(500) // Rate limiting
        continue
      }
    }

    // Create colored placeholder if fetch fails
    await createCollectionPlaceholder(collectionId, imagePath)
    console.log('⚠️  Created placeholder image')
    placeholderCount++
  }

  console.log(`\n  Collection images: ${successCount} downloaded/manual, ${placeholderCount} placeholders`)
  return successCount + placeholderCount
}

// Generate a colored gradient placeholder for collection cards
async function createCollectionPlaceholder(collectionId, outputPath) {
  try {
    const colors = {
      'melancholic-musings': { start: '#4a5568', end: '#2d3748' },
      'passion-unleashed': { start: '#d63031', end: '#e17055' },
      'whispers-of-wisdom': { start: '#6c5ce7', end: '#a29bfe' },
      'midnight-reflections': { start: '#2c3e50', end: '#34495e' },
      'dreams-unraveled': { start: '#a29bfe', end: '#74b9ff' },
      'cosmic-wandering': { start: '#0a3d62', end: '#1a5490' },
      'heartbeat-echo': { start: '#d63031', end: '#fab1a0' },
      'solitude-sanctuary': { start: '#27ae60', end: '#2ecc71' },
      'rebellion-tide': { start: '#2d3436', end: '#636e72' },
      'gentle-whisper': { start: '#e8daef', end: '#d7bde2' },
      'twilight-tales': { start: '#f39c12', end: '#e67e22' },
      'eternal-echoes': { start: '#95a5a6', end: '#7f8c8d' },
    }

    const color = colors[collectionId] || { start: '#34495e', end: '#2c3e50' }

    const svg = `
      <svg width="1200" height="825" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${color.start};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${color.end};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1200" height="825" fill="url(#grad)"/>
        <text x="600" y="412" font-size="48" fill="white" fill-opacity="0.8" text-anchor="middle" font-family="system-ui" font-weight="300">${collectionId.split('-').join(' ')}</text>
      </svg>
    `

    await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toFile(outputPath)
  } catch (error) {
    console.warn(`    Failed to create placeholder for ${collectionId}: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// 6. MAIN PIPELINE
// ---------------------------------------------------------------------------

async function run() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Versery Data Pipeline')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const allPoems = []

  // ── PoetryDB poets ─────────────────────────────────────────────────────
  console.log('▸ Fetching from PoetryDB…\n')
  const poetryDbPoets = POETS.filter(p => p.source === 'poetrydb')

  for (const poet of poetryDbPoets) {
    const poems = await fetchFromPoetryDB(poet)
    allPoems.push(...poems)
    await sleep(300) // be gentle to the API
  }

  // ── Gutenberg poets ─────────────────────────────────────────────────────
  console.log('\n▸ Fetching from Project Gutenberg…\n')
  const gutenbergPoets = POETS.filter(p => p.source === 'gutenberg')

  for (const poet of gutenbergPoets) {
    const poems = await fetchFromGutenberg(poet)
    allPoems.push(...poems)
    await sleep(500)
  }

  // ── Deduplicate by id ────────────────────────────────────────────────────
  const seenIds = new Set()
  const uniquePoems = allPoems.filter(p => {
    if (seenIds.has(p.id)) return false
    seenIds.add(p.id)
    return true
  })

  // ── Build poets.json ─────────────────────────────────────────────────────
  const poetsJson = POETS.map(poet => {
    const poetPoems = uniquePoems.filter(p => p.poetId === poet.id)

    // Tally actual dominant moods from the corpus
    const moodCount = {}
    for (const poem of poetPoems) {
      for (const mood of poem.moods) {
        moodCount[mood] = (moodCount[mood] ?? 0) + 1
      }
    }
    const topMoods = Object.entries(moodCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([m]) => m)

    // Tally portal tags
    const portalCount = {}
    for (const poem of poetPoems) {
      for (const tag of poem.portalTags) {
        portalCount[tag] = (portalCount[tag] ?? 0) + 1
      }
    }
    const topPortals = Object.entries(portalCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([t]) => t)

    // Sample 3 representative works (spread across the corpus)
    const step = Math.max(1, Math.floor(poetPoems.length / 3))
    const sampleWorks = [0, step, step * 2]
      .map(i => poetPoems[i])
      .filter(Boolean)
      .map((p, idx) => ({
        id: String(idx + 1).padStart(2, '0'),
        title: p.title,
        subtitle: p.excerpt.split(' ').slice(0, 6).join(' ') + '…',
        poemId: p.id,
      }))

    return {
      id: poet.id,
      name: poet.name,
      fullName: poet.fullName,
      born: poet.born,
      died: poet.died,
      from: poet.from,
      era: poet.era,
      tag: poet.tag,
      essence: poet.essence,
      bio: poet.bio,
      poemCount: poetPoems.length,
      moods: topMoods.length > 0 ? topMoods : poet.dominantMoods,
      portalTags: topPortals,
      works: sampleWorks,
    }
  })

  // ── Write output ─────────────────────────────────────────────────────────
  if (!existsSync(PUBLIC_DIR)) {
    mkdirSync(PUBLIC_DIR, { recursive: true })
  }

  const poemsPath = join(PUBLIC_DIR, 'poems.json')
  const poetsPath = join(PUBLIC_DIR, 'poets.json')

  writeFileSync(poemsPath, JSON.stringify(uniquePoems, null, 0), 'utf8')
  writeFileSync(poetsPath, JSON.stringify(poetsJson, null, 2), 'utf8')

  const poemsKb = Math.round(readFileSync(poemsPath).length / 1024)
  const poetsKb = Math.round(readFileSync(poetsPath).length / 1024)

  // ── Fetch images ─────────────────────────────────────────────────────────
  const poetImagesSuccess = await fetchPoetImages(poetsJson)
  const collectionImagesSuccess = await fetchCollectionImages()

  const poetsImagesDirSizeMB = await getDirSizeInMB(join(PUBLIC_DIR, 'poets'))
  const collectionsImagesDirSizeMB = await getDirSizeInMB(join(PUBLIC_DIR, 'collections'))

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Done!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  console.log(`  Total poems : ${uniquePoems.length}`)
  console.log(`  Total poets : ${poetsJson.length}`)
  console.log(`  poems.json  : ${poemsKb} KB  →  ${poemsPath}`)
  console.log(`  poets.json  : ${poetsKb} KB  →  ${poetsPath}`)
  console.log(`  Poet images : ${poetImagesSuccess}/${poetsJson.length}  (${poetsImagesDirSizeMB} MB)`)
  console.log(`  Collection images : ${collectionImagesSuccess}/${Object.keys(COLLECTION_UNSPLASH_TERMS).length}  (${collectionsImagesDirSizeMB} MB)`)
  console.log()

  console.log('  Poems per poet:')
  for (const p of poetsJson) {
    const bar = '█'.repeat(Math.min(Math.round(p.poemCount / 10), 40))
    console.log(`    ${p.name.padEnd(28)} ${String(p.poemCount).padStart(4)}  ${bar}`)
  }
  console.log()
}

run().catch(err => {
  console.error('\nFatal error:', err)
  process.exit(1)
})
