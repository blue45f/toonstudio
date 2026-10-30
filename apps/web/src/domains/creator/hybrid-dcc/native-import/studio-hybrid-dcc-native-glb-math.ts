/** glTF column-major 행렬을 정본 XYZ TRS로 분리한다. 전단은 근사 분해하지 않는다. */
import { createStudioHybridDccIdentityTransform, normalizeStudioHybridDccObjectTransform, transformStudioHybridDccPoint, type StudioHybridDccObjectTransform, type StudioHybridDccVec3Tuple } from "../studio-hybrid-dcc-object-transform";

import { array, reject, type JsonRecord } from "./studio-hybrid-dcc-native-glb-data";

export type NativeMatrix = readonly number[];
export const NATIVE_IDENTITY: NativeMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function vector(value: unknown, fallback: readonly number[], length: number, path: string): readonly number[] {
  if (value === undefined) return fallback;
  const result = array(value, path);
  if (result.length !== length || !result.every((n) => typeof n === "number" && Number.isFinite(n))) reject("INVALID_TRANSFORM", "노드 변환은 유한한 고정 길이 벡터여야 합니다.", path);
  return result as number[];
}
export function nativeNodeMatrix(node: JsonRecord, path: string): NativeMatrix {
  if (node.matrix !== undefined) {
    if (node.translation !== undefined || node.rotation !== undefined || node.scale !== undefined) reject("INVALID_TRANSFORM", "노드 matrix와 TRS를 동시에 지정할 수 없습니다.", path);
    const matrix = vector(node.matrix, NATIVE_IDENTITY, 16, `${path}.matrix`);
    if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) reject("INVALID_TRANSFORM", "노드 행렬은 affine 변환이어야 합니다.", path);
    return matrix;
  }
  const p = vector(node.translation, [0, 0, 0], 3, `${path}.translation`);
  const q = vector(node.rotation, [0, 0, 0, 1], 4, `${path}.rotation`);
  const s = vector(node.scale, [1, 1, 1], 3, `${path}.scale`);
  const length = Math.hypot(...q);
  if (Math.abs(length - 1) > 1e-4) reject("INVALID_TRANSFORM", "노드 quaternion은 단위 회전이어야 합니다.", path);
  const x = (q[0] ?? 0) / length, y = (q[1] ?? 0) / length, z = (q[2] ?? 0) / length, w = (q[3] ?? 1) / length;
  const sx = s[0] ?? 1, sy = s[1] ?? 1, sz = s[2] ?? 1;
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, 1];
}
export function multiplyNativeMatrix(a: NativeMatrix, b: NativeMatrix): NativeMatrix {
  const result = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) for (let row = 0; row < 4; row += 1) {
    let value = 0;
    for (let inner = 0; inner < 4; inner += 1) value += (a[inner * 4 + row] ?? 0) * (b[column * 4 + inner] ?? 0);
    if (!Number.isFinite(value)) reject("INVALID_TRANSFORM", "계층 노드 행렬이 유한 범위를 넘었습니다.");
    result[column * 4 + row] = value;
  }
  return result;
}
export function nativeMatrixPoint(matrix: NativeMatrix, point: StudioHybridDccVec3Tuple): StudioHybridDccVec3Tuple {
  return [0, 1, 2].map((row) => (matrix[row] ?? 0) * point[0] + (matrix[4 + row] ?? 0) * point[1] + (matrix[8 + row] ?? 0) * point[2] + (matrix[12 + row] ?? 0)) as [number, number, number];
}
export function nativeMatrixDeterminant(matrix: NativeMatrix): number {
  const [a = 0, b = 0, c = 0] = matrix;
  const d = matrix[4] ?? 0, e = matrix[5] ?? 0, f = matrix[6] ?? 0;
  const g = matrix[8] ?? 0, h = matrix[9] ?? 0, i = matrix[10] ?? 0;
  return a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
}
export function nativeWorldPlacement(matrix: NativeMatrix): { readonly transform: StudioHybridDccObjectTransform; readonly bake: boolean; readonly reason?: "SHEAR_BAKED" | "TRANSFORM_BAKED" } {
  const identity = createStudioHybridDccIdentityTransform();
  const a: StudioHybridDccVec3Tuple = [matrix[0] ?? 0, matrix[1] ?? 0, matrix[2] ?? 0];
  const b: StudioHybridDccVec3Tuple = [matrix[4] ?? 0, matrix[5] ?? 0, matrix[6] ?? 0];
  const c: StudioHybridDccVec3Tuple = [matrix[8] ?? 0, matrix[9] ?? 0, matrix[10] ?? 0];
  const cross: StudioHybridDccVec3Tuple = [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]];
  const determinant = a[0] * cross[0] + a[1] * cross[1] + a[2] * cross[2];
  const sx = Math.hypot(...a) * (determinant < 0 ? -1 : 1), sy = Math.hypot(...b), sz = Math.hypot(...c);
  if (Math.min(Math.abs(sx), sy, sz) < 1e-12) return { transform: identity, bake: true, reason: "TRANSFORM_BAKED" };
  const dot = (left: StudioHybridDccVec3Tuple, right: StudioHybridDccVec3Tuple) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  if (Math.abs(dot(a, b) / (sx * sy)) > 1e-10 || Math.abs(dot(a, c) / (sx * sz)) > 1e-10 || Math.abs(dot(b, c) / (sy * sz)) > 1e-10) return { transform: identity, bake: true, reason: "SHEAR_BAKED" };
  const m11 = a[0] / sx;
  const m12 = b[0] / sy, m22 = b[1] / sy, m32 = b[2] / sy;
  const m13 = Math.max(-1, Math.min(1, c[0] / sz)), m23 = c[1] / sz, m33 = c[2] / sz;
  const rotation: StudioHybridDccVec3Tuple = Math.abs(m13) < 0.999999999999
    ? [Math.atan2(-m23, m33), Math.asin(m13), Math.atan2(-m12, m11)]
    : [Math.atan2(m32, m22), Math.asin(m13), 0];
  let transform: StudioHybridDccObjectTransform;
  const canonicalZero = (value: number | undefined) => value === 0 ? 0 : value;
  try { transform = normalizeStudioHybridDccObjectTransform({ revision: 1, position: [matrix[12], matrix[13], matrix[14]].map(canonicalZero), rotationEulerRad: rotation.map(canonicalZero), scale: [sx, sy, sz].map(canonicalZero) }); }
  catch { return { transform: identity, bake: true, reason: "TRANSFORM_BAKED" }; }
  // 분해한 TRS가 실제 world matrix와 같은지 세 기저와 원점을 다시 대조한다.
  for (const point of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]] as const) {
    const original = nativeMatrixPoint(matrix, point); const composed = transformStudioHybridDccPoint(point, transform);
    if (original.some((value, index) => Math.abs(value - (composed[index] ?? 0)) > 1e-7 * Math.max(1, Math.abs(value)))) return { transform: identity, bake: true, reason: "SHEAR_BAKED" };
  }
  return { transform, bake: false };
}
