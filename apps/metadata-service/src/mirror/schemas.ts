import { z } from "zod";

// Raw MusicBrainz ws/2 response shapes consumed from the mirror. Validate on
// the wire boundary; `map.ts` transforms these into the shared façade DTOs.
// Grows as routes are added in 3.1+.

const ArtistCreditEntrySchema = z.object({
  joinphrase: z.string().nullish(),
  artist: z.object({
    id: z.string(),
    name: z.string(),
  }),
});

const ReleaseRichSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  date: z.string().nullish(),
  country: z.string().nullish(),
  status: z.string().nullish(),
  "release-group": z
    .object({
      id: z.string().nullish(),
      "primary-type": z.string().nullish(),
      "secondary-types": z.array(z.string()).nullish(),
    })
    .nullish(),
  media: z
    .array(
      z.object({
        format: z.string().nullish(),
      }),
    )
    .nullish(),
});

export const RecordingRichSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  length: z.number().nullish(),
  video: z.boolean().nullish(),
  "artist-credit": z.array(ArtistCreditEntrySchema).nullish(),
  releases: z.array(ReleaseRichSchema).nullish(),
});

export type RecordingRich = z.infer<typeof RecordingRichSchema>;
export type ArtistCreditEntry = z.infer<typeof ArtistCreditEntrySchema>;
export type ReleaseRich = z.infer<typeof ReleaseRichSchema>;
