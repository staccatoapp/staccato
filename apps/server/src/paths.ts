import path from "node:path";
import { getEnvironment } from "./environment/environment.js";

const root = path.resolve(getEnvironment().STACCATO_DATA_DIR);

export const staccatoDataRoot = root;
export const dataDir = path.join(root, "data");
export const dbPath = path.join(dataDir, "staccato.db");
export const metadataDir = path.join(root, "metadata");
export const coversDir = path.join(metadataDir, "covers");
export const artistImagesDir = path.join(metadataDir, "artists");
