/**
 * Wave 137 — 컷 내 시선 동선 곡선(Z/S/수직/대각/엉킴) 분석 및
 * 연속 컷 전환 시선 연속성(Gaze Hand-off) 감사 솔버.
 */

import { computeGazeAuditManifestSha256Hex } from "./gaze-flow-sha256";
import {
  DEFAULT_ROW_BAND_TOLERANCE_Y,
  type CutHandoffAuditResult,
  type EpisodeGazeAuditResult,
  type GazeAuditOptions,
  type GazeEpisodeInput,
  type GazeFlowPattern,
  type GazeFlowViolation,
  type GazePanelInput,
  type GazePathNode,
  type GazePoint2D,
  type GazeReadingDirection,
  type GazeVector2D,
  type GazeViolationCode,
  type NormalizedGazePanel,
  type OutwardGazeLeakFinding,
  type PanelBoundaryEdge,
  type PanelGazeAuditResult,
} from "./gaze-flow-types";
import {
  buildPanelGazePath,
  computePanelVisualMass,
  detectBalloonReadingOrderReversals,
  detectGazePathIntersections,
  estimateVisualReadingOrder,
  normalizeGazePanel,
  normalizeVector2D,
  round2,
  round4,
  sanitizeFinite,
} from "./visual-weight-and-reading-order";

const EPSILON = 1e-9;
const DEFAULT_MAX_HORIZONTAL_JUMP_RATIO = 0.55;
const DEFAULT_MAX_OUTWARD_LEAK_RAY_DIST = 0.42;

interface ResolvedAuditConfig {
  readonly rowBandToleranceY: number;
  readonly maxHorizontalJumpRatio: number;
  readonly maxOutwardLeakRayDist: number;
}

function resolveAuditConfig(
  readingDirection: GazeReadingDirection,
  options?: GazeAuditOptions,
): ResolvedAuditConfig {
  return {
    rowBandToleranceY: sanitizeFinite(
      options?.rowBandToleranceY,
      DEFAULT_ROW_BAND_TOLERANCE_Y[readingDirection],
      0.01,
      0.35,
    ),
    maxHorizontalJumpRatio: sanitizeFinite(
      options?.maxHorizontalJumpRatio,
      DEFAULT_MAX_HORIZONTAL_JUMP_RATIO,
      0.2,
      0.95,
    ),
    maxOutwardLeakRayDist: sanitizeFinite(
      options?.maxOutwardLeakRayDist,
      DEFAULT_MAX_OUTWARD_LEAK_RAY_DIST,
      0.15,
      0.9,
    ),
  };
}

function vectorToBoundaryEdge(vec: GazeVector2D): PanelBoundaryEdge {
  if (Math.abs(vec.dx) > Math.abs(vec.dy)) {
    return vec.dx >= 0 ? "right" : "left";
  }
  return vec.dy >= 0 ? "bottom" : "top";
}

function computeRayBoundaryExit(
  origin: GazePoint2D,
  dir: GazeVector2D,
): { readonly edge: PanelBoundaryEdge; readonly distance: number } {
  let bestDist = Number.POSITIVE_INFINITY;
  let bestEdge: PanelBoundaryEdge = "bottom";

  if (dir.dx > EPSILON) {
    const t = (1 - origin.x) / dir.dx;
    if (t >= 0 && t < bestDist) {
      bestDist = t;
      bestEdge = "right";
    }
  } else if (dir.dx < -EPSILON) {
    const t = -origin.x / dir.dx;
    if (t >= 0 && t < bestDist) {
      bestDist = t;
      bestEdge = "left";
    }
  }

  if (dir.dy > EPSILON) {
    const t = (1 - origin.y) / dir.dy;
    if (t >= 0 && t < bestDist) {
      bestDist = t;
      bestEdge = "bottom";
    }
  } else if (dir.dy < -EPSILON) {
    const t = -origin.y / dir.dy;
    if (t >= 0 && t < bestDist) {
      bestDist = t;
      bestEdge = "top";
    }
  }

  return {
    edge: bestEdge,
    distance: Number.isFinite(bestDist) ? round4(bestDist) : 1,
  };
}

