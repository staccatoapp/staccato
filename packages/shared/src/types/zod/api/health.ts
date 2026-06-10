import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.string(),
  name: z.string(),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
