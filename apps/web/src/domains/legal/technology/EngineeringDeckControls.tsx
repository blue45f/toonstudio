import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Undo2 } from "lucide-react";
import type { ReactNode } from "react";

import { DeckCardSelect } from "./EngineeringDeckPresenter";
import type { DeckTrackModel } from "./engineering-deck-model";
import { CONTROL_BUTTON, deckPageBi as bi, type DeckReturnPoint } from "./engineering-deck-ui";

import { cx } from "@/shared/lib/cx";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

/* ── 조작 막대 ─────────────────────────────────────────────── */

export function SlideNavigator({
  model,
  index,
  onGo,
  onGoCard,
  compact = false,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly onGo: (index: number) => void;
  /** 이전(-1)·다음(1) 도감 카드로 이동한다. 카드가 없는 트랙에서는 쓰지 않는다. */
  readonly onGoCard?: (direction: 1 | -1) => void;
  readonly compact?: boolean;
}) {
  useBilingualI18nRevision();
  const last = model.slides.length - 1;
  const byCard = Boolean(model.cards);
  return (
    <div className={cx("flex min-w-0 items-center gap-2", compact ? "flex-none" : "flex-1")}>
      {byCard && onGoCard && !compact ? (
        <button
          type="button"
          className={CONTROL_BUTTON}
          onClick={() => onGoCard(-1)}
          aria-label={bi("이전 카드", "Previous card")}
          title={`${bi("이전 카드", "Previous card")} ([)`}
        >
          <ChevronsLeft size={18} aria-hidden="true" />
        </button>
      ) : null}
      <button type="button" className={CONTROL_BUTTON} disabled={index <= 0} onClick={() => onGo(index - 1)}>
        <ChevronLeft size={18} aria-hidden="true" />
        <span className={compact ? "sr-only" : "max-sm:sr-only"}>{bi("이전", "Previous")}</span>
      </button>
      {byCard ? (
        <label className={cx("min-w-0", compact ? "w-44" : "flex-1")}>
          <span className="sr-only">{bi("도감 카드 선택", "Select atlas card")}</span>
          <DeckCardSelect model={model} index={index} onGo={onGo} />
        </label>
      ) : (
        <label className={cx("min-w-0", compact ? "w-28" : "flex-1")}>
          <span className="sr-only">{bi("발표 슬라이드 선택", "Select presentation slide")}</span>
          <select
            aria-label={bi("발표 슬라이드 선택", "Select presentation slide")}
            value={index}
            onChange={(event) => onGo(Number(event.currentTarget.value))}
            className="min-h-11 w-full min-w-0 truncate rounded-xl border border-line bg-card px-3 text-sm font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {model.slides.map((slide, slideIndex) => (
              <option key={slide.id} value={slideIndex}>
                {compact ? `${slideIndex + 1} / ${model.slides.length}` : `${slideIndex + 1}. ${slide.title}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="button" className={CONTROL_BUTTON} disabled={index >= last} onClick={() => onGo(index + 1)}>
        <span className={compact ? "sr-only" : "max-sm:sr-only"}>{bi("다음", "Next")}</span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      {byCard && onGoCard && !compact ? (
        <button
          type="button"
          className={CONTROL_BUTTON}
          onClick={() => onGoCard(1)}
          aria-label={bi("다음 카드", "Next card")}
          title={`${bi("다음 카드", "Next card")} (])`}
        >
          <ChevronsRight size={18} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function ToolbarButton({
  label,
  shortcut,
  pressed,
  onClick,
  children,
}: {
  readonly label: string;
  readonly shortcut?: string;
  readonly pressed?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button type="button" className={CONTROL_BUTTON} aria-pressed={pressed} onClick={onClick} title={shortcut ? `${label} (${shortcut})` : label}>
      {children}
      <span className="deck-hud-label">{label}</span>
      {shortcut ? <kbd className="deck-kbd max-md:hidden" aria-hidden="true">{shortcut}</kbd> : null}
    </button>
  );
}

export function ReturnButton({ returnPoint }: { readonly returnPoint: DeckReturnPoint | null }) {
  if (!returnPoint) return null;
  return (
    <button type="button" className={CONTROL_BUTTON} onClick={returnPoint.onReturn} title={returnPoint.label}>
      <Undo2 size={16} aria-hidden="true" />
      <span className="deck-hud-label">{returnPoint.label}</span>
    </button>
  );
}
