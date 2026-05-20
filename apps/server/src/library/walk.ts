import fs from "node:fs/promises";
import path from "node:path";

export const AUDIO_EXTENSIONS = new Set([
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

export async function* walkAudioFiles(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkAudioFiles(fullPath);
    } else if (entry.isFile() && isAudioFile(entry.name)) {
      yield fullPath;
    }
  }
}
