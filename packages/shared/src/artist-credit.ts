// Classify MusicBrainz artist-credit join phrases to decide album ownership.
// MB stores joinPhrase *after* each credit (" & ", " feat. ", ", "). A feature
// connector (feat./ft./featuring) marks the artist it introduces — and everyone
// after them — as guests; every other connector (&, and, with, x, vs., comma,
// +) keeps the credited artists as co-owners of the album.

const FEATURE_JOIN_RE = /\b(?:feat|ft|featuring)\b/i;

export function isFeatureJoinPhrase(
  phrase: string | null | undefined,
): boolean {
  if (!phrase) return false;
  return FEATURE_JOIN_RE.test(phrase);
}

// Given the ordered joinPhrases of an album's credits (joinPhrases[i] is the
// connector that follows credit i), return a parallel array flagging which
// credits are primary owners. Position 0 is always primary; once a feature
// connector appears, the credit it introduces and all subsequent credits are
// guests. e.g. ["MF Doom & MF Grimm"] -> [true, true]; ["A feat. B"] ->
// [true, false]; ["A & B feat. C"] -> [true, true, false].
export function computePrimaryFlags(joinPhrases: (string | null)[]): boolean[] {
  const flags: boolean[] = [];
  let guest = false;
  for (let i = 0; i < joinPhrases.length; i++) {
    if (i > 0 && isFeatureJoinPhrase(joinPhrases[i - 1])) guest = true;
    flags.push(!guest);
  }
  return flags;
}
