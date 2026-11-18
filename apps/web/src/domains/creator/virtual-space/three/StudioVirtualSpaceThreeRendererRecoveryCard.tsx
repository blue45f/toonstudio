import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioVirtualThreeQualityMode } from "./studio-virtual-space-three-renderer-recovery";

export interface StudioVirtualSpaceThreeRendererRecoveryCardProps {
  readonly contextLost: boolean;
  readonly lowSpecDetected: boolean;
  readonly lowSpecDismissed: boolean;
  readonly qualityMode: StudioVirtualThreeQualityMode;
  readonly onReopenLowQuality: () => void;
  readonly onReturnTo2d: () => void;
  readonly onDismissLowSpec: () => void;
}

export function StudioVirtualSpaceThreeRendererRecoveryCard({
  contextLost,
  lowSpecDetected,
  lowSpecDismissed,
  qualityMode,
  onReopenLowQuality,
  onReturnTo2d,
  onDismissLowSpec,
}: StudioVirtualSpaceThreeRendererRecoveryCardProps) {
  const bt = useBilingual("StudioVirtualSpaceThreeRendererRecoveryCard");

  if (contextLost) {
    return (
      <div
        className="studio-vspace-engine-message"
        role="alert"
        data-testid="vspace-renderer-recovery-card"
        data-space-interactive="true"
        style={{ zIndex: 32 }}
      >
        <div className="studio-vspace-engine-card">
          <p className="font-bold">
            {bt(
              "3D 그래픽 자원이 일시 중단되었습니다.",
              "3D graphics resources were interrupted.",
            )}
          </p>
          <p className="mt-1.5 text-xs opacity-85">
            {bt(
              "배치한 가구·조명·현재 위치는 그대로 보존되어 있습니다. 품질을 낮춰 3D를 다시 열거나 2D 공간으로 즉시 복귀할 수 있습니다.",
              "Your placed furniture, lighting, and current position are preserved. Reopen 3D in low quality or return immediately to 2D.",
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onReopenLowQuality}
              data-testid="vspace-reopen-low-quality"
              className="min-h-11 rounded-xl bg-accent px-3.5 py-1.5 text-xs font-bold text-on-accent hover:bg-accent/90"
            >
              {bt("품질 낮춰 다시 열기", "Reopen in low quality")}
            </button>
            <button
              type="button"
              onClick={onReturnTo2d}
              data-testid="vspace-return-2d"
              className="min-h-11 rounded-xl border border-current/25 bg-card/80 px-3.5 py-1.5 text-xs font-semibold hover:bg-raised/60"
            >
              {bt("2D로 복귀", "Return to 2D")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (lowSpecDetected && !lowSpecDismissed && qualityMode === "standard") {
    return (
      <div
        role="status"
        data-testid="vspace-low-spec-banner"
        data-space-interactive="true"
        className="studio-vspace-three-quality-notice pointer-events-auto absolute inset-x-3 bottom-20 z-20 mx-auto flex max-w-xl flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel/92 px-3 py-2 text-xs text-fg shadow-lg backdrop-blur sm:bottom-16"
      >
        <span className="font-medium">
          {bt(
            "모바일·저사양 환경 감지 · 가구 배치 유지 상태로 가볍게 전환할 수 있어요.",
            "Low-spec mobile detected · Switch safely while keeping your layout.",
          )}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onReopenLowQuality}
            data-testid="vspace-low-spec-reopen-low-quality"
            className="min-h-9 rounded-lg bg-accent px-2.5 py-1 text-[0.7rem] font-bold text-on-accent hover:bg-accent/90"
          >
            {bt("품질 낮춰 다시 열기", "Low quality")}
          </button>
          <button
            type="button"
            onClick={onReturnTo2d}
            data-testid="vspace-low-spec-return-2d"
            className="min-h-9 rounded-lg border border-line bg-card px-2.5 py-1 text-[0.7rem] font-semibold text-fg hover:bg-raised"
          >
            {bt("2D로 복귀", "Return to 2D")}
          </button>
          <button
            type="button"
            onClick={onDismissLowSpec}
            aria-label={bt("저사양 안내 닫기", "Dismiss low-spec notice")}
            className="min-h-9 rounded-lg px-2 py-1 text-[0.7rem] text-fg-2 hover:bg-raised"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return null;
}
