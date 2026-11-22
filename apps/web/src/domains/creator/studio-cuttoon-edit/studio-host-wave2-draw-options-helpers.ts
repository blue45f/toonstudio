import type { MutableRefObject } from "react";

import type { StudioOptionsBarsDrawModel } from "../StudioOptionsBars";
import type { NormalizedStudioBrushDynamicsSettings } from "../brush/studio-brush-dynamics-types";
import { normalizeStudioBrushDynamicsSettings } from "../brush/studio-brush-dynamics";
import type {
  StudioBrushSnapshot,
  StudioBrushStampTuning,
} from "../brush/studio-brush-library";
import type { StudioBrushSlot } from "../brush/studio-brush-slots";
import type { StudioStabilizerMode } from "../brush/studio-stroke-stabilizer";
import type { StudioAppSettings } from "../studio-app-settings";
import { BRUSH_PRESETS, pressureCurvePresetId } from "../studio-brush";
import type { DrawShapeKind, Tool } from "../studio-editor-tool-model";
import type { El } from "../studio-element-model";
import { planGroupEnter, type GroupSelectionState } from "../studio-group-selection";
import type { LayerGroup } from "../studio-layers";
import type { StudioLivingInkMaterialControls } from "../studio-living-ink-gpu-protocol";
import type {
  StudioLivingInkStrokeMode,
  StudioLivingInkStudioState,
} from "../studio-living-ink-studio-coordinator";
import type { StudioQuickAccessIntegrationModule } from "../studio-page-editor-types";
import type { PageState } from "../studio-page-state";
import type { StudioQuickActionId } from "../studio-quick-actions";
import type { StudioQuickAccessCommandMeta } from "../studio-quick-access";
import type { StudioUiDensityMode } from "../studio-ui-density";

export interface StudioActiveCatalogBrush {
  readonly id: string;
  readonly name: string;
  readonly sourcePresetId: string | undefined;
  readonly sourcePresetName: string | undefined;
}

export function applyStudioSnapEnabledVisible(input: {
  readonly next: boolean | ((prev: boolean) => boolean);
  readonly appSettingsRef: MutableRefObject<StudioAppSettings>;
  readonly setSnapEnabled: (enabled: boolean) => void;
  readonly setAppSettings: (settings: StudioAppSettings) => void;
  readonly persistAppSettings: (settings: StudioAppSettings) => void;
}): void {
  const resolvedNext = typeof input.next === "function"
    ? input.next(input.appSettingsRef.current.grids.snapToPixelGrid)
    : input.next;
  input.setSnapEnabled(resolvedNext);
  const current = input.appSettingsRef.current;
  if (current.grids.snapToPixelGrid === resolvedNext) return;
  const settings: StudioAppSettings = {
    ...current,
    grids: { ...current.grids, snapToPixelGrid: resolvedNext },
  };
  input.appSettingsRef.current = settings;
  input.setAppSettings(settings);
  input.persistAppSettings(settings);
}

export function applyStudioToolOperationSnapshot(input: {
  readonly snapshot: StudioBrushSnapshot;
  readonly selectCatalog: (catalogId: string) => void;
  readonly setBrush: (id: string) => void;
  readonly setActiveCatalogBrush: (brush: StudioActiveCatalogBrush) => void;
  readonly setStrokeWidth: (value: number) => void;
  readonly setBrushOpacity: (value: number) => void;
  readonly setColor: (value: string) => void;
  readonly setStabilizer: (value: number) => void;
  readonly setStabilizerMode: (value: StudioStabilizerMode) => void;
  readonly setPostCorrection: (value: number) => void;
  readonly setPreserveCorners: (value: boolean) => void;
  readonly setPressureCurve: (value: number) => void;
  readonly setPressureMinSize: (value: number) => void;
  readonly setUseVelocityPressure: (value: boolean) => void;
  readonly setVelocitySensitivity: (value: number) => void;
  readonly setTiltEnabled: (value: boolean) => void;
  readonly setTipAngle: (value: number) => void;
  readonly setTipRoundness: (value: number) => void;
  readonly setBrushDynamics: (value: NormalizedStudioBrushDynamicsSettings) => void;
  readonly setBrushEnginePrograms: (value: NonNullable<StudioBrushSnapshot["enginePrograms"]> | null) => void;
  readonly setStampTuning: (value: StudioBrushStampTuning | null) => void;
}): void {
  const { snapshot } = input;
  const catalogId = snapshot.sourcePresetId ?? snapshot.brushId;
  const catalogName = snapshot.sourcePresetName
    ?? BRUSH_PRESETS.find((preset) => preset.id === snapshot.brushId)?.name
    ?? snapshot.brushId;
  input.selectCatalog(catalogId);
  input.setBrush(snapshot.brushId);
  input.setActiveCatalogBrush({
    id: catalogId,
    name: catalogName,
    sourcePresetId: snapshot.sourcePresetId,
    sourcePresetName: snapshot.sourcePresetName,
  });
  input.setStrokeWidth(snapshot.strokeWidth);
  input.setBrushOpacity(snapshot.brushOpacity);
  input.setColor(snapshot.color);
  input.setStabilizer(snapshot.stabilizer);
  input.setStabilizerMode(snapshot.stabilizerMode);
  input.setPostCorrection(snapshot.postCorrection);
  input.setPreserveCorners(snapshot.preserveCorners);
  input.setPressureCurve(snapshot.pressureCurve);
  input.setPressureMinSize(snapshot.pressureMinSize);
  input.setUseVelocityPressure(snapshot.useVelocityPressure);
  input.setVelocitySensitivity(snapshot.velocitySensitivity);
  input.setTiltEnabled(snapshot.tiltEnabled);
  input.setTipAngle(snapshot.tipAngle);
  input.setTipRoundness(snapshot.tipRoundness);
  input.setBrushDynamics(normalizeStudioBrushDynamicsSettings(snapshot.brushDynamics));
  input.setBrushEnginePrograms(snapshot.enginePrograms ?? null);
  input.setStampTuning(snapshot.stampTuning);
}

