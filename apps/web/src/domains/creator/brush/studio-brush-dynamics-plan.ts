import {
  advanceStudioBrushDwellEmitter,
  createStudioBrushDwellState,
} from "./studio-brush-dwell-emitter";
import {
  clamp,
  clamp01,
  cloneDualBrush,
  cloneTip,
  cloneTipLayers,
  cloneTaper,
  finiteNumber,
  INTERNAL_DEFAULT_SETTINGS,
  normalizeSignedDegrees,
  normalizeStudioBrushDynamicsSample,
  normalizeStudioBrushDynamicsSettings,
  normalizeUnsignedDegrees,
  resolveNormalizedStudioBrushDynamics,
  studioBrushTaperFactors,
  uint32,
} from "./studio-brush-dynamics-normalize";
import {
  applyStudioDynamicBrushMinimumDiameterRatio,
  DEFAULT_STUDIO_DYNAMIC_BRUSH_MAX_DABS,
  MAX_POINTER_SPEED,
  STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS,
  STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE,
  studioDynamicBrushContactFactor,
  type NormalizedStudioBrushDynamicsSettings,
  type StudioBrushDynamicsRecipe,
  type StudioBrushDynamicsSample,
  type StudioDynamicBrushDab,
  type StudioDynamicBrushPlan,
  type StudioDynamicBrushPlanInput,
  type StudioDynamicBrushSegmentStartFrame,
} from "./studio-brush-dynamics-types";
import {
  applyStudioBrushInOutTaperToDabs,
  isStudioBrushInOutTaperIdentity,
} from "./studio-brush-inout-taper";
import {
  evaluateStudioStrokeAndSubColorRgb,
  isStudioCspBrushExtensionsIdentity,
  normalizeStudioCspBrushExtensions,
} from "./studio-brush-stroke-color-dynamics";
import {
  planStudioPatternRibbonQuads,
  planStudioPatternStamps,
} from "./studio-pattern-brush";
import {
  applyBarrelTwistChiselNibToDabs,
  applyCentrifugalBristleTurnSplayToDabs,
  applyDipPenRailroadingToDabs,
  applyDynamicDualTip8ModeToDabs,
  resampleFlatStrokeWithCentripetalV2,
  resolveStrokeRgbTuple,
} from "./studio-brush-natural-media-dab-bridge";
import { sharpenStrokeCornerSamples } from "./studio-stroke-corner-sharpen";
import { transformStrokeWithRuledLine } from "./studio-stroke-ruled-line";

const MAX_COORDINATE_ABS = 1_000_000;
const POINT_EPSILON = 1e-6;

interface SanitizedStrokePoint {
  x: number;
  y: number;
  sourceProgress: number;
}

interface StrokeStation extends SanitizedStrokePoint {
  direction: number;
  progress: number;
}

function safeCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, -MAX_COORDINATE_ABS, MAX_COORDINATE_ABS)
    : null;
}

function sanitizeStrokePoints(value: unknown): SanitizedStrokePoint[] {
  if (!Array.isArray(value)) return [];
  const sourcePairCount = Math.floor(value.length / 2);
  const points: SanitizedStrokePoint[] = [];
  const epsilonSq = POINT_EPSILON * POINT_EPSILON;
  for (let pairIndex = 0; pairIndex < sourcePairCount; pairIndex++) {
    const x = safeCoordinate(value[pairIndex * 2]);
    const y = safeCoordinate(value[pairIndex * 2 + 1]);
    if (x === null || y === null) continue;
    const sourceProgress = sourcePairCount <= 1 ? 0 : pairIndex / (sourcePairCount - 1);
    const previous = points.at(-1);
    if (previous) {
      const dx = x - previous.x;
      const dy = y - previous.y;
      if (dx * dx + dy * dy <= epsilonSq) {
        // Keep the most recent exact endpoint and associated stylus progress for zero-length runs.
        previous.x = x;
        previous.y = y;
        previous.sourceProgress = sourceProgress;
        continue;
      }
    }
    points.push({ x, y, sourceProgress });
  }
  return points;
}

