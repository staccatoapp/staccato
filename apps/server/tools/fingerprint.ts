import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inspect } from "node:util";

const execFileAsync = promisify(execFile);

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: tsx tools/fingerprint.ts <path-to-audio-file>");
  process.exit(1);
}

const binary = process.env.FPCALC_PATH ?? "fpcalc";

let stdout: string;
try {
  ({ stdout } = await execFileAsync(binary, ["-json", filePath]));
} catch (err: any) {
  console.error(`fpcalc failed: ${err?.message ?? err}`);
  process.exit(1);
}

interface FingerprintResult {
  duration: number;
  fingerprint: string;
}

const result = JSON.parse(stdout) as FingerprintResult;

if (!result.fingerprint || typeof result.duration !== "number") {
  console.error("fpcalc returned incomplete result:", result);
  process.exit(1);
}

console.log(inspect(result, { depth: null, colors: true }));