function isAllowedExitEdge(
  edge: PanelBoundaryEdge,
  readingDirection: GazeReadingDirection,
): boolean {
  if (readingDirection === "vertical-webtoon-ltr") {
    return edge === "bottom";
  }
  if (readingDirection === "page-comic-ltr") {
    return edge === "right" || edge === "bottom";
  }
  return edge === "left" || edge === "bottom";
}

function detectOutwardGazeLeaks(
  panel: NormalizedGazePanel,
  readingDirection: GazeReadingDirection,
  maxRayDist: number,
): readonly OutwardGazeLeakFinding[] {
  const findings: OutwardGazeLeakFinding[] = [];
  for (let i = 0; i < panel.elements.length; i += 1) {
    const el = panel.elements[i];
    if (!el || !el.gazeDir) continue;
    if (el.kind !== "character-face" && el.kind !== "lead-line-arrow") continue;

    let anchoredInternally = false;
    for (let j = 0; j < panel.elements.length; j += 1) {
      if (i === j) continue;
      const other = panel.elements[j];
      if (!other) continue;
      const vx = other.cx - el.cx;
      const vy = other.cy - el.cy;
      const dist = Math.hypot(vx, vy);
      if (dist <= 0.02) continue;
      const cosAngle = (el.gazeDir.dx * vx + el.gazeDir.dy * vy) / dist;
      if (cosAngle >= 0.72) {
        anchoredInternally = true;
        break;
      }
    }
    if (anchoredInternally) continue;

    const exitHit = computeRayBoundaryExit({ x: el.cx, y: el.cy }, el.gazeDir);
    if (!isAllowedExitEdge(exitHit.edge, readingDirection) && exitHit.distance <= maxRayDist) {
      findings.push({
        elementId: el.elementId,
        kind: el.kind,
        leakEdge: exitHit.edge,
        gazeDir: el.gazeDir,
        rayDistanceToEdge: exitHit.distance,
      });
    }
  }
  return findings;
}

interface TrajectoryMetrics {
  readonly pattern: GazeFlowPattern;
  readonly meanTurnAngleDeg: number;
  readonly maxTurnAngleDeg: number;
  readonly totalPathLengthNorm: number;
  readonly backtrackingDistanceNorm: number;
  readonly backtrackingRatio: number;
  readonly exitTangent: GazeVector2D;
}

