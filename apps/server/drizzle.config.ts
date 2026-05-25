/// <reference types="node" />
import { defineConfig } from "drizzle-kit";
import { dbPath } from "./src/paths.js";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
