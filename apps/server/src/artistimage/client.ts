import { throttledFetch } from "../musicbrainz/client.js";
import { logger } from "../logger.js";

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

    return {
      filename,
      url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`,
    };
  } catch (err) {
    log.warn({ err, artistMbid }, "artist image source lookup failed");
    return null;
  }
}
