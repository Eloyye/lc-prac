import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsResponse } from "@shared/types";
import { loadSettings, saveSettings } from "../persistence/storage";
import { usePreferences } from "./preferences";

function createLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as unknown as Storage;
}

function apiResponse(mode: "copy" | "recall" | "free", distractionFree: boolean): Response {
  const body: SettingsResponse = {
    settings: { mode, distractionFree, updatedAt: "2026-07-18T00:00:00.000Z" },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(async () => {
  vi.unstubAllGlobals();
  globalThis.localStorage = createLocalStorage();
  usePreferences.setState({ paletteOpen: false, settingsOpen: false });
  await usePreferences.getState().loadForOwner(null);
});

describe("preferences ownership", () => {
  it("keeps anonymous Settings local", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    saveSettings({ mode: "recall", distractionFree: true });
    await usePreferences.getState().loadForOwner(null);

    expect(usePreferences.getState()).toMatchObject({
      ownerUserId: null,
      mode: "recall",
      distractionFree: true,
    });
    usePreferences.getState().setMode("free");
    expect(loadSettings()).toEqual({ mode: "free", distractionFree: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads and persists account Settings without overwriting anonymous Settings", async () => {
    saveSettings({ mode: "recall", distractionFree: true });
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(apiResponse("free", false))
      .mockResolvedValueOnce(apiResponse("free", true))
      .mockResolvedValueOnce(apiResponse("free", true));
    vi.stubGlobal("fetch", fetchSpy);

    await usePreferences.getState().loadForOwner("account-a");
    expect(usePreferences.getState()).toMatchObject({
      ownerUserId: "account-a",
      status: "ready",
      mode: "free",
      distractionFree: false,
    });
    expect(loadSettings()).toEqual({ mode: "recall", distractionFree: true });

    usePreferences.getState().setDistractionFree(true);
    await vi.waitFor(() => expect(usePreferences.getState().status).toBe("ready"));
    expect(fetchSpy).toHaveBeenLastCalledWith(
      "/api/settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ mode: "free", distractionFree: true }),
      }),
    );
    expect(loadSettings()).toEqual({ mode: "recall", distractionFree: true });

    // Re-hydration after a refresh reads the same account-backed values.
    await usePreferences.getState().loadForOwner("account-a");
    expect(usePreferences.getState()).toMatchObject({
      mode: "free",
      distractionFree: true,
      status: "ready",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("restores untouched anonymous Settings after sign-out", async () => {
    saveSettings({ mode: "recall", distractionFree: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiResponse("copy", false)));

    await usePreferences.getState().loadForOwner("account-a");
    await usePreferences.getState().loadForOwner(null);

    expect(usePreferences.getState()).toMatchObject({
      ownerUserId: null,
      mode: "recall",
      distractionFree: true,
    });
  });
});
