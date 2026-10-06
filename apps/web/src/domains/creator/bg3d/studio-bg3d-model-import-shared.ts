/**
 * Studio BG3D 모델 가져오기 공유 기반 — 한도 상수·오류 계약·안전 연산·파싱 결과 타입.
 *
 * 가져오기 플래너/파서(studio-bg3d-model-import)와 예산 검증 모듈들이 공통으로 쓰는
 * 기반 정의만 모았다. 다른 모듈에 의존하지 않는 최하위 층이다(순환 import 방지).
 */

import { STUDIO_BG3D_GLB_MAX_BYTES } from "./studio-bg3d-glb-validation";

import type * as THREE from "three";

export const STUDIO_BG3D_IMPORT_MAX_FILES = 256;
export const STUDIO_BG3D_IMPORT_MAX_MODELS = 32;
export const STUDIO_BG3D_IMPORT_MAX_FILE_BYTES = STUDIO_BG3D_GLB_MAX_BYTES;
export const STUDIO_BG3D_IMPORT_MAX_CONVERSION_SOURCE_BYTES = 32 * 1024 * 1024;
export const STUDIO_BG3D_IMPORT_MAX_TOTAL_BYTES = 300 * 1024 * 1024;
export const STUDIO_BG3D_IMPORT_MAX_TEXT_BYTES = 32 * 1024 * 1024;
export const STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION = 8_192;
export const STUDIO_BG3D_IMPORT_MAX_DECODED_IMAGE_BYTES = 256 * 1024 * 1024;
/** Hard pre-parser ceilings. The canonical GLB validator applies the active device/document budget later. */
export const STUDIO_BG3D_IMPORT_MAX_INLINE_RESOURCE_BYTES = 8 * 1024 * 1024;
export const STUDIO_BG3D_IMPORT_MAX_INLINE_TOTAL_BYTES = 32 * 1024 * 1024;
export const STUDIO_BG3D_IMPORT_MAX_NODES = 2_048;
export const STUDIO_BG3D_IMPORT_MAX_MESHES = 1_024;
export const STUDIO_BG3D_IMPORT_MAX_MESH_PRIMITIVES = 2_048;
export const STUDIO_BG3D_IMPORT_MAX_VERTICES = 4_000_000;
export const STUDIO_BG3D_IMPORT_MAX_TRIANGLES = 2_000_000;
export const STUDIO_BG3D_IMPORT_MAX_ACCESSOR_ELEMENTS = 40_000_000;
export const STUDIO_BG3D_IMPORT_MAX_DECODED_GEOMETRY_BYTES = 256 * 1024 * 1024;
export const STUDIO_BG3D_IMPORT_MAX_EXPORT_MATERIALS = 1_024;
export const STUDIO_BG3D_IMPORT_MAX_EXPORT_MATERIAL_SLOTS = 4_096;
export const STUDIO_BG3D_IMPORT_MAX_ANIMATION_CLIPS = 128;
export const STUDIO_BG3D_IMPORT_MAX_ANIMATION_TRACKS = 4_096;
export const STUDIO_BG3D_IMPORT_MAX_ANIMATION_KEYFRAMES = 2_000_000;
export const STUDIO_BG3D_IMPORT_MAX_ANIMATION_BYTES = 128 * 1024 * 1024;
export const STUDIO_BG3D_IMPORT_MAX_ANIMATION_DURATION_SECONDS = 6 * 60 * 60;
export const STUDIO_BG3D_IMPORT_MAX_OBJ_MTL_REFERENCE_DIRECTIVES = 256;
export const STUDIO_BG3D_IMPORT_MAX_OBJ_MATERIAL_LIBRARIES = 64;
export const STUDIO_BG3D_IMPORT_MAX_OBJ_MTL_TOTAL_BYTES = 16 * 1024 * 1024;
export const STUDIO_BG3D_IMPORT_MAX_OBJ_MTL_DIRECTIVES = 65_536;
export const STUDIO_BG3D_IMPORT_DIRECT_MAX_BYTES = 512 * 1024;
export const STUDIO_BG3D_IMPORT_MAX_GLTF_TABLE_ENTRIES = 65_536;
export const STUDIO_BG3D_IMPORT_MAX_RESOURCE_RECORDS = 256;
export const STUDIO_BG3D_IMPORT_MAX_MATERIAL_RECORDS = STUDIO_BG3D_IMPORT_MAX_EXPORT_MATERIALS;
/** Mirrors the downstream model library's default cumulative admission budget. */
export const STUDIO_BG3D_IMPORT_MAX_OUTPUT_TOTAL_BYTES = STUDIO_BG3D_GLB_MAX_BYTES;

