/**
 * 눈썹·속눈썹: 호를 따라가는 얇은 리본 슬래브(닫힌 로프트 튜브 + 캡). 머리 표면 함수(head-cage.ts)에 붙여 배치한다.
 * 눈썹은 좌우를 한 파츠로, 속눈썹은 눈 스타일별 좌우 각각 한 파츠로 만든다.
 */
import { v3Add, v3Cross, v3Normalize, v3Scale, v3Sub, type Vec3 } from "../../../shared/math";
import { HEAD_LANDMARKS, headLocalToWorld, type HeadFrame } from "../proportions";

import { EYE_STYLE_SPECS, eyeCenter, eyeballRadius, type EyeSide } from "./eye-builder";
import { headSurfacePoint } from "./head-cage";
import { loftTriTube, mergeTriMeshes, mirrorTriMeshX, type TriMesh } from "./tri-mesh";

import type { EyesStyleId } from "../../../contracts";

export const BROW_SEGMENTS = 14;
export const LASH_SEGMENTS = 18;

/** 눈 스타일별 한국 웹툰 상단 아이라인·속눈썹 윙(눈꼬리) 곡선 프로파일 */
const LASH_WING_PROFILE: Readonly<Record<EyesStyleId, { readonly archLift: number; readonly wingLift: number; readonly wingExtend: number; readonly thickness: number }>> = {
  almond: { archLift: 0.08, wingLift: 0.06, wingExtend: 0.14, thickness: 1.15 },
  round: { archLift: 0.16, wingLift: 0.03, wingExtend: 0.1, thickness: 1.25 },
  droopy: { archLift: 0.06, wingLift: -0.1, wingExtend: 0.14, thickness: 1.12 },
  upturned: { archLift: 0.09, wingLift: 0.16, wingExtend: 0.2, thickness: 1.22 },
  narrow: { archLift: 0.02, wingLift: 0.07, wingExtend: 0.18, thickness: 1.05 },
  wide: { archLift: 0.18, wingLift: 0.08, wingExtend: 0.15, thickness: 1.32 },
};

/** 표면 위 점: 방향 dir의 머리 표면을 lift배 밖으로 */
function surfaceAt(frame: HeadFrame, localDir: Vec3, lift: number): Vec3 {
  const p = headSurfacePoint(v3Normalize(localDir));
  return headLocalToWorld(frame, v3Scale(p, lift));
}

/** 리본 슬래브 링: 중심 c, 폭 방향 w(반폭 길이 포함), 두께 방향 t */
function slabRing(c: Vec3, w: Vec3, t: Vec3): Vec3[] {
  return [v3Sub(v3Sub(c, w), t), v3Add(v3Sub(c, w), t), v3Add(v3Add(c, w), t), v3Sub(v3Add(c, w), t)];
}

function browSide(frame: HeadFrame): TriMesh {
  const b = HEAD_LANDMARKS.brow;
  const rings: Vec3[][] = [];
  for (let i = 0; i <= BROW_SEGMENTS; i += 1) {
    const u = i / BROW_SEGMENTS;
    // 한국 웹툰 세련된 일자-세미아치 눈썹: 안쪽(x 0.11) → 2/3 지점 완만한 산 → 가늘게 빠지는 눈썹꼬리(x 0.62)
    const x = 0.11 + 0.51 * u;
    const peak = Math.sin(Math.PI * Math.pow(u, 0.85));
    const arch = 0.075 * peak - 0.055 * u * u;
    const y = b[1] + arch;
    const z = b[2] - 0.24 * u * u;
    const c = surfaceAt(frame, [x, y, z], 1.014);
    const normal = v3Normalize(v3Sub(c, frame.center));
    // 앞머리는 부드럽고 중간이 가장 선명, 꼬리로 갈수록 날렵하게 테이퍼링
    const tailTaper = u > 0.65 ? Math.max(0.18, 1 - ((u - 0.65) / 0.35) * 0.82) : 0.72 + 0.28 * Math.sin((Math.PI * u) / 0.65);
    const halfWidth = 0.04 * frame.scale * tailTaper;
    const thickness = 0.011 * frame.scale * (0.65 + 0.35 * tailTaper);
    const up: Vec3 = v3Normalize(v3Cross(v3Cross(normal, [0, 1, 0]), normal));
    rings.push(slabRing(c, v3Scale(up, halfWidth), v3Scale(normal, thickness)));
  }
  const first = rings[0];
  const last = rings[rings.length - 1];
  const centroid = (ring: readonly Vec3[]): Vec3 => v3Scale(ring.reduce<Vec3>((acc, p) => v3Add(acc, p), [0, 0, 0]), 1 / ring.length);
  return loftTriTube(rings, { capStart: centroid(first), capEnd: centroid(last), uvRect: { u0: 0, v0: 0, u1: 0.5, v1: 1 } });
}

