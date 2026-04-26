import * as fs from "node:fs";
import * as path from "node:path";

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

export function isAudioFile(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function* walkAudioFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkAudioFiles(fullPath);
    } else if (
      entry.isFile() &&
      AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      yield fullPath;
    }
  }
}