export type StudioBg3dModelImportErrorCode =
  | "aborted"
  | "animation-budget-exceeded"
  | "duplicate-resource"
  | "empty-file"
  | "environment-unsupported"
  | "export-failed"
  | "file-too-large"
  | "image-dimension-too-large"
  | "image-memory-too-large"
  | "inline-resource-too-large"
  | "invalid-image"
  | "invalid-path"
  | "invalid-text"
  | "missing-resource"
  | "mesh-budget-exceeded"
  | "material-budget-exceeded"
  | "model-byte-budget-exceeded"
  | "no-model"
  | "node-budget-exceeded"
  | "output-too-large"
  | "output-total-too-large"
  | "parse-failed"
  | "skp-converter-unavailable"
  | "skp-parse-failed"
  | "too-many-files"
  | "too-many-models"
  | "total-too-large"
  | "triangle-budget-exceeded"
  | "light-budget-exceeded"
  | "skin-count-budget-exceeded"
  | "joint-count-budget-exceeded"
  | "morph-target-budget-exceeded"
  | "texture-count-budget-exceeded"
  | "texture-byte-budget-exceeded"
  | "texture-dimension-budget-exceeded"
  | "unsafe-resource-uri"
  | "unsupported-extension"
  | "vertex-budget-exceeded"
  | "worker-required"
  | "geometry-memory-too-large";

const ERROR_MESSAGES: Readonly<Record<StudioBg3dModelImportErrorCode, string>> = Object.freeze({
  aborted: "3D 모델 가져오기를 취소했습니다.",
  "animation-budget-exceeded": "3D 애니메이션의 클립·트랙·키프레임 또는 재생 시간이 변환 안전 기준을 초과했습니다. 애니메이션을 줄이거나 키를 단순화해 주세요.",
  "duplicate-resource": "같은 경로 또는 이름의 3D 리소스가 중복되어 있습니다. 파일 구성을 정리해 주세요.",
  "empty-file": "비어 있는 3D 모델 또는 리소스 파일은 가져올 수 없습니다.",
  "environment-unsupported": "이 브라우저에서는 3D 모델 변환 기능을 사용할 수 없습니다. 최신 브라우저에서 다시 시도해 주세요.",
  "export-failed": "3D 모델을 자체 포함 GLB로 변환하지 못했습니다. 원본 모델과 텍스처를 확인해 주세요.",
  "file-too-large": "GLB·리소스는 100MiB, 변환할 원본 모델은 32MiB 제한을 초과할 수 없습니다.",
  "image-dimension-too-large": "3D 모델 텍스처 한 변은 8192px을 초과할 수 없습니다. 텍스처 해상도를 낮춰 주세요.",
  "image-memory-too-large": "선택한 3D 텍스처의 디코딩 메모리가 256MiB 제한을 초과했습니다. 텍스처를 줄여 주세요.",
  "inline-resource-too-large": "glTF에 직접 포함된 데이터의 용량 제한을 초과했습니다. BIN·텍스처를 별도 파일로 내보내거나 모델을 줄여 주세요.",
  "invalid-image": "3D 모델 텍스처의 형식 또는 크기 정보를 안전하게 확인할 수 없습니다.",
  "invalid-path": "3D 모델 리소스 경로가 안전하지 않습니다. 상대 경로로 구성된 원본을 선택해 주세요.",
  "invalid-text": "3D 모델의 텍스트 데이터를 UTF-8로 읽지 못했습니다.",
  "missing-resource": "3D 모델이 참조하는 BIN·MTL·텍스처 파일이 선택 항목에 없습니다.",
  "mesh-budget-exceeded": "3D 모델의 메시 또는 프리미티브 수가 가져오기 안전 기준을 초과했습니다. 메시를 병합해 주세요.",
  "material-budget-exceeded": "3D 모델의 재질 또는 재질 슬롯 수가 변환 안전 기준을 초과했습니다. OBJ/MTL 재질을 병합해 주세요.",
  "model-byte-budget-exceeded": "변환될 3D 모델의 예상 용량이 이 기기의 안전 기준을 초과했습니다. 메시와 텍스처를 줄여 주세요.",
  "no-model": "GLB, glTF, OBJ, FBX, DAE, STL, PLY, 3DS 또는 SKP 모델 파일을 하나 이상 선택해 주세요.",
  "node-budget-exceeded": "3D 모델의 노드 수가 가져오기 안전 기준을 초과했습니다. 계층을 단순화해 주세요.",
  "output-too-large": "변환된 GLB가 100MiB 제한을 초과했습니다. 텍스처나 메시를 최적화해 주세요.",
  "output-total-too-large": "한 번에 변환된 GLB의 총용량은 100MiB를 초과할 수 없습니다. 모델을 나누어 가져와 주세요.",
  "parse-failed": "3D 모델 구조를 해석하지 못했습니다. 원본 파일과 연결 리소스를 확인해 주세요.",
  "skp-converter-unavailable": ".skp 변환기(OpenSKP)를 불러오지 못해 SketchUp 파일을 가져올 수 없습니다. SketchUp에서 DAE 또는 GLB로 내보낸 뒤 다시 시도해 주세요.",
  "skp-parse-failed": ".skp 파일 구조를 해석하지 못했습니다. 일부 레거시 SketchUp 파일은 브라우저 변환에 실패할 수 있습니다. SketchUp에서 DAE 또는 GLB로 내보낸 뒤 가져와 주세요.",
  "too-many-files": "한 번에 선택할 수 있는 3D 모델과 연결 리소스는 최대 256개입니다.",
  "too-many-models": "한 번에 가져올 수 있는 3D 모델은 최대 32개입니다.",
  "total-too-large": "한 번에 가져올 파일의 총용량은 300MiB를 초과할 수 없습니다.",
  "triangle-budget-exceeded": "3D 모델의 삼각형 수가 가져오기 안전 기준을 초과했습니다. 메시를 경량화해 주세요.",
  "light-budget-exceeded": "3D 모델의 조명 수가 이 기기의 안전 기준을 초과했습니다. 조명 수를 줄여 주세요.",
  "skin-count-budget-exceeded": "3D 모델의 스킨 수가 이 기기의 안전 기준을 초과했습니다. 리깅 구조를 단순화해 주세요.",
  "joint-count-budget-exceeded": "3D 모델의 조인트 수가 이 기기의 안전 기준을 초과했습니다. 본 구조를 단순화해 주세요.",
  "morph-target-budget-exceeded": "3D 모델의 모프 타깃 수가 이 기기의 안전 기준을 초과했습니다. 표정·변형 타깃을 줄여 주세요.",
  "texture-count-budget-exceeded": "3D 모델의 고유 텍스처 수가 이 기기의 안전 기준을 초과했습니다. 텍스처를 정리해 주세요.",
  "texture-byte-budget-exceeded": "3D 모델 텍스처의 예상 디코딩 메모리가 이 기기의 안전 기준을 초과했습니다. 텍스처를 축소해 주세요.",
  "texture-dimension-budget-exceeded": "3D 모델 텍스처 해상도가 이 기기의 안전 기준을 초과했습니다. 텍스처 크기를 낮춰 주세요.",
  "unsafe-resource-uri": "3D 모델이 로컬 선택 범위 밖의 네트워크 또는 파일 리소스를 참조합니다.",
  "unsupported-extension": "아직 변환할 수 없는 압축 또는 텍스처 확장이 포함되어 있습니다. 표준 glTF/GLB로 다시 내보내 주세요.",
  "vertex-budget-exceeded": "3D 모델의 정점 수가 가져오기 안전 기준을 초과했습니다. 메시를 경량화해 주세요.",
  "worker-required": "선택한 OBJ·STL·PLY 변환 백엔드를 사용할 수 없습니다. Worker를 지원하는 최신 브라우저에서 다시 시도하거나 명시적 직접 실행 모델의 크기를 줄여 주세요.",
  "geometry-memory-too-large": "3D 모델의 디코딩된 기하 데이터가 256MiB 안전 기준을 초과했습니다. 메시를 경량화해 주세요.",
});

