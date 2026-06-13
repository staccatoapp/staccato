import { renderHook, act } from "@testing-library/react-native";

import { centeredScrollY, useLyricsScroll } from "./use-lyrics-scroll";

const LINE_HEIGHTS = [44, 44, 44, 44];
const VIEWPORT_HEIGHT = 320;

describe("centeredScrollY", () => {
  it("returns half the first line height for the first line", () => {
    expect(centeredScrollY(0, [44])).toBe(22);
  });

  it("accumulates heights of preceding lines plus half the active line height", () => {
    expect(centeredScrollY(2, [44, 36, 52])).toBe(44 + 36 + 26); // 106
  });

  it("uses the fallback height when lineHeights is empty", () => {
    expect(centeredScrollY(0, [])).toBeGreaterThanOrEqual(0);
  });
});

describe("useLyricsScroll", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts in auto-scroll mode", () => {
    const { result } = renderHook(() =>
      useLyricsScroll({
        activeIndex: 0,
        lineHeights: LINE_HEIGHTS,
        viewportHeight: VIEWPORT_HEIGHT,
      }),
    );
    expect(result.current.autoScroll).toBe(true);
  });

  it("disables auto-scroll when the user begins dragging", () => {
    const { result } = renderHook(() =>
      useLyricsScroll({
        activeIndex: 0,
        lineHeights: LINE_HEIGHTS,
        viewportHeight: VIEWPORT_HEIGHT,
      }),
    );
    act(() => {
      result.current.onScrollBeginDrag();
    });
    expect(result.current.autoScroll).toBe(false);
  });

  it("re-enables auto-scroll after idle timeout when scrolled near the active line", () => {
    // centeredScrollY(1, [44,44,44,44]) = 44 + 22 = 66; scroll near that
    const { result } = renderHook(() =>
      useLyricsScroll({
        activeIndex: 1,
        lineHeights: LINE_HEIGHTS,
        viewportHeight: VIEWPORT_HEIGHT,
        resumeIdleMs: 500,
      }),
    );

    act(() => {
      result.current.onScrollBeginDrag();
      result.current.onScroll({ nativeEvent: { contentOffset: { y: 66 } } });
      result.current.onScrollEndDrag();
    });

    expect(result.current.autoScroll).toBe(false);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.autoScroll).toBe(true);
  });

  it("keeps auto-scroll disabled when scrolled far from the active line", () => {
    // centeredScrollY(1) = 66; scroll 400px away (> VIEWPORT_HEIGHT/2 = 160)
    const { result } = renderHook(() =>
      useLyricsScroll({
        activeIndex: 1,
        lineHeights: LINE_HEIGHTS,
        viewportHeight: VIEWPORT_HEIGHT,
        resumeIdleMs: 500,
      }),
    );

    act(() => {
      result.current.onScrollBeginDrag();
      result.current.onScroll({ nativeEvent: { contentOffset: { y: 466 } } });
      result.current.onScrollEndDrag();
    });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.autoScroll).toBe(false);
  });

  it("re-enables auto-scroll after momentum ends when scrolled near the active line", () => {
    // centeredScrollY(0) = 22
    const { result } = renderHook(() =>
      useLyricsScroll({
        activeIndex: 0,
        lineHeights: LINE_HEIGHTS,
        viewportHeight: VIEWPORT_HEIGHT,
        resumeIdleMs: 500,
      }),
    );

    act(() => {
      result.current.onScrollBeginDrag();
      result.current.onScroll({ nativeEvent: { contentOffset: { y: 22 } } });
      result.current.onMomentumScrollEnd();
    });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.autoScroll).toBe(true);
  });

  it("cancels the pending resume timer when the user starts scrolling again", () => {
    const { result } = renderHook(() =>
      useLyricsScroll({
        activeIndex: 0,
        lineHeights: LINE_HEIGHTS,
        viewportHeight: VIEWPORT_HEIGHT,
        resumeIdleMs: 500,
      }),
    );

    act(() => {
      result.current.onScrollBeginDrag();
      result.current.onScroll({ nativeEvent: { contentOffset: { y: 22 } } });
      result.current.onScrollEndDrag(); // schedule resume
    });

    act(() => {
      jest.advanceTimersByTime(200); // partway through — not yet fired
      result.current.onScrollBeginDrag(); // should cancel the pending timer
    });

    act(() => {
      jest.advanceTimersByTime(400); // would have fired the original timer
    });

    expect(result.current.autoScroll).toBe(false);
  });
});
