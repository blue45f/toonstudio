import { Matrix4, Vector3 } from "three";
import { readStudioBg3dModelCacheEntry, resolveStudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";
import { isStudioBg3dOrthographicHeight, resolveStudioBg3dCameraDistanceLimits } from "./studio-bg3d-camera-orientation";
import { resolveStudioBg3dMinimumOrbitDistance } from "./studio-bg3d-camera-application";
import { readStudioBg3dSkpSceneSource } from "./studio-bg3d-skp-scene-provenance";
import { inspectStudioBg3dSkpSourceSelection } from "./studio-bg3d-skp-source-read-command";
import { calculateStudioBg3dThreeWorldMatrix } from "./studio-bg3d-three-hierarchy";

import type { StudioBg3dSkpCameraRequest, StudioBg3dSkpCameraRestoreHost, StudioBg3dSkpCameraResult } from "./studio-bg3d-skp-camera-restore-types";
import type { StudioBg3dSkpManifestPage } from "./studio-bg3d-skp-scene-manifest";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dThreeHierarchyEntity } from "./studio-bg3d-three-hierarchy";

type FailureCode = Extract<StudioBg3dSkpCameraResult, { readonly ok: false }>["code"];
function failure(code: FailureCode, messageKo: string): StudioBg3dSkpCameraResult { return { ok: false, code, messageKo }; }

function validHierarchy(entities: readonly StudioBg3dThreeHierarchyEntity[], id: string): boolean {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  if (byId.size !== entities.length) return false;
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current) {
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    if (!current.parentId) return true;
    current = byId.get(current.parentId);
    if (!current) return false;
  }
  return false;
}

/** 직교 카메라로 같은 구도를 표현할 수 있는 양의 균일 배율·회전·이동만 허용한다. */
function similarityScale(matrix: Matrix4): number | null {
  const e = matrix.elements;
  if (!e.every(Number.isFinite) || e[3] !== 0 || e[7] !== 0 || e[11] !== 0 || e[15] !== 1 || matrix.determinant() <= 0) return null;
  const x = new Vector3(e[0], e[1], e[2]), y = new Vector3(e[4], e[5], e[6]), z = new Vector3(e[8], e[9], e[10]);
  const lengths = [x.length(), y.length(), z.length()];
  const scale = lengths[0];
  if (scale === undefined || !Number.isFinite(scale) || scale <= 0) return null;
  const tolerance = 128 * Number.EPSILON;
  if (lengths.some((length) => Math.abs(length / scale - 1) > tolerance)) return null;
  x.divideScalar(scale); y.divideScalar(scale); z.divideScalar(scale);
  return [x.dot(y), x.dot(z), y.dot(z)].every((dot) => Math.abs(dot) <= tolerance) ? scale : null;
}

function pageCamera(page: StudioBg3dSkpManifestPage, metersPerUnit: number, matrix: Matrix4, current: StudioBg3dCameraSettings): StudioBg3dCameraSettings | null {
  const scale = similarityScale(matrix);
  if (scale === null || !page.eye || !page.target || !page.up || !Number.isFinite(metersPerUnit) || metersPerUnit <= 0) return null;
  const mapPoint = (point: readonly [number, number, number]) => new Vector3(point[0], point[2], -point[1]).multiplyScalar(metersPerUnit).applyMatrix4(matrix);
  const position = mapPoint(page.eye), target = mapPoint(page.target);
  const direction = target.clone().sub(position);
  const up = new Vector3(page.up[0], page.up[2], -page.up[1]).transformDirection(matrix);
  const positionTuple: [number, number, number] = [position.x, position.y, position.z], targetTuple: [number, number, number] = [target.x, target.y, target.z];
  const distance = Math.hypot(direction.x, direction.y, direction.z);
  // canonical 보정과 OrbitControls.update가 원본 eye를 옮길 요청은 확정 전에 거부한다.
  if (distance < Math.max(0.01, resolveStudioBg3dMinimumOrbitDistance(current.nearClip))
    || distance > resolveStudioBg3dCameraDistanceLimits(positionTuple, targetTuple).maxOrbitDistance
    || ![...positionTuple, ...targetTuple].every((value) => Number.isFinite(value) && Math.abs(value) <= 10_000)) return null;
  direction.normalize();
  up.addScaledVector(direction, -up.dot(direction));
  if (!Number.isFinite(up.lengthSq()) || up.lengthSq() <= 1e-12) return null;
  up.normalize();
  const height = page.orthoHeight * metersPerUnit * scale;
  if (!isStudioBg3dOrthographicHeight(height)) return null;
  return { ...current, position: positionTuple, target: targetTuple,
    up: [up.x, up.y, up.z], projection: "orthographic", orthographicHeight: height, zoom: 1, lensShift: [0, 0] };
}

