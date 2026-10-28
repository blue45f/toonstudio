/** 설치 없는 모델 가져오기의 정본 입력 계약. 보고서만 생성한 결과를 편집 성공으로 보지 않는다. */
import type { StudioEditableMesh } from "../../studio-editable-half-edge-mesh";
import type { StudioHybridDccObjectTransform } from "../studio-hybrid-dcc-object-transform";
import type { StudioHybridDccToonMaterial } from "../materials/studio-hybrid-dcc-toon-material";

export const STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES = 128 * 1024 * 1024;
export const STUDIO_NATIVE_IMPORT_MAX_JSON_BYTES = 16 * 1024 * 1024;
export const STUDIO_NATIVE_IMPORT_MAX_ASSETS = 256;
/** 입력 파일과 별도로, 정본·임시 배열 생성을 허용할 보수적 작업량 추정 상한이다. 실제 메모리 측정값은 아니다. */
export const STUDIO_NATIVE_IMPORT_MAX_WORKING_BYTES = 256 * 1024 * 1024;

export function estimateStudioNativeImportAssetBytes(vertices: number, corners: number, faces: number, hasUv: boolean): number {
  if ([vertices, corners, faces].some((count) => !Number.isSafeInteger(count) || count < 0)) return Infinity;
  const estimate = vertices * 256 + corners * (256 + (hasUv ? 96 : 0)) + faces * 192;
  return Number.isSafeInteger(estimate) ? estimate : Infinity;
}

export type StudioNativeImportFormat = "glb" | "gltf" | "vrm" | "obj";
export interface StudioNativeImportIssue {
  readonly severity: "warning" | "error";
  readonly code: string;
  readonly detail: string;
  readonly path?: string;
}
export interface StudioNativeImportAsset {
  readonly name: string;
  readonly mesh: StudioEditableMesh;
  readonly initialTransform: StudioHybridDccObjectTransform;
  /** 자체 내보내기의 실제 glTF payload와 대조한 재질만 실제 face slot에 결합한다. */
  readonly initialMaterials?: Readonly<Record<string, StudioHybridDccToonMaterial>>;
  readonly sourceNodeIndex?: number;
  readonly sourceMeshIndex?: number;
  readonly sourcePrimitiveIndex?: number;
}
export interface StudioNativeImportDecoded {
  readonly format: StudioNativeImportFormat;
  readonly assets: readonly StudioNativeImportAsset[];
  readonly issues: readonly StudioNativeImportIssue[];
}
export type StudioNativeImportResult =
  | { readonly ok: true; readonly value: StudioNativeImportDecoded }
  | { readonly ok: false; readonly issues: readonly StudioNativeImportIssue[] };

export function studioNativeImportFailure(code: string, detail: string, path?: string): StudioNativeImportResult {
  return { ok: false, issues: [{ severity: "error", code, detail, ...(path === undefined ? {} : { path }) }] };
}
