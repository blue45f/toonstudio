/**
 * 원근 투시자(1·2·3·5점 어안) · N-축 대칭자 · 컷 내 등분 분할자 통합 0ms 자석 펜 스냅 엔진.
 *
 * - 단일 진입점으로 포인터 다운(`createMagneticRulerSnapSession`)과
 *   실시간 포인터 이동(`snapPointerWithMagneticRuler`)·스트로크 일괄 변환(`snapStrokeWithMagneticRuler`),
 *   오버레이 기하(`buildMagneticRulerOverlayGeometry`)를 제공한다.
 */

import {
  generateFivePointFisheyeGuideArcs,
  getFivePointFisheyeVanishingPoints,
  projectPointOntoFivePointFisheyeAxis,
  projectPointOntoLinearAxis,
  resolveFivePointFisheyeAxis,
  resolveHorizonAngleRad,
  resolveLinearPerspectiveAxis,
} from "./studio-perspective-fisheye-math";
import {
  computeDivisionGuideLines,
  computeSymmetryTransforms,
  generateSymmetryMirrorPoints,
  getSymmetryAxisAnglesRad,
  snapPointToDivisionRuler,
  snapPointToNearestSymmetryAxis,
} from "./studio-symmetry-division-rulers";

import type {
  LockedDivisionAxis,
  LockedGuideAxis,
  MagneticRulerEngineConfig,
  MagneticRulerOverlayGeometry,
  MagneticRulerSnapSession,
  MagneticRulerSnapStepResult,
  MagneticRulerStrokeResult,
  MagneticSnapKind,
  OverlayLineSegment,
  OverlayPolylineGuide,
  PerspectiveMode,
  PointerSnapInput,
  SnapPoint2D,
  SymmetryMirroredPoint,
  VanishingPointSpec,
} from "./studio-ruler-snap-types";

export * from "./studio-ruler-snap-types";
export {
  GOLDEN_MAJOR_RATIO,
  GOLDEN_MINOR_RATIO,
  GOLDEN_RATIO,
  computeDivisionGuideLines,
  computeSymmetryTransforms,
  generateSymmetryMirrorPoints,
  generateSymmetryMirrorStrokes,
  snapPointToDivisionRuler,
  snapPointToNearestSymmetryAxis,
} from "./studio-symmetry-division-rulers";
export {
  createPerspectivePresetConfig,
  generateFivePointFisheyeGuideArcs,
  getFivePointFisheyeVanishingPoints,
  projectPointOntoFivePointFisheyeAxis,
  projectPointOntoLinearAxis,
  resolveFivePointFisheyeAxis,
  resolveLinearPerspectiveAxis,
} from "./studio-perspective-fisheye-math";

function isFinitePoint(pt: SnapPoint2D): boolean {
  return Number.isFinite(pt.x) && Number.isFinite(pt.y);
}

function perspectiveKindTag(mode: PerspectiveMode): MagneticSnapKind {
  if (mode === "1p") return "perspective-1p";
  if (mode === "2p") return "perspective-2p";
  if (mode === "3p") return "perspective-3p";
  return "perspective-5p-fisheye";
}

function projectOntoLockedAxis(
  axis: LockedGuideAxis,
  point: SnapPoint2D,
  config: MagneticRulerEngineConfig,
): { readonly point: SnapPoint2D; readonly distancePx: number; readonly kind: MagneticSnapKind; readonly snapped: boolean } {
  if (axis.kind === "linear") {
    const res = projectPointOntoLinearAxis(axis, point);
    return { point: res.point, distancePx: res.distancePx, kind: perspectiveKindTag(config.perspective?.mode ?? "1p"), snapped: true };
  }
  if (axis.kind === "fisheye") {
    const res = projectPointOntoFivePointFisheyeAxis(axis, point);
    return {
      point: res.point,
      distancePx: res.distancePx,
      kind: res.passthrough ? "none" : "perspective-5p-fisheye",
      snapped: !res.passthrough,
    };
  }
  if (axis.orientation === "vertical") {
    return { point: { x: axis.coordinate, y: point.y }, distancePx: Math.abs(point.x - axis.coordinate), kind: "division", snapped: true };
  }
  return { point: { x: point.x, y: axis.coordinate }, distancePx: Math.abs(point.y - axis.coordinate), kind: "division", snapped: true };
}

