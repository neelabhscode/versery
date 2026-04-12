/**
 * Single source of truth: pastel hex for each compass portal + home feeling tag
 * (must stay aligned with VALID_PORTALS in scripts/curated-corpus.mjs).
 */

/**
 * Pastel accents for portals + poem UI. The four homepage feelings use the original “Option A” chip tones
 * (see .feeling-chip in styles.css) so accents match the home mood buttons.
 */
export const TAG_PASTEL_HEX = {
  Melancholic: "#E6D9F0",
  Ethereal: "#D9F0E6",
  Radiant: "#F0E6D9",
  Solitary: "#D9E6F0",
  Calm: "#C5E4F3",
  Pulse: "#FFD0E3",
  Focus: "#DEC9F5",
  Warmth: "#FFF2D2",
  Static: "#E8E9EB",
  Lush: "#E2EFC4",
  Drift: "#DEE8F4",
  Echo: "#E4EDE6",
};

export function tagPastelHex(tag) {
  if (tag && TAG_PASTEL_HEX[tag]) return TAG_PASTEL_HEX[tag];
  return TAG_PASTEL_HEX.Melancholic;
}

function hexToRgb(hex) {
  const s = String(hex ?? "")
    .replace("#", "")
    .trim();
  if (s.length === 3) {
    return {
      r: parseInt(s[0] + s[0], 16),
      g: parseInt(s[1] + s[1], 16),
      b: parseInt(s[2] + s[2], 16),
    };
  }
  if (s.length !== 6 || !/^[0-9a-fA-F]+$/.test(s)) {
    return { r: 230, g: 217, b: 240 };
  }
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** 0 = full accent, 1 = white — html2canvas-safe hex only. */
function mixAccentTowardWhite(accentHex, whiteAmount) {
  const { r, g, b } = hexToRgb(accentHex);
  const t = Math.max(0, Math.min(1, whiteAmount));
  return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}

/** White top-left → ranked pastel stronger toward bottom-right (135deg, like poem-next warmth). */
export function buildShareGradientFromAccent(accentHex) {
  const mid = mixAccentTowardWhite(accentHex, 0.68);
  const end = mixAccentTowardWhite(accentHex, 0.1);
  return `linear-gradient(135deg, #ffffff 0%, ${mid} 52%, ${end} 100%)`;
}
