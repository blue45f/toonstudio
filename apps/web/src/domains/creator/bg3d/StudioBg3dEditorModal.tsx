import "../studio-3d-ui/studio-3d-reference-workspace.css";
// The legacy editor still reuses one mutable host object. Keep this shell out of React Compiler
// memoization until the remaining document/session controllers stop mutating that identity.

import { SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useCallback, useMemo, useReducer, useState } from "react";
import { createPortal } from "react-dom";

import { StudioToolArtwork } from "../studio-tool-art/StudioToolArtwork";
import { useStudio3dVisualViewport } from "../studio-3d-ui/useStudio3dVisualViewport";
import "./studio-bg3d-mobile-workspace.css";
import "../studio-3d-ui/studio-3d-illustrated-chrome.css";

import type { RefObject } from "react";

import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioWebXrSessionState } from "../studio-webxr-session";
import { StudioBg3dEditorSidebar } from "./StudioBg3dEditorSidebar";
import { StudioBg3dEditorViewport } from "./StudioBg3dEditorViewport";
import { StudioBg3dProfessionalWorkspace } from "./StudioBg3dProfessionalWorkspace";
import { StudioBg3dReadinessBadge } from "./StudioBg3dReadinessBadge";
import { StudioBg3dSceneAssistantWorkspace } from "./StudioBg3dSceneAssistantWorkspace";
import type { StudioBg3dReadinessSnapshot } from "./studio-bg3d-readiness-state";
import type { StudioBg3dResourceRecoveryPorts } from "./studio-bg3d-resource-recovery-host";

import type { StudioBg3dSceneAssistantHost } from "./StudioBg3dSceneAssistantWorkspace";
import { StudioBg3dSceneOutliner } from "./StudioBg3dSceneOutliner";
import {
  STUDIO_BG3D_CONTROL_BUTTON,
  STUDIO_BG3D_ICON_BUTTON,
  studioBg3dClassNames,
} from "./studio-bg3d-editor-ui";

import type { StudioBg3dSceneOutlinerController } from "./studio-bg3d-scene-outliner-controller";
import type { StudioBg3dCaptureAdapter } from "./studio-bg3d-capture-adapter";
import type {
  StudioBg3dWebtoonAtmospherePreset,
  StudioBg3dWebtoonAtmospherePresetId,
} from "./studio-bg3d-lighting-studio";
import {
  buildReshootRestorePayload,
  getBakedManuscriptCutLayerForCut,
  saveBakedManuscriptCutLayer,
  type BakedManuscriptCutLayer,
  type Scene3DCaptureCameraSnapshot,
  type Scene3DCaptureSnapshot,
  type Stage3DMode,
} from "./studio-bg3d-live-ink-bake-bridge";
import { captureStudioBg3dLiveInkSnapshot } from "./studio-bg3d-live-ink-viewport-capture";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  type StudioBg3dCameraSettings,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import type { StudioBg3dSectionCapSummary } from "./studio-bg3d-section-cap-coordination";
import {
  DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
  type Bg3dWallCutawayConfig,
} from "./studio-bg3d-wall-cutaway-runtime";
import type { StudioBg3dExperienceMode } from "./StudioBackground3DTypes";

interface StudioBg3dShotBatchProgress {
  readonly stage: "render" | "contact" | "archive";
  readonly completed: number;
  readonly total: number;
}

export interface StudioBg3dEditorModalHost {
  readonly open: boolean;
  readonly webXrRendererLifetimeRetained: boolean;
  readonly modalDialogRef: RefObject<HTMLDivElement | null>;
  readonly isBatchRenderingShots: boolean;
  readonly shotBatchProgress: StudioBg3dShotBatchProgress | null;
  readonly shotBatchAbortRef: RefObject<AbortController | null>;
  readonly isCapturing: boolean;
  readonly deletingModelId: string | null;
  readonly webXrSessionState: StudioWebXrSessionState;
  readonly requestUserClose: () => void;
  readonly outlinerController: StudioBg3dSceneOutlinerController;
  readonly sharedStageSessionScopeKey?: string;
  readonly readinessState?: StudioBg3dReadinessSnapshot;
  readonly resourceRecovery?: StudioBg3dResourceRecoveryPorts;
  readonly [key: string]: unknown;
}

interface StudioBg3dEditorModalProps {
  readonly h: StudioBg3dEditorModalHost;
}

