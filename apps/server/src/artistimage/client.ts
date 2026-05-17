import path from "node:path";
import { throttledFetch } from "../musicbrainz/client.js";
import { logger } from "../logger.js";

// Wikimedia's Special:FilePath returns the original asset (often multi-MB)
// when no `?width=` is supplied. Artist cards display in a ~140px circle, so
// request a thumbnail sized for 2x DPR. SVG sources are left untouched —
// Wikimedia rasterises them inconsistently and <img> handles them natively.
const THUMBNAIL_WIDTH = 320;
const RASTER_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const log = logger.child({ module: "artistimage-client" });

export type ArtistImageSource = {
  url: string;
  filename: string;
};

// Resolve a MusicBrainz artist MBID through its Wikidata QID to a
// Wikimedia Commons image. Returns null when any step is missing or fails.
export async function lookupArtistImageSource(
  artistMbid: string,
): Promise<ArtistImageSource | null> {
  try {
    const mbRes = await throttledFetch(
      `https://musicbrainz.org/ws/2/artist/${artistMbid}?inc=url-rels&fmt=json`,
    );
    if (!mbRes.ok) {
      log.warn(
        { artistMbid, status: mbRes.status },
        "mb artist url-rels lookup non-ok response",
      );
      return null;
    }
    const mbData = (await mbRes.json()) as {
      relations?: Array<{ type: string; url: { resource: string } }>;
    };

    const wikidataRel = mbData.relations?.find((r) => r.type === "wikidata");
    if (!wikidataRel) return null;

    const qid = wikidataRel.url.resource.split("/wiki/")[1];
    if (!qid) return null;

    const wdRes = await fetch(
      `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
    );
    if (!wdRes.ok) {
      log.warn(
        { artistMbid, qid, status: wdRes.status },
        "wikidata entity lookup non-ok response",
      );
      return null;
    }
    const wdData = (await wdRes.json()) as {
      entities: Record<
        string,
        {
          claims?: {
            P18?: Array<{ mainsnak: { datavalue?: { value: string } } }>;
          };
        }
      >;
    };

    const filename =
      wdData.entities[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!filename) return null;

    const base = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
    const ext = path.extname(filename).toLowerCase();
    const url = RASTER_EXTS.has(ext) ? `${base}?width=${THUMBNAIL_WIDTH}` : base;
    return { filename, url };
  } catch (err) {
    log.warn({ err, artistMbid }, "artist image source lookup failed");
    return null;
  }
}
