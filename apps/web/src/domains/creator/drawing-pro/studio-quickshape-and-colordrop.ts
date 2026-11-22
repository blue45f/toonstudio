/**
 * Procreate 식 클린룸 QuickShape(6종 최소자승 도형 자동 스냅) + ColorDrop 컨트롤러 통합 모듈.
 *
 * - 직선·원·타원·삼각형·사각형·호 6종 기하 모델 적합 솔버(`studio-quickshape-fitters.ts`)를
 *   통합해 자유곡선을 가장 적합한 기하 도형으로 자동 스냅한다.
 * - ColorDrop 드래그 거리(0..1) → ΔE/RGB 실시간 허용치 매핑 및 컨트롤러(`studio-colordrop-tolerance.ts`)를
 *   함께 노출한다.
 */

import {
  clampRange,
  clampUnit,
  cleanAndResampleStroke,
  fitCircleLeastSquares,
  fitEllipseLeastSquares,
  fitPcaLine,
  fitRectangleLeastSquares,
  fitTriangleLeastSquares,
  pointDistance,
  sampleEllipseOrArcPoints,
  type QuickShapePoint2D,
} from "./studio-quickshape-fitters";

export type { QuickShapePoint2D } from "./studio-quickshape-fitters";
export {
  CleanroomColorDropController,
  computeColorDropPreviewMask,
  computeDeltaE2000,
  computeDeltaE76,
  computeRgbEuclideanDistance,
  deltaEToleranceToDragDistance01,
  doesPixelMatchColorDrop,
  mapDragDistanceToColorTolerance,
  srgbToCieLab,
  type CieLabColor,
  type CleanroomColorDropControllerOptions,
  type CleanroomColorDropPhase,
  type CleanroomColorDropState,
  type ColorDropDistanceMetric,
  type ColorDropToleranceMappingOptions,
  type ColorDropToleranceSnapshot,
} from "./studio-colordrop-tolerance";

export type CleanroomQuickShapeKind =
  | "line"
  | "circle"
  | "ellipse"
  | "triangle"
  | "rectangle"
  | "arc";

export interface CleanroomQuickShapeOptions {
  /** 닫힘 판정: 시작-끝 거리 / 전체 호길이 상한. 기본값 0.24. */
  readonly closureRatio?: number;
  /** 닫힘 판정 절대 거리 하한(px). 기본값 24. */
  readonly closurePx?: number;
  /** 타원 장단축 비가 이 값 이하이면 원(circle)으로 스냅. 기본값 1.16. */
  readonly circleAspectMax?: number;
  /** 전체 도형 허용 정규화 RMSE(대각선 대비) 상한. 기본값 0.095. */
  readonly maxNormalizedRmse?: number;
  /** 직선 판정 정규화 RMSE 상한. 기본값 0.045. */
  readonly lineMaxNormalizedRmse?: number;
  /** 호(arc) 최소 중심각(도). 기본값 28. */
  readonly arcMinSweepDeg?: number;
  /** 호(arc) 최대 중심각(도). 초과 시 닫힌 원 후보로 처리. 기본값 320. */
  readonly arcMaxSweepDeg?: number;
  /** 최소자승 적합 전 등호길이 리샘플 점 개수. 기본값 64. */
  readonly resampleCount?: number;
  /** 스냅된 곡선(원·타원·호) 출력 점 개수. 기본값 64. */
  readonly snapSampleCount?: number;
}

export interface CleanroomQuickShapeResult {
  readonly kind: CleanroomQuickShapeKind;
  readonly closed: boolean;
  /** 0..1 적합 신뢰도 */
  readonly confidence: number;
  /** 바운딩 박스 대각선 대비 정규화 직교 RMSE */
  readonly rmseNormalized: number;
  /** 픽셀 단위 직교 RMSE */
  readonly rmsePx: number;
  /** 렌더링 가능한 스냅 정점 시퀀스 */
  readonly snappedPoints: readonly QuickShapePoint2D[];
  /** 직선(2)·삼각형(3)·사각형(4) 꼭짓점 */
  readonly vertices?: readonly QuickShapePoint2D[];
  /** 원·타원·호 중심점 */
  readonly center?: QuickShapePoint2D;
  /** 원·호 반지름 */
  readonly radius?: number;
  /** 타원 장반경 */
  readonly radiusX?: number;
  /** 타원 단반경 */
  readonly radiusY?: number;
  /** 타원·사각형 회전각(rad) */
  readonly rotationRad?: number;
  /** 호 시작각(rad) */
  readonly startAngleRad?: number;
  /** 호 끝각(rad) */
  readonly endAngleRad?: number;
  /** 호 진행 방향(반시계 여부) */
  readonly counterClockwise?: boolean;
  /** 6종 후보별 정규화 RMSE 진단표 (부적합 시 Infinity) */
  readonly candidateRmse: Readonly<Record<CleanroomQuickShapeKind, number>>;
}

