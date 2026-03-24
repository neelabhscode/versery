/**
 * Versery search library — powered by Fuse.js (client-side, in-memory).
 *
 * Two entry points:
 *   createFuseIndex(poems)       → call once after poems.json loads
 *   searchPoems(fuse, query)     → full-text fuzzy search
 *   filterByPortal(poems, tag)   → fast array filter, no Fuse needed
 *   filterByPoet(poems, poetId)  → all poems by one poet
 */

import Fuse from 'fuse.js'

// Fuse.js config — tuned for poetry search
const FUSE_OPTIONS = {
  // Fields searched, with weights
  keys: [
    { name: 'title',   weight: 0.35 },
    { name: 'author',  weight: 0.25 },
    { name: 'excerpt', weight: 0.25 },
    { name: 'lines',   weight: 0.15 },
  ],
  // Sensitivity: 0 = exact, 1 = match anything. 0.4 is a good balance for poetry.
  threshold: 0.4,
  // Return match details so we can highlight later
  includeScore: true,
  includeMatches: false,
  // Don't try to match across very long fields (full poem lines array)
  ignoreLocation: true,
  minMatchCharLength: 2,
  // Cap results for performance
  limit: 30,
}

/**
 * Build a Fuse index from the poems array.
 * Call this once when poems.json finishes loading, then pass the index around.
 *
 * @param {Array} poems  — the full poems.json array
 * @returns {Fuse}
 */
export function createFuseIndex(poems) {
  // Fuse can't search nested string arrays (lines[]) directly — join them first
  const indexed = poems.map(p => ({
    ...p,
    lines: p.lines.slice(0, 6).join(' '), // index first 6 lines only (performance)
  }))
  return new Fuse(indexed, FUSE_OPTIONS)
}

/**
 * Full-text fuzzy search across title, author, excerpt, and first 6 lines.
 *
 * @param {Fuse}   fuse   — the index returned by createFuseIndex
 * @param {string} query  — user's search string
 * @param {number} limit  — max results (default 20)
 * @returns {Array}       — array of poem objects (not Fuse result wrappers)
 */
export function searchPoems(fuse, query, limit = 20) {
  if (!query || query.trim().length < 2) return []
  const results = fuse.search(query.trim(), { limit })
  return results.map(r => r.item)
}

/**
 * Filter poems by a single frontend portal tag (e.g. "Calm", "Melancholic").
 * Fast O(n) filter — no Fuse needed.
 *
 * @param {Array}  poems     — full poems array
 * @param {string} portalTag — one of the 12 portal names
 * @param {number} limit     — max results (default 40)
 * @returns {Array}
 */
export function filterByPortal(poems, portalTag, limit = 40) {
  if (!portalTag) return []
  const results = []
  for (const poem of poems) {
    if (poem.portalTags?.includes(portalTag)) {
      results.push(poem)
      if (results.length >= limit) break
    }
  }
  return results
}

/**
 * Filter poems by multiple portal tags (union — any match).
 * Used to build a richer discovery result when one tag yields too few poems.
 *
 * @param {Array}    poems      — full poems array
 * @param {string[]} portalTags — array of portal tag names
 * @param {number}   limit      — max results
 * @returns {Array}
 */
export function filterByPortals(poems, portalTags, limit = 40) {
  if (!portalTags?.length) return []
  const tagSet = new Set(portalTags)
  const seen = new Set()
  const results = []
  for (const poem of poems) {
    if (seen.has(poem.id)) continue
    if (poem.portalTags?.some(t => tagSet.has(t))) {
      results.push(poem)
      seen.add(poem.id)
      if (results.length >= limit) break
    }
  }
  return results
}

/**
 * Return all poems by a specific poet, in corpus order.
 *
 * @param {Array}  poems   — full poems array
 * @param {string} poetId  — e.g. "rumi", "dickinson"
 * @returns {Array}
 */
export function filterByPoet(poems, poetId) {
  return poems.filter(p => p.poetId === poetId)
}

/**
 * Build a lookup map {poemId → poem} for O(1) access by ID.
 * Call once after poems.json loads.
 *
 * @param {Array} poems
 * @returns {Object}
 */
export function buildPoemMap(poems) {
  return Object.fromEntries(poems.map(p => [p.id, p]))
}
