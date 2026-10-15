import { bristleContactRadiusPx, bristleSpreadRadiusPx, resolveBristleBrushConfig } from "../../engine/physics/world2d/bristle-brush";
import { PressureCurveTable, pressureCurveById } from "../../engine/physics/world2d/pressure-curve";

import { PRESET_MAX_HALF_WIDTH_PX, bristlePresetResponse } from "./bristle-preset-response";

import type { BristleBrushConfig } from "../../engine/physics/world2d/bristle-brush";
import type { PressureCurveId } from "../../engine/physics/world2d/pressure-curve";
import type { BrushProgram } from "../../engine/presets/program-schema";

/**
 * 프로그램 → 붓털 설정/흐름 매핑(합성기가 쓰는 응답 표).
 *
 * `bristle-dab-synthesis.ts`의 합성기·레인 뼈대와 분리한 순수 매핑부다(소스 크기 래칫).
 * 옮기는 필드와 옮기지 못한 필드는 `mappedKo`·`unmappedKo` 한글 영수증으로 드러낸다(근사하지 않는다).
 */

/** dab 반경 / 털 접촉 반경. */
export const BRISTLE_DAB_RADIUS_SCALE = 0.95;
/** 털 수 √N으로 나누는 기본 흐름 계수(털이 많을수록 겹침이 늘어 dab당 흐름을 줄인다). */
export const BRISTLE_FLOW_GAIN = 1.8;
/** 벌어짐 반경 한계(px). */
const MIN_RADIUS_PX = 1.5;
const MAX_RADIUS_PX = 64;
/** 프리셋 응답을 쓸 때 dab 반경의 하한(px): 아주 좁은 선(낮은 필압의 G펜)도 알파가 남는 최소 크기. */
export const BRISTLE_MIN_DAB_RADIUS_PX = 0.7;
/** 프리셋 응답을 쓸 때 겹친 dab가 만드는 목표 농도의 상한(1이면 로그가 발산한다). */
export const BRISTLE_MAX_TARGET_ALPHA = 0.97;
/** 몸체 반경을 정하는 기준 압력(낮은 필압): 이 압력의 다발에 털 몸체가 겹치지 않고 들어가야 좁은 선이 나온다. */
export const BRISTLE_BODY_REFERENCE_PRESSURE = 0.15;
/** 털 몸체 반경의 하한(px). */
const MIN_BODY_RADIUS_PX = 0.05;

/**
 * 털 N올 다발에서 dab 반경 / 벌어짐 반경 비율: 털 접촉 반경 공식(0.5·√(π/N)·1.07)에 dab 반경 배율을 곱한 값.
 * 벌어짐 반경 R일 때 선 반폭은 R + 이 비율 × R이다.
 */
export function bristleFillRatio(count: number): number {
  return 0.5 * Math.sqrt(Math.PI / count) * 1.07 * BRISTLE_DAB_RADIUS_SCALE;
}

/** 접촉 반폭 H를 벌어짐 반경 R과 dab 반경 r(= max(최소, κR))의 합으로 나눈다(연속). */
function slotRadiusForHalfWidth(halfWidthPx: number, fillRatio: number): number {
  const proportional = halfWidthPx / (1 + fillRatio);
  if (fillRatio * proportional >= BRISTLE_MIN_DAB_RADIUS_PX) return proportional;
  return Math.max(0, halfWidthPx - BRISTLE_MIN_DAB_RADIUS_PX);
}

/** 레인 생성 옵션. */
export interface BristleLaneOptions {
  /** 털 수. 기본 32(자체 PBD는 N ≤ 32를 권한다). */
  bristles?: number;
  /** 압력 → 벌어짐 곡선. 기본 `power-fit`(단조), `buckling-3d`는 3D 좌굴의 비단조를 흉내 낸다. */
  spreadCurve?: PressureCurveId;
  /** 붓털 설정 덮어쓰기(실험·시험용). */
  brush?: Partial<BristleBrushConfig>;
  /** 방향 출처. 기본 `velocity`(손잡이 속도 방향), `tilt`는 표본 기울기가 0이 아닐 때 그 방위각. */
  headingSource?: "velocity" | "tilt";
}

