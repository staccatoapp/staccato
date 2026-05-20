import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../../logger.js";

const execFileAsync = promisify(execFile);
const log = logger.child({ module: "library:fingerprint" });

export interface FingerprintResult {
  duration: number;
  fingerprint: string;
}

export async function fingerprintFile(
  filePath: string,
): Promise<FingerprintResult | null> {
  try {
    const binary = process.env.FPCALC_PATH ?? "fpcalc";
    const { stdout } = await execFileAsync(binary, ["-json", filePath]);
    const parsed = JSON.parse(stdout) as FingerprintResult;
    if (!parsed.fingerprint || typeof parsed.duration !== "number") return null;
    return parsed;
  } catch (err) {
    log.debug({ err, filePath }, "fpcalc failed");
    return null;
  }
}

let fpcalcCached: boolean | null = null;

export async function isFpcalcAvailable(): Promise<boolean> {
  if (fpcalcCached !== null) return fpcalcCached;
  try {
    const binary = process.env.FPCALC_PATH ?? "fpcalc";
    await execFileAsync(binary, ["-version"]);
    fpcalcCached = true;
  } catch {
    fpcalcCached = false;
  }
  return fpcalcCached;
}
