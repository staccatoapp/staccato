import { z } from "zod";

export const TrackStatusCountsSchema = z.object({
  pending: z.number(),
  resolving: z.number(),
  resolved: z.number(),
  failed: z.number(),
});
export type TrackStatusCounts = z.infer<typeof TrackStatusCountsSchema>;

export const ScanProgressSchema = z.object({
  running: z.boolean(),
  scanned: z.number(),
  resolved: z.number(),
  failed: z.number(),
  inFlight: z.number(),
  total: z.number().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  counts: TrackStatusCountsSchema,
});
export type ScanProgress = z.infer<typeof ScanProgressSchema>;
