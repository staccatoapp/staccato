import "../src/env.js";
import { inspect } from "node:util";
import { fingerprintFile } from "../src/library/evidence/fingerprint.js";
import { candidatesFromAcoustid } from "../src/library/candidates/fromAcoustid.js";
import { acoustidApiKey } from "../src/library/evidence/acoustid.js";
import type { Evidence, RawTags } from "../src/library/types.js";

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx tools/fingerprint.ts <path-to-audio-file>");
    process.exitCode = 1;
    return;
  }

  const fp = await fingerprintFile(filePath);
  if (!fp) {
    console.error(
      `fpcalc failed or returned an incomplete result for: ${filePath}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("Chromaprint fingerprint:");
  console.log(
    inspect(
      { duration: fp.duration, fingerprint: fp.fingerprint },
      { depth: null, colors: true },
    ),
  );

  if (!acoustidApiKey()) {
    console.warn(
      "\nSTACCATO_SERVER_ACOUSTID_API_KEY is not set — skipping the AcoustID lookup. " +
        "Set it in apps/server/.env(.development.local) to see candidate recordings.",
    );
    return;
  }

  // Reuse the exact resolver path so candidates match what the pipeline saw.
  // candidatesFromAcoustid only reads fingerprint + fingerprintDuration; tags are
  // irrelevant to the AcoustID lookup, so a minimal stub is fine here.
  const evidence: Evidence = {
    filePath,
    tags: {} as RawTags,
    fingerprint: fp.fingerprint,
    fingerprintDuration: fp.duration,
  };

  const candidates = await candidatesFromAcoustid(evidence);
  console.log(
    `\nAcoustID candidates (meta=recordings) — ${candidates.length} recording(s), highest score first.`,
  );
  console.log(
    "Each candidate shows the recording MBID, title, duration, acoustidScore and the inline artistCredits",
  );
  console.log(
    "(a wrong artistCredits[0] here is a common cause of wrong-artist imports):",
  );
  console.log(inspect(candidates, { depth: null, colors: true }));
}

// Deliberately no process.exit() on the success path. The AcoustID call leaves
// undici keep-alive sockets (and their DNS/TLS threadpool work) open briefly;
// forcing an exit while libuv is still closing those handles trips an
// intermittent assertion on Windows (UV_HANDLE_CLOSING, async.c). Letting the
// event loop drain on its own avoids the race and the process still exits
// promptly once the idle socket times out.
await main();
