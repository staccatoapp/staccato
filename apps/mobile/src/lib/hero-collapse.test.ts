import {
  CONTENT_FADE_END_FRACTION,
  TITLE_FADE_END_FRACTION,
  TITLE_FADE_START_FRACTION,
  contentFadeInputRange,
  heroCollapseDistance,
  titleFadeInputRange,
} from "./hero-collapse";

describe("heroCollapseDistance", () => {
  it("returns the scrollable distance between full and collapsed heights", () => {
    expect(heroCollapseDistance(600, 100)).toBe(500);
  });

  it("floors to 1 so the interpolation input range is never zero-width", () => {
    expect(heroCollapseDistance(100, 100)).toBe(1);
    expect(heroCollapseDistance(80, 100)).toBe(1);
  });
});

describe("contentFadeInputRange", () => {
  it("fades from the top of the scroll to the content-fade fraction", () => {
    const distance = 500;
    expect(contentFadeInputRange(distance)).toEqual([
      0,
      distance * CONTENT_FADE_END_FRACTION,
    ]);
  });

  it("is strictly increasing for a positive distance", () => {
    const [start, end] = contentFadeInputRange(500);
    expect(end).toBeGreaterThan(start);
  });
});

describe("titleFadeInputRange", () => {
  it("fades in over the final stretch of the collapse", () => {
    const distance = 500;
    expect(titleFadeInputRange(distance)).toEqual([
      distance * TITLE_FADE_START_FRACTION,
      distance * TITLE_FADE_END_FRACTION,
    ]);
  });

  it("starts after the content has finished fading out", () => {
    expect(TITLE_FADE_START_FRACTION).toBeGreaterThanOrEqual(
      CONTENT_FADE_END_FRACTION,
    );
  });

  it("is strictly increasing for a positive distance", () => {
    const [start, end] = titleFadeInputRange(500);
    expect(end).toBeGreaterThan(start);
  });
});
