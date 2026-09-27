import { decodeSettingsResponse } from "@shared/api/settings";
import type { SettingsResponse } from "@shared/api/settings";
import type { Settings } from "@shared/domain/settings";
import { apiGet, apiJson } from "./client";

export function getSettings(): Promise<SettingsResponse> {
  return apiGet("/settings", decodeSettingsResponse);
}

export function replaceSettings(settings: Settings): Promise<SettingsResponse> {
  return apiJson("PUT", "/settings", decodeSettingsResponse, settings);
}
