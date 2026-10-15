/**
 * SketchUp 단위·크기 정규화 — OpenSKP 출력 기준의 보정 배율과 크기 이상 판정.
 *
 * 사실 근거(openskp 1.3.0 README "Coordinate systems and units"):
 * - SketchUp 은 모델을 항상 "인치, Z-up"으로 저장한다. 사용자가 화면에서 보는 단위(밀리미터 등)는
 *   표시 설정일 뿐이라 저장 값에 영향을 주지 않는다.
 * - buildScene()/toGLB() 는 인치 값에 0.0254 를 곱한 미터, Y-up 으로 이미 바꿔 준다.
 *   그래서 이 모듈은 인치→미터 변환을 다시 하지 않는다. 사용자가 고르는 단위는 "원본 숫자 1이
 *   실제로 무엇을 뜻했는가"이며, OpenSKP 가 이미 곱한 0.0254 를 기준(1배)으로 한 상대 배율만 만든다.
 *
 * 이 값들은 studio-bg3d-model-scale-contract 의 "로더가 가장 긴 변을 2로 맞춘다"는 규칙과 충돌하지
 * 않는다. 로더 정규화는 크기와 무관하게 적용되므로, 이 모듈의 보정은 보관되는 GLB 의 실제 크기
 * (보고서·DCC 보내기·실제 크기 배치가 읽는 값)를 바로잡는 역할만 한다.
 */

import {
  STUDIO_BG3D_SKP_PLAUSIBLE_MAX_METERS,
  STUDIO_BG3D_SKP_PLAUSIBLE_MIN_METERS,
  STUDIO_BG3D_SKP_SIZE_TOO_LARGE_METERS,
  STUDIO_BG3D_SKP_SIZE_TOO_SMALL_METERS,
} from "./studio-bg3d-skp-contract";

export const STUDIO_BG3D_SKP_UNITS = ["m", "cm", "mm", "inch"] as const;
export type StudioBg3dSkpUnit = (typeof STUDIO_BG3D_SKP_UNITS)[number];

/** SketchUp 이 내부에 저장하는 기본 단위이자 OpenSKP 가 가정하는 단위. 이 단위는 보정이 없다(1배). */
export const STUDIO_BG3D_SKP_DEFAULT_UNIT: StudioBg3dSkpUnit = "inch";

/** 원본 숫자 1 이 몇 미터를 뜻하는가. */
export const STUDIO_BG3D_SKP_UNIT_METERS: Readonly<Record<StudioBg3dSkpUnit, number>> = Object.freeze({
  m: 1,
  cm: 0.01,
  mm: 0.001,
  inch: 0.0254,
});

export const STUDIO_BG3D_SKP_UNIT_LABELS: Readonly<Record<StudioBg3dSkpUnit, string>> = Object.freeze({
  m: "미터(m)",
  cm: "센티미터(cm)",
  mm: "밀리미터(mm)",
  inch: "인치(in)",
});

export function isStudioBg3dSkpUnit(value: unknown): value is StudioBg3dSkpUnit {
  return typeof value === "string" && (STUDIO_BG3D_SKP_UNITS as readonly string[]).includes(value);
}

/** OpenSKP 출력(인치 가정)에 곱할 배율. 인치는 정확히 1 이다. */
export function studioBg3dSkpUnitScaleFactor(unit: StudioBg3dSkpUnit): number {
  if (unit === STUDIO_BG3D_SKP_DEFAULT_UNIT) return 1;
  return STUDIO_BG3D_SKP_UNIT_METERS[unit] / STUDIO_BG3D_SKP_UNIT_METERS[STUDIO_BG3D_SKP_DEFAULT_UNIT];
}

export type StudioBg3dSkpSizeLevel = "ok" | "too-small" | "too-large";
export type StudioBg3dSkpSizeVector = readonly [number, number, number];

export function maxStudioBg3dSkpExtent(size: StudioBg3dSkpSizeVector): number {
  return Math.max(Math.abs(size[0]), Math.abs(size[1]), Math.abs(size[2]));
}

/** 가장 긴 변(미터)이 수 mm 미만이면 too-small, 수 km 이상이면 too-large. NaN 은 too-small, +Infinity 는 too-large. */
export function classifyStudioBg3dSkpMaxExtent(maxExtentMeters: number): StudioBg3dSkpSizeLevel {
  if (Number.isNaN(maxExtentMeters) || maxExtentMeters < STUDIO_BG3D_SKP_SIZE_TOO_SMALL_METERS) {
    return "too-small";
  }
  return maxExtentMeters >= STUDIO_BG3D_SKP_SIZE_TOO_LARGE_METERS ? "too-large" : "ok";
}

export function scaleStudioBg3dSkpSize(
  size: StudioBg3dSkpSizeVector,
  factor: number,
): readonly [number, number, number] {
  return [size[0] * factor, size[1] * factor, size[2] * factor];
}

export interface StudioBg3dSkpUnitCandidate {
  readonly unit: StudioBg3dSkpUnit;
  readonly scaleFactor: number;
  readonly sizeMeters: readonly [number, number, number];
  readonly maxExtentMeters: number;
  /** 이 단위로 해석하면 웹툰 배경 소품~거리 규모(0.05m–500m)에 드는가. */
  readonly plausible: boolean;
}

