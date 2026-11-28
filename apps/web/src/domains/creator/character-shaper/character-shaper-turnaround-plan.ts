import { Box3, OrthographicCamera, Vector3 } from "three";

import type { Camera, Mesh, Object3D, SkinnedMesh } from "three";

export type CharacterTurnaroundCount = 4 | 8;
export interface CharacterTurnaroundView {
  readonly id: string;
  readonly label: string;
  readonly degrees: number;
  readonly camera: OrthographicCamera;
}
export interface CharacterBoundsOptions {
  readonly signal?: AbortSignal;
  readonly assertCurrent?: () => void;
  /** 보이는 그리기 범위의 정점 참조를 기준으로 진행률을 알린다. */
  readonly onProgress?: (processedReferences: number, totalReferences: number) => void;
}
const MAX_VERTICES = 2_000_000;
const VERTEX_LIMIT_MESSAGE = "설정화 자동 맞춤은 최대 200만 정점까지 지원합니다.";
const MAX_NODES = 50_000;
const CHUNK_VERTICES = 8192;

function check(options: CharacterBoundsOptions): void {
  if (options.signal?.aborted) throw new DOMException("설정화 내보내기를 취소했습니다.", "AbortError");
  options.assertCurrent?.();
}

/** 렌더러가 실제로 그리는 재질 그룹과 drawRange의 교집합만 대상으로 삼는다. */
function visibleRanges(mesh: Mesh, count: number) {
  const { geometry, material } = mesh;
  const start = Math.max(0, geometry.drawRange.start);
  const end = Math.min(count, geometry.drawRange.start + geometry.drawRange.count);
  if (end <= start) return [];
  if (!Array.isArray(material)) return material.visible ? [{ start, end }] : [];
  return geometry.groups
    .filter((group) => material[group.materialIndex ?? 0]?.visible)
    .map((group) => ({ start: Math.max(group.start, start), end: Math.min(group.start + group.count, end) }))
    .filter((range) => range.start < range.end);
}

/** 현재 포즈·표정에서 그려지는 정점의 월드 경계를 재고 나머지 정점은 제외한다. */
export async function measureCharacterTurnaroundBounds(
  scene: Object3D, camera: Camera, options: CharacterBoundsOptions = {},
): Promise<Box3> {
  check(options);
  scene.updateWorldMatrix(true, true);
  const stack = [scene];
  const meshes: { mesh: Mesh; ranges: ReturnType<typeof visibleRanges> }[] = [];
  let nodes = 0;
  let totalReferences = 0;
  while (stack.length > 0) {
    const object = stack.pop()!;
    if (++nodes > MAX_NODES) throw new RangeError("설정화 장면의 객체 수가 안전 범위를 초과했습니다.");
    if (!object.visible) continue;
    stack.push(...object.children);
    const mesh = object as Mesh;
    if (!mesh.isMesh || !camera.layers.test(mesh.layers)) continue;
    const positions = mesh.geometry.getAttribute("position");
    if (!positions) continue;
    const ranges = visibleRanges(mesh, mesh.geometry.index?.count ?? positions.count);
    if (!ranges.length) continue;
    if ((mesh as Mesh & { isInstancedMesh?: boolean }).isInstancedMesh) {
      throw new Error("설정화 자동 맞춤은 인스턴스 복제 메시를 아직 지원하지 않습니다.");
    }
    const skinned = mesh as SkinnedMesh;
    if (skinned.isSkinnedMesh) skinned.skeleton.update();
    for (const range of ranges) totalReferences += range.end - range.start;
    meshes.push({ mesh, ranges });
  }
  check(options);
  const bounds = new Box3();
  const point = new Vector3();
  let processed = 0;
  let measured = 0;
  let lastYield = performance.now();
  for (const { mesh, ranges } of meshes) {
    const index = mesh.geometry.index;
    const seen = index || ranges.length > 1 ? new Set<number>() : undefined;
    for (const { start, end } of ranges) {
      if (!seen && measured + end - start > MAX_VERTICES) throw new RangeError(VERTEX_LIMIT_MESSAGE);
      for (let offset = start; offset < end; offset++) {
        const vertex = index ? index.getX(offset) : offset;
        if (!seen?.has(vertex)) {
          if (++measured > MAX_VERTICES) throw new RangeError(VERTEX_LIMIT_MESSAGE);
          seen?.add(vertex);
          mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
          if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
            throw new Error("모델에 올바르지 않은 정점 좌표가 있습니다.");
          }
          bounds.expandByPoint(point);
        }
        if (++processed % CHUNK_VERTICES === 0) {
          options.onProgress?.(processed, totalReferences);
          check(options);
          // 인덱스만 빠르게 훑는 동안에는 타이머를 쌓지 않고 프레임 시간에 맞춰 제어권을 돌려준다.
          if (performance.now() - lastYield >= 12) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            check(options);
            lastYield = performance.now();
          }
        }
      }
    }
  }
  options.onProgress?.(processed, totalReferences);
  check(options);
  if (bounds.isEmpty() || bounds.getSize(point).length() < 1e-6) throw new Error("설정화에 넣을 표시 중인 모델이 없습니다.");
  return bounds;
}

/** All views share a single orthographic scale and center; no per-view auto-zoom drift. */
export function planCharacterTurnaround(
  bounds: Box3, count: CharacterTurnaroundCount, aspect = 0.75, baseAzimuth = 0,
): readonly CharacterTurnaroundView[] {
  const size = bounds.getSize(new Vector3());
  if (![...bounds.min.toArray(), ...bounds.max.toArray(), aspect, baseAzimuth].every(Number.isFinite)
    || bounds.isEmpty() || size.length() < 1e-6 || aspect <= 0 || aspect > 10 || ![4, 8].includes(count)) {
    throw new RangeError("설정화 카메라 범위가 올바르지 않습니다.");
  }
  const center = bounds.getCenter(new Vector3());
  const angles = Array.from({ length: count }, (_, index) => baseAzimuth + index * 2 * Math.PI / count);
  const widest = Math.max(...angles.map((angle) => Math.abs(Math.cos(angle)) * size.x + Math.abs(Math.sin(angle)) * size.z));
  const span = Math.max(size.y, widest / aspect, 1e-6) * 1.16;
  const radius = Math.max(size.length() / 2, 1e-6);
  const distance = radius * 3;
  return angles.map((angle, index) => {
    const camera = new OrthographicCamera(-span * aspect / 2, span * aspect / 2, span / 2, -span / 2, radius * 0.01, radius * 6);
    camera.position.set(center.x + Math.sin(angle) * distance, center.y, center.z + Math.cos(angle) * distance);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    const degrees = index * 360 / count;
    return { id: `angle-${degrees}`, label: index === 0 ? "기준 방향 · 0°" : `회전 · ${degrees}°`, degrees, camera };
  });
}
