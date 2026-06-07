import { registerGenerator } from "./registry.js";
import { genreMixGenerator } from "./genre-mix.js";

// Self-registration by import side-effect (mirrors sources/index.ts). The
// in-house source imports this module so the registry is populated. SP2b adds
// the other three generators here.
registerGenerator(genreMixGenerator);
