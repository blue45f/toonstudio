/**
 * Studio work-mode × density chrome gating — the composition the host renders by.
 *
 * studio-work-mode.ts classifies each chrome region per work mode
 * (primary | visible | folded) and studio-ui-density.ts classifies the same
 * regions per density mode (visible | folded | hidden on the first screen).
 * Neither model alone may decide a mount: this module is the single place
 * where the two axes are composed, per HOST_INSERTION_SPEC §3:
 *
 * 1. Density is judged first and its rule is unchanged — a region the density
 *    axis hides stays hidden; the work-mode axis never creates a "hidden"
 *    verdict of its own and never resurrects a density-hidden region.
 * 2. A work-mode "folded" region renders folded (its mount gate closes) unless
 *    the user expanded the folded chrome. Expansion reuses the existing
 *    density advancedExpanded choice — no new storage key is introduced.
 * 3. "primary" regions are never folded by the work-mode axis.
 * 4. Work mode "all" is the identity on the work axis: every region keeps its
 *    density verdict, so the all/full render is pixel-identical to the
 *    pre-gating render.
 */
import type { StudioUiChromeRegion, StudioUiFirstScreenExposure } from "./studio-ui-density";
import {
  studioWorkModeExposure,
  type StudioWorkMode,
  type StudioWorkModeExposure,
} from "./studio-work-mode";

export type StudioChromeGateExposure = "visible" | "folded" | "hidden";

export function composeStudioChromeExposure(
  densityExposure: StudioUiFirstScreenExposure,
  workModeExposure: StudioWorkModeExposure,
  workModeFoldExpanded: boolean,
): StudioChromeGateExposure {
  if (densityExposure === "hidden") return "hidden";
  if (workModeExposure === "primary") return densityExposure;
  if (workModeExposure === "folded" && !workModeFoldExpanded) return "folded";
  return densityExposure;
}

/** Bound form: the exposure of one region under a concrete work mode. */
export function studioChromeExposureFor(
  workMode: StudioWorkMode,
  region: StudioUiChromeRegion,
  densityExposure: StudioUiFirstScreenExposure,
  workModeFoldExpanded: boolean,
): StudioChromeGateExposure {
  return composeStudioChromeExposure(
    densityExposure,
    studioWorkModeExposure(workMode, region),
    workModeFoldExpanded,
  );
}

/**
 * Boolean mount gate for renderers that already hold a density-side boolean
 * (e.g. the toolbar disclosure `allows` in StudioToolBeltCreateModeGroups):
 * the density verdict ANDs with the work-mode verdict. An open contextual
 * popover's retention stays the caller's existing `|| activeGroup` clause,
 * exactly as it already works for the density axis.
 */
export function studioWorkModeAllowsRegion(
  workMode: StudioWorkMode,
  region: StudioUiChromeRegion,
  workModeFoldExpanded: boolean,
): boolean {
  if (workModeFoldExpanded) return true;
  return studioWorkModeExposure(workMode, region) !== "folded";
}
