import { Pcg32 } from "../../engine/core/rng";
import { evaluateMappingProduct } from "../../engine/dynamics/mapping-curves";
import { PHYSICS_DT_MS, PhysicsModel } from "../../engine/physics/physics-model";
import { PressureCurveTable } from "../../engine/physics/world2d/pressure-curve";

import type { ModeledSample } from "../../engine/core/types";
import type { DynamicMapping } from "../../engine/dynamics/mapping-curves";
import type { BrushProgram } from "../../engine/presets/program-schema";

/**
 * 프리셋 → 붓털 합성 응답(BL-4a).
 *
 * 붓털 레인은 예전에 프로그램에서 팁 지름과 흐름만 옮겼다. 그래서 압력을 바꿔도 굵기가 거의 안 변했고(벌어짐 곡선 하나가 전부),
 * 붓펜과 목탄처럼 지름이 같은 프리셋은 같은 선이 나왔다. 이 모듈은 프로그램의 **접촉 물리(`physics.contact`)·크기 동역학·
 * 흐름 동역학·종이 그레인·팁 경도**를 압력의 함수로 한 번 풀어서 표로 만든다.
 *
 * - 접촉 반폭 H(p): 엔진 `PhysicsModel`을 압력 p로 고정해 정상 상태까지 돌린 발자국 반경 rx × 압력에 묶인 크기 동역학 곱.
 *   cpu-reference가 같은 프로그램에서 내는 선 반폭과 같은 값이라 두 레인의 필압 폭 범위가 비교 가능하다.
 * - 그레인 g(p): 흑연·목탄 계열은 `stepGraphite`의 요철 채움(1 − fill), 그 밖의 종이 켠 프리셋은 1 − p·pressureInfluence.
 * - 흐름 배율 f(p): 흐름 동역학의 압력 매핑 곱. 없으면 null(합성기가 일반 압력 이득을 쓴다).
 *
 * 압력 외 입력(속도·기울기·무작위·획 진행)을 쓰는 동역학은 평가하지 않고 `unmappedInputsKo`로 드러낸다(근사하지 않는다).
 * 결정적이다: 난수·시각 없이 같은 프로그램이면 같은 표가 나온다.
 */

/** 표의 압력 표본 수(0.03125 간격). */
export const PRESET_RESPONSE_SAMPLES = 33;
/** 정상 상태로 보는 고정 틱 수(240 Hz × 0.5 s). 이력(hysteresis) 상수가 40 ms라 충분하다. */
const SETTLE_TICKS = 120;
/** 접촉 반폭 상한(px). 이 이상은 붓털 월드가 감당하는 벌어짐을 넘는다. */
export const PRESET_MAX_HALF_WIDTH_PX = 128;
/** 접촉 반폭 하한(px). 크기 동역학이 0을 줘도 선이 사라지지 않게 한다. */
export const PRESET_MIN_HALF_WIDTH_PX = 0.05;

