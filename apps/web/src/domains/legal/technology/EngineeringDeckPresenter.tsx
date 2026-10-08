import { ChevronRight, ExternalLink, Layers, Pause, Play, RotateCcw, Undo2, TimerReset } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { EngineeringDeckSlide } from "./EngineeringDeckSlide";
import {
  deckCardIndexAt,
  deckCardOptions,
  formatClock,
  isTimedDeck,
  paceDeltaSeconds,
  type DeckSectionPlan,
  type DeckSlide,
  type DeckTrackModel,
} from "./engineering-deck-model";
import { elapsedDeckSeconds, useNow, type DeckTimer } from "./use-engineering-deck";

import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringDeckPresenter", ko, en);

/* ── 타이머·페이스 ─────────────────────────────────────────── */

/** 초마다 다시 그려지는 부분만 분리해 페이지 전체가 매초 렌더되지 않게 한다. */
export function DeckClock({
  timer,
  slide,
  section,
  totalSeconds,
  compact = false,
}: {
  readonly timer: DeckTimer;
  readonly slide: DeckSlide;
  readonly section: DeckSectionPlan | undefined;
  readonly totalSeconds: number;
  readonly compact?: boolean;
}) {
  useBilingualI18nRevision();
  const now = useNow(timer.running);
  const elapsed = elapsedDeckSeconds(timer, now);
  // 시간 배정이 없는 트랙(도감 부록)은 페이스·구간 남은 시간 없이 경과 시간만 보여준다.
  const timed = totalSeconds > 0;
  const pace = timed ? paceDeltaSeconds(elapsed, slide) : 0;
  const sectionEnd = section ? section.startSeconds + section.seconds : totalSeconds;
  const sectionRemaining = sectionEnd - elapsed;
  const paceLabel = pace > 0
    ? formatI18nTemplate(String(bi("예정보다 {value0} 늦음", "{value0} behind plan")), { value0: formatClock(pace) })
    : pace < 0
      ? formatI18nTemplate(String(bi("예정보다 {value0} 빠름", "{value0} ahead of plan")), { value0: formatClock(pace) })
      : bi("예정 시간 안", "On plan");

  if (compact) {
    return (
      <span className="inline-flex items-center gap-2 font-display text-sm font-bold tabular-nums" data-pace={pace > 0 ? "behind" : "ok"}>
        <span>{formatClock(elapsed)}</span>
        {timed ? <span className="text-fg-3">/ {formatClock(totalSeconds)}</span> : null}
      </span>
    );
  }

  if (!timed) {
    return (
      <div className="grid gap-1" role="timer" aria-live="off" aria-label={bi("발표 경과 시간", "Talk elapsed time")}>
        <p className="font-display text-4xl font-black tabular-nums tracking-tight text-fg">{formatClock(elapsed)}</p>
        <p className="text-xs font-bold text-fg-3">{bi("경과 시간 · 이 트랙에는 시간 배정이 없습니다", "Elapsed time · this track has no time budget")}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2" role="timer" aria-live="off" aria-label={bi("발표 경과 시간", "Talk elapsed time")}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-4xl font-black tabular-nums tracking-tight text-fg">{formatClock(elapsed)}</p>
        <p className="font-display text-sm font-bold tabular-nums text-fg-3">/ {formatClock(totalSeconds)}</p>
      </div>
      <p
        className={cx(
          "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold",
          pace > 0 ? "text-warn" : "text-good",
        )}
      >
        <span aria-hidden="true">{pace > 0 ? "▲" : "●"}</span>
        <span>{paceLabel}</span>
        {section ? (
          <span className="text-fg-2">
            {sectionRemaining >= 0
              ? formatI18nTemplate(String(bi("이 구간 남은 시간 {value0}", "{value0} left in section")), { value0: formatClock(sectionRemaining) })
              : formatI18nTemplate(String(bi("이 구간 {value0} 초과", "Section over by {value0}")), { value0: formatClock(sectionRemaining) })}
          </span>
        ) : null}
      </p>
    </div>
  );
}

export function DeckTimerControls({ timer }: { readonly timer: DeckTimer }) {
  useBilingualI18nRevision();
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={timer.toggle}
        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-bold text-fg hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {timer.running ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
        {timer.running ? bi("타이머 일시정지", "Pause timer") : bi("타이머 시작", "Start timer")}
        <kbd className="deck-kbd" aria-hidden="true">T</kbd>
      </button>
      <button
        type="button"
        onClick={timer.reset}
        aria-label={bi("발표 타이머 초기화", "Reset presentation timer")}
        className="grid size-11 place-items-center rounded-xl border border-line bg-card text-fg-2 hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <RotateCcw size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

/* ── 구간 진행 띠 ──────────────────────────────────────────── */

export function DeckSectionStrip({
  model,
  index,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
}) {
  useBilingualI18nRevision();
  const currentSection = model.slides[index]?.sectionId;
  const current = model.sections.find((section) => section.id === currentSection);
  if (model.sections.length < 2 || !current) return null;
  const timed = isTimedDeck(model);
  return (
    <>
      <ol className="deck-sections" aria-hidden="true">
        {model.sections.map((section) => (
          <li
            key={section.id}
            data-state={section.order < current.order ? "done" : section.order === current.order ? "current" : "upcoming"}
            // 시간 배정이 없는 트랙은 슬라이드 수에 비례해 칸을 나눈다.
            style={{ flexGrow: Math.max(1, timed ? section.seconds : section.slideCount) }}
            title={`${section.title} · ${timed ? formatClock(section.seconds) : formatI18nTemplate(String(bi("{value0}장", "{value0} slides")), { value0: section.slideCount })}`}
          />
        ))}
      </ol>
      <p className="sr-only">
        {formatI18nTemplate(String(bi("전체 {value0}개 구간 중 {value1}번째 구간", "Section {value1} of {value0}")), { value0: model.sections.length, value1: current.order })}
      </p>
    </>
  );
}

/* ── 도감 카드 선택(부록 트랙) ─────────────────────────────── */

/** 카테고리별 `optgroup` 으로 묶은 카드 선택. 카드 단위로 이동한다. */
export function DeckCardSelect({
  model,
  index,
  onGo,
  className,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly onGo: (slideIndex: number) => void;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const groups = deckCardOptions(model);
  const currentCard = model.cards?.[deckCardIndexAt(model, index)];
  return (
    <select
      aria-label={bi("도감 카드 선택", "Select atlas card")}
      value={currentCard ? String(currentCard.firstSlideIndex) : ""}
      onChange={(event) => onGo(Number(event.currentTarget.value))}
      className={cx(
        "min-h-11 w-full min-w-0 truncate rounded-xl border border-line bg-card px-3 text-sm font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      {groups.map(({ section, cards }) => (
        <optgroup key={section.id} label={`${section.title} (${cards.length})`}>
          {cards.map((card) => (
            <option key={card.id} value={card.firstSlideIndex}>
              {card.name === card.title ? card.name : `${card.name} · ${card.title}`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** 현재 카드 안에서 도식·코드·사용처 슬라이드로 바로 이동하는 단추. */
function DeckCardViews({
  model,
  index,
  onGo,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly onGo: (slideIndex: number) => void;
}) {
  useBilingualI18nRevision();
  const card = model.cards?.[deckCardIndexAt(model, index)];
  if (!card || card.slideCount < 2) return null;
  const views = model.slides.slice(card.firstSlideIndex, card.firstSlideIndex + card.slideCount);
  const label = (slide: DeckSlide): string => {
    const atlas = slide.atlas;
    if (!atlas) return slide.title;
    if (atlas.view === "diagram") return bi("도식", "Diagram");
    if (atlas.view === "usage") return bi("쓰인 곳", "Usage");
    return atlas.code && atlas.code.count > 1
      ? formatI18nTemplate(String(bi("코드 {value0}", "Code {value0}")), { value0: atlas.code.index + 1 })
      : bi("코드", "Code");
  };
  return (
    <div role="group" aria-label={bi("카드 안에서 이동", "Move within the card")} className="flex flex-wrap gap-2">
      {views.map((slide, offset) => {
        const slideIndex = card.firstSlideIndex + offset;
        return (
          <button
            key={slide.id}
            type="button"
            aria-pressed={slideIndex === index}
            onClick={() => onGo(slideIndex)}
            className={cx(
              "inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              slideIndex === index ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
            )}
          >
            {label(slide)}
          </button>
        );
      })}
    </div>
  );
}

/* ── 발표자 패널 ───────────────────────────────────────────── */

export function DeckPresenterPanel({
  model,
  index,
  timer,
  onJump,
  onOpenAtlas,
  returnPoint,
  headingId,
  className,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly timer: DeckTimer;
  readonly onJump: (slideIndex: number) => void;
  /** 도감 카드를 부록 트랙에서 연다(같은 탭). 없으면 "도감 카드 열기" 단추를 숨긴다. */
  readonly onOpenAtlas?: (atlasId: string) => void;
  /** 부록에서 원래 발표 위치로 돌아가는 동작. */
  readonly returnPoint?: { readonly label: string; readonly onReturn: () => void } | null;
  readonly headingId: string;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const slide = model.slides[index];
  const next = model.slides[index + 1];
  const section = model.sections.find((item) => item.id === slide?.sectionId);
  if (!slide) return null;
  const timed = isTimedDeck(model);
  const isAtlasTrack = model.track === "atlas";

  return (
    <section aria-labelledby={headingId} className={cx("grid content-start gap-4", className)}>
      <h2 id={headingId} className="sr-only">{bi("발표자 도구", "Presenter tools")}</h2>

      <div className="grid gap-3 rounded-2xl border border-line bg-card/80 p-4">
        <DeckClock timer={timer} slide={slide} section={section} totalSeconds={model.totalSeconds} />
        <DeckTimerControls timer={timer} />
      </div>

      {returnPoint ? (
        <button
          type="button"
          onClick={returnPoint.onReturn}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-accent/45 bg-accent-soft/25 px-3 text-sm font-bold text-accent hover:bg-accent-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Undo2 size={15} aria-hidden="true" />
          {returnPoint.label}
        </button>
      ) : null}

      {isAtlasTrack ? (
        <div className="grid gap-3 rounded-2xl border border-line bg-card/80 p-4">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-fg-3">
            <Layers size={14} aria-hidden="true" />
            {bi("도감 카드", "Atlas card")}
            <span className="ml-auto font-display tabular-nums">
              {Math.max(0, deckCardIndexAt(model, index)) + 1} / {model.cards?.length ?? 0}
            </span>
          </p>
          <DeckCardSelect model={model} index={index} onGo={onJump} />
          <DeckCardViews model={model} index={index} onGo={onJump} />
          <p className="text-xs leading-6 text-fg-3">
            {bi("[ ] 키로 이전·다음 카드로 이동합니다.", "Use [ ] to move to the previous or next card.")}
          </p>
        </div>
      ) : null}

      {timed && section && model.sections.length > 1 ? (
        <div className="grid gap-2 rounded-2xl border border-line bg-card/80 p-4">
          <p className="flex items-center justify-between gap-3 text-xs font-bold text-fg-3">
            <span>
              {formatI18nTemplate(String(bi("구간 {value0}/{value1}", "Section {value0}/{value1}")), { value0: section.order, value1: model.sections.length })}
            </span>
            <span className="font-display tabular-nums">
              {formatI18nTemplate(String(bi("예산 {value0}", "Budget {value0}")), { value0: formatClock(section.seconds) })}
            </span>
          </p>
          <p className="text-sm font-black text-fg">{section.title}</p>
          <DeckSectionStrip model={model} index={index} />
        </div>
      ) : null}

      <div className="rounded-2xl border border-accent/30 bg-accent-soft/20 p-4">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-accent">{bi("발표자 노트", "Speaker notes")}</p>
        <p className="mt-2 whitespace-pre-line text-sm leading-7 text-fg">{slide.notes}</p>
        {slide.question ? (
          <p className="mt-3 rounded-xl border border-line bg-card/80 p-3 text-sm font-bold leading-6 text-fg">
            <span className="mr-1 text-accent-2">Q.</span>{slide.question}
          </p>
        ) : null}
      </div>

      {slide.relatedAtlas?.length && onOpenAtlas ? (
        <div className="rounded-2xl border border-line bg-card/80 p-4">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-fg-3">{bi("질문이 나오면 열 도감 카드", "Atlas cards for likely questions")}</p>
          <ul className="mt-3 grid gap-2">
            {slide.relatedAtlas.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => onOpenAtlas(card.id)}
                  className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-panel/70 px-3 text-left text-sm font-bold text-accent hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={formatI18nTemplate(String(bi("도감 카드 열기: {value0}", "Open atlas card: {value0}")), { value0: card.name })}
                >
                  <span>{bi("도감 카드 열기", "Open atlas card")} · {card.name}</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {slide.demoSteps?.length ? (
        <div className="rounded-2xl border border-line bg-card/80 p-4">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-fg-3">{bi("데모와 대체 경로", "Demo and fallback")}</p>
          <ol className="mt-3 grid gap-3">
            {slide.demoSteps.map((step, stepIndex) => (
              <li key={`${step.href}-${step.action}`} className="grid gap-1 text-sm leading-6">
                <a href={step.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-bold text-accent hover:underline">
                  <span className="font-display text-xs text-fg-3">{stepIndex + 1}</span>
                  {step.action}
                  <ExternalLink size={13} aria-hidden="true" />
                  <span className="sr-only">{bi("(새 탭)", "(new tab)")}</span>
                </a>
                <span className="text-fg-2">{bi("관찰: ", "Observe: ")}{step.expected}</span>
                <span className="text-fg-3">{bi("실패 시: ", "If it fails: ")}{step.fallback}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="rounded-2xl border border-line bg-card/80 p-4">
        <p className="flex items-center justify-between gap-2 text-xs font-black uppercase tracking-[0.12em] text-fg-3">
          {bi("다음 슬라이드", "Next slide")}
          {next ? <span className="font-display tabular-nums">{index + 2} / {model.slides.length}</span> : null}
        </p>
        {next ? (
          <button
            type="button"
            onClick={() => onJump(index + 1)}
            className="mt-3 grid w-full gap-2 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={formatI18nTemplate(String(bi("다음 슬라이드로 이동: {value0}", "Go to next slide: {value0}")), { value0: next.title })}
          >
            <EngineeringDeckSlide slide={next} index={index + 1} total={model.slides.length} sections={model.sections} fixed decorative />
            <span className="flex items-start gap-1 text-sm font-bold leading-6 text-fg-2">
              <ChevronRight size={16} className="mt-1 shrink-0 text-accent" aria-hidden="true" />
              {next.title}
            </span>
          </button>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm text-fg-2">
            <TimerReset size={15} className="text-accent" aria-hidden="true" />
            {isAtlasTrack
              ? bi("부록의 마지막 슬라이드입니다.", "This is the last slide of the appendix.")
              : bi("마지막 슬라이드입니다. 질의응답을 진행하세요.", "This is the last slide. Move to Q&A.")}
          </p>
        )}
      </div>

      {slide.chapterId || slide.evidence?.length ? (
        <details className="rounded-2xl border border-line bg-card/80 p-4">
          <summary className="flex min-h-11 cursor-pointer items-center rounded-xl text-sm font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{bi("코드·설정 근거", "Code and configuration evidence")}</summary>
          <div className="mt-2 grid gap-2">
            {slide.chapterId ? (
              <Link href={`/about/technology/story#${slide.chapterId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent hover:underline">
                {bi("기술 스토리에서 상태와 근거 보기", "See status and evidence in the engineering story")}
                <ChevronRight size={14} aria-hidden="true" />
              </Link>
            ) : null}
            {slide.evidence?.length ? (
              <ul className="grid gap-1.5">
                {slide.evidence.map((path) => (
                  <li key={path}><code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-raised px-2.5 py-1.5 font-mono text-[0.7rem] text-fg-2">{path}</code></li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}

/* ── 개요 그리드 ───────────────────────────────────────────── */

/**
 * 개요의 썸네일. 화면에 보일 때만 슬라이드를 그린다(부록 트랙은 수백 장일 수 있다).
 * 자리는 16:9 로 미리 잡아 스크롤 위치가 흔들리지 않고, 한 번 그린 썸네일은 유지한다.
 * IntersectionObserver 가 없는 환경(테스트·구형 브라우저)은 바로 그린다.
 */
function DeckOverviewThumb({
  slide,
  slideIndex,
  total,
  sections,
}: {
  readonly slide: DeckSlide;
  readonly slideIndex: number;
  readonly total: number;
  readonly sections: readonly DeckSectionPlan[];
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [rendered, setRendered] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (rendered) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setRendered(true);
        observer.disconnect();
      }
    }, { rootMargin: "480px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [rendered]);

  return (
    <span ref={ref} className="deck-overview__thumb" data-rendered={rendered ? "true" : "false"}>
      {rendered ? (
        <EngineeringDeckSlide slide={slide} index={slideIndex} total={total} sections={sections} fixed decorative />
      ) : (
        <span className="deck-overview__placeholder" aria-hidden="true">{slide.title}</span>
      )}
    </span>
  );
}

export function DeckOverview({
  model,
  index,
  onSelect,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly onSelect: (slideIndex: number) => void;
}) {
  useBilingualI18nRevision();
  const timed = isTimedDeck(model);
  return (
    <div className="grid gap-2">
      {model.sections.map((section) => (
        <section key={section.id} aria-label={section.title}>
          {model.sections.length > 1 ? (
            <h3 className="deck-section-title">
              <span className="font-display text-accent">{String(section.order).padStart(2, "0")}</span>
              {section.title}
              <small>
                {timed
                  ? formatClock(section.seconds)
                  : formatI18nTemplate(String(bi("{value0}장", "{value0} slides")), { value0: section.slideCount })}
              </small>
            </h3>
          ) : null}
          <ol className="deck-overview">
            {model.slides.slice(section.firstSlideIndex, section.firstSlideIndex + section.slideCount).map((slide, offset) => {
              const slideIndex = section.firstSlideIndex + offset;
              return (
                <li key={slide.id}>
                  <button
                    type="button"
                    className="deck-overview__item"
                    aria-current={slideIndex === index ? "true" : undefined}
                    onClick={() => onSelect(slideIndex)}
                  >
                    <DeckOverviewThumb slide={slide} slideIndex={slideIndex} total={model.slides.length} sections={model.sections} />
                    <span className="deck-overview__caption">
                      <span>{String(slideIndex + 1).padStart(2, "0")}</span>
                      <span>{slide.title}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/* ── 단축키 안내 ───────────────────────────────────────────── */

const DECK_SHORTCUTS = [
  { keys: ["←", "→"], ko: "이전·다음 슬라이드", en: "Previous / next slide" },
  { keys: ["Space", "PgDn"], ko: "다음 (Shift+Space는 이전)", en: "Next (Shift+Space for previous)" },
  { keys: ["Home", "End"], ko: "처음·마지막", en: "First / last" },
  { keys: ["[", "]"], ko: "이전·다음 도감 카드 (부록 트랙)", en: "Previous / next atlas card (appendix track)" },
  { keys: ["F"], ko: "발표 시작·전체 화면", en: "Present / fullscreen" },
  { keys: ["N", "S"], ko: "발표자 노트", en: "Speaker notes" },
  { keys: ["O"], ko: "슬라이드 개요", en: "Slide overview" },
  { keys: ["B", "."], ko: "블랙아웃", en: "Blackout" },
  { keys: ["T"], ko: "타이머 시작·정지", en: "Start / pause timer" },
  { keys: ["7", "Enter"], ko: "번호로 이동", en: "Jump to number" },
  { keys: ["?"], ko: "단축키 도움말", en: "Shortcut help" },
  { keys: ["Esc"], ko: "닫기·발표 종료", en: "Close / exit" },
] as const;

export function DeckShortcutList({ className }: { readonly className?: string }) {
  useBilingualI18nRevision();
  return (
    <dl className={cx("grid gap-x-4 gap-y-2 sm:grid-cols-2", className)}>
      {DECK_SHORTCUTS.map((shortcut) => (
        <div key={shortcut.ko} className="flex min-h-9 items-center justify-between gap-3 border-b border-line/60 pb-2 text-sm">
          <dt className="text-fg-2">{bi(shortcut.ko, shortcut.en)}</dt>
          <dd className="m-0 flex shrink-0 gap-1">
            {shortcut.keys.map((key) => <kbd key={key} className="deck-kbd">{key}</kbd>)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
