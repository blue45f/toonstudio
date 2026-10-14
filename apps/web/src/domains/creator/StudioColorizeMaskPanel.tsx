/**
 * Studio Colorize Mask Panel — 힌트 채색 마스크(Krita Colorize Mask식) 컨트롤.
 *
 * 선화 위에 힌트 획을 몇 개 그으면 영역별로 색이 전파되는 비파괴 채색 마스크의 패널이다.
 * StudioLayerMaskPanel과 동일한 관례: 이 패널 자신은 캔버스를 전혀 만지지 않는 순수
 * 컨트롤이고, 완전히 controlled다. 힌트 획 그리기(포인터 제스처)와 굽기 실행
 * (studio-colorize-mask.ts의 applyStudioColorizeMask → 새 채색 레이어)은 상위(StudioPage)가
 * 담당하고, 이 패널은 상태 표시와 파라미터 편집만 한다.
 *
 * 사용성 원칙(쉬운 기본 동선): 마스크가 없으면 "마스크 추가" 하나만 보인다. 추가 후에는
 * ① 힌트 색 고르기 → ② 캔버스에 획 긋기(무장 토글) → ③ "채색하기" 버튼이 전부이고,
 * 파라미터 3종(틈 메우기·선 감지·정리)은 그 아래에 항상 펼쳐 두되 기본값만으로 동작한다.
 * 힌트나 파라미터를 고치면 stale 배지가 떠서 "다시 채색"이 필요함을 알린다 — 결과를
 * 자동으로 덮지 않아 사용자가 놀라지 않는다.
 */
import { Brush, Eraser, Eye, EyeOff, Loader2, PaintBucket, Plus, Trash2 } from "lucide-react";
import { useId } from "react";

import { PANEL_CHIP_CLASS, StudioSliderRow, StudioToggleChip } from "./studio-panel-ui";

import {
  COLORIZE_MASK_PARAM_LIMITS,
  colorizeHintPalette,
  type ColorizeMaskParams,
  type StudioColorizeMaskState,
} from "./studio-colorize-mask";