function cumulativeLengths(points: readonly SanitizedStrokePoint[]): Float64Array {
  const cumulative = new Float64Array(points.length);
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    cumulative[index] = cumulative[index - 1]! + Math.sqrt(dx * dx + dy * dy);
  }
  return cumulative;
}

/**
 * Creates a forward-only arc-length sampler.
 *
 * Planned dab distances are strictly increasing. Binary-searching the whole source path for every
 * dab made an active airbrush frame O(D log N) after already paying O(N) for cumulative lengths,
 * and that cost grew perceptibly during long strokes. One segment cursor produces byte-identical
 * interpolation in O(N + D). A defensive reset preserves deterministic behavior if a future caller
 * ever supplies a regressing distance.
 */
function createStationAtDistanceSampler(
  points: readonly SanitizedStrokePoint[],
  cumulative: Float64Array,
  totalLength: number
): (rawDistance: number) => StrokeStation {
  let upperIndex = 1;
  let previousDistance = 0;
  return (rawDistance: number): StrokeStation => {
    if (points.length === 1 || totalLength <= POINT_EPSILON) {
      return { ...points[0]!, direction: 0, progress: 0 };
    }

    const distance = clamp(rawDistance, 0, totalLength);
    if (distance < previousDistance) upperIndex = 1;
    previousDistance = distance;
    if (distance <= POINT_EPSILON) {
      upperIndex = 1;
    } else if (totalLength - distance <= POINT_EPSILON) {
      upperIndex = points.length - 1;
    } else {
      while (
        upperIndex < points.length - 1
        && cumulative[upperIndex]! < distance
      ) {
        upperIndex += 1;
      }
    }

    const lowerIndex = upperIndex - 1;
    const start = points[lowerIndex]!;
    const end = points[upperIndex]!;
    const segmentStart = cumulative[lowerIndex]!;
    const segmentLength = cumulative[upperIndex]! - segmentStart;
    const amount = segmentLength > POINT_EPSILON
      ? clamp01((distance - segmentStart) / segmentLength)
      : 0;
    return {
      x: distance <= POINT_EPSILON
        ? points[0]!.x
        : totalLength - distance <= POINT_EPSILON
          ? points.at(-1)!.x
          : start.x + (end.x - start.x) * amount,
      y: distance <= POINT_EPSILON
        ? points[0]!.y
        : totalLength - distance <= POINT_EPSILON
          ? points.at(-1)!.y
          : start.y + (end.y - start.y) * amount,
      sourceProgress: start.sourceProgress + (end.sourceProgress - start.sourceProgress) * amount,
      direction: normalizeSignedDegrees(
        Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI
      ),
      progress: distance / totalLength,
    };
  };
}

