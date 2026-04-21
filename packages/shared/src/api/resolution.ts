import { z } from "zod";

export const ResolutionProgressSchema = z.object({
  running: z.boolean(),
  resolved: z.number(),
  failed: z.number(),
  total: z.number(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export type ResolutionProgress = z.infer<typeof ResolutionProgressSchema>;
