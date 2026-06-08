import {
  getTopTracksForArtist,
  getTopTracksForTag,
} from "../../../lastfm/client.js";

/** A track candidate sourced from Last.fm, before MBID resolution/enrichment.
 * `popularityRank` is the 0-based index in the popularity-ordered response. */
export interface Candidate {
  name: string;
  artist: string;
  mbid: string | null;
  popularityRank: number;
}

/** The candidate-sourcing seam handed to generators via GeneratorContext, so a
 * generator never touches the raw Last.fm client. SP2a exposes one method;
 * SP2b adds topTracksForArtist / similarTags / similarArtists here. */
export interface CandidateService {
  popularTracksForTag(tag: string): Promise<Candidate[]>;
  /** Popularity-ranked top tracks for one artist, addressed by MBID when known
   * (else by name). `popularityRank` is the response index, exactly like
   * popularTracksForTag (recs spec §6.2). */
  topTracksForArtist(
    artist: string,
    mbid?: string | null,
  ): Promise<Candidate[]>;
}

/** The production service: a thin normaliser over the Last.fm client. The
 * response is already popularity-ranked, so `popularityRank` is just the index —
 * no getPopularity calls (recs spec §7.2). */
export const candidateService: CandidateService = {
  async popularTracksForTag(tag: string): Promise<Candidate[]> {
    const tracks = await getTopTracksForTag(tag);
    return tracks.map((t, index) => ({
      name: t.name,
      artist: t.artist,
      mbid: t.mbid,
      popularityRank: index,
    }));
  },

  async topTracksForArtist(
    artist: string,
    mbid: string | null = null,
  ): Promise<Candidate[]> {
    const tracks = await getTopTracksForArtist({ artist, mbid });
    return tracks.map((t, index) => ({
      name: t.name,
      artist: t.artist,
      mbid: t.mbid,
      popularityRank: index,
    }));
  },
};
