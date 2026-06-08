import { registerGenerator } from "./registry.js";
import { genreMixGenerator } from "./genre-mix.js";
import { moreFromArtistsGenerator } from "./more-from-artists.js";
import { somethingNewGenerator } from "./something-new.js";
import { decadeMixGenerator } from "./decade-mix.js";

// Self-registration by import side-effect (mirrors sources/index.ts). The
// in-house source imports this module so the registry is populated.
registerGenerator(genreMixGenerator);
registerGenerator(moreFromArtistsGenerator);
registerGenerator(somethingNewGenerator);
registerGenerator(decadeMixGenerator);