import type { ChangeEvent, ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export type StudioColorizeMaskPanelProps = {
  /** el.colorizeMask 존재 여부 — false면 "추가" 액션만 보여준다. */
  hasMask: boolean;
  /** 마스크가 있을 때의 전체 상태(힌트+파라미터+구운 리비전). hasMask=false면 null. */
  state: StudioColorizeMaskState | null;
  /** el.colorizeMaskEnabled 유효값(true=적용 중, false=일시 비활성화 — 데이터는 보존). */
  enabled: boolean;
  /** 힌트 브러시가 무장(켜짐) 상태인지 — 켜면 캔버스 드래그가 힌트 획이 된다. */
  paintActive: boolean;
  /** 다음 힌트 획의 색. transparentMode면 투명 마커 획을 그린다. */
  activeColorHex: string;
  transparentMode: boolean;
  /** 구운 결과가 현재 힌트·파라미터와 어긋나는지(isColorizeMaskStale 결과). */
  stale: boolean;
  /** 마지막 굽기 요약 — 없으면 null. */
  lastBakeSummary: { readonly paintedRegionCount: number; readonly paintedPixelCount: number } | null;
  /** 굽기 진행 중 — 변경 액션을 잠근다. */
  busy?: boolean;
  onAddMask: () => void;
  onDeleteMask: () => void;
  onToggleEnabled: () => void;
  onTogglePaintActive: () => void;
  onActiveColorChange: (colorHex: string) => void;
  onTransparentModeChange: (transparent: boolean) => void;
  onParamsChange: (params: Partial<ColorizeMaskParams>) => void;
  onRemoveHintStroke: (strokeId: string) => void;
  onBake: () => void;
};

export function StudioColorizeMaskPanel({
  hasMask,
  state,
  enabled,
  paintActive,
  activeColorHex,
  transparentMode,
  stale,
  lastBakeSummary,
  busy = false,
  onAddMask,
  onDeleteMask,
  onToggleEnabled,
  onTogglePaintActive,
  onActiveColorChange,
  onTransparentModeChange,
  onParamsChange,
  onRemoveHintStroke,
  onBake,
}: StudioColorizeMaskPanelProps): ReactElement {
  const statusId = useId();
  const palette = state ? colorizeHintPalette(state.hints) : [];
  const hintCount = state?.hints.length ?? 0;
  const params = state?.params;

  const statusText = busy
    ? "채색하는 중이에요. 완료될 때까지 다른 마스크 변경은 잠시 기다려 주세요."
    : !hasMask
      ? "힌트 채색 마스크를 추가하면 선화 위에 색 힌트를 몇 획 그어 영역별로 한 번에 칠할 수 있어요. 선화 원본은 바뀌지 않습니다."
      : !enabled
        ? "마스크가 꺼져 있어요(힌트는 남아있음) — 다시 켜면 이전 상태 그대로 적용됩니다."
        : hintCount === 0
          ? "힌트 색을 고르고 '힌트 그리기'를 켠 뒤, 칠할 영역 안에 짧게 획을 그어 주세요."
          : stale
            ? "힌트나 설정이 바뀌었어요. '다시 채색'을 누르면 새 결과로 갱신됩니다(선화는 그대로예요)."
            : paintActive
              ? "캔버스를 드래그해 힌트 획을 그리세요. 손을 떼면 획이 힌트 목록에 쌓입니다."
              : "힌트를 더 긋거나 설정을 바꾼 뒤 '다시 채색'으로 결과를 갱신할 수 있어요.";

  return (
    <section
      aria-label="힌트 채색 마스크"
      aria-busy={busy}
      className="mt-2.5 space-y-2 rounded-xl border border-line bg-card/45 p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">
          <PaintBucket size={12} aria-hidden />
          힌트 채색 마스크
        </p>
        {busy && (
          <Loader2
            size={13}
            className="animate-spin text-accent motion-reduce:animate-none"
            aria-hidden
          />
        )}
      </div>

      {!hasMask ? (
        <button
          type="button"
          onClick={onAddMask}
          disabled={busy}
          aria-describedby={statusId}
          title="이 선화 레이어에 힌트 채색 마스크를 추가합니다. 선화 원본은 바뀌지 않아요."
          className={cn(PANEL_CHIP_CLASS, "flex w-full min-w-0 items-center justify-center gap-1")}
        >
          <Plus className="size-3" aria-hidden />
          마스크 추가
        </button>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <StudioToggleChip
              active={paintActive}
              disabled={busy || !enabled}
              onClick={onTogglePaintActive}
              title="켜고 캔버스를 드래그하면 힌트 획을 그립니다."
            >
              <Brush className="size-3" aria-hidden />
              힌트 그리기
            </StudioToggleChip>
            <StudioToggleChip
              active={transparentMode}
              disabled={busy || !enabled}
              onClick={() => onTransparentModeChange(!transparentMode)}
              title="투명 마커: 이 획이 닿은 영역은 색을 칠하지 않고 투명으로 남깁니다."
            >
              <Eraser className="size-3" aria-hidden />
              투명 힌트
            </StudioToggleChip>
            <StudioToggleChip
              active={enabled}
              disabled={busy}
              onClick={onToggleEnabled}
              title={enabled ? "마스크를 끕니다(힌트 데이터는 남아요)." : "마스크를 다시 켭니다."}
            >
              {enabled ? <Eye className="size-3" aria-hidden /> : <EyeOff className="size-3" aria-hidden />}
              {enabled ? "켜짐" : "꺼짐"}
            </StudioToggleChip>
          </div>

          <label className="flex items-center gap-2 text-[0.7rem] text-fg-2">
            힌트 색
            <input
              type="color"
              value={activeColorHex}
              disabled={busy || !enabled || transparentMode}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onActiveColorChange(event.target.value)
              }
              aria-label="힌트 색 고르기"
              className="h-6 w-10 cursor-pointer rounded border border-line bg-transparent disabled:cursor-not-allowed disabled:opacity-40"
            />
            <span className="font-mono text-[0.66rem] text-fg-3">
              {transparentMode ? "투명" : activeColorHex}
            </span>
          </label>

          {params ? (
            <div className="space-y-1.5">
              <StudioSliderRow
                label="틈 메우기"
                min={COLORIZE_MASK_PARAM_LIMITS.gapCloseHintPx.min}
                max={COLORIZE_MASK_PARAM_LIMITS.gapCloseHintPx.max}
                step={1}
                value={params.gapCloseHintPx}
                disabled={busy || !enabled}
                formatReadout={(v) => `${v}px`}
                onChange={(v) => onParamsChange({ gapCloseHintPx: v })}
              />
              <StudioSliderRow
                label="선 감지"
                min={COLORIZE_MASK_PARAM_LIMITS.edgeDetectionPx.min}
                max={COLORIZE_MASK_PARAM_LIMITS.edgeDetectionPx.max}
                step={1}
                value={params.edgeDetectionPx}
                disabled={busy || !enabled}
                formatReadout={(v) => (v === 0 ? "끔" : `${v}px`)}
                onChange={(v) => onParamsChange({ edgeDetectionPx: v })}
              />
              <StudioSliderRow
                label="정리 강도"
                min={COLORIZE_MASK_PARAM_LIMITS.cleanupPercent.min}
                max={COLORIZE_MASK_PARAM_LIMITS.cleanupPercent.max}
                step={5}
                value={params.cleanupPercent}
                disabled={busy || !enabled}
                formatReadout={(v) => `${v}%`}
                onChange={(v) => onParamsChange({ cleanupPercent: v })}
              />
              <StudioToggleChip
                active={params.limitToLayerBounds}
                disabled={busy || !enabled}
                onClick={() => onParamsChange({ limitToLayerBounds: !params.limitToLayerBounds })}
                title="선화와 힌트가 있는 범위로만 계산해 큰 페이지에서 빠르게 채색합니다."
              >
                레이어 범위만 계산
              </StudioToggleChip>
            </div>
          ) : null}

          {palette.length > 0 ? (
            <ul aria-label="힌트 팔레트" className="space-y-1">
              {palette.map((entry) => (
                <li
                  key={`${entry.colorHex}|${entry.transparent ? "t" : "c"}`}
                  className="flex items-center gap-2 text-[0.7rem] text-fg-2"
                >
                  <span
                    aria-hidden
                    className="inline-block size-3.5 rounded border border-line"
                    style={{
                      backgroundColor: entry.transparent ? "transparent" : entry.colorHex,
                    }}
                  />
                  <span className="font-mono text-[0.66rem]">
                    {entry.transparent ? "투명" : entry.colorHex}
                  </span>
                  <span className="text-fg-3">{entry.strokeCount}획</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onBake}
              disabled={busy || !enabled || hintCount === 0}
              aria-describedby={statusId}
              title="힌트를 영역별로 전파해 새 채색 레이어로 굽습니다. 선화는 바뀌지 않아요."
              className={cn(
                PANEL_CHIP_CLASS,
                "flex min-w-0 items-center justify-center gap-1",
                stale && "border-accent bg-accent-soft/50 text-fg",
              )}
            >
              <PaintBucket className="size-3" aria-hidden />
              {lastBakeSummary ? "다시 채색" : "채색하기"}
            </button>
            <button
              type="button"
              onClick={onDeleteMask}
              disabled={busy}
              aria-describedby={statusId}
              title="마스크와 힌트를 지웁니다. 선화와 기존 채색 레이어는 그대로 남습니다."
              className={cn(PANEL_CHIP_CLASS, "flex min-w-0 items-center justify-center gap-1")}
            >
              <Trash2 className="size-3" aria-hidden />
              마스크 삭제
            </button>
          </div>

          {lastBakeSummary ? (
            <p className="text-[0.68rem] text-fg-3">
              지난 채색: 영역 {lastBakeSummary.paintedRegionCount}곳 ·{" "}
              {lastBakeSummary.paintedPixelCount.toLocaleString()}px
              {stale ? " · 설정이 바뀌어 다시 채색이 필요해요" : ""}
            </p>
          ) : null}

          {state && hintCount > 0 ? (
            <details>
              <summary className="cursor-pointer text-[0.68rem] text-fg-3">힌트 획 {hintCount}개</summary>
              <ul className="mt-1 space-y-1">
                {state.hints.map((hint) => (
                  <li key={hint.id} className="flex items-center justify-between gap-2 text-[0.68rem] text-fg-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="inline-block size-3 rounded border border-line"
                        style={{ backgroundColor: hint.transparent ? "transparent" : hint.colorHex }}
                      />
                      <span className="font-mono">{hint.transparent ? "투명" : hint.colorHex}</span>
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRemoveHintStroke(hint.id)}
                      className="text-fg-3 underline-offset-2 hover:underline"
                    >
                      지우기
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}

      <p id={statusId} role="status" className="text-[0.68rem] leading-relaxed text-fg-3">
        {statusText}
      </p>
    </section>
  );
}
