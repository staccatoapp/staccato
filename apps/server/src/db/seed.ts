import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { NewUserRow, users } from "./schema/users.js";

// TODO - refactor when auth is implemented
export function seedDefaultUser() {
  const existing = db
    .select()
    .from(users)
    .where(eq(users.isAdmin, true))
    .limit(1)
    .get();
  if (!existing) {
    console.log("No admin user found, seeding default admin user...");
    const admin: NewUserRow = {
      username: "admin",
      passwordHash: "hashed_password", // TODO - password hashing before working on proper authentication flow
      isAdmin: true,
    };
    db.insert(users).values(admin).run();
  }
}