export function StudioBg3dEditorModal({ h }: StudioBg3dEditorModalProps) {
  "use no memo";
  const {
    open,
    webXrRendererLifetimeRetained,
    modalDialogRef,
    isBatchRenderingShots,
    shotBatchProgress,
    shotBatchAbortRef,
    isCapturing,
    deletingModelId,
    webXrSessionState,
    requestUserClose,
  } = h;
  const [experienceMode, setExperienceMode] = useState<StudioBg3dExperienceMode>("simple");
  const [, refreshViewport] = useReducer((version: number) => version + 1, 0);
  const [liveCaptureSnapshot, setLiveCaptureSnapshot] = useState<Scene3DCaptureSnapshot | null>(null);
  const [isLiveCapturing, setIsLiveCapturing] = useState(false);
  const [localWallCutawayConfig, setLocalWallCutawayConfig] = useState<Bg3dWallCutawayConfig>(
    DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
  );
  const resolvedTargetDocumentId = useMemo(() => {
    const cutDocKey = typeof h.cutDocumentKey === "string" && h.cutDocumentKey.trim()
      ? h.cutDocumentKey.trim()
      : null;
    const scope = typeof h.sharedStageSessionScopeKey === "string" && h.sharedStageSessionScopeKey.trim()
      ? h.sharedStageSessionScopeKey.trim()
      : null;
    const recovery = h.recoveryScope as { readonly projectId?: string; readonly cutId?: string } | undefined;
    const recoveryKey = recovery?.projectId?.trim() || recovery?.cutId?.trim() || null;
    return cutDocKey ?? scope ?? recoveryKey ?? "studio-manuscript-active";
  }, [h.cutDocumentKey, h.recoveryScope, h.sharedStageSessionScopeKey]);
  const resolvedTargetCutIndex = useMemo(() => {
    const candidate = h.activeCutIndex;
    return typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0 ? candidate : 0;
  }, [h.activeCutIndex]);
  const [lastBakedLayer, setLastBakedLayer] = useState<BakedManuscriptCutLayer | null>(() =>
    getBakedManuscriptCutLayerForCut(resolvedTargetDocumentId, resolvedTargetCutIndex),
  );
  const sceneDoc = (h.sceneBaseDocument as StudioBg3dSceneDocument | undefined)
    ?? DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT;
  const wallCutawayConfig = (h.wallCutawayConfig as Bg3dWallCutawayConfig | undefined)
    ?? localWallCutawayConfig;
  const setWallCutawayConfig = useCallback(
    (next: Bg3dWallCutawayConfig) => {
      setLocalWallCutawayConfig(next);
      const setter = h.setWallCutawayConfig as ((config: Bg3dWallCutawayConfig) => void) | undefined;
      setter?.(next);
    },
    [h],
  );
  const activeWebtoonAtmosphereId =
    (h.activeWebtoonAtmosphereId as StudioBg3dWebtoonAtmospherePresetId | null | undefined) ?? null;
  const handleApplyWebtoonAtmosphere = useCallback(
    (preset: StudioBg3dWebtoonAtmospherePreset) => {
      const applyFn = h.applyWebtoonAtmospherePreset as
        | ((value: StudioBg3dWebtoonAtmospherePreset) => void)
        | undefined;
      applyFn?.(preset);
    },
    [h],
  );
  const handleRequestLiveCapture = useCallback(
    async (stage: Stage3DMode): Promise<Scene3DCaptureSnapshot | null> => {
      const captureRef = h.captureRef as
        | RefObject<{ readonly adapter?: StudioBg3dCaptureAdapter } | null>
        | undefined;
      const adapter = captureRef?.current?.adapter ?? null;
      if (!adapter) return liveCaptureSnapshot;
      setIsLiveCapturing(true);
      try {
        const viewportApi = (
          h.viewportApiRef as RefObject<{ readonly readView?: () => StudioBg3dCameraSettings } | null> | undefined
        )?.current;
        const liveView = viewportApi?.readView?.() ?? sceneDoc.camera;
        const liveCamera: Scene3DCaptureCameraSnapshot = {
          position: [liveView.position[0], liveView.position[1], liveView.position[2]],
          target: [liveView.target[0], liveView.target[1], liveView.target[2]],
          fovDegrees: liveView.fovDegrees,
        };
        const customModels = Array.isArray(h.customModels)
          ? (h.customModels as ReadonlyArray<{ readonly modelId?: string; readonly id?: string }>)
          : [];
        const primitives = Array.isArray(h.primitives)
          ? (h.primitives as ReadonlyArray<{ readonly id?: string }>)
          : [];
        const sharedCharacters = Array.isArray(h.sharedCharacters)
          ? (h.sharedCharacters as ReadonlyArray<{ readonly elementId?: string }>)
          : [];
        const assetIds = [
          ...customModels.map((item) => item.modelId ?? item.id ?? ""),
          ...sharedCharacters.map((item) => item.elementId ?? ""),
          ...primitives.map((item) => item.id ?? ""),
        ].filter((id) => id.trim().length > 0);
        const snapshot = await captureStudioBg3dLiveInkSnapshot({
          adapter,
          document: sceneDoc,
          sceneId: resolvedTargetDocumentId,
          cameraId: sceneDoc.activeShotId ?? "main-camera",
          stage,
          liveCamera,
          atmospherePresetId: activeWebtoonAtmosphereId,
          assetIds,
          includeSceneDocumentJson: true,
        });
        setLiveCaptureSnapshot(snapshot);
        return snapshot;
      } finally {
        setIsLiveCapturing(false);
      }
    },
    [activeWebtoonAtmosphereId, h, liveCaptureSnapshot, resolvedTargetDocumentId, sceneDoc],
  );
  const handleBakeToManuscriptCut = useCallback(
    (layer: BakedManuscriptCutLayer) => {
      saveBakedManuscriptCutLayer(layer);
      setLastBakedLayer(layer);
      const onInsertHost = h.onInsert as ((result: Record<string, unknown>) => void) | undefined;
      if (typeof onInsertHost === "function" && layer.inkPassRef.startsWith("data:image/")) {
        try {
          onInsertHost({
            dataUrl: layer.inkPassRef,
            shadedDataUrl: layer.shadedPassRef,
            sceneData: layer.sceneDocumentJson ?? "",
            bakedManuscriptCutLayer: layer,
          });
        } catch {
          // 2D 호스트 삽입 콜백이 단독 모달에서 거부되어도 영속 브리지 기록은 유지한다.
        }
      }
    },
    [h],
  );
  const handleRestoreReshootFromBakedLayer = useCallback(
    (layer: BakedManuscriptCutLayer) => {
      const payload = buildReshootRestorePayload(layer);
      if (payload.camera) {
        const nextCameraView: StudioBg3dCameraSettings = {
          ...sceneDoc.camera,
          position: [...payload.camera.position] as [number, number, number],
          target: [...payload.camera.target] as [number, number, number],
          fovDegrees: payload.camera.fovDegrees,
        };
        const viewportApi = (
          h.viewportApiRef as RefObject<{ readonly applyView?: (view: StudioBg3dCameraSettings) => boolean } | null> | undefined
        )?.current;
        viewportApi?.applyView?.(nextCameraView);
        const commitCamera = h.commitCameraViewCommand as
          | ((view: StudioBg3dCameraSettings, label?: string) => void)
          | undefined;
        commitCamera?.(nextCameraView, "3D 재촬영 구도 복원");
      }
      if (payload.atmospherePresetId) {
        const applyFn = h.applyWebtoonAtmospherePreset as
          | ((id: StudioBg3dWebtoonAtmospherePresetId) => void)
          | undefined;
        applyFn?.(payload.atmospherePresetId);
      }
    },
    [h, sceneDoc.camera],
  );
  const [viewportMount] = useState(() => {
    if (typeof document === "undefined") return null;
    const node = document.createElement("div");
    node.className = "contents";
    node.dataset.bg3dViewportMount = "true";
    return node;
  });
  const placeViewport = useCallback((anchor: HTMLSpanElement | null) => {
    if (!viewportMount) return;
    // 간편·정밀 전환은 배치만 바꾼다. 같은 캔버스와 그 GPU 장치는 편집기가 닫힐 때까지 유지한다.
    if (anchor) anchor.before(viewportMount);
    else viewportMount.remove();
  }, [viewportMount]);
  useStudio3dVisualViewport(modalDialogRef, open);
  if (!open && !webXrRendererLifetimeRetained) return null;
  const viewportSlot = <span hidden ref={placeViewport} />;

  const title = experienceMode === "simple"
    ? translateCurrentStaticSourceText(
        "domains.creator.bg3d.StudioBg3dEditorModal",
        "ko",
        "장면 도우미",
      )
    : translateCurrentStaticSourceText(
        "domains.creator.bg3d.StudioBg3dEditorModal",
        "ko",
        "정밀 3D 편집",
      );
  const description = experienceMode === "simple"
    ? translateCurrentStaticSourceText(
        "domains.creator.bg3d.StudioBg3dEditorModal",
        "ko",
        "장소를 고르고 구도를 맞춘 뒤 현재 컷에 바로 적용하세요.",
      )
    : translateCurrentStaticSourceText(
        "domains.creator.bg3d.StudioBg3dEditorModal",
        "ko",
        "계층·재질·물리·렌더 출력을 정밀하게 편집합니다.",
      );

  return (
    <div
      ref={modalDialogRef}
      aria-hidden={!open || undefined}
      aria-modal={open ? "true" : undefined}
      aria-labelledby="studio-bg3d-dialog-title"
      aria-describedby="studio-bg3d-dialog-description"
      data-testid="studio-bg3d-dialog"
      data-studio-3d-reference="tooncraft"
      data-studio-bg3d-workspace={experienceMode === "simple" ? "scene-assistant-v1" : "professional-v2"}
      data-studio-bg3d-experience={experienceMode}
      hidden={!open}
      inert={!open ? true : undefined}
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.94)] p-2 text-fg sm:p-4"
      role={open ? "dialog" : undefined}
      tabIndex={-1}
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
        paddingRight: "max(0.5rem, env(safe-area-inset-right))",
      }}
    >
      <div className="mx-auto flex h-full max-h-full max-w-[1800px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_80px_oklch(0.05_0.01_70/0.55)]">
        <header
          data-bg3d-workspace-header="true"
          data-bg3d-header-layout="compact-two-row"
          className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-b border-line px-2.5 py-1.5 sm:flex-nowrap sm:items-center sm:gap-3 sm:px-5 sm:py-3"
        >
          <div
            data-bg3d-header-title="true"
            className="order-1 flex min-w-0 flex-1 items-center gap-2 sm:flex-initial sm:gap-2.5"
          >
            <StudioToolArtwork tool="environment" className="shrink-0 [--studio-tool-art-size:26px] sm:[--studio-tool-art-size:38px]" />
            <div className="min-w-0">
              <h2
                id="studio-bg3d-dialog-title"
                className="truncate text-sm font-bold tracking-tight text-fg sm:mt-0.5 sm:text-xl"
              >
                {title}
              </h2>
              <p id="studio-bg3d-dialog-description" className="mt-0.5 hidden line-clamp-1 text-xs text-fg-3 sm:block">
                {description}
              </p>
            </div>
          </div>
          {h.readinessState ? (
            <div
              data-bg3d-header-status-row="true"
              className="order-3 flex w-full min-w-0 items-center justify-between gap-1.5 sm:order-2 sm:ml-auto sm:w-auto sm:shrink-0 sm:justify-end"
            >
              <StudioBg3dReadinessBadge
                readiness={h.readinessState}
                lowQualityActive={Boolean(h.resourceRecovery?.lowQualityActive)}
                exposeLegacyActiveBackendTestId={experienceMode === "simple"}
                disableReturnTo2d={isCapturing || deletingModelId !== null}
                onReturnTo2d={h.resourceRecovery?.returnTo2d ?? requestUserClose}
              />
            </div>
          ) : null}
          <div
            data-bg3d-header-actions="true"
            className={studioBg3dClassNames(
              "order-2 flex shrink-0 items-center gap-1.5 sm:order-3 sm:gap-2",
              !h.readinessState && "sm:ml-auto",
            )}
          >
            <a
              href="/studio/3d/dcc/model"
              data-testid="bg3d-open-hybrid-dcc-link"
              className="hidden min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent md:inline-flex"
            >
              <StudioToolArtwork tool="model" className="[--studio-tool-art-size:22px]" />
              정밀 모델러 (DCC)
            </a>
            <div
              className="flex shrink-0 items-center rounded-lg border border-line bg-card p-0 sm:p-0.5"
              role="group"
              aria-label={translateCurrentStaticSourceText(
                "domains.creator.bg3d.StudioBg3dEditorModal",
                "ko",
                "3D 편집 모드",
              )}
            >
              <button
                type="button"
                aria-pressed={experienceMode === "simple"}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-xs font-bold whitespace-nowrap text-fg-2 hover:text-fg aria-pressed:bg-accent-soft aria-pressed:text-fg sm:min-h-9 sm:min-w-0 sm:px-3"
                onClick={() => setExperienceMode("simple")}
              >
                <Sparkles size={12} className="mr-1 hidden sm:inline" aria-hidden />
                <span className="hidden sm:inline">장면 도우미</span>
                <span className="sm:hidden">간편</span>
              </button>
              <button
                type="button"
                aria-pressed={experienceMode === "pro"}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-xs font-bold whitespace-nowrap text-fg-2 hover:text-fg aria-pressed:bg-accent-soft aria-pressed:text-fg sm:min-h-9 sm:min-w-0 sm:px-3"
                onClick={() => setExperienceMode("pro")}
              >
                <SlidersHorizontal size={12} className="mr-1 hidden sm:inline" aria-hidden />
                <span className="hidden sm:inline">정밀 편집</span>
                <span className="sm:hidden">정밀</span>
              </button>
            </div>
            {isBatchRenderingShots ? (
              <>
                <span className="sr-only" role="status" aria-live="polite">
                  {shotBatchProgress?.stage === "render"
                    ? translateCurrentStaticSourceText(
                        "domains.creator.bg3d.StudioBg3dEditorModal",
                        "ko",
                        "컷 렌더",
                      )
                    : translateCurrentStaticSourceText(
                        "domains.creator.bg3d.StudioBg3dEditorModal",
                        "ko",
                        "ZIP 생성",
                      )}{" "}
                  {shotBatchProgress?.completed ?? 0}/{shotBatchProgress?.total ?? 0}
                </span>
                <button
                  type="button"
                  className={studioBg3dClassNames(
                    STUDIO_BG3D_CONTROL_BUTTON,
                    "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                  onClick={() => shotBatchAbortRef.current?.abort()}
                >
                  <X size={14} aria-hidden />
                  {translateCurrentStaticSourceText(
                    "domains.creator.bg3d.StudioBg3dEditorModal",
                    "ko",
                    "일괄 렌더 취소",
                  )}
                </button>
              </>
            ) : null}
            <button
              type="button"
              aria-label={translateCurrentStaticSourceText(
                "domains.creator.bg3d.StudioBg3dEditorModal",
                "ko",
                "닫기",
              )}
              data-bg3d-initial-focus="true"
              title={isCapturing || deletingModelId !== null
                ? translateCurrentStaticSourceText(
                    "domains.creator.bg3d.StudioBg3dEditorModal",
                    "ko",
                    "진행 중인 작업이 끝난 뒤 닫을 수 있습니다",
                  )
                : webXrSessionState.status !== "idle" && webXrSessionState.status !== "error"
                  ? translateCurrentStaticSourceText(
                      "domains.creator.bg3d.StudioBg3dEditorModal",
                      "ko",
                      "AR·VR 미리보기를 종료하고 닫기",
                    )
                  : translateCurrentStaticSourceText(
                      "domains.creator.bg3d.StudioBg3dEditorModal",
                      "ko",
                      "닫기 (Esc)",
                    )}
              className={STUDIO_BG3D_ICON_BUTTON}
              disabled={isCapturing}
              aria-disabled={deletingModelId !== null || undefined}
              onClick={requestUserClose}
            >
              <X size={17} aria-hidden />
            </button>
          </div>
        </header>
        <div
          aria-busy={isCapturing || undefined}
          inert={isCapturing}
          data-destructive-busy={deletingModelId !== null || undefined}
          className="flex min-h-0 flex-1"
        >
          {experienceMode === "simple" ? (
            <StudioBg3dSceneAssistantWorkspace
              h={h as unknown as StudioBg3dSceneAssistantHost}
              viewport={viewportSlot}
              onHostChange={refreshViewport}
              onOpenProfessional={() => setExperienceMode("pro")}
            />
          ) : (
            <StudioBg3dProfessionalWorkspace
              cutHost={h}
              scopeKey={h.sharedStageSessionScopeKey ?? null}
              captureSnapshot={liveCaptureSnapshot}
              isLiveCapturing={isLiveCapturing}
              onRequestLiveCapture={handleRequestLiveCapture}
              targetDocumentId={resolvedTargetDocumentId}
              targetCutIndex={resolvedTargetCutIndex}
              heroCamera={{
                position: sceneDoc.camera.position,
                target: sceneDoc.camera.target,
              }}
              activeWebtoonAtmosphereId={activeWebtoonAtmosphereId}
              onApplyWebtoonAtmosphere={handleApplyWebtoonAtmosphere}
              wallCutawayConfig={wallCutawayConfig}
              onWallCutawayConfigChange={setWallCutawayConfig}
              sectionCapSummary={(h.sectionCapSummary as StudioBg3dSectionCapSummary | null | undefined) ?? null}
              lastBakedLayer={lastBakedLayer}
              onBakeToManuscriptCut={handleBakeToManuscriptCut}
              onRestoreReshootFromBakedLayer={handleRestoreReshootFromBakedLayer}
              outliner={<StudioBg3dSceneOutliner controller={h.outlinerController} variant="dock" />}
              viewport={viewportSlot}
              inspector={(
                <StudioBg3dEditorSidebar
                  h={h}
                  experienceMode="pro"
                  onOpenPro={() => setExperienceMode("pro")}
                />
              )}
            />
          )}
          {viewportMount && createPortal(<StudioBg3dEditorViewport h={h} simplified={experienceMode === "simple"} />, viewportMount)}
        </div>
      </div>
    </div>
  );
}
