/**
 * 작화 오토파일럿 엔진 ②: 배경 군중/엑스트라 1클릭 생성 (`generatePerspectiveCrowdSilhouettes`).
 * 결정론적 1점 소실점 원근 스케일링과 화가 알고리즘(원경→근경) 정렬로 3~24명 벡터 실루엣을 생성한다.
 */

import {
  clampInt,
  clampNumber,
  roundTo,
  type CrowdPoseKind,
  type CrowdPropKind,
  type CrowdSceneId,
  type CrowdSilhouetteEntity,
  type NormalizedPoint,
  type PerspectiveCrowdOptions,
  type PerspectiveCrowdResult,
  type SvgLineSegment,
} from "./creator-relief-types";

interface CrowdSceneProfile {
  readonly defaultHorizonPct: number;
  readonly vpX: number;
  readonly poses: readonly CrowdPoseKind[];
  readonly propKind: CrowdPropKind;
  readonly minScale: number;
  readonly maxScale: number;
  readonly hashSeed: number;
}

const CROWD_VIEWBOX_W = 320;
const CROWD_VIEWBOX_H = 200;

const CROWD_SCENE_PROFILES: Readonly<Record<CrowdSceneId, CrowdSceneProfile>> = {
  cafe: {
    defaultHorizonPct: 44,
    vpX: 52,
    poses: ["seated", "conversing", "seated"],
    propKind: "cup",
    minScale: 0.34,
    maxScale: 1.12,
    hashSeed: 1013,
  },
  street: {
    defaultHorizonPct: 40,
    vpX: 50,
    poses: ["walking", "walking", "standing"],
    propKind: "bag",
    minScale: 0.26,
    maxScale: 1.22,
    hashSeed: 2029,
  },
  classroom: {
    defaultHorizonPct: 36,
    vpX: 50,
    poses: ["seated", "seated", "seated"],
    propKind: "desk",
    minScale: 0.32,
    maxScale: 1.16,
    hashSeed: 3041,
  },
  ballroom: {
    defaultHorizonPct: 50,
    vpX: 48,
    poses: ["conversing", "standing", "walking"],
    propKind: "glass",
    minScale: 0.3,
    maxScale: 1.18,
    hashSeed: 4057,
  },
};

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCrowdBodyPath(
  cx: number,
  baselineY: number,
  headCy: number,
  headR: number,
  shoulderW: number,
  pose: CrowdPoseKind,
  facing: -1 | 1,
): string {
  const neckY = roundTo(headCy + headR + 1, 1);
  const shoulderY = roundTo(neckY + Math.max(2.5, headR * 0.42), 1);
  const halfW = shoulderW / 2;
  const lean = pose === "walking" ? facing * halfW * 0.16 : 0;
  const waistY = roundTo(
    shoulderY + (baselineY - shoulderY) * (pose === "seated" ? 0.72 : 0.56),
    1,
  );

  if (pose === "seated") {
    return (
      `M ${roundTo(cx - halfW * 0.95, 1)} ${roundTo(baselineY, 1)} ` +
      `L ${roundTo(cx - halfW, 1)} ${shoulderY} ` +
      `Q ${roundTo(cx - halfW * 0.5, 1)} ${neckY} ${roundTo(cx, 1)} ${neckY} ` +
      `Q ${roundTo(cx + halfW * 0.5, 1)} ${neckY} ${roundTo(cx + halfW, 1)} ${shoulderY} ` +
      `L ${roundTo(cx + halfW * 0.95, 1)} ${roundTo(baselineY, 1)} Z`
    );
  }

  const strideSpread = pose === "walking" ? halfW * 0.85 : halfW * 0.52;
  return (
    `M ${roundTo(cx - strideSpread + lean, 1)} ${roundTo(baselineY, 1)} ` +
    `L ${roundTo(cx - halfW * 0.72, 1)} ${waistY} ` +
    `L ${roundTo(cx - halfW, 1)} ${shoulderY} ` +
    `Q ${roundTo(cx - halfW * 0.5, 1)} ${neckY} ${roundTo(cx, 1)} ${neckY} ` +
    `Q ${roundTo(cx + halfW * 0.5, 1)} ${neckY} ${roundTo(cx + halfW, 1)} ${shoulderY} ` +
    `L ${roundTo(cx + halfW * 0.72, 1)} ${waistY} ` +
    `L ${roundTo(cx + strideSpread + lean, 1)} ${roundTo(baselineY, 1)} ` +
    `L ${roundTo(cx + halfW * 0.18, 1)} ${roundTo(baselineY, 1)} ` +
    `L ${roundTo(cx, 1)} ${roundTo(waistY + (baselineY - waistY) * 0.28, 1)} ` +
    `L ${roundTo(cx - halfW * 0.18, 1)} ${roundTo(baselineY, 1)} Z`
  );
}

