/**
 * 1·2·3점 선형 원근 투시자 및 5점 어안 대원 원호 투시 기하 모듈 (O(1) 닫힌형 정밀 투영).
 */

import type {
  FivePointFisheyeConfig,
  FivePointFisheyeVanishingPoints,
  LockedFisheyeAxis,
  LockedLinearPerspectiveAxis,
  OverlayPolylineGuide,
  PerspectiveMode,
  PerspectiveRulerConfig,
  SnapPoint2D,
} from "./studio-ruler-snap-types";

const DEG_TO_RAD = Math.PI / 180;
const EPS = 1e-9;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isFinitePoint(pt: SnapPoint2D): boolean {
  return Number.isFinite(pt.x) && Number.isFinite(pt.y);
}

function normalizeFisheyeConfig(config: FivePointFisheyeConfig): Required<FivePointFisheyeConfig> {
  return {
    centerX: Number.isFinite(config.centerX) ? config.centerX : 0,
    centerY: Number.isFinite(config.centerY) ? config.centerY : 0,
    radius: Math.max(16, Number.isFinite(config.radius) ? config.radius : 200),
    rotationDeg: Number.isFinite(config.rotationDeg ?? 0) ? (config.rotationDeg ?? 0) : 0,
    curvature: clamp(config.curvature ?? 1, 0.25, 2.0),
    outsidePolicy: config.outsidePolicy === "passthrough" ? "passthrough" : "clamp",
  };
}

function worldToFisheyeLocal(pt: SnapPoint2D, cfg: Required<FivePointFisheyeConfig>): SnapPoint2D {
  const rad = -cfg.rotationDeg * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = pt.x - cfg.centerX;
  const dy = pt.y - cfg.centerY;
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

function fisheyeLocalToWorld(pt: SnapPoint2D, cfg: Required<FivePointFisheyeConfig>): SnapPoint2D {
  const rad = cfg.rotationDeg * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: cfg.centerX + pt.x * cos - pt.y * sin, y: cfg.centerY + pt.x * sin + pt.y * cos };
}

function clampLocalToLensDisk(pt: SnapPoint2D, radius: number): SnapPoint2D {
  const r = Math.hypot(pt.x, pt.y);
  if (r <= radius || r <= EPS) return pt;
  const scale = radius / r;
  return { x: pt.x * scale, y: pt.y * scale };
}

/** 5점 어안 투시자의 5개 소실점(중심·좌·우·상·하) 월드 좌표를 계산한다. */
export function getFivePointFisheyeVanishingPoints(
  config: FivePointFisheyeConfig,
): FivePointFisheyeVanishingPoints {
  const cfg = normalizeFisheyeConfig(config);
  const rEff = cfg.radius / cfg.curvature;
  return {
    center: { x: cfg.centerX, y: cfg.centerY },
    left: fisheyeLocalToWorld({ x: -rEff, y: 0 }, cfg),
    right: fisheyeLocalToWorld({ x: rEff, y: 0 }, cfg),
    top: fisheyeLocalToWorld({ x: 0, y: -rEff }, cfg),
    bottom: fisheyeLocalToWorld({ x: 0, y: rEff }, cfg),
  };
}

