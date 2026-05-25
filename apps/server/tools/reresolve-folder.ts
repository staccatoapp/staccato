import { db } from "../src/db/client.js";
import { tracks } from "../src/db/schema/tracks.js";
import { like } from "drizzle-orm";
import { resetTracksToPending } from "../src/db/queries/tracks.js";
import { resolveTrack } from "../src/library/worker.js";

const pattern = process.argv[2] ?? "%2Pac\\Greatest Hits%";

const rows = db
  .select({ id: tracks.id, filePath: tracks.filePath })
  .from(tracks)
  .where(like(tracks.filePath, pattern))
  .all();

console.log(`found ${rows.length} tracks for pattern ${pattern}`);
resetTracksToPending(rows.map((r) => r.id));
console.log("reset to pending; re-resolving sequentially...");

for (const r of rows) {
  await resolveTrack(r.filePath);
}
console.log("done");
process.exit(0);
