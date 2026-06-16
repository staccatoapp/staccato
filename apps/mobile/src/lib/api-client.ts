import type { z } from "zod";

const REQUEST_TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ApiClient {
  get<T>(path: string, schema: z.ZodType<T>): Promise<T>;
  post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T>;
  put<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T>;
  patch<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T>;
  delete(path: string): Promise<void>;
}

async function request(
  baseUrl: string,
  token: string | undefined,
  path: string,
  init: { method: string; body?: string },
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseResponse<T>(
  res: Response,
  schema: z.ZodType<T>,
  path: string,
): Promise<T> {
  if (!res.ok) {
    throw new ApiError(res.status, `request to ${path} failed (${res.status})`);
  }
  // 204 has no body; the schema decides whether "no content" is acceptable.
  const json: unknown = res.status === 204 ? null : await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.warn("api response failed validation", {
      path,
      issues: parsed.error.issues,
    });
    throw new ApiError(res.status, `unexpected response shape from ${path}`);
  }
  return parsed.data;
}

/**
 * Minimal typed fetch wrapper for talking to a Staccato server: absolute
 * base URL (mobile can't use relative paths), optional bearer token, 10s
 * timeout, and zod-validated responses.
 */
export function createApiClient(baseUrl: string, token?: string): ApiClient {
  return {
    async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
      const res = await request(baseUrl, token, path, { method: "GET" });
      return parseResponse(res, schema, path);
    },
    async post<T>(
      path: string,
      body: unknown,
      schema: z.ZodType<T>,
    ): Promise<T> {
      const res = await request(baseUrl, token, path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return parseResponse(res, schema, path);
    },
    async put<T>(
      path: string,
      body: unknown,
      schema: z.ZodType<T>,
    ): Promise<T> {
      const res = await request(baseUrl, token, path, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      return parseResponse(res, schema, path);
    },
    async patch<T>(
      path: string,
      body: unknown,
      schema: z.ZodType<T>,
    ): Promise<T> {
      const res = await request(baseUrl, token, path, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return parseResponse(res, schema, path);
    },
    async delete(path: string): Promise<void> {
      const res = await request(baseUrl, token, path, { method: "DELETE" });
      if (!res.ok) {
        throw new ApiError(
          res.status,
          `request to ${path} failed (${res.status})`,
        );
      }
    },
  };
}
