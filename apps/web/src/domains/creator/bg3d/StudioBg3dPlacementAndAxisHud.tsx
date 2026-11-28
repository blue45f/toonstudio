import { AlertTriangle, Crosshair, Magnet, MoveDown, RotateCcw, RotateCw, X } from "lucide-react";
import { useId, type Dispatch, type SetStateAction } from "react";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { Bg3dModelLibraryEntry } from "./bg3d-model-library";
import { studioBg3dClassNames as cx } from "./studio-bg3d-editor-ui";
import type { StudioBg3dGlbUnitAxisReport } from "./studio-bg3d-glb-unit-axis-diagnostics";
import type { StudioBg3dPlacementPreviewAsset } from "./StudioBg3dSceneNodes";
import {
  normalizeStudioBg3dSnapSettings,
  STUDIO_BG3D_ROTATE_STEP_OPTIONS_DEG,
  STUDIO_BG3D_TRANSLATE_STEP_OPTIONS,
  studioBg3dSnapSettingsSummary,
  type StudioBg3dAxisLock,
  type StudioBg3dSnapAxis,
  type StudioBg3dSnapSettings,
} from "./studio-bg3d-object-ops";

export interface StudioBg3dPlacementPreviewBarProps {
  readonly asset: Pick<StudioBg3dPlacementPreviewAsset, "modelId" | "name">;
  readonly modelLibrary?: readonly Pick<Bg3dModelLibraryEntry, "id" | "name" | "source">[];
  readonly targetKind: "ground" | "surface";
  readonly glbDiagnostics?: StudioBg3dGlbUnitAxisReport;
  readonly viewportButtonClassName: string;
  readonly onRotateCounterClockwise: () => void;
  readonly onRotateClockwise: () => void;
  readonly onCancel: () => void;
}

const AXIS_LOCK_OPTIONS: readonly { readonly id: StudioBg3dAxisLock; readonly label: string }[] = [
  { id: "xyz", label: "XYZ 자유" },
  { id: "xz", label: "XZ(바닥)" },
  { id: "x", label: "X축" },
  { id: "y", label: "Y축" },
  { id: "z", label: "Z축" },
];

const SNAP_AXIS_OPTIONS: readonly { readonly id: StudioBg3dSnapAxis; readonly label: string }[] = [
  { id: "xyz", label: "XYZ" },
  { id: "xz", label: "XZ(바닥)" },
  { id: "x", label: "X" },
  { id: "y", label: "Y" },
  { id: "z", label: "Z" },
  { id: "none", label: "회전만" },
];

