import { z } from "zod";

// One entry in a track's MusicBrainz artist credit, mirroring the track_artists
// table. position 0 is the lead; >0 are guests ("feat."). joinPhrase is the
// text MusicBrainz places *after* this credit (e.g. " feat. ", " & ") and is
// used to reconstruct the displayed credit string faithfully.
export const TrackArtistCreditSchema = z.object({
  artistId: z.string(),
  name: z.string(),
  joinPhrase: z.string().nullable(),
  position: z.number(),
});
export type TrackArtistCredit = z.infer<typeof TrackArtistCreditSchema>;

export const AlbumArtistCreditSchema = z.object({
  artistId: z.string(),
  name: z.string(),
  joinPhrase: z.string().nullable(),
  position: z.number(),
});
export type AlbumArtistCredit = z.infer<typeof AlbumArtistCreditSchema>;
