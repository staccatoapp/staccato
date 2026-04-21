import * as mm from "music-metadata";
import { inspect } from "node:util";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node tools/inspect-tags.js <path-to-audio-file>");
  process.exit(1);
}

const metadata = await mm.parseFile(filePath);
console.log(inspect(metadata, { depth: null, colors: true }));
