import { z } from "zod";

// Response of GET /api/preview/:recordingMbid — a lazily-resolved 30s preview
// URL (Deezer/iTunes), or null when no preview could be found. The client plays
// the URL directly (same as the inline previewUrl on recommended tracks).
export const PreviewResolutionSchema = z.object({
  previewUrl: z.string().nullable(),
});
export type PreviewResolution = z.infer<typeof PreviewResolutionSchema>;
