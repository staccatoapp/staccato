import pino, { type LoggerOptions } from "pino";
import { getLogEnvironment } from "./environment/environment.js";

const VALID_LEVELS = ["error", "warn", "info", "debug"] as const;
type LogLevel = (typeof VALID_LEVELS)[number];

const logEnvironment = getLogEnvironment();

function resolveLevel(): LogLevel {
  const raw = logEnvironment.STACCATO_LOG_LEVEL.toLowerCase();
  return (VALID_LEVELS as readonly string[]).includes(raw)
    ? (raw as LogLevel)
    : "info";
}

const level = resolveLevel();
const format = logEnvironment.STACCATO_LOG_FORMAT.toLowerCase();

const options: LoggerOptions = {
  level,
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "*.passwordHash",
      "*.listenbrainzToken",
      "*.lidarrApiKey",
      "*.sessionSecret",
    ],
    remove: true,
  },
};

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
