import { AlertCircle, Check, Pin, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type MouseEventHandler } from "react";

import {
  applyStudioSavedBrushWithRecovery,
  resolveActiveQuickShelfSavedBrush,
} from "./brush/studio-competitor-favorite-slots";
import { selectQuickBrushes, type StudioSavedBrush } from "./brush/studio-brush-library";
import { StudioMaterialBrushThumbnail } from "./brush/StudioMaterialBrushThumbnail";

import { cx } from "@/shared/lib/cx";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface StudioSavedBrushShelfProps {
  brushes: readonly StudioSavedBrush[];
  activeBrushId?: string | null;
  activeCatalogBrushId?: string | null;
  activeBrushName?: string | null;
  onApply: (brush: StudioSavedBrush) => void;
  onManage?: MouseEventHandler<HTMLButtonElement>;
}

interface QuickShelfFailureState {
  readonly brush: StudioSavedBrush;
  readonly status: "provider-unavailable" | "invalid-brush" | "apply-failed";
  readonly message: string;
  readonly blockedNodeIds: readonly string[];
}

/** 모바일·컴팩트 브러시 시트에서 엄지나 방향키/숫자키로 고정·최근 브러시를 적용하는 최대 8개 선반. */
export function StudioSavedBrushShelf({
  brushes,
  activeBrushId = null,
  activeCatalogBrushId = null,
  activeBrushName = null,
  onApply,
  onManage,
}: StudioSavedBrushShelfProps) {
  const t = useBilingual("StudioSavedBrushShelf");
  const retryLabel = t("다시 시도", "Retry");
  const dismissLabel = t("닫기", "Dismiss");
  const sectionRef = useRef<HTMLElement>(null);
  const [focusedBrushId, setFocusedBrushId] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [failureState, setFailureState] = useState<QuickShelfFailureState | null>(null);
  const quickBrushes = selectQuickBrushes(brushes);
  if (quickBrushes.length === 0 && !onManage) return null;

  const activeShelfBrush = resolveActiveQuickShelfSavedBrush(
    quickBrushes,
    activeBrushId,
    activeCatalogBrushId,
  );
  const activePresetLabel =
    activeShelfBrush?.name ?? (activeBrushName?.trim() ? activeBrushName.trim() : null);

  const rovingBrushId = quickBrushes.some((item) => item.id === focusedBrushId)
    ? focusedBrushId
    : activeShelfBrush
      ? activeShelfBrush.id
      : quickBrushes[0]?.id ?? null;

  function restoreFocusToBrushChip(brushId: string): void {
    setFocusedBrushId(brushId);
    const buttons = sectionRef.current?.querySelectorAll<HTMLButtonElement>(
      "[data-studio-quick-shelf-brush-id]",
    );
    const targetButton = Array.from(buttons ?? []).find(
      (btn) => btn.getAttribute("data-studio-quick-shelf-brush-id") === brushId,
    );
    targetButton?.focus({ preventScroll: true });
    targetButton?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  function handleApplyBrush(target: StudioSavedBrush, restoreFocus = false): void {
    const result = applyStudioSavedBrushWithRecovery(target, onApply);
    if (result.status === "ok") {
      if (recoveryMessage !== null) setRecoveryMessage(null);
      if (failureState !== null) setFailureState(null);
      if (restoreFocus) restoreFocusToBrushChip(target.id);
      return;
    }
    if (result.status === "rebuilt-v6-receipt") {
      if (failureState !== null) setFailureState(null);
      setRecoveryMessage(`"${target.name}" 엔진 영수증을 자동 복구해 캔버스에 연결했어요.`);
      if (restoreFocus) restoreFocusToBrushChip(target.id);
      return;
    }
    if (result.status === "sanitized-snapshot") {
      if (failureState !== null) setFailureState(null);
      setRecoveryMessage(`"${target.name}" 설정 범위를 안전 값으로 보정해 연결했어요.`);
      if (restoreFocus) restoreFocusToBrushChip(target.id);
      return;
    }

    if (recoveryMessage !== null) setRecoveryMessage(null);
    setFailureState({
      brush: target,
      status: result.status,
      message:
        result.reason
        ?? `"${target.name}" — ${t("브러시를 적용하지 못했어요. 현재 브러시는 그대로 유지됩니다.", "Could not apply this brush. Keeping the current brush.")}`,
      blockedNodeIds: result.blockedNodeIds ?? [],
    });
    if (restoreFocus) restoreFocusToBrushChip(target.id);
  }

  function dismissFailureAndRestoreFocus(brushId: string): void {
    setFailureState(null);
    restoreFocusToBrushChip(brushId);
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

    if (event.key === "Escape" && failureState) {
      event.preventDefault();
      event.stopPropagation();
      dismissFailureAndRestoreFocus(failureState.brush.id);
      return;
    }

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
    <section ref={sectionRef} className="mb-2.5" aria-label="고정 및 최근 브러시">
      <div className="mb-1 flex min-h-11 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="flex shrink-0 items-center gap-1 text-[0.7rem] font-medium text-fg-3">
            <Pin size={11} aria-hidden /> 고정·최근
            <span className="tabular-nums text-fg-2">{quickBrushes.length}/8</span>
          </p>
          {activePresetLabel ? (
            <span
              data-testid="saved-brush-shelf-active-preset"
              aria-live="polite"
              className="truncate rounded-md bg-accent-soft/40 px-1.5 py-0.5 text-[0.62rem] font-semibold text-fg-2"
            >
              현재 적용: {activePresetLabel}
            </span>
          ) : null}
        </div>
        {onManage ? (
          <button
            type="button"
            data-studio-brush-manager-launcher="true"
            onClick={onManage}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
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
            const active = activeShelfBrush?.id === brush.id;
            const failedHere = failureState?.brush.id === brush.id;
            return (
              <button
                key={brush.id}
                type="button"
                tabIndex={brush.id === rovingBrushId ? 0 : -1}
                aria-keyshortcuts={String(index + 1)}
                data-studio-quick-shelf-slot={index + 1}
                data-studio-quick-shelf-brush-id={brush.id}
                data-studio-quick-shelf-active={active ? "true" : undefined}
                data-studio-quick-shelf-apply-state={failedHere ? failureState.status : undefined}
                onClick={() => handleApplyBrush(brush)}
                onFocus={() => setFocusedBrushId(brush.id)}
                onKeyDown={(event) => handleShelfKeyDown(event, index)}
                aria-pressed={active}
                aria-label={`${brush.name} 브러시 적용, ${brush.strokeWidth}px, ${Math.round(brush.brushOpacity * 100)}퍼센트`}
                className={cx(
                  "relative flex min-h-14 w-[5.4rem] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-xl border px-2 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                  active
                    ? "border-accent bg-accent-soft text-fg"
                    : failedHere
                      ? "border-danger/60 bg-danger/5 text-fg-2 hover:border-danger"
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
      {failureState ? (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="saved-brush-shelf-error-alert"
          data-error-status={failureState.status}
          data-blocked-nodes={
            failureState.blockedNodeIds.length > 0
              ? failureState.blockedNodeIds.join(",")
              : undefined
          }
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            dismissFailureAndRestoreFocus(failureState.brush.id);
          }}
          className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/45 bg-danger/10 px-2.5 py-2 text-[0.64rem] leading-relaxed text-fg"
        >
          <p className="flex min-w-0 flex-1 items-start gap-1.5">
            <AlertCircle size={13} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            <span>{failureState.message}</span>
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              data-testid="saved-brush-shelf-retry-button"
              onClick={() => handleApplyBrush(failureState.brush, true)}
              className="flex min-h-8 items-center gap-1 rounded-lg border border-line-strong bg-card px-2.5 py-1 text-[0.62rem] font-semibold text-fg hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <RotateCcw size={11} aria-hidden /> <span>{retryLabel}</span>
            </button>
            <button
              type="button"
              data-testid="saved-brush-shelf-dismiss-error"
              onClick={() => dismissFailureAndRestoreFocus(failureState.brush.id)}
              className="flex min-h-8 items-center rounded-lg px-2 py-1 text-[0.62rem] font-medium text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span>{dismissLabel}</span>
            </button>
          </div>
        </div>
      ) : null}
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
