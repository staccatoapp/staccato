import * as argon2 from "argon2";
import { FastifyBaseLogger } from "fastify";
import { findUserByUsername } from "../db/queries/users.js";
import { UserRow } from "../db/schema/users.js";

const DUMMY_HASH = await argon2.hash("dummy-password-for-timing-safety");

/**
 * Verifies a username/password pair. Always runs a hash verification (against
 * a dummy hash when the user is unknown) to prevent timing attacks.
 * Returns the user row on success, null on any failure.
 */
export async function verifyCredentials(
  username: string,
  password: string,
  log: FastifyBaseLogger,
): Promise<UserRow | null> {
  const user = findUserByUsername(username);

  const hashToVerify = user?.passwordHash ?? DUMMY_HASH;
  const valid = await argon2.verify(hashToVerify, password);

  if (!user || !user.passwordHash || !valid) {
    log.warn({ username }, "login failed: invalid credentials");
    return null;
  }
  return user;
}