/** 1·2·3·5점 투시 프리셋 설정을 캔버스 크기에 맞춰 생성한다. */
export function createPerspectivePresetConfig(
  mode: PerspectiveMode,
  bounds: { readonly width: number; readonly height: number },
): PerspectiveRulerConfig {
  const w = Math.max(64, bounds.width);
  const h = Math.max(64, bounds.height);
  const cx = w * 0.5;
  const cy = h * 0.5;
  if (mode === "1p") {
    return {
      enabled: true,
      mode: "1p",
      vanishingPoints: [{ id: "vp-center", x: cx, y: cy }],
      horizonAngleDeg: 0,
      allowHorizonAxis: true,
      allowVerticalAxis: true,
      minLockDistancePx: 3,
    };
  }
  if (mode === "2p") {
    return {
      enabled: true,
      mode: "2p",
      vanishingPoints: [
        { id: "vp-left", x: -w * 0.28, y: cy },
        { id: "vp-right", x: w * 1.28, y: cy },
      ],
      allowHorizonAxis: false,
      allowVerticalAxis: true,
      minLockDistancePx: 3,
    };
  }
  if (mode === "3p") {
    return {
      enabled: true,
      mode: "3p",
      vanishingPoints: [
        { id: "vp-left", x: -w * 0.26, y: h * 0.36 },
        { id: "vp-right", x: w * 1.26, y: h * 0.36 },
        { id: "vp-vertical", x: cx, y: h * 1.45 },
      ],
      allowHorizonAxis: false,
      allowVerticalAxis: false,
      minLockDistancePx: 3,
    };
  }
  return {
    enabled: true,
    mode: "5p-fisheye",
    vanishingPoints: [],
    fisheye: { centerX: cx, centerY: cy, radius: Math.min(w, h) * 0.44, rotationDeg: 0, curvature: 1, outsidePolicy: "clamp" },
    minLockDistancePx: 3,
  };
}

/** 5점 어안 투시에서 시작점과 드래그 방향에 가장 부합하는 대원 원호(수평/수직) 또는 중심 방사선 축을 결정한다. */
export function resolveFivePointFisheyeAxis(
  rawConfig: FivePointFisheyeConfig,
  startWorld: SnapPoint2D,
  dragWorld: SnapPoint2D,
  maxSnapAngleDeg?: number,
): LockedFisheyeAxis | null {
  const cfg = normalizeFisheyeConfig(rawConfig);
  const rawStartLocal = worldToFisheyeLocal(startWorld, cfg);
  const startLocal = cfg.outsidePolicy === "clamp" ? clampLocalToLensDisk(rawStartLocal, cfg.radius) : rawStartLocal;
  const dragLocal = worldToFisheyeLocal(dragWorld, cfg);
  const dx = dragLocal.x - startLocal.x;
  const dy = dragLocal.y - startLocal.y;
  const dragLen = Math.hypot(dx, dy);
  if (dragLen <= EPS) return null;
  const uDragX = dx / dragLen;
  const uDragY = dy / dragLen;

  const rEff = cfg.radius / cfg.curvature;
  const rEff2 = rEff * rEff;
  const { x: x0, y: y0 } = startLocal;
  const r0Sq = x0 * x0 + y0 * y0;

  const candidates: Array<{ readonly axis: LockedFisheyeAxis; readonly tangent: SnapPoint2D }> = [];

  if (Math.abs(y0) < 1e-4) {
    candidates.push({
      axis: { kind: "fisheye", axisId: "fisheye-horizontal", config: cfg, startLocal, arcCenterLocal: null, arcRadius: null, lineDirLocal: { x: 1, y: 0 } },
      tangent: { x: 1, y: 0 },
    });
  } else {
    const cyArc = (r0Sq - rEff2) / (2 * y0);
    const rArc = Math.hypot(rEff, cyArc);
    candidates.push({
      axis: { kind: "fisheye", axisId: "fisheye-horizontal", config: cfg, startLocal, arcCenterLocal: { x: 0, y: cyArc }, arcRadius: rArc, lineDirLocal: null },
      tangent: { x: -(y0 - cyArc) / rArc, y: x0 / rArc },
    });
  }

  if (Math.abs(x0) < 1e-4) {
    candidates.push({
      axis: { kind: "fisheye", axisId: "fisheye-vertical", config: cfg, startLocal, arcCenterLocal: null, arcRadius: null, lineDirLocal: { x: 0, y: 1 } },
      tangent: { x: 0, y: 1 },
    });
  } else {
    const cxArc = (r0Sq - rEff2) / (2 * x0);
    const rArc = Math.hypot(rEff, cxArc);
    candidates.push({
      axis: { kind: "fisheye", axisId: "fisheye-vertical", config: cfg, startLocal, arcCenterLocal: { x: cxArc, y: 0 }, arcRadius: rArc, lineDirLocal: null },
      tangent: { x: -y0 / rArc, y: (x0 - cxArc) / rArc },
    });
  }

  const radialLen = Math.hypot(x0, y0);
  if (radialLen > 1e-3) {
    const dir = { x: x0 / radialLen, y: y0 / radialLen };
    candidates.push({
      axis: { kind: "fisheye", axisId: "fisheye-radial", config: cfg, startLocal, arcCenterLocal: null, arcRadius: null, lineDirLocal: dir },
      tangent: dir,
    });
  }

  let best: { readonly axis: LockedFisheyeAxis; readonly tangent: SnapPoint2D } | null = null;
  let bestAbsDot = -1;
  for (const cand of candidates) {
    const absDot = Math.abs(uDragX * cand.tangent.x + uDragY * cand.tangent.y);
    if (absDot > bestAbsDot) {
      bestAbsDot = absDot;
      best = cand;
    }
  }
  if (!best) return null;
  if (maxSnapAngleDeg !== undefined && Number.isFinite(maxSnapAngleDeg)) {
    if (bestAbsDot < Math.cos(clamp(maxSnapAngleDeg, 1, 90) * DEG_TO_RAD)) return null;
  }
  return best.axis;
}

