import { useEffect, useState } from "react";

import {
  resolveImageSource,
  type ResolvedImageSource,
} from "@/lib/image-source";
import { useSession } from "@/lib/session";
import { getArtworkFileUri } from "@/lib/storage/artwork-cache";
import { getDownloadedArtUri } from "@/lib/storage/download-cache";

/**
 * Resolves a Staccato `coverArtUrl` to an image source, preferring a locally
 * pinned copy so downloaded art renders with no network (and the offline grid
 * shows real covers, not gradients).
 *
 * The network source ({@link resolveImageSource}) is the synchronous initial
 * value, so online first paint is unchanged. An effect then looks up a local
 * `file://` — durable downloads store first, transient artwork cache second —
 * and prefers it when found. Online this transparently avoids a refetch for an
 * already-pinned cover; offline it's the only thing that resolves. We never make
 * `resolveImageSource` itself async (it's called inline in render across the
 * app) — the async tiering lives here.
 */
export function useCachedImageSource(
  coverArtUrl: string | null | undefined,
): ResolvedImageSource | null {
  const { session } = useSession();
  const networkSource = resolveImageSource(
    coverArtUrl,
    session?.serverUrl,
    session?.token,
  );

  // Keyed by the cover url so a result from a previous url is ignored after the
  // url changes — without a synchronous reset-to-null inside the effect (which
  // would cascade renders). The only state write happens after an await.
  const [local, setLocal] = useState<{ key: string; uri: string } | null>(null);

  useEffect(() => {
    if (!coverArtUrl) return;
    let cancelled = false;
    void (async () => {
      const uri =
        (await getDownloadedArtUri(coverArtUrl, session)) ??
        (await getArtworkFileUri(coverArtUrl, session));
      if (!cancelled && uri) setLocal({ key: coverArtUrl, uri });
    })();
    return () => {
      cancelled = true;
    };
  }, [coverArtUrl, session]);

  if (local && local.key === coverArtUrl) return { uri: local.uri };
  return networkSource;
}
