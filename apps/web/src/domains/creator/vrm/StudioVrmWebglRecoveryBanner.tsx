import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioVrmPoserHost } from "./StudioVrmPoserHost";

export function StudioVrmWebglRecoveryBanner({ h }: { readonly h: StudioVrmPoserHost }) {
  const bt = useBilingual("StudioVrmWebglRecoveryBanner");
  if (!h.vrmContextLost || h.broadcastPreviewActive) return null;

  return (
    <section
      role="alert"
      data-testid="vrm-webgl-recovery-banner"
      data-low-quality-active={h.vrmLowQualityMode ? "true" : "false"}
      aria-label={bt("3D 캐릭터 렌더러 복구", "3D character renderer recovery")}
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-warn/40 bg-warn/10 px-4 py-2.5 text-xs text-fg sm:px-5"
    >
      <p className="font-medium leading-relaxed">
        {bt(
          "3D 그래픽 컨텍스트가 중단되었습니다. 불러온 캐릭터·포즈·표정·체형 설정은 그대로 보존되어 있습니다.",
          "The 3D graphics context was lost. Your loaded character, pose, expression, and body settings are preserved.",
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="vrm-reopen-low-quality"
          onClick={() => h.handleVrmReopenLowQuality?.()}
          className="min-h-11 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {bt("품질 낮춰 다시 열기", "Reopen in low quality")}
        </button>
        <button
          type="button"
          data-testid="vrm-return-2d"
          onClick={() => h.handleVrmReturnTo2d?.()}
          className="min-h-11 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-fg hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {bt("2D 원고로 복귀", "Return to 2D manuscript")}
        </button>
      </div>
    </section>
  );
}