export function StudioBg3dPlacementPreviewBar({
  asset,
  modelLibrary,
  targetKind,
  glbDiagnostics,
  viewportButtonClassName,
  onRotateCounterClockwise,
  onRotateClockwise,
  onCancel,
}: StudioBg3dPlacementPreviewBarProps) {
  const id = useId();
  const bt = useBilingual("StudioBg3dPlacementPreviewBar");
  const assetName = modelLibrary?.find((entry) => entry.source === "sample" && entry.id === asset.modelId)?.name ?? asset.name;
  const placementTitle = formatI18nTemplate(bt("{assetName} 배치", "Place {assetName}"), { assetName });
  return (
    <div
      data-bg3d-viewport-control="true"
      data-testid="bg3d-placement-preview-bar"
      role="group"
      aria-labelledby={`${id}-asset`}
      aria-describedby={`${id}-instructions`}
      className="absolute inset-x-2 bottom-2 z-20 mx-auto flex max-w-xl flex-col gap-1.5 rounded-xl border border-accent/45 bg-panel/95 p-2 shadow-lg backdrop-blur sm:bottom-2.5 sm:px-3"
    >
      <div className="flex items-center gap-2">
        <Crosshair className="hidden shrink-0 text-accent sm:block" size={17} aria-hidden />
        <div role="status" className="min-w-0 flex-1">
          <p id={`${id}-asset`} className="truncate text-xs font-bold text-fg">{placementTitle}</p>
          <p id={`${id}-instructions`} className="truncate text-[0.66rem] font-medium text-fg-3 pointer-coarse:whitespace-normal pointer-coarse:break-keep">
            {targetKind === "surface" ? bt("표면", "Surface") : bt("바닥", "Floor")}{" · "}
            <span className="pointer-coarse:hidden">
              {bt("클릭 확정 · Shift 축 고정 · [ ] 15° 회전", "Click to place · Hold Shift to lock the axis · [ ] to rotate 15°")}
            </span>
            <span className="hidden pointer-coarse:inline">
              {bt("장면을 탭해 배치 · 버튼으로 15° 회전", "Tap the scene to place · Use the buttons to rotate 15°")}
            </span>
          </p>
        </div>
        <button
          type="button"
          aria-label={bt("3D 배치 왼쪽으로 15도 회전", "Rotate 3D placement left by 15 degrees")}
          title={bt("왼쪽 15° ([)", "Rotate left 15° ([)")}
          className={viewportButtonClassName}
          onClick={onRotateCounterClockwise}
        >
          <RotateCcw size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={bt("3D 배치 오른쪽으로 15도 회전", "Rotate 3D placement right by 15 degrees")}
          title={bt("오른쪽 15° (])", "Rotate right 15° (])")}
          className={viewportButtonClassName}
          onClick={onRotateClockwise}
        >
          <RotateCw size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={bt("3D 모델 배치 취소", "Cancel 3D model placement")}
          title={bt("배치 취소 (Esc)", "Cancel placement (Esc)")}
          className={cx(viewportButtonClassName, "text-bad hover:text-bad")}
          onClick={onCancel}
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {glbDiagnostics?.hasWarning ? (
        <div
          data-testid="bg3d-glb-unit-axis-preview-alert"
          className="flex items-start gap-2 rounded-lg border border-warn/45 bg-warn/10 px-2.5 py-1.5 text-[0.66rem] leading-snug text-fg"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-fg">{glbDiagnostics.headlineKo}</p>
            <p className="mt-0.5 text-fg-2">{glbDiagnostics.guidanceKo}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface StudioBg3dSnapAndAxisQuickCardProps {
  readonly snapSettings: StudioBg3dSnapSettings;
  readonly setSnapSettings: Dispatch<SetStateAction<StudioBg3dSnapSettings>>;
  readonly hasSelection: boolean;
  readonly selectedIsLocked: boolean;
  readonly onGroundSelected: () => void;
  readonly selectedGlbDiagnostics?: StudioBg3dGlbUnitAxisReport | null;
  readonly onStandUpAndGroundSelectedModel?: (() => void) | null;
}

export function StudioBg3dSnapAndAxisQuickCard({
  snapSettings,
  setSnapSettings,
  hasSelection,
  selectedIsLocked,
  onGroundSelected,
  selectedGlbDiagnostics,
  onStandUpAndGroundSelectedModel,
}: StudioBg3dSnapAndAxisQuickCardProps) {
  const activeAxisLock: StudioBg3dAxisLock = snapSettings.axisLock ?? "xyz";

  return (
    <div className="mb-4 space-y-2.5 rounded-xl border border-line/80 bg-card/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-fg">3D 배치 · 축 고정 · 스냅</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="bg3d-quick-ground-btn"
            disabled={!hasSelection || selectedIsLocked}
            title="선택한 오브젝트의 최저점을 바닥(Y=0)에 즉시 맞춥니다"
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45"
            onClick={onGroundSelected}
          >
            <MoveDown size={13} aria-hidden />
            바닥 맞춤
          </button>
          <button
            type="button"
            aria-pressed={snapSettings.enabled}
            className={cx(
              "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[0.68rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              snapSettings.enabled
                ? "border-accent/55 bg-accent text-on-accent"
                : "border-line bg-panel text-fg-2 hover:bg-accent-soft hover:text-accent",
            )}
            onClick={() =>
              setSnapSettings((prev) =>
                normalizeStudioBg3dSnapSettings({ ...prev, enabled: !prev.enabled }),
              )
            }
          >
            <Magnet size={13} aria-hidden />
            {snapSettings.enabled ? "스냅 켜짐" : "스냅 꺼짐"}
          </button>
        </div>
      </div>

      <div>
        <p className="text-[0.65rem] font-semibold text-fg-3">기즈모·수치 축 고정</p>
        <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="축 고정">
          {AXIS_LOCK_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-testid={`bg3d-axis-lock-${opt.id}`}
              aria-pressed={activeAxisLock === opt.id}
              className={cx(
                "min-h-8 rounded-lg border px-2 text-[0.65rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                activeAxisLock === opt.id
                  ? "border-accent/55 bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised",
              )}
              onClick={() =>
                setSnapSettings((prev) =>
                  normalizeStudioBg3dSnapSettings({ ...prev, axisLock: opt.id }),
                )
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[0.65rem] leading-relaxed text-fg-3">
        {studioBg3dSnapSettingsSummary(snapSettings)} · 기즈모·수치 입력 모두 적용
      </p>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[0.65rem] font-semibold text-fg-3">
          이동 간격
          <select
            className="mt-1 min-h-9 w-full rounded-lg border border-line bg-panel px-2 text-xs font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            value={snapSettings.translateStep}
            disabled={!snapSettings.enabled}
            onChange={(e) =>
              setSnapSettings((prev) =>
                normalizeStudioBg3dSnapSettings({
                  ...prev,
                  translateStep: Number(e.target.value),
                }),
              )
            }
          >
            {STUDIO_BG3D_TRANSLATE_STEP_OPTIONS.map((step) => (
              <option key={step} value={step}>
                {step}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[0.65rem] font-semibold text-fg-3">
          회전 간격
          <select
            className="mt-1 min-h-9 w-full rounded-lg border border-line bg-panel px-2 text-xs font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            value={snapSettings.rotateStepDegrees}
            disabled={!snapSettings.enabled}
            onChange={(e) =>
              setSnapSettings((prev) =>
                normalizeStudioBg3dSnapSettings({
                  ...prev,
                  rotateStepDegrees: Number(e.target.value),
                }),
              )
            }
          >
            {STUDIO_BG3D_ROTATE_STEP_OPTIONS_DEG.map((step) => (
              <option key={step} value={step}>
                {step}°
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="스냅 적용 축">
        {SNAP_AXIS_OPTIONS.map((axis) => (
          <button
            key={axis.id}
            type="button"
            disabled={!snapSettings.enabled}
            aria-pressed={snapSettings.translateAxes === axis.id}
            className={cx(
              "min-h-8 rounded-lg border px-2 text-[0.65rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45",
              snapSettings.translateAxes === axis.id
                ? "border-accent/55 bg-accent-soft text-accent"
                : "border-line bg-panel text-fg-2 hover:bg-raised",
            )}
            onClick={() =>
              setSnapSettings((prev) =>
                normalizeStudioBg3dSnapSettings({ ...prev, translateAxes: axis.id }),
              )
            }
          >
            {axis.label}
          </button>
        ))}
      </div>

      {selectedGlbDiagnostics?.hasWarning ? (
        <div
          data-testid="bg3d-selected-glb-diagnostics"
          className="space-y-1.5 rounded-lg border border-warn/45 bg-warn/10 p-2.5 text-[0.66rem] leading-snug text-fg"
        >
          <div className="flex items-start gap-1.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-fg">{selectedGlbDiagnostics.headlineKo}</p>
              <p className="mt-0.5 text-fg-2">{selectedGlbDiagnostics.guidanceKo}</p>
            </div>
          </div>
          {selectedGlbDiagnostics.axisAnomaly === "z-up-suspected" &&
          onStandUpAndGroundSelectedModel ? (
            <button
              type="button"
              data-testid="bg3d-glb-zup-fix-btn"
              disabled={selectedIsLocked}
              className="inline-flex min-h-8 items-center gap-1 rounded-md border border-accent/55 bg-accent px-2.5 text-[0.65rem] font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45"
              onClick={onStandUpAndGroundSelectedModel}
            >
              Z-up 세우기 · 바닥 맞춤
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
