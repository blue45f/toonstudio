/**
 * Studio Magic Wand Panel
 * 마술봉(자동 선택) 도구 컨트롤 — 켜면 메인 캔버스에서 이미지를 클릭할 때마다 studio-magic-wand
 * 의 색상 연결 스캔 결과가 기존 픽셀 선택(StudioSelectionToolsPanel 이 소유하는 pixelSel)에
 * 더해진다. 이 패널 자신은 클릭도 스캔도 하지 않는 순수 컨트롤(무장 토글 + 허용 오차 슬라이더)
 * 이다 — 실제 클릭 처리·비동기 스캔·선택 병합은 StudioPage 의 onStageDown/runMagicWandSelect 가
 * 담당한다(크롭·픽셀 선택 도구와 동일하게 "패널은 상태만 보여주고 캔버스 제스처는 상위가 처리").
 *
 * 결합 모드(합치기/빼기)·페더·반전·되돌리기·선택 해제·밝기/색조/삭제 적용은 모두 이미
 * StudioSelectionToolsPanel 이 제공한다(같은 pixelSel/pixelCombine 상태를 공유) — 마술봉이 만든
 * 선택도 결국 같은 PixelSelection 이므로 여기서 중복 컨트롤을 두지 않는다(의도적 설계).
 */
import { Loader2, Minimize2, Wand2 } from "lucide-react";
import { useState } from "react";

import { MAGIC_WAND_TOLERANCE_RANGE } from "./studio-magic-wand";
import { StudioSliderRow, StudioToggleChip } from "./studio-panel-ui";

import type { ReactElement } from "react";

export type StudioMagicWandPanelProps = {
  /** 마술봉이 무장(켜짐) 상태인지 — 켜지면 이미지 위 클릭이 자동 선택으로 처리된다. */
  active: boolean;
  /** 색 허용 오차(MAGIC_WAND_TOLERANCE_RANGE 범위, studio-flood-fill 의 tolerance 와 동일 단위). */
  tolerance: number;
  /** 스캔(비동기) 진행 중 — 진행 표시만 하고 컨트롤을 잠그지는 않는다(다른 픽셀 도구와 동일 관례). */
  busy?: boolean;
  onToggleActive: () => void;
  onToleranceChange: (value: number) => void;
  /** CSP 축소 선택(`Shrink selection`, var 151) 무장 상태(선택 연결). */
  shrinkSelectionActive?: boolean;
  onToggleShrinkSelection?: () => void;
  /** CSP 참조 레이어 선 틈 닫기 반경(px, 0..16, vars 22/23/459). */
  closeGapRadius?: number;
  onCloseGapRadiusChange?: (radiusPx: number) => void;
  /** 참조 레이어 전용 자동 선택 토글. */
  referenceLayerOnly?: boolean;
  onToggleReferenceLayerOnly?: () => void;
};

export function StudioMagicWandPanel({
  active,
  tolerance,
  busy = false,
  onToggleActive,
  onToleranceChange,
  shrinkSelectionActive,
  onToggleShrinkSelection,
  closeGapRadius,
  onCloseGapRadiusChange,
  referenceLayerOnly,
  onToggleReferenceLayerOnly,
}: StudioMagicWandPanelProps): ReactElement {
  const [fallbackShrinkActive, setFallbackShrinkActive] = useState(false);
  const [fallbackCloseGapRadius, setFallbackCloseGapRadius] = useState(2);
  const [fallbackReferenceOnly, setFallbackReferenceOnly] = useState(false);

  const effectiveShrinkActive = shrinkSelectionActive ?? fallbackShrinkActive;
  const effectiveCloseGapRadius = closeGapRadius ?? fallbackCloseGapRadius;
  const effectiveReferenceOnly = referenceLayerOnly ?? fallbackReferenceOnly;

  const handleToggleShrink = (): void => {
    if (shrinkSelectionActive === undefined) {
      setFallbackShrinkActive((prev) => !prev);
    }
    onToggleShrinkSelection?.();
  };

  const handleCloseGapChange = (next: number): void => {
    if (closeGapRadius === undefined) {
      setFallbackCloseGapRadius(next);
    }
    onCloseGapRadiusChange?.(next);
  };

  const handleToggleReferenceOnly = (): void => {
    if (referenceLayerOnly === undefined) {
      setFallbackReferenceOnly((prev) => !prev);
    }
    onToggleReferenceLayerOnly?.();
  };

  return (
    <div className="mt-2.5 space-y-2 rounded-xl border border-line bg-card/45 p-2.5 [word-break:keep-all]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-fg-3 tracking-wider">
          <Wand2 size={12} aria-hidden />
          마술봉 자동 선택
        </p>
        {busy && <Loader2 size={13} className="animate-spin text-accent" aria-hidden />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StudioToggleChip
          active={active}
          onClick={onToggleActive}
          title="켜고 이미지를 클릭하면 비슷한 색으로 이어진 영역이 자동으로 선택됩니다."
        >
          <span className="inline-flex items-center gap-1">
            <Wand2 className="size-3" aria-hidden />
            마술봉으로 선택
          </span>
        </StudioToggleChip>

        <StudioToggleChip
          active={effectiveShrinkActive}
          onClick={handleToggleShrink}
          title="피사체 바깥을 느슨하게 둘러싸면 배경을 따라 안쪽으로 수축해 외곽선에 밀착 선택합니다."
        >
          <span className="inline-flex items-center gap-1">
            <Minimize2 className="size-3" aria-hidden />
            축소 선택
          </span>
        </StudioToggleChip>
      </div>

      <StudioSliderRow
        label="허용 오차"
        min={MAGIC_WAND_TOLERANCE_RANGE.min}
        max={MAGIC_WAND_TOLERANCE_RANGE.max}
        step={MAGIC_WAND_TOLERANCE_RANGE.step}
        value={tolerance}
        onChange={onToleranceChange}
        readout={String(tolerance)}
      />

      <details className="rounded-lg border border-line/70 bg-card/60 px-2.5 py-1.5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-semibold text-fg-2 transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <span>참조 레이어 · 선 틈 닫기</span>
          <span className="tabular-nums text-[0.72rem] text-fg-3">{effectiveCloseGapRadius}px</span>
        </summary>
        <div className="space-y-2 pt-1.5 pb-1">
          <StudioToggleChip
            active={effectiveReferenceOnly}
            onClick={handleToggleReferenceOnly}
            title="참조로 지정한 선화 레이어의 닫힌 경계만 기준으로 선택 영역을 계산합니다."
          >
            참조 선화 레이어 기준
          </StudioToggleChip>
          <StudioSliderRow
            label="선 틈 닫기"
            min={0}
            max={16}
            step={1}
            value={effectiveCloseGapRadius}
            onChange={handleCloseGapChange}
            readout={`${effectiveCloseGapRadius}px`}
          />
        </div>
      </details>

      <p className="text-[0.72rem] leading-relaxed text-fg-3" role="status">
        {busy
          ? "선택 영역을 계산하는 중..."
          : effectiveShrinkActive
            ? "피사체 둘레를 느슨하게 감싸 그리면 선화 윤곽에서 멈추며 밀착 선택됩니다."
            : active
              ? "이미지 위 지점을 클릭하면 그 지점과 이어진 비슷한 색 영역이 선택됩니다. 허용 오차가 클수록 더 넓게 선택돼요. 결합(합치기/빼기)은 위 픽셀 선택 패널의 설정을 그대로 따릅니다."
              : "켜고 이미지 위를 클릭하면 클릭한 지점과 이어진 비슷한 색 영역이 자동으로 선택됩니다."}
      </p>
    </div>
  );
}