export function hasStudioBg3dCurrentTarget(input: {
  readonly bg3dInitialElementId: string | null | undefined;
  readonly masterEditMode: boolean;
  readonly currentPageId: string;
  readonly activePageId: string;
  readonly pages: readonly PageState[];
}): boolean {
  if (!input.bg3dInitialElementId || input.masterEditMode || input.currentPageId !== input.activePageId) {
    return false;
  }
  let matchingPageCount = 0;
  let matchingElementCount = 0;
  let matchingImageCount = 0;
  for (const page of input.pages) {
    if (page.id !== input.activePageId) continue;
    matchingPageCount += 1;
    for (const element of page.elements) {
      if (element.id !== input.bg3dInitialElementId) continue;
      matchingElementCount += 1;
      if (element.type === "image") matchingImageCount += 1;
    }
  }
  return matchingPageCount === 1 && matchingElementCount === 1 && matchingImageCount === 1;
}

export function deriveStudioSelectedForInspector(selected: El | null): El | null {
  if (selected === null || selected.type !== "draw") return selected;
  return {
    ...selected,
    points: [],
    pressures: undefined,
    tiltXs: undefined,
    tiltYs: undefined,
    twists: undefined,
    speeds: undefined,
    tangentialPressures: undefined,
  };
}

export function runStudioStartCanvasEditText(input: {
  readonly id: string;
  readonly element: El | undefined;
  readonly elements: El[];
  readonly groups: LayerGroup[];
  readonly activeGroupIdRef: MutableRefObject<string | null>;
  readonly applyGroupSelectionState: (next: GroupSelectionState) => void;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly startEditText: (id: string) => void;
}): void {
  const knownGroup =
    input.element?.groupId && input.groups.some((group) => group.id === input.element?.groupId)
      ? input.element.groupId
      : null;
  if (knownGroup && input.activeGroupIdRef.current !== knownGroup) {
    input.applyGroupSelectionState(
      planGroupEnter({ items: input.elements, groups: input.groups, clickedId: input.id }),
    );
    input.announceDrawingShortcut("그룹 내부 편집 · 다시 더블클릭하면 텍스트를 편집해요");
    return;
  }
  input.startEditText(input.id);
}

export function runStudioExecuteQuickAccessCommand(input: {
  readonly commandId: string;
  readonly catalog: readonly StudioQuickAccessCommandMeta[];
  readonly integration: StudioQuickAccessIntegrationModule | null;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly executeQuickAction: (action: StudioQuickActionId) => void;
  readonly saveDraft: () => void;
  readonly openSmartShapeEditor: () => void;
  readonly openPixelSelectionTransform: () => void;
}): void {
  const registeredCommand = input.catalog.find(({ id }) => id === input.commandId);
  const intent = input.integration?.resolveStudioQuickAccessExecutionIntent(input.commandId) ?? null;
  if (!registeredCommand?.available || !intent) {
    input.announceDrawingShortcut("현재 실행할 수 없는 빠른 액세스 명령이에요");
    return;
  }
  if (intent.kind === "quick-action") input.executeQuickAction(intent.action);
  else if (intent.kind === "save-draft") input.saveDraft();
  else if (intent.kind === "correct-current-stroke") input.openSmartShapeEditor();
  else if (intent.kind === "pixel-transform") input.openPixelSelectionTransform();
}

