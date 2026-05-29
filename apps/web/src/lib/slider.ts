export function getSliderValue(
  value: number | readonly number[],
  fallback: number,
): number {
  return typeof value === "number" ? value : (value[0] ?? fallback);
}
