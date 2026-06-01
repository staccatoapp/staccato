import { submitListen } from "../../listenbrainz/client.js";
import type { ScrobbleTarget } from "../target.js";

interface ListenbrainzContext {
  token: string;
}

export const listenbrainzTarget: ScrobbleTarget<ListenbrainzContext> = {
  id: "listenbrainz",
  isEligible: (s) => Boolean(s.listenbrainzToken),
  buildContext: (s) => ({ token: s.listenbrainzToken! }),
  async submit(ctx, listen) {
    await submitListen({
      token: ctx.token,
      listenType: "single",
      artistName: listen.artistName,
      trackName: listen.trackName,
      listenedAt: listen.listenedAt,
      trackMbid: listen.recordingMbid,
    });
  },
};
