import type { StudioBg3dOrganizationController } from "./studio-bg3d-organization-controller";
import type { Bg3dV11RoomDimensions } from "./studio-bg3d-v11-upper-catalog";
import {
  createStudioBg3dSelectionArrayFromHost,
  inspectStudioBg3dSelectionArrayHost,
  type StudioBg3dExecuteSelectionArray,
  type StudioBg3dSelectionArrayHost,
  type StudioBg3dSelectionArraySummary,
} from "./studio-bg3d-selection-array";
import { createStudioBg3dSkpSourceReaderFromHost, inspectStudioBg3dSkpSourceSelection, type StudioBg3dReadSkpSceneSource, type StudioBg3dSkpSourceSelection } from "./studio-bg3d-skp-source-read-command";
import { createStudioBg3dWorkbenchInsertionFromHost, isStudioBg3dWorkbenchInsertionAvailable, type StudioBg3dInsertScenePrimitives } from "./studio-bg3d-workbench-insertion";
import type { StudioBg3dApplySkpSourceCamera, StudioBg3dSkpCameraRestoreHost } from "./studio-bg3d-skp-camera-restore-types";
import type { StudioBg3dPrimitiveEditPorts } from "./studio-bg3d-primitive-edit-ports";
import { resolveStudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";

import type { StudioBg3dSceneGlbExportPorts } from "./studio-bg3d-scene-glb-ports";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { StudioBg3dMaterialOverride } from "./studio-bg3d-scene-document";
import { buildStudioBg3dSurfaceMaterialOverride, findStudioBg3dSurfaceMaterial } from "./studio-bg3d-surface-material-catalog";

type StudioBg3dSurfaceMaterialHost = StudioBg3dSelectionArrayHost & StudioBg3dSkpCameraRestoreHost & {
  readonly outlinerController?: { readonly organization?: StudioBg3dOrganizationController };
  readonly roomBuilderSpec?: Bg3dV11RoomDimensions;
  readonly captureInFlightRef?: { readonly current: boolean };
  readonly updateColor?: (id: string, color: string) => void;
  readonly applySurfacePreset?: (id: string, presetId: string | null) => void;
  readonly updateCustomModelMaterial?: (id: string, override: StudioBg3dMaterialOverride) => void;
};

type SurfaceMaterialTarget =
  | { readonly kind: "primitive"; readonly entity: BgPrimitive }
  | { readonly kind: "model"; readonly entity: BgCustomModelInstance };

function readSurfaceMaterialTarget(host: StudioBg3dSurfaceMaterialHost): SurfaceMaterialTarget | null {
  const ids = host.selectedIdsRef?.current ?? host.selectedIds;
  const source = host.physicsRuntimeSourceRef?.current;
  if (!source || ids?.size !== 1) return null;
  const entities = [...source.primitives, ...source.customModels];
  if (entities.some(({ id }) => !id) || new Set(entities.map(({ id }) => id)).size !== entities.length) return null;
  const primitive = source.primitives.find(({ id }) => ids.has(id));
  if (primitive) return { kind: "primitive", entity: primitive };
  const model = source.customModels.find(({ id }) => ids.has(id));
  return model ? { kind: "model", entity: model } : null;
}

function canApplySurfaceMaterial(host: StudioBg3dSurfaceMaterialHost, target: SurfaceMaterialTarget | null): boolean {
  if (!target || target.entity.linkedSourceId || !isStudioBg3dWorkbenchInsertionAvailable(host) || host.captureInFlightRef?.current
    || host.cameraLensInteractionLocked?.() || host.isMaterialBackendCurrent?.() === false) return false;
  const source = host.physicsRuntimeSourceRef?.current;
  if (!source) return false;
  const byId = new Map<string, BgPrimitive | BgCustomModelInstance>([...source.primitives, ...source.customModels].map((entity) => [entity.id, entity] as const));
  const seen = new Set<string>();
  let cursor: BgPrimitive | BgCustomModelInstance | undefined = target.entity;
  while (cursor) {
    if (cursor.locked || seen.has(cursor.id)) return false;
    seen.add(cursor.id);
    if (!cursor.parentId) break;
    cursor = byId.get(cursor.parentId);
    if (!cursor) return false;
  }
  return target.kind === "primitive"
    ? Boolean(host.updateColor && host.applySurfacePreset)
    : Boolean(host.updateCustomModelMaterial);
}

export interface StudioBg3dWorkbenchHostPorts extends StudioBg3dPrimitiveEditPorts, StudioBg3dSceneGlbExportPorts {
  readonly organization?: StudioBg3dOrganizationController;
  readonly roomDimensions?: Bg3dV11RoomDimensions;
  readonly selectedMaterialId?: string | null;
  readonly applyReady?: boolean;
  /** 최신 선택을 검사하고 기존 장면 명령을 수락했을 때만 true다. */
  readonly onApplySurfaceMaterial?: (id: string) => boolean;
  readonly onInsertScenePrimitives?: StudioBg3dInsertScenePrimitives;
  readonly arraySelection?: StudioBg3dSelectionArraySummary;
  readonly onExecuteSelectionArray?: StudioBg3dExecuteSelectionArray;
  readonly skpSourceSelection?: StudioBg3dSkpSourceSelection;
  readonly onReadSkpSceneSource?: StudioBg3dReadSkpSceneSource;
  readonly onApplySkpSourceCamera?: StudioBg3dApplySkpSourceCamera;
}

/** 가변 편집기 호스트의 최신 읽기와 실제 장면 명령을 작업대에 연결한다. */
export function createStudioBg3dWorkbenchHostPorts(host: StudioBg3dSurfaceMaterialHost): StudioBg3dWorkbenchHostPorts {
  const applySkpCamera: StudioBg3dApplySkpSourceCamera = async (request) => {
    const renderer = host.modelRenderer, isMaterialBackendCurrent = host.isMaterialBackendCurrent;
    try {
      const backend = resolveStudioBg3dMaterialBackend({ renderer, materialBackend: host.materialBackend });
      if (isMaterialBackendCurrent?.() === false) return { ok: false, code: "unavailable", messageKo: "현재 재질 backend를 준비 중입니다." };
      const { applyStudioBg3dSkpSourceCamera } = await import("./studio-bg3d-skp-camera-restore-command");
      if (isMaterialBackendCurrent?.() === false || host.modelRenderer !== renderer || resolveStudioBg3dMaterialBackend({ renderer: host.modelRenderer, materialBackend: host.materialBackend }) !== backend) {
        return { ok: false, code: "selection-changed", messageKo: "카메라 도구를 준비하는 동안 재질 backend가 바뀌었습니다." };
      }
      return applyStudioBg3dSkpSourceCamera(host, request);
    } catch {
      return { ok: false, code: "unavailable", messageKo: "원본 카메라 도구를 준비하지 못했습니다. 다시 시도하세요." };
    }
  };
  const selected = readSurfaceMaterialTarget(host);
  return {
    organization: host.outlinerController?.organization,
    roomDimensions: host.roomBuilderSpec,
    selectedMaterialId: selected?.entity.materialOverride?.surfaceMaterialId ?? null,
    applyReady: canApplySurfaceMaterial(host, selected),
    onApplySurfaceMaterial: (id) => {
      const entry = findStudioBg3dSurfaceMaterial(id), override = buildStudioBg3dSurfaceMaterialOverride(id);
      const target = readSurfaceMaterialTarget(host);
      if (!entry || !override || !target || !canApplySurfaceMaterial(host, target)) return false;
      if (target.kind === "primitive") {
        if (!host.updateColor || !host.applySurfacePreset) return false;
        host.updateColor(target.entity.id, entry.tintHex);
        host.applySurfacePreset(target.entity.id, entry.id);
      } else {
        if (!host.updateCustomModelMaterial) return false;
        host.updateCustomModelMaterial(target.entity.id, override);
      }
      return true;
    },
    onInsertScenePrimitives: createStudioBg3dWorkbenchInsertionFromHost(host, { selectAllInserted: true, immediateHistory: true }),
    arraySelection: inspectStudioBg3dSelectionArrayHost(host),
    onExecuteSelectionArray: createStudioBg3dSelectionArrayFromHost(host),
    skpSourceSelection: inspectStudioBg3dSkpSourceSelection(host),
    onReadSkpSceneSource: createStudioBg3dSkpSourceReaderFromHost(host),
    onApplySkpSourceCamera: applySkpCamera,
  };
}