export interface BristlePresetResponse {
  /** 압력 → 접촉 반폭(px). */
  halfWidthPx: PressureCurveTable;
  /** 압력 → dab 그레인 변조 강도 0..1. 종이·흑연 그레인이 없으면 null. */
  grain: PressureCurveTable | null;
  /** 압력 → 흐름 배율 0..1. 흐름 동역학이 없으면 null. */
  flowScale: PressureCurveTable | null;
  /** dab 경도(프로그램 팁 경도). */
  hardness: number;
  /** dab 초타원 지수(프로그램 팁). */
  shapeExp: number;
  /** 평가하지 못한 동역학(압력 외 입력) 설명(한글). */
  unmappedInputsKo: string[];
  /** 반폭이 상한에 걸려 잘렸으면 true. */
  halfWidthClamped: boolean;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 압력만 보는 매핑(또는 상수)과 그렇지 않은 매핑으로 나눈다. */
function splitMappings(mappings: readonly DynamicMapping[]): { pressureOnly: DynamicMapping[]; others: DynamicMapping[] } {
  const pressureOnly: DynamicMapping[] = [];
  const others: DynamicMapping[] = [];
  for (const m of mappings) (m.input === "pressure" || m.input === "constant" ? pressureOnly : others).push(m);
  return { pressureOnly, others };
}

function steadySample(pressure: number, phase: ModeledSample["phase"], index: number): ModeledSample {
  return {
    x: 0,
    y: 0,
    tMs: index * PHYSICS_DT_MS,
    inputTMs: index * PHYSICS_DT_MS,
    pressure,
    velocity: 0,
    altitudeDeg: 90,
    azimuthDeg: 0,
    dirX: 1,
    dirY: 0,
    curvature: 0,
    phase,
    source: "raw",
    sourceIndex: index,
  };
}

function build(program: BrushProgram): BristlePresetResponse {
  const spec = program.physics;
  const paperOn = program.paper.enabled;
  const size = splitMappings(program.strokeDynamics.size);
  const flow = splitMappings(program.strokeDynamics.flow);
  const rng = new Pcg32(1, 1);
  const half: number[] = [];
  const grain: number[] = [];
  const flows: number[] = [];
  let clamped = false;
  let anyGrain = false;
  const graphiteGrain = spec.contact === "graphite" || (spec.contact === "none" && spec.graphite !== undefined);
  for (let i = 0; i < PRESET_RESPONSE_SAMPLES; i += 1) {
    const p = i / (PRESET_RESPONSE_SAMPLES - 1);
    const model = new PhysicsModel(spec, null, 1, { tipRadiusPx: program.tip.sizePx / 2, paperSpec: null });
    let fp = model.step(steadySample(p, "down", 0), PHYSICS_DT_MS);
    for (let k = 1; k < SETTLE_TICKS; k += 1) fp = model.step(steadySample(p, "move", k), PHYSICS_DT_MS);
    const probe = steadySample(p, "move", 0);
    const sizeScale = Math.max(0, evaluateMappingProduct(size.pressureOnly, probe, 0, rng));
    const raw = fp.rx * sizeScale;
    if (raw > PRESET_MAX_HALF_WIDTH_PX) clamped = true;
    half.push(Math.min(PRESET_MAX_HALF_WIDTH_PX, Math.max(PRESET_MIN_HALF_WIDTH_PX, raw)));
    // 그레인: 흑연 계열은 접촉 모델의 요철 채움, 그 밖에는 종이가 켜졌을 때 압력이 높을수록 덜 변조된다(`PhysicsModel`의 종이 규약과 같은 식).
    let g = 0;
    if (graphiteGrain) g = clamp01(fp.grain);
    else if (paperOn) g = clamp01(1 - p * program.paper.pressureInfluence);
    if (!paperOn && !graphiteGrain) g = 0;
    if (g > 0) anyGrain = true;
    grain.push(g);
    flows.push(clamp01(evaluateMappingProduct(flow.pressureOnly, probe, 0, rng)));
  }
  const unmapped: string[] = [];
  if (size.others.length > 0) unmapped.push(`크기 동역학의 ${size.others.map((m) => m.input).join("·")} 입력(압력 외 입력은 평가하지 않는다)`);
  if (flow.others.length > 0) unmapped.push(`흐름 동역학의 ${flow.others.map((m) => m.input).join("·")} 입력(압력 외 입력은 평가하지 않는다)`);
  return {
    halfWidthPx: new PressureCurveTable(half),
    grain: anyGrain ? new PressureCurveTable(grain) : null,
    flowScale: flow.pressureOnly.length > 0 ? new PressureCurveTable(flows) : null,
    hardness: program.tip.hardness,
    shapeExp: program.tip.shapeExp,
    unmappedInputsKo: unmapped,
    halfWidthClamped: clamped,
  };
}

const cache = new WeakMap<BrushProgram, BristlePresetResponse>();

/** 프로그램의 붓털 합성 응답. 같은 프로그램 객체는 한 번만 풀고 다시 쓴다(표는 읽기 전용). */
export function bristlePresetResponse(program: BrushProgram): BristlePresetResponse {
  const hit = cache.get(program);
  if (hit) return hit;
  const built = build(program);
  cache.set(program, built);
  return built;
}
