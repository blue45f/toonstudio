import { LaneUnavailableError } from "../engine/core/errors";

import type { Rgba } from "../engine/core/types";
import type { BrushProgram } from "../engine/presets/program-schema";
import type { BlendMode } from "../engine/raster/composite";

/**
 * Sumi `BrushProgram` → MyPaint(`.myb` v3) 설정 매핑. libmypaint 레인과 Hokusai 레인이 같은 문서를 쓴다
 * (Hokusai는 libmypaint v3 브러시 JSON을 그대로 파싱한다). 두 엔진 모두 같은 설정 이름·입력 곡선 어휘를 평가하므로
 * 같은 프로그램에서 같은 문서가 나오고, 엔진 차이만 A/B로 드러난다.
 *
 * 정직 규약(무음 손실 0):
 * - 대응이 분명한 필드만 옮긴다: 지름(`radius_logarithmic`), 경도(`hardness`), 흐름(`opaque`), 간격(`dabs_per_actual_radius`),
 *   시간 dab(`dabs_per_second`), 크기·흐름의 압력/난수 동역학, 색(HSV).
 * - 옮기지 못했거나 근사한 필드는 `MypaintMappingReceipt.unmapped`/`approximated`에 한글 사유로 남긴다. 호출자(레인)가
 *   `mappingReceipt()`로 노출한다.
 * - 이 엔진들에 대응 모델이 없는 매체(습식·유화 임파스토·smudge)는 근사하지 않고 `not-implemented`로 거부한다
 *   (`unsupportedProgramReason`, 렌더 인스턴싱 비교 레인과 같은 규약).
 * - 설정 이름과 입력 이름은 `.myb` 포맷 식별자다. 브러시 파일·수치 데이터는 가져오지 않았고 프로그램에서 계산한다.
 */

export type MypaintCurvePoint = [number, number];

export interface MypaintSettingDocument {
  base_value: number;
  inputs: Record<string, MypaintCurvePoint[]>;
}

/** `.myb` v3 문서의 설정부(`@toonstudio/studio-brush-platform`의 `LibMypaintBrushDocument`와 구조가 같다). */
export interface MypaintBrushDocument {
  settings: Record<string, MypaintSettingDocument>;
}

/** 획 레이어를 문서에 합성하는 방식(엔진 밖). Sumi의 합성 규약(`engine/raster/composite.ts`)을 그대로 쓴다. */
export interface MypaintCompose {
  opacity: number;
  blend: BlendMode;
}

export interface MypaintMappingReceipt {
  /** 옮긴 필드(프로그램 필드 → 설정). */
  mapped: string[];
  /** 근사해서 옮긴 필드와 근사 방식. */
  approximated: string[];
  /** 엔진에 반영하지 못한 필드와 사유. */
  unmapped: string[];
}

export interface MypaintMapping {
  document: MypaintBrushDocument;
  compose: MypaintCompose;
  receipt: MypaintMappingReceipt;
}

export interface MypaintMapOptions {
  /** 획 색(sRGB straight). 기본 검정 불투명(Sumi 기본 획 색과 같다). */
  color?: Rgba;
}

/** 압력/난수 곡선을 옮길 때의 표본 수(크기는 로그 공간에서 구간 선형이라 조밀하게 잡는다). */
const SIZE_CURVE_POINTS = 9;
/** 크기 배율 하한. ln(0)을 피하기 위한 값이며 하한에 걸리면 근사로 기록한다. */
const MIN_SIZE_MULTIPLIER = 1 / 64;
/** dabs_per_actual_radius 상한(간격이 지나치게 촘촘한 프로그램이 wasm을 멈추지 않게). */
const MAX_DABS_PER_RADIUS = 24;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function evalLut(curve: readonly number[], t: number): number {
  const n = curve.length;
  if (n === 0) return 0;
  if (n === 1) return curve[0] ?? 0;
  const x = clamp01(t) * (n - 1);
  const lo = Math.floor(x);
  const hi = Math.min(n - 1, lo + 1);
  const a = curve[lo] ?? 0;
  const b = curve[hi] ?? a;
  return a + (b - a) * (x - lo);
}

/** Sumi 매핑 평가식: min + (max − min)·curve(t). */
function evalMapping(m: BrushProgram["strokeDynamics"]["size"][number], t: number): number {
  return m.min + (m.max - m.min) * evalLut(m.curve, t);
}

