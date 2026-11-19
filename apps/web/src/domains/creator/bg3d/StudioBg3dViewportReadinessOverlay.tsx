import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_BG3D_CONTROL_BUTTON,
  studioBg3dClassNames,
} from "./studio-bg3d-editor-ui";
import {
  STUDIO_BG3D_ENGINE_PREFERENCE_LABELS,
  type StudioBg3dEngineBackend,
} from "./studio-bg3d-engine-selection";
import { isStudioBg3dCanvasFactoryPending } from "./studio-bg3d-canvas-renderer-admission";
import { STUDIO_BG3D_WEBGPU_RENDERER_INIT_TIMEOUT_MS } from "./studio-bg3d-webgpu-capability";
import type { StudioBg3dEngineRuntimeState } from "./useStudioBg3dEngineRuntime";

/** WebGL2 캔버스 마운트부터 onCreated까지의 제한. */
export const STUDIO_BG3D_RENDERER_STARTUP_TIMEOUT_MS = 6_000;

interface WebGlContextEventLike extends Event {
  readonly statusMessage?: string;
}

export interface StudioBg3dViewportReadinessOverlayProps {
  readonly open: boolean;
  readonly engineRuntime: Pick<StudioBg3dEngineRuntimeState, "phase" | "plan" | "canvasKey" | "glFactory" | "webGpuCanvasStage" | "setPreference" | "reportRendererFailure">;
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
  startupTimeoutMs,
}: StudioBg3dViewportReadinessOverlayProps) {
  const bt = useBilingual("StudioBg3dViewportReadinessOverlay");
  const { phase, plan, canvasKey, reportRendererFailure } = engineRuntime;
  const factoryPending = isStudioBg3dCanvasFactoryPending(engineRuntime);
  const backend: StudioBg3dEngineBackend = plan.backend;
  const deadlineMs = startupTimeoutMs ?? (backend === "webgpu"
    ? STUDIO_BG3D_WEBGPU_RENDERER_INIT_TIMEOUT_MS
    : STUDIO_BG3D_RENDERER_STARTUP_TIMEOUT_MS);
  const hasModelRenderer = modelRenderer != null;
  const [slowStage, setSlowStage] = useState<string | null>(null);
  const stage = engineRuntime.webGpuCanvasStage;
  const pendingFrame = backend === "webgpu" && stage !== "rendered";
  const stageKey = `${canvasKey}/${stage}`;
  useEffect(() => {
    setSlowStage(null);
    if (!open || phase !== "ready" || plan.status !== "available" || factoryPending || !pendingFrame) return;
    // 장치의 init 제한은 factory가 관리한다. Suspense·첫 프레임 지연은 사용자에게 선택지를 준다.
    const timer = window.setTimeout(() => setSlowStage(stageKey), deadlineMs);
    return () => window.clearTimeout(timer);
  }, [open, phase, plan.status, factoryPending, pendingFrame, stageKey, deadlineMs]);
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
    if (backend !== "webgl2" || !open || phase !== "ready" || plan.status !== "available" || factoryPending || hasModelRenderer) {
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
      if (backend === "webgl2" && /WebGLRenderer:\s*Error creating WebGL context/iu.test(msg)) {
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
    }, deadlineMs);

    return () => {
      host?.removeEventListener("webglcontextcreationerror", onContextCreationError, true);
      window.removeEventListener("error", onWindowError);
      window.clearTimeout(timer);
    };
  }, [
    backend,
    canvasKey,
    deadlineMs,
    factoryPending,
    hasModelRenderer,
    open,
    phase,
    plan.status,
    reportRendererFailure,
    viewportHostRef,
  ]);

  if (!open || phase !== "ready" || plan.status !== "available" || factoryPending) {
    return null;
  }
  if (hasModelRenderer && !isRestoringScene && !pendingFrame) {
    return null;
  }

  const engineLabel = STUDIO_BG3D_ENGINE_PREFERENCE_LABELS[backend];
  const headline = backend === "webgpu" && stage === "waiting-for-canvas"
    ? bt("3D 뷰포트를 열고 있습니다…", "Opening the 3D viewport…")
    : backend === "webgpu" && stage === "waiting-for-frame"
    ? bt("장면의 첫 화면을 그리고 있습니다…", "Drawing the first scene frame…")
    : !hasModelRenderer || (backend === "webgpu" && stage === "starting-device")
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
      data-webgpu-canvas-stage={backend === "webgpu" ? stage : undefined}
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
      {slowStage === stageKey ? (
        <button type="button" className={studioBg3dClassNames(STUDIO_BG3D_CONTROL_BUTTON, "min-h-11 min-w-11 px-4")}
          onClick={() => engineRuntime.setPreference("webgl2")}>
          {bt("WebGL2로 계속", "Continue with WebGL2")}
        </button>
      ) : null}
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
