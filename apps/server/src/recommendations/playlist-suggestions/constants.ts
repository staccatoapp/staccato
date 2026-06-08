// SP3 start-value constants — tune against logs (design §5/§6/§9).
export const MIN_SEEDS = 3; // cold-start gate: fewer playlist tracks → no suggestions
export const SEED_CAP = 30; // max seeds fanned out per recompute
export const PER_SEED_CAP = 50; // similar tracks pulled per seed
export const TARGET_TRACKS = 25; // final ranked suggestion count

export const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const EMPTY_RETRY_MS = 60 * 60 * 1000; // cold-start / thin playlists retry sooner
export const DEBOUNCE_MS = 60 * 1000; // trailing debounce after a playlist edit
export const MAX_ERROR_BACKOFF_MS = 15 * 60 * 1000;
