import { Check, Pin, SlidersHorizontal } from "lucide-react";
import { useState, type KeyboardEvent, type MouseEventHandler } from "react";

import {
  applyStudioSavedBrushWithRecovery,
} from "./brush/studio-competitor-favorite-slots";
import { selectQuickBrushes, type StudioSavedBrush } from "./brush/studio-brush-library";
import { StudioMaterialBrushThumbnail } from "./brush/StudioMaterialBrushThumbnail";

import { cx } from "@/shared/lib/cx";

export interface StudioSavedBrushShelfProps {
  brushes: readonly StudioSavedBrush[];
  activeBrushId?: string | null;
  onApply: (brush: StudioSavedBrush) => void;
  onManage?: MouseEventHandler<HTMLButtonElement>;
}

/** 모바일·컴팩트 브러시 시트에서 엄지나 방향키/숫자키로 고정·최근 브러시를 적용하는 최대 8개 선반. */
export function StudioSavedBrushShelf({
  brushes,
  activeBrushId = null,
  onApply,
  onManage,
}: StudioSavedBrushShelfProps) {
  const [focusedBrushId, setFocusedBrushId] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const quickBrushes = selectQuickBrushes(brushes);
  if (quickBrushes.length === 0 && !onManage) return null;

  const rovingBrushId = quickBrushes.some((item) => item.id === focusedBrushId)
    ? focusedBrushId
    : quickBrushes.some((item) => item.id === activeBrushId)
      ? activeBrushId
      : quickBrushes[0]?.id ?? null;

  function handleApplyBrush(target: StudioSavedBrush): void {
    const result = applyStudioSavedBrushWithRecovery(target, onApply);
    if (result.status === "ok") {
      if (recoveryMessage !== null) setRecoveryMessage(null);
      return;
    }
    if (result.status === "rebuilt-v6-receipt") {
      setRecoveryMessage(`"${target.name}" 엔진 영수증을 자동 복구해 캔버스에 연결했어요.`);
      return;
    }
    if (result.status === "sanitized-snapshot") {
      setRecoveryMessage(`"${target.name}" 설정 범위를 안전 값으로 보정해 연결했어요.`);
      return;
    }
    if (result.status === "fallback-safe-pen") {
      setRecoveryMessage(`"${target.name}" 설정 오류로 기본 안전 펜으로 전환했어요.`);
      return;
    }
    setRecoveryMessage(`"${target.name}" 캔버스 전환에 실패했어요. 저장·관리에서 다시 선택해 주세요.`);
  }

  function focusShelfSlot(container: HTMLElement | null, index: number): void {
    const targetBrush = quickBrushes[index];
    if (!targetBrush) return;
    setFocusedBrushId(targetBrush.id);
    const buttons = container?.querySelectorAll<HTMLButtonElement>("[data-studio-quick-shelf-slot]");
    const nextButton = buttons?.[index];
    nextButton?.focus({ preventScroll: true });
    nextButton?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  function handleShelfKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ): void {
    const count = quickBrushes.length;
    if (count === 0) return;
    const toolbar = event.currentTarget.closest<HTMLElement>('[role="toolbar"]');

    if (
      !event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !event.shiftKey
      && /^[1-8]$/u.test(event.key)
    ) {
      const slotIndex = Number(event.key) - 1;
      const slotBrush = quickBrushes[slotIndex];
      if (!slotBrush) return;
      event.preventDefault();
      focusShelfSlot(toolbar, slotIndex);
      handleApplyBrush(slotBrush);
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % count;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + count) % count;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = count - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    focusShelfSlot(toolbar, nextIndex);
  }

  return (
    <section className="mb-2.5" aria-label="고정 및 최근 브러시">
      <div className="mb-1 flex min-h-11 items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[0.7rem] font-medium text-fg-3">
          <Pin size={11} aria-hidden /> 고정·최근
          <span className="tabular-nums text-fg-2">{quickBrushes.length}/8</span>
        </p>
        {onManage ? (
          <button
            type="button"
            data-studio-brush-manager-launcher="true"
            onClick={onManage}
            className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <SlidersHorizontal size={13} aria-hidden /> 저장·관리
          </button>
        ) : null}
      </div>
      {quickBrushes.length === 0 ? (
        <button
          type="button"
          data-studio-brush-manager-launcher="true"
          onClick={onManage}
          className="flex min-h-14 w-full items-center justify-center rounded-xl border border-dashed border-line px-3 text-center text-[0.68rem] leading-relaxed text-fg-3 hover:border-accent/60 hover:bg-accent-soft/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          브러시를 저장하거나 고정하면 이 선반에서 바로 꺼내 쓸 수 있어요.
        </button>
      ) : (
        <div
          role="toolbar"
          aria-label="고정 및 최근 빠른 브러시 목록"
          className="-mx-1 flex snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-1 pr-8 [mask-image:linear-gradient(to_right,#000_0%,#000_calc(100%-1.5rem),transparent_100%)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {quickBrushes.map((brush, index) => {
            const active = activeBrushId === brush.id;
            return (
              <button
                key={brush.id}
                type="button"
                tabIndex={brush.id === rovingBrushId ? 0 : -1}
                aria-keyshortcuts={String(index + 1)}
                data-studio-quick-shelf-slot={index + 1}
                onClick={() => handleApplyBrush(brush)}
                onFocus={() => setFocusedBrushId(brush.id)}
                onKeyDown={(event) => handleShelfKeyDown(event, index)}
                aria-pressed={active}
                aria-label={`${brush.name} 브러시 적용, ${brush.strokeWidth}px, ${Math.round(brush.brushOpacity * 100)}퍼센트`}
                className={cx(
                  "relative flex min-h-14 w-[5.4rem] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-xl border px-2 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                  active
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised"
                )}
              >
                {brush.pinned ? (
                  <Pin size={10} className="absolute right-1.5 top-1.5 fill-current text-accent" aria-hidden />
                ) : null}
                {active ? (
                  <span className="absolute left-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-accent text-on-accent" aria-hidden>
                    <Check size={10} strokeWidth={3} />
                  </span>
                ) : null}
                {brush.enginePrograms?.material ? (
                  <StudioMaterialBrushThumbnail brush={brush} className="h-4 w-10 rounded-md border border-line" />
                ) : <span className="grid h-4 w-10 place-items-center overflow-hidden rounded-md border border-line bg-[linear-gradient(90deg,#f8fafc_0_50%,#242936_50%_100%)]" aria-hidden>
                  <span
                    className="block w-9 rounded-full"
                    style={{
                      height: Math.min(12, Math.max(2, brush.strokeWidth / 3)),
                      backgroundColor: brush.color,
                      opacity: brush.brushOpacity,
                    }}
                  />
                </span>}
                <span className="w-full truncate text-[0.66rem] font-semibold">{brush.name}</span>
              </button>
            );
          })}
        </div>
      )}
      {recoveryMessage ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="saved-brush-shelf-recovery-status"
          className="mt-1 text-[0.62rem] leading-relaxed text-fg-3"
        >
          {recoveryMessage}
        </p>
      ) : null}
    </section>
  );
}
