import * as mm from "music-metadata";
import { readdir } from "fs/promises";
import { join, extname, relative } from "path";

const dir = process.argv[2];
const tagToLookup = process.argv[3];

const AUDIO_EXTENSIONS = new Set([
  ".flac",
  ".mp3",
  ".m4a",
  ".ogg",
  ".opus",
  ".wav",
  ".aiff",
  ".wv",
  ".ape",
]);

let count = 0;
const matchedPaths = [];

async function walk(currentDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = extname(entry.name).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) continue;

    try {
      const metadata = await mm.parseFile(fullPath);
      const { common, format } = metadata;

      let matched = false;

      if (common && Object.prototype.hasOwnProperty.call(common, tagToLookup)) {
        matched = true;
      } else if (
        format &&
        Object.prototype.hasOwnProperty.call(format, tagToLookup)
      ) {
        matched = true;
      }

      if (matched) {
        count++;
        matchedPaths.push(relative(dir, fullPath));
      }
    } catch (err) {}
  }
}

await walk(dir);

console.log({
  count,
  files: matchedPaths,
});
