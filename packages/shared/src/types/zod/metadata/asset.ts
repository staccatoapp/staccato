import { z } from "zod";

// Façade → server contract for asset resolution (R8). Mirrors the server's
// former ArtistImageSource. The façade owns the full 3-hop chain (MB url-rels →
// Wikidata QID → Wikimedia Commons P18 filename) and returns the *base* Commons
// URL (Special:FilePath/<filename>, no `?width=`) plus the filename; the server
// keeps presentation concerns (disk cache + thumbnail-width sizing).
//
// R9 (cover art) needs no DTO — that route is a redirect passthrough mirroring
// the Cover Art Archive's front-cover endpoint.

export const MetadataArtistImageSchema = z.object({
  url: z.string(),
  filename: z.string(),
});
export type MetadataArtistImage = z.infer<typeof MetadataArtistImageSchema>;
