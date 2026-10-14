import type { StudioRememberedPrimaryTool } from "./studio-initial-primary-tool";
import type { StudioUiDensityMode } from "./studio-ui-density";

/**
 * Launch hints are the entry-path side of the density policy declared in
 * studio-ui-density.ts (BLUEPRINT §4.1). The density mode type and the policy
 * table live only there; this module declares how a launch URL maps onto them.
 */

/** A launch hint changes UI preferences only, never the drawing document or engine. */
export type StudioLaunchDensity = StudioUiDensityMode;

/**
 * The `uiMode` query mapping, declared as one table (existing mapping, unchanged):
 * legacy aliases keep their established targets — notably `simple` has always
 * launched the focused canvas, while `basic`/`standard` mean the simple mode.
 * Unknown or repeated values are not a launch hint at all (null).
 */
export const STUDIO_LAUNCH_DENSITY_BY_UI_MODE: Readonly<
  Record<string, StudioLaunchDensity>
> = Object.freeze({
  focus: "focus",
  simple: "focus",
  basic: "simple",
  standard: "simple",
  full: "full",
  studio: "full",
});

export function readStudioLaunchDensity(search: string): StudioLaunchDensity | null {
  const values = new URLSearchParams(search).getAll("uiMode");
  if (values.length !== 1) return null;
  return STUDIO_LAUNCH_DENSITY_BY_UI_MODE[values[0]] ?? null;
}

/** Explicit launch intent wins once, without overwriting the user's remembered tool. */
export function readStudioLaunchPrimaryTool(search: string): StudioRememberedPrimaryTool | null {
  const values = new URLSearchParams(search).getAll("startTool");
  if (values.length !== 1) return null;
  return values[0] === "draw" || values[0] === "select" ? values[0] : null;
}

export function applyStudioLaunchDensity<T extends { general: { densityMode: StudioUiDensityMode } }>(
  settings: T,
  requested: StudioLaunchDensity | null,
): T {
  return requested && settings.general.densityMode !== requested
    ? { ...settings, general: { ...settings.general, densityMode: requested } }
    : settings;
}
