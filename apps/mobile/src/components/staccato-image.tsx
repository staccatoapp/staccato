import { Image, type ImageContentFit } from "expo-image";
import React, { useState } from "react";
import type { StyleProp, ImageStyle } from "react-native";

import { resolveImageSource } from "@/lib/image-source";
import { useSession } from "@/lib/session";

interface StaccatoImageProps {
  /**
   * Image url as returned by the server — a server-relative `/metadata/...`
   * path, an absolute external url, or null. See {@link resolveImageSource}.
   */
  uri: string | null | undefined;
  /** Rendered when `uri` can't be resolved or the image fails to load. */
  fallback: React.ReactNode;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  testID?: string;
}

/**
 * Renders a remote Staccato image, handling the two things a bare `<Image>`
 * can't: absolutising server-relative `/metadata/...` urls against the active
 * session's server and attaching its bearer token (the `/metadata` route is
 * auth-protected). Falls back to `fallback` when the url is absent/unresolvable
 * or the load fails.
 */
export function StaccatoImage({
  uri,
  fallback,
  style,
  contentFit,
  testID,
}: StaccatoImageProps) {
  const { session } = useSession();
  const source = resolveImageSource(uri, session?.serverUrl, session?.token);

  // Track the uri that failed rather than a boolean, so a changed source gets a
  // fresh attempt automatically (no effect needed to reset on uri change).
  const [failedUri, setFailedUri] = useState<string | null>(null);

  if (!source || failedUri === source.uri) return <>{fallback}</>;

  return (
    <Image
      testID={testID}
      source={source}
      style={style}
      contentFit={contentFit}
      onError={() => setFailedUri(source.uri)}
    />
  );
}
