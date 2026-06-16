import {
  UserSettingsSchema,
  ValidateListenBrainzTokenResponseSchema,
  type UserSettings,
  type ValidateListenBrainzTokenResponse,
} from "@staccato/shared";
import { z } from "zod";

import { useAuthedMutation } from "./use-authed-mutation";
import { useAuthedQuery } from "./use-authed-query";

/** Per-user settings (ListenBrainz token presence + volume). */
export function useUserSettings() {
  return useAuthedQuery<UserSettings>(
    ["user-settings"],
    "/api/settings",
    UserSettingsSchema,
    { staleTime: 60 * 1000 },
  );
}

/** Validates a ListenBrainz token without persisting it. */
export function useValidateListenBrainzToken() {
  return useAuthedMutation<ValidateListenBrainzTokenResponse, string>(
    ["lb-validate"],
    (client, token) =>
      client.post(
        "/api/settings/validate-listenbrainz-token",
        { token },
        ValidateListenBrainzTokenResponseSchema,
      ),
  );
}

/** Saves (string) or clears (null) the ListenBrainz token; invalidates settings. */
export function useSaveListenBrainzToken() {
  return useAuthedMutation<null, string | null>(
    ["user-settings"],
    (client, token) =>
      client.patch("/api/settings", { listenbrainzToken: token }, z.null()),
  );
}
