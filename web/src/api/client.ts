/**
 * Minimal browser API client for the app's `/api` surface. The Zustand stores
 * depend on the typed `api/*` modules built on this, never on transport details.
 * Same-origin in production; Vite proxies `/api` to the Hono server in dev.
 */

import { DecodeError } from "@shared/api/decode";
import type { Decoder } from "@shared/api/decode";
import type { ApiErrorResponse } from "@shared/api/errors";

const API_BASE = "/api";

/**
 * A failed API call: a non-2xx response, an unreachable server, or a 2xx body
 * that does not match its endpoint contract (`INVALID_RESPONSE`).
 */
export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;
  /** Server error code (e.g. `NOT_FOUND`, `VALIDATION`), or a synthetic one. */
  readonly code: string;

  constructor(status: number, code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type QueryParams = Record<string, string | number | undefined>;

function buildUrl(path: string, params?: QueryParams): string {
  const query = new URLSearchParams();
  if (params !== undefined) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        query.set(key, String(value));
      }
    }
  }
  const queryString = query.toString();
  return queryString === "" ? `${API_BASE}${path}` : `${API_BASE}${path}?${queryString}`;
}

/** A failure body is untrusted: any part of the shared envelope may be missing. */
type ApiErrorBody = { error?: Partial<ApiErrorResponse["error"]> };

function invalidResponse(status: number, cause: unknown): ApiError {
  return new ApiError(status, "INVALID_RESPONSE", "The server sent an unexpected response.", {
    cause,
  });
}

async function parseResponse<T>(response: Response, decode: Decoder<T>): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? `HTTP_${response.status}`,
      body?.error?.message ?? `Request failed with status ${response.status}.`,
    );
  }
  let body: unknown;
  if (response.status !== 204) {
    try {
      body = await response.json();
    } catch (cause) {
      throw invalidResponse(response.status, cause);
    }
  }
  try {
    return decode(body);
  } catch (cause) {
    if (cause instanceof DecodeError) throw invalidResponse(response.status, cause);
    throw cause;
  }
}

async function request(path: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...init,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Could not reach the server.");
  }
  return response;
}

/** GET `path` and decode its JSON body, mapping failures to `ApiError`. */
export async function apiGet<T>(
  path: string,
  decode: Decoder<T>,
  params?: QueryParams,
): Promise<T> {
  const response = await request(buildUrl(path, params), {
    headers: { Accept: "application/json" },
  });
  return parseResponse(response, decode);
}

/** Send a JSON mutation and decode its response (use `noContent` for 204). */
export async function apiJson<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  decode: Decoder<T>,
  body?: unknown,
): Promise<T> {
  const response = await request(buildUrl(path), {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return parseResponse(response, decode);
}
