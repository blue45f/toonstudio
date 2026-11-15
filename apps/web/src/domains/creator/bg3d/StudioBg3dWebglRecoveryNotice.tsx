import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_BG3D_WEBGL_RECOVERY_EVENT,
  type StudioBg3dWebglRecoveryNoticeDetail,
} from "./studio-bg3d-webgl-context-recovery";

export interface StudioBg3dWebglRecoveryNoticeProps {
  readonly hidden?: boolean;
  readonly lowQualityActive?: boolean;
  readonly onReopenLowQuality?: () => void;
  readonly onReturnTo2d?: () => void;
}

export function StudioBg3dWebglRecoveryNotice({
  hidden = false,
  lowQualityActive = false,
  onReopenLowQuality,
  onReturnTo2d,
}: StudioBg3dWebglRecoveryNoticeProps) {
  const copy = useBilingual("scene3d-webgl-recovery-notice");
  const [notice, setNotice] = useState<StudioBg3dWebglRecoveryNoticeDetail | null>(null);
  useEffect(() => {
    const onRecovery = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as StudioBg3dWebglRecoveryNoticeDetail;
      if (!detail?.owner || typeof detail.retry !== "function") return;
      setNotice((current) => detail.snapshot
        ? detail
        : current?.owner === detail.owner ? null : current);
    };
    window.addEventListener(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, onRecovery);
    return () => window.removeEventListener(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, onRecovery);
  }, []);
  const phase = notice?.snapshot?.phase;
  if (hidden || !notice || !phase || phase === "healthy" || phase === "restored") return null;
  return (
    <section
      data-testid="bg3d-webgl-recovery-notice"
      data-recovery-phase={phase}
      data-low-quality-active={lowQualityActive ? "true" : "false"}
      className="m-2 rounded-lg border border-warn/45 bg-panel p-3 text-sm text-fg"
      aria-label={copy("3D 화면 복구", "3D viewport recovery")}
    >
      <p role={phase === "failed" ? "alert" : "status"}>
        {phase === "failed"
          ? copy("3D 렌더러 초기화에 실패했습니다. 원본을 유지한 상태로 화면 복구를 다시 시도하세요.", "Renderer initialization failed. Retry viewport recovery with the source preserved.")
          : copy("3D 그래픽 연결이 끊어져 브라우저 복구를 기다리고 있습니다. 배치한 도형·모델·카메라는 보존되어 있습니다.", "The graphics context was lost. Waiting for browser recovery while keeping your placed objects and camera.")}
      </p>
      {phase === "failed" || onReopenLowQuality || onReturnTo2d ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {phase === "failed" ? (
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => notice.retry()}
            >
              {copy("화면 복구 다시 시도", "Retry viewport recovery")}
            </button>
          ) : null}
          {onReopenLowQuality ? (
            <button
              type="button"
              data-testid="bg3d-reopen-low-quality"
              className="min-h-11 min-w-11 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => {
                setNotice(null);
                onReopenLowQuality();
              }}
            >
              {copy("품질 낮춰 다시 열기", "Reopen in low quality")}
            </button>
          ) : null}
          {onReturnTo2d ? (
            <button
              type="button"
              data-testid="bg3d-return-2d"
              className="min-h-11 min-w-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              onClick={onReturnTo2d}
            >
              {copy("2D 원고로 복귀", "Return to 2D manuscript")}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