const CURVE_LABEL_KO: Readonly<Record<PressureCurveId, string>> = {
  "power-fit": "power-fit(단조 거듭제곱)",
  "buckling-3d": "buckling-3d(좌굴 비단조 표)",
  linear: "linear(선형 0.45→1)",
};

/** 프리셋에서 풀어낸 dab 합성 응답(`BristleDabSynthesizer`가 쓴다). 없으면 합성기는 예전 규약(고정 반경·경도 0.85·그레인 0)을 따른다. */
export interface BristleDabResponse {
  /** dab 반경 / 벌어짐 반경. */
  fillRatio: number;
  /** dab 반경 하한(px). */
  minRadiusPx: number;
  hardness: number;
  shapeExp: number;
  /** 프로그램 흐름(`deposition.flow`). 겹친 dab가 만드는 목표 농도의 기준이다. */
  programFlow: number;
  /** 압력 → 그레인 변조 강도. 없으면 0. */
  grain: PressureCurveTable | null;
  /** 압력 → 흐름 배율. 없으면 1(cpu-reference와 같이 압력으로 농도를 바꾸지 않는다). */
  flowScale: PressureCurveTable | null;
  /** 프로그램의 건조 끊김(dryBreakup 0..1). 적재량이 줄수록 dab가 확률적으로 빠진다. */
  dryBreakup: number;
}

/** 프로그램 → 붓털 설정/흐름 매핑. */
export interface BristleProgramMapping {
  config: BristleBrushConfig;
  /** 프리셋 응답에서 얻은 dab 합성 규약. */
  dabResponse: BristleDabResponse;
  /** dab당 기준 흐름(적재량·압력을 곱하기 전). */
  baseFlow: number;
  mappedKo: string[];
  unmappedKo: string[];
  /** 근사로 허용했지만 결과가 원래 프로그램과 눈에 띄게 다를 수 있다는 경고(모델 이름 포함). 비어 있으면 경고할 근사가 없다. */
  notesKo: string[];
}

/**
 * 이 모델로 근사 없이 표현할 수 없는 프로그램이면 한글 사유, 아니면 null.
 *
 * 붓털 레인은 항상 **둥근 dab**를 찍으므로 (a) 의미가 둥근 dab 누적과 크게 다른 프로그램은 근사하지 않고 거부한다(ADR-0018):
 * 습식·임파스토·smudge·지우개(문서/수분 모델 필요), 스프레이·하프톤(산포·망점 패턴), 산포·점·해치 팁, 특수 효과(fx) 계열.
 * (b) 둥근 dab로 어느 정도 흉내 낼 수 있는 모델(에어브러시, 질감 팁의 건식 도장, 털 모델)은 허용하되 `mapProgramToBristle`이
 * 모델 이름을 적은 `notesKo`·`unmappedKo`로 근사 사실을 영수증에 남긴다.
 */
export function unsupportedBristleReason(program: BrushProgram): string | null {
  const model = program.deposition.model;
  if (model === "wet-flow") return `습식 흐름(${program.id})은 붓털 레인에 수분·안료 확산 모델이 없어 근사하지 않고 거부한다`;
  if (model === "impasto") return `임파스토(${program.id})는 붓털 레인에 높이장·조명 모델이 없어 근사하지 않고 거부한다`;
  if (model === "smudge") return `smudge(${program.id})는 붓털 dab가 문서의 기존 색을 집어 올리지 못해 거부한다`;
  if (model === "eraser" || program.deposition.blend === "erase") return `지우개(${program.id})는 붓털 dab로 문서를 지울 수 없어 거부한다`;
  if (model === "spray") return `스프레이(${program.id}, spray)는 입자 산포 모델이 붓털 레인에 없고 둥근 dab로 그리면 전혀 다른 그림이 되어 근사하지 않고 거부한다`;
  if (model === "hatch-halftone") return `하프톤·망점(${program.id}, hatch-halftone)은 규칙적 망점 패턴 모델이 붓털 레인에 없고 둥근 dab로 그리면 전혀 다른 그림이 되어 근사하지 않고 거부한다`;
  const tip = program.tip.kind;
  if (tip === "particle" || tip === "stipple" || tip === "hatch") {
    return `${tip} 팁(${program.id})은 산포·점·해치 패턴을 찍는 팁이라 붓털 레인의 둥근 dab로 근사하지 않고 거부한다`;
  }
  if (program.family === "special") return `특수 효과(fx) 계열(${program.id})은 산포·색상 지터·질감 팁이 정체성이라 붓털 레인의 둥근 dab로 근사하지 않고 거부한다`;
  return null;
}

