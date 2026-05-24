export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[-‐‑‒–—―]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