function analyzeTrajectoryMetrics(
  panel: NormalizedGazePanel,
  gazePath: readonly GazePathNode[],
  readingDirection: GazeReadingDirection,
  reversalCount: number,
  intersectionCount: number,
): TrajectoryMetrics {
  const defaultExit: GazeVector2D =
    readingDirection === "manga-rtl"
      ? { dx: -0.35, dy: 0.9367 }
      : readingDirection === "page-comic-ltr"
        ? { dx: 0.35, dy: 0.9367 }
        : { dx: 0, dy: 1 };

  if (gazePath.length === 0) {
    return {
      pattern: "vertical-drop",
      meanTurnAngleDeg: 0,
      maxTurnAngleDeg: 0,
      totalPathLengthNorm: 0,
      backtrackingDistanceNorm: 0,
      backtrackingRatio: 0,
      exitTangent: defaultExit,
    };
  }

  const lastNode = gazePath[gazePath.length - 1];
  const lastElement = lastNode
    ? panel.elements.find((e) => e.elementId === lastNode.elementId) ?? null
    : null;

  if (gazePath.length === 1) {
    return {
      pattern: "vertical-drop",
      meanTurnAngleDeg: 0,
      maxTurnAngleDeg: 0,
      totalPathLengthNorm: 0,
      backtrackingDistanceNorm: 0,
      backtrackingRatio: 0,
      exitTangent: lastElement?.gazeDir ?? defaultExit,
    };
  }

  const primaryXSign = readingDirection === "manga-rtl" ? -1 : 1;
  const aspect = panel.aspectRatio;
  let totalPathLengthNorm = 0;
  let backtrackingDistanceNorm = 0;
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;

  const segDirsPx: GazeVector2D[] = [];
  const segDeltasNorm: Array<{ readonly dx: number; readonly dy: number; readonly len: number }> = [];
  let hasHorizontalScanBar = false;
  let maxAbsDx = 0;

  for (let i = 0; i < gazePath.length; i += 1) {
    const node = gazePath[i];
    if (!node) continue;
    minX = Math.min(minX, node.center.x);
    maxX = Math.max(maxX, node.center.x);
    minY = Math.min(minY, node.center.y);
    maxY = Math.max(maxY, node.center.y);
  }

  for (let i = 0; i < gazePath.length - 1; i += 1) {
    const a = gazePath[i];
    const b = gazePath[i + 1];
    if (!a || !b) continue;
    const dx = b.center.x - a.center.x;
    const dy = b.center.y - a.center.y;
    const lenNorm = Math.hypot(dx, dy);
    totalPathLengthNorm += lenNorm;
    maxAbsDx = Math.max(maxAbsDx, Math.abs(dx));
    segDeltasNorm.push({ dx, dy, len: lenNorm });

    if (
      Math.abs(dx) >= 0.22 &&
      (Math.abs(dy) < 0.08 || Math.abs(dy) / (Math.abs(dx) + EPSILON) < 0.22)
    ) {
      hasHorizontalScanBar = true;
    }

    if (dy < -0.025) {
      backtrackingDistanceNorm += lenNorm;
    } else if (Math.abs(dy) <= 0.05 && dx * primaryXSign < -0.08) {
      backtrackingDistanceNorm += Math.abs(dx);
    }

    const pxDir = normalizeVector2D({ dx: dx * aspect, dy });
    if (pxDir) segDirsPx.push(pxDir);
  }

  let turnSum = 0;
  let turnCount = 0;
  let maxTurnAngleDeg = 0;
  for (let i = 0; i < segDirsPx.length - 1; i += 1) {
    const u = segDirsPx[i];
    const v = segDirsPx[i + 1];
    if (!u || !v) continue;
    const dot = Math.max(-1, Math.min(1, u.dx * v.dx + u.dy * v.dy));
    const angleDeg = (Math.acos(dot) * 180) / Math.PI;
    turnSum += angleDeg;
    turnCount += 1;
    if (angleDeg > maxTurnAngleDeg) maxTurnAngleDeg = angleDeg;
  }

  const meanTurnAngleDeg = turnCount > 0 ? round2(turnSum / turnCount) : 0;
  const backtrackingRatio =
    totalPathLengthNorm > EPSILON ? round4(backtrackingDistanceNorm / totalPathLengthNorm) : 0;

  let prevXDir = 0;
  let horizontalSignFlips = 0;
  let allMonotonicDown = true;
  for (let i = 0; i < segDeltasNorm.length; i += 1) {
    const seg = segDeltasNorm[i];
    if (!seg) continue;
    if (seg.dy < -0.025) allMonotonicDown = false;
    if (Math.abs(seg.dx) >= 0.1) {
      const sign = seg.dx > 0 ? 1 : -1;
      if (prevXDir !== 0 && sign !== prevXDir) horizontalSignFlips += 1;
      prevXDir = sign;
    }
  }

  const xSpread = maxX - minX;
  const ySpread = maxY - minY;
  let pattern: GazeFlowPattern;

  if (
    intersectionCount > 0 ||
    backtrackingRatio >= 0.16 ||
    (reversalCount > 0 && backtrackingRatio > 0.05) ||
    (!allMonotonicDown && horizontalSignFlips >= 2)
  ) {
    pattern = "tangled-zigzag";
  } else if (
    xSpread <= 0.24 ||
    (ySpread >= 0.25 && maxAbsDx <= 0.22 && meanTurnAngleDeg <= 35)
  ) {
    pattern = "vertical-drop";
  } else if (horizontalSignFlips === 0 && meanTurnAngleDeg <= 42 && xSpread > 0.24) {
    pattern = "diagonal-slash";
  } else if (hasHorizontalScanBar) {
    pattern = "z-flow";
  } else if (horizontalSignFlips >= 1 && meanTurnAngleDeg < 120) {
    pattern = "s-flow";
  } else {
    pattern = "z-flow";
  }

  const lastSeg = segDeltasNorm[segDeltasNorm.length - 1];
  const exitTangent =
    (lastSeg ? normalizeVector2D({ dx: lastSeg.dx, dy: lastSeg.dy }) : null) ??
    lastElement?.gazeDir ??
    defaultExit;

  return {
    pattern,
    meanTurnAngleDeg,
    maxTurnAngleDeg: round2(maxTurnAngleDeg),
    totalPathLengthNorm: round4(totalPathLengthNorm),
    backtrackingDistanceNorm: round4(backtrackingDistanceNorm),
    backtrackingRatio,
    exitTangent,
  };
}

