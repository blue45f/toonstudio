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
  return Object.hasOwn(STUDIO_LAUNCH_DENSITY_BY_UI_MODE, values[0])
    ? STUDIO_LAUNCH_DENSITY_BY_UI_MODE[values[0]]
    : null;
}

/** 프로젝트 단계를 옮겨도 명시한 화면 모드만 전달한다. 대상 주소의 선택은 우선한다. */
export function preserveStudioLaunchDensity(href: string, search: string): string {
  if (!href.startsWith("/studio/") || readStudioLaunchDensity(search) === null) return href;
  const uiMode = new URLSearchParams(search).get("uiMode");
  if (!uiMode) return href;
  const hashIndex = href.indexOf("#");
  const hash = hashIndex < 0 ? "" : href.slice(hashIndex);
  const target = hashIndex < 0 ? href : href.slice(0, hashIndex);
  const queryIndex = target.indexOf("?");
  const pathname = queryIndex < 0 ? target : target.slice(0, queryIndex);
  const params = new URLSearchParams(queryIndex < 0 ? "" : target.slice(queryIndex + 1));
  if (params.has("uiMode")) return href;
  // basic/standard를 simple로 정규화하면 집중 모드로 바뀌므로 검증한 별칭을 그대로 쓴다.
  params.set("uiMode", uiMode);
  return `${pathname}?${params.toString()}${hash}`;
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
