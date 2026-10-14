/**
 * Studio Pathfinder Boolean Adapter — 동기(순수 TS) 불리언 결합 경로.
 *
 * `studio-path-boolean.ts` 의 기존 비동기 경로(CanvasKit Worker / polygon-clipping)는
 * 그대로 두고, 이 어댑터는 `StudioPathfinderVectorEngine` v2 의 자체 클리핑 구현으로
 * 같은 입출력 규약(스펙 → 조각, 실패는 { ok:false, reason })을 동기 제공한다.
 *
 * 적용 범위(정직한 한계):
 *  - 피연산자는 구멍이 없는 단일 링 폴리곤이어야 한다. `studioShapeToPolygon` 이
 *    만드는 기본 도형(rect/ellipse/star/triangle/polygon/freehand 폐곡선)은 전부
 *    단일 링이라 대부분 이 경로로 처리할 수 있다.
 *  - 구멍이 있는 폴리곤이 들어오면 조용히 근사하지 않고 사유와 함께 거부한다 —
 *    호출자는 기존 비동기 경로를 쓰면 된다.
 *  - 곡선은 엔진이 아니라 `studioShapeToPolygon` 의 세그먼트 근사가 담당한다
 *    (기존 경로와 동일한 근사 규약·품질).
 */
import {
  StudioPathfinderVectorEngine,
  type StudioPathfinderBooleanMode,
  type StudioPathfinderBooleanResult,
  type StudioPathfinderPolygon,
} from "./studio-pathfinder-vector-engine";
import {
  studioPathBooleanOutputFromPolygons,
  studioShapeToPolygon,
  type StudioPathBooleanCombineResult,
  type StudioPathBooleanOp,
  type StudioPathBooleanShapeSpec,
  type StudioPathPolygon,
  type StudioShapeToPolygonOptions,
} from "./studio-path-boolean";

const OP_TO_MODE: Record<StudioPathBooleanOp, StudioPathfinderBooleanMode> = {
  union: "union",
  subtract: "difference",
  intersect: "intersect",
  exclude: "exclusion",
};

export type StudioPathfinderBooleanPolygonsResult =
  | { ok: true; polygons: StudioPathPolygon[] }
  | { ok: false; reason: string };

function toEnginePolygon(polygon: StudioPathPolygon): StudioPathfinderPolygon {
  return { points: polygon[0]!.map(([x, y]) => ({ x, y })) };
}

function toStudioPolygons(result: StudioPathfinderBooleanResult): StudioPathPolygon[] {
  return result.regions.map((region) => [
    region.outer.points.map((p) => [p.x, p.y] as [number, number]),
    ...region.holes.map((hole) => hole.points.map((p) => [p.x, p.y] as [number, number])),
  ]);
}

/**
 * 정규형 폴리곤 2개 → 결합된 정규형 MultiPolygon (동기).
 * `combineStudioShapePolygons`(polygon-clipping 비동기)와 같은 자리에서 쓸 수 있다.
 */
export function combineStudioShapePolygonsSync(
  polygonA: StudioPathPolygon,
  polygonB: StudioPathPolygon,
  op: StudioPathBooleanOp,
): StudioPathfinderBooleanPolygonsResult {
  if (polygonA.length !== 1 || polygonB.length !== 1) {
    return {
      ok: false,
      reason: "구멍이 있는 도형은 동기 결합 경로로 처리할 수 없어요. 기본 결합으로 다시 시도해 주세요.",
    };
  }
  try {
    const result = StudioPathfinderVectorEngine.booleanOperation(
      toEnginePolygon(polygonA),
      toEnginePolygon(polygonB),
      OP_TO_MODE[op],
    );
    return { ok: true, polygons: toStudioPolygons(result) };
  } catch {
    return {
      ok: false,
      reason: "경로 연산이 이 도형을 처리하지 못했어요(좌표를 조금 바꿔 다시 시도해 주세요).",
    };
  }
}

/**
 * 전체 파이프라인(동기) — 스펙 2개를 결합해 조각 목록으로. a=아래(base), b=위(top).
 * `combineStudioShapes` 와 같은 규약: 실패는 전부 { ok:false, reason }(한국어)으로
 * 수렴하며 예외를 던지지 않고, 빈 결과는 op 별 사유로 실패가 된다.
 */
export function combineStudioShapesSync(
  a: StudioPathBooleanShapeSpec,
  b: StudioPathBooleanShapeSpec,
  op: StudioPathBooleanOp,
  options: StudioShapeToPolygonOptions = {},
): StudioPathBooleanCombineResult {
  const polygonA = studioShapeToPolygon(a, options);
  if (!polygonA.ok) return { ok: false, reason: `아래 도형: ${polygonA.reason}` };
  const polygonB = studioShapeToPolygon(b, options);
  if (!polygonB.ok) return { ok: false, reason: `위 도형: ${polygonB.reason}` };
  const combined = combineStudioShapePolygonsSync(polygonA.polygon, polygonB.polygon, op);
  if (!combined.ok) return combined;
  return studioPathBooleanOutputFromPolygons(combined.polygons, op);
}