function edgeLabelKo(edge: PanelBoundaryEdge): string {
  switch (edge) {
    case "left":
      return "좌측 경계";
    case "right":
      return "우측 경계";
    case "top":
      return "상단 경계";
    case "bottom":
      return "하단 경계";
  }
}

/**
 * 단일 컷의 시각적 무게중심, 읽기 순서, 시선 궤적 패턴, 역독·교차·외곽 이탈을 감사한다.
 */
export function auditSinglePanelGazeFlow(
  panelInput: GazePanelInput,
  panelIndex: number,
  readingDirection: GazeReadingDirection,
  options?: GazeAuditOptions,
): PanelGazeAuditResult {
  const cfg = resolveAuditConfig(readingDirection, options);
  const panel = normalizeGazePanel(panelInput, panelIndex);
  const visualMass = computePanelVisualMass(panel.elements);
  const visualReadingOrder = estimateVisualReadingOrder(
    panel.elements,
    readingDirection,
    cfg.rowBandToleranceY,
  );
  const reversals = detectBalloonReadingOrderReversals(visualReadingOrder);
  const gazePath = buildPanelGazePath(panel.elements, visualReadingOrder);
  const intersections = detectGazePathIntersections(gazePath);
  const outwardLeaks = detectOutwardGazeLeaks(panel, readingDirection, cfg.maxOutwardLeakRayDist);
  const metrics = analyzeTrajectoryMetrics(
    panel,
    gazePath,
    readingDirection,
    reversals.length,
    intersections.length,
  );

  const violations: GazeFlowViolation[] = [];
  for (let i = 0; i < reversals.length; i += 1) {
    const rev = reversals[i];
    if (!rev) continue;
    violations.push({
      code: "balloon-reading-order-reversal",
      severity: "error",
      panelId: panel.panelId,
      nextPanelId: null,
      elementIds: [rev.earlierVisualId, rev.laterVisualId],
      metricValue: rev.earlierScriptOrder - rev.laterScriptOrder,
      messageKo: `말풍선 '${rev.earlierVisualId}'(대본 ${rev.earlierScriptOrder}번)이 '${rev.laterVisualId}'(대본 ${rev.laterScriptOrder}번)보다 먼저 읽혀 발화 순서가 뒤집힙니다.`,
    });
  }

  for (let i = 0; i < intersections.length; i += 1) {
    const hit = intersections[i];
    if (!hit) continue;
    violations.push({
      code: "self-intersecting-gaze-path",
      severity: "error",
      panelId: panel.panelId,
      nextPanelId: null,
      elementIds: [
        hit.firstEdgeElementIds[0],
        hit.firstEdgeElementIds[1],
        hit.secondEdgeElementIds[0],
        hit.secondEdgeElementIds[1],
      ],
      metricValue: i + 1,
      messageKo: `시선 구간(${hit.firstEdgeElementIds[0]}→${hit.firstEdgeElementIds[1]})과 (${hit.secondEdgeElementIds[0]}→${hit.secondEdgeElementIds[1]})이 컷 내부(${round2(hit.point.x * 100)}%, ${round2(hit.point.y * 100)}%)에서 교차합니다.`,
    });
  }

  for (let i = 0; i < outwardLeaks.length; i += 1) {
    const leak = outwardLeaks[i];
    if (!leak) continue;
    violations.push({
      code: "outward-gaze-leak",
      severity: "warning",
      panelId: panel.panelId,
      nextPanelId: null,
      elementIds: [leak.elementId],
      metricValue: leak.rayDistanceToEdge,
      messageKo: `요소 '${leak.elementId}'의 시선이 내부 대상 없이 ${edgeLabelKo(leak.leakEdge)} 밖으로 빠져 독자 집중이 분산됩니다.`,
    });
  }

  const firstNode = gazePath[0];
  const lastNode = gazePath[gazePath.length - 1];
  const entryPoint: GazePoint2D = firstNode ? firstNode.center : { x: 0.5, y: 0.15 };
  const exitPoint: GazePoint2D = lastNode ? lastNode.center : { x: 0.5, y: 0.85 };

  let rawScore = 100;
  rawScore -= reversals.length * 24;
  rawScore -= intersections.length * 26;
  rawScore -= outwardLeaks.length * 14;
  rawScore -= metrics.backtrackingRatio * 35;
  rawScore -= (100 - visualMass.visualBalanceScore) * 0.14;
  if (metrics.pattern === "tangled-zigzag") rawScore -= 6;
  const panelFlowScore = round2(Math.max(0, Math.min(100, rawScore)));

  return {
    panelIndex,
    panel,
    visualMass,
    visualReadingOrder,
    gazePath,
    pattern: metrics.pattern,
    meanTurnAngleDeg: metrics.meanTurnAngleDeg,
    maxTurnAngleDeg: metrics.maxTurnAngleDeg,
    totalPathLengthNorm: metrics.totalPathLengthNorm,
    backtrackingDistanceNorm: metrics.backtrackingDistanceNorm,
    backtrackingRatio: metrics.backtrackingRatio,
    entryPoint,
    exitPoint,
    exitTangent: metrics.exitTangent,
    exitDirection: vectorToBoundaryEdge(metrics.exitTangent),
    reversals,
    intersections,
    outwardLeaks,
    violations,
    panelFlowScore,
  };
}