/**
 * 압력 → 슬롯 반경 추가 배율 표: 프리셋 접촉 반폭 H(p)에서 dab 반경을 뺀 슬롯 반경 R(p)를 `radiusPx × power-fit(p)`로 나눈 값.
 * 물리 곡선(`spreadCurve`)이 power-fit이면 슬롯 반경이 R(p) 그대로이고, 좌굴·선형 곡선이면 그 곡선이 power-fit과 다른 비율만큼 R(p)를 늘리거나 줄인다.
 */
function presetSpreadScale(halfWidth: PressureCurveTable, radiusPx: number, fillRatio: number): PressureCurveTable {
  const reference = pressureCurveById("power-fit");
  const n = 101;
  const values: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const p = i / (n - 1);
    const slot = slotRadiusForHalfWidth(halfWidth.eval(p), fillRatio);
    values.push(slot / (radiusPx * Math.max(reference.eval(p), 1e-6)));
  }
  return new PressureCurveTable(values);
}

/** 프로그램과 레인 옵션으로 붓털 설정을 만든다. 팁 지름 → 벌어짐 반경, 프리셋 접촉 응답 → 압력 곡선, 흐름 → dab 기준 흐름. */
export function mapProgramToBristle(program: BrushProgram, options: BristleLaneOptions = {}): BristleProgramMapping {
  const count = options.bristles ?? 32;
  const radiusPx = Math.min(MAX_RADIUS_PX, Math.max(MIN_RADIUS_PX, program.tip.sizePx / 2));
  // 요청한 곡선을 이름 그대로 적용한다(모르는 이름은 pressureCurveById가 RangeError — 조용히 기본 곡선으로 바꾸지 않는다).
  const curveId: PressureCurveId = options.spreadCurve ?? "power-fit";
  const physical = pressureCurveById(curveId);
  const response = bristlePresetResponse(program);
  const fillRatio = bristleFillRatio(count);
  const spreadScaleCurve = presetSpreadScale(response.halfWidthPx, radiusPx, fillRatio);
  // 털 몸체 반경: 낮은 필압의 다발에 겹치지 않고 들어가야 한다(몸체가 압력 0.4 기준으로 크면 N올 패킹이 선 폭의 하한이 된다).
  const unitConfig = resolveBristleBrushConfig({ count, radiusPx, spreadCurve: physical, spreadScaleCurve, bristleRadiusScale: 1 });
  const unit = bristleContactRadiusPx(unitConfig);
  const low = bristleSpreadRadiusPx(unitConfig, BRISTLE_BODY_REFERENCE_PRESSURE);
  const mid = bristleSpreadRadiusPx(unitConfig, 0.4);
  const rawScale = mid > 1e-6 ? low / mid : 1;
  const bodyScale = Math.min(1, Math.max(MIN_BODY_RADIUS_PX / Math.max(unit, 1e-6), rawScale, 0.02));
  const config = resolveBristleBrushConfig({ count, radiusPx, spreadCurve: physical, spreadScaleCurve, bristleRadiusScale: bodyScale, ...options.brush });
  const baseFlow = Math.min(0.6, Math.max(0.002, (program.deposition.flow * BRISTLE_FLOW_GAIN) / Math.sqrt(count)));
  const curveName = CURVE_LABEL_KO[curveId];
  const model = program.deposition.model;
  const tipKind = program.tip.kind;
  const halfLo = response.halfWidthPx.eval(0.15);
  const halfHi = response.halfWidthPx.eval(1);
  const dabResponse: BristleDabResponse = {
    fillRatio,
    minRadiusPx: BRISTLE_MIN_DAB_RADIUS_PX,
    hardness: response.hardness,
    shapeExp: response.shapeExp,
    programFlow: program.deposition.flow,
    grain: response.grain,
    flowScale: response.flowScale,
    dryBreakup: program.edge.dryBreakup,
  };
  const unmappedKo = [
    `팁 종류 ${tipKind}·종횡비 ${program.tip.aspect}·각도(dab는 항상 둥글다. 팁 경도 ${program.tip.hardness}와 초타원 지수만 옮긴다)`,
    "프리셋의 dab 간격(spacing) 설정(간격은 현재 dab 반경에 비례하는 고정 비율)·산포·테이퍼·색 동역학(지터)",
    response.grain
      ? "종이 결 위상·질감 팁 형상(그레인 응답 강도만 압력 표로 옮기고 결 자체는 표면의 종이 필드가 준다)"
      : "종이 그레인·질감(이 프리셋은 종이·흑연 그레인이 없어 dab의 그레인 응답은 0)",
    "습식 매체 파라미터·종이 마찰 흐름 손실",
  ];
  for (const text of response.unmappedInputsKo) unmappedKo.push(text);
  const notesKo: string[] = [];
  if (response.halfWidthClamped) notesKo.push(`접촉 반폭이 상한 ${PRESET_MAX_HALF_WIDTH_PX}px를 넘어 잘렸다 — 압력이 높을 때 선이 cpu-reference보다 좁다`);
  if (model === "airbrush") {
    unmappedKo.push(`에어브러시 모델(airbrush, ${program.id}): 가장자리가 부드러운 누적 도포·초당 dab 발사(timeDabsPerSecond)가 없다`);
    notesKo.push(`에어브러시(${program.id}, airbrush)를 둥근 털 dab로 근사했다 — 가장자리가 더 단단하고 농도가 cpu-reference와 다를 수 있다`);
  } else if (model === "bristle") {
    unmappedKo.push(`bristle 모델(${program.id}): 팁의 털 가닥 무늬(${tipKind})를 쓰지 않고 물리 붓털 다발(${count}올)이 대신 표현한다 — 가닥 수·간격은 일치하지 않는다`);
  }
  if (tipKind === "texture-stamp" || tipKind === "noise" || tipKind === "flat") {
    notesKo.push(`${tipKind} 팁(${program.id})의 모양·질감은 쓰지 않고 둥근 털 dab로 그렸다 — 도장 질감·납작한 폭이 사라진다(경도·그레인 응답은 반영)`);
  }
  return {
    config,
    dabResponse,
    baseFlow,
    mappedKo: [
      `팁 지름 ${program.tip.sizePx}px, 접촉 모델 ${program.physics.contact}·크기 동역학 → 압력 0.15 선 반폭 ${halfLo.toFixed(2)}px, 압력 1 선 반폭 ${halfHi.toFixed(2)}px(cpu-reference와 같은 값), 털 ${count}올, 털 몸체 반경 ${bristleContactRadiusPx(config).toFixed(2)}px`,
      `압력 → 벌어짐 곡선 ${curveName}(프리셋 반폭 표를 얹음), 압력 → 강성 배율 ${config.stiffnessLevels}단계`,
      `dab 반경 = max(${BRISTLE_MIN_DAB_RADIUS_PX}px, ${fillRatio.toFixed(3)} × 현재 벌어짐 반경), 경도 ${program.tip.hardness}`,
      `흐름 ${program.deposition.flow} → 겹친 dab의 목표 농도 = 흐름 × ${response.flowScale ? "프리셋 흐름 동역학(압력 표)" : "1(압력으로 농도를 바꾸지 않는다)"} × 적재량, dab 하나의 흐름은 털 ${count}올이 선 폭 안에서 겹치는 깊이로 나눠 겹친 합이 목표 농도가 되게 한다(기준 흐름 ${baseFlow.toFixed(3)}은 응답이 없는 합성기의 예전 규약용)`,
      ...(response.grain ? ["종이·흑연 그레인 → dab 그레인 응답(압력 표)"] : []),
      "불투명도·블렌드는 엔진 표면의 획 합성(cpu-reference와 같은 경로)이 그대로 적용한다",
      "손잡이 속도 → dab 농도(빠를수록 최대 65% 옅게)·간격(최대 1.6배 성글게)·방향 타원(장축 1.12·단축 0.9, 50 px/s 이상에서 진행 방향 추종)",
      ...(program.edge.dryBreakup > 0
        ? [`건조 끊김 ${program.edge.dryBreakup}(적재량이 줄수록 dab가 확률적으로 빠진다 — 마른 붓 질감)`]
        : []),
      "획 색 옵션(sRGB) → 선형 premultiplied dab 색",
    ],
    unmappedKo,
    notesKo,
  };
}