/**
 * 자유곡선 점열을 직선·원·타원·삼각형·사각형·호 6종 기하 도형으로 최소자승 적합해 자동 스냅한다.
 * 어떤 도형에도 적합하지 않은 낙서/자유곡선은 null을 반환한다.
 */
export function recognizeCleanroomQuickShape(
  points: readonly QuickShapePoint2D[],
  options: CleanroomQuickShapeOptions = {},
): CleanroomQuickShapeResult | null {
  const closureRatio = clampRange(options.closureRatio ?? 0.24, 0.05, 0.45);
  const closurePx = Math.max(4, options.closurePx ?? 24);
  const circleAspectMax = clampRange(options.circleAspectMax ?? 1.16, 1.02, 1.4);
  const maxNormRmse = clampRange(options.maxNormalizedRmse ?? 0.065, 0.01, 0.25);
  const lineMaxNormRmse = clampRange(options.lineMaxNormalizedRmse ?? 0.045, 0.005, 0.15);
  const arcMinSweepRad = (clampRange(options.arcMinSweepDeg ?? 28, 10, 180) * Math.PI) / 180;
  const arcMaxSweepRad = (clampRange(options.arcMaxSweepDeg ?? 320, 180, 355) * Math.PI) / 180;
  const resampleCount = Math.round(clampRange(options.resampleCount ?? 64, 24, 160));
  const snapSampleCount = Math.round(clampRange(options.snapSampleCount ?? 64, 16, 128));

  const { cleaned, resampled, totalLength, diagonal, centroid } = cleanAndResampleStroke(
    points,
    resampleCount,
  );
  if (cleaned.length < 2 || diagonal < 8 || totalLength < 8) return null;

  const endGap = pointDistance(cleaned[0]!, cleaned[cleaned.length - 1]!);
  const lineFit = fitPcaLine(resampled);
  const circleFit = fitCircleLeastSquares(resampled);

  const absSweep = circleFit ? Math.abs(circleFit.signedSweepRad) : 0;
  const isClosed =
    cleaned.length >= 4
    && (endGap <= Math.max(closurePx, totalLength * closureRatio)
      || (endGap <= diagonal * 0.35 && absSweep >= arcMaxSweepRad));

  const candidateRmse: Record<CleanroomQuickShapeKind, number> = {
    line: Infinity,
    circle: Infinity,
    ellipse: Infinity,
    triangle: Infinity,
    rectangle: Infinity,
    arc: Infinity,
  };

  if (!isClosed) {
    const lineStraightness = lineFit.spanLen > 1e-6 ? totalLength / lineFit.spanLen : Infinity;
    if (lineStraightness <= 1.28) candidateRmse.line = lineFit.rmsePx / diagonal;

    if (
      circleFit
      && absSweep >= arcMinSweepRad
      && absSweep <= arcMaxSweepRad
      && circleFit.monotonicRatio >= 0.78
      && circleFit.radius <= diagonal * 6
    ) {
      candidateRmse.arc = circleFit.rmsePx / diagonal;
    }

    if (candidateRmse.line <= lineMaxNormRmse) {
      return {
        kind: "line",
        closed: false,
        confidence: clampUnit(1 - candidateRmse.line / Math.max(lineMaxNormRmse, 1e-6)),
        rmseNormalized: candidateRmse.line,
        rmsePx: lineFit.rmsePx,
        snappedPoints: [lineFit.start, lineFit.end],
        vertices: [lineFit.start, lineFit.end],
        candidateRmse,
      };
    }

    if (
      circleFit
      && candidateRmse.arc <= maxNormRmse
      && candidateRmse.arc < candidateRmse.line * 0.72
    ) {
      return {
        kind: "arc",
        closed: false,
        confidence: clampUnit(1 - candidateRmse.arc / maxNormRmse),
        rmseNormalized: candidateRmse.arc,
        rmsePx: circleFit.rmsePx,
        snappedPoints: sampleEllipseOrArcPoints(
          circleFit.cx,
          circleFit.cy,
          circleFit.radius,
          circleFit.radius,
          0,
          circleFit.startAngleRad,
          circleFit.endAngleRad,
          snapSampleCount,
          false,
        ),
        center: { x: circleFit.cx, y: circleFit.cy },
        radius: circleFit.radius,
        startAngleRad: circleFit.startAngleRad,
        endAngleRad: circleFit.endAngleRad,
        counterClockwise: circleFit.signedSweepRad >= 0,
        candidateRmse,
      };
    }
    return null;
  }

  const ellipseFit = fitEllipseLeastSquares(resampled);
  const triangleFit = fitTriangleLeastSquares(resampled, centroid, diagonal);
  const rectangleFit = fitRectangleLeastSquares(resampled, diagonal);

  const perimeterConsistent = (perimeter: number): boolean => {
    if (perimeter <= 1e-6) return false;
    const ratio = totalLength / perimeter;
    return ratio >= 0.72 && ratio <= 1.32;
  };
  const polygonPerimeter = (verts: readonly QuickShapePoint2D[]): number => {
    let p = 0;
    for (let i = 0; i < verts.length; i += 1) {
      p += pointDistance(verts[i]!, verts[(i + 1) % verts.length]!);
    }
    return p;
  };
  const ellipsePerimeterRamanujan = (a: number, b: number): number =>
    Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

  if (
    circleFit
    && absSweep >= Math.PI * 1.4
    && circleFit.monotonicRatio >= 0.72
    && perimeterConsistent(2 * Math.PI * circleFit.radius)
  ) {
    candidateRmse.circle = circleFit.rmsePx / diagonal;
  }
  if (ellipseFit && perimeterConsistent(ellipsePerimeterRamanujan(ellipseFit.rx, ellipseFit.ry))) {
    candidateRmse.ellipse = ellipseFit.rmsePx / diagonal;
  }
  if (triangleFit && perimeterConsistent(polygonPerimeter(triangleFit.vertices))) {
    candidateRmse.triangle = triangleFit.rmsePx / diagonal;
  }
  if (rectangleFit && perimeterConsistent(polygonPerimeter(rectangleFit.vertices))) {
    candidateRmse.rectangle = rectangleFit.rmsePx / diagonal;
  }

  const ellipseAspect = ellipseFit ? ellipseFit.rx / Math.max(1e-6, ellipseFit.ry) : Infinity;
  const preferCircleOverEllipse =
    circleFit !== null && Number.isFinite(candidateRmse.circle) && ellipseAspect <= circleAspectMax;

  const scores: Array<{ readonly kind: CleanroomQuickShapeKind; readonly score: number }> = [
    { kind: "circle", score: candidateRmse.circle },
    { kind: "ellipse", score: preferCircleOverEllipse ? Infinity : candidateRmse.ellipse + 0.002 },
    { kind: "triangle", score: candidateRmse.triangle },
    { kind: "rectangle", score: candidateRmse.rectangle + 0.001 },
  ];
  scores.sort((a, b) => a.score - b.score);

  const winner = scores[0]!;
  if (!Number.isFinite(winner.score) || candidateRmse[winner.kind] > maxNormRmse) return null;

  const rmseNormalized = candidateRmse[winner.kind];
  const confidence = clampUnit(1 - rmseNormalized / maxNormRmse);

  if (winner.kind === "circle" && circleFit) {
    return {
      kind: "circle",
      closed: true,
      confidence,
      rmseNormalized,
      rmsePx: circleFit.rmsePx,
      snappedPoints: sampleEllipseOrArcPoints(
        circleFit.cx,
        circleFit.cy,
        circleFit.radius,
        circleFit.radius,
        0,
        0,
        Math.PI * 2,
        snapSampleCount,
        true,
      ),
      center: { x: circleFit.cx, y: circleFit.cy },
      radius: circleFit.radius,
      candidateRmse,
    };
  }

  if (winner.kind === "ellipse" && ellipseFit) {
    return {
      kind: "ellipse",
      closed: true,
      confidence,
      rmseNormalized,
      rmsePx: ellipseFit.rmsePx,
      snappedPoints: sampleEllipseOrArcPoints(
        ellipseFit.cx,
        ellipseFit.cy,
        ellipseFit.rx,
        ellipseFit.ry,
        ellipseFit.rotationRad,
        0,
        Math.PI * 2,
        snapSampleCount,
        true,
      ),
      center: { x: ellipseFit.cx, y: ellipseFit.cy },
      radiusX: ellipseFit.rx,
      radiusY: ellipseFit.ry,
      rotationRad: ellipseFit.rotationRad,
      candidateRmse,
    };
  }

  if (winner.kind === "triangle" && triangleFit) {
    return {
      kind: "triangle",
      closed: true,
      confidence,
      rmseNormalized,
      rmsePx: triangleFit.rmsePx,
      snappedPoints: [...triangleFit.vertices, triangleFit.vertices[0]!],
      vertices: triangleFit.vertices,
      candidateRmse,
    };
  }

  if (winner.kind === "rectangle" && rectangleFit) {
    return {
      kind: "rectangle",
      closed: true,
      confidence,
      rmseNormalized,
      rmsePx: rectangleFit.rmsePx,
      snappedPoints: [...rectangleFit.vertices, rectangleFit.vertices[0]!],
      vertices: rectangleFit.vertices,
      rotationRad: rectangleFit.rotationRad,
      candidateRmse,
    };
  }

  return null;
}
