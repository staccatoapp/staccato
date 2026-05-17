import {
  getResolvedArtistsWithoutCoverArt,
  updateArtist,
} from "../../db/queries/artists.js";
import { ensureArtistImageOnDisk } from "../../artistimage/store.js";
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
    if (!artist.musicbrainzId) continue;
    const localUrl = await ensureArtistImageOnDisk(artist.musicbrainzId);
    if (localUrl) updateArtist(artist.id, { imageUrl: localUrl });
  }
}