/**
 * Sumi 경도 → 엔진 경도. 두 엔진의 dab 불투명도 곡선이 다르므로(코어 + 선형 램프 vs 제곱 반경 2구간 선형) 같은 이름의 수치를 그대로 쓰지 않고
 * 불투명도 0.5가 되는 반경(정규화 제곱 반경 rr0)이 같아지는 엔진 경도를 푼다.
 * - Sumi 건식: 가장자리 램프 폭 (1−h)·R → 반 불투명 반경 (1+h)/2·R → rr0 = ((1+h)/2)².
 * - Sumi airbrush: 가우시안 exp(−2·dn²) → rr0 = ln2/2.
 * - 엔진: 불투명도 1(중심) → h(rr = h) → 0(rr = 1)의 구간 선형. 불투명도 0.5 조건을 풀면 rr0 ≤ 0.5이면 h = rr0/(rr0+0.5), 아니면 h = 0.5/(1.5−rr0).
 * 결과는 [1/3, 1]이다(엔진은 경도 0에서 dab이 사라지므로 이 하한은 오히려 안전하다).
 */
export function equivalentHardness(program: BrushProgram): number {
  const h = clamp01(program.tip.hardness);
  const rr0 = program.deposition.model === "airbrush" ? Math.LN2 / 2 : ((1 + h) / 2) ** 2;
  return rr0 <= 0.5 ? rr0 / (rr0 + 0.5) : 0.5 / (1.5 - rr0);
}

/** sRGB straight(0..1) → HSV(각 0..1). */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

/**
 * 이 엔진들이 근사 없이 표현할 수 없는 프로그램이면 한글 사유, 아니면 null.
 * 레인은 `beginStroke`에서 이 사유로 `LaneUnavailableError("not-implemented")`를 던진다.
 */
export function unsupportedProgramReason(program: BrushProgram): string | null {
  const model = program.deposition.model;
  if (model === "impasto") {
    return `임파스토(${program.id})는 이 엔진에 높이장·조명 모델이 없어 근사하지 않고 거부한다`;
  }
  if (model === "wet-flow" || program.wet !== null) {
    return `습식 매체(${program.id}, deposition.model=${model})는 이 엔진에 물 확산·안료 이동 모델이 없어 근사하지 않고 거부한다`;
  }
  if (model === "smudge") {
    return `smudge(${program.id})는 획을 격리된 획 레이어에서 그리므로 문서의 기존 색을 집어 올릴 수 없어 거부한다 (문서 위 직접 그리기가 필요하다)`;
  }
  return null;
}

/** 거부 대상이면 `LaneUnavailableError("not-implemented")`를 던진다(레인 id를 details에 남긴다). */
export function assertProgramSupported(laneId: string, program: BrushProgram): void {
  const reason = unsupportedProgramReason(program);
  if (reason) throw new LaneUnavailableError("not-implemented", reason, { laneId, presetId: program.id });
}

interface CurvedMappings {
  /** 입력 이름 → 곡선 점. */
  inputs: Record<string, MypaintCurvePoint[]>;
  /** 입력 상수 항(`constant` 입력과 곡선 없는 매핑의 기준값)의 곱. */
  constantFactor: number;
  /** 이 설정으로 옮기지 못한 매핑 설명. */
  skipped: string[];
  /** 배율 하한에 걸린 횟수. */
  floored: boolean;
}

/** 크기/흐름 매핑(곱 규약) 중 pressure·random·constant만 입력별 곡선으로 분해한다. */
function splitMappings(
  mappings: readonly BrushProgram["strokeDynamics"]["size"][number][],
  group: string,
): { byInput: Map<"pressure" | "random", BrushProgram["strokeDynamics"]["size"][number][]>; constant: number; skipped: string[] } {
  const byInput = new Map<"pressure" | "random", BrushProgram["strokeDynamics"]["size"][number][]>();
  let constant = 1;
  const skipped: string[] = [];
  for (const m of mappings) {
    if (m.input === "pressure" || m.input === "random") {
      const list = byInput.get(m.input) ?? [];
      list.push(m);
      byInput.set(m.input, list);
    } else if (m.input === "constant") {
      constant *= evalMapping(m, 1);
    } else {
      skipped.push(`${group}[${m.input}]`);
    }
  }
  return { byInput, constant, skipped };
}

