/**
 * SHAPER 스타일 다중 드로잉 서브레이어(Layer 0 ~ Layer 5) 선택·합성 순서·가시성·불투명도·개별 비우기 보조 컴포넌트.
 * 파일명을 소문자 하이픈(`paint-sublayer-controls.tsx`)으로 두어 `app/composition.ts`의 최상위 패널 규칙을 지킨다.
 */
import { useId, useRef } from "react";

import { DEFAULT_SUBLAYER_ORDER } from "../../../contracts";
import { mergeUndoTokens } from "../../../paint/paint-layer";
import { PAINT_SUBLAYER_INDICES, PAINT_SUBLAYER_SPECS } from "../../../paint/paint-sublayers";

import type { PaintUndoToken, PartRole } from "../../../contracts";
import type { SublayerPaintGuard } from "../../../paint/paint-session";
import type { PaintSublayerIndex, PaintSublayerMeta, PaintSublayerOrder, SublayerMoveDirection } from "../../../paint/paint-sublayers";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export interface PaintSublayerControlsProps {
  readonly activePart: PartRole;
  readonly activeSublayer: PaintSublayerIndex;
  readonly metas: readonly PaintSublayerMeta[] | undefined;
  readonly order: PaintSublayerOrder | undefined;
  readonly paintGuard: SublayerPaintGuard;
  readonly onSelectSublayer: (index: PaintSublayerIndex) => void;
  readonly onToggleVisible: (index: PaintSublayerIndex, nextVisible: boolean) => void;
  /** 슬라이더 변경을 세션·엔진에 즉시 반영하고 Undo 토큰을 반환한다. */
  readonly onChangeOpacity: (index: PaintSublayerIndex, opacity: number) => PaintUndoToken | null;
  /** 포인터 드래그 종료 또는 키보드 단일 변경 시 병합된 Undo 토큰을 히스토리에 커밋한다. */
  readonly onCommitUndoToken: (token: PaintUndoToken) => void;
  readonly onMoveSublayer: (index: PaintSublayerIndex, direction: SublayerMoveDirection) => void;
  readonly onClearSublayer: (index: PaintSublayerIndex) => void;
}

export function PaintSublayerControls({
  activeSublayer,
  metas,
  order,
  paintGuard,
  onSelectSublayer,
  onToggleVisible,
  onChangeOpacity,
  onCommitUndoToken,
  onMoveSublayer,
  onClearSublayer,
}: PaintSublayerControlsProps) {
  const ids = useId();
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pointerDraggingRef = useRef(false);
  const dragTokensRef = useRef<PaintUndoToken[]>([]);

  const effectiveOrder = order ?? DEFAULT_SUBLAYER_ORDER;
  const activeSpec = PAINT_SUBLAYER_SPECS[activeSublayer] ?? PAINT_SUBLAYER_SPECS[0];
  const activeMeta = metas?.[activeSublayer];
  const visible = activeMeta?.visible ?? true;
  const opacity = activeMeta?.opacity ?? 1;
  const hasPixels = activeMeta?.hasPixels ?? false;
  const orderPosition = activeMeta?.orderPosition ?? effectiveOrder.indexOf(activeSublayer);

  const flushOpacityDrag = (): void => {
    if (!pointerDraggingRef.current) return;
    pointerDraggingRef.current = false;
    const collected = dragTokensRef.current.splice(0);
    const merged = mergeUndoTokens(collected);
    if (merged) onCommitUndoToken(merged);
  };

  const onChipKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, currentIndex: PaintSublayerIndex): void => {
    let targetIndex: PaintSublayerIndex | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      targetIndex = PAINT_SUBLAYER_INDICES[(currentIndex + 1) % PAINT_SUBLAYER_INDICES.length] ?? 0;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      targetIndex = PAINT_SUBLAYER_INDICES[(currentIndex + PAINT_SUBLAYER_INDICES.length - 1) % PAINT_SUBLAYER_INDICES.length] ?? 0;
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = 5;
    }
    if (targetIndex === null) return;
    event.preventDefault();
    onSelectSublayer(targetIndex);
    chipRefs.current[targetIndex]?.focus();
  };

  const orderSummary = effectiveOrder.map((idx) => `L${idx}`).join(" → ");

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
              ref={(el) => {
                chipRefs.current[spec.index] = el;
              }}
              type="button"
              className="cl-preset-chip"
              data-testid={`paint-sublayer-${spec.index}`}
              aria-pressed={activeSublayer === spec.index}
              title={`${spec.labelKo} · 합성 위치 ${(meta?.orderPosition ?? spec.index) + 1}/6 (방향키 좌·우 이동)`}
              onClick={() => onSelectSublayer(spec.index)}
              onKeyDown={(event) => onChipKeyDown(event, spec.index)}
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
          data-testid="paint-sublayer-move-down"
          disabled={orderPosition <= 0}
          title="선택한 서브레이어를 합성 순서 아래(배경 쪽)로 한 단계 내립니다"
          onClick={() => onMoveSublayer(activeSublayer, "down")}
        >
          아래로(배경)
        </button>
        <button
          type="button"
          className="cl-preset-chip"
          data-testid="paint-sublayer-move-up"
          disabled={orderPosition >= 5}
          title="선택한 서브레이어를 합성 순서 위(앞쪽)로 한 단계 올립니다"
          onClick={() => onMoveSublayer(activeSublayer, "up")}
        >
          위로(앞쪽)
        </button>
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
          onPointerDown={() => {
            pointerDraggingRef.current = true;
            dragTokensRef.current = [];
          }}
          onPointerUp={flushOpacityDrag}
          onPointerCancel={flushOpacityDrag}
          onBlur={flushOpacityDrag}
          onChange={(event) => {
            const token = onChangeOpacity(activeSublayer, Number(event.target.value));
            if (!token) return;
            if (pointerDraggingRef.current) {
              dragTokensRef.current.push(token);
            } else {
              onCommitUndoToken(token);
            }
          }}
        />
        <output htmlFor={`${ids}-sub-opacity`}>{`${Math.round(opacity * 100)}%`}</output>
      </div>
      <p className="cl-paint-hint" data-testid="paint-sublayer-order-readout">
        {`합성 순서(아래→위): ${orderSummary} · 현재 ${activeSpec?.shortLabelKo ?? "L0"} 위치 ${orderPosition + 1}/6`}
      </p>
      {!paintGuard.ok ? (
        <p className="cl-paint-hint cl-paint-kit-warning" role="status" data-testid="paint-sublayer-blocked-hint">
          {paintGuard.reasonKo}
        </p>
      ) : null}
    </fieldset>
  );
}
