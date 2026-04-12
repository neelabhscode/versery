/**
 * Mood classification utilities.
 *
 * Vocabulary: 8 canonical moods (matching the data pipeline classifier).
 * Portal tags: the 12 names used by the frontend (Compass portals + feeling chips).
 */

// The 8-mood keyword map (mirrors scripts/fetch-poems.js)
const MOOD_KEYWORDS = {
  grief:    ['death','dead','died','loss','lost','mourn','grave','weep','tears',
             'sorrow','dark','shadow','cold','pale','night','never','gone','woe',
             'funeral','tomb','ghost'],
  longing:  ['miss','far','away','return','remember','dream','wish','wait','seek',
             'yearning','desire','hope','long','distant','apart','absence','again',
             'once','when','memory','past'],
  joy:      ['happy','joy','laugh','bright','sun','dance','sing','light','free',
             'alive','merry','delight','glad','sweet','bliss','spring','morning',
             'golden','radiant','smile','young'],
  wonder:   ['wonder','star','sky','infinite','vast','heaven','eternity','sublime',
             'mystery','deep','divine','beauty','awe','eternal','truth','silence',
             'universe','earth','sea','mountain','cloud'],
  love:     ['love','heart','kiss','tender','dear','embrace','together','beloved',
             'thee','thy','gentle','soft','warm','sweet','beautiful','lips','arms',
             'eyes','soul','mine'],
  solitude: ['alone','silence','quiet','still','empty','lonely','single','solitary',
             'apart','hollow','one','dark','shadow','room','door','window','wall',
             'grey','fog'],
  rage:     ['rage','anger','fury','fire','burn','fight','war','blood','violent',
             'storm','force','sword','battle','hate','thunder','scream','iron',
             'wound','slaughter','gun'],
  peace:    ['peace','calm','rest','breathe','ease','gentle','soft','slow','still',
             'tranquil','sleep','green','meadow','river','quiet','breeze','leaf',
             'grass','shore','evening'],
}

/**
 * Maps the 8 canonical moods → the 12 frontend portal/feeling names.
 * A poem can carry multiple portal tags (one per mood it scores on).
 */
const MOOD_TO_PORTALS = {
  grief:    ['Static', 'Melancholic'],
  longing:  ['Drift',  'Melancholic'],
  joy:      ['Pulse',  'Radiant'],
  wonder:   ['Lush',   'Ethereal', 'Focus'],
  love:     ['Warmth', 'Radiant'],
  solitude: ['Calm',   'Echo',     'Solitary'],
  rage:     ['Pulse',  'Static'],
  peace:    ['Calm',   'Ethereal'],
}

/**
 * All 12 portal/feeling tags used in the frontend.
 * Compass portals:  Calm, Pulse, Focus, Warmth, Static, Lush, Drift, Echo
 * Feeling chips:    Melancholic, Ethereal, Radiant, Solitary
 */
const ALL_PORTALS = [
  'Calm', 'Pulse', 'Focus', 'Warmth', 'Static', 'Lush', 'Drift', 'Echo',
  'Melancholic', 'Ethereal', 'Radiant', 'Solitary',
]

/**
 * Classify lines of text into 1–2 moods using keyword matching.
 * Returns an array of mood strings, highest score first.
 */
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

/**
 * Portal tags for the highest keyword-ranked canonical mood (see classifyMoods).
 * Use with app-level TAG_PASTEL_HEX / tagPastelHex to pick an accent hex.
 */
export function portalTagsForTopRankedMood(lines) {
  const safe = Array.isArray(lines) ? lines.map((l) => String(l).trim()).filter(Boolean) : []
  if (!safe.length) return MOOD_TO_PORTALS.wonder
  const top = classifyMoods(safe)[0] ?? 'wonder'
  return MOOD_TO_PORTALS[top] ?? MOOD_TO_PORTALS.wonder
}

/**
 * Map an array of moods to a deduplicated set of portal tags.
 */
function moodsToPortals(moods) {
  const portals = new Set()
  for (const mood of moods) {
    for (const portal of (MOOD_TO_PORTALS[mood] ?? [])) {
      portals.add(portal)
    }
  }
  return [...portals]
}
