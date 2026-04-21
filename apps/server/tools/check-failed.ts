import { isNull, eq, and } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { tracks } from "../src/db/schema/tracks.js";
import { albums } from "../src/db/schema/albums.js";
import { artists } from "../src/db/schema/artists.js";

const MB_BASE = "https://musicbrainz.org/ws/2";
const MB_USER_AGENT =
  "Staccato/0.1.0 (https://github.com/staccatoapp/staccato)";
const SCORE_THRESHOLD = 85;

const args = process.argv.slice(2);
const sampleIdx = args.indexOf("--sample");
const sampleN = sampleIdx !== -1 ? Number(args[sampleIdx + 1]) : 10;
const artistIdx = args.indexOf("--artist");
const filterArtist = artistIdx !== -1 ? args[artistIdx + 1] : null;

async function mbFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": MB_USER_AGENT, Accept: "application/json" },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const unresolved = db
  .select({
    trackId: tracks.id,
    title: tracks.title,
    artistName: artists.name,
    albumTitle: albums.title,
    releaseYear: albums.releaseYear,
    filePath: tracks.filePath,
  })
  .from(tracks)
  .innerJoin(artists, eq(tracks.artistId, artists.id))
  .leftJoin(albums, eq(tracks.albumId, albums.id))
  .where(isNull(tracks.musicbrainzId))
  .all();

const total = db.select({ id: tracks.id }).from(tracks).all().length;
const resolved = total - unresolved.length;

console.log(`\n=== DB Stats ===`);
console.log(`  Total tracks:      ${total}`);
console.log(`  Resolved:          ${resolved}`);
console.log(`  Unresolved:        ${unresolved.length}`);
console.log(`  Resolution rate:   ${((resolved / total) * 100).toFixed(1)}%\n`);

const byArtist = new Map<string, number>();
for (const t of unresolved) {
  byArtist.set(t.artistName, (byArtist.get(t.artistName) ?? 0) + 1);
}
const sortedArtists = [...byArtist.entries()].sort((a, b) => b[1] - a[1]);
console.log(`=== Unresolved by Artist (top 15) ===`);
for (const [artist, count] of sortedArtists.slice(0, 15)) {
  console.log(`  ${count.toString().padStart(4)}  ${artist}`);
}

let sample = filterArtist
  ? unresolved.filter((t) =>
      t.artistName.toLowerCase().includes(filterArtist.toLowerCase()),
    )
  : unresolved;

if (sampleN === 0 || sample.length === 0) process.exit(0);

sample = sample.slice(0, sampleN);
console.log(`\n=== Sampling ${sample.length} tracks against MB API ===\n`);

let passCount = 0;
let failNoResults = 0;
let failLowScore = 0;
let failNetwork = 0;

for (const track of sample) {
  const query = new URLSearchParams({
    query: `artist:"${track.artistName}" AND recording:"${track.title}"`,
    fmt: "json",
    limit: "5",
  });
  const url = `${MB_BASE}/recording?${query}&inc=releases+release-groups`;

  let status = "";
  let topScore = 0;
  let topTitle = "";

  try {
    const res = await mbFetch(url);
    if (!res.ok) {
      status = `HTTP ${res.status}`;
      failNetwork++;
    } else {
      const data: any = await res.json();
      const recordings: any[] = data.recordings ?? [];
      if (recordings.length === 0) {
        status = "NO RESULTS";
        failNoResults++;
      } else {
        topScore = recordings[0].score;
        topTitle = recordings[0].title;
        const passing = recordings.find((r: any) => r.score >= SCORE_THRESHOLD);
        if (passing) {
          status = `PASS score=${passing.score}`;
          passCount++;
        } else {
          status = `LOW SCORE top=${topScore}`;
          failLowScore++;
        }
      }
    }
  } catch (err: any) {
    status = `ERROR: ${err.message}`;
    failNetwork++;
  }

  console.log(`  [${status}]`);
  console.log(`    artist: "${track.artistName}"  title: "${track.title}"`);
  if (topScore > 0 && topScore < SCORE_THRESHOLD) {
    console.log(`    top MB result: "${topTitle}" score=${topScore}`);
  }
  console.log();

  await sleep(1100); // respect rate limit
}

console.log(`=== Sample Results ===`);
console.log(`  Pass:          ${passCount}`);
console.log(`  No results:    ${failNoResults}`);
console.log(`  Score too low: ${failLowScore}`);
console.log(`  Network error: ${failNetwork}`);
