/**
 * SHAPER 스타일 다중 드로잉 서브레이어(Layer 0 ~ Layer 5) 선택·가시성·불투명도·개별 비우기 보조 컴포넌트.
 * 파일명을 소문자 하이픈(`paint-sublayer-controls.tsx`)으로 두어 `app/composition.ts`의 최상위 패널 규칙을 지킨다.
 */
import { useId } from "react";

import { PAINT_SUBLAYER_SPECS } from "../../../paint/paint-sublayers";

import type { PartRole } from "../../../contracts";
import type { PaintSublayerIndex, PaintSublayerMeta } from "../../../paint/paint-sublayers";

export interface PaintSublayerControlsProps {
  readonly activePart: PartRole;
  readonly activeSublayer: PaintSublayerIndex;
  readonly metas: readonly PaintSublayerMeta[] | undefined;
  readonly onSelectSublayer: (index: PaintSublayerIndex) => void;
  readonly onToggleVisible: (index: PaintSublayerIndex, nextVisible: boolean) => void;
  readonly onChangeOpacity: (index: PaintSublayerIndex, opacity: number) => void;
  readonly onClearSublayer: (index: PaintSublayerIndex) => void;
}

export function PaintSublayerControls({
  activeSublayer,
  metas,
  onSelectSublayer,
  onToggleVisible,
  onChangeOpacity,
  onClearSublayer,
}: PaintSublayerControlsProps) {
  const ids = useId();
  const activeSpec = PAINT_SUBLAYER_SPECS[activeSublayer] ?? PAINT_SUBLAYER_SPECS[0];
  const activeMeta = metas?.[activeSublayer];
  const visible = activeMeta?.visible ?? true;
  const opacity = activeMeta?.opacity ?? 1;
  const hasPixels = activeMeta?.hasPixels ?? false;

  return (
    <fieldset className="cl-paint-sublayers" data-testid="paint-sublayer-section">
      <legend>드로잉 서브레이어 (SHAPER Layer 0~5)</legend>
      <div className="cl-paint-row" role="group" aria-label="서브레이어 슬롯 선택" data-testid="paint-sublayer-chips">
        {PAINT_SUBLAYER_SPECS.map((spec) => {
          const meta = metas?.[spec.index];
          const filledBadge = meta?.hasPixels ? " ●" : "";
          const hiddenBadge = meta && !meta.visible ? " (숨김)" : "";
          return (
            <button
              key={spec.index}
              type="button"
              className="cl-preset-chip"
              data-testid={`paint-sublayer-${spec.index}`}
              aria-pressed={activeSublayer === spec.index}
              title={spec.labelKo}
              onClick={() => onSelectSublayer(spec.index)}
            >
              {`${spec.shortLabelKo}${filledBadge}${hiddenBadge}`}
            </button>
          );
        })}
      </div>
      <div className="cl-paint-row">
        <label htmlFor={`${ids}-sub-visible`}>{`${activeSpec?.shortLabelKo ?? "L0"} 표시`}</label>
        <input
          id={`${ids}-sub-visible`}
          data-testid="paint-sublayer-visible"
          type="checkbox"
          checked={visible}
          onChange={(event) => onToggleVisible(activeSublayer, event.target.checked)}
        />
        <button
          type="button"
          className="cl-preset-chip"
          data-testid="paint-clear-sublayer"
          disabled={!hasPixels}
          onClick={() => onClearSublayer(activeSublayer)}
        >
          선택 서브레이어 비우기
        </button>
      </div>
      <div className="cl-paint-row">
        <label htmlFor={`${ids}-sub-opacity`}>{`${activeSpec?.shortLabelKo ?? "L0"} 불투명도`}</label>
        <input
          id={`${ids}-sub-opacity`}
          data-testid="paint-sublayer-opacity"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(event) => onChangeOpacity(activeSublayer, Number(event.target.value))}
        />
        <output htmlFor={`${ids}-sub-opacity`}>{`${Math.round(opacity * 100)}%`}</output>
      </div>
    </fieldset>
  );
}
