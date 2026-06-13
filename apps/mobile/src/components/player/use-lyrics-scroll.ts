import { useCallback, useEffect, useRef, useState } from "react";
import type { ScrollView } from "react-native";

const LINE_HEIGHT_FALLBACK = 44;

export function centeredScrollY(
  activeIndex: number,
  lineHeights: number[],
): number {
  let sumBefore = 0;
  for (let i = 0; i < activeIndex; i++) {
    sumBefore += lineHeights[i] ?? LINE_HEIGHT_FALLBACK;
  }
  const activeHeight = lineHeights[activeIndex] ?? LINE_HEIGHT_FALLBACK;
  // With contentContainer paddingTop = viewportHeight/2, the scroll offset
  // that centres line[i] simplifies to: sumBefore + activeHeight/2
  return Math.max(0, sumBefore + activeHeight / 2);
}

interface UseLyricsScrollOptions {
  activeIndex: number;
  lineHeights: number[];
  viewportHeight: number;
  resumeIdleMs?: number;
}

export function useLyricsScroll({
  activeIndex,
  lineHeights,
  viewportHeight,
  resumeIdleMs = 2000,
}: UseLyricsScrollOptions) {
  const scrollRef = useRef<ScrollView>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollOffsetRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Refs so the idle-timer callback always reads the latest values even if
  // activeIndex advances while the timer is pending.
  const activeIndexRef = useRef(activeIndex);
  const lineHeightsRef = useRef(lineHeights);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);
  useEffect(() => {
    lineHeightsRef.current = lineHeights;
  }, [lineHeights]);

  useEffect(() => {
    if (!autoScroll) return;
    const y = centeredScrollY(activeIndex, lineHeights);
    scrollRef.current?.scrollTo({ y, animated: true });
  }, [activeIndex, lineHeights, autoScroll]);

  const onScrollBeginDrag = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    setAutoScroll(false);
  }, []);

  const scheduleResumeCheck = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      const targetY = centeredScrollY(
        activeIndexRef.current,
        lineHeightsRef.current,
      );
      const isNearActive =
        Math.abs(scrollOffsetRef.current - targetY) < viewportHeight / 2;
      if (isNearActive) setAutoScroll(true);
    }, resumeIdleMs);
  }, [viewportHeight, resumeIdleMs]);

  const onScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
    },
    [],
  );

  return {
    scrollRef,
    autoScroll,
    onScrollBeginDrag,
    onScrollEndDrag: scheduleResumeCheck,
    onMomentumScrollEnd: scheduleResumeCheck,
    onScroll,
  };
}
