/**
 * Incremental luminous ribbon builder for active strokes.
 */

import {
  appendFxLuminousRunPolygons,
  appendFxLuminousSections,
  createFxLuminousPlanState,
  planStudioFxLuminousRibbonPass,
  resolveFxLuminousPassConfig,
  sealFxLuminousRibbonPassPlan,
  type FxLuminousSegmentResponse,
  type StudioFxLuminousBrushId,
  type StudioFxLuminousRibbonPassPlan,
} from "./studio-fx-brush-luminous-geometry";
import {
  resolveStudioFxPressurePassResponse,
  type StudioFxPressurePathPlan,
  type StudioFxPressurePathSegment,
  type StudioIncrementalFxPressurePathBuilder,
} from "./studio-fx-brush-pressure-path";
import { clamp } from "./studio-fx-brush-sampling";

export interface StudioIncrementalFxLuminousRibbonBuilder {
  /**
   * 자라나는 획의 현재 압력 경로를 소비하고 이 패스의 전체 리본 플랜을 돌려준다. 플랜 모양은
   * 배치 플래너와 완전히 같으며(`polygons`는 빌더 내부 배열이므로 수정하면 안 된다), 재사용
   * 검증에 실패하면 전체를 다시 만든다. `producer`는 `pressurePath`를 만든 그 빌더여야 한다 —
   * 소비 워터마크와 세대가 전부 거기서 나온다.
   */
  append(input: {
    readonly brushId: StudioFxLuminousBrushId;
    readonly pressurePath: StudioFxPressurePathPlan;
    readonly producer: StudioIncrementalFxPressurePathBuilder;
    readonly baseWidth: unknown;
    readonly passWidthScale: unknown;
    readonly passOpacity: unknown;
    readonly luminousCore?: boolean;
  }): StudioFxLuminousRibbonPassPlan;
  /**
   * 마지막 `append()`가 돌려준 `polygons` 앞쪽에서 앞으로 어떤 append도 다시 쓰지 않는 prefix
   * 길이. 유지 경로(Path2D)는 이 길이까지만 재사용하고 나머지는 매 프레임 다시 그린다.
   */
  stablePolygonCount(): number;
  /** 전체 재구축(리셋)마다 증가한다 — 유지된 Path2D의 prefix 신뢰를 무효화하는 신호. */
  generation(): number;
}

/** 라이브 드래프트용 증분 발광 리본 빌더. */
export function createStudioIncrementalFxLuminousRibbonBuilder(): StudioIncrementalFxLuminousRibbonBuilder {
  const state = createFxLuminousPlanState();
  const responses: FxLuminousSegmentResponse[] = [];
  let configBrushId: StudioFxLuminousBrushId | null = null;
  let configBaseWidth = Number.NaN;
  let configPassWidthScale = Number.NaN;
  let configPassOpacity = Number.NaN;
  let configLuminousCore = false;
  let producerGeneration = -1;
  let consumedSegmentCount = 0;
  let lastConsumedSegment: StudioFxPressurePathSegment | null = null;
  let stableResponseCount = 0;
  let stableSections = 0;
  let stableOpenRunStart = 0;
  let stableBodyJoinCount = 0;
  let stableWeightedOpacity = 0;
  let stableTotalLength = 0;
  let poisoned = false;
  let rebuildGeneration = 0;

  const reset = (): void => {
    state.sections.length = 0;
    state.polygons.length = 0;
    state.openRunStart = 0;
    state.bodyJoinCount = 0;
    state.capped = false;
    state.weightedOpacity = 0;
    state.totalLength = 0;
    responses.length = 0;
    consumedSegmentCount = 0;
    lastConsumedSegment = null;
    stableResponseCount = 0;
    stableSections = 0;
    stableOpenRunStart = 0;
    stableBodyJoinCount = 0;
    stableWeightedOpacity = 0;
    stableTotalLength = 0;
    poisoned = false;
    rebuildGeneration += 1;
  };

  /** 지난 프레임의 휘발 꼬리를 걷어내고 워터마크 상태로 되돌린다. */
  const rewindToWatermark = (): void => {
    state.sections.length = stableSections;
    state.openRunStart = stableOpenRunStart;
    state.bodyJoinCount = stableBodyJoinCount;
    state.weightedOpacity = stableWeightedOpacity;
    state.totalLength = stableTotalLength;
  };

  return {
    append(input) {
      const config = resolveFxLuminousPassConfig(input);
      const segments = input.pressurePath.segments;
      const producerGenerationNow = input.producer.generation();
      const reusable = configBrushId === input.brushId
        && Object.is(configBaseWidth, config.baseWidth)
        && Object.is(configPassWidthScale, config.passWidthScale)
        && Object.is(configPassOpacity, config.passOpacity)
        && configLuminousCore === config.luminousCore
        && producerGeneration === producerGenerationNow
        && segments.length >= consumedSegmentCount
        && (consumedSegmentCount === 0
          || segments[consumedSegmentCount - 1] === lastConsumedSegment);
      if (!reusable) reset();
      configBrushId = input.brushId;
      configBaseWidth = config.baseWidth;
      configPassWidthScale = config.passWidthScale;
      configPassOpacity = config.passOpacity;
      configLuminousCore = config.luminousCore;
      producerGeneration = producerGenerationNow;
      if (poisoned || config.baseWidth <= 0) {
        return planStudioFxLuminousRibbonPass(input);
      }

      const passWidth = clamp(
        config.baseWidth * config.passWidthScale,
        0.5,
        4096,
      );
      const stableSegmentCount = Math.min(
        input.producer.stableSegmentCount(),
        segments.length,
      );
      const flattenLimit = Math.max(0, stableSegmentCount - 1);

      responses.length = Math.min(responses.length, stableResponseCount);
      for (let index = responses.length; index < segments.length; index += 1) {
        responses.push(resolveStudioFxPressurePassResponse(
          segments[index]!,
          config.passWidthScale,
          config.luminousCore,
        ));
      }
      stableResponseCount = stableSegmentCount;

      rewindToWatermark();
      if (flattenLimit > consumedSegmentCount) {
        appendFxLuminousSections(
          state,
          input.pressurePath,
          passWidth,
          responses,
          consumedSegmentCount,
          flattenLimit,
        );
        if (state.capped) {
          reset();
          poisoned = true;
          return planStudioFxLuminousRibbonPass(input);
        }
        appendFxLuminousRunPolygons(state, stableSections);
        stableSections = state.sections.length;
        stableOpenRunStart = state.openRunStart;
        stableBodyJoinCount = state.bodyJoinCount;
        stableWeightedOpacity = state.weightedOpacity;
        stableTotalLength = state.totalLength;
        consumedSegmentCount = flattenLimit;
        lastConsumedSegment = segments[flattenLimit - 1]!;
      }
      appendFxLuminousSections(
        state,
        input.pressurePath,
        passWidth,
        responses,
        consumedSegmentCount,
        segments.length,
      );
      if (state.capped) {
        reset();
        poisoned = true;
        return planStudioFxLuminousRibbonPass(input);
      }
      appendFxLuminousRunPolygons(state, stableSections);
      return sealFxLuminousRibbonPassPlan(
        input.brushId,
        input.pressurePath,
        config,
        state,
        state.polygons,
      );
    },
    stablePolygonCount() {
      return stableBodyJoinCount;
    },
    generation() {
      return rebuildGeneration;
    },
  };
}
