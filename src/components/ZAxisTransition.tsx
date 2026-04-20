import { AnimatePresence, motion } from "motion/react";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";

type TransitionItem = {
  id: string;
};

type RenderCardContext = {
  isActive: boolean;
  isTransitioning: boolean;
};

type RenderNextPageContext<T extends TransitionItem> = {
  activeId: string;
  activeItem: T;
  isTransitioning: boolean;
  resetTransition: () => void;
};

type ZAxisTransitionProps<T extends TransitionItem> = {
  items: T[];
  renderCard: (item: T, context: RenderCardContext) => ReactNode;
  renderNextPage: (context: RenderNextPageContext<T>) => ReactNode;
  renderGrid?: (cards: ReactNode[]) => ReactNode;
  flyingCardTurn?: boolean;
  nextPageMountMs?: number;
  completeNavigationMs?: number;
  nextPageFadeDurationMs?: number;
  className?: string;
  onTransitionStart?: (id: string) => void;
  onTransitionComplete?: (id: string) => void;
};

export default function ZAxisTransition<T extends TransitionItem>({
  items,
  renderCard,
  renderNextPage,
  renderGrid,
  flyingCardTurn = false,
  nextPageMountMs = 1900,
  completeNavigationMs = 2200,
  nextPageFadeDurationMs = 320,
  className,
  onTransitionStart,
  onTransitionComplete,
}: ZAxisTransitionProps<T>) {
  const CARD_ANIMATION_MS = 2000;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showNextPage, setShowNextPage] = useState(false);
  const completeTimerRef = useRef<number | null>(null);
  const nextPageTimerRef = useRef<number | null>(null);

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeId) ?? null,
    [activeId, items]
  );

  const handleCardClick = (id: string) => {
    if (isTransitioning) return;
    setActiveId(id);
    setIsTransitioning(true);
    setShowNextPage(false);
    onTransitionStart?.(id);
    // Defer mounting the next screen so card expansion gets GPU headroom.
    nextPageTimerRef.current = window.setTimeout(() => {
      setShowNextPage(true);
    }, nextPageMountMs);
    completeTimerRef.current = window.setTimeout(() => {
      onTransitionComplete?.(id);
    }, completeNavigationMs);
  };

  useEffect(() => () => {
    if (completeTimerRef.current !== null) {
      window.clearTimeout(completeTimerRef.current);
    }
    if (nextPageTimerRef.current !== null) {
      window.clearTimeout(nextPageTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isTransitioning) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - html.clientWidth;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
    };
  }, [isTransitioning]);

  const resetTransition = () => {
    setIsTransitioning(false);
    setShowNextPage(false);
    setActiveId(null);
  };

  const cardNodes = items.map((item) => {
    const isActive = activeId === item.id;

    return (
      <motion.div
        key={item.id}
        layoutId={`card-container-${item.id}`}
        onClick={() => handleCardClick(item.id)}
        className={isActive ? "opacity-0 pointer-events-none" : ""}
      >
        {renderCard(item, { isActive, isTransitioning })}
      </motion.div>
    );
  });

  return (
    <>
      <motion.div
        className={className}
        initial={false}
        animate={
          isTransitioning
            ? { scale: 4, opacity: 0, filter: "blur(24px)" }
            : { scale: 1, opacity: 1, filter: "blur(0px)" }
        }
        transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1] }}
        style={{
          willChange: isTransitioning ? "transform, opacity, filter" : "auto",
          transformOrigin: "50% 50%",
          backfaceVisibility: "hidden",
        }}
      >
        {renderGrid ? renderGrid(cardNodes) : cardNodes}
      </motion.div>

      <AnimatePresence>
        {isTransitioning && activeItem && showNextPage ? (
          <motion.div
            key={`next-page-${activeItem.id}`}
            className="fixed inset-0 z-40 bg-[var(--surface-lowest)] overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0, duration: nextPageFadeDurationMs / 1000, ease: "easeOut" }}
          >
            {renderNextPage({
              activeId: activeItem.id,
              activeItem,
              isTransitioning,
              resetTransition,
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isTransitioning && activeItem ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <motion.div
              layoutId={`card-container-${activeItem.id}`}
              animate={
                flyingCardTurn
                  ? {
                      scale: [1, 1.03, 30],
                      rotateZ: [0, -5, 14],
                      rotateY: [0, -10, 0],
                      opacity: [1, 1, 0],
                    }
                  : { scale: [1, 1, 30], opacity: [1, 1, 0] }
              }
              transition={{
                layout: { duration: 1.2, ease: [0.4, 0, 0.2, 1] },
                scale: {
                  times: [0, 0.6, 1],
                  duration: CARD_ANIMATION_MS / 1000,
                  ease: [0.4, 0, 0.2, 1],
                },
                rotateZ: {
                  times: [0, 0.5, 1],
                  duration: CARD_ANIMATION_MS / 1000,
                  ease: [0.4, 0, 0.2, 1],
                },
                rotateY: {
                  times: [0, 0.45, 1],
                  duration: CARD_ANIMATION_MS / 1000,
                  ease: [0.4, 0, 0.2, 1],
                },
                opacity: { times: [0, 0.7, 1], duration: CARD_ANIMATION_MS / 1000, ease: "easeOut" },
              }}
              style={{
                willChange: "transform, opacity",
                backfaceVisibility: "hidden",
                transformPerspective: 1200,
                transformStyle: "preserve-3d",
              }}
            >
              {renderCard(activeItem, { isActive: true, isTransitioning })}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
