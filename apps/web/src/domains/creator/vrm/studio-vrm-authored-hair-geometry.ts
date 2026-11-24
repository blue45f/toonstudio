import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { avatarForgeHairTipMix } from "./studio-vrm-avatar-forge-hair-color";
import { smoothStudioVrmCoincidentNormals } from "./studio-vrm-custom-part-material";
import {
  evaluateStudioVrmHairHighlightRing,
  fitStudioVrmHairScalpVertex,
  type StudioVrmHairScalpFitOptions,
} from "./studio-vrm-hair-hand-equip-refiner";

import type { AvatarForgeHairPart } from "./studio-vrm-avatar-forge";

/**
 * 가닥을 곧은 행렬 대신 굽은 중심선을 따라 까는 배치(앞머리). 곧은 가닥은 볼록한 이마를 가운데서
 * 파고들거나, 피하려고 띄우면 뿌리가 캡 밖으로 나와 짧은 세모로만 보였다(2026-10-23 접촉 시트).
 * 점·법선은 머리 본 로컬이고 `t = i / (n − 1)` 로 뿌리(0)→끝(1)을 고르게 나눈다.
 */
export type StudioVrmAuthoredHairSpine = Readonly<{
  points: readonly THREE.Vector3[];
  /** 가닥 앞면이 바라보는 방향(단위). 중심선 접선과 직교가 아니어도 된다 — 펼칠 때 직교화한다. */
  normals: readonly THREE.Vector3[];
  /** 가닥 단면 x(−1~1)·z 를 머리 본 로컬 길이로 바꾸는 배율. 행렬 경로의 scale.x·scale.z 와 같다. */
  halfWidth: number;
  thickness: number;
}>;

export type StudioVrmAuthoredHairInstance = Readonly<{
  part: AvatarForgeHairPart;
  matrix: THREE.Matrix4;
  /** 있으면 `matrix` 대신 이 중심선을 따라 가닥을 굽혀 깐다(가닥 프리미티브 전용). */
  spine?: StudioVrmAuthoredHairSpine;
}>;

const RADIAL_SEGMENTS = 28;
const CAP_HEIGHT_SEGMENTS = 18;
const CLUMP_LENGTH_SEGMENTS = 24;
const CLUMP_CROSS_SEGMENTS = 8;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function resolvedShadow(part: AvatarForgeHairPart): THREE.Color {
  const explicit = part.shadowColor;
  if (explicit) return new THREE.Color(explicit);
  const base = new THREE.Color(part.baseColor);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  // 셀 그림자가 검정으로 탁하게 무너지지 않도록 채도를 살리고 미세하게 차가운 색조로 이동한다.
  return new THREE.Color().setHSL(
    (hsl.h + 0.035) % 1,
    Math.min(1, hsl.s * 1.12 + 0.04),
    Math.max(0.06, hsl.l * 0.58),
  );
}

function resolvedHighlight(part: AvatarForgeHairPart): THREE.Color {
  return new THREE.Color(part.tipColor).lerp(
    new THREE.Color("#fff6eb"),
    0.16 + clamp01(part.shine) * 0.28,
  );
}

/**
 * 정점 색 = 기본색→끝 색 그라데이션(`avatarForgeHairTipMix`, 확장이 없으면 예전 `t × 0.58`) →
 * 하이라이트 색(accent 0~1) → 가장자리 결 그림자·가운데 능선 하이라이트·미세 모발 결.
 */
