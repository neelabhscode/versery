/** Normalize cached or legacy /collections/*.jpg paths to WebP. */
export function ensureCollectionWebpSrc(src) {
  if (src == null || typeof src !== "string") return "";
  return src.replace(/\.(jpe?g)$/i, ".webp");
}

/** 1x / 2x descriptors: -1x.webp (300px long edge cap) + .webp (600px cap). */
export function collectionCoverSrcSet(webpSrc) {
  if (!webpSrc || !webpSrc.endsWith(".webp")) return undefined;
  // Normalize accidental low-res inputs so srcset still points at the intended base file.
  const normalized = webpSrc.replace(/-1x\.webp$/i, ".webp");
  const stem = normalized.slice(0, -".webp".length);
  return `${stem}-1x.webp 1x, ${normalized} 2x`;
}

export function ensurePoetPortraitWebpSrc(src) {
  if (src == null || typeof src !== "string") return "";
  return src.replace(/\.(jpe?g)$/i, ".webp");
}

/**
 * @param {"lazy"|"eager"} [props.loading]
 * @param {"high"|"low"|"auto"|undefined} [props.fetchPriority]
 * @param {"card"|"hero"|"chip"|"square"} [props.intrinsicSize] — width/height hints for CLS (CSS still controls layout).
 */
export function PoetPortraitImg({ src, alt, loading = "lazy", fetchPriority, intrinsicSize = "card", onError }) {
  const webp = ensurePoetPortraitWebpSrc(src);
  const dims =
    intrinsicSize === "hero"
      ? { width: 800, height: 1000 }
      : intrinsicSize === "chip" || intrinsicSize === "square"
        ? { width: 200, height: 200 }
        : { width: 160, height: 200 };

  return (
    <img
      src={webp}
      alt={alt}
      loading={loading}
      fetchpriority={fetchPriority}
      width={dims.width}
      height={dims.height}
      decoding="async"
      onError={onError}
    />
  );
}

export function CollectionCoverImg({ src, alt, loading = "lazy", fetchPriority }) {
  const webp = ensureCollectionWebpSrc(src).replace(/-1x\.webp$/i, ".webp");
  const srcSet =
    webp.endsWith(".webp") && webp.includes("-unsplash") ? collectionCoverSrcSet(webp) : undefined;

  return (
    <img
      src={webp}
      srcSet={srcSet}
      alt={alt}
      loading={loading}
      fetchpriority={fetchPriority}
      width={600}
      height={413}
      decoding="async"
    />
  );
}