/** 지연 import가 끝난 뒤에도 최신 선택과 캐시를 다시 읽는다. 일부 Page 상태를 전체 장면 복원으로 취급하지 않는다. */
export function applyStudioBg3dSkpSourceCamera(host: StudioBg3dSkpCameraRestoreHost, request: StudioBg3dSkpCameraRequest): StudioBg3dSkpCameraResult {
  try {
    const renderer = host.modelRenderer, backend = resolveStudioBg3dMaterialBackend({ renderer, materialBackend: host.materialBackend }), isMaterialBackendCurrent = host.isMaterialBackendCurrent;
    const backendCurrent = () => isMaterialBackendCurrent?.() !== false && host.modelRenderer === renderer && resolveStudioBg3dMaterialBackend({ renderer: host.modelRenderer, materialBackend: host.materialBackend }) === backend;
    if (host.open !== true || !host.cameraLensInteractionLocked || host.cameraLensInteractionLocked() || !host.updateCameraLens || !host.viewportApiRef?.current) {
      return failure("unavailable", "현재 카메라를 변경할 수 없습니다. 진행 중인 작업이 끝난 뒤 다시 시도하세요.");
    }
    const selection = inspectStudioBg3dSkpSourceSelection(host);
    if (typeof request.scopeKey !== "string" || !request.scopeKey || selection.scopeKey !== request.scopeKey) return failure("selection-changed", "모델 선택이 바뀌었습니다. 원본 정보를 다시 읽어 주세요.");
    const source = host.physicsRuntimeSourceRef?.current;
    const selectedId = (host.selectedIdsRef?.current ?? host.selectedIds)?.values().next().value;
    const model = source?.customModels.find(({ id }) => id === selectedId);
    const cached = model && host.modelRootCacheRef ? readStudioBg3dModelCacheEntry(host.modelRootCacheRef.current, model.modelId, backend) : undefined;
    if (!source || !model || !cached) return failure("source-unavailable", "모델 원본이 아직 준비되지 않았습니다. 준비된 뒤 다시 시도하세요.");
    const parsed = readStudioBg3dSkpSceneSource(cached.root);
    if (!parsed.ok || parsed.value.status !== "available" || parsed.value.geometryTransform.status !== "known") return failure("source-unavailable", "검증된 원본 장면 정보와 좌표 변환을 확인할 수 없습니다.");
    const page = parsed.value.manifest.pages.items.find(({ key }) => key === request.pageKey);
    if (!page || !page.parallel) return failure("unsupported-camera", "원근 카메라는 FOV 기준이 확인되지 않아 적용할 수 없습니다. 파서가 읽은 평행 카메라를 선택하세요.");
    const entities = [...source.primitives, ...source.customModels];
    if (!validHierarchy(entities, model.id)) return failure("unsupported-transform", "모델 계층이 올바르지 않아 원본 구도를 안전하게 적용할 수 없습니다.");
    const world = calculateStudioBg3dThreeWorldMatrix(entities, model.id);
    if (!world) return failure("unsupported-transform", "모델의 월드 변환을 확인할 수 없습니다.");
    // 캐시는 GLB 장면 루트의 정규화 배율을 갖는다. 단위 보정 자식은 geometryTransform에 이미 반영되어 중복 적용하지 않는다.
    const matrix = world.multiply(new Matrix4().compose(cached.root.position, cached.root.quaternion, cached.root.scale));
    if (similarityScale(matrix) === null) return failure("unsupported-transform", "비균일 배율·전단·반사 변형의 원본 구도를 평행 카메라로 보존할 수 없습니다.");
    const camera = pageCamera(page, parsed.value.geometryTransform.metersPerSourceUnit, matrix, host.viewportApiRef.current.readView());
    if (!camera) return failure("invalid-camera", "원본 카메라의 위치·방향·화면 높이가 장면의 안전한 범위를 벗어나 적용하지 않았습니다.");
    if (!backendCurrent()) return failure("source-unavailable", "재질 backend가 바뀌어 이전 원본 구도를 적용하지 않았습니다.");
    if (!host.updateCameraLens(() => camera)) return failure("commit-rejected", "카메라 명령이 거부되어 원본 구도를 적용하지 않았습니다.");
    return { ok: true, camera, pageName: page.name };
  } catch {
    return failure("commit-rejected", "원본 카메라를 적용하지 못했습니다. 모델과 현재 장면 상태를 확인한 뒤 다시 시도하세요.");
  }
}