/** 실시간 0ms 자석 스냅 세션을 포인터 다운 시점에 생성한다. */
export function createMagneticRulerSnapSession(
  config: MagneticRulerEngineConfig,
  start: PointerSnapInput,
): MagneticRulerSnapSession {
  const symmetryTransforms = computeSymmetryTransforms(config.symmetry);
  let effectiveStart: SnapPoint2D = { x: start.x, y: start.y };

  const seamSnap = snapPointToNearestSymmetryAxis(effectiveStart, config.symmetry);
  if (seamSnap.snapped) effectiveStart = seamSnap.point;

  if (config.division?.enabled && !config.perspective?.enabled) {
    const divStart = snapPointToDivisionRuler(effectiveStart, config.division);
    if (divStart.snapped) effectiveStart = divStart.point;
  }

  return { config, start: effectiveStart, lockedAxis: null, freehandPassthrough: false, symmetryTransforms };
}

/**
 * 실시간 포인터 샘플 1건을 가장 가까운 활성 가이드 축(원근 투시·어안·등분 분할)으로
 * 0ms 지연 스냅하고, 활성 대칭자에 따라 N-축 미러 포인트까지 즉시 반환한다.
 */
export function snapPointerWithMagneticRuler(
  session: MagneticRulerSnapSession,
  sample: PointerSnapInput,
): MagneticRulerSnapStepResult {
  const rawPoint: SnapPoint2D = { x: sample.x, y: sample.y };
  if (!isFinitePoint(rawPoint)) {
    return {
      session,
      point: rawPoint,
      snapped: false,
      snapKind: "none",
      axisId: null,
      distanceToGuidePx: 0,
      mirroredPoints: generateSymmetryMirrorPoints(sample, session.config.symmetry, session.symmetryTransforms),
    };
  }

  const finalize = (
    nextSession: MagneticRulerSnapSession,
    candidatePt: SnapPoint2D,
    snapped: boolean,
    snapKind: MagneticSnapKind,
    axisId: string | null,
    distanceToGuidePx: number,
  ): MagneticRulerSnapStepResult => {
    let finalPt = candidatePt;
    let finalSnapped = snapped;
    let finalKind = snapKind;
    let finalDist = distanceToGuidePx;
    if (!finalSnapped) {
      const seam = snapPointToNearestSymmetryAxis(finalPt, nextSession.config.symmetry);
      if (seam.snapped) {
        finalPt = seam.point;
        finalSnapped = true;
        finalKind = "symmetry-axis";
        finalDist = seam.distancePx;
      }
    }
    const mirroredPoints = generateSymmetryMirrorPoints(
      { ...sample, x: finalPt.x, y: finalPt.y },
      nextSession.config.symmetry,
      nextSession.symmetryTransforms,
    );
    return { session: nextSession, point: finalPt, snapped: finalSnapped, snapKind: finalKind, axisId, distanceToGuidePx: finalDist, mirroredPoints };
  };

  if (session.freehandPassthrough) return finalize(session, rawPoint, false, "none", null, 0);

  if (session.lockedAxis) {
    const projected = projectOntoLockedAxis(session.lockedAxis, rawPoint, session.config);
    return finalize(session, projected.point, projected.snapped, projected.kind, session.lockedAxis.axisId, projected.distancePx);
  }

  const perspective = session.config.perspective?.enabled ? session.config.perspective : null;
  const division = session.config.division?.enabled ? session.config.division : null;
  if (!perspective && !division) return finalize(session, rawPoint, false, "none", null, 0);

  const moved = Math.hypot(rawPoint.x - session.start.x, rawPoint.y - session.start.y);
  const minLock = perspective?.minLockDistancePx ?? 3;
  const hasHintDir = sample.dx !== undefined && sample.dy !== undefined && Math.hypot(sample.dx, sample.dy) > 1e-4;

  if (moved < minLock && !hasHintDir) {
    if (division && !perspective) {
      const divImmediate = snapPointToDivisionRuler(rawPoint, division);
      if (divImmediate.snapped && divImmediate.axis) {
        return finalize(session, divImmediate.point, true, "division", divImmediate.axis.axisId, divImmediate.distancePx);
      }
    }
    return finalize(session, rawPoint, false, "none", null, 0);
  }

  const dragTarget: SnapPoint2D =
    moved >= minLock ? rawPoint : { x: session.start.x + (sample.dx ?? 0), y: session.start.y + (sample.dy ?? 0) };

  let perspectiveAxis: LockedGuideAxis | null = null;
  let perspectiveDist = Number.POSITIVE_INFINITY;
  if (perspective) {
    perspectiveAxis =
      perspective.mode === "5p-fisheye" && perspective.fisheye
        ? resolveFivePointFisheyeAxis(perspective.fisheye, session.start, dragTarget, perspective.maxSnapAngleDeg)
        : resolveLinearPerspectiveAxis(perspective, session.start, dragTarget);
    if (perspectiveAxis) {
      perspectiveDist = projectOntoLockedAxis(perspectiveAxis, rawPoint, session.config).distancePx;
    }
  }

  let divisionAxis: LockedDivisionAxis | null = null;
  let divisionDist = Number.POSITIVE_INFINITY;
  if (division) {
    const lockOrientation: "vertical" | "horizontal" =
      Math.abs(dragTarget.y - session.start.y) >= Math.abs(dragTarget.x - session.start.x) ? "vertical" : "horizontal";
    const divRes = snapPointToDivisionRuler(rawPoint, division, {
      lockOrientation,
      fallbackThresholdPx: perspective ? 18 : Number.POSITIVE_INFINITY,
    });
    if (divRes.snapped && divRes.axis) {
      divisionAxis = divRes.axis;
      divisionDist = divRes.distancePx;
    }
  }

  const priority = session.config.priority ?? "nearest";
  const chosenAxis: LockedGuideAxis | null =
    perspectiveAxis && divisionAxis
      ? priority === "perspective-first"
        ? perspectiveAxis
        : priority === "division-first"
          ? divisionAxis
          : divisionDist < perspectiveDist
            ? divisionAxis
            : perspectiveAxis
      : (perspectiveAxis ?? divisionAxis);

  if (!chosenAxis) {
    const nextSession: MagneticRulerSnapSession = perspective?.maxSnapAngleDeg
      ? { ...session, freehandPassthrough: true }
      : session;
    return finalize(nextSession, rawPoint, false, "none", null, 0);
  }

  const lockedSession: MagneticRulerSnapSession = { ...session, lockedAxis: chosenAxis };
  const projected = projectOntoLockedAxis(chosenAxis, rawPoint, session.config);
  return finalize(lockedSession, projected.point, projected.snapped, projected.kind, chosenAxis.axisId, projected.distancePx);
}

