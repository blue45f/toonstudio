import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_BG3D_CONTROL_BUTTON,
  studioBg3dClassNames,
} from "./studio-bg3d-editor-ui";
import {
  STUDIO_BG3D_ENGINE_PREFERENCE_LABELS,
  type StudioBg3dEngineBackend,
} from "./studio-bg3d-engine-selection";
import type { StudioBg3dEngineRuntimeState } from "./useStudioBg3dEngineRuntime";

/**
 * Bounded deadline for R3F Canvas -> renderer creation (`onCreated`).
 * Distinct from the 120s asset/capture deadlines: if a renderer instance still does not exist
 * after 6s (for example when R3F `configure` throws asynchronously inside ResizeObserver on a
 * GPU-less host), transition immediately into the explicit failed-engine state.
 */
export const STUDIO_BG3D_RENDERER_STARTUP_TIMEOUT_MS = 6_000;

interface WebGlContextEventLike extends Event {
  readonly statusMessage?: string;
}

export interface StudioBg3dViewportReadinessOverlayProps {
  readonly open: boolean;
  readonly engineRuntime: StudioBg3dEngineRuntimeState;
  readonly modelRenderer: unknown;
  readonly onClearModelRenderer: () => void;
  readonly isRestoringScene: boolean;
  readonly viewportHostRef: RefObject<HTMLElement | null>;
  readonly onReturnTo2d?: () => void;
  readonly startupTimeoutMs?: number;
}

export function StudioBg3dViewportReadinessOverlay({
  open,
  engineRuntime,
  modelRenderer,
  onClearModelRenderer,
  isRestoringScene,
  viewportHostRef,
  onReturnTo2d,
  startupTimeoutMs = STUDIO_BG3D_RENDERER_STARTUP_TIMEOUT_MS,
}: StudioBg3dViewportReadinessOverlayProps) {
  const bt = useBilingual("StudioBg3dViewportReadinessOverlay");
  const { phase, plan, canvasKey, reportRendererFailure } = engineRuntime;
  const backend: StudioBg3dEngineBackend = plan.backend;
  const hasModelRenderer = modelRenderer != null;
  const hasModelRendererRef = useRef(hasModelRenderer);

  useEffect(() => {
    hasModelRendererRef.current = hasModelRenderer;
  }, [hasModelRenderer]);

  // Clear stale renderer reference whenever the interactive Canvas unmounts.
  useEffect(() => {
    if (!open || phase === "probing" || plan.status !== "available") {
      if (hasModelRenderer) {
        onClearModelRenderer();
      }
    }
  }, [hasModelRenderer, onClearModelRenderer, open, phase, plan.status]);

  // Observe native `webglcontextcreationerror` and asynchronous R3F `THREE.WebGLRenderer` throws.
  useEffect(() => {
    if (!open || phase !== "ready" || plan.status !== "available" || hasModelRenderer) {
      return undefined;
    }
    const host = viewportHostRef.current;
    const onContextCreationError = (event: Event) => {
      const detail = (event as WebGlContextEventLike).statusMessage?.trim();
      reportRendererFailure(
        backend,
        detail || `${STUDIO_BG3D_ENGINE_PREFERENCE_LABELS[backend]} 그래픽 컨텍스트를 생성하지 못했습니다`,
      );
    };
    const onWindowError = (event: ErrorEvent) => {
      const msg = String(event.error?.message ?? event.message ?? "");
      if (/WebGLRenderer:\s*Error creating WebGL context|WebGPU/iu.test(msg)) {
        event.preventDefault();
        reportRendererFailure(
          backend,
          `${STUDIO_BG3D_ENGINE_PREFERENCE_LABELS[backend]} 그래픽 컨텍스트를 생성하지 못했습니다`,
        );
      }
    };
    host?.addEventListener("webglcontextcreationerror", onContextCreationError, true);
    window.addEventListener("error", onWindowError);
    const timer = window.setTimeout(() => {
      if (!hasModelRendererRef.current) {
        reportRendererFailure(
          backend,
          `${STUDIO_BG3D_ENGINE_PREFERENCE_LABELS[backend]} 렌더러 응답이 지연되어 초기화를 중단했습니다`,
        );
      }
    }, startupTimeoutMs);

    return () => {
      host?.removeEventListener("webglcontextcreationerror", onContextCreationError, true);
      window.removeEventListener("error", onWindowError);
      window.clearTimeout(timer);
    };
  }, [
    backend,
    canvasKey,
    hasModelRenderer,
    open,
    phase,
    plan.status,
    reportRendererFailure,
    startupTimeoutMs,
    viewportHostRef,
  ]);

  if (!open || phase !== "ready" || plan.status !== "available") {
    return null;
  }
  if (hasModelRenderer && !isRestoringScene) {
    return null;
  }

  const engineLabel = STUDIO_BG3D_ENGINE_PREFERENCE_LABELS[backend];
  const headline = !hasModelRenderer
    ? bt(
        `${engineLabel} 엔진을 초기화하고 있습니다…`,
        `Initializing ${engineLabel} engine…`,
      )
    : bt(
        `${engineLabel} 장면을 준비하고 있습니다…`,
        `Preparing ${engineLabel} scene…`,
      );

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="studio-bg3d-renderer-initializing"
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-panel/92 p-6 text-center text-sm text-fg backdrop-blur-sm"
    >
      <Loader2
        size={22}
        className="animate-spin text-accent motion-reduce:animate-none"
        aria-hidden
      />
      <p className="font-semibold [word-break:keep-all]">{headline}</p>
      <p className="max-w-sm text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
        {bt(
          "선택한 엔진과 장면 초안을 그대로 유지한 채 뷰포트를 연결합니다.",
          "Connecting the viewport while preserving your selected engine and scene draft.",
        )}
      </p>
      {onReturnTo2d ? (
        <button
          type="button"
          data-testid="studio-bg3d-initializing-return-2d"
          onClick={onReturnTo2d}
          className={studioBg3dClassNames(
            STUDIO_BG3D_CONTROL_BUTTON,
            "mt-1 min-h-11 min-w-11 border-line bg-card px-4 text-xs font-semibold text-fg hover:bg-raised",
          )}
        >
          <ArrowLeft size={14} aria-hidden />
          <span>{bt("2D 원고로 복귀", "Return to 2D manuscript")}</span>
        </button>
      ) : null}
    </div>
  );
}