/** 눈썹(좌우 합침, 오른쪽은 왼쪽의 x 거울) */
export function buildBrows(frame: HeadFrame): TriMesh {
  const left = browSide(frame);
  return mergeTriMeshes([left, mirrorTriMeshX(left)]);
}

/** 속눈썹: 한국 웹툰 상단 아이라인·속눈썹 아치(안쪽 얇게 → 중앙 도톰한 아치 → 눈꼬리 윙) */
export function buildLash(frame: HeadFrame, side: EyeSide, style: EyesStyleId): TriMesh {
  const left = buildLeftLash(frame, style);
  return side === "left" ? left : mirrorTriMeshX(left);
}

function buildLeftLash(frame: HeadFrame, style: EyesStyleId): TriMesh {
  const spec = EYE_STYLE_SPECS[style];
  const wing = LASH_WING_PROFILE[style];
  const center = eyeCenter(frame, "left");
  const r = eyeballRadius(frame) * 1.075;
  const rings: Vec3[][] = [];
  for (let i = 0; i <= LASH_SEGMENTS; i += 1) {
    const u = i / LASH_SEGMENTS;
    // 각: 왼눈 기준 u=0(바깥 눈꼬리, x+) ←→ u=1(안쪽 눈머리, x-) — theta = PI/2 + arc*(u - 0.5)
    // cos(theta)는 u=0일 때 양수(바깥쪽), u=1일 때 음수(안쪽)
    const outerWeight = Math.max(0, 1 - u / 0.35);
    const wingCurve = outerWeight * outerWeight;
    const archCurve = Math.sin(Math.PI * u);
    const theta = Math.PI / 2 + spec.lashArc * (u - 0.5) - wing.wingExtend * wingCurve;
    const radial: Vec3 = [
      Math.cos(theta) * (1 + 0.08 * wingCurve),
      Math.sin(theta) + wing.archLift * archCurve + wing.wingLift * wingCurve,
      0.38 + 0.06 * archCurve,
    ];
    const rn = v3Normalize(radial);
    const c = v3Add(center, v3Scale(rn, r * (1 + 0.035 * wingCurve)));
    // 중앙~바깥쪽(u 0.15~0.55)에 선명한 상단 속눈썹 볼륨, 양 끝은 날렵하게 수렴
    const archBold = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.88)), 0.72);
    const taper = 0.28 + 0.72 * archBold + 0.14 * wingCurve * (1 - outerWeight * 0.65);
    const length = spec.lashLength * frame.scale * taper;
    const outward: Vec3 = v3Normalize([
      rn[0] * (1 - spec.lashCurl * 0.85) + 0.16 * wingCurve,
      rn[1] * (1 - spec.lashCurl * 0.45) + wing.wingLift * 0.5 * wingCurve,
      0.36 + spec.lashCurl,
    ]);
    const tangent = v3Normalize(v3Cross(rn, [0, 0, 1]));
    const halfWidth = 0.0046 * wing.thickness * frame.scale * (0.45 + 0.75 * taper);
    const ring = slabRing(v3Add(c, v3Scale(outward, length / 2)), v3Scale(tangent, halfWidth), v3Scale(outward, length / 2));
    rings.push(ring);
  }
  const centroid = (ring: readonly Vec3[]): Vec3 => v3Scale(ring.reduce<Vec3>((acc, p) => v3Add(acc, p), [0, 0, 0]), 1 / ring.length);
  return loftTriTube(rings, { capStart: centroid(rings[0]), capEnd: centroid(rings[rings.length - 1]) });
}
