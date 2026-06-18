import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { createMiddleware } from "hono/factory";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/** App-owned API namespace; never served the SPA shell. */
export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Resolve a URL pathname to an absolute file path strictly inside `root`, or
 * null if it is empty, the root itself, malformed, or escapes the root through
 * traversal. `root` must already be absolute.
 */
export function resolveStaticFile(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded === "" || decoded === "/" || decoded.includes("\0")) {
    return null;
  }
  // Treat the pathname as relative to the root, then confirm containment so a
  // `../` sequence cannot escape into the surrounding filesystem.
  const relative = decoded.startsWith("/") ? `.${decoded}` : `./${decoded}`;
  const resolved = resolve(root, relative);
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    return null;
  }
  return resolved;
}

function cacheControlFor(pathname: string): string {
  // Vite emits content-hashed filenames under /assets, so they are immutable.
  // Everything else (the shell, favicon) must always be revalidated.
  return pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
}

async function tryReadFile(filePath: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath);
  } catch {
    // Missing file or a directory: not servable as a static asset.
    return null;
  }
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return copy.buffer;
}

/**
 * Serve built SPA assets from `root` and fall back to `index.html` for any
 * unmatched non-API GET so client-side deep links (a Problem or Session URL)
 * load directly and on refresh. API paths and non-GET requests fall through to
 * the API router and the JSON 404 handler.
 */
export function createStaticSpa(rawRoot: string) {
  const root = resolve(rawRoot);
  let indexHtmlCache: string | null = null;

  async function readIndexHtml(): Promise<string | null> {
    if (indexHtmlCache !== null) {
      return indexHtmlCache;
    }
    const html = await tryReadFile(resolve(root, "index.html"));
    if (html === null) {
      return null;
    }
    indexHtmlCache = html.toString("utf8");
    return indexHtmlCache;
  }

  return createMiddleware(async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      return next();
    }
    const pathname = new URL(c.req.url).pathname;
    if (isApiPath(pathname)) {
      return next();
    }

    const filePath = resolveStaticFile(root, pathname);
    if (filePath !== null) {
      const file = await tryReadFile(filePath);
      if (file !== null) {
        c.header("Content-Type", contentTypeFor(filePath));
        c.header("Cache-Control", cacheControlFor(pathname));
        return c.body(toArrayBuffer(file));
      }
    }

    const indexHtml = await readIndexHtml();
    if (indexHtml === null) {
      // No built client present; let the request fall through to the 404 handler.
      return next();
    }
    c.header("Cache-Control", "no-cache");
    return c.html(indexHtml);
  });
}
