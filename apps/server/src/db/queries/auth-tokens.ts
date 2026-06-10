import { eq } from "drizzle-orm";
import { db } from "../client.js";
import {
  AuthTokenRow,
  authTokens,
  NewAuthTokenRow,
} from "../schema/auth-tokens.js";

export function createAuthToken(
  data: Pick<NewAuthTokenRow, "userId" | "tokenHash" | "deviceName">,
): AuthTokenRow {
  return db.insert(authTokens).values(data).returning().get();
}

export function findAuthTokenByHash(
  tokenHash: string,
): AuthTokenRow | undefined {
  return db
    .select()
    .from(authTokens)
    .where(eq(authTokens.tokenHash, tokenHash))
    .limit(1)
    .get();
}

export function updateAuthTokenLastUsed(id: string): void {
  db.update(authTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(authTokens.id, id))
    .run();
}

export function deleteAuthToken(id: string): void {
  db.delete(authTokens).where(eq(authTokens.id, id)).run();
}

export function deleteAuthTokensForUser(userId: string): void {
  db.delete(authTokens).where(eq(authTokens.userId, userId)).run();
}
