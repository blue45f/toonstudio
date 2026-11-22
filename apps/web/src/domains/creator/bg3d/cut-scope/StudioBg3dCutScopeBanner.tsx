/**
 * Calm Atelier 3D 배경 편집 적용 범위 시각화 배지 + 다중 컷 1줄 인라인 확인 바.
 *
 * - 상시 범위 표시 배지는 정확히 1개만 둔다(`[현재 컷 #N 카메라만]` vs `[공유 배경 · N컷 연동]`).
 * - 1컷 단독 편집이나 카메라·벽 컷어웨이·컷별 조명처럼 현재 컷에만 영향을 주는 작업에서는
 *   확인 바를 펼치지 않아 작업 흐름을 끊지 않는다.
 * - 2컷 이상 연동된 공유 배경에 영향을 주는 변경 시에만 1줄 인라인 확인 바를 펼쳐
 *   `이 컷만 분리 적용` 또는 `연동 N컷 전체 반영`을 선택하게 한다.
 */

import { Camera, Layers } from "lucide-react";

import type {
  Bg3dCutScopeDecision,
  Bg3dMultiCutResolutionMode,
} from "./bg3d-cut-scope-policy";
import type { Bg3dTextureBatchDownsamplePlan } from "./bg3d-texture-device-downsampler";

export interface StudioBg3dCutScopeBannerProps {
  readonly decision: Bg3dCutScopeDecision;
  readonly disabled?: boolean;
  readonly onResolve?: (resolution: Bg3dMultiCutResolutionMode) => void;
  readonly onCancel?: () => void;
  /** 선택적 외부 텍스처 다운샘플링 요약(표시 시 배지가 아닌 보조 텍스트 1줄로만 표시). */
  readonly textureBatchPlan?: Bg3dTextureBatchDownsamplePlan | null;
}

function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 100) return `${Math.round(mb)}MB`;
  if (mb >= 10) return `${mb.toFixed(1)}MB`;
  return `${mb.toFixed(2)}MB`;
}

export function StudioBg3dCutScopeBanner({
  decision,
  disabled = false,
  onResolve,
  onCancel,
  textureBatchPlan = null,
}: StudioBg3dCutScopeBannerProps) {
  const isSharedLinked = decision.badgeMode === "shared-linked";

  return (
    <section
      aria-label="3D 배경 편집 적용 범위"
      data-testid="bg3d-cut-scope-banner"
      className="flex flex-col gap-2 text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          data-testid="bg3d-cut-scope-badge"
          data-scope-mode={decision.badgeMode}
          title={decision.actionSpec.summaryKo}
          className={
            isSharedLinked
              ? "inline-flex items-center gap-1.5 rounded-md border border-warn/50 bg-warn/10 px-2.5 py-1 text-[0.6875rem] font-semibold tabular-nums text-fg [word-break:keep-all] transition-colors motion-reduce:transition-none"
              : "inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1 text-[0.6875rem] font-semibold tabular-nums text-fg-2 [word-break:keep-all] transition-colors motion-reduce:transition-none"
          }
        >
          {isSharedLinked ? (
            <Layers className="size-3.5 shrink-0 text-warn" aria-hidden="true" />
          ) : (
            <Camera className="size-3.5 shrink-0 text-fg-2" aria-hidden="true" />
          )}
          <span>{decision.badgeLabelKo}</span>
        </span>

        {textureBatchPlan && textureBatchPlan.downsampledCount > 0 ? (
          <p
            data-testid="bg3d-cut-scope-texture-summary"
            className="text-[0.625rem] tabular-nums text-fg-3 [word-break:keep-all]"
          >
            {textureBatchPlan.profile.labelKo} {textureBatchPlan.profile.maxTextureEdgePx}px · VRAM{" "}
            {textureBatchPlan.overallVramSavingsPercent.toFixed(0)}% 절감 (
            {formatMegabytes(textureBatchPlan.totalSavedVramBytes)})
          </p>
        ) : null}
      </div>

      {decision.requiresConfirmation && decision.confirmationMessageKo ? (
        <div
          role="group"
          aria-label="다중 컷 공유 배경 변경 확인"
          data-testid="bg3d-cut-scope-confirm-bar"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/45 bg-card px-2.5 py-2 transition-colors motion-reduce:transition-none"
        >
          <p className="min-w-0 flex-1 text-[0.6875rem] leading-snug tabular-nums text-fg [word-break:keep-all]">
            {decision.confirmationMessageKo}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={disabled || !onResolve}
              onClick={() => onResolve?.("detach-cut-only")}
              data-testid="bg3d-cut-scope-detach-btn"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-line bg-raised px-3 py-2 text-[0.6875rem] font-semibold tabular-nums text-fg [word-break:keep-all] transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-45 motion-reduce:transition-none"
            >
              이 컷만 분리 적용
            </button>

            <button
              type="button"
              disabled={disabled || !onResolve}
              onClick={() => onResolve?.("apply-all-linked")}
              data-testid="bg3d-cut-scope-apply-all-btn"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-3 py-2 text-[0.6875rem] font-semibold tabular-nums text-on-accent [word-break:keep-all] transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-45 motion-reduce:transition-none"
            >
              연동 {decision.linkedCutCount}컷 전체 반영
            </button>

            {onCancel ? (
              <button
                type="button"
                disabled={disabled}
                onClick={onCancel}
                data-testid="bg3d-cut-scope-cancel-btn"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-line bg-panel px-2.5 py-2 text-[0.6875rem] font-medium text-fg-2 [word-break:keep-all] transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-45 motion-reduce:transition-none"
              >
                취소
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
