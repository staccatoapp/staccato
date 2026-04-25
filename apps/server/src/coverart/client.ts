import throttle from "p-throttle";

const CAA_BASE = "https://coverartarchive.org";

const throttledCaaFetch = throttle({ limit: 5, interval: 1000 })(
  (url: string) => fetch(url, { redirect: "manual" }),
);

export async function fetchCoverArtUrl(
  musicbrainzId: string,
): Promise<string | null> {
  return caaFetch(`${CAA_BASE}/release/${musicbrainzId}/front`);
}

// fallback for release groups - CAA sometimes has cover art here even when individual releases dont
export async function fetchCoverArtUrlForGroup(
  releaseGroupMbid: string,
): Promise<string | null> {
  return caaFetch(`${CAA_BASE}/release-group/${releaseGroupMbid}/front`);
}

async function caaFetch(url: string): Promise<string | null> {
  try {
    const res = await throttledCaaFetch(url);
    if (res.status === 307 || res.status === 302) {
      return res.headers.get("location") ?? "";
    }
    return "";
  } catch {
    return null;
  }
}
