import { z } from "zod";

export const ScanProgressSchema = z.object({
  running: z.boolean(),
  scanned: z.number(),
  failed: z.number(),
  total: z.number().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export type ScanProgress = z.infer<typeof ScanProgressSchema>;
