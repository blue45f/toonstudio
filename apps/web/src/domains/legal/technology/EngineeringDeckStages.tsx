import { EyeOff, Keyboard, LayoutGrid, Maximize2, Minimize2, PanelRight, X } from "lucide-react";
import { useId, useRef } from "react";
import { createPortal } from "react-dom";

import { ReturnButton, SlideNavigator, ToolbarButton } from "./EngineeringDeckControls";
import { DeckClock, DeckOverview, DeckPresenterPanel, DeckShortcutList } from "./EngineeringDeckPresenter";
import { EngineeringDeckSlide } from "./EngineeringDeckSlide";
import type { DeckTrackModel } from "./engineering-deck-model";
import { CONTROL_BUTTON, deckPageBi as bi, type DeckReturnPoint } from "./engineering-deck-ui";
import { useSwipeNavigation, type DeckTimer } from "./use-engineering-deck";
import { useDeckModalLayer } from "./use-engineering-deck-modal";

import { formatI18nTemplate, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

/* ── 발표자 창(두 번째 화면) ───────────────────────────────── */

export function PresenterWindow({
  model,
  index,
  timer,
  onGo,
  onGoCard,
  onOpenAtlas,
  returnPoint,
  syncAvailable,
  jumpBuffer,
  overviewOpen,
  onToggleOverview,
  helpOpen,
  onToggleHelp,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly timer: DeckTimer;
  readonly onGo: (index: number) => void;
  readonly onGoCard: (direction: 1 | -1) => void;
  readonly onOpenAtlas: (atlasId: string) => void;
  readonly returnPoint: DeckReturnPoint | null;
  readonly syncAvailable: boolean;
  readonly jumpBuffer: string;
  readonly overviewOpen: boolean;
  readonly onToggleOverview: () => void;
  readonly helpOpen: boolean;
  readonly onToggleHelp: () => void;
}) {
  useBilingualI18nRevision();
  const containerRef = useRef<HTMLDivElement>(null);
  const panelHeadingId = useId();
  useDeckModalLayer(true, containerRef);
  const slide = model.slides[index];
  if (!slide) return null;

  return createPortal(
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={bi("발표자 화면", "Presenter view")}
      className="deck-present"
      data-notes="true"
    >
      <div className="deck-present__stage">
        <EngineeringDeckSlide slide={slide} index={index} total={model.slides.length} sections={model.sections} fixed />
        {overviewOpen ? (
          <div className="deck-present__overlay" role="region" aria-label={bi("슬라이드 개요", "Slide overview")}>
            <DeckOverview model={model} index={index} onSelect={(slideIndex) => { onGo(slideIndex); onToggleOverview(); }} />
          </div>
        ) : null}
        {helpOpen ? (
          <div className="deck-present__overlay" role="region" aria-label={bi("단축키 도움말", "Shortcut help")}>
            <DeckShortcutList className="mx-auto max-w-3xl" />
          </div>
        ) : null}
      </div>
      <aside className="deck-present__notes p-4" aria-labelledby={panelHeadingId}>
        <DeckPresenterPanel model={model} index={index} timer={timer} onJump={onGo} onOpenAtlas={onOpenAtlas} returnPoint={returnPoint} headingId={panelHeadingId} />
      </aside>
      <div className="deck-present__hud">
        <SlideNavigator model={model} index={index} onGo={onGo} onGoCard={onGoCard} compact />
        <ReturnButton returnPoint={returnPoint} />
        <ToolbarButton label={bi("개요", "Overview")} shortcut="O" pressed={overviewOpen} onClick={onToggleOverview}><LayoutGrid size={16} aria-hidden="true" /></ToolbarButton>
        <ToolbarButton label={bi("도움말", "Help")} shortcut="?" pressed={helpOpen} onClick={onToggleHelp}><Keyboard size={16} aria-hidden="true" /></ToolbarButton>
        <span className="text-xs font-bold text-fg-3" role="status">
          {syncAvailable ? bi("청중 화면과 같은 슬라이드·타이머로 맞춰집니다", "Slide and timer synced with the audience screen") : bi("이 브라우저는 창 간 동기화를 지원하지 않습니다", "This browser cannot sync windows")}
          {jumpBuffer ? ` · ${formatI18nTemplate(String(bi("{value0}번으로 이동: Enter", "Go to {value0}: Enter")), { value0: jumpBuffer })}` : ""}
        </span>
      </div>
    </div>,
    document.body,
  );
}

/* ── 청중 발표 화면 ────────────────────────────────────────── */

export function PresentationLayer({
  model,
  index,
  timer,
  onGo,
  onGoCard,
  onOpenAtlas,
  returnPoint,
  notesOpen,
  onToggleNotes,
  overviewOpen,
  onToggleOverview,
  blackout,
  onToggleBlackout,
  helpOpen,
  fullscreen,
  onToggleFullscreen,
  onExit,
  notice,
  jumpBuffer,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly timer: DeckTimer;
  readonly onGo: (index: number) => void;
  readonly onGoCard: (direction: 1 | -1) => void;
  readonly onOpenAtlas: (atlasId: string) => void;
  readonly returnPoint: DeckReturnPoint | null;
  readonly notesOpen: boolean;
  readonly onToggleNotes: () => void;
  readonly overviewOpen: boolean;
  readonly onToggleOverview: () => void;
  readonly blackout: boolean;
  readonly onToggleBlackout: () => void;
  readonly helpOpen: boolean;
  readonly fullscreen: boolean;
  readonly onToggleFullscreen: () => void;
  readonly onExit: () => void;
  readonly notice: string;
  readonly jumpBuffer: string;
}) {
  useBilingualI18nRevision();
  const containerRef = useRef<HTMLDivElement>(null);
  const panelHeadingId = useId();
  useDeckModalLayer(true, containerRef);
  const swipe = useSwipeNavigation(() => onGo(index + 1), () => onGo(index - 1));
  const slide = model.slides[index];
  const section = model.sections.find((item) => item.id === slide?.sectionId);
  if (!slide) return null;

  return createPortal(
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={bi("기술 발표 화면", "Engineering presentation")}
      data-deck-stage="true"
      data-notes={notesOpen ? "true" : undefined}
      className="deck-present"
    >
      <div className="deck-present__stage" {...swipe}>
        <EngineeringDeckSlide slide={slide} index={index} total={model.slides.length} sections={model.sections} />
        {blackout ? (
          <button type="button" className="deck-present__blackout" onClick={onToggleBlackout} aria-label={bi("블랙아웃 해제", "End blackout")}>
            <span aria-hidden="true">B</span>
          </button>
        ) : null}
        {overviewOpen ? (
          <div className="deck-present__overlay" role="region" aria-label={bi("슬라이드 개요", "Slide overview")}>
            <DeckOverview model={model} index={index} onSelect={(slideIndex) => { onGo(slideIndex); onToggleOverview(); }} />
          </div>
        ) : null}
        {helpOpen ? (
          <div className="deck-present__overlay" role="region" aria-label={bi("단축키 도움말", "Shortcut help")}>
            <div className="mx-auto grid max-w-3xl gap-4">
              <p className="text-lg font-black text-fg">{bi("발표 단축키", "Presentation shortcuts")}</p>
              <DeckShortcutList />
            </div>
          </div>
        ) : null}
      </div>
      {notesOpen ? (
        <aside className="deck-present__notes p-4" aria-labelledby={panelHeadingId}>
          <DeckPresenterPanel model={model} index={index} timer={timer} onJump={onGo} onOpenAtlas={onOpenAtlas} returnPoint={returnPoint} headingId={panelHeadingId} />
        </aside>
      ) : null}
      <div className="deck-present__hud">
        <SlideNavigator model={model} index={index} onGo={onGo} onGoCard={onGoCard} compact />
        <ReturnButton returnPoint={returnPoint} />
        <DeckClock timer={timer} slide={slide} section={section} totalSeconds={model.totalSeconds} compact />
        <ToolbarButton label={bi("개요", "Overview")} shortcut="O" pressed={overviewOpen} onClick={onToggleOverview}><LayoutGrid size={16} aria-hidden="true" /></ToolbarButton>
        <ToolbarButton label={bi("발표자 노트", "Speaker notes")} shortcut="N" pressed={notesOpen} onClick={onToggleNotes}><PanelRight size={16} aria-hidden="true" /></ToolbarButton>
        <ToolbarButton label={bi("블랙아웃", "Blackout")} shortcut="B" pressed={blackout} onClick={onToggleBlackout}><EyeOff size={16} aria-hidden="true" /></ToolbarButton>
        <ToolbarButton label={fullscreen ? bi("전체 화면 끄기", "Exit fullscreen") : bi("전체 화면", "Fullscreen")} shortcut="F" pressed={fullscreen} onClick={onToggleFullscreen}>
          {fullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
        </ToolbarButton>
        <button type="button" className={CONTROL_BUTTON} onClick={onExit}>
          <X size={16} aria-hidden="true" />
          <span className="deck-hud-label">{bi("발표 종료", "Exit presentation")}</span>
          <kbd className="deck-kbd max-md:hidden" aria-hidden="true">Esc</kbd>
        </button>
        <p className="sr-only" role="status" aria-live="polite">{index + 1} / {model.slides.length} · {slide.title}</p>
        {notice || jumpBuffer ? (
          <p className="basis-full text-center text-xs font-bold text-fg-2" role="status">
            {jumpBuffer ? formatI18nTemplate(String(bi("{value0}번으로 이동: Enter", "Go to {value0}: Enter")), { value0: jumpBuffer }) : notice}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
