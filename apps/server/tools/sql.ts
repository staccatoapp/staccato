import "../src/env.js";
import Database from "better-sqlite3";
import { inspect } from "node:util";
import { dbPath } from "../src/paths.js";

const sql = process.argv.slice(2).join(" ").trim();
if (!sql) {
  console.error(
    `Usage: tsx tools/sql.ts "SELECT * FROM artists WHERE id = '<id>'"`,
  );
  process.exit(1);
}

// Read-only connection: the driver rejects any write, so this is safe to run
// against a live library while diagnosing.
const db = new Database(dbPath, { readonly: true });
try {
  const stmt = db.prepare(sql);
  // `.all()` only works on statements that return rows; guard so non-SELECT
  // statements give a clear message instead of throwing.
  const rows = stmt.reader ? stmt.all() : (stmt.run(), []);
  console.log(
    inspect(rows, { depth: null, colors: true, maxArrayLength: null }),
  );
} catch (err) {
  console.error(`query failed: ${(err as Error).message}`);
  process.exit(1);
} finally {
  db.close();
}
