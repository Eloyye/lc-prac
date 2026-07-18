import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettingsResponse } from "@shared/types";
import { getSettings, replaceSettings } from "./settings";

afterEach(() => {
  vi.unstubAllGlobals();
});

const response: SettingsResponse = {
  settings: {
    mode: "recall",
    distractionFree: true,
    updatedAt: "2026-07-18T00:00:00.000Z",
  },
};

describe("Settings API", () => {
  it("reads and replaces the complete account Settings document", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(getSettings()).resolves.toEqual(response);
    await expect(replaceSettings({ mode: "recall", distractionFree: true })).resolves.toEqual(
      response,
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "/api/settings",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "/api/settings",
      expect.objectContaining({
        method: "PUT",
        credentials: "same-origin",
        body: JSON.stringify({ mode: "recall", distractionFree: true }),
      }),
    );
  });
});
