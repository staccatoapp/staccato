import { registerExtractor } from "./registry.js";
import { listeningHistoryExtractor } from "./listening-history.js";

registerExtractor(listeningHistoryExtractor);
