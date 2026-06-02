import { describe, expect, it } from "vitest";
import { UserSettingsSchema } from "./settings.js";

describe("UserSettingsSchema", () => {
  it("accepts listenbrainzTokenSet as a boolean", () => {
    const result = UserSettingsSchema.safeParse({
      listenbrainzTokenSet: true,
      volume: 80,
    });
    expect(result.success).toBe(true);
  });

  it("rejects the old listenbrainzToken string shape", () => {
    const result = UserSettingsSchema.safeParse({
      listenbrainzToken: "some-token",
      volume: 80,
    });
    expect(result.success).toBe(false);
  });
});
