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

/** GET `path` and parse a JSON body, mapping failures to `ApiError`. */
export async function apiGet<T>(path: string, params?: QueryParams): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Could not reach the server.");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? `HTTP_${response.status}`,
      body?.error?.message ?? `Request failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as T;
}