export interface DeriveStudioOptionsBarsDrawModelInput {
  readonly activeCatalogBrushId: string;
  readonly activeCatalogBrushName: string;
  readonly brush: string;
  readonly brushCatalogPlacement: string | undefined;
  readonly currentWorkspaceOwnerScope: string;
  readonly drawingLayoutRestoreOwnerScope: string | undefined;
  readonly libraryDockOpenPref: boolean | undefined;
  readonly focusBrushDockOpen: boolean;
  readonly brushDefaultRestore: StudioOptionsBarsDrawModel["brushDefaultRestore"];
  readonly brushOpacity: number;
  readonly materialBrush: boolean;
  readonly brushSlots: readonly (StudioBrushSlot | null)[];
  readonly canvasFlipH: boolean;
  readonly canvasOnlyMode: boolean;
  readonly color: string;
  readonly drawMode: string;
  readonly drawShape: DrawShapeKind;
  readonly eraseToIntersection: boolean;
  readonly livingInkBrushSupported: boolean;
  readonly livingInkBusy: boolean;
  readonly livingInkMaterial: StudioLivingInkMaterialControls;
  readonly livingInkMode: StudioLivingInkStrokeMode;
  readonly livingInkPhysicalModeEnabled: boolean;
  readonly livingInkPersistedLayer: boolean;
  readonly livingInkEffectiveScope: "all" | "selection";
  readonly livingInkSelectionReady: boolean;
  readonly livingInkState: StudioLivingInkStudioState;
  readonly livingInkStateMessage: string | null | undefined;
  readonly postCorrection: number;
  readonly pressureCurve: number;
  readonly favoriteBrushIds: readonly string[];
  readonly opacityLocked: boolean;
  readonly recentBrushIds: readonly string[];
  readonly sizeLocked: boolean;
  readonly quickShapeActive: boolean;
  readonly secondaryColor: string;
  readonly shapeFill: boolean;
  readonly stabilizer: number;
  readonly stabilizerMode: StudioStabilizerMode;
  readonly stampTuning: StudioBrushStampTuning | null;
  readonly strokeWidth: number;
  readonly symmetryType: StudioOptionsBarsDrawModel["symmetryType"];
  readonly tool: Tool;
  readonly uiDensityMode: StudioUiDensityMode;
  readonly compactCanvasDockLeft: number;
  readonly compactCanvasDockRight: number;
}

export function deriveStudioOptionsBarsDrawModel(
  input: DeriveStudioOptionsBarsDrawModelInput,
): StudioOptionsBarsDrawModel {
  const { livingInkPersistedLayer, livingInkState } = input;
  const libraryDockOpen =
    input.focusBrushDockOpen
    || (input.libraryDockOpenPref === true && input.uiDensityMode !== "focus");
  return {
    visible: input.tool === "draw" && !input.canvasOnlyMode,
    activeCatalogBrushId: input.activeCatalogBrushId,
    activeCatalogBrushName: input.activeCatalogBrushName,
    brushId: input.brush,
    workbenchVisible: !input.canvasOnlyMode,
    workspaceOwnerScope: input.currentWorkspaceOwnerScope,
    libraryDockOpen,
    layoutRestoreAvailable: input.drawingLayoutRestoreOwnerScope === input.currentWorkspaceOwnerScope,
    brushCatalogOpen: libraryDockOpen || input.brushCatalogPlacement === "desktop-dock",
    brushDefaultRestore: input.brushDefaultRestore,
    brushOpacity: input.brushOpacity,
    materialBrush: input.materialBrush,
    brushSlots: input.brushSlots,
    canvasFlipH: input.canvasFlipH,
    color: input.color,
    dockInsets: { left: input.compactCanvasDockLeft, right: input.compactCanvasDockRight },
    drawMode:
      input.drawMode === "shape"
        ? "shape"
        : input.drawMode === "eraser"
          ? "eraser"
          : input.drawMode === "pixel"
            ? "pixel"
            : "pen",
    drawShape: input.drawShape,
    eraseToIntersection: input.eraseToIntersection,
    favoriteBrushIds: input.favoriteBrushIds,
    livingInk: {
      supported: input.livingInkBrushSupported,
      physicalModeEnabled: input.livingInkPhysicalModeEnabled,
      state: livingInkState,
      mode: input.livingInkMode,
      scope: input.livingInkEffectiveScope,
      selectionAvailable: input.livingInkSelectionReady,
      busy: input.livingInkBusy,
      fixAvailable: livingInkPersistedLayer && livingInkState === "ready",
      fixUnavailableReason:
        input.livingInkStateMessage
        ?? (livingInkPersistedLayer
          ? "수채 번짐 상태를 복원한 뒤 정착할 수 있습니다."
          : "먼저 수채 번짐 잉크나 물 획을 저장하면 정착을 사용할 수 있습니다."),
      material: input.livingInkMaterial,
      materialLocked: livingInkPersistedLayer,
      materialLockedReason:
        "기존 획의 물리 재질은 저장 결과와 함께 고정됩니다. 전체 지우기 뒤 새 재질로 시작해 주세요.",
    },
    opacityLocked: input.opacityLocked,
    postCorrection: input.postCorrection,
    pressureCurveId: pressureCurvePresetId(input.pressureCurve),
    quickShapeActive: input.quickShapeActive,
    recentBrushIds: input.recentBrushIds,
    secondaryColor: input.secondaryColor,
    shapeFill: input.shapeFill,
    sizeLocked: input.sizeLocked,
    stabilizer: input.stabilizer,
    stabilizerMode: input.stabilizerMode,
    stampTuning: input.stampTuning,
    strokeWidth: input.strokeWidth,
    symmetryType: input.symmetryType,
  };
}