/** 완성/진행 중인 포인터 스트로크 전체를 0ms 자석 스냅 + 대칭 미러링으로 변환한다. */
export function snapStrokeWithMagneticRuler(
  config: MagneticRulerEngineConfig,
  samples: readonly PointerSnapInput[],
): MagneticRulerStrokeResult {
  if (samples.length === 0) {
    return { primaryStroke: [], mirroredStrokes: [], lockedKind: "none", lockedAxisId: null, maxResidualErrorPx: 0 };
  }
  let session = createMagneticRulerSnapSession(config, samples[0]!);
  const primaryStroke: SnapPoint2D[] = [];
  const mirroredStrokes: SymmetryMirroredPoint[][] = Array.from({ length: session.symmetryTransforms.length }, () => []);
  let lockedKind: MagneticSnapKind = "none";
  let lockedAxisId: string | null = null;
  let maxResidualErrorPx = 0;

  for (const sample of samples) {
    const step = snapPointerWithMagneticRuler(session, sample);
    session = step.session;
    primaryStroke.push(step.point);
    if (step.snapped && lockedKind === "none") {
      lockedKind = step.snapKind;
      lockedAxisId = step.axisId;
    }
    if (session.lockedAxis) {
      const verify = projectOntoLockedAxis(session.lockedAxis, step.point, config);
      if (verify.distancePx > maxResidualErrorPx) maxResidualErrorPx = verify.distancePx;
    }
    for (let b = 0; b < step.mirroredPoints.length; b += 1) mirroredStrokes[b]!.push(step.mirroredPoints[b]!);
  }

  return { primaryStroke, mirroredStrokes, lockedKind, lockedAxisId, maxResidualErrorPx };
}

