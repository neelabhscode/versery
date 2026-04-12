/**
 * Versery search helpers — portal/poet filters (no client-side full-text index).
 *
 *   filterByPortal(poems, tag)    → fast array filter by one portal tag
 *   filterByPortals(poems, tags)  → union filter by multiple portal tags
 *   filterByPoet(poems, poetId)   → all poems by one poet
 */

/**
 * Filter poems by a single frontend portal tag (e.g. "Calm", "Melancholic").
 * Fast O(n) filter.
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
