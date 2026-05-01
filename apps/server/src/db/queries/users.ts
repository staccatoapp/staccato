import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { NewUserRow, UserRow, users } from "../schema/users.js";

export function findUserByUsername(username: string): UserRow | undefined {
  return db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
    .get();
}

export function findUserById(id: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).limit(1).get();
}

export function createUser(
  data: Pick<NewUserRow, "username" | "passwordHash" | "isAdmin">,
): UserRow {
  db.insert(users).values(data).run();
  return findUserByUsername(data.username)!;
}

export function isSetupComplete(): boolean {
  return !!db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isAdmin, true))
    .limit(1)
    .get();
}

export function markOnboardingComplete(id: string): void {
  db.update(users)
    .set({ onboardingComplete: true })
    .where(eq(users.id, id))
    .run();
}
