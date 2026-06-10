const SCHEME_PATTERN = /^https?:\/\//i;

/**
 * Normalises a user-entered Staccato server address into a base URL:
 * trims whitespace, prepends https:// when no scheme is given (explicit
 * http:// is preserved for LAN servers), and strips trailing slashes.
 * Returns "" for empty input.
 */
export function normaliseServerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  const withScheme = SCHEME_PATTERN.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, "");
}

/**
 * Strips the scheme (and trailing slashes) from a server URL for display,
 * e.g. "https://music.example.com/" -> "music.example.com".
 */
export function displayHost(url: string): string {
  return url.replace(SCHEME_PATTERN, "").replace(/\/+$/, "");
}
