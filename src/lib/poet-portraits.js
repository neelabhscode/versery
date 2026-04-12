/**
 * Maps canonical poet ids (from poets.json) to filenames under /public/poets/.
 * Default is `${id}.jpg` when not listed here.
 */
const POET_PORTRAIT_FILES = {
  "bhagavad-gita": "gita.jpeg",
  "john-keats": "keats.jpg",
  "kahlil-gibran": "gibran.png",
  "lao-tzu": "lao.png",
  "mirza-ghalib": "ghalib.png",
  "rainer-maria-rilke": "rilke.png",
  "robert-frost": "frost.png",
  "rudyard-kipling": "kipling.png",
  "t-s-eliot": "eliot.png",
  "tagore": "tagore.png",
  "ryokan": "ryokan.png",
};

export function poetPortraitUrl(poetId) {
  if (!poetId) return null;
  const file = POET_PORTRAIT_FILES[poetId] ?? `${poetId}.jpg`;
  return `/poets/${file}`;
}

/** Two-letter initials for avatar fallback (Today’s Poem, etc.). */
export function poetInitialsFromAuthor(author) {
  if (author == null || String(author).trim() === "") return "?";
  const cleaned = String(author).replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter((w) => /[A-Za-zÀ-ÿ\u0900-\u0fff]/.test(w));
  if (words.length === 0) {
    const letters = cleaned.match(/[A-Za-zÀ-ÿ\u0900-\u0fff]/g);
    return (letters?.slice(0, 2).join("") ?? "?").toUpperCase();
  }
  if (words.length === 1) {
    const w = words[0].match(/[A-Za-zÀ-ÿ\u0900-\u0fff]/g);
    return (w?.slice(0, 2).join("") ?? "?").toUpperCase();
  }
  const first = words[0].match(/[A-Za-zÀ-ÿ\u0900-\u0fff]/)?.[0] ?? "";
  const last = words[words.length - 1].match(/[A-Za-zÀ-ÿ\u0900-\u0fff]/)?.[0] ?? "";
  const pair = `${first}${last}`.toUpperCase();
  return pair || "?";
}
