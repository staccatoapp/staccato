import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedUser } from "../db/__fixtures__/db.js";
import type { UserSettingsRow } from "../db/queries/settings.js";
import type { RecommendationSource } from "./source.js";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../db/client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../logger.js", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

// Isolate reconcileUserRows from the real source registry (and its heavy
// transitive imports) by controlling the source list directly.
let registeredSources: RecommendationSource<string, unknown[], unknown>[] = [];
vi.mock("./source.js", () => ({
  listRegisteredSources: () => registeredSources,
}));
vi.mock("./sources/index.js", () => ({}));

import { reconcileUserRows } from "./eligibility.js";
import {
  findRowsForUserKind,
  writeReady,
} from "../db/queries/recommendation-cache.js";
import {
  getOrCreateUserSettings,
  updateUserSettings,
} from "../db/queries/settings.js";

function makeSource(
  id: string,
  kind: string,
  isEligible: (s: UserSettingsRow) => boolean,
): RecommendationSource<string, unknown[], unknown> {
  return {
    id,
    kind,
    refreshIntervalMs: 1000,
    isEligible,
    buildContext: () => ({}),
    fetch: async () => [],
  };
}

// Eligible only when a listenbrainz token is present.
const lbSource = makeSource("listenbrainz", "cf-tracks", (s) =>
  Boolean(s.listenbrainzToken),
);
// Always eligible — stands in for an independent provider.
const alwaysSource = makeSource("other", "other-kind", () => true);

function settingsFor(userId: string, token: string | null) {
  getOrCreateUserSettings(userId);
  updateUserSettings(userId, { listenbrainzToken: token });
  return getOrCreateUserSettings(userId);
}

function expectOneRow(userId: string, kind: string) {
  const rows = findRowsForUserKind(userId, kind);
  expect(rows).toHaveLength(1);
  const [row] = rows;
  if (!row) throw new Error("expected exactly one row");
  return row;
}

beforeEach(() => {
  testDb = createTestDb();
  registeredSources = [];
});

describe("reconcileUserRows", () => {
  it("seeds a warming row for each eligible source", () => {
    registeredSources = [lbSource];
    const userId = seedUser();
    const settings = settingsFor(userId, "token-123");

    reconcileUserRows(settings);

    expect(expectOneRow(userId, "cf-tracks").status).toBe("warming");
  });

  it("does not seed rows for ineligible sources", () => {
    registeredSources = [lbSource];
    const userId = seedUser();
    const settings = settingsFor(userId, null);

    reconcileUserRows(settings);

    expect(findRowsForUserKind(userId, "cf-tracks")).toHaveLength(0);
  });

  it("removes only the ineligible source's rows, leaving others intact", () => {
    registeredSources = [lbSource, alwaysSource];
    const userId = seedUser();

    // Eligible for both → both rows seeded.
    reconcileUserRows(settingsFor(userId, "token-123"));
    expect(findRowsForUserKind(userId, "cf-tracks")).toHaveLength(1);
    expect(findRowsForUserKind(userId, "other-kind")).toHaveLength(1);

    // Lose the LB token → only the LB source's row is removed.
    reconcileUserRows(settingsFor(userId, null));
    expect(findRowsForUserKind(userId, "cf-tracks")).toHaveLength(0);
    expect(findRowsForUserKind(userId, "other-kind")).toHaveLength(1);
  });

  it("forceRefresh resets a ready row back to warming", () => {
    registeredSources = [lbSource];
    const userId = seedUser();
    const settings = settingsFor(userId, "token-123");

    reconcileUserRows(settings);
    const rowId = expectOneRow(userId, "cf-tracks").id;
    writeReady(rowId, JSON.stringify([{ ok: true }]), Date.now(), Date.now());
    expect(expectOneRow(userId, "cf-tracks").status).toBe("ready");

    reconcileUserRows(settings, { forceRefresh: true });
    const row = expectOneRow(userId, "cf-tracks");
    expect(row.status).toBe("warming");
    expect(row.payload).toBeNull();
  });

  it("without forceRefresh leaves an existing ready row untouched", () => {
    registeredSources = [lbSource];
    const userId = seedUser();
    const settings = settingsFor(userId, "token-123");

    reconcileUserRows(settings);
    const rowId = expectOneRow(userId, "cf-tracks").id;
    writeReady(rowId, JSON.stringify([{ ok: true }]), Date.now(), Date.now());

    reconcileUserRows(settings);
    expect(expectOneRow(userId, "cf-tracks").status).toBe("ready");
  });
});
