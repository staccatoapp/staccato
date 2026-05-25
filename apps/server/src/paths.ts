import path from "node:path";
import { config } from "./config.js";

const root = path.resolve(config.STACCATO_DATA_DIR);

export const staccatoDataRoot = root;
export const dataDir = path.join(root, "data");
export const dbPath = path.join(dataDir, "staccato.db");
export const metadataDir = path.join(root, "metadata");
export const coversDir = path.join(metadataDir, "covers");
export const artistImagesDir = path.join(metadataDir, "artists");