/** 5점 어안 축(원호 또는 중심 방사선) 위로 포인터 좌표를 O(1) 닫힌형 정밀 투영한다. */
export function projectPointOntoFivePointFisheyeAxis(
  axis: LockedFisheyeAxis,
  pointWorld: SnapPoint2D,
): { readonly point: SnapPoint2D; readonly distancePx: number; readonly passthrough: boolean } {
  const cfg = axis.config;
  const rawLocal = worldToFisheyeLocal(pointWorld, cfg);
  const outside = Math.hypot(rawLocal.x, rawLocal.y) > cfg.radius + 1e-6;
  if (outside && cfg.outsidePolicy === "passthrough") {
    return { point: pointWorld, distancePx: 0, passthrough: true };
  }
  const local = outside ? clampLocalToLensDisk(rawLocal, cfg.radius) : rawLocal;

  let snappedLocal: SnapPoint2D;
  if (axis.arcCenterLocal && axis.arcRadius !== null) {
    const vx = local.x - axis.arcCenterLocal.x;
    const vy = local.y - axis.arcCenterLocal.y;
    const d = Math.hypot(vx, vy);
    snappedLocal =
      d <= EPS
        ? axis.startLocal
        : { x: axis.arcCenterLocal.x + (vx / d) * axis.arcRadius, y: axis.arcCenterLocal.y + (vy / d) * axis.arcRadius };
    if (cfg.outsidePolicy === "clamp" && Math.hypot(snappedLocal.x, snappedLocal.y) > cfg.radius + 1e-5) {
      const lim = Math.min(cfg.radius, cfg.radius / cfg.curvature);
      snappedLocal =
        axis.axisId === "fisheye-horizontal"
          ? { x: snappedLocal.x < 0 ? -lim : lim, y: 0 }
          : { x: 0, y: snappedLocal.y < 0 ? -lim : lim };
    }
  } else if (axis.lineDirLocal) {
    const t = local.x * axis.lineDirLocal.x + local.y * axis.lineDirLocal.y;
    snappedLocal = { x: t * axis.lineDirLocal.x, y: t * axis.lineDirLocal.y };
    if (cfg.outsidePolicy === "clamp") snappedLocal = clampLocalToLensDisk(snappedLocal, cfg.radius);
  } else {
    snappedLocal = local;
  }

  const world = fisheyeLocalToWorld(snappedLocal, cfg);
  return { point: world, distancePx: Math.hypot(world.x - pointWorld.x, world.y - pointWorld.y), passthrough: false };
}