/** 활성 투시·대칭·분할 자 설정 전체에서 SVG/Canvas 오버레이 가이드 도형을 생성한다. */
export function buildMagneticRulerOverlayGeometry(
  config: MagneticRulerEngineConfig,
  viewport: { readonly width: number; readonly height: number },
): MagneticRulerOverlayGeometry {
  const lines: OverlayLineSegment[] = [];
  const polylines: OverlayPolylineGuide[] = [];
  const vanishingPoints: VanishingPointSpec[] = [];
  const intersections: SnapPoint2D[] = [];
  const diag = Math.hypot(viewport.width, viewport.height) * 1.4;

  const pCfg = config.perspective;
  if (pCfg?.enabled) {
    if (pCfg.mode === "5p-fisheye" && pCfg.fisheye) {
      polylines.push(...generateFivePointFisheyeGuideArcs(pCfg.fisheye));
      const vps = getFivePointFisheyeVanishingPoints(pCfg.fisheye);
      vanishingPoints.push(
        { id: "vp-center", ...vps.center },
        { id: "vp-left", ...vps.left },
        { id: "vp-right", ...vps.right },
        { id: "vp-top", ...vps.top },
        { id: "vp-bottom", ...vps.bottom },
      );
    } else {
      const vpLimit = pCfg.mode === "1p" ? 1 : pCfg.mode === "2p" ? 2 : 3;
      const vps = pCfg.vanishingPoints.slice(0, vpLimit);
      vanishingPoints.push(...vps);
      for (const vp of vps) {
        for (let i = 0; i < 8; i += 1) {
          const a = (i * Math.PI) / 8;
          lines.push({
            id: `p-ray-${vp.id}-${i}`,
            category: "perspective",
            x1: vp.x - Math.cos(a) * diag,
            y1: vp.y - Math.sin(a) * diag,
            x2: vp.x + Math.cos(a) * diag,
            y2: vp.y + Math.sin(a) * diag,
          });
        }
      }
      if (vps.length >= 1) {
        const hRad = resolveHorizonAngleRad(pCfg);
        const anchor = vps[0]!;
        lines.push({
          id: "p-horizon",
          category: "horizon",
          x1: anchor.x - Math.cos(hRad) * diag,
          y1: anchor.y - Math.sin(hRad) * diag,
          x2: anchor.x + Math.cos(hRad) * diag,
          y2: anchor.y + Math.sin(hRad) * diag,
        });
      }
    }
  }

  const sCfg = config.symmetry;
  if (sCfg?.enabled && sCfg.mode !== "off") {
    getSymmetryAxisAnglesRad(sCfg).forEach((angle, idx) => {
      lines.push({
        id: `sym-axis-${idx}`,
        category: "symmetry",
        x1: sCfg.centerX - Math.cos(angle) * diag,
        y1: sCfg.centerY - Math.sin(angle) * diag,
        x2: sCfg.centerX + Math.cos(angle) * diag,
        y2: sCfg.centerY + Math.sin(angle) * diag,
      });
    });
  }

  const dCfg = config.division;
  if (dCfg?.enabled) {
    const set = computeDivisionGuideLines(dCfg);
    for (const v of set.verticals) lines.push({ id: v.id, category: "division", x1: v.x1, y1: v.y1, x2: v.x2, y2: v.y2 });
    for (const h of set.horizontals) lines.push({ id: h.id, category: "division", x1: h.x1, y1: h.y1, x2: h.x2, y2: h.y2 });
    intersections.push(...set.intersections);
  }

  return { lines, polylines, vanishingPoints, intersections };
}
