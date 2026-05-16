import { throttledFetch } from "../../musicbrainz/client.js";
import {
  getResolvedArtistsWithoutCoverArt,
  updateArtist,
} from "../../db/queries/artists.js";
import { logger } from "../../logger.js";

const log = logger.child({ module: "resolver:artist-image" });

export async function runArtistImagePass(): Promise<void> {
  const artistsMissingCoverArt = getResolvedArtistsWithoutCoverArt();

  if (artistsMissingCoverArt.length === 0) return;
  log.info(
    { count: artistsMissingCoverArt.length },
    "artist image pass starting",
  );

  for (const artist of artistsMissingCoverArt) {
    try {
      const mbRes = await throttledFetch(
        `https://musicbrainz.org/ws/2/artist/${artist.musicbrainzId}?inc=url-rels&fmt=json`,
      );
      if (!mbRes.ok) continue;
      const mbData = (await mbRes.json()) as {
        relations?: Array<{ type: string; url: { resource: string } }>;
      };

      const wikidataRel = mbData.relations?.find((r) => r.type === "wikidata");
      if (!wikidataRel) continue;

      const qid = wikidataRel.url.resource.split("/wiki/")[1];
      if (!qid) continue;

      const wdRes = await fetch(
        `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
      );
      if (!wdRes.ok) continue;
      const wdData = (await wdRes.json()) as {
        entities: Record<
          string,
          {
            claims?: {
              P18?: Array<{
                mainsnak: { datavalue?: { value: string } };
              }>;
            };
          }
        >;
      };

      const filename =
        wdData.entities[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (!filename) continue;

      const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
      updateArtist(artist.id, { imageUrl });
    } catch (err) {
      log.warn(
        { err, artistId: artist.id, artistMbid: artist.musicbrainzId },
        "artist image lookup failed",
      );
    }
  }
}
