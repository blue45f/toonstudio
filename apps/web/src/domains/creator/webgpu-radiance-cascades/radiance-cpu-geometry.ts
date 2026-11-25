import type { SceneOccluder } from "./radiance-cascades-engine";
import { assertCoordinate, assertOccluder, assertOccluderSet } from "./radiance-input-contract";

function clampNum(value: number, lo: number, hi: number, fallback: number): number { return Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback; }
function round3(value: number): number { return Math.round(value * 1000) / 1000; }

/** 단일 2D 차폐체(원·캡슐·둥근 사각형)의 정확한 부호 거리(SDF)를 계산한다. */
export function occluderSdfUnchecked(px: number, py: number, occ: SceneOccluder): number {
  if (occ.shape === "circle") return Math.hypot(px - occ.x, py - occ.y) - occ.radius;
  if (occ.shape === "capsule") {
    const pax = px - occ.x; const pay = py - occ.y;
    const bax = (occ.x2 ?? occ.x) - occ.x; const bay = (occ.y2 ?? occ.y) - occ.y;
    const lengthSquared = bax * bax + bay * bay;
    const h = lengthSquared === 0 ? 0 : clampNum((pax * bax + pay * bay) / lengthSquared, 0, 1, 0);
    return Math.hypot(pax - bax * h, pay - bay * h) - occ.radius;
  }
  const qx = Math.abs(px - occ.x) - Math.max(0, (occ.halfW ?? occ.radius) - occ.radius);
  const qy = Math.abs(py - occ.y) - Math.max(0, (occ.halfH ?? occ.radius) - occ.radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - occ.radius;
}

/** 씬 전체 차폐체 집합에 대한 최소 2D SDF와 최근접 차폐체를 계산한다. */
export function sceneSdfUnchecked(px: number, py: number, occluders: readonly SceneOccluder[]): { readonly distance: number; readonly nearest: SceneOccluder } {
  let bestDist = Infinity; let bestOcc = occluders[0];
  if (!bestOcc) throw new Error("최근접 질의에는 차폐체가 필요합니다.");
  for (const occ of occluders) { const d = occluderSdfUnchecked(px, py, occ); if (d < bestDist) { bestDist = d; bestOcc = occ; } }
  return { distance: bestDist, nearest: bestOcc };
}

/** 2D SDF 스피어 트레이싱으로 광원 방향 부드러운 반그림자(Penumbra) 가시도를 실측 계산한다. */
export function shadowUnchecked(ox: number, oy: number, lx: number, ly: number, lightRadius: number, penumbraSoftness: number, occluders: readonly SceneOccluder[]): number {
  if (occluders.length === 0) return 1;
  const dx = lx - ox; const dy = ly - oy; const maxDist = Math.hypot(dx, dy);
  if (maxDist <= 0.008) return 1;
  const dirX = dx / maxDist; const dirY = dy / maxDist;
  const k = (18 - 15.2 * clampNum(penumbraSoftness, 0.1, 1, 0.62)) / Math.max(lightRadius * 14, 0.35);
  let visibility = 1; let t = 0.014;
  for (let step = 0; step < 24; step += 1) {
    if (t >= maxDist - lightRadius * 0.5) break;
    const { distance: d } = sceneSdfUnchecked(ox + dirX * t, oy + dirY * t, occluders);
    if (d < 0.0015) return 0;
    visibility = Math.min(visibility, clampNum((k * d) / Math.max(t, 0.008), 0, 1, 1));
    t += clampNum(d, 0.008, 0.065, 0.02);
  }
  return round3(clampNum(visibility, 0, 1, 0));
}

/** 공개 질의는 검증하고, 고정 격자의 내부 반복은 사전 검증된 도형만 계산한다. */
export function evaluateOccluderSdf2d(px: number, py: number, occ: SceneOccluder): number {
  assertCoordinate(px); assertCoordinate(py); assertOccluder(occ); return occluderSdfUnchecked(px, py, occ);
}
export function evaluateSceneSdf2d(px: number, py: number, occluders: readonly SceneOccluder[]) {
  assertCoordinate(px); assertCoordinate(py); assertOccluderSet(occluders); return sceneSdfUnchecked(px, py, occluders);
}
export function traceSoftShadow2d(ox: number, oy: number, lx: number, ly: number, lightRadius: number, penumbraSoftness: number, occluders: readonly SceneOccluder[]): number {
  [ox, oy, lx, ly, lightRadius, penumbraSoftness].forEach(assertCoordinate); assertOccluderSet(occluders, true);
  if (lightRadius < 0) throw new RangeError("광원 반경은 음수일 수 없습니다.");
  return shadowUnchecked(ox, oy, lx, ly, lightRadius, penumbraSoftness, occluders);
}
