import { z } from "zod";

// Raw MusicBrainz API response shapes. Validate on the wire boundary;
// downstream mappers transform these into the domain types exported from
// `./client.ts`.

const ArtistCreditSchema = z.array(
  z.object({
    artist: z.object({
      id: z.string(),
      name: z.string(),
    }),
  }),
);

const ReleaseGroupRefSchema = z
  .object({
    id: z.string().nullish(),
    "primary-type": z.string().nullish(),
  })
  .nullish();

const ReleaseLikeSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  date: z.string().nullish(),
  status: z.string().nullish(),
  "release-group": ReleaseGroupRefSchema,
});

const ReleaseSchema = ReleaseLikeSchema.extend({
  title: z.string(),
});

const RecordingSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  score: z.number(),
  video: z.boolean().nullish(),
  releases: z.array(ReleaseSchema).nullish(),
  "artist-credit": ArtistCreditSchema.nullish(),
});

export const MBRecordingSearchResponseSchema = z.object({
  recordings: z.array(RecordingSchema),
});

export const MBExternalRecordingSearchResponseSchema = z.object({
  recordings: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      length: z.number().nullish(),
      video: z.boolean().nullish(),
      "artist-credit": ArtistCreditSchema.nullish(),
      releases: z.array(ReleaseSchema).nullish(),
    }),
  ),
});

export const MBArtistSearchResponseSchema = z.object({
  artists: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      disambiguation: z.string().nullish(),
      type: z.string().nullish(),
    }),
  ),
});

export const MBReleaseSearchResponseSchema = z.object({
  releases: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      date: z.string().nullish(),
      status: z.string().nullish(),
      "artist-credit": ArtistCreditSchema.nullish(),
      "release-group": z
        .object({
          id: z.string().nullish(),
          "primary-type": z.string().nullish(),
        })
        .nullish(),
    }),
  ),
});

export const MBRecordingLookupSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  length: z.number().nullish(),
  video: z.boolean().nullish(),
  "artist-credit": ArtistCreditSchema.nullish(),
  releases: z.array(ReleaseSchema).nullish(),
});

export const MBReleaseLookupSchema = z.object({
  title: z.string().nullish(),
  "artist-credit": ArtistCreditSchema.nullish(),
  "release-group": z
    .object({
      id: z.string(),
    })
    .nullish(),
  media: z.array(
    z.object({
      position: z.number(),
      tracks: z.array(
        z.object({
          position: z.number(),
          title: z.string(),
          length: z.number().nullish(),
          recording: z.object({
            id: z.string(),
            video: z.boolean().nullish(),
          }),
        }),
      ),
    }),
  ),
});

export const MBReleaseGroupSearchResponseSchema = z.object({
  "release-groups": z.array(
    z.object({
      id: z.string(),
      score: z.number(),
    }),
  ),
});

export const MBReleaseGroupLookupSchema = z.object({
  title: z.string(),
  "primary-type": z.string().nullish(),
  "artist-credit": ArtistCreditSchema.nullish(),
  releases: z
    .array(
      z.object({
        id: z.string(),
        date: z.string().nullish(),
        status: z.string().nullish(),
      }),
    )
    .nullish(),
});