function resolveExitLeadVector(fromAudit: PanelGazeAuditResult): GazeVector2D {
  const path = fromAudit.gazePath;
  if (path.length === 0) return fromAudit.exitTangent;

  const tailStart = Math.max(0, path.length - 2);
  for (let i = path.length - 1; i >= tailStart; i -= 1) {
    const node = path[i];
    if (!node) continue;
    const el = fromAudit.panel.elements.find((e) => e.elementId === node.elementId);
    if (el && el.kind === "lead-line-arrow" && el.gazeDir) return el.gazeDir;
  }

  const lastNode = path[path.length - 1];
  const lastEl = lastNode
    ? fromAudit.panel.elements.find((e) => e.elementId === lastNode.elementId)
    : undefined;
  if (lastEl && lastEl.gazeDir) {
    const blended = normalizeVector2D({
      dx: lastEl.gazeDir.dx * 0.6 + fromAudit.exitTangent.dx * 0.4,
      dy: lastEl.gazeDir.dy * 0.6 + fromAudit.exitTangent.dy * 0.4,
    });
    if (blended) return blended;
  }

  return fromAudit.exitTangent;
}

/**
 * 연속 컷 `i → i+1` 사이의 출구점→진입점 수평 도약 비율과 시선 유도 방향 정합성을 평가한다.
 */
