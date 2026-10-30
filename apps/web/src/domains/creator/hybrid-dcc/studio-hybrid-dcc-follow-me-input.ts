import type { StudioMeshVec3 } from "../studio-editable-half-edge-mesh";

export const STUDIO_FOLLOW_ME_INPUT_MAX_POINTS = 64;
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export type StudioFollowMePathInput =
  | { readonly kind: "empty" }
  | { readonly kind: "invalid"; readonly line: number | null }
  | { readonly kind: "value"; readonly points: readonly StudioMeshVec3[] };

/** 각 줄을 오브젝트 기준 X,Y,Z 좌표로 읽는다. 파싱 단계에서는 메시와 문서를 바꾸지 않는다. */
export function parseStudioFollowMePath(text: string): StudioFollowMePathInput {
  if (!text.trim()) return { kind: "empty" };
  // 렌더마다 거대한 붙여넣기를 분해하지 않는다. 좌표 한 줄의 유효 길이는 이보다 충분히 작다.
  if (text.length > 16_384) return { kind: "invalid", line: null };
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || lines.length > STUDIO_FOLLOW_ME_INPUT_MAX_POINTS) return { kind: "invalid", line: null };
  const points: StudioMeshVec3[] = [];
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    const parts = trimmed.includes(",") ? trimmed.split(",").map((part) => part.trim()) : trimmed.split(/\s+/);
    if (parts.length !== 3 || parts.some((part) => !DECIMAL.test(part))) return { kind: "invalid", line: index + 1 };
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const z = Number(parts[2]);
    if (![x, y, z].every(Number.isFinite)) return { kind: "invalid", line: index + 1 };
    points.push({ x, y, z });
  }
  return { kind: "value", points };
}

/** 선택 면에서 바로 시작하는 직선 경로. 입력 후에는 사용자가 경유점을 추가할 수 있다. */
export function createStudioFollowMeNormalPath(centroid: StudioMeshVec3, normal: StudioMeshVec3, length: number): string {
  if (!Number.isFinite(length) || length <= 0
    || ![centroid.x, centroid.y, centroid.z, normal.x, normal.y, normal.z].every(Number.isFinite)
    || Math.hypot(normal.x, normal.y, normal.z) === 0) return "";
  const end = { x: centroid.x + normal.x * length, y: centroid.y + normal.y * length, z: centroid.z + normal.z * length };
  const line = (point: StudioMeshVec3) => [point.x, point.y, point.z].map((value) => Number(value.toPrecision(14))).join(", ");
  return `${line(centroid)}\n${line(end)}`;
}
