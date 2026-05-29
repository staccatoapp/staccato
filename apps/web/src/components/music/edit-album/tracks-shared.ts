// Shared constants/helpers for the Tracks tab and its rows. Discs are modelled
// as dnd-kit droppable groups keyed by a `disc:<n>` string.
export const GROUP_PREFIX = "disc:";
export const groupKey = (disc: number) => `${GROUP_PREFIX}${disc}`;
export const discFromKey = (key: string) =>
  Number(key.slice(GROUP_PREFIX.length));

// Column template shared by the tracks header row and each track row.
export const TRACK_GRID = "grid-cols-[24px_36px_1fr_52px_52px]";
