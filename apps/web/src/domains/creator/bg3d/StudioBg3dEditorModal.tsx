import "../studio-3d-ui/studio-3d-reference-workspace.css";
// The legacy editor still reuses one mutable host object. Keep this shell out of React Compiler
// memoization until the remaining document/session controllers stop mutating that identity.

import { SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useCallback, useReducer, useState } from "react";
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
        <header data-bg3d-workspace-header="true" className="flex flex-wrap shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2 sm:flex-nowrap sm:items-start sm:gap-3 sm:px-5 sm:py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <StudioToolArtwork tool="environment" className="[--studio-tool-art-size:28px] sm:[--studio-tool-art-size:38px]" />
            <div className="min-w-0">
              <h2
                id="studio-bg3d-dialog-title"
                className="mt-0.5 truncate text-base font-bold tracking-tight text-fg sm:mt-1 sm:text-xl"
              >
                {title}
              </h2>
              <p id="studio-bg3d-dialog-description" className="mt-1 hidden line-clamp-1 text-xs text-fg-3 min-[480px]:block">
                {description}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:flex-nowrap sm:gap-2">
            {h.readinessState ? (
              <StudioBg3dReadinessBadge
                readiness={h.readinessState}
                lowQualityActive={Boolean(h.resourceRecovery?.lowQualityActive)}
                exposeLegacyActiveBackendTestId={experienceMode === "simple"}
                disableReturnTo2d={isCapturing || deletingModelId !== null}
                onReturnTo2d={h.resourceRecovery?.returnTo2d ?? requestUserClose}
              />
            ) : null}
            <a
              href="/studio/3d/dcc/model"
              data-testid="bg3d-open-hybrid-dcc-link"
              className="hidden min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent md:inline-flex"
            >
              <StudioToolArtwork tool="model" className="[--studio-tool-art-size:22px]" />
              정밀 모델러 (DCC)
            </a>
            <div
              className="flex items-center rounded-lg border border-line bg-card p-0.5"
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
                className="min-h-11 rounded-md px-2.5 text-xs font-bold text-fg-2 hover:text-fg aria-pressed:bg-accent-soft aria-pressed:text-fg sm:px-3"
                onClick={() => setExperienceMode("simple")}
              >
                <Sparkles size={12} className="mr-1 hidden min-[360px]:inline" aria-hidden />
                <span className="hidden sm:inline">장면 도우미</span>
                <span className="sm:hidden">간편</span>
              </button>
              <button
                type="button"
                aria-pressed={experienceMode === "pro"}
                className="min-h-11 rounded-md px-2.5 text-xs font-bold text-fg-2 hover:text-fg aria-pressed:bg-accent-soft aria-pressed:text-fg sm:px-3"
                onClick={() => setExperienceMode("pro")}
              >
                <SlidersHorizontal size={12} className="mr-1 hidden min-[360px]:inline" aria-hidden />
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
