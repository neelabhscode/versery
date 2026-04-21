import { AnimatePresence, motion, useMotionValue, useTransform, animate, PanInfo, useMotionValueEvent, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Maximize2, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';

const NOISE_SVG = 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")';
/** Base layout was 320×480; height −30px with proportional width + content scale (+32px width vs that base) */
const CARD_SIZE_SCALE = 0.99;
const BASE_CARD_HEIGHT = Math.round(450 * 0.9 * CARD_SIZE_SCALE);
const BASE_CARD_WIDTH = Math.round(((320 * BASE_CARD_HEIGHT) / 480) + 32 * CARD_SIZE_SCALE);
const BASE_CARD_SPACING = Math.round(360 * (BASE_CARD_WIDTH / 320));
const BASE_CARD_CONTENT_SCALE = BASE_CARD_HEIGHT / 480;
/** Fallback desktop width before column measure (replaced by track ResizeObserver). */
const DESKTOP_CARD_WIDTH_EXTRA_PX = 232;
const DESKTOP_CARD_HEIGHT_OFFSET_PX = -56;
/** Gap between carousel card edge and chevron button (center-to-center uses half button width). */
const DESKTOP_NAV_EDGE_GAP_PX = 16;
const DESKTOP_NAV_BUTTON_PX = 44;
const LEFT_HERO_HOLD_MS = 10000;
const LEFT_HERO_CONTENT_FADE_OUT_MS = 1200;
const LEFT_HERO_CONTENT_FADE_IN_MS = 935;
const LEFT_HERO_COLOR_DISSOLVE_MS = 3000;
const LEFT_HERO_SETTLE_PAUSE_MS = 380;
const LEFT_HERO_DETAIL_STAGGER_MS = 220;
const LEFT_HERO_RESUME_AFTER_AUDIO_END_MS = 5000;
const LEFT_HERO_RESUME_AFTER_AUDIO_PAUSE_MS = 10000;

/** Pagination: scaled from 8px / 12px; cumulative reductions per prior requests */
const PAGINATION_DOT_PX = 8 * 0.65 * 0.85 * 0.85 * 0.8;
const PAGINATION_GAP_PX = 12 * 0.8 * 0.85 * 0.85 * 0.85;
const PAGINATION_STEP_PX = PAGINATION_DOT_PX + PAGINATION_GAP_PX;

function normalizeIdentity(value: string | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRoadNotTakenByRobertFrost(cardLike: { title?: string; author?: string }) {
  return (
    normalizeIdentity(cardLike?.title) === "theroadnottaken" &&
    normalizeIdentity(cardLike?.author) === "robertfrost"
  );
}

function isStoppingByWoodsByRobertFrost(cardLike: { title?: string; author?: string }) {
  return (
    normalizeIdentity(cardLike?.title) === "stoppingbywoodsonsnowyevening" &&
    normalizeIdentity(cardLike?.author) === "robertfrost"
  );
}

const wrap = (min: number, max: number, v: number) => {
  const rangeSize = max - min;
  return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min;
};

export interface CardData {
  id: number;
  poemId?: string;
  title: string;
  author: string;
  content: string;
  fullLines?: string[];
  audioSources?: string[];
  tagline?: string;
  moodIcon?: string;
  color: string;
}

interface ArcCarouselProps {
  cards: CardData[];
  onOpenPoem?: (poemId: string) => void;
  onActiveIndexChange?: (index: number) => void;
  onActiveCardAudioPlayingChange?: (playing: boolean) => void;
  paginationClassName?: string;
  initialIndex?: number;
  embeddedMode?: "default" | "leftHero";
}

type AudioPlaybackEvent = "play" | "pause" | "ended";

export function ArcCarousel({
  cards,
  onOpenPoem,
  onActiveIndexChange,
  onActiveCardAudioPlayingChange,
  paginationClassName,
  initialIndex = 0,
  embeddedMode = "default",
}: ArcCarouselProps) {
  const getNormalizedIndex = (index: number, count: number) => {
    if (!count) return 0;
    return ((index % count) + count) % count;
  };
  const [activeIndex, setActiveIndex] = useState(() => getNormalizedIndex(initialIndex, cards.length));
  const [isDragging, setIsDragging] = useState(false);
  const [isCarouselAnimating, setIsCarouselAnimating] = useState(false);
  const [isActiveCardAudioPlaying, setIsActiveCardAudioPlaying] = useState(false);
  const [isActiveCardPlaybackCollapsed, setIsActiveCardPlaybackCollapsed] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const [isDesktopContentMorphing, setIsDesktopContentMorphing] = useState(false);
  const [desktopVisibleIndex, setDesktopVisibleIndex] = useState(() => getNormalizedIndex(initialIndex, cards.length));
  const [desktopPreviousIndex, setDesktopPreviousIndex] = useState<number | null>(null);
  const [leftHeroContentOpacity, setLeftHeroContentOpacity] = useState(1);
  const [leftHeroDetailOpacity, setLeftHeroDetailOpacity] = useState(1);
  const [leftHeroResumeAfterMs, setLeftHeroResumeAfterMs] = useState(0);
  const [measuredColumnWidth, setMeasuredColumnWidth] = useState<number | null>(null);
  const desktopMorphTimerRef = useRef<number | null>(null);
  const leftHeroTimersRef = useRef<number[]>([]);
  const leftHeroResumeTimerRef = useRef<number | null>(null);
  const desktopVisibleIndexRef = useRef(desktopVisibleIndex);
  const trackMeasureRef = useRef<HTMLDivElement | null>(null);
  const stationaryX = useMotionValue(0);
  const x = useMotionValue(0);
  const totalCards = cards.length;
  const isLeftHeroEmbedded = embeddedMode === "leftHero";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktopViewport(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  useLayoutEffect(() => {
    if (!isDesktopViewport) {
      setMeasuredColumnWidth(null);
      return;
    }
    const el = trackMeasureRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const apply = (width: number) => {
      if (width > 0) setMeasuredColumnWidth(Math.round(width));
    };

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number") apply(w);
    });
    ro.observe(el);
    apply(el.getBoundingClientRect().width);

    return () => ro.disconnect();
  }, [isDesktopViewport]);

  const cardHeight = isDesktopViewport
    ? (isLeftHeroEmbedded
      ? Math.round((measuredColumnWidth ?? BASE_CARD_WIDTH) * 0.98)
      : BASE_CARD_HEIGHT + DESKTOP_CARD_HEIGHT_OFFSET_PX)
    : BASE_CARD_HEIGHT;

  /** Desktop: width matches content column (curated primary); height stays the prior desktop ramp. */
  const cardWidth =
    isDesktopViewport && measuredColumnWidth !== null
      ? measuredColumnWidth
      : isDesktopViewport
        ? Math.round(((320 * cardHeight) / 480) + 32 * CARD_SIZE_SCALE) + DESKTOP_CARD_WIDTH_EXTRA_PX
        : BASE_CARD_WIDTH;

  const cardSpacing = isDesktopViewport
    ? Math.round(360 * (cardWidth / 320))
    : BASE_CARD_SPACING;
  const cardContentScale = cardHeight / 480;
  const effectiveCardContentScale = isLeftHeroEmbedded ? cardContentScale * 0.85 * 0.9 : cardContentScale;

  const desktopNavCenterOffsetPx = Math.round(
    cardWidth / 2 + DESKTOP_NAV_EDGE_GAP_PX + DESKTOP_NAV_BUTTON_PX / 2,
  );

  const mod = (value: number, length: number) => ((value % length) + length) % length;
  const normalizedActiveIndex = mod(activeIndex, Math.max(totalCards, 1));
  const activeDesktopCard = cards[desktopVisibleIndex] ?? null;
  const previousDesktopCard =
    desktopPreviousIndex !== null ? cards[getNormalizedIndex(desktopPreviousIndex, Math.max(totalCards, 1))] ?? null : null;

  useEffect(() => {
    return () => {
      if (desktopMorphTimerRef.current !== null) {
        window.clearTimeout(desktopMorphTimerRef.current);
      }
      leftHeroTimersRef.current.forEach((id) => window.clearTimeout(id));
      leftHeroTimersRef.current = [];
      if (leftHeroResumeTimerRef.current !== null) {
        window.clearTimeout(leftHeroResumeTimerRef.current);
        leftHeroResumeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    desktopVisibleIndexRef.current = desktopVisibleIndex;
  }, [desktopVisibleIndex]);

  useEffect(() => {
    leftHeroTimersRef.current.forEach((id) => window.clearTimeout(id));
    leftHeroTimersRef.current = [];
    if (leftHeroResumeTimerRef.current !== null) {
      window.clearTimeout(leftHeroResumeTimerRef.current);
      leftHeroResumeTimerRef.current = null;
    }

    if (!isLeftHeroEmbedded || !isDesktopViewport || totalCards <= 1 || isActiveCardAudioPlaying) {
      setLeftHeroContentOpacity(1);
      setLeftHeroDetailOpacity(1);
      return;
    }

    if (leftHeroResumeAfterMs > 0) {
      leftHeroResumeTimerRef.current = window.setTimeout(() => {
        setLeftHeroResumeAfterMs(0);
      }, leftHeroResumeAfterMs);
      return;
    }

    const schedule = (cb: () => void, delayMs: number) => {
      const timerId = window.setTimeout(cb, delayMs);
      leftHeroTimersRef.current.push(timerId);
      return timerId;
    };

    const runCycle = () => {
      // 1) Hide content first.
      setLeftHeroContentOpacity(0);
      setLeftHeroDetailOpacity(0);

      // 2) Dissolve card color from current -> next once content is gone.
      schedule(() => {
        const currentIndex = desktopVisibleIndexRef.current;
        const nextIndex = getNormalizedIndex(currentIndex + 1, totalCards);
        setIsDesktopContentMorphing(true);
        setDesktopPreviousIndex(currentIndex);
        setDesktopVisibleIndex(nextIndex);
        setActiveIndex(nextIndex);

        // 3) After color settle + short silence, reveal content in stages and restart hold.
        schedule(() => {
          setIsDesktopContentMorphing(false);
          setDesktopPreviousIndex(null);
          schedule(() => {
            // Heading/body fades in first.
            setLeftHeroContentOpacity(1);
            // Footer/actions appear shortly after for softer staging.
            schedule(() => {
              setLeftHeroDetailOpacity(1);
              schedule(runCycle, LEFT_HERO_HOLD_MS + LEFT_HERO_CONTENT_FADE_IN_MS);
            }, LEFT_HERO_DETAIL_STAGGER_MS);
          }, LEFT_HERO_SETTLE_PAUSE_MS);
        }, LEFT_HERO_COLOR_DISSOLVE_MS);
      }, LEFT_HERO_CONTENT_FADE_OUT_MS);
    };

    schedule(runCycle, LEFT_HERO_HOLD_MS);

    return () => {
      leftHeroTimersRef.current.forEach((id) => window.clearTimeout(id));
      leftHeroTimersRef.current = [];
      if (leftHeroResumeTimerRef.current !== null) {
        window.clearTimeout(leftHeroResumeTimerRef.current);
        leftHeroResumeTimerRef.current = null;
      }
    };
  }, [isLeftHeroEmbedded, isDesktopViewport, totalCards, isActiveCardAudioPlaying, leftHeroResumeAfterMs]);

  useEffect(() => {
    if (!totalCards) return;
    setDesktopVisibleIndex((prev) => getNormalizedIndex(prev, totalCards));
  }, [totalCards]);

  useEffect(() => {
    if (!totalCards) return;
    onActiveIndexChange?.(mod(activeIndex, totalCards));
  }, [activeIndex, totalCards, onActiveIndexChange]);

  useEffect(() => {
    if (!totalCards) return;
    const nextIndex = getNormalizedIndex(initialIndex, totalCards);
    x.set(-nextIndex * cardSpacing);
    setActiveIndex(nextIndex);
    setIsActiveCardAudioPlaying(false);
  }, [initialIndex, totalCards, cardSpacing, x]);

  useEffect(() => {
    setIsActiveCardAudioPlaying(false);
    setIsActiveCardPlaybackCollapsed(false);
  }, [activeIndex]);

  useEffect(() => {
    onActiveCardAudioPlayingChange?.(isActiveCardAudioPlaying);
  }, [isActiveCardAudioPlaying, onActiveCardAudioPlayingChange]);

  // Update active index based on continuously dragged position.
  useMotionValueEvent(x, "change", (latest) => {
    if (!totalCards) return;
    const index = mod(Math.round(-latest / cardSpacing), totalCards);
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  });

  const handleDragEnd = (event: any, info: PanInfo) => {
    const swipeOffset = info.offset.x;
    const swipeVelocity = info.velocity.x;
    const currentX = x.get();
    const currentStep = -currentX / cardSpacing;
    let targetStep = Math.round(currentStep);

    // Preserve tactile intent when drag ends between snap points.
    if (swipeOffset < -50 || swipeVelocity < -500) targetStep += 1;
    if (swipeOffset > 50 || swipeVelocity > 500) targetStep -= 1;

    animate(x, -targetStep * cardSpacing, {
      type: "spring",
      stiffness: isDesktopViewport ? 180 : 250,
      damping: isDesktopViewport ? 32 : 25,
      mass: 0.8,
      onComplete: () => {
        setIsDragging(false);
        setIsCarouselAnimating(false);
      },
    });
  };

  const animateToStep = (targetStep: number) => {
    if (!totalCards) return;
    setIsCarouselAnimating(true);
    animate(x, -targetStep * cardSpacing, {
      type: "spring",
      stiffness: isDesktopViewport ? 180 : 250,
      damping: isDesktopViewport ? 32 : 25,
      mass: 0.8,
      onComplete: () => {
        setIsCarouselAnimating(false);
      },
    });
  };

  const stepBy = (delta: number) => {
    if (!totalCards) return;
    if (isDesktopViewport) {
      const nextIndex = getNormalizedIndex(desktopVisibleIndex + delta, totalCards);
      if (desktopMorphTimerRef.current !== null) {
        window.clearTimeout(desktopMorphTimerRef.current);
      }
      setIsDesktopContentMorphing(true);
      setDesktopPreviousIndex(desktopVisibleIndex);
      setDesktopVisibleIndex(nextIndex);
      setActiveIndex(nextIndex);
      desktopMorphTimerRef.current = window.setTimeout(() => {
        setIsDesktopContentMorphing(false);
        setDesktopPreviousIndex(null);
      }, 320);
      return;
    }
    const currentStep = Math.round(-x.get() / cardSpacing);
    animateToStep(currentStep + delta);
  };

  if (isDesktopViewport && activeDesktopCard) {
    return (
      <div className={`w-full flex flex-col items-center justify-center${isLeftHeroEmbedded ? " h-full" : ""}`}>
        <div
          ref={trackMeasureRef}
          className={`relative box-border w-full shrink-0 lg:min-h-0 flex items-center justify-center overflow-visible${
            isLeftHeroEmbedded ? " h-full" : ""
          }`}
          style={{
            transformStyle: "flat",
            minHeight: `${Math.max(isLeftHeroEmbedded ? cardHeight : 520, isLeftHeroEmbedded ? 0 : cardHeight + 200)}px`,
          }}
        >
          {totalCards > 1 && !isLeftHeroEmbedded ? (
            <>
              <button
                type="button"
                className={`arc-carousel-nav arc-carousel-nav--prev${
                  isDesktopContentMorphing || isActiveCardAudioPlaying ? " is-hidden" : ""
                }`}
                aria-label="Previous card"
                onClick={() => stepBy(-1)}
                disabled={isDesktopContentMorphing || isActiveCardAudioPlaying}
                style={{
                  top: "50%",
                  left: "50%",
                  transform: `translate(calc(-50% - ${desktopNavCenterOffsetPx}px), -50%)`,
                }}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`arc-carousel-nav arc-carousel-nav--next${
                  isDesktopContentMorphing || isActiveCardAudioPlaying ? " is-hidden" : ""
                }`}
                aria-label="Next card"
                onClick={() => stepBy(1)}
                disabled={isDesktopContentMorphing || isActiveCardAudioPlaying}
                style={{
                  top: "50%",
                  left: "50%",
                  transform: `translate(calc(-50% + ${desktopNavCenterOffsetPx}px), -50%)`,
                }}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </>
          ) : null}

          <AnimatePresence initial={false}>
            {previousDesktopCard ? (
              <motion.div
                key={`desktop-prev-${previousDesktopCard.id}-${desktopPreviousIndex}`}
                className="absolute left-1/2 top-1/2 z-10 pointer-events-none"
                initial={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                animate={
                  isLeftHeroEmbedded
                    ? { opacity: 0, scale: 1, filter: "blur(0px)" }
                    : { opacity: 0, scale: 1.012, filter: "blur(2.2px)" }
                }
                exit={{ opacity: 0 }}
                transition={{
                  duration: isLeftHeroEmbedded ? LEFT_HERO_COLOR_DISSOLVE_MS / 1000 : 0.32,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <Card
                  card={previousDesktopCard}
                  index={0}
                  containerX={stationaryX}
                  activeIndex={0}
                  totalCards={1}
                  cardWidth={cardWidth}
                  cardHeight={cardHeight}
                  cardSpacing={cardSpacing}
                  cardContentScale={effectiveCardContentScale}
                  isDesktopViewport={true}
                  onOpenPoem={onOpenPoem}
                  isDragging={false}
                  onAudioPlayingChange={() => {}}
                  onPlaybackCollapsedChange={() => {}}
                  squareRightCorners={isLeftHeroEmbedded}
                  outerLeftCornerRadius={isLeftHeroEmbedded ? "2rem" : undefined}
                  isLeftHeroEmbeddedCard={isLeftHeroEmbedded}
                  contentOpacity={leftHeroContentOpacity}
                  detailOpacity={leftHeroDetailOpacity}
                  extraInnerPaddingPx={isLeftHeroEmbedded ? 20 : 0}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <motion.div
            key={`desktop-active-${activeDesktopCard.id}-${desktopVisibleIndex}`}
            className="absolute left-1/2 top-1/2 z-20"
            initial={
              isLeftHeroEmbedded
                ? { opacity: 0, scale: 1, filter: "blur(0px)" }
                : { opacity: 0, scale: 0.992, filter: "blur(2.2px)" }
            }
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{
              duration: isLeftHeroEmbedded ? LEFT_HERO_COLOR_DISSOLVE_MS / 1000 : 0.34,
              ease: [0.22, 1, 0.36, 1],
              ...(isLeftHeroEmbedded ? { delay: 0.12 } : {}),
            }}
          >
            <Card
              card={activeDesktopCard}
              index={0}
              containerX={stationaryX}
              activeIndex={0}
              totalCards={1}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              cardSpacing={cardSpacing}
              cardContentScale={effectiveCardContentScale}
              isDesktopViewport={true}
              onOpenPoem={onOpenPoem}
              isDragging={false}
              onAudioPlayingChange={setIsActiveCardAudioPlaying}
              onAudioPlaybackEvent={(event) => {
                if (!isLeftHeroEmbedded) return;
                if (event === "play") {
                  setLeftHeroResumeAfterMs(0);
                  return;
                }
                setLeftHeroResumeAfterMs(
                  event === "ended" ? LEFT_HERO_RESUME_AFTER_AUDIO_END_MS : LEFT_HERO_RESUME_AFTER_AUDIO_PAUSE_MS,
                );
              }}
              onPlaybackCollapsedChange={setIsActiveCardPlaybackCollapsed}
              squareRightCorners={isLeftHeroEmbedded}
              outerLeftCornerRadius={isLeftHeroEmbedded ? "2rem" : undefined}
              isLeftHeroEmbeddedCard={isLeftHeroEmbedded}
              contentOpacity={leftHeroContentOpacity}
              detailOpacity={leftHeroDetailOpacity}
              extraInnerPaddingPx={isLeftHeroEmbedded ? 20 : 0}
            />
          </motion.div>

          {isLeftHeroEmbedded && isDesktopContentMorphing ? (
            <motion.div
              className="absolute inset-0 z-30 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.22, 0] }}
              transition={{
                duration: LEFT_HERO_COLOR_DISSOLVE_MS / 1000,
                ease: [0.33, 0, 0.67, 1],
              }}
              style={{
                background:
                  "linear-gradient(140deg, rgba(252, 251, 249, 0.52) 0%, rgba(252, 251, 249, 0.26) 52%, rgba(252, 251, 249, 0.48) 100%)",
              }}
            />
          ) : null}
        </div>

        {!isLeftHeroEmbedded ? (
          <div
            className={`relative mb-8 flex items-center mt-[max(0px,calc(1.5rem+14px-30px))]${
              isActiveCardPlaybackCollapsed ? " arc-carousel-pagination--hidden" : ""
            }${paginationClassName ? ` ${paginationClassName}` : ""}`}
            style={{
              width: `${cards.length * PAGINATION_DOT_PX + (cards.length - 1) * PAGINATION_GAP_PX}px`,
              height: `${PAGINATION_DOT_PX}px`,
            }}
            role="status"
            aria-live="polite"
            aria-label={`Card ${desktopVisibleIndex + 1} of ${cards.length}`}
          >
            <span className="visually-hidden">{`Card ${desktopVisibleIndex + 1} of ${cards.length}`}</span>
            <div
              className="absolute inset-0 flex items-center"
              style={{ gap: `${PAGINATION_GAP_PX}px` }}
            >
              {cards.map((_, index) => (
                <div
                  key={index}
                  className="rounded-full bg-zinc-400/80"
                  style={{ width: `${PAGINATION_DOT_PX}px`, height: `${PAGINATION_DOT_PX}px` }}
                />
              ))}
            </div>
            <motion.div
              className="absolute top-0 rounded-full bg-zinc-900"
              style={{ width: `${PAGINATION_DOT_PX}px`, height: `${PAGINATION_DOT_PX}px` }}
              animate={{ x: desktopVisibleIndex * PAGINATION_STEP_PX }}
              transition={{
                duration: 0.32,
                ease: [0.25, 1, 0.5, 1],
              }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center justify-center">
      {/* Carousel track: no flex-1 so it doesn’t steal vertical space; min-height fits card + arc + shadow */}
      <div
        ref={trackMeasureRef}
        className="relative box-border w-full shrink-0 min-h-[556px] pb-5 md:min-h-[560px] md:pb-0 lg:min-h-0 flex items-center justify-center overflow-visible"
        style={{
          perspective: isDesktopViewport ? "none" : "800px",
          transformStyle: "preserve-3d",
          ...(isDesktopViewport
            ? { minHeight: `${Math.max(520, cardHeight + 200)}px` }
            : {}),
        }}
      >
        {/* Mask only the card stack — applying mask on the track hid side chevrons and washed out the card edges. */}
        <div
          className="absolute inset-0 z-[1] overflow-hidden"
          style={
            isDesktopViewport
              ? undefined
              : {
                  maskImage:
                    "linear-gradient(to right, transparent 0px, black 1%, black 99%, transparent 100%)",
                  WebkitMaskImage:
                    "linear-gradient(to right, transparent 0px, black 1%, black 99%, transparent 100%)",
                }
          }
        >
          {/* Vertical offset from track center; +10px vs prior so only the card stack moves, not pagination */}
          <motion.div
            className="absolute left-1/2 top-1/2 z-10"
            style={{ x, y: 12, willChange: "transform", transformStyle: "preserve-3d" }}
            drag={isActiveCardAudioPlaying ? false : "x"}
            onDragStart={() => {
              setIsDragging(true);
              setIsCarouselAnimating(true);
            }}
            onDragEnd={handleDragEnd}
            dragElastic={0.1}
            dragTransition={{ bounceStiffness: 400, bounceDamping: 40 }}
          >
            {cards.map((card, index) => {
              return (
                <Card
                  key={card.id}
                  card={card}
                  index={index}
                  containerX={x}
                  activeIndex={activeIndex}
                  totalCards={totalCards}
                  cardWidth={cardWidth}
                  cardHeight={cardHeight}
                  cardSpacing={cardSpacing}
                  cardContentScale={effectiveCardContentScale}
                  isDesktopViewport={isDesktopViewport}
                  onOpenPoem={onOpenPoem}
                  isDragging={isDragging}
                  onAudioPlayingChange={(playing) => {
                    if (index === activeIndex) {
                      setIsActiveCardAudioPlaying(playing);
                    }
                  }}
                  onPlaybackCollapsedChange={(collapsed) => {
                    if (index === activeIndex) {
                      setIsActiveCardPlaybackCollapsed(collapsed);
                    }
                  }}
                  extraInnerPaddingPx={0}
                />
              );
            })}
          </motion.div>
        </div>

        {/* Desktop nav: outside masked layer so edge gradient does not hide buttons */}
        {totalCards > 1 ? (
          <>
            <button
              type="button"
              className={`arc-carousel-nav arc-carousel-nav--prev${isDragging || isCarouselAnimating || isActiveCardAudioPlaying ? " is-hidden" : ""}`}
              aria-label="Previous card"
              onClick={() => stepBy(-1)}
              disabled={isDragging || isCarouselAnimating || isActiveCardAudioPlaying}
              style={{
                top: "50%",
                left: "50%",
                transform: `translate(calc(-50% - ${desktopNavCenterOffsetPx}px), -50%)`,
              }}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`arc-carousel-nav arc-carousel-nav--next${isDragging || isCarouselAnimating || isActiveCardAudioPlaying ? " is-hidden" : ""}`}
              aria-label="Next card"
              onClick={() => stepBy(1)}
              disabled={isDragging || isCarouselAnimating || isActiveCardAudioPlaying}
              style={{
                top: "50%",
                left: "50%",
                transform: `translate(calc(-50% + ${desktopNavCenterOffsetPx}px), -50%)`,
              }}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      {/* Pagination Indicators - fluid traveling indicator */}
      <div
        className={`relative mb-8 flex items-center mt-[max(0px,calc(1.5rem+14px-30px))]${isActiveCardPlaybackCollapsed ? " arc-carousel-pagination--hidden" : ""}${paginationClassName ? ` ${paginationClassName}` : ""}`}
        style={{
          width: `${cards.length * PAGINATION_DOT_PX + (cards.length - 1) * PAGINATION_GAP_PX}px`,
          height: `${PAGINATION_DOT_PX}px`,
        }}
        role="status"
        aria-live="polite"
        aria-label={`Card ${mod(activeIndex, Math.max(cards.length, 1)) + 1} of ${cards.length}`}
      >
        <span className="visually-hidden">{`Card ${mod(activeIndex, Math.max(cards.length, 1)) + 1} of ${cards.length}`}</span>
        <div
          className="absolute inset-0 flex items-center"
          style={{ gap: `${PAGINATION_GAP_PX}px` }}
        >
          {cards.map((_, index) => (
            <div
              key={index}
              className="rounded-full bg-zinc-400/80"
              style={{ width: `${PAGINATION_DOT_PX}px`, height: `${PAGINATION_DOT_PX}px` }}
            />
          ))}
        </div>
        <motion.div
          className="absolute top-0 rounded-full bg-zinc-900"
          style={{ width: `${PAGINATION_DOT_PX}px`, height: `${PAGINATION_DOT_PX}px` }}
          animate={{ x: mod(activeIndex, Math.max(cards.length, 1)) * PAGINATION_STEP_PX }}
          transition={{
            duration: 0.32,
            ease: [0.25, 1, 0.5, 1],
          }}
        />
      </div>
    </div>
  );
}

function Card({
  card,
  index,
  containerX,
  activeIndex,
  totalCards,
  cardWidth,
  cardHeight,
  cardSpacing,
  cardContentScale,
  isDesktopViewport = false,
  onOpenPoem,
  isDragging,
  onAudioPlayingChange,
  onAudioPlaybackEvent,
  onPlaybackCollapsedChange,
  squareRightCorners = false,
  outerLeftCornerRadius,
  isLeftHeroEmbeddedCard = false,
  contentOpacity = 1,
  detailOpacity = 1,
  extraInnerPaddingPx = 0,
}: {
  card: CardData;
  index: number;
  containerX: any;
  activeIndex: number;
  totalCards: number;
  cardWidth: number;
  cardHeight: number;
  cardSpacing: number;
  cardContentScale: number;
  isDesktopViewport?: boolean;
  onOpenPoem?: (poemId: string) => void;
  isDragging: boolean;
  onAudioPlayingChange?: (playing: boolean) => void;
  onAudioPlaybackEvent?: (event: AudioPlaybackEvent) => void;
  onPlaybackCollapsedChange?: (collapsed: boolean) => void;
  squareRightCorners?: boolean;
  outerLeftCornerRadius?: string;
  isLeftHeroEmbeddedCard?: boolean;
  contentOpacity?: number;
  detailOpacity?: number;
  extraInnerPaddingPx?: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [showHintShimmer, setShowHintShimmer] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [audioSrcIndex, setAudioSrcIndex] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [hasAudioStarted, setHasAudioStarted] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [isPlaybackExpanded, setIsPlaybackExpanded] = useState(false);
  const pointerDownRef = useRef<{ x: number; y: number; allowTap: boolean } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cardShellRef = useRef<HTMLDivElement | null>(null);
  const headingRowRef = useRef<HTMLDivElement | null>(null);
  const footerRowRef = useRef<HTMLDivElement | null>(null);
  const isActiveCard = index === activeIndex;
  const isIfByKipling =
    normalizeIdentity(card.title) === "if" &&
    normalizeIdentity(card.author) === "rudyardkipling";
  const isRoadNotTakenByFrost = isRoadNotTakenByRobertFrost(card);
  const isStoppingByWoodsByFrost = isStoppingByWoodsByRobertFrost(card);
  const audioSources = Array.isArray(card.audioSources) && card.audioSources.length
    ? card.audioSources
    : (isIfByKipling
      ? ["/audio/if-ai-reading.mp3"]
      : (isRoadNotTakenByFrost
        ? ["/audio/roadnot-ai-reading.mp3"]
        : (isStoppingByWoodsByFrost ? ["/audio/snowy-ai-reading.mp3"] : [])));
  const currentAudioSrc = audioSources[audioSrcIndex] ?? null;
  const fullLines = Array.isArray(card.fullLines) && card.fullLines.length
    ? card.fullLines
    : String(card.content ?? "").split("\n").filter(Boolean);
  const parsedLyrics = useMemo(() => {
    return fullLines.map((line) => ({
      text: String(line ?? ""),
    }));
  }, [fullLines]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (shouldReduceMotion || isDragging || index !== activeIndex) return;
    if (typeof window === "undefined") return;
    const key = "versery_carousel_play_hint_seen";
    if (window.sessionStorage.getItem(key) === "1") return;
    const timer = window.setTimeout(() => {
      setShowHintShimmer(true);
      window.sessionStorage.setItem(key, "1");
      window.setTimeout(() => setShowHintShimmer(false), 1100);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, index, isDragging, shouldReduceMotion]);

  useEffect(() => {
    setAudioSrcIndex(0);
    setIsAudioPlaying(false);
    setHasAudioStarted(false);
    setAudioProgress(0);
    setIsPlaybackExpanded(false);
  }, [card.id]);

  useEffect(() => {
    if (isActiveCard) return;
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
    }
  }, [isActiveCard]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentAudioSrc) return;
    const syncProgress = () => {
      const { duration, currentTime } = audio;
      if (!Number.isFinite(duration) || duration <= 0) {
        setAudioProgress(0);
        return;
      }
      setAudioProgress(Math.min(1, Math.max(0, currentTime / duration)));
    };

    const onPlay = () => {
      setIsAudioPlaying(true);
      setHasAudioStarted(true);
      setIsPlaybackExpanded(false);
      onAudioPlaybackEvent?.("play");
      syncProgress();
    };

    const onPause = () => {
      setIsAudioPlaying(false);
      onAudioPlaybackEvent?.("pause");
      syncProgress();
    };
    const onEnded = () => {
      setIsAudioPlaying(false);
      onAudioPlaybackEvent?.("ended");
      setAudioProgress(1);
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", syncProgress);
    audio.addEventListener("loadedmetadata", syncProgress);
    audio.addEventListener("durationchange", syncProgress);
    audio.addEventListener("seeked", syncProgress);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", syncProgress);
      audio.removeEventListener("loadedmetadata", syncProgress);
      audio.removeEventListener("durationchange", syncProgress);
      audio.removeEventListener("seeked", syncProgress);
    };
  }, [currentAudioSrc, onAudioPlaybackEvent]);

  useEffect(() => {
    onAudioPlayingChange?.(isAudioPlaying);
  }, [isAudioPlaying, onAudioPlayingChange]);

  const cx = useTransform(containerX, (xValue: number) => {
    const rawX = xValue + index * cardSpacing;
    const halfWidth = (totalCards * cardSpacing) / 2;
    return wrap(-halfWidth, halfWidth, rawX);
  });
  const cardLocalX = useTransform(containerX, (xValue: number) => {
    const rawX = xValue + index * cardSpacing;
    const halfWidth = (totalCards * cardSpacing) / 2;
    const wrappedCx = wrap(-halfWidth, halfWidth, rawX);
    return wrappedCx - xValue - cardWidth / 2;
  });

  const y = useTransform(cx, (xValue: number) => (xValue * xValue) / 2500);
  const rotate = useTransform(cx, (xValue: number) => (isDesktopViewport ? 0 : xValue / 25));
  const rotateY = useTransform(cx, (xValue: number) => (isDesktopViewport ? 0 : -xValue / 8));
  const brightness = useTransform(cx, [-cardSpacing * 2, 0, cardSpacing * 2], [0.6, 1, 0.6]);
  const scaleArc = useTransform(
    cx,
    [-cardSpacing * 3, -cardSpacing * 2, 0, cardSpacing * 2, cardSpacing * 3],
    [0.5, 0.85, 1, 0.85, 0.5],
  );
  const scaleLinear = useTransform(
    cx,
    [-cardSpacing * 1.2, 0, cardSpacing * 1.2],
    [0.94, 1, 0.94],
  );
  const scale = isDesktopViewport ? scaleLinear : scaleArc;
  const opacity = useTransform(
    cx,
    [-cardSpacing * 1.05, -cardSpacing * 0.9, 0, cardSpacing * 0.9, cardSpacing * 1.05],
    [0, 0, 1, 0, 0],
  );

  const textOpacity = useTransform(cx, [-cardSpacing * 0.72, 0, cardSpacing * 0.72], [0, 1, 0]);
  const cardY = useTransform(y, (yValue) => (isDesktopViewport ? -cardHeight / 2 : yValue - cardHeight / 2));
  const filter = useTransform(brightness, (b) => (isDesktopViewport ? "none" : `brightness(${b})`));
  const zIndex = useTransform(cx, (xValue) => 100 - Math.abs(Math.round(xValue / cardSpacing)));
  const [collapsedCardHeight, setCollapsedCardHeight] = useState(() => Math.round(Math.max(156, cardHeight * 0.42)));
  const cardPaddingPx = 2 * cardContentScale * 16 + extraInnerPaddingPx;
  const collapseOffsetY = (cardHeight - collapsedCardHeight) / 2;
  // Keep desktop card geometry stable during playback so the card stays visually centered.
  const isPlaybackCollapsed = isMobileViewport && isAudioPlaying && !isPlaybackExpanded;
  const playbackLoopDuration = isDragging ? 34 : isPlaybackCollapsed ? 8 : 28;
  const isCardClickable = isActiveCard && Boolean(card.poemId) && !isAudioPlaying && !isPlaybackCollapsed;

  useEffect(() => {
    onPlaybackCollapsedChange?.(isPlaybackCollapsed);
  }, [isPlaybackCollapsed, onPlaybackCollapsedChange]);

  useEffect(() => {
    const shell = cardShellRef.current;
    const heading = headingRowRef.current;
    const footer = footerRowRef.current;
    if (!shell || !heading || !footer) return;

    const baseCollapsedHeight = Math.round(Math.max(156, cardHeight * 0.42));
    const measure = () => {
      const styles = window.getComputedStyle(shell);
      const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
      // Keep a small buffer so tall titles still feel optically centered in collapsed mode.
      const contentDrivenMinHeight = Math.ceil(paddingTop + paddingBottom + heading.offsetHeight + footer.offsetHeight + 12);
      setCollapsedCardHeight(Math.max(baseCollapsedHeight, contentDrivenMinHeight));
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(heading);
    observer.observe(footer);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [card.title, cardHeight]);

  const activateCard = () => {
    if (!isCardClickable || isDragging) return;
    if (card.poemId && onOpenPoem) onOpenPoem(card.poemId);
  };

  return (
    <motion.div
      className="absolute"
      style={{
        x: cardLocalX,
        y: cardY,
        rotate,
        rotateY,
        scale,
        opacity,
        filter,
        transformOrigin: "center center",
        transformStyle: "preserve-3d",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        zIndex,
        willChange: "transform" // Hardware acceleration hint for smoother animation
      }}
    >
      <motion.div
        ref={cardShellRef}
        className={`arc-carousel-card-shell bg-[#fcfbf9] border flex flex-col relative overflow-hidden group isolate transform-gpu${
          isCardClickable ? " cursor-pointer active:cursor-grabbing" : " cursor-grab active:cursor-grabbing"
        }${isAudioPlaying ? " is-audio-playing" : ""}${isPlaybackCollapsed ? " is-collapsed" : ""}`}
        role={isCardClickable ? "button" : undefined}
        tabIndex={isCardClickable ? 0 : -1}
        aria-label={isCardClickable ? `Open poem: ${card.title}` : undefined}
        onPointerDown={(event) => {
          pointerDownRef.current = { x: event.clientX, y: event.clientY, allowTap: true };
        }}
        onPointerMove={(event) => {
          const pointerDown = pointerDownRef.current;
          if (!pointerDown) return;
          if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 10) {
            pointerDownRef.current = { ...pointerDown, allowTap: false };
          }
        }}
        onClick={() => {
          const pointerDown = pointerDownRef.current;
          pointerDownRef.current = null;
          if (pointerDown && !pointerDown.allowTap) return;
          activateCard();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          activateCard();
        }}
        style={{ 
          // Fixes Safari bug where border-radius disappears during transform
          WebkitMaskImage: '-webkit-radial-gradient(white, black)',
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          transform: "translateZ(0)",
          borderColor: 'rgba(173, 179, 180, 0.18)',
          boxShadow:
            index === activeIndex
              ? '0 1px 0 rgba(45, 52, 53, 0.03), 0 26px 56px rgba(45, 52, 53, 0.12), 0 44px 84px rgba(45, 52, 53, 0.08)'
              : '0 1px 0 rgba(45, 52, 53, 0.03), 0 20px 44px rgba(45, 52, 53, 0.1), 0 34px 70px rgba(45, 52, 53, 0.07)',
          padding: `${cardPaddingPx}px`,
          borderRadius: `${2 * cardContentScale}rem`,
          borderTopLeftRadius: outerLeftCornerRadius ?? `${2 * cardContentScale}rem`,
          borderBottomLeftRadius: outerLeftCornerRadius ?? `${2 * cardContentScale}rem`,
          borderTopRightRadius: squareRightCorners ? "0px" : `${2 * cardContentScale}rem`,
          borderBottomRightRadius: squareRightCorners ? "0px" : `${2 * cardContentScale}rem`,
          width: `${cardWidth}px`,
          height: `${cardHeight}px`,
          transition: shouldReduceMotion ? "none" : "box-shadow 180ms cubic-bezier(0.25, 1, 0.5, 1)",
        }}
        animate={{
          height: isPlaybackCollapsed ? collapsedCardHeight : cardHeight,
          y: isPlaybackCollapsed ? collapseOffsetY : 0,
        }}
        transition={{
          type: shouldReduceMotion ? "tween" : "spring",
          duration: shouldReduceMotion ? 0.12 : undefined,
          stiffness: 210,
          damping: 30,
          mass: 0.86,
        }}
      >
        {/* Single Color Watercolor Wash Background - Optimized with radial gradients instead of heavy blur filters */}
        <motion.div
          className="arc-carousel-wash absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(
              140% 140% at 50% 50%,
              color-mix(in oklab, ${card.color} 88%, black 12%) 0%,
              rgba(255, 255, 255, 0.985) 46%,
              rgba(255, 255, 255, 0.995) 68%
            )`,
            backgroundSize: "205% 205%",
            backgroundPosition: "100% 0%",
            opacity: isLeftHeroEmbeddedCard ? 0.42 : 0.5,
            willChange: shouldReduceMotion ? "auto" : "background-position, background-size, opacity",
            transformOrigin: "center center",
          }}
          animate={
            shouldReduceMotion || isLeftHeroEmbeddedCard
              ? undefined
              : {
                  backgroundPosition: ["100% 0%", "100% 100%", "0% 100%", "0% 0%", "100% 0%"],
                  backgroundSize: isDragging
                    ? ["198% 198%", "201% 201%", "198% 198%", "201% 201%", "198% 198%"]
                    : isMobileViewport
                      ? ["198% 198%", "205% 205%", "198% 198%", "205% 205%", "198% 198%"]
                      : ["198% 198%", "208% 208%", "198% 198%", "208% 208%", "198% 198%"],
                  opacity: isDragging
                    ? [0.3, 0.34, 0.3, 0.34, 0.3]
                    : isAudioPlaying
                      ? [0.35, 0.65, 0.95, 0.65, 0.35]
                    : isMobileViewport
                      ? [0.3, 0.55, 0.3, 0.55, 0.3]
                      : [0.3, 0.38, 0.3, 0.38, 0.3],
                  filter: isAudioPlaying ? "saturate(1.18) contrast(1.02)" : "saturate(1) contrast(1)",
                }
          }
          transition={
            shouldReduceMotion || isLeftHeroEmbeddedCard
              ? undefined
              : {
                  backgroundPosition: {
                    duration: playbackLoopDuration,
                    repeat: Infinity,
                    ease: "easeInOut",
                    repeatType: "loop",
                  },
                  backgroundSize: {
                    duration: playbackLoopDuration,
                    repeat: Infinity,
                    ease: "easeInOut",
                    repeatType: "loop",
                  },
                  opacity: {
                    duration: playbackLoopDuration,
                    repeat: Infinity,
                    ease: "easeInOut",
                    repeatType: "loop",
                  },
                  filter: {
                    duration: 0.9,
                    ease: [0.22, 1, 0.36, 1],
                  },
                }
          }
        />
        
        {/* Paper Texture Overlay - Optimized without mix-blend-mode */}
        <div 
          className="absolute inset-0 opacity-[0.15] pointer-events-none"
          style={{ backgroundImage: NOISE_SVG }}
        />
        
        <div className="relative z-10 flex-1">
          <motion.div
            className="arc-carousel-copy"
            style={{
              opacity: isLeftHeroEmbeddedCard ? contentOpacity : textOpacity,
              transition:
                shouldReduceMotion || !isLeftHeroEmbeddedCard
                  ? "none"
                  : `opacity ${LEFT_HERO_CONTENT_FADE_IN_MS}ms cubic-bezier(0.25, 1, 0.5, 1)`,
            }}
          >
            <div
              ref={headingRowRef}
              className="arc-carousel-heading-row"
              style={{
                marginBottom: `${1 * cardContentScale}rem`,
                ["--arc-action-size" as any]: `${2.5 * cardContentScale}rem`,
              }}
            >
              <h2
                className="arc-carousel-title"
              >
                {card.title}
              </h2>
              {isPlaybackCollapsed ? (
                <button
                  type="button"
                  className="arc-carousel-expand-button"
                  aria-label={`Expand card for: ${card.title}`}
                  style={{
                    width: `${1 * cardContentScale}rem`,
                    height: `${1 * cardContentScale}rem`,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsPlaybackExpanded(true);
                  }}
                >
                  <Maximize2 />
                </button>
              ) : null}
            </div>
            <div
              className={`arc-carousel-excerpt-wrap${isAudioPlaying ? " is-audio-playing" : ""}${isPlaybackCollapsed ? " is-collapsed" : ""}`}
            >
              <div className="arc-carousel-body" data-card-body-id={card.id}>
                <div className="arc-carousel-lyrics-track">
                  {parsedLyrics.map((line, lineIndex) => (
                    <p
                      key={`${card.id}-line-${lineIndex}`}
                      className="arc-carousel-line"
                      data-card-line-index={lineIndex}
                    >
                      {line.text}
                    </p>
                  ))}
                </div>
              </div>
              {!isAudioPlaying ? <p className="arc-carousel-ellipsis" aria-hidden="true">...</p> : null}
            </div>
          </motion.div>
        </div>
        
        <div
          ref={footerRowRef}
          className="relative z-10 flex items-center justify-between mt-auto"
          style={{
            paddingTop: `${1.5 * cardContentScale}rem`,
          }}
        >
          <div
            className="arc-carousel-divider"
            aria-hidden="true"
            style={{
              opacity: detailOpacity,
              transition: shouldReduceMotion ? "none" : `opacity ${LEFT_HERO_CONTENT_FADE_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
            }}
          >
            <span className="arc-carousel-divider-track" />
            <motion.span
              className="arc-carousel-divider-progress"
              style={{ transformOrigin: "left center" }}
              animate={{ scaleX: audioProgress }}
              transition={{
                duration: shouldReduceMotion ? 0 : 0.18,
                ease: [0.25, 1, 0.5, 1],
              }}
            />
          </div>
          <p
            className="arc-carousel-author"
            style={{
              opacity: detailOpacity,
              transition: shouldReduceMotion ? "none" : `opacity ${LEFT_HERO_CONTENT_FADE_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
            }}
          >
            {card.author}
          </p>
          <div
            className="arc-carousel-actions"
            style={{
              opacity: detailOpacity,
              transition: shouldReduceMotion ? "none" : `opacity ${LEFT_HERO_CONTENT_FADE_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
            }}
          >
            {hasAudioStarted ? (
              <motion.button
                type="button"
                className="arc-carousel-replay-action rounded-full flex items-center justify-center transition-colors"
                style={{
                  width: `${2.5 * cardContentScale}rem`,
                  height: `${2.5 * cardContentScale}rem`,
                }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
                transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
                aria-label={`Replay audio for: ${card.title}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={async (event) => {
                  event.stopPropagation();
                  const audio = audioRef.current;
                  if (!audio || !currentAudioSrc) return;
                  audio.currentTime = 0;
                  setAudioProgress(0);
                  if (audio.paused) {
                    try {
                      await audio.play();
                    } catch {
                      return;
                    }
                  }
                }}
              >
                <RotateCcw
                  className="text-zinc-600"
                  style={{
                    width: `${1.05 * cardContentScale}rem`,
                    height: `${1.05 * cardContentScale}rem`,
                  }}
                />
              </motion.button>
            ) : null}
            <motion.button
              type="button"
              className={`arc-carousel-card-action rounded-full flex items-center justify-center transition-colors${showHintShimmer ? " arc-carousel-card-action--hint" : ""}`}
              style={{
                width: `${2.5 * cardContentScale}rem`,
                height: `${2.5 * cardContentScale}rem`,
                border: "1px solid rgba(255, 255, 255, 0.72)",
                background: "rgba(255, 255, 255, 0.54)",
                boxShadow: "0 1px 0 rgba(45, 52, 53, 0.03)",
                backdropFilter: "blur(8px)",
              }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.96, x: 1 }}
              whileHover={shouldReduceMotion ? undefined : { scale: 1.02, x: 0.5 }}
              transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
              aria-label={`Play audio for: ${card.title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={async (event) => {
                event.stopPropagation();
                const audio = audioRef.current;
                if (!audio || !currentAudioSrc) return;
                if (audio.paused) {
                  try {
                    await audio.play();
                  } catch {
                    return;
                  }
                } else {
                  audio.pause();
                }
              }}
            >
              {isAudioPlaying ? (
                <Pause
                  className="text-zinc-600"
                  style={{
                    width: `${1.05 * cardContentScale}rem`,
                    height: `${1.05 * cardContentScale}rem`,
                  }}
                />
              ) : (
                <Play
                  className="text-zinc-600"
                  style={{
                    width: `${1.05 * cardContentScale}rem`,
                    height: `${1.05 * cardContentScale}rem`,
                  }}
                />
              )}
            </motion.button>
          </div>
          {currentAudioSrc ? (
            <audio
              ref={audioRef}
              src={currentAudioSrc}
              preload="none"
              onError={() => {
                setAudioSrcIndex((prev) => (prev + 1 < audioSources.length ? prev + 1 : prev));
              }}
            />
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function ArcCarouselStaticCard({ card }: { card: CardData }) {
  return (
    <div
      className="bg-[#fcfbf9] border flex flex-col relative overflow-hidden group isolate transform-gpu"
      style={{
        WebkitMaskImage: "-webkit-radial-gradient(white, black)",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: "translateZ(0)",
        borderColor: "rgba(173, 179, 180, 0.18)",
        boxShadow: "0 1px 0 rgba(45, 52, 53, 0.03), 0 26px 56px rgba(45, 52, 53, 0.12), 0 44px 84px rgba(45, 52, 53, 0.08)",
        padding: `${2 * BASE_CARD_CONTENT_SCALE}rem`,
        borderRadius: `${2 * BASE_CARD_CONTENT_SCALE}rem`,
        width: `${BASE_CARD_WIDTH}px`,
        height: `${BASE_CARD_HEIGHT}px`,
      }}
    >
      <motion.div
        className="arc-carousel-wash absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(
            140% 140% at 50% 50%,
            color-mix(in oklab, ${card.color} 88%, black 12%) 0%,
            rgba(255, 255, 255, 0.985) 46%,
            rgba(255, 255, 255, 0.995) 68%
          )`,
          backgroundSize: "205% 205%",
          backgroundPosition: "100% 0%",
          opacity: 0.35,
          transformOrigin: "center center",
        }}
        animate={{
          backgroundPosition: ["100% 0%", "100% 100%", "0% 100%", "0% 0%", "100% 0%"],
          backgroundSize: ["198% 198%", "205% 205%", "198% 198%", "205% 205%", "198% 198%"],
          opacity: [0.3, 0.42, 0.3, 0.42, 0.3],
        }}
        transition={{
          backgroundPosition: {
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
            repeatType: "loop",
          },
          backgroundSize: {
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
            repeatType: "loop",
          },
          opacity: {
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
            repeatType: "loop",
          },
        }}
      />
      <div className="absolute inset-0 opacity-[0.15] pointer-events-none" style={{ backgroundImage: NOISE_SVG }} />
      <div className="relative z-10 flex-1">
        <div className="arc-carousel-copy" style={{ opacity: 1 }}>
          <div
            style={{
              marginBottom: `${1 * BASE_CARD_CONTENT_SCALE}rem`,
              paddingRight: 0,
            }}
          >
            <h2 className="arc-carousel-title">{card.title}</h2>
          </div>
          <div className="arc-carousel-excerpt-wrap">
            <p className="arc-carousel-body">{card.content}</p>
            <p className="arc-carousel-ellipsis" aria-hidden="true">...</p>
          </div>
        </div>
      </div>

      <div
        className="relative z-10 flex items-center justify-between mt-auto"
        style={{
          borderTop: "1px solid rgba(173, 179, 180, 0.2)",
          paddingTop: `${1.5 * BASE_CARD_CONTENT_SCALE}rem`,
        }}
      >
        <p className="arc-carousel-author">{card.author}</p>
        <div
          className="arc-carousel-card-action rounded-full flex items-center justify-center"
          style={{
            width: `${2.5 * BASE_CARD_CONTENT_SCALE}rem`,
            height: `${2.5 * BASE_CARD_CONTENT_SCALE}rem`,
            border: "1px solid rgba(255, 255, 255, 0.72)",
            background: "rgba(255, 255, 255, 0.54)",
            boxShadow: "0 1px 0 rgba(45, 52, 53, 0.03)",
            backdropFilter: "blur(8px)",
          }}
          aria-hidden="true"
        >
          <Play
            className="text-zinc-600"
            style={{
              width: `${1.05 * BASE_CARD_CONTENT_SCALE}rem`,
              height: `${1.05 * BASE_CARD_CONTENT_SCALE}rem`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default ArcCarousel;
