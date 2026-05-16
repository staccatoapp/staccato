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
    id: z.string().optional(),
    "primary-type": z.string().optional(),
  })
  .optional();

const ReleaseLikeSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  date: z.string().optional(),
  status: z.string().optional(),
  "release-group": ReleaseGroupRefSchema,
});

const ReleaseSchema = ReleaseLikeSchema.extend({
  title: z.string(),
});

const RecordingSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  score: z.number(),
  releases: z.array(ReleaseSchema).optional(),
  "artist-credit": ArtistCreditSchema.optional(),
});

export const MBRecordingSearchResponseSchema = z.object({
  recordings: z.array(RecordingSchema),
});

export const MBExternalRecordingSearchResponseSchema = z.object({
  recordings: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      length: z.number().optional(),
      "artist-credit": ArtistCreditSchema.optional(),
      releases: z.array(ReleaseSchema).optional(),
    }),
  ),
});

export const MBArtistSearchResponseSchema = z.object({
  artists: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      disambiguation: z.string().optional(),
      type: z.string().optional(),
    }),
  ),
});

export const MBReleaseSearchResponseSchema = z.object({
  releases: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      date: z.string().optional(),
      status: z.string().optional(),
      "artist-credit": ArtistCreditSchema.optional(),
      "release-group": z
        .object({
          id: z.string().optional(),
          "primary-type": z.string().optional(),
        })
        .optional(),
    }),
  ),
});

export const MBRecordingLookupSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  length: z.number().optional(),
  "artist-credit": ArtistCreditSchema.optional(),
  releases: z.array(ReleaseSchema).optional(),
});

export const MBReleaseLookupSchema = z.object({
  title: z.string().optional(),
  "artist-credit": ArtistCreditSchema.optional(),
  "release-group": z
    .object({
      id: z.string(),
    })
    .optional(),
  media: z.array(
    z.object({
      position: z.number(),
      tracks: z.array(
        z.object({
          position: z.number(),
          title: z.string(),
          length: z.number().optional(),
          recording: z.object({ id: z.string() }),
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
  "primary-type": z.string().optional(),
  "artist-credit": ArtistCreditSchema.optional(),
  releases: z
    .array(
      z.object({
        id: z.string(),
        date: z.string().optional(),
        status: z.string().optional(),
      }),
    )
    .optional(),
});
