import { lookupRecordingRich } from "../src/library/mbLookup.js";
import { pickRelease } from "../src/library/graphWalk.js";
import type { RawTags, ScoredCandidate } from "../src/library/types.js";

const mbid = process.argv[2] ?? "da3bb7bc-f9cc-4f29-8cd5-67ac3cff7503";
const albumTitle = process.argv[3] ?? "Greatest Hits";
const year = process.argv[4] ? Number(process.argv[4]) : 1998;

const rec = await lookupRecordingRich(mbid, "search", null);
if (!rec) {
  console.error("recording lookup failed");
  process.exit(1);
}

const winner: ScoredCandidate = { ...rec, score: 0.9 };
const tags = {
  albumTitle,
  year,
  fileFormat: "mp3",
  durationSeconds: 263,
} as RawTags;

const release = pickRelease(winner, tags);
console.log("recording:", rec.title);
console.log("tags:", { albumTitle, year });
console.log("picked release:", JSON.stringify(release, null, 2));
