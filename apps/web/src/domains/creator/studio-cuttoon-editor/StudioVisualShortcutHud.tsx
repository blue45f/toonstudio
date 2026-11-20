import { Compass, FlipHorizontal2, Keyboard } from "lucide-react";
import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface StudioShortcutHudCue {
  readonly id: number | string;
  readonly keycap: string;
  readonly label: string;
  readonly value?: string;
}

export interface StudioVisualShortcutHudProps {
  readonly cue: StudioShortcutHudCue | null;
  readonly durationMs?: number;
  readonly zoomPercent?: number;
  readonly onResetZoom?: () => void;
  readonly flipHorizontal?: boolean;
  readonly onToggleFlipHorizontal?: () => void;
  readonly onOpenQuickWheel?: () => void;
  readonly onToggleShortcutHints?: () => void;
  readonly className?: string;
}

/**
 * 1.4초 자동 소멸 경량 단축키 피드백 HUD와 좌하단 줌 캡슐 · 우하단 유틸리티 클러스터.
 * 포인터 이벤트를 가로채지 않고 캔버스 시야율을 보존한다.
 */
export function StudioVisualShortcutHud({
  cue,
  durationMs = 1400,
  zoomPercent,
  onResetZoom,
  flipHorizontal = false,
  onToggleFlipHorizontal,
  onOpenQuickWheel,
  onToggleShortcutHints,
  className,
}: StudioVisualShortcutHudProps) {
  const bt = useBilingual("StudioVisualShortcutHud");
  const [visibleCue, setVisibleCue] = useState<StudioShortcutHudCue | null>(cue);

  useEffect(() => {
    if (!cue) {
      setVisibleCue(null);
      return;
    }
    setVisibleCue(cue);
    const timer = globalThis.setTimeout(() => {
      setVisibleCue((current) => (current?.id === cue.id ? null : current));
    }, durationMs);
    return () => globalThis.clearTimeout(timer);
  }, [cue, durationMs]);

  const showZoomCapsule = typeof zoomPercent === "number" && (Boolean(onResetZoom) || Boolean(onToggleFlipHorizontal));
  const showUtilityCluster = Boolean(onOpenQuickWheel) || Boolean(onToggleShortcutHints);

  return (
    <div
      data-studio-visual-shortcut-hud-layer="true"
      className={cn("pointer-events-none fixed inset-x-0 bottom-3 z-[32] flex items-end justify-between px-4", className)}
    >
      <div className="flex items-center gap-2">
        {showZoomCapsule ? (
          <div
            role="group"
            aria-label={bt("캔버스 보기 제어", "Canvas view controls")}
            data-studio-viewport-zoom-capsule="true"
            className="pointer-events-auto inline-flex items-center gap-1 rounded-[var(--atelier-radius-outer,14px)] border border-line-strong bg-panel/95 p-0.5 text-xs font-semibold text-fg shadow-[var(--atelier-elevation-dock)]"
          >
            {onResetZoom ? (
              <button
                type="button"
                onClick={onResetZoom}
                aria-label={bt(`현재 배율 ${zoomPercent}%, 100%로 맞추기`, `Current zoom ${zoomPercent}%, reset to 100%`)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--atelier-radius-inner,10px)] px-2.5 text-xs font-semibold text-fg tabular-nums transition-colors duration-150 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
              >
                {zoomPercent}%
              </button>
            ) : null}
            {onToggleFlipHorizontal ? (
              <button
                type="button"
                aria-pressed={flipHorizontal}
                aria-label={bt("캔버스 좌우 반전", "Flip canvas horizontally")}
                onClick={onToggleFlipHorizontal}
                className={cn(
                  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--atelier-radius-inner,10px)] text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none",
                  flipHorizontal && "bg-accent-soft text-accent",
                )}
              >
                <FlipHorizontal2 size={15} strokeWidth={1.7} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex justify-center">
        {visibleCue ? (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-studio-shortcut-hud="true"
            className="pointer-events-none inline-flex items-center gap-2 rounded-[var(--atelier-radius-outer,14px)] border border-line-strong bg-panel/95 px-3 py-2 text-xs font-medium text-fg shadow-[var(--atelier-elevation-floating)] transition-opacity duration-150 motion-reduce:transition-none"
          >
            <kbd className="inline-flex min-w-6 items-center justify-center rounded border border-line-strong bg-card px-1.5 py-0.5 font-mono text-xs font-semibold text-accent tabular-nums">
              {visibleCue.keycap}
            </kbd>
            <span className="font-semibold text-fg">{visibleCue.label}</span>
            {visibleCue.value ? (
              <span className="text-fg-2 tabular-nums">{visibleCue.value}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {showUtilityCluster ? (
          <div
            role="group"
            aria-label={bt("빠른 보조 도구", "Quick utility controls")}
            data-studio-viewport-utility-cluster="true"
            className="pointer-events-auto inline-flex items-center gap-1 rounded-[var(--atelier-radius-outer,14px)] border border-line-strong bg-panel/95 p-0.5 text-xs font-medium text-fg shadow-[var(--atelier-elevation-dock)]"
          >
            {onOpenQuickWheel ? (
              <button
                type="button"
                aria-label={bt("방사형 퀵 휠 열기 (Q)", "Open radial quick wheel (Q)")}
                aria-keyshortcuts="Q"
                onClick={onOpenQuickWheel}
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-[var(--atelier-radius-inner,10px)] px-2 text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
              >
                <Compass size={15} strokeWidth={1.7} aria-hidden="true" />
                <kbd className="font-mono text-xs font-semibold text-fg-3">Q</kbd>
              </button>
            ) : null}
            {onToggleShortcutHints ? (
              <button
                type="button"
                aria-label={bt("단축키 안내 보기", "Show keyboard shortcuts")}
                onClick={onToggleShortcutHints}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--atelier-radius-inner,10px)] text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
              >
                <Keyboard size={15} strokeWidth={1.7} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
