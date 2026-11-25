import type { Shapr3dCadEvaluationResult, SketchSolveInput } from "./shapr3d-cad-engine";

function bounded(value: number): boolean {
  return Math.abs(value) <= 1_000_000;
}

export function assertSketchInput(input: SketchSolveInput): void {
  const { points, segments, constraints } = input;
  if (points.length < 1 || points.length > 64 || segments.length > 128 || constraints.length > 128) {
    throw new RangeError("스케치의 점·선분·구속조건 개수가 예제 범위를 벗어났습니다.");
  }
  const pointIds = new Set(points.map(({ id }) => id));
  const segmentIds = new Set(segments.map(({ id }) => id));
  if (pointIds.size !== points.length || segmentIds.size !== segments.length
      || new Set(constraints.map(({ id }) => id)).size !== constraints.length
      || points.some(({ id, x, y }) => !id || !bounded(x) || !bounded(y))) {
    throw new RangeError("스케치 ID와 좌표를 확인해 주세요.");
  }
  if (segments.some(({ startPointId, endPointId, centerPointId, radiusMm }) =>
    !pointIds.has(startPointId) || !pointIds.has(endPointId)
    || (centerPointId !== undefined && !pointIds.has(centerPointId))
    || (radiusMm !== undefined && (!bounded(radiusMm) || radiusMm <= 0)))) {
    throw new RangeError("스케치 선분의 점 또는 반경을 확인해 주세요.");
  }
  if (constraints.some(({ pointIds: points, segmentIds: segments, targetMm, axisX }) =>
    points?.some((id) => !pointIds.has(id)) || segments?.some((id) => !segmentIds.has(id))
    || (targetMm !== undefined && (!bounded(targetMm) || targetMm < 0))
    || (axisX !== undefined && !bounded(axisX)))) {
    throw new RangeError("스케치 구속조건이 가리키는 점·선분·치수를 확인해 주세요.");
  }
}

const previewColor = /^oklch\(\d+(?:\.\d+)? \d+(?:\.\d+)? \d+(?:\.\d+)?(?: \/ \d+(?:\.\d+)?)?\)$/u;

export function assertCadSvgInput(model: Shapr3dCadEvaluationResult): void {
  const { profileWidthMm, profileHeightMm, extrudeDepthMm, filletRadiusMm, chamferSizeMm } = model.effectiveParams;
  const { axis, positionPercent, wallThicknessMm, cutAreaMm2 } = model.sectionPlane;
  const { volumeCm3, surfaceAreaCm2 } = model.integrity;
  if (![profileWidthMm, profileHeightMm, extrudeDepthMm, filletRadiusMm, chamferSizeMm,
    positionPercent, wallThicknessMm, cutAreaMm2, volumeCm3, surfaceAreaCm2].every(bounded)
    || !["X", "Y", "Z"].includes(axis)
    || !/^[a-z0-9-]{1,80}$/u.test(model.preset.id)
    || !/^cad-[a-f0-9]{8}$/u.test(model.regenerationHash)
    || !["under-constrained", "fully-constrained", "over-constrained"].includes(model.sketch.dofStatus)
    || model.isoFaces.length > 64
    || model.isoFaces.some((face) => face.points.length > 32
      || face.points.some(({ x, y }) => !bounded(x) || !bounded(y))
      || !previewColor.test(face.fillOklch) || !previewColor.test(face.strokeOklch))) {
    throw new RangeError("SVG 도면의 치수·형상·색상이 예제 범위를 벗어났습니다.");
  }
}
