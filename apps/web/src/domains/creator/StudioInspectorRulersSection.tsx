import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import {
  applyPerspectiveRigToRulerHandlers,
  createDisabledPerspectiveGuideState,
  perspectiveGuideStateFromSyncedRig,
  project3dCameraRigIfChanged,
  type Studio3dCameraSource,
} from "./ruler/studio-3d-camera-perspective-bridge";
import { CANVAS_W } from "./studio-assets";
import {
  StudioAdvancedRulerPanel,
  StudioIsometricGridPanel,
  StudioPerspectivePanel,
} from "./studio-page-lazy-ui";
import { StudioInspectorSection } from "./StudioInspectorSection";
import { MAX_VANISHING_POINTS, type VanishingPoint } from "./studio-perspective-guide";

import type { StudioSyncedPerspectiveRig } from "./drawing/studio-perspective-3d-camera-sync";
import type { StudioPerspectiveGuideState } from "./drawing/StudioRulersPanel";
import type { StudioAdvancedRuler, StudioAdvancedRulerDocument } from "./studio-advanced-ruler-document";
import type { DrawEl } from "./studio-element-model";
import type { StudioIsometricPrimitiveSpec } from "./studio-isometric-primitive-contract";
import type { LayerGroup } from "./studio-layers";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

interface StudioInspectorSymmetrySectionProps {
  symmetryType: "none" | "vertical" | "horizontal" | "radial" | "kaleidoscope" | "silk";
  symmetryRadialCount: number;
  symmetryCenterX: number;
  symmetryCenterY: number;
  canvasH: number;
  setSymmetryType: (value: "none" | "vertical" | "horizontal" | "radial" | "kaleidoscope" | "silk") => void;
  setSymmetryRadialCount: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSymmetryCenterX: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSymmetryCenterY: import("react").Dispatch<import("react").SetStateAction<number>>;
}

