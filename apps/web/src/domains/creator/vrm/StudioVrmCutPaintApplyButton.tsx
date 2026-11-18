import { useEffect, useRef, useState } from "react";
import type { StudioVrmSurfacePaintSettings } from "./studio-vrm-scene-document";
import type { StudioVrmTexturePaintRuntime } from "./studio-vrm-texture-paint-runtime";
import type { StudioVrmCutPaintSession } from "./studio-vrm-cut-paint-session";
import type { StudioVrmPngWorkerSession } from "./studio-vrm-png-worker-session";

export function StudioVrmCutPaintApplyButton({session, runtime, disabled, pngSession, onApply}: {
  session: StudioVrmCutPaintSession; runtime: StudioVrmTexturePaintRuntime | null; disabled: boolean;
  pngSession?: StudioVrmPngWorkerSession; onApply: (paint: StudioVrmSurfacePaintSettings, current: () => boolean) => Promise<boolean>;
}) {
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => request.current?.abort(), [runtime, session]);
  async function apply() {
    if (!runtime || disabled || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const before = runtime.getContentRevision();
      const { persistStudioVrmTexturePaintRuntime } = await import("./studio-vrm-texture-paint-persistence");
      session.resetStaging();
      const paint = await persistStudioVrmTexturePaintRuntime(runtime, {signal:controller.signal, pngSession, dependencies:session.dependencies});
      controller.signal.throwIfAborted();
      const current = () => !controller.signal.aborted && before === runtime.getContentRevision() && runtime.getSnapshot().activeOperation === null;
      if (!current()) throw new Error("저장하는 동안 채색이 바뀌었습니다. 획을 마친 뒤 다시 적용해 주세요.");
      await onApply(paint, current);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "채색을 준비하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  }
  return <div className="text-right">
    {error && <p role="alert" className="mb-1 text-xs text-danger">{error}</p>}
    <button type="button" disabled={!runtime || disabled || busy} onClick={apply}
      className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-45">
      {busy ? "채색 확인 중…" : "새 컷 버전에 적용"}
    </button>
  </div>;
}