export function auditCutHandoff(
  fromAudit: PanelGazeAuditResult,
  toAudit: PanelGazeAuditResult,
  readingDirection: GazeReadingDirection,
  options?: GazeAuditOptions,
): CutHandoffAuditResult {
  const cfg = resolveAuditConfig(readingDirection, options);
  const exitPoint = fromAudit.exitPoint;
  const entryPoint = toAudit.entryPoint;
  const horizontalJumpRatio = round4(Math.abs(exitPoint.x - entryPoint.x));

  const isSameHorizontalRow =
    readingDirection !== "vertical-webtoon-ltr" &&
    fromAudit.panel.pageRow !== null &&
    toAudit.panel.pageRow !== null &&
    fromAudit.panel.pageRow === toAudit.panel.pageRow;

  const gutterNorm = fromAudit.panel.gutterAfterPx / Math.max(120, fromAudit.panel.heightPx);
  let targetVecRaw: GazeVector2D;
  let effectiveJumpRatio: number;

  if (isSameHorizontalRow) {
    const colDir = readingDirection === "manga-rtl" ? -1 : 1;
    const acrossSeam =
      readingDirection === "manga-rtl"
        ? exitPoint.x + (1 - entryPoint.x)
        : 1 - exitPoint.x + entryPoint.x;
    const verticalJump = Math.abs(exitPoint.y - entryPoint.y);
    effectiveJumpRatio = round4(Math.min(1, verticalJump * 0.65 + acrossSeam * 0.35));
    targetVecRaw = {
      dx: colDir * 1.08 + (entryPoint.x - exitPoint.x),
      dy: entryPoint.y - exitPoint.y,
    };
  } else {
    effectiveJumpRatio = horizontalJumpRatio;
    targetVecRaw = {
      dx: entryPoint.x - exitPoint.x,
      dy: 1 + gutterNorm + entryPoint.y - exitPoint.y,
    };
  }

  const targetVector = normalizeVector2D(targetVecRaw) ?? { dx: 0, dy: 1 };
  const exitLeadVector = resolveExitLeadVector(fromAudit);
  const exitVectorAlignment = round4(
    Math.max(
      -1,
      Math.min(1, exitLeadVector.dx * targetVector.dx + exitLeadVector.dy * targetVector.dy),
    ),
  );

  const jumpFactor = 1 - Math.min(1, effectiveJumpRatio / 0.85);
  const alignmentFactor = (exitVectorAlignment + 1) / 2;
  const handoffScore = round2(Math.max(0, Math.min(100, jumpFactor * 58 + alignmentFactor * 42)));

  const abruptJumpDetected =
    effectiveJumpRatio >= cfg.maxHorizontalJumpRatio ||
    (effectiveJumpRatio >= 0.4 && exitVectorAlignment < 0) ||
    handoffScore < 45;

  const violation: GazeFlowViolation | null = abruptJumpDetected
    ? {
        code: "abrupt-handoff-jump",
        severity: effectiveJumpRatio >= 0.65 || handoffScore < 35 ? "error" : "warning",
        panelId: fromAudit.panel.panelId,
        nextPanelId: toAudit.panel.panelId,
        elementIds: [
          fromAudit.gazePath[fromAudit.gazePath.length - 1]?.elementId ?? fromAudit.panel.panelId,
          toAudit.gazePath[0]?.elementId ?? toAudit.panel.panelId,
        ],
        metricValue: effectiveJumpRatio,
        messageKo: `컷 '${fromAudit.panel.panelId}' 출구에서 '${toAudit.panel.panelId}' 진입점까지 수평 도약(${round2(effectiveJumpRatio * 100)}%)이 커 시선이 끊깁니다.`,
      }
    : null;

  return {
    fromPanelIndex: fromAudit.panelIndex,
    toPanelIndex: toAudit.panelIndex,
    fromPanelId: fromAudit.panel.panelId,
    toPanelId: toAudit.panel.panelId,
    exitPoint,
    entryPoint,
    exitLeadVector,
    targetVector,
    horizontalJumpRatio,
    effectiveJumpRatio,
    exitVectorAlignment,
    isSameHorizontalRow,
    handoffScore,
    abruptJumpDetected,
    violation,
  };
}

