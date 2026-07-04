/**
 * Minimal browser API client for the app's `/api` surface. The Zustand stores
 * depend on the typed `api/*` modules built on this, never on transport details.
 * Same-origin in production; Vite proxies `/api` to the Hono server in dev.
 */

const API_BASE = "/api";

/** A failed API call: a non-2xx response or an unreachable server. */
export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;
  /** Server error code (e.g. `NOT_FOUND`, `VALIDATION`), or a synthetic one. */
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
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

type ApiErrorBody = { error?: { code?: string; message?: string } };

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? `HTTP_${response.status}`,
      body?.error?.message ?? `Request failed with status ${response.status}.`,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
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

/** GET `path` and parse a JSON body, mapping failures to `ApiError`. */
export async function apiGet<T>(path: string, params?: QueryParams): Promise<T> {
  const response = await request(buildUrl(path, params), {
    headers: { Accept: "application/json" },
  });
  return parseResponse<T>(response);
}

/** Send a JSON mutation and parse its JSON response (or `undefined` for 204). */
export async function apiJson<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
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
  return parseResponse<T>(response);
}