export interface StudioBg3dSkpSizeAssessment {
  readonly level: StudioBg3dSkpSizeLevel;
  readonly maxExtentMeters: number;
  readonly candidates: readonly StudioBg3dSkpUnitCandidate[];
  /** 크기가 이상할 때만 값이 있다. 파일이 선언한 단위가 그럴듯하면 그 단위를 우선한다. */
  readonly recommendedUnit: StudioBg3dSkpUnit | null;
}

function isPlausibleExtent(maxExtentMeters: number): boolean {
  return Number.isFinite(maxExtentMeters)
    && maxExtentMeters >= STUDIO_BG3D_SKP_PLAUSIBLE_MIN_METERS
    && maxExtentMeters <= STUDIO_BG3D_SKP_PLAUSIBLE_MAX_METERS;
}

/** 후보 중 3m(방·소품 사이 크기)에 로그 거리가 가장 가까운 것을 고른다. 동률이면 STUDIO_BG3D_SKP_UNITS 순서. */
function pickNearestPlausible(candidates: readonly StudioBg3dSkpUnitCandidate[]): StudioBg3dSkpUnit | null {
  let best: StudioBg3dSkpUnitCandidate | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (!candidate.plausible) continue;
    const distance = Math.abs(Math.log(candidate.maxExtentMeters / 3));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best?.unit ?? null;
}

/**
 * OpenSKP 가 돌려준 크기(미터, 인치 가정)를 평가한다. 후보는 항상 m/cm/mm/inch 네 가지이며,
 * 각 후보의 크기는 "원본 숫자가 그 단위였다면" 얻는 크기다.
 * @param openSkpSizeMeters OpenSKP 출력 그대로의 크기(보정 전)
 * @param declaredUnit 파일이 선언한 단위 중 m/cm/mm/inch 로 대응되는 값(추천 우선순위에만 쓴다)
 */
export function assessStudioBg3dSkpSize(
  openSkpSizeMeters: StudioBg3dSkpSizeVector,
  declaredUnit: StudioBg3dSkpUnit | null = null,
): StudioBg3dSkpSizeAssessment {
  const rawExtent = maxStudioBg3dSkpExtent(openSkpSizeMeters);
  const candidates = STUDIO_BG3D_SKP_UNITS.map((unit): StudioBg3dSkpUnitCandidate => {
    const scaleFactor = studioBg3dSkpUnitScaleFactor(unit);
    const sizeMeters = scaleStudioBg3dSkpSize(openSkpSizeMeters, scaleFactor);
    const maxExtentMeters = rawExtent * scaleFactor;
    return { unit, scaleFactor, sizeMeters, maxExtentMeters, plausible: isPlausibleExtent(maxExtentMeters) };
  });
  const level = classifyStudioBg3dSkpMaxExtent(rawExtent);
  let recommendedUnit: StudioBg3dSkpUnit | null = null;
  if (level !== "ok") {
    const declared = declaredUnit === null
      ? undefined
      : candidates.find((candidate) => candidate.unit === declaredUnit && candidate.plausible);
    recommendedUnit = declared?.unit ?? pickNearestPlausible(candidates);
  }
  return { level, maxExtentMeters: rawExtent, candidates, recommendedUnit };
}

export interface StudioBg3dSkpDeclaredUnits {
  /** 파일에 적힌 단위 문자열 원문(제어 문자 제거·길이 제한). 읽지 못하면 null. */
  readonly raw: string | null;
  /** 한글 표기. 알아보지 못한 표기이면 null. */
  readonly label: string | null;
  /** m/cm/mm/inch 에 대응하면 그 단위, 피트·야드처럼 대응하지 않으면 null. */
  readonly unit: StudioBg3dSkpUnit | null;
}

const DECLARED_UNIT_RULES: readonly {
  readonly pattern: RegExp;
  readonly label: string;
  readonly unit: StudioBg3dSkpUnit | null;
}[] = [
  { pattern: /^(?:millimet|mm\b)/iu, label: "밀리미터", unit: "mm" },
  { pattern: /^(?:centimet|cm\b)/iu, label: "센티미터", unit: "cm" },
  { pattern: /^(?:met(?:er|re)|m$)/iu, label: "미터", unit: "m" },
  { pattern: /^(?:inch|in$)/iu, label: "인치", unit: "inch" },
  { pattern: /^(?:decimal\s*)?(?:feet|foot|ft\b)/iu, label: "피트", unit: null },
  { pattern: /^yard/iu, label: "야드", unit: null },
];

const MAX_DECLARED_UNIT_CODE_POINTS = 40;

function cleanDeclaredUnitText(value: string): string | null {
  const cleaned = Array.from(value.normalize("NFC"))
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 0x1f && !(codePoint >= 0x7f && codePoint <= 0x9f);
    })
    .slice(0, MAX_DECLARED_UNIT_CODE_POINTS)
    .join("")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * SkpModel.units(VFF 2021+ 파일의 meta 영역에서 읽는 표시 단위 문자열)를 해석한다.
 * 레거시 파일은 이 값이 없어 raw 가 null 이다. 표시용 정보이며 크기 계산에는 쓰지 않는다.
 */
export function describeStudioBg3dSkpDeclaredUnits(raw: unknown): StudioBg3dSkpDeclaredUnits {
  const none: StudioBg3dSkpDeclaredUnits = { raw: null, label: null, unit: null };
  if (typeof raw !== "string") return none;
  const text = cleanDeclaredUnitText(raw);
  if (text === null) return none;
  const rule = DECLARED_UNIT_RULES.find((candidate) => candidate.pattern.test(text));
  return { raw: text, label: rule?.label ?? null, unit: rule?.unit ?? null };
}
