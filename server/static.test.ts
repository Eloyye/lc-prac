import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { createStaticSpa, isApiPath, resolveStaticFile } from "./static";

const INDEX_HTML = '<!doctype html><title>CodeType</title><div id="root"></div>';
const APP_JS = "console.log('codetype');";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "codetype-static-"));
  await writeFile(join(root, "index.html"), INDEX_HTML);
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "assets", "app-abc123.js"), APP_JS);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function makeApp() {
  const app = new Hono();
  app.on(["GET", "HEAD"], "*", createStaticSpa(root));
  app.notFound((c) => c.json({ error: { code: "NOT_FOUND" } }, 404));
  return app;
}

describe("createStaticSpa", () => {
  it("serves a hashed asset with its content type and an immutable cache", async () => {
    const res = await makeApp().request("/assets/app-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(await res.text()).toBe(APP_JS);
  });

  it("returns the SPA shell at the root path", async () => {
    const res = await makeApp().request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toBe(INDEX_HTML);
  });

  it("returns the SPA shell for a Problem deep link", async () => {
    const res = await makeApp().request("/problems/two-sum");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX_HTML);
  });

  it("returns the SPA shell for a Session deep link", async () => {
    const res = await makeApp().request("/problems/two-sum/hash-map");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX_HTML);
  });

  it("does not serve the SPA shell for unknown API paths", async () => {
    const res = await makeApp().request("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("never leaks files outside the root via encoded traversal", async () => {
    const res = await makeApp().request("/%2e%2e/%2e%2e/%2e%2e/etc/passwd");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX_HTML);
  });
});

describe("resolveStaticFile", () => {
  it("resolves a normal path under the root", () => {
    expect(resolveStaticFile("/srv/dist", "/assets/app.js")).toBe("/srv/dist/assets/app.js");
  });

  it("rejects path traversal", () => {
    expect(resolveStaticFile("/srv/dist", "/../secret.txt")).toBeNull();
    expect(resolveStaticFile("/srv/dist", "/../../etc/passwd")).toBeNull();
  });

  it("rejects the root and empty paths", () => {
    expect(resolveStaticFile("/srv/dist", "/")).toBeNull();
    expect(resolveStaticFile("/srv/dist", "")).toBeNull();
  });
});

describe("isApiPath", () => {
  it("matches /api and nested API paths only", () => {
    expect(isApiPath("/api")).toBe(true);
    expect(isApiPath("/api/health")).toBe(true);
    expect(isApiPath("/problems")).toBe(false);
    expect(isApiPath("/apiary")).toBe(false);
  });
});
