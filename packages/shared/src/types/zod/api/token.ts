import { z } from "zod";
import { AuthenticatedUserResponseSchema, LoginSchema } from "./auth.js";

export const CreateTokenSchema = LoginSchema.extend({
  deviceName: z.string().max(100).optional(),
});
export type CreateToken = z.infer<typeof CreateTokenSchema>;

export const TokenResponseSchema = z.object({
  token: z.string(),
  // The auth_tokens row id. Optional because no client reads it: the server
  // identifies a mobile WS device by its own `req.tokenId` (the row id resolved
  // from the bearer token), so the client never echoes it back. Kept on the
  // response (the server still sends it) but optional so a client built against a
  // server that omits it still parses and signs in rather than throwing (SC-8).
  tokenId: z.string().optional(),
  user: AuthenticatedUserResponseSchema,
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
