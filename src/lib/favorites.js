/**
 * Favorites — localStorage persistence for saved poems.
 *
 * Storage key: "versery_favorites"
 * Format: JSON array of poem ID strings, most-recently-saved first.
 */

const STORAGE_KEY = 'versery_favorites'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // localStorage unavailable (private browsing quota exceeded etc.)
  }
}

/** Save a poem ID. No-op if already saved. */
export function savePoem(poemId) {
  const ids = load()
  if (!ids.includes(poemId)) {
    save([poemId, ...ids])
  }
}

/** Remove a poem ID. No-op if not saved. */
export function unsavePoem(poemId) {
  save(load().filter(id => id !== poemId))
}

/** Toggle save state. Returns the new isSaved boolean. */
export function toggleSaved(poemId) {
  if (isSaved(poemId)) {
    unsavePoem(poemId)
    return false
  }
  savePoem(poemId)
  return true
}

/** Returns true if the poem is currently saved. */
export function isSaved(poemId) {
  return load().includes(poemId)
}

/**
 * Returns an array of saved poem IDs, most-recently-saved first.
 * Pass the full poems array to hydrate into poem objects.
 *
 * @param {Array} [allPoems]  — optional: if provided, returns poem objects instead of IDs
 * @returns {Array}
 */
export function getSavedPoems(allPoems) {
  const ids = load()
  if (!allPoems) return ids
  const map = Object.fromEntries(allPoems.map(p => [p.id, p]))
  return ids.map(id => map[id]).filter(Boolean)
}

/** Clear all saved poems. */
export function clearSaved() {
  save([])
}

/** Returns the count of saved poems. */
export function savedCount() {
  return load().length
}
