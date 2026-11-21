/**
 * 눈 4파츠(안구·홍채·동공·하이라이트) × 좌우 × 스타일. 안구는 UV 구, 나머지는 안구 구면 위 타원 캡 디스크다.
 * `eyes` 프리셋(6종)은 안구 비율·속눈썹을, `irises` 프리셋(5종)은 홍채 각반경·동공 모양·하이라이트 배치를 정한다.
 * 모든 좌표는 머리 프레임을 거쳐 모델 공간으로 나오며 오른눈은 왼눈의 x 거울이다.
 */
import { HEAD_LANDMARKS, headLocalToWorld, type HeadFrame } from "../proportions";

import { mergeTriMeshes, mirrorTriMeshX, sphericalDisc, uvSphere, type TriMesh } from "./tri-mesh";

import type { EyesStyleId, IrisStyleId } from "../../../contracts";
import type { Vec2, Vec3 } from "../../../shared/math";

export type EyeSide = "left" | "right";
export const EYE_SIDES: readonly EyeSide[] = ["left", "right"];

export interface EyeStyleSpec {
  readonly labelKo: string;
  /** 안구 축별 배율(x, y, z) */
  readonly eyeballScale: Vec3;
  /** 속눈썹 길이(머리 로컬) */
  readonly lashLength: number;
  /** 속눈썹 말림(앞으로 기울임 비율) */
  readonly lashCurl: number;
  /** 속눈썹 호 각 범위(rad, 중심 기준 ±) */
  readonly lashArc: number;
}

export const EYE_STYLE_SPECS: Readonly<Record<EyesStyleId, EyeStyleSpec>> = {
  almond: { labelKo: "아몬드", eyeballScale: [1, 1, 1], lashLength: 0.115, lashCurl: 0.56, lashArc: 1.08 },
  round: { labelKo: "둥근", eyeballScale: [1.1, 1.16, 1.05], lashLength: 0.125, lashCurl: 0.6, lashArc: 1.16 },
  droopy: { labelKo: "처진", eyeballScale: [1.04, 1.02, 1.01], lashLength: 0.125, lashCurl: 0.38, lashArc: 1.12 },
  upturned: { labelKo: "올라간", eyeballScale: [1.02, 1.02, 1.01], lashLength: 0.13, lashCurl: 0.74, lashArc: 1.02 },
  narrow: { labelKo: "가는", eyeballScale: [1.06, 0.86, 0.99], lashLength: 0.095, lashCurl: 0.46, lashArc: 1.18 },
  wide: { labelKo: "큰", eyeballScale: [1.14, 1.22, 1.07], lashLength: 0.14, lashCurl: 0.64, lashArc: 1.12 },
};

export interface IrisHighlightSpec {
  /** 홍채 중심 기준 각 오프셋(rad): x=바깥쪽, y=위 */
  readonly offset: Vec2;
  readonly angularRadius: number;
  /** 세로 종횡비(기본 1.0 — 한국 웹툰 캐치라이트 물방울/타원 광택 표현) */
  readonly aspectY?: number;
}

export interface IrisStyleSpec {
  readonly labelKo: string;
  readonly irisAngularRadius: number;
  /** 한국 웹툰 세로 타원 홍채 비율(기본 1.12 — 크고 생기 있는 세로형 홍채) */
  readonly irisAspectY: number;
  /** 동공 각반경 비율(홍채 대비, x·y) */
  readonly pupilRatio: Vec2;
  readonly highlights: readonly IrisHighlightSpec[];
}

export const IRIS_STYLE_SPECS: Readonly<Record<IrisStyleId, IrisStyleSpec>> = {
  "round-large": {
    labelKo: "크고 둥근",
    irisAngularRadius: 0.64,
    irisAspectY: 1.14,
    pupilRatio: [0.44, 0.48],
    highlights: [
      { offset: [-0.21, 0.24], angularRadius: 0.145, aspectY: 1.15 },
      { offset: [0.19, -0.22], angularRadius: 0.068, aspectY: 0.9 },
    ],
  },
  "round-small": {
    labelKo: "작고 둥근",
    irisAngularRadius: 0.5,
    irisAspectY: 1.08,
    pupilRatio: [0.42, 0.45],
    highlights: [
      { offset: [-0.16, 0.18], angularRadius: 0.095, aspectY: 1.1 },
      { offset: [0.14, -0.16], angularRadius: 0.048, aspectY: 0.9 },
    ],
  },
  cat: {
    labelKo: "고양이",
    irisAngularRadius: 0.6,
    irisAspectY: 1.1,
    pupilRatio: [0.16, 0.72],
    highlights: [
      { offset: [-0.19, 0.22], angularRadius: 0.11, aspectY: 1.18 },
      { offset: [0.17, -0.19], angularRadius: 0.055, aspectY: 0.92 },
    ],
  },
  "star-highlight": {
    labelKo: "별 하이라이트",
    irisAngularRadius: 0.64,
    irisAspectY: 1.15,
    pupilRatio: [0.4, 0.44],
    highlights: [
      { offset: [-0.21, 0.23], angularRadius: 0.15, aspectY: 1.16 },
      { offset: [0.2, -0.2], angularRadius: 0.08, aspectY: 1.0 },
      { offset: [0.02, 0.33], angularRadius: 0.055, aspectY: 1.0 },
    ],
  },
  "soft-gradient": {
    labelKo: "부드러운 그라데이션",
    irisAngularRadius: 0.66,
    irisAspectY: 1.14,
    pupilRatio: [0.46, 0.5],
    highlights: [
      { offset: [-0.22, 0.25], angularRadius: 0.16, aspectY: 1.14 },
      { offset: [0.18, -0.22], angularRadius: 0.072, aspectY: 0.88 },
    ],
  },
};

