import type { ActionFxGenerationOptions, ActionFxLayerResult, ActionFxVectorPrimitive, ResolvedCharacterMask } from "./action-fx-vector-engine";

export const FX_IDS = ["radial-focus-lines", "parallel-speed-lines", "impact-shockwave", "arcane-magic-circle", "motion-afterimage-ghost", "romance-petal-frame"];
const MAX_COORDINATE = 10000000;

export function finite(values: readonly number[]): void {
  if (values.some((value) => !Number.isFinite(value))) throw new RangeError("FX 계산 입력은 유한한 수여야 합니다.");
}

export function assertPreset(id: string): void {
  if (!FX_IDS.includes(id)) throw new RangeError("등록되지 않은 FX 프리셋입니다.");
}

export function assertGeneration(options: ActionFxGenerationOptions): void {
  assertPreset(options.preset);
  finite(Object.values(options).filter((value): value is number => typeof value === "number"));
  if (options.seed !== undefined && Math.abs(options.seed) > Number.MAX_SAFE_INTEGER) throw new RangeError("시드는 안전한 정수 범위여야 합니다.");
  if (options.characterMask) {
    const mask = options.characterMask;
    finite([mask.cx ?? 0, mask.cy ?? 0, mask.radius ?? 0]);
    if ((mask.radius ?? 0) < 0 || (mask.enabled !== undefined && typeof mask.enabled !== "boolean")) throw new RangeError("마스크 반경·활성 표시가 올바르지 않습니다.");
  }
}

export function assertMask(mask: ResolvedCharacterMask): void {
  finite([mask.cx, mask.cy, mask.radius]);
  if (Math.abs(mask.cx) > MAX_COORDINATE || Math.abs(mask.cy) > MAX_COORDINATE || mask.radius < 0 || mask.radius > MAX_COORDINATE || typeof mask.enabled !== "boolean") throw new RangeError("마스크 계산 범위를 벗어났습니다.");
}

export function assertPrimitive(primitive: ActionFxVectorPrimitive): void {
  if (!primitive.id.trim()) throw new RangeError("도형 ID는 비어 있을 수 없습니다.");
  finite([primitive.opacity, primitive.strokeWidth ?? 0]);
  if (primitive.opacity < 0 || primitive.opacity > 1 || (primitive.strokeWidth ?? 0) < 0 || (primitive.strokeWidth ?? 0) > MAX_COORDINATE) throw new RangeError("불투명도·선 두께 범위를 벗어났습니다.");
  if (primitive.kind === "polygon" || primitive.kind === "polyline") {
    if (primitive.points.length > 4096) throw new RangeError("도형의 지원 점 수는 4096개까지입니다.");
    for (const point of primitive.points) {
      finite([point.x, point.y]);
      if (Math.abs(point.x) > MAX_COORDINATE || Math.abs(point.y) > MAX_COORDINATE) throw new RangeError("도형 좌표 계산 범위를 벗어났습니다.");
    }
  } else if (primitive.kind === "circle" || primitive.kind === "ellipse") {
    const radii = primitive.kind === "circle" ? [primitive.r] : [primitive.rx, primitive.ry];
    finite([primitive.cx, primitive.cy, ...radii, primitive.kind === "ellipse" ? primitive.rotationDeg : 0]);
    if ([primitive.cx, primitive.cy, ...radii].some((value) => Math.abs(value) > MAX_COORDINATE) || radii.some((value) => value < 0)) throw new RangeError("도형 크기 계산 범위를 벗어났습니다.");
  } else throw new RangeError("등록되지 않은 도형입니다.");
}

export function assertPrimitives(primitives: readonly ActionFxVectorPrimitive[]): void {
  if (primitives.length > 4096) throw new RangeError("FX 감사는 도형 4096개까지 지원합니다.");
  const ids = new Set<string>();
  let points = 0;
  for (const primitive of primitives) {
    assertPrimitive(primitive);
    if (ids.has(primitive.id)) throw new RangeError("도형 ID가 중복되었습니다.");
    ids.add(primitive.id);
    points += primitive.kind === "polygon" || primitive.kind === "polyline" ? primitive.points.length : 1;
    if (points > 65536) throw new RangeError("FX 감사의 전체 지원 점 수를 넘었습니다.");
  }
}

/** 생성 결과를 외부에서 바꾼 경우에도 지원 캔버스 범위를 벗어나 내보내지 않는다. */
export function assertExportLayer(layer: ActionFxLayerResult): void {
  const options = layer.resolvedOptions;
  assertGeneration(options); assertPreset(layer.preset.id);
  finite([options.width, options.height, options.seed, options.vanishingPointPx.x, options.vanishingPointPx.y]);
  if (!Number.isInteger(options.width) || !Number.isInteger(options.height) || options.width < 320 || options.width > 2400 || options.height < 320 || options.height > 3200) throw new RangeError("SVG 캔버스 지원 범위를 벗어났습니다.");
}
