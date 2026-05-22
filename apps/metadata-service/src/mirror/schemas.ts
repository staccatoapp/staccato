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

// ── Recording search (R2) ────────────────────────────────────────────────────
// /recording?query=<lucene>&inc=...&fmt=json — each hit carries a Solr score.
// Extra top-level keys (count/offset/created) are ignored.
export const RecordingSearchResponseSchema = z.object({
  recordings: z.array(RecordingRichSchema.extend({ score: z.number() })),
});
export type RecordingSearchResponse = z.infer<
  typeof RecordingSearchResponseSchema
>;

// ── Unified search (R3) ──────────────────────────────────────────────────────
// Recording hits reuse RecordingSearchResponseSchema above (rich + score, with
// releases carrying release-group/primary-type/status for pickBestRelease).

// /artist?query=<q>&fmt=json — each hit carries a Solr relevance score.
export const ArtistSearchResponseSchema = z.object({
  artists: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      disambiguation: z.string().nullish(),
      type: z.string().nullish(),
      score: z.number().nullish(),
    }),
  ),
});
export type ArtistSearchResponse = z.infer<typeof ArtistSearchResponseSchema>;

// /release?query=<q>&inc=artist-credits+release-groups&fmt=json
export const ReleaseSearchResponseSchema = z.object({
  releases: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullish(),
      date: z.string().nullish(),
      status: z.string().nullish(),
      score: z.number().nullish(),
      "artist-credit": z.array(ArtistCreditEntrySchema).nullish(),
      "release-group": z
        .object({
          id: z.string().nullish(),
          "primary-type": z.string().nullish(),
        })
        .nullish(),
    }),
  ),
});
export type ReleaseSearchResponse = z.infer<typeof ReleaseSearchResponseSchema>;

// ── Release search (R5 · Identify dialog, all pressings) ─────────────────────
// /release?query=<lucene>&inc=artist-credits+release-groups+media+labels&fmt=json
// Unlike R3's release search this is NOT deduped by release-group — every
// pressing is returned with its country/format/label/track-count so the user
// can pick the one whose tracklist matches their files.
export const ReleaseSearchRichSchema = z.object({
  releases: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      disambiguation: z.string().nullish(),
      date: z.string().nullish(),
      country: z.string().nullish(),
      status: z.string().nullish(),
      "track-count": z.number().nullish(),
      "artist-credit": z.array(ArtistCreditEntrySchema).nullish(),
      "release-group": z
        .object({
          id: z.string().nullish(),
          "primary-type": z.string().nullish(),
        })
        .nullish(),
      media: z
        .array(
          z.object({
            format: z.string().nullish(),
            "track-count": z.number().nullish(),
          }),
        )
        .nullish(),
      "label-info": z
        .array(
          z.object({
            label: z.object({ name: z.string().nullish() }).nullish(),
          }),
        )
        .nullish(),
    }),
  ),
});
export type ReleaseSearchRich = z.infer<typeof ReleaseSearchRichSchema>;

// ── Release lookup (R4, and the second hop of R6) ────────────────────────────
// /release/:mbid?inc=recordings+artist-credits+release-groups&fmt=json
export const ReleaseLookupSchema = z.object({
  title: z.string().nullish(),
  disambiguation: z.string().nullish(),
  date: z.string().nullish(),
  "artist-credit": z.array(ArtistCreditEntrySchema).nullish(),
  "release-group": z.object({ id: z.string().nullish() }).nullish(),
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
export type ReleaseLookup = z.infer<typeof ReleaseLookupSchema>;

// ── Release-group lookup (first hop of R6) ───────────────────────────────────
// /release-group/:mbid?inc=releases+artist-credits&fmt=json
export const ReleaseGroupLookupSchema = z.object({
  title: z.string(),
  "primary-type": z.string().nullish(),
  "artist-credit": z.array(ArtistCreditEntrySchema).nullish(),
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
export type ReleaseGroupLookup = z.infer<typeof ReleaseGroupLookupSchema>;

// ── Artist lookup + discography (R7) ─────────────────────────────────────────
// /artist/:mbid?fmt=json
export const ArtistLookupSchema = z.object({
  id: z.string(),
  name: z.string(),
  disambiguation: z.string().nullish(),
});
export type ArtistLookup = z.infer<typeof ArtistLookupSchema>;

// /release-group?artist=:mbid&type=album|ep&limit=100&offset=N&fmt=json
export const ArtistReleaseGroupsSchema = z.object({
  "release-groups": z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      "first-release-date": z.string().nullish(),
      "primary-type": z.string().nullish(),
      "secondary-types": z.array(z.string()).nullish(),
    }),
  ),
  "release-group-count": z.number().nullish(),
});
export type ArtistReleaseGroups = z.infer<typeof ArtistReleaseGroupsSchema>;
