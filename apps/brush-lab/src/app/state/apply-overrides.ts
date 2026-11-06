import { stabilizerPctToOneEuro } from "../../engine/input/stabilizer-map";
import { normalizeProgram } from "../../engine/presets/program-schema";
import { DEFAULT_WET_PARAMS } from "../../engine/wet/params";

import type { LabOverrides } from "./lab-store";
import type { OneEuroParams } from "../../engine/input/one-euro";
import type { BrushDepositionSpec, BrushProgram, BrushTipSpec } from "../../engine/presets/program-schema";

/**
 * 파라미터 패널 오버라이드를 프리셋에 적용해 새 `BrushProgram`을 만든다.
 * 결과는 `normalizeProgram`으로 다시 검증하므로 범위 밖 값은 ZodError로 드러난다(무음 보정 없음).
 */

/**
 * 안정화 강도 0..1 → 위치 1€ 필터 파라미터(로그 매핑 `stabilizerPctToOneEuro`: 30 Hz → 0.4 Hz, β 0.12 → 0.006, dCutoff 1.0).
 * 그리기 패널(`DrawParamPanel`)과 A/B 비교 패널(`BrushParamPanel`)이 같은 로그 척도를 공유한다.
 * 0.6 초과 구간은 설계상 spring 팔로워 백엔드 위임 대상이지만 이 랩에는 없으므로 같은 1€ 매핑을 쓴다(패널에 표시).
 */
export function stabilizerToOneEuro(strength: number): OneEuroParams {
  return stabilizerPctToOneEuro(strength * 100);
}

export const STABILIZER_BACKEND_LIMIT = 0.6;

function pickTip(base: BrushTipSpec, o: LabOverrides): BrushTipSpec {
  const hardness = o.hardness ?? base.hardness;
  const aspect = o.aspect ?? base.aspect;
  const params =
    o.params !== undefined || o.hardness !== undefined || o.aspect !== undefined
      ? { ...base.params, ...o.params, hardness, aspect }
      : base.params;
  return {
    kind: o.kind ?? base.kind,
    sizePx: o.sizePx ?? base.sizePx,
    hardness,
    aspect,
    angleRad: o.angleRad ?? base.angleRad,
    shapeExp: o.shapeExp ?? base.shapeExp,
    seed: o.seed ?? base.seed,
    params,
  };
}

function pickDeposition(base: BrushDepositionSpec, o: LabOverrides): BrushDepositionSpec {
  return {
    model: o.model ?? base.model,
    flow: o.flow ?? base.flow,
    opacity: o.opacity ?? base.opacity,
    spacing: o.spacing ?? base.spacing,
    timeDabsPerSecond: o.timeDabsPerSecond ?? base.timeDabsPerSecond,
    blend: o.blend ?? base.blend,
    dual: o.dual !== undefined ? o.dual : base.dual,
    particleTrailSpacing: o.particleTrailSpacing ?? base.particleTrailSpacing,
  };
}

export function applyOverrides(base: BrushProgram, o: LabOverrides): BrushProgram {
  const candidate: BrushProgram = {
    ...base,
    tip: pickTip(base.tip, o),
    deposition: pickDeposition(base.deposition, o),
    paper: {
      ...base.paper,
      enabled: o.grain ?? base.paper.enabled,
      filter: o.filter ?? base.paper.filter,
      scale: o.paperScale ?? base.paper.scale,
      roughness: o.paperRoughness ?? base.paper.roughness,
      absorbency: o.paperAbsorbency ?? base.paper.absorbency,
    },
    strokeDynamics: {
      ...base.strokeDynamics,
      scatter: {
        ...base.strokeDynamics.scatter,
        positionPx: o.scatterPx ?? base.strokeDynamics.scatter.positionPx,
      },
    },
    colorDynamics: {
      ...base.colorDynamics,
      kmMixing: o.kmBeta ?? base.colorDynamics.kmMixing,
    },
    wet: o.wetBeta === undefined ? base.wet : o.wetBeta ? (base.wet ?? DEFAULT_WET_PARAMS) : null,
    input:
      o.stabilizer === undefined
        ? base.input
        : {
            ...base.input,
            oneEuro: {
              position: stabilizerToOneEuro(o.stabilizer),
              pressure: base.input.oneEuro?.pressure ?? { minCutoff: 5.0, beta: 0.02, dCutoff: 1.0 },
              tilt: base.input.oneEuro?.tilt ?? { minCutoff: 2.0, beta: 0.01, dCutoff: 1.0 },
            },
          },
  };
  return normalizeProgram(candidate);
}

/** 오버라이드가 하나라도 있는지. */
export function hasOverrides(o: LabOverrides): boolean {
  return Object.values(o).some((v) => v !== undefined);
}
