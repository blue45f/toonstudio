import { createStudioEditableMeshFromPolygons, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { unwrapStudioMeshCornerUvs } from "./studio-hybrid-dcc-uv-edit";

export type CustomPrimitive =
  | { readonly kind: "sculpt-head"; readonly heightCm: number; readonly jawPercent: number; readonly divisions: number }
  | { readonly kind: "stairs"; readonly steps: number; readonly widthCm: number; readonly riseCm: number; readonly treadCm: number };

export const CUSTOM_PRIMITIVE_LIMITS = {
  heightCm: [10, 80],
  jawPercent: [60, 100],
  steps: [1, 32],
  widthCm: [10, 1000],
  riseCm: [1, 50],
  treadCm: [5, 100],
} as const;

// 중심축에 정점이 있어야 실제 높이와 좌우 윤곽이 입력 치수에 맞는다.
export const HEAD_DIVISIONS: readonly number[] = [6, 12, 18, 24];

export function validateCustomPrimitive(shape: CustomPrimitive): void {
  const check = (field: keyof typeof CUSTOM_PRIMITIVE_LIMITS, value: number) => {
    const [min, max] = CUSTOM_PRIMITIVE_LIMITS[field];
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new RangeError(`도형 치수 범위를 벗어났습니다 (${field}, ${min}–${max}).`);
    }
  };
  if (shape.kind === "sculpt-head") {
    check("heightCm", shape.heightCm);
    check("jawPercent", shape.jawPercent);
    if (!HEAD_DIVISIONS.includes(shape.divisions)) throw new RangeError("지원하지 않는 두상 분할 수입니다.");
  } else {
    check("steps", shape.steps);
    if (!Number.isInteger(shape.steps)) throw new RangeError("계단 수는 정수로 입력하세요.");
    check("widthCm", shape.widthCm);
    check("riseCm", shape.riseCm);
    check("treadCm", shape.treadCm);
  }
}

/** 한쪽 옆판의 실루엣을 너비만큼 돌출한다. 단수가 늘어도 면과 정점 수는 선형으로 늘어난다. */
export function buildCustomStairs(shape: Extract<CustomPrimitive, { kind: "stairs" }>): StudioEditableMesh {
  const halfWidth = shape.widthCm / 200;
  const frontZ = shape.steps * shape.treadCm / 200;
  const outline = [{ y: 0, z: frontZ }];
  for (let step = 1; step <= shape.steps; step += 1) {
    const y = step * shape.riseCm / 100;
    outline.push({ y, z: frontZ - (step - 1) * shape.treadCm / 100 }, { y, z: frontZ - step * shape.treadCm / 100 });
  }
  outline.push({ y: 0, z: -frontZ });
  const side = outline.length;
  const positions = [-halfWidth, halfWidth].flatMap((x) => outline.map(({ y, z }) => ({ x, y, z })));
  const left = outline.map((_, i) => i);
  const faces = [left, left.map((i) => i + side).reverse()];
  for (let i = 0; i < side; i += 1) {
    const next = (i + 1) % side;
    faces.push([i, i + side, next + side, next]);
  }
  const mesh = createStudioEditableMeshFromPolygons(positions, faces);
  const flat = { ...mesh, faces: mesh.faces.map((face) => ({ ...face, smooth: false })) };
  return { ...flat, uvLayer: unwrapStudioMeshCornerUvs(flat, "box") };
}
