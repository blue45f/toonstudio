import { lazy, Suspense, useId, useState } from "react";
import { StudioPanelLoading } from "../StudioLazySurfaceFallback";
import { useT } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioBg3dWorkbenchHostPorts } from "./studio-bg3d-workbench-host-ports";

const SpatialStoryboardPanel = lazy(() => import("./StudioBg3dSpatialStoryboardPanel"));
const AdvancedWorkbenchHub = lazy(() => import("./StudioBg3dAdvancedWorkbenchHub"));

/** No heavyweight renderer, session request or eager specialist chunk on studio startup. */
export function StudioBg3dSpatialStoryboardLauncher({
  hidden = false,
  disabled = false,
  onInsertScenePrimitives,
  arraySelection,
  onExecuteSelectionArray,
  skpSourceSelection,
  onReadSkpSceneSource,
  onApplySkpSourceCamera,
  primitiveEditSelection,
  onBeginPrimitiveEdit,
  onApplyPrimitiveEdit,
  sceneGlbExportUnavailableReason,
  onExportCurrentSceneGlb,
}: StudioBg3dWorkbenchHostPorts & {
  readonly hidden?: boolean;
  readonly disabled?: boolean;
}) {
  const t = useT();
  const bt = useBilingual("StudioBg3dSpatialStoryboardLauncher");
  const [expanded, setExpanded] = useState(false);
  const [workbenchExpanded, setWorkbenchExpanded] = useState(false);
  const contentId = useId();
  const workbenchContentId = useId();
  return (
    <section hidden={hidden} className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        className="min-h-11 w-full rounded-lg border border-line bg-card px-3 text-left text-xs font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        onClick={() => setExpanded((value) => !value)}
      >
        공간 콘티 · XR 배치 계획 {expanded ? "접기" : "열기"}
      </button>
      <div id={contentId} hidden={!expanded}>
        {expanded && !hidden ? (
          <Suspense fallback={<StudioPanelLoading label={t("studio.canvas.panelLoading.spatialStoryboardTools", "공간 콘티 도구를 불러오는 중이에요.")} />}>
            <SpatialStoryboardPanel />
          </Suspense>
        ) : null}
      </div>

      <button
        type="button"
        aria-expanded={workbenchExpanded}
        aria-controls={workbenchContentId}
        data-testid="bg3d-advanced-workbench-launcher-toggle"
        className="min-h-11 w-full rounded-lg border border-line bg-card px-3 text-left text-xs font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        onClick={() => setWorkbenchExpanded((value) => !value)}
      >
        {workbenchExpanded
          ? bt("공간 모델러 접기", "Close Spatial Modeler")
          : bt("공간 모델러 열기", "Open Spatial Modeler")}
      </button>
      <div id={workbenchContentId} hidden={!workbenchExpanded}>
        {workbenchExpanded && !hidden ? (
          <Suspense fallback={<StudioPanelLoading label={t("studio.canvas.panelLoading.spatialStoryboardTools", "3D 스페셜리스트 워크벤치를 불러오는 중이에요.")} />}>
            <AdvancedWorkbenchHub
              defaultTab="spatial-modeler"
              disabled={disabled}
              onInsertScenePrimitives={onInsertScenePrimitives}
              arraySelection={arraySelection}
              onExecuteSelectionArray={onExecuteSelectionArray}
              skpSourceSelection={skpSourceSelection}
              onReadSkpSceneSource={onReadSkpSceneSource}
              onApplySkpSourceCamera={onApplySkpSourceCamera}
              primitiveEditSelection={primitiveEditSelection}
              onBeginPrimitiveEdit={onBeginPrimitiveEdit}
              onApplyPrimitiveEdit={onApplyPrimitiveEdit}
              sceneGlbExportUnavailableReason={sceneGlbExportUnavailableReason}
              onExportCurrentSceneGlb={onExportCurrentSceneGlb}
            />
          </Suspense>
        ) : null}
      </div>
    </section>
  );
}