function paletteColor(
  part: AvatarForgeHairPart,
  t: number,
  cross: number,
  back = false,
  accent = 0,
): THREE.Color {
  const base = new THREE.Color(part.baseColor).lerp(new THREE.Color(part.tipColor), avatarForgeHairTipMix(part, t));
  if (accent > 0 && part.accentColor) base.lerp(new THREE.Color(part.accentColor), clamp01(accent));
  const shadow = resolvedShadow(part);
  const highlight = resolvedHighlight(part);
  const edge = Math.pow(Math.abs(cross), 1.35);
  const ridge = Math.pow(1 - Math.abs(cross), 2.1);
  base.lerp(shadow, clamp01(edge * 0.34 + (back ? 0.18 : 0)));
  if (!back) {
    const striation = Math.max(0, Math.cos(cross * Math.PI * 3)) * 0.032;
    base.lerp(highlight, clamp01(ridge * (0.06 + clamp01(part.shine) * 0.16) + striation));
  }
  return base;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * 가닥(clump) 정점의 하이라이트 비율. 브릿지는 가닥 전체(뿌리만 캡에 녹아들게), 이너 컬러는
 * 안쪽(뒷면) 층 전체와 바깥 층의 끝부분만.
 */
function clumpAccent(part: AvatarForgeHairPart, t: number, back: boolean): number {
  if (!part.accentMode || !part.accentColor) return 0;
  if (part.accentMode === "streak") return 0.9 * smoothstep(0, 0.14, t);
  return back ? smoothstep(0.04, 0.3, t) : 0.6 * smoothstep(0.62, 0.98, t);
}

/**
 * 껍질(캡·뒷머리·번·땋은 마디) 정점의 하이라이트 비율. 캡 브릿지는 가르마 쪽(−x) 이마에서 정수리로
 * 이어지는 줄무늬, 뒷머리 이너 컬러는 머리 쪽을 보는 안쪽 면과 아래쪽, 땋은 마디는 마디 전체(브릿지)
 * 또는 아래 반쪽(이너).
 */
function shellAccent(part: AvatarForgeHairPart, x: number, y: number, z: number, normalZ: number): number {
  if (!part.accentMode || !part.accentColor) return 0;
  if (part.role === "cap") {
    if (part.accentMode !== "streak") return 0;
    const band = 1 - smoothstep(0.08, 0.2, Math.abs(x + 0.42));
    return 0.88 * band * smoothstep(-0.55, -0.15, z + y * 0.4);
  }
  if (part.role === "braid") return part.accentMode === "streak" ? 0.85 : 0.75 * smoothstep(0.15, -0.35, y);
  if (part.accentMode === "inner") return Math.max(smoothstep(0.05, 0.4, normalZ), 0.55 * smoothstep(-0.2, -0.85, y));
  return part.accentMode === "streak" ? 0.85 : 0;
}

function safeAspect(longAxis: number, crossAxis: number): number {
  const safeLongAxis = Number.isFinite(longAxis) ? Math.abs(longAxis) : 1;
  const safeCrossAxis = Number.isFinite(crossAxis) ? Math.abs(crossAxis) : 1;
  const ratio = safeLongAxis / Math.max(1e-4, safeCrossAxis);
  return Math.sqrt(Math.min(5, Math.max(1, ratio)));
}

/**
 * Head-local clump centre line. The root is pinned to the authored transform and wave amplitude is
 * bounded independently of a very thin/tall part's raw aspect ratio. This keeps style switches from
 * throwing bangs and side locks far away from the skull while retaining visible curl near the tips.
 */
export function resolveStudioVrmAuthoredHairClumpCenter(
  part: AvatarForgeHairPart,
  t: number,
): readonly [number, number] {
  const progress = clamp01(Number.isFinite(t) ? t : 0);
  if (progress <= 0) return [0, 0];
  const curl = Math.min(1.25, Math.max(-1.25, Number.isFinite(part.curl) ? part.curl : 0));
  const waveAmount = Math.min(1, Math.max(-1, Number.isFinite(part.wave) ? (part.wave ?? 0) : 0));
  const waveFrequency = Math.min(6, Math.max(0.5, Number.isFinite(part.waveFrequency)
    ? (part.waveFrequency ?? 2.4)
    : 2.4));
  const aspectX = safeAspect(part.scale[1], part.scale[0]);
  const aspectZ = safeAspect(part.scale[1], part.scale[2]);
  const rootEase = smoothstep(0, 0.22, progress);
  const bodyEnvelope = rootEase * (0.28 + 0.72 * Math.pow(Math.sin(Math.PI * progress), 0.68));
  const tipEnvelope = smoothstep(0.32, 0.96, progress);

  // 옆머리·뒷머리 좌우 가닥은 얼굴 중심에 대해 대칭 S-웨이브와 턱선 안쪽 C-컬을 형성한다.
  const hasLateralOffset = Number.isFinite(part.position[0]) && Math.abs(part.position[0]) > 1e-4;
  const isSide = part.role === "side" && hasLateralOffset;
  const sideInward = isSide ? (part.position[0] < 0 ? 1 : -1) : 1;
  const waveSign = (isSide || (part.role === "back" && hasLateralOffset))
    ? (part.position[0] < 0 ? 1 : -1)
    : 1;

  const sWaveX = (
    Math.sin(progress * Math.PI * waveFrequency) * 0.82
    + Math.sin(progress * Math.PI * waveFrequency * 0.5) * 0.26
  ) * waveAmount * 0.078 * aspectX * bodyEnvelope * waveSign;
  const sWaveZ = (
    (Math.cos(progress * Math.PI * waveFrequency) - 1) * 0.74
    + Math.sin(progress * Math.PI * 1.35) * 0.22
  ) * waveAmount * 0.034 * aspectZ * bodyEnvelope;

  // 옆머리 안쪽 C-컬: 광대 부근은 부드럽게 감싸고 턱선·어깨 아래로 갈수록 안쪽으로 감긴다.
  const cheekHugX = isSide
    ? sideInward * (0.055 + Math.abs(curl) * 0.12) * Math.pow(tipEnvelope, 1.1)
    : 0;
  const cheekHugZ = isSide
    ? (0.044 * Math.sin(progress * Math.PI * 0.85) * rootEase
      - (0.048 + Math.abs(curl) * 0.072) * Math.pow(tipEnvelope, 1.35))
    : 0;

  const baseCurlX = isSide
    ? Math.sin(progress * Math.PI * 0.92) * curl * 0.16 * rootEase * sideInward
    : Math.sin(progress * Math.PI * 1.68) * curl * 0.29 * rootEase * waveSign;
  const curveX = baseCurlX + sWaveX + cheekHugX;
  const curveZ = Math.sin(progress * Math.PI) * curl * 0.16 * rootEase + sWaveZ + cheekHugZ;
  return [curveX, curveZ];
}

/**
 * 단면 깊이(앞면 볼록, 뒷면 볼록). 앞머리·옆머리는 넓은 그래픽 면 + 얕은 뒷면이지만, 묶은 꼬리는
 * 둥근 다발이다 — 납작하게 두면 옆에서 볼 때 막대 한 개처럼 보였다(2026-10-23 측면 시트).
 */
function clumpDepth(part: AvatarForgeHairPart, t: number, width: number): { front: number; back: number } {
  if (part.role === "tail") return { front: width * 0.5, back: width * 0.45 };
  const depth = width * (0.24 + 0.08 * (1 - t));
  return { front: depth, back: depth * 0.42 };
}

function clumpWidth(t: number, taper: number): number {
  const safeTaper = clamp01(Number.isFinite(taper) ? taper : 0.4);
  if (safeTaper <= 0.1) {
    const bluntTip = 1 - 0.92 * smoothstep(0.92, 1, t) * (0.4 + safeTaper * 6);
    return Math.max(0.014, (0.94 + 0.06 * Math.sin(Math.min(1, t * 2) * Math.PI * 0.5)) * bluntTip);
  }
  const rootSwell = 0.88 + 0.12 * Math.sin(Math.min(1, t * 2.6) * Math.PI * 0.5);
  const tip = Math.pow(Math.max(0, 1 - t), 0.64 + safeTaper * 0.68);
  const featherFinish = 1 - 0.24 * safeTaper * smoothstep(0.65, 1, t);
  return Math.max(0.012, rootSwell * tip * featherFinish);
}

/**
 * A faceted, tapered, closed hair clump. Unlike the legacy radial capsule, this geometry has a
 * broad graphic face, a shallow back, a highlighted centre ridge, and a near-zero-width tip.
 */
export function createStudioVrmAuthoredHairClumpGeometry(
  part: AvatarForgeHairPart,
): THREE.BufferGeometry {
  const columns = CLUMP_CROSS_SEGMENTS + 1;
  const rows = CLUMP_LENGTH_SEGMENTS + 1;
  const layerStride = rows * columns;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const highlight = resolvedHighlight(part);

  for (const back of [false, true]) {
    for (let row = 0; row < rows; row += 1) {
      const t = row / CLUMP_LENGTH_SEGMENTS;
      const y = 1 - t * 2;
      const width = clumpWidth(t, part.taper);
      const depth = clumpDepth(part, t, width);
      const [centerX, centerZ] = resolveStudioVrmAuthoredHairClumpCenter(part, t);
      for (let column = 0; column < columns; column += 1) {
        const u = column / CLUMP_CROSS_SEGMENTS;
        const cross = u * 2 - 1;
        const crown = Math.pow(Math.max(0, 1 - cross * cross), 0.72);
        const z = centerZ + (back ? -depth.back : depth.front) * crown;
        positions.push(centerX + cross * width, y, z);
        const color = paletteColor(part, t, cross, back, clumpAccent(part, t, back));
        if (!back) {
          // 앞머리·옆머리 가닥 상중단에 좁고 또렷한 아치형 엔젤링 대역을 얹되 어두운 모발색이 바래지 않게 제한한다.
          const ringCenter = 0.32 - cross * cross * 0.05;
          const ringBand = Math.exp(-(((t - ringCenter) / 0.115) ** 2));
          const ringLift = ringBand * (0.64 + 0.36 * (1 - Math.abs(cross))) * (0.04 + clamp01(part.shine) * 0.24);
          if (ringLift > 0) color.lerp(highlight, clamp01(ringLift));
        }
        colors.push(color.r, color.g, color.b);
        uvs.push(u, t);
      }
    }
  }

  for (let row = 0; row < CLUMP_LENGTH_SEGMENTS; row += 1) {
    for (let column = 0; column < CLUMP_CROSS_SEGMENTS; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);

      const backOffset = layerStride;
      const ba = backOffset + a;
      const bb = backOffset + b;
      const bc = backOffset + c;
      const bd = backOffset + d;
      indices.push(ba, bb, bc, bb, bd, bc);
    }
  }

  const connectEdge = (column: number, reverse: boolean) => {
    for (let row = 0; row < CLUMP_LENGTH_SEGMENTS; row += 1) {
      const frontA = row * columns + column;
      const frontB = (row + 1) * columns + column;
      const backA = layerStride + frontA;
      const backB = layerStride + frontB;
      if (reverse) indices.push(frontA, backA, frontB, frontB, backA, backB);
      else indices.push(frontA, frontB, backA, frontB, backB, backA);
    }
  };
  connectEdge(0, true);
  connectEdge(CLUMP_CROSS_SEGMENTS, false);

  for (const row of [0, CLUMP_LENGTH_SEGMENTS]) {
    for (let column = 0; column < CLUMP_CROSS_SEGMENTS; column += 1) {
      const frontA = row * columns + column;
      const frontB = frontA + 1;
      const backA = layerStride + frontA;
      const backB = backA + 1;
      if (row === 0) indices.push(frontA, frontB, backA, frontB, backB, backA);
      else indices.push(frontA, backA, frontB, frontB, backA, backB);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // 앞/뒤 층이 만나는 좌우·끝단 경계 정점 법선을 완전 용접해 얇은 리본 가장자리 각짐과 외곽선 찢어짐을 제거한다.
  smoothStudioVrmCoincidentNormals(geometry, { creaseAngleDeg: 180 });
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const CAP_PARTING_X = -0.18;

function setShellColors(geometry: THREE.BufferGeometry, part: AvatarForgeHairPart): void {
  geometry.computeBoundingBox();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const box = geometry.boundingBox;
  if (!position || !box) return;
  const height = Math.max(1e-5, box.max.y - box.min.y);
  const highlight = resolvedHighlight(part);
  const shadow = resolvedShadow(part);
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const px = position.getX(index);
    const py = position.getY(index);
    const pz = position.getZ(index);
    const t = clamp01((box.max.y - py) / height);
    const cross = px / Math.max(1e-5, Math.max(Math.abs(box.min.x), Math.abs(box.max.x)));
    const nz = normal ? normal.getZ(index) : 0.5;
    const ny = normal ? normal.getY(index) : 0.5;
    const accent = shellAccent(part, px, py, pz, nz);
    // 캡 외피는 360° 전체가 겉머리이고, 뒷머리 껍질은 목을 보는 +z 쪽만 안쪽 음영이다.
    const isInnerSurface = part.role === "cap" ? ny < -0.55 : part.role === "back" ? nz > 0.25 : nz < -0.25;
    const radialCross = part.role === "cap"
      ? clamp01(Math.abs(Math.sin(Math.atan2(px, pz) * 7)) * 0.55)
      : cross * 0.72;
    const color = paletteColor(part, t * 0.65, radialCross, isInnerSurface, accent);
    if (part.role === "cap") {
      // 오프센터 가르마 골과 목덜미 하단 자연 음영을 더해 캡이 단색 플라스틱 돔으로 보이지 않게 한다.
      const partMask = smoothstep(0.36, 0.78, py) * smoothstep(-0.48, 0.24, pz);
      const partShade = Math.exp(-Math.pow((px - CAP_PARTING_X) / 0.085, 2)) * partMask * 0.22;
      const napeShade = smoothstep(-0.18, -0.72, py) * 0.28;
      if (partShade + napeShade > 0) color.lerp(shadow, clamp01(partShade + napeShade));
    }
    if (!isInnerSurface && (part.role === "cap" || part.role === "back")) {
      // 정점 백화(ringLift) 상한을 0.24로 억제해 깊은 모발 본색을 유지하고 광택은 텍스처·이중 초승달 매트캡에 맡긴다.
      const ringLift = Math.min(0.24, evaluateStudioVrmHairHighlightRing(py, part.shine, cross * 0.55) * 1.05);
      if (ringLift > 0) color.lerp(highlight, clamp01(ringLift));
    }
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function shapeCapToScalp(
  geometry: THREE.BufferGeometry,
  options?: StudioVrmHairScalpFitOptions,
): void {
  const position = geometry.getAttribute("position");
  if (!position) return;
  for (let index = 0; index < position.count; index += 1) {
    let [nx, ny, nz] = fitStudioVrmHairScalpVertex(
      position.getX(index),
      position.getY(index),
      position.getZ(index),
      options,
    );
    // 정수리 오프센터(x ≈ -0.18) 가르마 골 + 양옆 모근 볼륨 + 미세 다발 굴곡(매끈한 헬멧 돔 제거)
    const partMask = smoothstep(0.32, 0.76, ny) * smoothstep(-0.55, 0.25, nz);
    const crownRib = Math.cos(Math.atan2(nx, nz) * 7) * 0.006 * smoothstep(0.18, 0.65, ny) * (1 - smoothstep(0.84, 0.99, ny));
    if (partMask > 1e-4 || Math.abs(crownRib) > 1e-5) {
      const partDist = nx - CAP_PARTING_X;
      const absDist = Math.abs(partDist);
      const partGroove = Math.exp(-Math.pow(partDist / 0.095, 2));
      const rootPillow = Math.exp(-Math.pow((absDist - 0.22) / 0.14, 2)) * (partDist >= 0 ? 1.15 : 0.92);
      const radialDelta = (-0.026 * partGroove + 0.02 * rootPillow) * partMask + crownRib;
      const radius = Math.hypot(nx, ny, nz);
      if (radius > 1e-6) {
        const targetR = Math.max(1.004, radius + radialDelta);
        const gain = targetR / radius;
        nx *= gain;
        ny *= gain;
        nz *= gain;
      }
    }
    position.setXYZ(index, nx, ny, nz);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  smoothStudioVrmCoincidentNormals(geometry, { creaseAngleDeg: 180 });
}

/** 캡이 덮는 극각(정수리 0 기준): 이마 자연 헤어라인(y≈0.14)·옆(귀 위)·뒤(목덜미). */
const CAP_THETA_FRONT = Math.acos(0.14);
const CAP_THETA_SIDE = Math.PI * 0.62;
const CAP_THETA_BACK = Math.PI * 0.72;
const CAP_FRONT_ARCH_POWER = 1.15;

/**
 * 방위각마다 덮는 극각이 다른 캡 — 헤어라인이 매끄러운 아치 곡선이다.
 *
 * 예전에는 이마 가운데가 y≈0.28 에서 일찍 끊겨 이마 상단이 넓게 비어 보였다. 이제 자연스러운
 * 헤어라인(y≈0.14)까지 캡이 내려와 정수리~이마 상단을 매끄럽게 덮고, 관자놀이에서 귀 위·목덜미로
 * 부드럽게 이어진다. 정점 배치·감기 순서는 `THREE.SphereGeometry(…, phiStart=π/2)` 와 같다.
 */
function createCapGeometry(): THREE.BufferGeometry {
  const columns = RADIAL_SEGMENTS;
  const rows = CAP_HEIGHT_SEGMENTS;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const phi = Math.PI / 2 + u * Math.PI * 2;
      // 정면(+z) 가중치와 후면 가중치. 옆(귀 쪽)은 둘 다 0 이다.
      const facing = Math.sin(phi);
      const front = Math.pow(Math.max(0, facing), CAP_FRONT_ARCH_POWER);
      const back = Math.pow(Math.max(0, -facing), 1.2);
      const thetaMax = CAP_THETA_SIDE
        + (CAP_THETA_FRONT - CAP_THETA_SIDE) * front
        + (CAP_THETA_BACK - CAP_THETA_SIDE) * back;
      const theta = v * thetaMax;
      positions.push(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
      // v=0(정수리 뿌리)→v=1(헤어라인), 둘레 4회 반복으로 가닥과 동일한 모발결 밀도 유지
      uvs.push(u * 4, v);
    }
  }
  const stride = columns + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * stride + column + 1;
      const b = row * stride + column;
      const c = (row + 1) * stride + column;
      const d = (row + 1) * stride + column + 1;
      if (row !== 0) indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function shapeBackShellToDrape(geometry: THREE.BufferGeometry, part: AvatarForgeHairPart): void {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  if (!position) return;
  const napeLike = part.id.includes("nape");
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const lower = clamp01((0.5 - y) / 1.5);
    const tip = Math.pow(lower, 1.45);
    const side = clamp01(Math.abs(x));
    const drape = napeLike ? 0.35 : 1;
    // 뒷머리 껍질도 매끈한 구 대신 세로 다발 골과 깃털형 끝단을 갖도록 조각한다.
    const angle = Math.atan2(x, -z);
    const flute = Math.cos(angle * 10) * 0.045 * drape * lower * (z < 0 ? 1 : 0.2);
    const hemScallop = Math.sin(angle * 7 + 0.4) * 0.042 * drape * tip;
    const width = 1 - drape * tip * (0.16 + side * 0.1);
    const frontDepth = 1 - drape * (0.38 + lower * 0.2);
    const backDepth = 1 + drape * lower * 0.08 + flute;
    position.setXYZ(
      index,
      x * width,
      y - drape * tip * (1 - side) * 0.04 + hemScallop,
      z >= 0 ? z * frontDepth : z * backDepth,
    );
    if (uv) {
      // v=0(윗머리 뿌리)→v=1(아랫단)으로 가닥 UV 방향과 통일한다.
      uv.setXY(index, uv.getX(index) * 3, 1 - uv.getY(index));
    }
  }
  position.needsUpdate = true;
  if (uv) uv.needsUpdate = true;
  geometry.computeVertexNormals();
  smoothStudioVrmCoincidentNormals(geometry, { creaseAngleDeg: 180 });
}

function createShellGeometry(
  part: AvatarForgeHairPart,
  options?: StudioVrmHairScalpFitOptions,
): THREE.BufferGeometry {
  const geometry = part.role === "cap" ? createCapGeometry() : new THREE.SphereGeometry(1, 28, 20);
  if (part.role === "cap") shapeCapToScalp(geometry, options);
  else if (part.role === "back") shapeBackShellToDrape(geometry, part);
  else smoothStudioVrmCoincidentNormals(geometry, { creaseAngleDeg: 180 });
  setShellColors(geometry, part);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createStudioVrmAuthoredHairGeometry(
  part: AvatarForgeHairPart,
  options?: StudioVrmHairScalpFitOptions,
): THREE.BufferGeometry {
  return part.primitive === "tapered-capsule"
    ? createStudioVrmAuthoredHairClumpGeometry(part)
    : createShellGeometry(part, options);
}

/**
 * 가닥 지오메트리(국소 y: 뿌리 1 → 끝 −1, x: 가로, z: 두께)를 중심선을 따라 굽힌다.
 * 국소 x 는 `법선 × 접선`(정면에서 오른쪽), 국소 z 는 접선에 직교화한 법선 방향으로 편다.
 */
export function bendStudioVrmAuthoredHairAlongSpine(
  geometry: THREE.BufferGeometry,
  spine: StudioVrmAuthoredHairSpine,
): void {
  const position = geometry.getAttribute("position");
  const count = Math.min(spine.points.length, spine.normals.length);
  if (!position || count < 2) return;
  const last = count - 1;
  const frames = spine.points.slice(0, count).map((point, index) => {
    const before = spine.points[Math.max(0, index - 1)]!;
    const after = spine.points[Math.min(last, index + 1)]!;
    const tangent = after.clone().sub(before);
    if (tangent.lengthSq() <= 1e-10) tangent.set(0, -1, 0);
    else tangent.normalize();
    const normal = spine.normals[index]!.clone();
    normal.addScaledVector(tangent, -normal.dot(tangent));
    if (normal.lengthSq() <= 1e-10) {
      normal.set(Math.abs(tangent.z) < 0.9 ? 0 : 1, 0, Math.abs(tangent.z) < 0.9 ? 1 : 0);
      normal.addScaledVector(tangent, -normal.dot(tangent));
    }
    normal.normalize();
    const across = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    return { point, normal, across };
  });
  const sample = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const across = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    const t = clamp01((1 - position.getY(index)) / 2) * last;
    const lower = Math.min(last - 1, Math.floor(t));
    const mix = t - lower;
    const a = frames[lower]!;
    const b = frames[lower + 1]!;
    sample.copy(a.point).lerp(b.point, mix);
    normal.copy(a.normal).lerp(b.normal, mix);
    if (normal.lengthSq() <= 1e-10) normal.copy(a.normal);
    else normal.normalize();
    across.copy(a.across).lerp(b.across, mix);
    if (across.lengthSq() <= 1e-10) across.copy(a.across);
    else across.normalize();
    sample
      .addScaledVector(across, position.getX(index) * spine.halfWidth)
      .addScaledVector(normal, position.getZ(index) * spine.thickness);
    position.setXYZ(index, sample.x, sample.y, sample.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  smoothStudioVrmCoincidentNormals(geometry, { creaseAngleDeg: 180 });
}

/**
 * 캡 헤어라인(`createCapGeometry`)의 단위 구 높이. `lateral` 은 단위 구 가로 위치(−1~1)이고, 앞쪽
 * 반구에서 그 가로 위치를 지나는 헤어라인 점의 y 를 돌려준다. 앞머리 뿌리를 캡 밑에 숨길 높이에 쓴다.
 */
export function studioVrmAuthoredCapHairlineHeight(lateral: number): number {
  const target = Math.min(0.98, Math.abs(Number.isFinite(lateral) ? lateral : 0));
  const edge = (phi: number) => {
    const front = Math.pow(Math.max(0, Math.sin(phi)), CAP_FRONT_ARCH_POWER);
    const theta = CAP_THETA_SIDE + (CAP_THETA_FRONT - CAP_THETA_SIDE) * front;
    return { x: -Math.cos(phi) * Math.sin(theta), y: Math.cos(theta) };
  };
  // φ ∈ [π/2, π] 에서 가로 위치가 0 → sin θ 로 늘어난다(좌우 대칭이라 한쪽만 찾는다).
  let low = Math.PI / 2;
  let high = Math.PI;
  for (let step = 0; step < 32; step += 1) {
    const mid = (low + high) / 2;
    if (edge(mid).x < target) low = mid;
    else high = mid;
  }
  return edge((low + high) / 2).y;
}

/** Bakes every authored clump into one head-local buffer, reducing a style to two draw calls. */
export function mergeStudioVrmAuthoredHairGeometry(
  instances: readonly StudioVrmAuthoredHairInstance[],
  options?: StudioVrmHairScalpFitOptions,
): THREE.BufferGeometry | null {
  const geometries = instances.map(({ part, matrix, spine }) => {
    const geometry = createStudioVrmAuthoredHairGeometry(part, options);
    if (spine && part.primitive === "tapered-capsule") bendStudioVrmAuthoredHairAlongSpine(geometry, spine);
    else geometry.applyMatrix4(matrix);
    return geometry;
  });
  if (geometries.length === 0) return null;
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) return null;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function createStudioVrmAuthoredHairGradientTexture(): THREE.DataTexture {
  const data = new Uint8Array([
    64, 64, 64, 255,
    124, 124, 124, 255,
    194, 194, 194, 255,
    244, 244, 244, 255,
  ]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
