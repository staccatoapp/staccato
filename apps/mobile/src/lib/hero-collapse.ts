/**
 * Pure geometry for the collapsing detail hero (album / playlist screens).
 *
 * The hero collapses as the user scrolls: the gradient backdrop translates up
 * 1:1 with the scroll until its bottom edge clamps into a sticky bar, while the
 * hero content fades out and the collapsed-bar title fades in. All of those
 * transitions are driven off the *measured* hero height rather than fixed pixel
 * thresholds, so the motion stays proportional to the content (an album with a
 * long title collapses over a longer scroll than a short one).
 *
 * These helpers turn a measured hero height into the reanimated `interpolate`
 * input ranges. Kept pure + unit-tested; the component only wires them to
 * shared values.
 */

/** Content has fully faded out by this fraction of the collapse distance. */
export const CONTENT_FADE_END_FRACTION = 0.7;
/** Collapsed title starts fading in here — after the content is gone. */
export const TITLE_FADE_START_FRACTION = 0.7;
/** Collapsed title (and sticky bar) reach full opacity here, near the clamp. */
export const TITLE_FADE_END_FRACTION = 0.95;

/**
 * Total scroll distance over which the hero collapses, i.e. how far the gradient
 * translates up before its bottom edge clamps into the collapsed bar. Floored to
 * 1px so the interpolation input range is never zero-width (which happens before
 * the hero is measured, or on very short heroes).
 */
export function heroCollapseDistance(
  heroHeight: number,
  collapsedHeight: number,
): number {
  return Math.max(heroHeight - collapsedHeight, 1);
}

/** Input range for the hero-content fade-out: full at 0 → gone partway up. */
export function contentFadeInputRange(distance: number): [number, number] {
  return [0, distance * CONTENT_FADE_END_FRACTION];
}

/** Input range for the collapsed title + sticky bar fade-in, near the clamp. */
export function titleFadeInputRange(distance: number): [number, number] {
  return [
    distance * TITLE_FADE_START_FRACTION,
    distance * TITLE_FADE_END_FRACTION,
  ];
}