function sampleNumberAtProgress(
  values: unknown,
  progress: number,
  fallback: number,
  min: number,
  max: number
): number {
  if (!Array.isArray(values) || values.length === 0) return fallback;
  if (values.length === 1) return clamp(finiteNumber(values[0], fallback), min, max);
  const position = clamp01(progress) * (values.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(values.length - 1, Math.ceil(position));
  const amount = position - lowerIndex;
  const lower = clamp(finiteNumber(values[lowerIndex], fallback), min, max);
  const upper = clamp(finiteNumber(values[upperIndex], lower), min, max);
  return clamp(lower + (upper - lower) * amount, min, max);
}

function sampleCircularDegreesAtProgress(
  values: unknown,
  progress: number,
  fallback: number,
  min: number,
  max: number
): number {
  if (!Array.isArray(values) || values.length === 0) return normalizeSignedDegrees(fallback);
  if (values.length === 1) return normalizeSignedDegrees(clamp(finiteNumber(values[0], fallback), min, max));
  const position = clamp01(progress) * (values.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(values.length - 1, Math.ceil(position));
  const amount = position - lowerIndex;
  const lower = clamp(finiteNumber(values[lowerIndex], fallback), min, max);
  const upper = clamp(finiteNumber(values[upperIndex], lower), min, max);
  const delta = normalizeSignedDegrees(upper - lower);
  return normalizeSignedDegrees(lower + delta * amount);
}

function sampleTwistAtProgress(values: unknown, progress: number): number {
  return normalizeUnsignedDegrees(sampleCircularDegreesAtProgress(values, progress, 0, 0, 359));
}

function sampleForStation(
  station: StrokeStation,
  stampIndex: number,
  input: Partial<StudioDynamicBrushPlanInput>,
  settings: NormalizedStudioBrushDynamicsSettings
): StudioBrushDynamicsSample {
  const sourceProgress = station.sourceProgress;
  const direction = Array.isArray(input.directions) && input.directions.length > 0
    ? sampleCircularDegreesAtProgress(input.directions, sourceProgress, station.direction, -180, 180)
    : station.direction;
  return {
    pressure: sampleNumberAtProgress(input.pressures, sourceProgress, settings.fallbackPressure, 0, 1),
    tangentialPressure: sampleNumberAtProgress(input.tangentialPressures, sourceProgress, 0, -1, 1),
    speed: sampleNumberAtProgress(input.speeds, sourceProgress, 0, 0, MAX_POINTER_SPEED),
    tiltX: sampleNumberAtProgress(input.tiltXs, sourceProgress, 0, -90, 90),
    tiltY: sampleNumberAtProgress(input.tiltYs, sourceProgress, 0, -90, 90),
    twist: sampleTwistAtProgress(input.twists, sourceProgress),
    direction,
    stampIndex,
  };
}

function settingsForPlan(
  input: Partial<StudioDynamicBrushPlanInput>,
  normalizedSettings?: NormalizedStudioBrushDynamicsSettings,
  detachSettings = true
): NormalizedStudioBrushDynamicsSettings {
  const settings = normalizedSettings ?? normalizeStudioBrushDynamicsSettings(input.settings);
  const width = clamp(
    finiteNumber(input.baseWidth, INTERNAL_DEFAULT_SETTINGS.width.base),
    settings.width.min,
    settings.width.max
  );
  const opacity = clamp(
    finiteNumber(input.baseOpacity, INTERNAL_DEFAULT_SETTINGS.opacity.base),
    settings.opacity.min,
    settings.opacity.max
  );
  const spacing = settings.spacingRatio === null
    ? settings.spacing.base
    : clamp(width * settings.spacingRatio, settings.spacing.min, settings.spacing.max);
  const scatter = settings.scatterRatio === null
    ? settings.scatter.base
    : clamp(width * settings.scatterRatio, settings.scatter.min, settings.scatter.max);
  const rawCsp = normalizedSettings?.cspBrushExtensions ?? input.settings?.cspBrushExtensions;
  const normalizedCsp = rawCsp ? normalizeStudioCspBrushExtensions(rawCsp) : undefined;
  const activeCsp = normalizedCsp && !isStudioCspBrushExtensionsIdentity(normalizedCsp)
    ? normalizedCsp
    : undefined;
  if (!detachSettings) {
    // The normalized renderer helper returns only dabs and never exposes this plan-local value.
    // Keep immutable nested settings by reference instead of cloning every mapping/tip/grain field
    // on each active-draft frame.
    return {
      ...settings,
      seed: uint32(input.seed, settings.seed),
      ...(activeCsp ? { cspBrushExtensions: activeCsp } : {}),
      width: { ...settings.width, base: width },
      opacity: { ...settings.opacity, base: opacity },
      spacing: { ...settings.spacing, base: spacing },
      scatter: { ...settings.scatter, base: scatter },
    };
  }
  return {
    ...settings,
    seed: uint32(input.seed, settings.seed),
    taper: cloneTaper(settings.taper),
    tip: cloneTip(settings.tip),
    colorDynamics: { ...settings.colorDynamics },
    grain: { ...settings.grain },
    tipLayers: cloneTipLayers(settings.tipLayers),
    ...(settings.dualBrush ? { dualBrush: cloneDualBrush(settings.dualBrush) } : {}),
    ...(activeCsp ? { cspBrushExtensions: activeCsp } : {}),
    width: { ...settings.width, base: width },
    opacity: { ...settings.opacity, base: opacity },
    spacing: { ...settings.spacing, base: spacing },
    scatter: { ...settings.scatter, base: scatter },
  };
}

/**
 * Per-dab segment receipts are frozen only outside production builds. The freeze is a dev/test
 * invariant guard (carriers must treat the shared receipt as immutable), and its per-dab cost is
 * measurable in the planner hot loop; prod emits the exact same object shape and values without
 * paying for it. Optional chaining keeps plain-Node tooling (tsx scripts) working where
 * `import.meta.env` is absent, and the module-level constant keeps the env lookup off the loop.
 */
const FREEZE_SEGMENT_FRAMES = import.meta.env?.DEV === true;

/**
 * Converts a stroke to deterministic, arc-length-spaced particle dabs.
 *
 * When maxDabs >= 2, both unscattered source endpoints are retained even if the plan is capped.
 * Scatter intentionally moves rendered x/y; sourceX/sourceY always expose the exact path station.
 */
function planStudioDynamicBrushFromInput(
  input: Partial<StudioDynamicBrushPlanInput>,
  normalizedSettings?: NormalizedStudioBrushDynamicsSettings,
  detachSettings = true
): StudioDynamicBrushPlan {
  const settings = settingsForPlan(input, normalizedSettings, detachSettings);
  let points = sanitizeStrokePoints(input.points);
  if (points.length === 0) {
    return { dabs: [], sourcePointCount: 0, totalLength: 0, capped: false, settings };
  }
  const sourcePointCount = points.length;
  let workingInput: Partial<StudioDynamicBrushPlanInput> = input;
  if (input.curveResampler === "centripetal-v2" && points.length >= 3) {
    const resampled = resampleFlatStrokeWithCentripetalV2({
      points: input.points ?? [],
      pressures: input.pressures,
      tiltXs: input.tiltXs,
      tiltYs: input.tiltYs,
      twists: input.twists,
      spacingPx: Math.max(0.5, settings.spacing.base),
      maxStations: finiteNumber(input.maxDabs, DEFAULT_STUDIO_DYNAMIC_BRUSH_MAX_DABS),
    });
    if (resampled && resampled.points.length >= 4) {
      points = sanitizeStrokePoints(resampled.points);
      workingInput = {
        ...input,
        points: resampled.points,
        pressures: resampled.pressures,
        tiltXs: resampled.tiltXs,
        tiltYs: resampled.tiltYs,
        twists: resampled.twists,
      };
    }
  }
  input = workingInput;
  const cspExt = settings.cspBrushExtensions;
  let dashedGapRanges: { start: number; end: number }[] | null = null;

  if (cspExt) {
    if (cspExt.sharpCorner.enabled && points.length >= 3) {
      const sharpened = sharpenStrokeCornerSamples(
        points.map((pt, idx) => ({
          x: pt.x,
          y: pt.y,
          width: settings.width.base,
          speedPxPerMs: Array.isArray(input.speeds) ? input.speeds[idx] : undefined,
        })),
        cspExt.sharpCorner,
      );
      if (sharpened.length >= 2) {
        points = sharpened.map((pt, idx) => ({
          x: pt.x,
          y: pt.y,
          sourceProgress: idx / (sharpened.length - 1),
        }));
      }
    }
    if (cspExt.ruledLine.mode !== "none" && points.length >= 2) {
      const subPolys = transformStrokeWithRuledLine(points, {
        ...cspExt.ruledLine,
        seed: settings.seed,
      });
      if (cspExt.ruledLine.mode === "dashed" || cspExt.ruledLine.mode === "dotted") {
        // 파선/점선은 간격(gap) 호길이 구간을 계산하여 실제 스탬프 배치에서 여백을 비운다.
        const period = cspExt.ruledLine.mode === "dashed"
          ? cspExt.ruledLine.dashLengthPx + cspExt.ruledLine.gapLengthPx
          : Math.max(2, cspExt.ruledLine.gapLengthPx);
        const onLen = cspExt.ruledLine.mode === "dashed"
          ? cspExt.ruledLine.dashLengthPx
          : Math.min(period * 0.35, Math.max(1, settings.spacing.base));
        dashedGapRanges = [{ start: onLen, end: period }];
      } else if (subPolys[0] && subPolys[0].length >= 2) {
        const displaced = subPolys[0];
        points = displaced.map((pt, idx) => ({
          x: pt.x,
          y: pt.y,
          sourceProgress: idx / (displaced.length - 1),
        }));
      }
    }
  }

  const cumulative = cumulativeLengths(points);
  const totalLength = cumulative.at(-1) ?? 0;
  const maxDabs = Math.trunc(clamp(
    finiteNumber(input.maxDabs, DEFAULT_STUDIO_DYNAMIC_BRUSH_MAX_DABS),
    STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE.min,
    STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE.max
  ));
  interface PlannedDynamicBrushStation {
    readonly distance: number;
    readonly station: StrokeStation;
    readonly recipe: StudioBrushDynamicsRecipe;
  }
  const buildStations = (
    fitWholePathToBudget: boolean,
    reusableStations?: readonly PlannedDynamicBrushStation[]
  ): PlannedDynamicBrushStation[] => {
    const stationAtDistance = createStationAtDistanceSampler(
      points,
      cumulative,
      totalLength
    );
    const stationPlanAt = (
      distance: number,
      index: number
    ): PlannedDynamicBrushStation => {
      // A planned station is a pure function of its exact (distance, stampIndex) pair for this
      // fixed input/settings closure, so the bounded second pass reuses first-pass stations
      // byte-identically wherever natural spacing still wins over the budget floor, instead of
      // re-resolving the shared prefix's samples and recipes. Skipping the arc-length sampler for
      // reused stations is safe: its cursor only ever starts at or below the queried segment, and
      // per-pass distances stay strictly increasing.
      const reusableStation = reusableStations?.[index];
      if (reusableStation && reusableStation.distance === distance) return reusableStation;
      const station = stationAtDistance(distance);
      const sample = normalizeStudioBrushDynamicsSample(
        sampleForStation(station, index, input, settings),
        settings
      );
      return {
        distance,
        station,
        recipe: resolveNormalizedStudioBrushDynamics(sample, settings),
      };
    };
    const planned = [stationPlanAt(0, 0)];
    if (points.length <= 1 || totalLength <= POINT_EPSILON) return planned;

    while (planned.length < maxDabs) {
      const current = planned.at(-1)!;
      const currentDistance = current.distance;
      const naturalSpacing = Math.max(
        STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS.spacing.min,
        current.recipe.spacing
      );
      // A capped stroke used to keep all natural dabs near the start and replace only the final one
      // with the endpoint, leaving a many-thousand-pixel hole. On the bounded second pass, reserve
      // enough progress for every remaining station (including the endpoint). Natural spacing still
      // wins wherever pressure/speed/jitter asks for a wider interval, so variable-spacing character
      // survives while the hard cap remains O(maxDabs).
      const remainingStationSlots = maxDabs - planned.length;
      const budgetSpacing = fitWholePathToBudget && remainingStationSlots > 0
        ? (totalLength - currentDistance) / remainingStationSlots
        : 0;
      const nextDistance = currentDistance + Math.max(naturalSpacing, budgetSpacing);
      if (nextDistance >= totalLength - POINT_EPSILON) {
        if (totalLength - currentDistance > POINT_EPSILON) {
          planned.push(stationPlanAt(totalLength, planned.length));
        }
        break;
      }
      planned.push(stationPlanAt(nextDistance, planned.length));
    }
    return planned;
  };

  const naturalStations = buildStations(false);
  const capped = totalLength > POINT_EPSILON
    && totalLength - naturalStations.at(-1)!.distance > POINT_EPSILON;
  // Preserve byte-for-byte natural spacing for ordinary strokes. Only a plan proven to exceed the
  // cap pays for the bounded redistribution pass. A one-dab budget cannot retain both endpoints and
  // intentionally keeps the start, matching the public maxDabs=1 contract.
  const plannedStations = capped && maxDabs >= 2
    ? buildStations(true, naturalStations)
    : naturalStations;

  // Point taps and zero-length runs have no travel axis, so shared start/end taper would
  // incorrectly force the minimum tip size on the only dab.
  const applyStrokeTaper = totalLength > POINT_EPSILON;
  let previousSegmentFrame: StudioDynamicBrushSegmentStartFrame | undefined;
  const dabs = plannedStations.map(({ station, recipe, distance }, index): StudioDynamicBrushDab => {
    const taper = applyStrokeTaper
      ? studioBrushTaperFactors(station.progress, settings.taper)
      : { size: 1, opacity: 1 };
    // Width mappings and taper resolve first; the persisted minimum then constrains geometry only.
    // Opacity/flow keep the untouched canonical pressure so a light stylus contact can remain
    // optically delicate without becoming an unusably sub-pixel tip.
    const size = clamp(
      applyStudioDynamicBrushMinimumDiameterRatio(
        recipe.size * taper.size,
        settings.width.base,
        settings.minimumDiameterRatio
      ),
      STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS.width.min,
      STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS.width.max
    );
    const opacity = clamp01(recipe.opacity * taper.opacity);
    const distanceFromPrevious = index === 0
      ? 0
      : Math.max(0, distance - plannedStations[index - 1]!.distance);
    const contactFactor = studioDynamicBrushContactFactor(
      size,
      opacity,
      recipe.flow,
    );
    const contactLoadFromStrokeStart = previousSegmentFrame
      ? (
          (previousSegmentFrame.contactLoadFromStrokeStart ?? 0)
          + distanceFromPrevious
            * (
              (previousSegmentFrame.contactFactor ?? contactFactor)
              + contactFactor
            ) / 2
        )
      : 0;
    const dab: StudioDynamicBrushDab = {
      index,
      progress: station.progress,
      sourceX: station.x,
      sourceY: station.y,
      direction: station.direction,
      distanceFromPrevious,
      distanceFromStrokeStart: distance,
      contactLoadFromStrokeStart,
      contactFactor,
      ...(previousSegmentFrame
        ? { segmentStartFrame: previousSegmentFrame }
        : {}),
      x: station.x + recipe.scatterOffsetX,
      y: station.y + recipe.scatterOffsetY,
      size,
      opacity,
      flow: recipe.flow,
      spacing: recipe.spacing,
      scatter: recipe.scatter,
      angle: recipe.angle,
      roundness: recipe.roundness,
    };
    const segmentFrame: StudioDynamicBrushSegmentStartFrame = {
      index,
      sourceX: station.x,
      sourceY: station.y,
      direction: station.direction,
      size,
      roundness: recipe.roundness,
      distanceFromStrokeStart: distance,
      contactLoadFromStrokeStart,
      contactFactor,
    };
      previousSegmentFrame = FREEZE_SEGMENT_FRAMES ? Object.freeze(segmentFrame) : segmentFrame;
      return dab;
    });

  let finalDabs = dabs;
  let patternMotifId: string | undefined;
  let patternRibbonQuadCount: number | undefined;

  if (cspExt) {
    if (dashedGapRanges && dashedGapRanges.length > 0 && totalLength > POINT_EPSILON) {
      const gapRule = dashedGapRanges[0]!;
      const period = gapRule.end;
      const onSpan = gapRule.start;
      finalDabs = finalDabs.filter((dab) => {
        const phase = (dab.distanceFromStrokeStart ?? 0) % period;
        return phase <= onSpan;
      });
    }

    if (!isStudioBrushInOutTaperIdentity(cspExt.inOutTaper) && finalDabs.length > 0) {
      finalDabs = applyStudioBrushInOutTaperToDabs(
        finalDabs,
        totalLength,
        cspExt.inOutTaper,
        Array.isArray(input.speeds) ? input.speeds : undefined,
      );
    }

    if (cspExt.dwellBuildup.enabled && finalDabs.length > 0 && finalDabs.length < maxDabs) {
      const tailDab = finalDabs.at(-1)!;
      const tailPressure = sampleNumberAtProgress(
        input.pressures,
        1,
        settings.fallbackPressure,
        0,
        1,
      );
      const dwellInit = createStudioBrushDwellState(tailDab.sourceX, tailDab.sourceY, 0);
      const dwellRes = advanceStudioBrushDwellEmitter(dwellInit, cspExt.dwellBuildup, {
        x: tailDab.sourceX,
        y: tailDab.sourceY,
        pressure: tailPressure,
        timestampMs: cspExt.dwellBuildup.intervalMs * 3,
        maxTicksPerStep: Math.max(1, maxDabs - finalDabs.length),
      });
      if (dwellRes.emitted.length > 0) {
        const dwellDabs = dwellRes.emitted.map((tick, idx): StudioDynamicBrushDab => ({
          ...tailDab,
          index: finalDabs.length + idx,
          distanceFromPrevious: 0,
          flow: clamp01(tailDab.flow * tick.effectiveFlowScale),
          opacity: clamp01(tailDab.opacity * Math.min(1, tick.effectiveFlowScale + 0.15)),
        }));
        finalDabs = [...finalDabs, ...dwellDabs];
      }
    }

    if (cspExt.patternBrush.motif !== "none" && points.length >= 2) {
      patternMotifId = cspExt.patternBrush.motif;
      const patCfg = { ...cspExt.patternBrush, seed: settings.seed };
      if (cspExt.patternBrush.ribbon) {
        const quads = planStudioPatternRibbonQuads(points, patCfg);
        patternRibbonQuadCount = quads.length;
      } else {
        const stamps = planStudioPatternStamps(points, patCfg);
        if (stamps.length > 0) {
          finalDabs = stamps.slice(0, maxDabs).map((st, idx): StudioDynamicBrushDab => {
            const refDab = finalDabs[Math.min(idx, Math.max(0, finalDabs.length - 1))];
            return {
              index: idx,
              progress: stamps.length > 1 ? idx / (stamps.length - 1) : 0,
              sourceX: st.x,
              sourceY: st.y,
              x: st.x,
              y: st.y,
              size: st.widthPx,
              opacity: refDab?.opacity ?? settings.opacity.base,
              flow: refDab?.flow ?? settings.flow.base,
              spacing: cspExt.patternBrush.spacingPx,
              scatter: 0,
              angle: normalizeSignedDegrees((st.tangentAngleRad * 180) / Math.PI),
              roundness: 1,
              patternMotifId,
            };
          });
        }
      }
      if (cspExt.patternBrush.ribbon) {
        finalDabs = finalDabs.map((dab) => ({ ...dab, patternMotifId }));
      }
    }

    if (
      cspExt.strokeColorAndScale.perStrokeColorJitter ||
      cspExt.strokeColorAndScale.subColorMixSource !== "off"
    ) {
      const fgRgb = resolveStrokeRgbTuple(input.foregroundRgb, input.foregroundHex, [24, 24, 24]);
      const bgRgb = resolveStrokeRgbTuple(
        input.secondaryRgb,
        input.secondaryHex ?? settings.colorDynamics.backgroundColor,
        [220, 96, 64],
      );
      finalDabs = finalDabs.map((dab) => {
        const p = sampleNumberAtProgress(input.pressures, dab.progress, settings.fallbackPressure, 0, 1);
        const spd = sampleNumberAtProgress(input.speeds, dab.progress, 0, 0, MAX_POINTER_SPEED);
        const tx = sampleNumberAtProgress(input.tiltXs, dab.progress, 0, -90, 90);
        const ty = sampleNumberAtProgress(input.tiltYs, dab.progress, 0, -90, 90);
        const rgbTint = evaluateStudioStrokeAndSubColorRgb(
          fgRgb,
          bgRgb,
          cspExt.strokeColorAndScale,
          {
            strokeSeed: settings.seed,
            pressure: p,
            speedNormalized: clamp01(spd / Math.max(0.05, settings.maxSpeed)),
            tiltMagnitude: clamp01(Math.hypot(tx, ty) / 90),
          },
        );
        return { ...dab, rgbTint };
      });
    }
  }

  // Wave V2-W2 실서비스 자연매체 승격 패스 (옵션 활성 시 기존 레거시 스냅샷 바이트 동일성 100% 보존)
  if (input.naturalMediaNibProfile && finalDabs.length > 0) {
    finalDabs = applyDipPenRailroadingToDabs(finalDabs, input.naturalMediaNibProfile, {
      pressures: input.pressures,
      speeds: input.speeds,
      baseWidthPx: settings.width.base,
      maxDabs,
    });
  }
  if (input.dynamicDualTip?.enabled && finalDabs.length > 0) {
    finalDabs = applyDynamicDualTip8ModeToDabs(finalDabs, {
      ...input.dynamicDualTip,
      seed: settings.seed,
    });
  }
  if (typeof input.centrifugalBristleStiffness01 === "number" && Number.isFinite(input.centrifugalBristleStiffness01) && finalDabs.length > 1) {
    finalDabs = applyCentrifugalBristleTurnSplayToDabs(
      finalDabs,
      input.centrifugalBristleStiffness01,
      input.speeds,
    );
  }
  if (input.barrelTwistChisel?.enabled && finalDabs.length > 0) {
    finalDabs = applyBarrelTwistChiselNibToDabs(finalDabs, input.barrelTwistChisel, {
      twists: input.twists,
      tiltXs: input.tiltXs,
      tiltYs: input.tiltYs,
    });
  }

  return {
    dabs: finalDabs,
    sourcePointCount,
    totalLength,
    capped,
    settings,
    ...(patternMotifId ? { patternMotifId } : {}),
    ...(patternRibbonQuadCount !== undefined ? { patternRibbonQuadCount } : {}),
  };
}

/** Validates arbitrary settings and converts a stroke to deterministic render dabs. */
export function planStudioDynamicBrush(
  rawInput?: Partial<StudioDynamicBrushPlanInput> | null
): StudioDynamicBrushPlan {
  return planStudioDynamicBrushFromInput(rawInput ?? {});
}

/** Renderer convenience alias when only dabs are needed. */
export function planStudioDynamicBrushDabs(
  input?: Partial<StudioDynamicBrushPlanInput> | null
): StudioDynamicBrushDab[] {
  return planStudioDynamicBrush(input).dabs;
}

/**
 * Hot renderer path for settings that already crossed the normalization boundary. This skips a
 * second walk over every mapping/tip/grain field while retaining the same detached planner output.
 */
export function planNormalizedStudioDynamicBrushDabs(
  input: Omit<Partial<StudioDynamicBrushPlanInput>, "settings"> | null | undefined,
  settings: NormalizedStudioBrushDynamicsSettings
): StudioDynamicBrushDab[] {
  return planStudioDynamicBrushFromInput(input ?? {}, settings, false).dabs;
}
