import pino, { type LoggerOptions } from "pino";

const VALID_LEVELS = ["error", "warn", "info", "debug"] as const;
type LogLevel = (typeof VALID_LEVELS)[number];

function resolveLevel(): LogLevel {
  const raw = (process.env.STACCATO_LOG_LEVEL ?? "info").toLowerCase();
  return (VALID_LEVELS as readonly string[]).includes(raw)
    ? (raw as LogLevel)
    : "info";
}

const level = resolveLevel();
const format = (process.env.STACCATO_LOG_FORMAT ?? "pretty").toLowerCase();

// No DB-secret redaction here — the metadata service holds no per-user secrets.
const options: LoggerOptions = { level };

if (format !== "json") {
  options.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:HH:MM:ss.l",
      ignore: "pid,hostname",
    },
  };
}

export const logger = pino(options);
