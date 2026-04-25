// TODO - abstract clients so that different scrobbling services are plug and play/not called directly

const LB_API_BASE = "https://api.listenbrainz.org/1";

export async function validateToken(
  token: string,
): Promise<{ valid: boolean; userName?: string }> {
  try {
    console.log("Validating ListenBrainz token");
    const res = await fetch(`${LB_API_BASE}/validate-token`, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!res.ok) return { valid: false };
    const data = (await res.json()) as { valid: boolean; user_name?: string };
    return { valid: data.valid, userName: data.user_name };
  } catch {
    return { valid: false };
  }
}

// TODO - create type for input data
// TODO - add more fields as needed, currently just the basics to get scrobbling working
export async function submitListen(data: {
  token: string;
  listenType: string;
  artistName: string;
  trackName: string;
  listenedAt: number;
  trackMbid: string | null;
}) {
  const dataToSubmit = {
    listen_type: data.listenType,
    payload: [
      {
        listened_at: data.listenedAt,
        track_metadata: {
          artist_name: data.artistName,
          track_name: data.trackName,
          additional_info: {
            recording_mbid: data.trackMbid,
          },
        },
      },
    ],
  };

  try {
    console.log("Submitting listen to ListenBrainz");
    console.log(JSON.stringify(dataToSubmit));
    const res = await fetch(`${LB_API_BASE}/submit-listens`, {
      method: "POST",
      headers: {
        Authorization: `Token ${data.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dataToSubmit),
    });
    if (!res.ok) {
      console.log(await res.text());
      throw new Error(`Failed to submit listen: ${res.status}`);
    }
  } catch (error) {
    console.error("Error submitting listen to ListenBrainz:", error);
    throw error;
  }
}
