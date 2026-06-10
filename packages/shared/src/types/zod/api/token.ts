import { z } from "zod";
import { AuthenticatedUserResponseSchema, LoginSchema } from "./auth.js";

export const CreateTokenSchema = LoginSchema.extend({
  deviceName: z.string().max(100).optional(),
});
export type CreateToken = z.infer<typeof CreateTokenSchema>;

export const TokenResponseSchema = z.object({
  token: z.string(),
  user: AuthenticatedUserResponseSchema,
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
