import { isMode } from "../domain/mode";
import type { SavedSettings } from "../domain/settings";
import { boolean, guarded, object, string } from "./decode";
import type { Decoder } from "./decode";

export interface SettingsResponse {
  settings: SavedSettings;
}

export const decodeSettingsResponse: Decoder<SettingsResponse> = object({
  settings: object({
    mode: guarded(isMode, "a Mode"),
    distractionFree: boolean,
    updatedAt: string,
  }),
});