export function StudioInspectorSymmetrySection({
  symmetryType, symmetryRadialCount, symmetryCenterX, symmetryCenterY, canvasH,
  setSymmetryType, setSymmetryRadialCount, setSymmetryCenterX, setSymmetryCenterY,
}: StudioInspectorSymmetrySectionProps) {
  const t = useT();
  return (
    <StudioInspectorSection sectionId="tool.symmetry" loadingLabel={t("studio.canvas.panelLoading.symmetryRuler", "대칭 자를 여는 중...")}>
      <div className="space-y-2">
        <div className="grid grid-cols-5 gap-1">
          {([
            { id: "none", label: "없음" },
            { id: "vertical", label: "세로" },
            { id: "horizontal", label: "가로" },
            { id: "radial", label: "방사" },
            { id: "kaleidoscope", label: "만화경" },
          ] as const).map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setSymmetryType(type.id)}
              className={cn(
                "rounded py-1 text-[0.68rem] font-semibold border transition-colors cursor-pointer",
                symmetryType === type.id ? "border-accent bg-accent/15 text-accent" : "border-line text-fg-2 hover:bg-raised",
              )}
            >
              {type.label}
            </button>
          ))}
        </div>

        {symmetryType !== "none" && (
          <div className="space-y-2 pl-1.5 border-l border-line/50 ml-1 py-1 animate-fade-in">
            {(symmetryType === "radial" || symmetryType === "kaleidoscope") && (
              <label className="flex items-center justify-between gap-2 text-xs text-fg-3">
                <span>갈래 수</span>
                <select
                  value={symmetryRadialCount}
                  onChange={(e) => setSymmetryRadialCount(Number(e.target.value))}
                  className="rounded border border-line bg-card px-1 py-0.5 text-xs text-fg focus-visible:outline focus-visible:outline-accent"
                >
                  {[4, 6, 8, 12, 16].map((num) => (
                    <option key={num} value={num}>{num}방향</option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex gap-2">
              <label className="flex-1 flex flex-col gap-0.5 text-[0.68rem] text-fg-3">
                <span>중앙 X</span>
                <input
                  type="number"
                  value={Math.round(symmetryCenterX)}
                  onChange={(e) => setSymmetryCenterX(Number(e.target.value))}
                  className="w-full rounded border border-line bg-card px-1 py-0.5 text-[0.65rem] text-fg focus-visible:outline focus-visible:outline-accent"
                />
              </label>
              <label className="flex-1 flex flex-col gap-0.5 text-[0.68rem] text-fg-3">
                <span>중앙 Y</span>
                <input
                  type="number"
                  value={Math.round(symmetryCenterY)}
                  onChange={(e) => setSymmetryCenterY(Number(e.target.value))}
                  className="w-full rounded border border-line bg-card px-1 py-0.5 text-[0.65rem] text-fg focus-visible:outline focus-visible:outline-accent"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => { setSymmetryCenterX(CANVAS_W / 2); setSymmetryCenterY(canvasH / 2); }}
              className="w-full rounded border border-line bg-card py-1 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised transition-colors cursor-pointer"
            >
              대칭축 중앙 정렬
            </button>
          </div>
        )}
      </div>
    </StudioInspectorSection>
  );
}

interface StudioInspectorRulersSectionProps {
  perspectiveRulerActive: boolean;
  vanishingPoints: VanishingPoint[];
  perspectiveEyeLevelY: number | null;
  perspectiveLockHorizon: boolean;
  canvasH: number;
  drawingAssistControlsDisabled: boolean;
  drawingAssistDisabledReason?: string | null;
  isometricGridActive: boolean;
  isometricAngleDeg: number;
  isometricCellSize: number;
  isometricOriginX: number;
  isometricOriginY: number;
  advancedRulers: StudioAdvancedRulerDocument;
  groups: LayerGroup[];
  setPerspectiveRulerActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  addVanishingPointHandler: () => void;
  removeVanishingPointHandler: (id: string) => void;
  previewVanishingPointById: (id: string, x: number, y: number) => void;
  moveVanishingPointById: (id: string, x: number, y: number) => void;
  setPerspectiveLockHorizon: (next: boolean) => void;
  setPerspectiveEyeLevelY: (y: number) => void;
  previewPerspectiveEyeLevelY: (y: number) => void;
  alignPerspectiveToEyeLevel: () => void;
  toggleIsometricGridActive: () => void;
  previewIsometricAngleDegClamped: (next: number) => void;
  setIsometricAngleDegClamped: (next: number) => void;
  previewIsometricCellSizeClamped: (next: number) => void;
  setIsometricCellSizeClamped: (next: number) => void;
  previewIsometricOrigin: (x: number, y: number) => void;
  commitIsometricOrigin: (x: number, y: number) => void;
  resetIsometricOrigin: () => void;
  insertIsometricPrimitive: (spec: StudioIsometricPrimitiveSpec) => Promise<void>;
  insertIsometricSolid: () => void;
  /** 원근 가이드(소실점 격자) 동기화 콜백 — 단일 원근 자 UI에서 3D 카메라·스냅 상태를 통합 반영한다. */
  onPerspectiveGuideChange?: (state: StudioPerspectiveGuideState) => void;
  /** 3D 카메라 구도 동기화 콜백 — 미전달 시 내부 소실점·수평선 핸들러로 직접 반영한다. */
  onSyncFrom3dCamera?: (rig: StudioSyncedPerspectiveRig) => void;
  /** 라이브 3D 카메라 소스(Three.js 카메라·4×4 행렬·BG3D 설정). 변경 시 원근 자에 자동 동기화한다. */
  camera3dSource?: Studio3dCameraSource | null;
  /** 활성 캔버스 벡터 획 목록 및 변경 커밋 콜백(벡터 선 수정 7종 라이브 배선). */
  vectorStrokes?: readonly DrawEl[];
  onVectorStrokesChange?: (next: DrawEl[]) => void;
  addAdvancedRuler: (type: StudioAdvancedRuler["type"]) => void;
  patchAdvancedRuler: (id: string, patch: Partial<StudioAdvancedRuler>) => void;
  removeAdvancedRuler: (id: string) => void;
  selectAdvancedRuler: (id: string | null) => void;
  setActiveAdvancedRuler: (id: string | null) => void;
}

export function StudioInspectorRulersSection({
  perspectiveRulerActive, vanishingPoints, perspectiveEyeLevelY, perspectiveLockHorizon, canvasH,
  drawingAssistControlsDisabled, drawingAssistDisabledReason,
  isometricGridActive, isometricAngleDeg, isometricCellSize, isometricOriginX, isometricOriginY,
  advancedRulers, groups,
  onPerspectiveGuideChange, onSyncFrom3dCamera, camera3dSource, vectorStrokes, onVectorStrokesChange,
  setPerspectiveRulerActive, addVanishingPointHandler, removeVanishingPointHandler,
  previewVanishingPointById, moveVanishingPointById, setPerspectiveLockHorizon,
  setPerspectiveEyeLevelY, previewPerspectiveEyeLevelY, alignPerspectiveToEyeLevel,
  toggleIsometricGridActive, previewIsometricAngleDegClamped, setIsometricAngleDegClamped,
  previewIsometricCellSizeClamped, setIsometricCellSizeClamped,
  previewIsometricOrigin, commitIsometricOrigin, resetIsometricOrigin,
  insertIsometricPrimitive, insertIsometricSolid,
  addAdvancedRuler, patchAdvancedRuler, removeAdvancedRuler, selectAdvancedRuler, setActiveAdvancedRuler,
}: StudioInspectorRulersSectionProps) {
  const t = useT();
  const [fallbackVectorStrokes, setFallbackVectorStrokes] = useState<DrawEl[] | undefined>(undefined);
  const pendingRigRef = useRef<StudioSyncedPerspectiveRig | null>(null);
  const lastCameraSigRef = useRef<string | null>(null);

  useEffect(() => {
    const pending = pendingRigRef.current;
    if (!pending || vanishingPoints.length !== pending.points.length) return;
    pendingRigRef.current = null;
    pending.points.forEach((target, idx) => {
      const vp = vanishingPoints[idx];
      if (vp && (vp.x !== target.x || vp.y !== target.y)) moveVanishingPointById(vp.id, target.x, target.y);
    });
  }, [vanishingPoints, moveVanishingPointById]);

  const handleSyncFrom3dCamera = useCallback(
    (rig: StudioSyncedPerspectiveRig) => {
      onPerspectiveGuideChange?.(perspectiveGuideStateFromSyncedRig(rig, { width: CANVAS_W, height: canvasH }));
      if (onSyncFrom3dCamera) { onSyncFrom3dCamera(rig); return; }
      pendingRigRef.current = applyPerspectiveRigToRulerHandlers(
        rig,
        { active: perspectiveRulerActive, points: vanishingPoints, maxVanishingPoints: MAX_VANISHING_POINTS },
        {
          setActive: (next) => setPerspectiveRulerActive(next), setLockHorizon: setPerspectiveLockHorizon,
          setEyeLevelY: setPerspectiveEyeLevelY, addPoint: addVanishingPointHandler,
          removePoint: removeVanishingPointHandler, movePoint: moveVanishingPointById,
        },
      );
    },
    [
      onPerspectiveGuideChange, onSyncFrom3dCamera, canvasH, perspectiveRulerActive, vanishingPoints,
      setPerspectiveRulerActive, setPerspectiveLockHorizon, setPerspectiveEyeLevelY,
      addVanishingPointHandler, removeVanishingPointHandler, moveVanishingPointById,
    ],
  );

  useEffect(() => {
    if (!camera3dSource || !perspectiveRulerActive || drawingAssistControlsDisabled) return;
    const synced = project3dCameraRigIfChanged(camera3dSource, { width: CANVAS_W, height: canvasH }, lastCameraSigRef.current);
    if (!synced) return;
    lastCameraSigRef.current = synced.signature;
    handleSyncFrom3dCamera(synced.rig);
  }, [camera3dSource, perspectiveRulerActive, drawingAssistControlsDisabled, canvasH, handleSyncFrom3dCamera]);

  const resolvedVectorStrokes = vectorStrokes ?? fallbackVectorStrokes;
  const handleVectorStrokesChange = useCallback(
    (next: DrawEl[]) => { if (onVectorStrokesChange) onVectorStrokesChange(next); else setFallbackVectorStrokes(next); },
    [onVectorStrokesChange],
  );

  const handleTogglePerspectiveActive = () => {
    const nextActive = !perspectiveRulerActive;
    setPerspectiveRulerActive(nextActive);
    if (!nextActive) onPerspectiveGuideChange?.(createDisabledPerspectiveGuideState({ width: CANVAS_W, height: canvasH }));
  };

  return (
    <StudioInspectorSection sectionId="tool.rulers" loadingLabel={t("studio.canvas.panelLoading.rulersGuides", "자·가이드를 여는 중...")}>
      <Suspense fallback={null}>
        <StudioPerspectivePanel
          active={perspectiveRulerActive} points={vanishingPoints} eyeLevelY={perspectiveEyeLevelY}
          lockHorizon={perspectiveLockHorizon} canvasWidth={CANVAS_W} canvasHeight={canvasH}
          disabled={drawingAssistControlsDisabled} disabledReason={drawingAssistDisabledReason ?? undefined}
          onToggleActive={handleTogglePerspectiveActive} onAddPoint={addVanishingPointHandler}
          onRemovePoint={removeVanishingPointHandler} onPreviewPoint={previewVanishingPointById}
          onCommitPoint={moveVanishingPointById} onToggleLockHorizon={setPerspectiveLockHorizon}
          onCommitEyeLevelY={setPerspectiveEyeLevelY} onPreviewEyeLevelY={previewPerspectiveEyeLevelY}
          onAlignToEyeLevel={alignPerspectiveToEyeLevel} onSyncFrom3dCamera={handleSyncFrom3dCamera}
        />
      </Suspense>
      <Suspense fallback={null}>
        <StudioIsometricGridPanel
          active={isometricGridActive}
          config={{ angleDeg: isometricAngleDeg, cellSize: isometricCellSize, originX: isometricOriginX, originY: isometricOriginY }}
          disabled={drawingAssistControlsDisabled} disabledReason={drawingAssistDisabledReason ?? undefined}
          onToggleActive={toggleIsometricGridActive} onPreviewAngle={previewIsometricAngleDegClamped}
          onCommitAngle={setIsometricAngleDegClamped} onPreviewCellSize={previewIsometricCellSizeClamped}
          onCommitCellSize={setIsometricCellSizeClamped} onPreviewOrigin={previewIsometricOrigin}
          onCommitOrigin={commitIsometricOrigin} onResetOrigin={resetIsometricOrigin}
          onInsertPrimitive={insertIsometricPrimitive} onInsertSolid={insertIsometricSolid}
        />
      </Suspense>
      <Suspense fallback={null}>
        <StudioAdvancedRulerPanel
          document={advancedRulers} groups={groups} canvasWidth={CANVAS_W} canvasHeight={canvasH}
          disabled={drawingAssistControlsDisabled} disabledReason={drawingAssistDisabledReason ?? undefined}
          onAdd={addAdvancedRuler} onPatch={patchAdvancedRuler} onRemove={removeAdvancedRuler}
          onSelect={selectAdvancedRuler} onSetActiveSnap={setActiveAdvancedRuler}
          vectorStrokes={resolvedVectorStrokes} onVectorStrokesChange={handleVectorStrokesChange}
        />
      </Suspense>
    </StudioInspectorSection>
  );
}
