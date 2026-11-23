/**
 * Growing-stroke incremental dab planner for oil and acrylic brush lanes.
 */

import { STUDIO_BRUSH_RETAINED_DRAFT_SYMMETRY_VARIATIONS } from "./studio-brush-symmetry";
import {
  appendOilBrushDabs,
  bristleBedOffsets,
  planOilBrushDabs,
  resolveOilDabSettings,
  type FxOilDab,
  type FxOilPlanInput,
} from "./studio-fx-brush-oil-dabs";
import {
  sampleStations,
  sanitizePoints,
  type StrokePoint,
} from "./studio-fx-brush-sampling";

/**
 * Growing-stroke planner for the oil/acrylic lanes: same output as `planOilBrushDabs`, without
 * rebuilding the whole bed on every pointer move.
 */
export class FxOilDabPlanner {
  private settingsKey: string | null = null;
  private stations: readonly StrokePoint[] = [];
  private dabs: readonly FxOilDab[] = [];
  private lastReusedDabs = 0;

  /** Dabs reused from the previous call. Diagnostics and identity tests only. */
  get reusedDabs(): number {
    return this.lastReusedDabs;
  }

  plan(input: FxOilPlanInput): FxOilDab[] {
    const points = sanitizePoints(input.points, input.pressures);
    if (points.length === 0) {
      this.reset();
      return [];
    }
    const settings = resolveOilDabSettings(input);
    const key = `${settings.baseWidth}|${settings.seed}|${settings.maxDabs}`
      + `|${settings.paintBody}|${settings.tipProfile}|${settings.spacing}`
      + `|${settings.capMode}`;
    if (key !== this.settingsKey) {
      this.settingsKey = key;
      this.stations = [];
      this.dabs = [];
    }
    const stations = sampleStations(points, settings.spacing, settings.maxDabs, settings.capMode);
    if (settings.capMode === "refit-v1" && stations.length >= settings.maxDabs) {
      this.stations = [];
      this.dabs = [];
      this.lastReusedDabs = 0;
      const full: FxOilDab[] = [];
      appendOilBrushDabs(
        full,
        stations,
        0,
        settings,
        bristleBedOffsets(settings.baseWidth, settings.seed),
      );
      return full;
    }
    const cached = this.stations;
    let verified = (stations.length === 1) === (cached.length === 1)
      ? Math.min(stations.length, cached.length)
      : 0;
    for (let index = 0; index < verified; index += 1) {
      const next = stations[index]!;
      const previous = cached[index]!;
      if (
        !Object.is(next.x, previous.x)
        || !Object.is(next.y, previous.y)
        || !Object.is(next.pressure, previous.pressure)
      ) {
        verified = index;
        break;
      }
    }
    const reuse = Math.max(0, Math.min(verified - 1, this.dabs.length));
    const dabs: FxOilDab[] = this.dabs.slice(0, reuse);
    appendOilBrushDabs(
      dabs,
      stations,
      reuse,
      settings,
      bristleBedOffsets(settings.baseWidth, settings.seed),
    );
    this.stations = stations;
    this.dabs = dabs.slice();
    this.lastReusedDabs = reuse;
    return dabs;
  }

  reset(): void {
    this.settingsKey = null;
    this.stations = [];
    this.dabs = [];
    this.lastReusedDabs = 0;
  }
}

interface RetainedOilDabDraft {
  readonly draftId: string;
  readonly planners: Map<number, FxOilDabPlanner>;
}

let retainedOilDabDraft: RetainedOilDabDraft | null = null;

/**
 * Stroke-keyed `FxOilDabPlanner`, for renderers that cannot hold one themselves.
 */
export function planOilBrushDabsIncremental(
  draftId: string,
  variationIndex: number,
  input: FxOilPlanInput,
): FxOilDab[] {
  if (retainedOilDabDraft?.draftId !== draftId) {
    retainedOilDabDraft = { draftId, planners: new Map() };
  }
  const planners = retainedOilDabDraft.planners;
  let planner = planners.get(variationIndex);
  if (!planner) {
    if (planners.size >= STUDIO_BRUSH_RETAINED_DRAFT_SYMMETRY_VARIATIONS) {
      return planOilBrushDabs(input);
    }
    planner = new FxOilDabPlanner();
    planners.set(variationIndex, planner);
  }
  return planner.plan(input);
}

/** Frees `draftId`'s retained beds. A no-op once a different draft has already replaced them. */
export function releaseOilBrushDabDraftPlanners(draftId: string): void {
  if (retainedOilDabDraft?.draftId === draftId) retainedOilDabDraft = null;
}