export function resolveHorizonAngleRad(config: PerspectiveRulerConfig): number {
  if (config.horizonAngleDeg !== undefined && Number.isFinite(config.horizonAngleDeg)) {
    return config.horizonAngleDeg * DEG_TO_RAD;
  }
  if (config.vanishingPoints.length >= 2) {
    const dx = config.vanishingPoints[1]!.x - config.vanishingPoints[0]!.x;
    const dy = config.vanishingPoints[1]!.y - config.vanishingPoints[0]!.y;
    if (Math.hypot(dx, dy) > 1e-5) return Math.atan2(dy, dx);
  }
  return 0;
}

/** 1·2·3점 선형 투시에서 시작점과 드래그 방향에 가장 가까운 가이드 축을 확정한다. */
export function resolveLinearPerspectiveAxis(
  config: PerspectiveRulerConfig,
  start: SnapPoint2D,
  drag: SnapPoint2D,
): LockedLinearPerspectiveAxis | null {
  const dx = drag.x - start.x;
  const dy = drag.y - start.y;
  const dragLen = Math.hypot(dx, dy);
  if (dragLen <= EPS) return null;
  const ux = dx / dragLen;
  const uy = dy / dragLen;

  const vpLimit = config.mode === "1p" ? 1 : config.mode === "2p" ? 2 : 3;
  const candidates: LockedLinearPerspectiveAxis[] = [];
  for (const vp of config.vanishingPoints.slice(0, vpLimit)) {
    if (!isFinitePoint(vp)) continue;
    const vx = vp.x - start.x;
    const vy = vp.y - start.y;
    const dist = Math.hypot(vx, vy);
    if (dist <= 1e-4) continue;
    candidates.push({ kind: "linear", axisId: `vp:${vp.id}`, origin: start, dir: { x: vx / dist, y: vy / dist } });
  }

  const horizonRad = resolveHorizonAngleRad(config);
  if (config.allowHorizonAxis ?? config.mode === "1p") {
    candidates.push({ kind: "linear", axisId: "horizon", origin: start, dir: { x: Math.cos(horizonRad), y: Math.sin(horizonRad) } });
  }
  if (config.allowVerticalAxis ?? (config.mode === "1p" || config.mode === "2p")) {
    const vertRad = horizonRad + Math.PI * 0.5;
    candidates.push({ kind: "linear", axisId: "vertical", origin: start, dir: { x: Math.cos(vertRad), y: Math.sin(vertRad) } });
  }

  let best: LockedLinearPerspectiveAxis | null = null;
  let bestAbsDot = -1;
  for (const cand of candidates) {
    const absDot = Math.abs(ux * cand.dir.x + uy * cand.dir.y);
    if (absDot > bestAbsDot) {
      bestAbsDot = absDot;
      best = cand;
    }
  }
  if (!best) return null;
  if (config.maxSnapAngleDeg !== undefined && Number.isFinite(config.maxSnapAngleDeg)) {
    if (bestAbsDot < Math.cos(clamp(config.maxSnapAngleDeg, 1, 90) * DEG_TO_RAD)) return null;
  }
  return best;
}

/** 선형 투시 축 위로 점(px, py)을 직교 투영한다. */
export function projectPointOntoLinearAxis(
  axis: LockedLinearPerspectiveAxis,
  point: SnapPoint2D,
): { readonly point: SnapPoint2D; readonly distancePx: number } {
  const t = (point.x - axis.origin.x) * axis.dir.x + (point.y - axis.origin.y) * axis.dir.y;
  const projected: SnapPoint2D = { x: axis.origin.x + t * axis.dir.x, y: axis.origin.y + t * axis.dir.y };
  return { point: projected, distancePx: Math.hypot(projected.x - point.x, projected.y - point.y) };
}