/**
 * 에피소드 전체 컷의 시선 동선, 무게중심 균형, 컷 전환 시선 연속성을 감사하고
 * FIPS 180-4 SHA-256 매니페스트 지문을 생성한다.
 */
export function auditEpisodeGazeFlow(
  episode: GazeEpisodeInput,
  options?: GazeAuditOptions,
): EpisodeGazeAuditResult {
  const episodeId = episode.episodeId.trim().length > 0 ? episode.episodeId.trim() : "episode-1";
  const titleKo =
    episode.titleKo && episode.titleKo.trim().length > 0 ? episode.titleKo.trim() : episodeId;

  const panels: PanelGazeAuditResult[] = [];
  for (let i = 0; i < episode.panels.length; i += 1) {
    const rawPanel = episode.panels[i];
    if (rawPanel) {
      panels.push(auditSinglePanelGazeFlow(rawPanel, i, episode.readingDirection, options));
    }
  }

  const handoffs: CutHandoffAuditResult[] = [];
  for (let i = 0; i < panels.length - 1; i += 1) {
    const fromAudit = panels[i];
    const toAudit = panels[i + 1];
    if (fromAudit && toAudit) {
      handoffs.push(auditCutHandoff(fromAudit, toAudit, episode.readingDirection, options));
    }
  }

  const violations: GazeFlowViolation[] = [];
  const counts: Record<GazeViolationCode, number> = {
    "balloon-reading-order-reversal": 0,
    "self-intersecting-gaze-path": 0,
    "abrupt-handoff-jump": 0,
    "outward-gaze-leak": 0,
  };

  for (let i = 0; i < panels.length; i += 1) {
    const p = panels[i];
    if (!p) continue;
    for (let j = 0; j < p.violations.length; j += 1) {
      const v = p.violations[j];
      if (!v) continue;
      violations.push(v);
      counts[v.code] += 1;
    }
  }
  for (let i = 0; i < handoffs.length; i += 1) {
    const h = handoffs[i];
    if (h?.violation) {
      violations.push(h.violation);
      counts[h.violation.code] += 1;
    }
  }

  const averagePanelFlowScore =
    panels.length > 0
      ? round2(panels.reduce((acc, p) => acc + p.panelFlowScore, 0) / panels.length)
      : 100;
  const averageVisualBalanceScore =
    panels.length > 0
      ? round2(
          panels.reduce((acc, p) => acc + p.visualMass.visualBalanceScore, 0) / panels.length,
        )
      : 100;
  const averageHandoffScore =
    handoffs.length > 0
      ? round2(handoffs.reduce((acc, h) => acc + h.handoffScore, 0) / handoffs.length)
      : 100;

  const overallGazeFlowScore =
    handoffs.length > 0
      ? round2(averagePanelFlowScore * 0.68 + averageHandoffScore * 0.32)
      : averagePanelFlowScore;

  const manifestSha256 = computeGazeAuditManifestSha256Hex({
    episodeId,
    readingDirection: episode.readingDirection,
    panels,
    handoffs,
    overallGazeFlowScore,
  });

  return {
    episodeId,
    titleKo,
    readingDirection: episode.readingDirection,
    panels,
    handoffs,
    violations,
    violationCounts: counts,
    overallGazeFlowScore,
    averagePanelFlowScore,
    averageVisualBalanceScore,
    averageHandoffScore,
    manifestSha256,
  };
}