function sizeCurves(mappings: readonly BrushProgram["strokeDynamics"]["size"][number][]): CurvedMappings {
  const { byInput, constant, skipped } = splitMappings(mappings, "strokeDynamics.size");
  const inputs: Record<string, MypaintCurvePoint[]> = {};
  let floored = false;
  for (const [input, list] of byInput) {
    const points: MypaintCurvePoint[] = [];
    for (let i = 0; i < SIZE_CURVE_POINTS; i += 1) {
      const t = i / (SIZE_CURVE_POINTS - 1);
      let multiplier = 1;
      for (const m of list) multiplier *= evalMapping(m, t);
      if (multiplier < MIN_SIZE_MULTIPLIER) {
        floored = true;
        multiplier = MIN_SIZE_MULTIPLIER;
      }
      // libmypaint는 입력 곡선 값을 기준값에 더한다. 반경은 지수(exp)로 쓰이므로 배율의 로그가 더해질 양이다.
      points.push([t, Math.log(multiplier)]);
    }
    inputs[input] = points;
  }
  return { inputs, constantFactor: constant, skipped, floored };
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/** 프로그램에서 활성인(기본값이 아닌) 미대응 기능을 사유와 함께 모은다. */
function collectUnmapped(program: BrushProgram, skippedMappings: readonly string[]): string[] {
  const out: string[] = [];
  out.push("program.input: Sumi 입력 파이프라인(1€ 필터·코너 보존·예측)은 적용하지 않고 원시 표본을 엔진에 그대로 공급한다");
  if (program.physics.contact !== "none") {
    out.push(`physics.contact=${program.physics.contact}: 팁 접촉 물리(압력·속도 → 발자국·침착 변조)는 엔진에 대응 모델이 없다`);
  }
  if (program.paper.enabled) out.push("paper: 종이 그레인은 이 엔진 코어에 질감 모델이 없어 평평한 종이로 그린다");
  if (program.edge.taperStartPx > 0 || program.edge.taperEndPx > 0) {
    out.push(`edge.taperStartPx/taperEndPx(${program.edge.taperStartPx}/${program.edge.taperEndPx}): 획 시작·끝 테이퍼 없음`);
  }
  if (program.edge.wetEdge > 0) out.push(`edge.wetEdge=${program.edge.wetEdge}: 가장자리 습식 강조 없음`);
  if (program.edge.dryBreakup > 0) out.push(`edge.dryBreakup=${program.edge.dryBreakup}: 갈필(끊김) 없음`);
  const cd = program.colorDynamics;
  if (cd.hueJitter > 0 || cd.satJitter > 0 || cd.valJitter > 0) out.push("colorDynamics: 색 지터는 반영하지 않는다(단일 색)");
  if (cd.kmMixing) out.push("colorDynamics.kmMixing: Kubelka-Munk 혼색은 이 엔진에 없다");
  const sc = program.strokeDynamics.scatter;
  if (sc.positionPx > 0 || sc.angleRad > 0 || sc.scale > 0 || sc.countJitter > 0) out.push("strokeDynamics.scatter: dab 산포는 반영하지 않는다");
  if (program.strokeDynamics.rotationFollow !== "none") {
    out.push(`strokeDynamics.rotationFollow=${program.strokeDynamics.rotationFollow}: 팁 회전 추종은 반영하지 않는다`);
  }
  if (program.deposition.dual) out.push("deposition.dual: 이중 팁은 반영하지 않는다");
  if (program.tip.aspect !== 1 || program.tip.angleRad !== 0) {
    out.push(`tip.aspect/angleRad(${program.tip.aspect}/${program.tip.angleRad}): 타원 팁은 반영하지 않고 원형 dab로 그린다`);
  }
  for (const s of skippedMappings) out.push(`${s}: 이 입력은 엔진 입력 축과 단위가 달라 옮기지 않았다(pressure·random·constant만 대응)`);
  return out;
}

/**
 * 프로그램 → `.myb` 설정 문서 + 합성 규약 + 영수증. 거부 대상이어도 호출은 가능하다(문서는 계산하되 거부는 레인이 한다).
 */
export function mapProgramToMypaint(program: BrushProgram, opts: MypaintMapOptions = {}): MypaintMapping {
  const mapped: string[] = [];
  const approximated: string[] = [];
  const settings: Record<string, MypaintSettingDocument> = {};
  const put = (name: string, base: number, inputs: Record<string, MypaintCurvePoint[]> = {}): void => {
    settings[name] = { base_value: round6(base), inputs };
  };

  // 지름 → 반경 로그. 크기 동역학의 상수 항과 입력 곡선(pressure·random)을 같이 옮긴다.
  const size = sizeCurves(program.strokeDynamics.size);
  const radiusPx = Math.max(0.1, (program.tip.sizePx / 2) * size.constantFactor);
  put("radius_logarithmic", Math.log(radiusPx), size.inputs);
  mapped.push("tip.sizePx → radius_logarithmic(ln 반경)");
  const sizeInputs = Object.keys(size.inputs);
  if (sizeInputs.length > 0) {
    mapped.push(`strokeDynamics.size[${sizeInputs.join(",")}] → radius_logarithmic 입력 곡선(배율의 로그, ${SIZE_CURVE_POINTS}점)`);
    approximated.push("strokeDynamics.size: Sumi는 배율을 선형 보간하고 엔진은 로그 공간에서 보간한다(9점 표본으로 근사)");
  }
  if (size.floored) approximated.push(`strokeDynamics.size: 배율 ${MIN_SIZE_MULTIPLIER} 미만은 하한으로 올렸다`);

  put("hardness", equivalentHardness(program));
  mapped.push("tip.hardness → hardness(반투명 반경 일치 등가 경도)");
  approximated.push(
    "tip.hardness: 경도 곡선 모양이 다르다(Sumi는 반경 방향 선형 가장자리 램프, 엔진은 제곱 반경 2구간 선형이라 낮은 경도에서 뾰족한 중심+옅은 후광이 된다). dab 불투명도 0.5가 되는 반경을 맞추는 등가 경도로 옮겼다",
  );

  // 흐름: 기준값은 opaque, 압력/난수 동역학은 opaque_multiply(0 기준, 곱 규약).
  const flowSplit = splitMappings(program.strokeDynamics.flow, "strokeDynamics.flow");
  const flowBase = clamp01(program.deposition.flow * flowSplit.constant);
  put("opaque", flowBase);
  mapped.push("deposition.flow → opaque");
  const flowInputs: Record<string, MypaintCurvePoint[]> = {};
  for (const [input, list] of flowSplit.byInput) {
    const n = Math.max(2, ...list.map((m) => m.curve.length));
    const points: MypaintCurvePoint[] = [];
    for (let i = 0; i < n; i += 1) {
      const t = i / (n - 1);
      let multiplier = 1;
      for (const m of list) multiplier *= evalMapping(m, t);
      points.push([t, round6(clamp01(multiplier))]);
    }
    flowInputs[input] = points;
  }
  if (Object.keys(flowInputs).length > 0) {
    put("opaque_multiply", 0, flowInputs);
    mapped.push(`strokeDynamics.flow[${Object.keys(flowInputs).join(",")}] → opaque_multiply 입력 곡선`);
    approximated.push("strokeDynamics.flow: 배율을 0..1로 제한했다(엔진 불투명도 범위)");
  }
  // Sumi는 dab별 흐름이 그대로 누적된다. libmypaint의 opaque_linearize(획 길이에 맞춘 보정)는 끈다.
  put("opaque_linearize", 0);
  mapped.push("누적 규약 → opaque_linearize=0(dab별 흐름 그대로 누적)");

  // 간격: Sumi는 간격 = spacing × 최대 반경, 엔진은 반경 / dabs_per_actual_radius.
  const perRadius = Math.min(MAX_DABS_PER_RADIUS, 1 / Math.max(program.deposition.spacing, 1 / MAX_DABS_PER_RADIUS));
  put("dabs_per_basic_radius", 0);
  put("dabs_per_actual_radius", perRadius);
  mapped.push("deposition.spacing → dabs_per_actual_radius(1/spacing)");
  if (program.deposition.spacing < 1 / MAX_DABS_PER_RADIUS) approximated.push(`deposition.spacing: 반경당 dab ${MAX_DABS_PER_RADIUS}개로 상한`);
  put("dabs_per_second", program.deposition.timeDabsPerSecond);
  if (program.deposition.timeDabsPerSecond > 0) {
    mapped.push("deposition.timeDabsPerSecond → dabs_per_second");
    approximated.push("deposition.timeDabsPerSecond: Sumi는 간격에 비례한 가상 거리, 엔진은 초당 dab 수(개념만 같다)");
  }
  put("anti_aliasing", 1);

  // 색(HSV 0..1). Sumi 프로그램에는 기본 색이 없어 레인 옵션(기본 검정)을 쓴다.
  const color = opts.color ?? [0, 0, 0, 1];
  const [h, s, v] = rgbToHsv(clamp01(color[0]), clamp01(color[1]), clamp01(color[2]));
  put("color_h", h);
  put("color_s", s);
  put("color_v", v);
  mapped.push("레인 색 옵션(sRGB) → color_h/s/v");

  const blend = program.deposition.blend;
  const compose: MypaintCompose = { opacity: clamp01(program.deposition.opacity * clamp01(color[3])), blend };
  mapped.push(`deposition.opacity/blend(${blend}) → 획 레이어 합성(엔진 밖, Sumi composite 규약)`);
  approximated.push("deposition.opacity: Sumi는 획 알파 상한, 여기서는 획 레이어에 곱한다(획 내부 누적 포화 후 곱이라 같은 결과가 아닐 수 있다)");
  if (blend === "erase") {
    approximated.push("deposition.blend=erase: 엔진 eraser 설정이 아니라 획 레이어를 destination-out으로 합성한다");
  }
  if (program.deposition.model === "bristle" || program.tip.kind !== "round") {
    approximated.push(`tip.kind=${program.tip.kind}/deposition.model=${program.deposition.model}: 팁 마스크·붓털 모델 없이 원형 dab으로 근사`);
  }

  return {
    document: { settings },
    compose,
    receipt: { mapped, approximated, unmapped: collectUnmapped(program, [...size.skipped, ...flowSplit.skipped]) },
  };
}