/** 5점 어안 투시 오버레이용 원호 가이드 폴리라인들을 생성한다. */
export function generateFivePointFisheyeGuideArcs(
  rawConfig: FivePointFisheyeConfig,
  ringsPerAxis = 3,
  samplesPerArc = 32,
): readonly OverlayPolylineGuide[] {
  const cfg = normalizeFisheyeConfig(rawConfig);
  const guides: OverlayPolylineGuide[] = [];
  const steps = Math.round(clamp(samplesPerArc, 12, 96));
  const rings = Math.round(clamp(ringsPerAxis, 1, 8));
  const toPath = (pts: readonly SnapPoint2D[]): string =>
    pts.map((p, idx) => `${idx === 0 ? "M" : "L"} ${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`).join(" ");

  const rimPoints: SnapPoint2D[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    rimPoints.push(fisheyeLocalToWorld({ x: Math.cos(a) * cfg.radius, y: Math.sin(a) * cfg.radius }, cfg));
  }
  guides.push({ id: "fisheye-rim", category: "fisheye-rim", points: rimPoints, svgPath: `${toPath(rimPoints)} Z` });

  const rEff = cfg.radius / cfg.curvature;
  const fractions: number[] = [0];
  for (let i = 1; i <= rings; i += 1) fractions.push(-i / (rings + 1), i / (rings + 1));

  fractions.forEach((frac, idx) => {
    const y0 = frac * cfg.radius;
    const pts: SnapPoint2D[] = [];
    if (Math.abs(y0) < 1e-4) {
      pts.push(fisheyeLocalToWorld({ x: -cfg.radius, y: 0 }, cfg), fisheyeLocalToWorld({ x: cfg.radius, y: 0 }, cfg));
    } else {
      const cyArc = (y0 * y0 - rEff * rEff) / (2 * y0);
      const rArc = Math.hypot(rEff, cyArc);
      const startAngle = Math.atan2(-cyArc, -rEff);
      let delta = Math.atan2(-cyArc, rEff) - startAngle;
      if (y0 > 0 && delta > 0) delta -= Math.PI * 2;
      if (y0 < 0 && delta < 0) delta += Math.PI * 2;
      for (let s = 0; s <= steps; s += 1) {
        const a = startAngle + (delta * s) / steps;
        const lx = Math.cos(a) * rArc;
        const ly = cyArc + Math.sin(a) * rArc;
        if (Math.hypot(lx, ly) <= cfg.radius + 0.5) pts.push(fisheyeLocalToWorld({ x: lx, y: ly }, cfg));
      }
    }
    if (pts.length >= 2) guides.push({ id: `fisheye-h-${idx}`, category: "fisheye-arc", points: pts, svgPath: toPath(pts) });
  });

  fractions.forEach((frac, idx) => {
    const x0 = frac * cfg.radius;
    const pts: SnapPoint2D[] = [];
    if (Math.abs(x0) < 1e-4) {
      pts.push(fisheyeLocalToWorld({ x: 0, y: -cfg.radius }, cfg), fisheyeLocalToWorld({ x: 0, y: cfg.radius }, cfg));
    } else {
      const cxArc = (x0 * x0 - rEff * rEff) / (2 * x0);
      const rArc = Math.hypot(rEff, cxArc);
      const startAngle = Math.atan2(-rEff, -cxArc);
      let delta = Math.atan2(rEff, -cxArc) - startAngle;
      if (x0 > 0 && delta < 0) delta += Math.PI * 2;
      if (x0 < 0 && delta > 0) delta -= Math.PI * 2;
      for (let s = 0; s <= steps; s += 1) {
        const a = startAngle + (delta * s) / steps;
        const lx = cxArc + Math.cos(a) * rArc;
        const ly = Math.sin(a) * rArc;
        if (Math.hypot(lx, ly) <= cfg.radius + 0.5) pts.push(fisheyeLocalToWorld({ x: lx, y: ly }, cfg));
      }
    }
    if (pts.length >= 2) guides.push({ id: `fisheye-v-${idx}`, category: "fisheye-arc", points: pts, svgPath: toPath(pts) });
  });

  return guides;
}
