/** 실제 mesh click의 선택·경계점 수집을 분리한다. 편집 권위나 새 face ID는 만들지 않는다. */
import type { ThreeEvent } from "@react-three/fiber";
import { frozenStatus2Text } from "../status-i18n/studio-frozen2-status-i18n";
import {
  mapStudioHybridDccRayFaceIndex, type StudioHybridDccComponentMode, type StudioHybridDccMeshSelectionSource,
  type StudioHybridDccRayHitMapping, type StudioHybridDccSelectionMode, type StudioHybridDccSelectionOperation,
} from "./studio-hybrid-dcc-component-selection";
import { resolveStudioHybridDccScreenComponentCandidate } from "./studio-hybrid-dcc-screen-selection";
import type { StudioBoundaryEndpointProjection } from "./studio-hybrid-dcc-boundary-endpoint";
import type { StudioHybridDccViewportAssetSnapshot } from "./studio-hybrid-dcc-viewport-snapshot";

export interface StudioHybridDccBoundaryEndpointPick {
  readonly assetId: string;
  readonly hit: StudioHybridDccRayHitMapping;
  readonly projection: StudioBoundaryEndpointProjection;
}
export type StudioHybridDccBoundaryEndpointPickHandler = (pick: StudioHybridDccBoundaryEndpointPick) => boolean;
export type StudioHybridDccViewportMeshClickEvent = Pick<ThreeEvent<MouseEvent>,
  "stopPropagation" | "faceIndex" | "nativeEvent" | "pointer" | "camera" | "object">;
export interface StudioHybridDccViewportMeshClickPorts {
  readonly asset: Pick<StudioHybridDccViewportAssetSnapshot, "assetId" | "mesh" | "meshHash" | "meshRevision">;
  readonly selectionMode: StudioHybridDccSelectionMode;
  readonly editingDisabled: boolean;
  readonly sculpting: boolean;
  /** drag가 끝난 직후의 억제까지 같은 실제 gate에서 판정한다. */
  readonly canSelect: () => boolean;
  readonly viewportSize: StudioBoundaryEndpointProjection["viewportSize"];
  readonly onSelect: (assetId: string) => void;
  readonly onSelectComponent?: (assetId: string, mode: StudioHybridDccComponentMode, elementId: number,
    operation: StudioHybridDccSelectionOperation) => void;
  readonly onSelectionError?: (message: string) => void;
  readonly onBoundaryEndpointPick?: StudioHybridDccBoundaryEndpointPickHandler;
}

/** Orbit의 단순 down/up는 클릭을 막지 않고 실제 change가 있었던 드래그만 기존 gate로 넘긴다. */
export function createStudioHybridDccBoundaryOrbitGate(suppress: () => void) {
  let active = false, changed = false;
  return {
    start(enabled: boolean) { active = enabled; changed = false; },
    change() { if (active) changed = true; },
    end() { const moved = active && changed; active = false; changed = false; if (moved) suppress(); },
    allows() { return !active; },
  };
}

export function handleStudioHybridDccViewportMeshClick(event: StudioHybridDccViewportMeshClickEvent,
  ports: StudioHybridDccViewportMeshClickPorts): void {
  event.stopPropagation();
  // mapping·callback보다 먼저 검사하여 drag/잠금 중의 클릭이 새 endpoint를 발행하지 않게 한다.
  if (!ports.canSelect() || ports.editingDisabled || ports.sculpting) return;
  const { asset, selectionMode, onSelectComponent, onBoundaryEndpointPick } = ports;
  if (!onBoundaryEndpointPick && (selectionMode === "object" || !onSelectComponent)) {
    ports.onSelect(asset.assetId); return;
  }
  const faceIndex = event.faceIndex;
  if (typeof faceIndex !== "number" || !Number.isSafeInteger(faceIndex) || faceIndex < 0) {
    if (!onBoundaryEndpointPick) ports.onSelect(asset.assetId);
    ports.onSelectionError?.(frozenStatus2Text("studio.frozenStatus2.hybrid.selectionNotFound", "클릭한 삼각형을 편집 메시의 점·선·면으로 찾지 못했습니다."));
    return;
  }
  const source: StudioHybridDccMeshSelectionSource = {
    assetId: asset.assetId, mesh: asset.mesh, meshRevision: asset.meshRevision, sourceHash: asset.meshHash,
  };
  const mapping = mapStudioHybridDccRayFaceIndex(source, faceIndex);
  if (!mapping.ok) {
    if (!onBoundaryEndpointPick) ports.onSelect(asset.assetId);
    ports.onSelectionError?.(mapping.diagnostics.map(({ message }) => message).join(" · "));
    return;
  }
  if (onBoundaryEndpointPick) {
    // false는 다른 자산/면/세대 등의 명시 거부다. 일반 선택으로 내려가 원래 선택을 바꾸지 않는다.
    onBoundaryEndpointPick({ assetId: asset.assetId, hit: mapping.value, projection: {
      pointerNdc: event.pointer, camera: event.camera, matrixWorld: event.object.matrixWorld, viewportSize: ports.viewportSize,
    } });
    return;
  }
  if (selectionMode === "object" || !onSelectComponent) return;
  const nativeEvent = event.nativeEvent;
  const operation: StudioHybridDccSelectionOperation = nativeEvent.altKey ? "subtract"
    : nativeEvent.ctrlKey || nativeEvent.metaKey ? "toggle" : nativeEvent.shiftKey ? "add" : "replace";
  let elementId = mapping.value.faceId;
  if (selectionMode === "vertex" || selectionMode === "edge") {
    const nearest = resolveStudioHybridDccScreenComponentCandidate(asset.mesh, selectionMode,
      { vertexIds: mapping.value.vertexCandidateIds, edges: mapping.value.edgeCandidates },
      event.pointer, event.camera, event.object.matrixWorld, ports.viewportSize);
    if (nearest === null) {
      ports.onSelectionError?.(selectionMode === "vertex"
        ? frozenStatus2Text("studio.frozenStatus2.hybrid.clickNearVertex", "꼭짓점 가까이를 클릭해 주세요. 면 가운데는 임의의 점으로 선택하지 않습니다.")
        : frozenStatus2Text("studio.frozenStatus2.hybrid.clickNearEdge", "모서리 가까이를 클릭해 주세요. 면 가운데는 임의의 선으로 선택하지 않습니다."));
      return;
    }
    elementId = nearest;
  }
  onSelectComponent(asset.assetId, selectionMode, elementId, operation);
}
