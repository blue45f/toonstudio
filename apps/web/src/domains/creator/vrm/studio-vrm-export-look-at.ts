/**
 * VRM 1.0 `VRMC_vrm.lookAt` 직렬화 — Three.js·DOM 없이 순수 데이터만 다룬다.
 *
 * `@pixiv/three-vrm` 3.5.5 의 `VRMLookAtLoaderPlugin` 은 이 객체가 없으면 시선을 만들지 않는다
 * (`if (!schemaLookAt) return null`). 그러면 lookUp·lookDown·lookLeft·lookRight 표정이 있어도 시선
 * 추적이 그 표정을 움직이지 못한다. VRoid Studio 출력 VRM 은 언제나 시선을 정의한다.
 *
 * 로더가 읽는 방식(같은 버전 기준):
 *  - `expression` 형식은 `rangeMapVerticalUp`·`rangeMapVerticalDown`·`rangeMapHorizontalOuter` 로
 *    lookUp·lookDown·lookLeft·lookRight 가중치를 정한다. 좌우는 `Outer` 하나만 쓴다.
 *  - 가중치(또는 `bone` 형식의 회전각)는 `outputScale × saturate(각도 / inputMaxValue)` 이고,
 *    `inputMaxValue` 가 0.01 보다 작으면 경고 뒤 0.01 로 올린다.
 *  - 시선 원점은 `offsetFromHeadBone` 에 raw head 노드의 matrixWorld 를 곱한 위치다.
 */

import { studioVrmExportError } from "./studio-vrm-export-error";

export type StudioVrmExportLookAtType = "bone" | "expression";

export interface StudioVrmExportLookAtRangeMap {
  /** 입력 각도의 상한(도). */
  readonly inputMaxValue: number;
  /** `bone` 은 눈 본 회전각(도), `expression` 은 표정 가중치(0~1). */
  readonly outputScale: number;
}

export interface StudioVrmExportLookAt {
  readonly type: StudioVrmExportLookAtType;
  /** head 본 로컬 좌표의 시선 원점(미터). */
  readonly offsetFromHeadBone: readonly [number, number, number];
  readonly rangeMapHorizontalInner: StudioVrmExportLookAtRangeMap;
  readonly rangeMapHorizontalOuter: StudioVrmExportLookAtRangeMap;
  readonly rangeMapVerticalDown: StudioVrmExportLookAtRangeMap;
  readonly rangeMapVerticalUp: StudioVrmExportLookAtRangeMap;
}

/** 시선 형식이 기대는 휴머노이드·표정. 확장 모듈과 순환하지 않도록 필요한 모양만 받는다. */
export interface StudioVrmExportLookAtContext {
  readonly humanoidBones: Readonly<Partial<Record<string, number>>>;
  readonly expressions?: { readonly preset?: Readonly<Partial<Record<string, unknown>>> };
}

const RANGE_MAP_KEYS = [
  "rangeMapHorizontalInner",
  "rangeMapHorizontalOuter",
  "rangeMapVerticalDown",
  "rangeMapVerticalUp",
] as const;
const LOOK_EXPRESSIONS = ["lookUp", "lookDown", "lookLeft", "lookRight"] as const;
/** three-vrm 의 `INPUT_MAX_VALUE_MINIMUM`. 이보다 작으면 로더가 경고하고 값을 바꾼다. */
const MIN_INPUT_DEGREES = 0.01;
const MAX_INPUT_DEGREES = 180;
const MAX_BONE_OUTPUT_DEGREES = 90;
const MAX_OFFSET_METERS = 1;

function finiteIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function buildRangeMap(raw: unknown, type: StudioVrmExportLookAtType): StudioVrmExportLookAtRangeMap {
  if (typeof raw !== "object" || raw === null) throw studioVrmExportError("look-at-invalid");
  const { inputMaxValue, outputScale } = raw as Partial<StudioVrmExportLookAtRangeMap>;
  const maxOutput = type === "expression" ? 1 : MAX_BONE_OUTPUT_DEGREES;
  if (!finiteIn(inputMaxValue, MIN_INPUT_DEGREES, MAX_INPUT_DEGREES) || !finiteIn(outputScale, 0, maxOutput)) {
    throw studioVrmExportError("look-at-invalid");
  }
  return { inputMaxValue, outputScale };
}

/**
 * `VRMC_vrm.lookAt` 객체를 만든다. 생략하면 `undefined`(키를 쓰지 않는다).
 * 형식이 기대는 대상이 없으면 거절한다 — `bone` 은 좌우 눈 본, `expression` 은 네 방향 시선 표정.
 */
export function buildStudioVrmExportLookAt(
  lookAt: StudioVrmExportLookAt | undefined,
  context: StudioVrmExportLookAtContext,
): Record<string, unknown> | undefined {
  if (lookAt === undefined) return undefined;
  if (typeof lookAt !== "object" || lookAt === null) throw studioVrmExportError("look-at-invalid");
  const { type, offsetFromHeadBone } = lookAt;
  if (type !== "bone" && type !== "expression") throw studioVrmExportError("look-at-invalid");
  if (
    !Array.isArray(offsetFromHeadBone) ||
    offsetFromHeadBone.length !== 3 ||
    !offsetFromHeadBone.every((value) => finiteIn(value, -MAX_OFFSET_METERS, MAX_OFFSET_METERS))
  ) {
    throw studioVrmExportError("look-at-invalid");
  }
  const ready = type === "bone"
    ? typeof context.humanoidBones.leftEye === "number" && typeof context.humanoidBones.rightEye === "number"
    : LOOK_EXPRESSIONS.every((name) => context.expressions?.preset?.[name] !== undefined);
  if (!ready) throw studioVrmExportError("look-at-invalid");

  const result: Record<string, unknown> = { type, offsetFromHeadBone: [...offsetFromHeadBone] };
  for (const key of RANGE_MAP_KEYS) result[key] = buildRangeMap(lookAt[key], type);
  return result;
}