function buildCrowdPropPath(
  propKind: CrowdPropKind,
  cx: number,
  baselineY: number,
  shoulderW: number,
  facing: -1 | 1,
): string | null {
  if (propKind === "none") return null;
  if (propKind === "desk") {
    const halfDesk = shoulderW * 0.78;
    const deskTop = roundTo(baselineY - shoulderW * 0.22, 1);
    return (
      `M ${roundTo(cx - halfDesk, 1)} ${deskTop} L ${roundTo(cx + halfDesk, 1)} ${deskTop} ` +
      `L ${roundTo(cx + halfDesk * 0.92, 1)} ${roundTo(baselineY, 1)} ` +
      `L ${roundTo(cx - halfDesk * 0.92, 1)} ${roundTo(baselineY, 1)} Z`
    );
  }
  if (propKind === "cup") {
    const cupX = roundTo(cx + facing * shoulderW * 0.58, 1);
    const cupY = roundTo(baselineY - shoulderW * 0.2, 1);
    const w = roundTo(Math.max(2.2, shoulderW * 0.16), 1);
    const h = roundTo(Math.max(2.8, shoulderW * 0.2), 1);
    return (
      `M ${cupX} ${cupY} L ${roundTo(cupX + w, 1)} ${cupY} ` +
      `L ${roundTo(cupX + w * 0.85, 1)} ${roundTo(cupY + h, 1)} ` +
      `L ${roundTo(cupX + w * 0.15, 1)} ${roundTo(cupY + h, 1)} Z`
    );
  }
  if (propKind === "bag") {
    const bagX = roundTo(cx + facing * shoulderW * 0.56, 1);
    const bagY = roundTo(baselineY - shoulderW * 0.65, 1);
    const w = roundTo(Math.max(3, shoulderW * 0.24), 1);
    const h = roundTo(Math.max(4, shoulderW * 0.34), 1);
    return (
      `M ${bagX} ${bagY} L ${roundTo(bagX + w, 1)} ${bagY} ` +
      `L ${roundTo(bagX + w, 1)} ${roundTo(bagY + h, 1)} L ${bagX} ${roundTo(bagY + h, 1)} Z`
    );
  }
  const glassX = roundTo(cx + facing * shoulderW * 0.54, 1);
  const glassY = roundTo(baselineY - shoulderW * 0.88, 1);
  const r = roundTo(Math.max(1.8, shoulderW * 0.12), 1);
  return `M ${roundTo(glassX - r, 1)} ${glassY} L ${roundTo(glassX + r, 1)} ${glassY} L ${glassX} ${roundTo(glassY + r * 2.4, 1)} Z`;
}

/**
 * 결정론적 1점 소실점 원근 스케일링으로 3~24명 배경 엑스트라 실루엣 벡터 데이터를 생성한다.
 * 반환 배열은 원경(index 0) → 근경(마지막) 순으로 깊이 정렬(Painter's order)된다.
 */