export class StudioBg3dModelImportError extends Error {
  constructor(readonly code: StudioBg3dModelImportErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "StudioBg3dModelImportError";
  }
}

export function importError(code: StudioBg3dModelImportErrorCode): StudioBg3dModelImportError {
  return new StudioBg3dModelImportError(code);
}

export function profileLimit(absoluteCeiling: number, selectedLimit: number | undefined): number {
  return selectedLimit === undefined
    ? absoluteCeiling
    : Math.min(absoluteCeiling, selectedLimit);
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw importError("aborted");
}

export function safeAddCount(left: number, right: number, code: StudioBg3dModelImportErrorCode): number {
  if (
    !Number.isSafeInteger(left)
    || left < 0
    || !Number.isSafeInteger(right)
    || right < 0
    || left > Number.MAX_SAFE_INTEGER - right
  ) {
    throw importError(code);
  }
  return left + right;
}

export function safeMultiplyCount(left: number, right: number, code: StudioBg3dModelImportErrorCode): number {
  if (
    !Number.isSafeInteger(left)
    || left < 0
    || !Number.isSafeInteger(right)
    || right < 0
    || (left !== 0 && right > Math.floor(Number.MAX_SAFE_INTEGER / left))
  ) {
    throw importError(code);
  }
  return left * right;
}

export interface StudioBg3dParsedExportCandidate {
  readonly root: THREE.Object3D;
  readonly animations: readonly THREE.AnimationClip[];
}
