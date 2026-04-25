import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
    return JSON.parse(stdout) as FingerprintResult;
  } catch {
    return null;
  }
}

export async function isFpcalcAvailable(): Promise<boolean> {
  try {
    const binary = process.env.FPCALC_PATH ?? "fpcalc";
    await execFileAsync(binary, ["-version"]);
    return true;
  } catch {
    return false;
  }
}
