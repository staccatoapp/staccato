const MB_BASE = "https://musicbrainz.org/ws/2";
const MB_USER_AGENT =
  "Staccato/0.1.0 (https://github.com/staccatoapp/staccato)";
const SCORE_THRESHOLD = 85;

const [artistName, trackTitle, albumTitle, yearArg] = process.argv.slice(2);

if (!artistName || !trackTitle) {
  console.error(
    'Usage: tsx tools/debug-resolution.ts "Artist" "Title" ["Album"] [Year]',
  );
  process.exit(1);
}

const releaseYear = yearArg ? Number(yearArg) : undefined;

async function mbFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": MB_USER_AGENT, Accept: "application/json" },
  });
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

console.log("\n=== PASS 1: Recording search ===");
console.log(`  artist:   "${artistName}"`);
console.log(`  title:    "${trackTitle}"`);
if (albumTitle)
  console.log(
    `  hint:     album="${albumTitle}" year=${releaseYear ?? "none"}`,
  );

const recordingQuery = new URLSearchParams({
  query: `artist:"${artistName}" AND recording:"${trackTitle}"`,
  fmt: "json",
  limit: "5",
});
const recordingUrl = `${MB_BASE}/recording?${recordingQuery}&inc=releases+release-groups`;
console.log(`\nGET ${recordingUrl}\n`);

const recordingRes = await mbFetch(recordingUrl);
if (!recordingRes.ok) {
  console.error(`HTTP ${recordingRes.status} ${recordingRes.statusText}`);
  process.exit(1);
}

const recordingData: any = await recordingRes.json();
const recordings: any[] = recordingData.recordings ?? [];

if (recordings.length === 0) {
  console.log("No recordings returned.");
} else {
  console.log(`Returned ${recordings.length} recording(s):\n`);
  for (const rec of recordings) {
    const pass = rec.score >= SCORE_THRESHOLD ? "✅ PASS" : "❌ FAIL";
    console.log(`  [${pass} score=${rec.score}] ${rec.id}`);
    console.log(`    title:   "${rec.title}"`);
    const releaseCount = rec.releases?.length ?? 0;
    console.log(`    releases: ${releaseCount}`);

    if (releaseCount > 0) {
      const official = (rec.releases as any[]).filter(
        (r: any) => r.status === "Official",
      );
      console.log(`    official: ${official.length}`);

      if (albumTitle) {
        const normHint = normalise(albumTitle);
        const hintMatches = official.filter((r: any) => {
          if (normalise(r.title) !== normHint) return false;
          if (releaseYear && r.date)
            return r.date.startsWith(String(releaseYear));
          return true;
        });
        console.log(
          `    hint-matches: ${hintMatches.length} (normalised hint="${normHint}")`,
        );
        for (const m of hintMatches) {
          console.log(
            `      → "${m.title}" date=${m.date ?? "none"} status=${m.status} type=${m["release-group"]?.["primary-type"] ?? "?"} id=${m.id}`,
          );
        }
      }

      for (const r of (rec.releases as any[]).slice(0, 3)) {
        console.log(
          `      release: "${r.title}" status=${r.status ?? "?"} date=${r.date ?? "none"} type=${r["release-group"]?.["primary-type"] ?? "?"} id=${r.id}`,
        );
      }
    }
    console.log();
  }
}

// Check if any recording passes threshold
const passing = recordings.find((r: any) => r.score >= SCORE_THRESHOLD);
if (!passing) {
  console.log(
    `No recording meets score threshold (${SCORE_THRESHOLD}). Falling back to Pass 2 (release search).\n`,
  );

  console.log("=== PASS 2: Release search ===");
  if (!albumTitle) {
    console.log("  No album title provided — Pass 2 would be skipped.");
  } else {
    const releaseQuery = new URLSearchParams({
      query: `artist:"${artistName}" AND release:"${albumTitle}"`,
      fmt: "json",
      limit: "5",
    });
    const releaseUrl = `${MB_BASE}/release?${releaseQuery}`;
    console.log(`GET ${releaseUrl}\n`);

    const releaseRes = await mbFetch(releaseUrl);
    const releaseData: any = await releaseRes.json();
    const releases: any[] = releaseData.releases ?? [];

    if (releases.length === 0) {
      console.log("No releases returned.");
    } else {
      console.log(`Returned ${releases.length} release(s):\n`);
      for (const rel of releases) {
        const pass = rel.score >= SCORE_THRESHOLD ? "✅ PASS" : "❌ FAIL";
        console.log(
          `  [${pass} score=${rel.score}] "${rel.title}" by ${rel["artist-credit"]?.[0]?.name ?? "?"} id=${rel.id}`,
        );
      }
    }
  }
}
