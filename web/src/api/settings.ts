import type { Settings, SettingsResponse } from "@shared/types";
import { apiGet, apiJson } from "./client";

export function getSettings(): Promise<SettingsResponse> {
  return apiGet<SettingsResponse>("/settings");
}

export function replaceSettings(settings: Settings): Promise<SettingsResponse> {
  return apiJson<SettingsResponse>("PUT", "/settings", settings);
}
