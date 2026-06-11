/**
 * Resolved {@link https://docs.expo.dev/versions/v56.0.0/sdk/image/ ImageSource}
 * shape: an absolute URI plus, for same-origin (server) images, the auth headers
 * needed to fetch them.
 */
export interface ResolvedImageSource {
  uri: string;
  headers?: Record<string, string>;
}

/**
 * Turns a Staccato `coverArtUrl` (or any image url) into an expo-image source.
 *
 * The server returns server-relative paths (e.g. `/metadata/covers/<id>.jpg`)
 * served behind `requireAuth`. On native there is no document origin to resolve
 * them against, and `<Image>` sends no session cookie, so we absolutise against
 * the session's `serverUrl` and attach the bearer token.
 *
 * Absolute (`http`/`https`) urls — e.g. the hosted metadata façade — point at a
 * different host that does NOT accept the user's token, so they pass through
 * verbatim and we deliberately never attach the `Authorization` header (sending
 * it would leak the user's API token to a third party).
 *
 * Anything else (null/empty, or a non-url sentinel) returns null so the caller
 * can render its placeholder.
 */
export function resolveImageSource(
  url: string | null | undefined,
  serverUrl: string | null | undefined,
  token: string | undefined,
): ResolvedImageSource | null {
  if (!url) return null;

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return { uri: url };
  }

  if (url.startsWith("/")) {
    if (!serverUrl) return null;
    const base = serverUrl.replace(/\/+$/, "");
    return token
      ? { uri: `${base}${url}`, headers: { Authorization: `Bearer ${token}` } }
      : { uri: `${base}${url}` };
  }

  return null;
}
