export type Paginated<T> = { items: T[]; total: number };

export interface PaginationOptions {
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function parsePagination(query: {
  limit?: unknown;
  offset?: unknown;
}): PaginationOptions {
  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const offset = Number(query.offset) || 0;
  return { limit, offset };
}
