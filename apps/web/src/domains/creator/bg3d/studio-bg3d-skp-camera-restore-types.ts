import type { Object3D } from "three";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dSkpSourceReadHost } from "./studio-bg3d-skp-source-read-command";
import type { StudioBg3dThreeHierarchyEntity } from "./studio-bg3d-three-hierarchy";

export interface StudioBg3dSkpCameraRequest {
  readonly scopeKey: string;
  readonly pageKey: string;
}

export type StudioBg3dSkpCameraResult =
  | { readonly ok: true; readonly camera: StudioBg3dCameraSettings; readonly pageName: string }
  | { readonly ok: false; readonly code: "unavailable" | "selection-changed" | "source-unavailable" | "unsupported-camera" | "unsupported-transform" | "invalid-camera" | "commit-rejected"; readonly messageKo: string };

export type StudioBg3dApplySkpSourceCamera = (request: StudioBg3dSkpCameraRequest) => Promise<StudioBg3dSkpCameraResult>;

/** 실제 선택·정본 계층·렌더 캐시를 읽고 기존 렌즈 명령 한 번으로 확정한다. */
export interface StudioBg3dSkpCameraRestoreHost extends Omit<StudioBg3dSkpSourceReadHost, "physicsRuntimeSourceRef" | "modelRootCacheRef"> {
  readonly physicsRuntimeSourceRef?: { readonly current: {
    readonly customModels: readonly (StudioBg3dThreeHierarchyEntity & { readonly modelId: string; readonly name?: string })[];
    readonly primitives: readonly StudioBg3dThreeHierarchyEntity[];
  } };
  readonly modelRootCacheRef?: { readonly current: ReadonlyMap<string, { readonly root: Object3D }> };
  readonly viewportApiRef?: { readonly current: { readView(): StudioBg3dCameraSettings } | null };
  readonly cameraLensInteractionLocked?: () => boolean;
  readonly updateCameraLens?: (patch: (view: StudioBg3dCameraSettings) => Partial<StudioBg3dCameraSettings>) => boolean;
}
