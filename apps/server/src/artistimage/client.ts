import path from "node:path";
import {
  FACADE_BASE,
  MB_PRIORITY,
  throttledFetch,
  type MbPriority,
} from "../musicbrainz/client.js";
import {
  MetadataArtistImageSchema,
  type MetadataArtistImage,
} from "@staccato/shared";
import { logger } from "../logger.js";

// Wikimedia's Special:FilePath returns the original asset (often multi-MB)
// when no `?width=` is supplied. Artist cards display in a ~140px circle, so
// request a thumbnail sized for 2x DPR. SVG sources are left untouched —
// Wikimedia rasterises them inconsistently and <img> handles them natively.
const THUMBNAIL_WIDTH = 320;
const RASTER_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const log = logger.child({ module: "artistimage-client" });

export type ArtistImageSource = MetadataArtistImage;

// Resolve a MusicBrainz artist MBID to a Wikimedia Commons image via the façade
// (R8), which owns the MB url-rels → Wikidata QID → Commons filename chain. The
// façade returns the base Commons URL + filename; sizing stays here
// (presentation). Returns null when the façade has no image or the call fails.
export async function lookupArtistImageSource(
  artistMbid: string,
  priority: MbPriority = MB_PRIORITY.BACKGROUND,
): Promise<ArtistImageSource | null> {
  try {
    const res = await throttledFetch(
      `${FACADE_BASE}/artists/${artistMbid}/image`,
      { priority },
    );
    if (res.status === 404) {
      log.debug({ artistMbid }, "facade artist image: none");
      return null;
    }
    if (!res.ok) {
      log.warn(
        { artistMbid, status: res.status },
        "facade artist image non-ok response",
      );
      return null;
    }
    const { url: baseUrl, filename } = MetadataArtistImageSchema.parse(
      await res.json(),
    );

    const ext = path.extname(filename).toLowerCase();
    const url = RASTER_EXTS.has(ext)
      ? `${baseUrl}?width=${THUMBNAIL_WIDTH}`
      : baseUrl;
    return { filename, url };
  } catch (err) {
    log.warn({ err, artistMbid }, "facade artist image lookup failed");
    return null;
  }
}
