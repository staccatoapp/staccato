import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import * as schema from "./schema/index.js";
import { dataDir, dbPath } from "../paths.js";

fs.mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("temp_store = MEMORY");

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