export function generatePerspectiveCrowdSilhouettes(
  options: PerspectiveCrowdOptions,
): PerspectiveCrowdResult {
  const profile = CROWD_SCENE_PROFILES[options.scene];
  const count = clampInt(options.count, 3, 24);
  const horizonPct = roundTo(clampNumber(options.horizonPct ?? profile.defaultHorizonPct, 15, 85), 1);
  const seed = clampInt(options.seed ?? 42, 0, 999_999);
  const rng = createMulberry32((seed * 2654435761) ^ profile.hashSeed);

  const vanishingPoint: NormalizedPoint = { x: profile.vpX, y: horizonPct };
  const verticalSpanPct = Math.max(12, 97 - horizonPct);

  const rawDepths: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const stratumStart = 0.08 + (i / count) * 0.86;
    const stratumWidth = 0.86 / count;
    rawDepths.push(clampNumber(stratumStart + (0.18 + rng() * 0.64) * stratumWidth, 0.06, 0.99));
  }
  rawDepths.sort((a, b) => a - b);

  for (let i = 1; i < rawDepths.length; i += 1) {
    if (rawDepths[i] <= rawDepths[i - 1] + 0.006) {
      rawDepths[i] = Math.min(0.995, rawDepths[i - 1] + 0.006);
    }
  }

  const silhouettes: CrowdSilhouetteEntity[] = rawDepths.map((depth, index) => {
    const baselineYPct = roundTo(horizonPct + verticalSpanPct * depth ** 1.32, 2);
    const scale = roundTo(
      profile.minScale +
        (profile.maxScale - profile.minScale) * (0.28 * depth + 0.72 * depth ** 1.12),
      3,
    );
    const opacity = roundTo(clampNumber(0.32 + depth * 0.64, 0.3, 0.96), 2);
    const blurPx = roundTo(Math.max(0, (1 - depth) * 1.4), 2);

    let xPct: number;
    const spreadWidth = 22 + depth * 64;
    if (options.scene === "classroom") {
      const colCount = Math.min(4, Math.max(2, Math.round(Math.sqrt(count))));
      const col = index % colCount;
      xPct = vanishingPoint.x + ((col + 0.5) / colCount - 0.5) * spreadWidth + (rng() - 0.5) * 4;
    } else if (options.scene === "street") {
      const side = index % 2 === 0 ? -1 : 1;
      const corridorMin = 7 + depth * 12;
      const corridorMax = spreadWidth * 0.5;
      xPct = vanishingPoint.x + side * (corridorMin + rng() * Math.max(4, corridorMax - corridorMin));
    } else if (options.scene === "cafe") {
      const pairIndex = Math.floor(index / 2);
      const seatSide = index % 2 === 0 ? -1 : 1;
      const clusterCenter =
        vanishingPoint.x + (((pairIndex * 37) % 100) / 100 - 0.5) * spreadWidth * 0.85;
      xPct = clusterCenter + seatSide * (4 + depth * 6.5);
    } else {
      xPct = vanishingPoint.x + (rng() - 0.5) * spreadWidth;
    }
    xPct = roundTo(clampNumber(xPct, 7, 93), 2);

    const pose = profile.poses[index % profile.poses.length];
    const facing: -1 | 1 = xPct < vanishingPoint.x ? 1 : -1;
    const headRadiusPct = roundTo(3.1 * scale, 2);
    const shoulderWidthPct = roundTo(9.4 * scale, 2);
    const torsoHeightPct = roundTo((pose === "seated" ? 18.5 : 27.5) * scale, 2);

    const cx = roundTo((xPct / 100) * CROWD_VIEWBOX_W, 1);
    const baselineY = roundTo((baselineYPct / 100) * CROWD_VIEWBOX_H, 1);
    const headR = roundTo((headRadiusPct / 100) * CROWD_VIEWBOX_H, 1);
    const shoulderW = roundTo((shoulderWidthPct / 100) * CROWD_VIEWBOX_W, 1);
    const torsoH = roundTo((torsoHeightPct / 100) * CROWD_VIEWBOX_H, 1);
    const headCy = roundTo(Math.max(headR + 2, baselineY - torsoH - headR * 0.85), 1);

    return {
      id: `${options.scene}-extra-${index + 1}`,
      index,
      depth: roundTo(depth, 4),
      xPct,
      baselineYPct,
      scale,
      opacity,
      blurPx,
      pose,
      facing,
      shoulderWidthPct,
      headRadiusPct,
      torsoHeightPct,
      propKind: profile.propKind,
      headCx: cx,
      headCy,
      headR,
      bodyPath: buildCrowdBodyPath(cx, baselineY, headCy, headR, shoulderW, pose, facing),
      propPath: buildCrowdPropPath(profile.propKind, cx, baselineY, shoulderW, facing),
    };
  });

  const vpSvgX = roundTo((vanishingPoint.x / 100) * CROWD_VIEWBOX_W, 1);
  const vpSvgY = roundTo((vanishingPoint.y / 100) * CROWD_VIEWBOX_H, 1);
  const perspectiveGuides: SvgLineSegment[] = [
    { x1: 0, y1: vpSvgY, x2: CROWD_VIEWBOX_W, y2: vpSvgY },
    { x1: vpSvgX, y1: vpSvgY, x2: 0, y2: CROWD_VIEWBOX_H },
    { x1: vpSvgX, y1: vpSvgY, x2: CROWD_VIEWBOX_W * 0.25, y2: CROWD_VIEWBOX_H },
    { x1: vpSvgX, y1: vpSvgY, x2: CROWD_VIEWBOX_W * 0.75, y2: CROWD_VIEWBOX_H },
    { x1: vpSvgX, y1: vpSvgY, x2: CROWD_VIEWBOX_W, y2: CROWD_VIEWBOX_H },
  ];

  return {
    scene: options.scene,
    count,
    horizonPct,
    vanishingPoint,
    seed,
    viewBoxWidth: CROWD_VIEWBOX_W,
    viewBoxHeight: CROWD_VIEWBOX_H,
    perspectiveGuides,
    silhouettes,
  };
}