export function sideSign(side: EyeSide): number {
  return side === "left" ? 1 : -1;
}

/** 안구 중심(모델 공간) */
export function eyeCenter(frame: HeadFrame, side: EyeSide): Vec3 {
  const e = HEAD_LANDMARKS.eye;
  return headLocalToWorld(frame, [sideSign(side) * e[0], e[1], e[2]]);
}

export function eyeballRadius(frame: HeadFrame): number {
  return HEAD_LANDMARKS.eyeballRadius * frame.scale;
}

/** 오른쪽은 왼쪽 메시의 정확한 x 거울(정점 대응 유지) */
function sided(side: EyeSide, left: TriMesh): TriMesh {
  return side === "left" ? left : mirrorTriMeshX(left);
}

export function buildEyeball(frame: HeadFrame, side: EyeSide, style: EyesStyleId): TriMesh {
  const spec = EYE_STYLE_SPECS[style];
  const r = eyeballRadius(frame);
  return sided(
    side,
    uvSphere({
      center: eyeCenter(frame, "left"),
      radii: [r * spec.eyeballScale[0], r * spec.eyeballScale[1], r * spec.eyeballScale[2]],
      longitudes: 20,
      latitudes: 14,
    }),
  );
}

const UP: Vec3 = [0, 1, 0];

function disc(frame: HeadFrame, side: EyeSide, style: EyesStyleId, lift: number, angularX: number, angularY: number, offset: Vec2): TriMesh {
  const spec = EYE_STYLE_SPECS[style];
  const r = eyeballRadius(frame) * spec.eyeballScale[2] * lift;
  // 오프셋은 구면 위 회전으로 근사: forward를 오프셋만큼 기울인다(왼눈 기준, x 양수 = 바깥쪽).
  const ox = offset[0];
  const oy = offset[1];
  const forward: Vec3 = [Math.sin(ox), Math.sin(oy), Math.cos(ox) * Math.cos(oy)];
  const len = Math.hypot(forward[0], forward[1], forward[2]);
  return sided(
    side,
    sphericalDisc({
      center: eyeCenter(frame, "left"),
      radius: r,
      forward: [forward[0] / len, forward[1] / len, forward[2] / len],
      up: UP,
      angularRadiusX: angularX,
      angularRadiusY: angularY,
      segments: 32,
      rings: 5,
    }),
  );
}

export function buildIris(frame: HeadFrame, side: EyeSide, eyes: EyesStyleId, iris: IrisStyleId): TriMesh {
  const spec = IRIS_STYLE_SPECS[iris];
  return disc(frame, side, eyes, 1.004, spec.irisAngularRadius, spec.irisAngularRadius * spec.irisAspectY, [0, 0]);
}

export function buildPupil(frame: HeadFrame, side: EyeSide, eyes: EyesStyleId, iris: IrisStyleId): TriMesh {
  const spec = IRIS_STYLE_SPECS[iris];
  return disc(
    frame,
    side,
    eyes,
    1.008,
    spec.irisAngularRadius * spec.pupilRatio[0],
    spec.irisAngularRadius * spec.irisAspectY * spec.pupilRatio[1],
    [0, 0],
  );
}

export function buildEyeHighlight(frame: HeadFrame, side: EyeSide, eyes: EyesStyleId, iris: IrisStyleId): TriMesh {
  const spec = IRIS_STYLE_SPECS[iris];
  return mergeTriMeshes(
    spec.highlights.map((h) => disc(frame, side, eyes, 1.012, h.angularRadius, h.angularRadius * (h.aspectY ?? 1), h.offset)),
  );
}
