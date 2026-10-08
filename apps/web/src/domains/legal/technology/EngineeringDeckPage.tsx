import {
  Copy,
  Download,
  Eye,
  EyeOff,
  Keyboard,
  LayoutGrid,
  LibraryBig,
  MonitorUp,
  Play,
  Printer,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { SlideNavigator, ToolbarButton } from "./EngineeringDeckControls";
import { EngineeringDeckSlide } from "./EngineeringDeckSlide";
import {
  DeckClock,
  DeckOverview,
  DeckPresenterPanel,
  DeckSectionStrip,
  DeckShortcutList,
  DeckTimerControls,
} from "./EngineeringDeckPresenter";
import { PresentationLayer, PresenterWindow } from "./EngineeringDeckStages";
import { WorkshopModules } from "./EngineeringDeckWorkshop";
import { EngineeringKeySummary, EngineeringMetaChip } from "./EngineeringLongform";
import { EngineeringSeminarPrep } from "./EngineeringSeminarPrep";
import { EngineeringFreeAiTokenGuide } from "./EngineeringFreeAiTokenGuide";
import { EngineeringSeminarResources } from "./EngineeringSeminarResources";
import { EngineeringPageFrame, EngineeringPageIntro } from "./EngineeringStoryUi";
import { architectureOutline } from "./engineering-architecture-data";
import { buildOfflineEngineeringDeck, downloadOfflineEngineeringDeck } from "./engineering-deck-export";
import {
  DECK_TRACK_META,
  DECK_TRACK_PAGE_COPY,
  buildDeckTrack,
  deckAdjacentCardStart,
  deckAtlasCardStart,
  deckScopeSlides,
  deckTrackSlideCount,
  deckTrackSlideIds,
  deckTrackTotalSeconds,
  formatClock,
  isTimedDeck,
  type DeckSectionPlan,
  type DeckSlide,
  type DeckTrackModel,
} from "./engineering-deck-model";
import { DECK_TRACKS, engineeringDeckHref, type DeckTrack } from "./engineering-deck-state";
import { ENGINEERING_SEMINAR_MODULES } from "./engineering-playbook-content";
import { CONTROL_BUTTON, DECK_PAGE_I18N_SCOPE, deckPageBi as bi } from "./engineering-deck-ui";
import type { LocalizedText } from "./engineering-story-content";
import {
  deckCommandForKey,
  exitDocumentFullscreen,
  requestDocumentFullscreen,
  useDeckPosition,
  useDeckSync,
  useDeckTimer,
  useFullscreenState,
  useSlideNumberJump,
  type DeckPositionSource,
} from "./use-engineering-deck";
import { useEngineeringLocale } from "./use-engineering-locale";
import "./engineering-deck.css";

import { ServiceStoryJourney } from "@/shared/components/service-story-journey";
import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

/** 주소를 위치로 바꿀 때 쓰는 트랙별 슬라이드 수·id(번역 없이 계산된다). 모듈 상수라 렌더마다 새로 만들지 않는다. */
const DECK_POSITION_SOURCE: DeckPositionSource = { count: deckTrackSlideCount, ids: deckTrackSlideIds };

const PRIMARY_BUTTON =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-black text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

/* ── 인쇄 영역 ─────────────────────────────────────────────── */

/**
 * 인쇄·PDF 용 슬라이드. 화면에서는 숨겨져 있고 인쇄할 때만 보인다.
 * 부록 트랙은 수백 장일 수 있어 현재 구간(카테고리)의 슬라이드만 담는다.
 */
const PrintDeck = memo(function PrintDeck({
  slides,
  firstIndex,
  total,
  sections,
}: {
  readonly slides: readonly DeckSlide[];
  readonly firstIndex: number;
  readonly total: number;
  readonly sections: readonly DeckSectionPlan[];
}) {
  return (
    <div data-engineering-print-deck="true" aria-hidden="true">
      {slides.map((printSlide, offset) => (
        <EngineeringDeckSlide
          key={printSlide.id}
          slide={printSlide}
          index={firstIndex + offset}
          total={total}
          sections={sections}
          fixed
          decorative
        />
      ))}
    </div>
  );
});

/* ── 도감이 비어 있을 때 ───────────────────────────────────── */

function EmptyAtlasState({ onShowTalk }: { readonly onShowTalk: () => void }) {
  useBilingualI18nRevision();
  return (
    <div role="status" className="grid place-items-center gap-3 rounded-3xl border border-dashed border-line-strong bg-card/50 p-8 text-center sm:p-12">
      <LibraryBig size={32} className="text-accent" aria-hidden="true" />
      <p className="text-lg font-black text-fg">{bi("도감 카드가 아직 없습니다", "No atlas cards yet")}</p>
      <p className="max-w-xl text-sm leading-7 text-fg-2">
        {bi(
          "기술 도감에 카드가 추가되면 이 부록 트랙에 자동으로 나타납니다. 카드마다 도식 → 코드 → 쓰인 곳 슬라이드가 만들어집니다.",
          "Cards added to the tech atlas appear in this appendix automatically, each with diagram, code and usage slides.",
        )}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/about/technology/atlas" className={CONTROL_BUTTON}>{bi("기술 도감 보기", "Open the tech atlas")}</Link>
        <button type="button" className={CONTROL_BUTTON} onClick={onShowTalk}>{bi("세미나 발표로 가기", "Go to the seminar talk")}</button>
      </div>
    </div>
  );
}

/* ── 슬라이드 목차 ─────────────────────────────────────────── */

/**
 * 구간별 슬라이드 목차 — 개요(썸네일)가 발표 중의 일시 도구라면, 목차는
 * 발표 전에 전체 흐름과 구간별 시간을 읽고 원하는 슬라이드로 바로 가는
 * 상시 색인이다. 슬라이드·구간·시간은 전부 덱 모델에서 그대로 읽는다.
 */
function DeckSlideIndex({
  model,
  index,
  onJump,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly onJump: (index: number) => void;
}) {
  useBilingualI18nRevision();
  return (
    <section aria-labelledby="deck-slide-index-title" className="mt-8 rounded-3xl border border-line/70 bg-panel/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="deck-slide-index-title" className="text-lg font-black text-fg">{bi("슬라이드 목차", "Slide index")}</h2>
          <p className="mt-1 text-sm leading-6 text-fg-2">
            {bi("구간별로 묶은 전체 슬라이드입니다. 누르면 그 슬라이드로 이동합니다.", "Every slide grouped by section. Select one to jump straight to it.")}
          </p>
        </div>
        <p className="font-display text-sm font-bold tabular-nums text-fg-3">
          {formatI18nTemplate(String(bi("{value0}개 구간 · {value1}장 · {value2}", "{value0} sections · {value1} slides · {value2}")), {
            value0: model.sections.length,
            value1: model.slides.length,
            value2: formatClock(model.totalSeconds),
          })}
        </p>
      </div>
      <div className="mt-5 grid gap-x-8 gap-y-5 lg:grid-cols-2">
        {model.sections.map((sectionPlan) => (
          <div key={sectionPlan.id}>
            <p className="flex items-baseline justify-between gap-3 text-sm font-black text-fg">
              <span>
                <span className="mr-2 font-display text-accent">{String(sectionPlan.order).padStart(2, "0")}</span>
                {sectionPlan.title}
              </span>
              <span className="shrink-0 font-display text-xs font-bold tabular-nums text-fg-3">
                {formatI18nTemplate(String(bi("{value0}장 · {value1}", "{value0} slides · {value1}")), {
                  value0: sectionPlan.slideCount,
                  value1: formatClock(sectionPlan.seconds),
                })}
              </span>
            </p>
            <ol className="mt-2 grid gap-1">
              {model.slides.slice(sectionPlan.firstSlideIndex, sectionPlan.firstSlideIndex + sectionPlan.slideCount).map((slide, offset) => {
                const slideIndex = sectionPlan.firstSlideIndex + offset;
                const current = slideIndex === index;
                return (
                  <li key={slide.id}>
                    <button
                      type="button"
                      aria-current={current || undefined}
                      onClick={() => onJump(slideIndex)}
                      className={cx(
                        "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        current ? "bg-accent-soft font-black text-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                      )}
                    >
                      <span className="w-6 shrink-0 font-display tabular-nums">{slideIndex + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{slide.title}</span>
                      <span className="shrink-0 font-display text-xs tabular-nums text-fg-3">{formatClock(slide.plannedSeconds)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 페이지 ────────────────────────────────────────────────── */

export function EngineeringDeckPage() {
  useBilingualI18nRevision();
  const locale = useEngineeringLocale();
  const localize = useCallback(
    (text: LocalizedText) => translateBilingualValueForLocale(locale, DECK_PAGE_I18N_SCOPE, text.ko, text.en),
    [locale],
  );

  const position = useDeckPosition(DECK_POSITION_SOURCE);
  const model = useMemo(() => buildDeckTrack(position.track, localize, { locale }), [position.track, localize, locale]);
  const timer = useDeckTimer();
  const timerBridge = useMemo(() => ({ state: timer.state, apply: timer.apply }), [timer.state, timer.apply]);
  const sync = useDeckSync({ track: position.track, index: position.index }, position.applyRemote, timerBridge);
  const fullscreen = useFullscreenState();
  const panelHeadingId = useId();

  const [presenting, setPresenting] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [blackout, setBlackout] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState("");
  /** 발표 슬라이드에서 도감 카드를 열었을 때 돌아갈 위치. */
  const [returnTo, setReturnTo] = useState<{ readonly track: DeckTrack; readonly index: number } | null>(null);
  const keepPresentingOnFullscreenExit = useRef(false);
  const overviewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const isPresenterView = position.view === "presenter";

  const index = position.index;
  const slide = model.slides[index];
  const empty = model.slides.length === 0;
  const timed = isTimedDeck(model);
  const section = model.sections.find((item) => item.id === slide?.sectionId);
  const trackMeta = DECK_TRACK_META[position.track];
  const pageCopy = DECK_TRACK_PAGE_COPY[position.track];

  useDocumentTitle(bi(pageCopy.title.ko, pageCopy.title.en));

  const goTo = position.goTo;
  const jump = useSlideNumberJump(useCallback((slidePosition: number) => goTo(slidePosition - 1), [goTo]));

  /** 부록 트랙에서 이전(-1)·다음(1) 카드의 첫 슬라이드로 이동한다. 카드가 없으면 아무 일도 하지 않는다. */
  const goToCard = useCallback((direction: 1 | -1) => {
    const target = deckAdjacentCardStart(model, index, direction);
    if (target !== null) goTo(target);
  }, [goTo, index, model]);

  /** 도감 카드를 같은 탭의 부록 트랙에서 연다(새 탭이 아님). 돌아갈 위치를 기억한다. */
  const openAtlasCard = useCallback((atlasId: string) => {
    const start = deckAtlasCardStart(atlasId);
    if (start === null) {
      setNotice(bi("도감에서 그 카드를 찾지 못했습니다.", "That atlas card was not found."));
      return;
    }
    if (position.track !== "atlas") setReturnTo({ track: position.track, index });
    position.openSlide("atlas", start);
  }, [index, position]);

  const returnPoint = useMemo(() => {
    if (!returnTo || position.track !== "atlas") return null;
    const target = returnTo;
    return {
      label: formatI18nTemplate(String(bi("발표로 돌아가기 · {value0}", "Back to the talk · {value0}")), {
        value0: `${target.index + 1}/${deckTrackSlideCount(target.track)}`,
      }),
      onReturn: () => {
        position.openSlide(target.track, target.index);
        setReturnTo(null);
      },
    };
  }, [position, returnTo]);

  const startTimer = timer.start;
  const enterPresentation = useCallback(() => {
    // 슬라이드가 없는 트랙(도감이 비어 있음)에서는 발표 화면을 열지 않는다.
    if (empty) return;
    setPresenting(true);
    setOverviewOpen(false);
    setHelpOpen(false);
    startTimer();
    void requestDocumentFullscreen().then((entered) => {
      if (!entered) setNotice(bi("이 브라우저에서는 전체 화면을 쓸 수 없어 화면 안에서 발표합니다.", "Fullscreen is unavailable, so the talk continues in this window."));
    });
  }, [empty, startTimer]);

  const exitPresentation = useCallback(() => {
    setPresenting(false);
    setBlackout(false);
    setOverviewOpen(false);
    setHelpOpen(false);
    setNotice("");
    if (document.fullscreenElement) void exitDocumentFullscreen();
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      keepPresentingOnFullscreenExit.current = true;
      void exitDocumentFullscreen();
      return;
    }
    void requestDocumentFullscreen().then((entered) => {
      if (!entered) setNotice(bi("전체 화면 요청이 거부되었습니다.", "The fullscreen request was denied."));
    });
  }, []);

  // 브라우저 Esc로 전체 화면을 빠져나오면 발표 화면도 함께 닫는다(F로 끈 경우는 유지).
  const onFullscreenChange = useEffectEvent((isFullscreen: boolean) => {
    if (isFullscreen) return;
    if (keepPresentingOnFullscreenExit.current) {
      keepPresentingOnFullscreenExit.current = false;
      return;
    }
    if (presenting) exitPresentation();
  });
  const wasFullscreen = useRef(false);
  useEffect(() => {
    if (wasFullscreen.current !== fullscreen) onFullscreenChange(fullscreen);
    wasFullscreen.current = fullscreen;
  }, [fullscreen]);

  const openPresenterWindow = (): void => {
    const href = engineeringDeckHref({
      track: position.track,
      index,
      view: "presenter",
      slideId: position.track === "atlas" ? slide?.id : undefined,
    });
    const opened = window.open(href, "toonstudio-deck-presenter", "popup=yes,width=1280,height=800");
    setNotice(opened
      ? bi("발표자 창을 열었습니다. 이 창은 프로젝터에서 발표 시작(F)을 누르세요.", "Presenter window opened. Press Present (F) in this window on the projector.")
      : bi("팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도하세요.", "The popup was blocked. Allow popups and try again."));
  };

  const copyCurrentSlideLink = async (): Promise<void> => {
    // 번호가 아니라 슬라이드 id 로 복사해, 슬라이드가 끼어들어도 공유한 링크가 같은 슬라이드를 가리킨다.
    const href = `${window.location.origin}${engineeringDeckHref({ track: position.track, index, slideId: slide?.id })}`;
    try {
      await navigator.clipboard.writeText(href);
      setNotice(bi("현재 슬라이드 링크를 복사했어요.", "Current slide link copied."));
    } catch {
      setNotice(formatI18nTemplate(String(bi("복사할 링크: {value0}", "Copy this link: {value0}")), { value0: href }));
    }
  };

  // 부록 트랙은 현재 구간(카테고리)만 인쇄·내보낸다. 같은 모델·구간이면 같은 객체라 인쇄 영역이 다시 그려지지 않는다.
  const scope = deckScopeSlides(model, index);

  const downloadOfflineDeck = (): void => {
    const scopeNote = scope.section
      ? formatI18nTemplate(String(bi("이 파일은 도감 부록의 “{value0}” 구간 {value1}장만 담고 있습니다.", "This file contains only the “{value0}” section of the atlas appendix ({value1} slides).")), {
        value0: scope.section.title,
        value1: scope.slides.length,
      })
      : undefined;
    const filename = scope.section
      ? `toonstudio-${position.track}-${scope.section.id}-deck.html`
      : `toonstudio-${position.track}-deck.html`;
    downloadOfflineEngineeringDeck(
      buildOfflineEngineeringDeck(scope.slides, locale, {
        localize,
        sections: model.sections,
        architecture: architectureOutline(localize),
        scopeNote,
      }),
      filename,
    );
    setNotice(scope.section
      ? formatI18nTemplate(String(bi("오프라인 발표본을 만들었습니다({value0} {value1}장만 포함). 영상·외부 링크·서비스 기능은 포함하지 않습니다.", "Offline deck created ({value0}, {value1} slides only). Videos, external links and service capabilities are not included.")), {
        value0: scope.section.title,
        value1: scope.slides.length,
      })
      : bi("오프라인 발표본을 만들었습니다. 영상·외부 링크·서비스 기능은 포함하지 않습니다.", "Offline deck created. Videos, external links and service capabilities are not included."));
  };

  const toggleOverview = useCallback(() => {
    setOverviewOpen((open) => !open);
    setHelpOpen(false);
  }, []);
  const toggleHelp = useCallback(() => {
    setHelpOpen((open) => !open);
    setOverviewOpen(false);
  }, []);

  // 인라인 개요를 열면 키보드 사용자가 바로 고를 수 있게 개요로 이동한다.
  useEffect(() => {
    if (!overviewOpen || presenting || isPresenterView) return;
    const region = overviewRef.current;
    region?.scrollIntoView({ block: "start", behavior: "auto" });
    region?.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true });
  }, [overviewOpen, presenting, isPresenterView]);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const active = presenting || isPresenterView;
    if (jump.handleKey(event)) {
      event.preventDefault();
      return;
    }
    const command = deckCommandForKey(event, active);
    if (!command) return;
    if (blackout && command !== "blackout" && command !== "present") {
      event.preventDefault();
      setBlackout(false);
      return;
    }
    switch (command) {
      case "next":
        event.preventDefault();
        goTo(index + 1);
        break;
      case "previous":
        event.preventDefault();
        goTo(index - 1);
        break;
      case "nextCard":
      case "previousCard": {
        // 카드가 없는 트랙에서는 키를 가로채지 않는다.
        const target = deckAdjacentCardStart(model, index, command === "nextCard" ? 1 : -1);
        if (!model.cards) return;
        event.preventDefault();
        if (target !== null) goTo(target);
        break;
      }
      case "first":
        event.preventDefault();
        goTo(0);
        break;
      case "last":
        event.preventDefault();
        goTo(model.slides.length - 1);
        break;
      case "present":
        event.preventDefault();
        if (presenting || isPresenterView) toggleFullscreen();
        else enterPresentation();
        break;
      case "notes":
        event.preventDefault();
        if (presenting) setNotesOpen((open) => !open);
        else if (!isPresenterView) setSidePanelOpen((open) => !open);
        break;
      case "overview":
        event.preventDefault();
        toggleOverview();
        break;
      case "blackout":
        if (!presenting) return;
        event.preventDefault();
        setBlackout((value) => !value);
        break;
      case "timer":
        event.preventDefault();
        timer.toggle();
        break;
      case "help":
        event.preventDefault();
        toggleHelp();
        break;
      case "escape":
        if (helpOpen) setHelpOpen(false);
        else if (overviewOpen) setOverviewOpen(false);
        else if (blackout) setBlackout(false);
        else if (presenting) exitPresentation();
        else return;
        event.preventDefault();
        break;
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => onKeyDown(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  if (isPresenterView && slide) {
    return (
      <PresenterWindow
        model={model}
        index={index}
        timer={timer}
        onGo={goTo}
        onGoCard={goToCard}
        onOpenAtlas={openAtlasCard}
        returnPoint={returnPoint}
        syncAvailable={sync.available}
        jumpBuffer={jump.buffer}
        overviewOpen={overviewOpen}
        onToggleOverview={toggleOverview}
        helpOpen={helpOpen}
        onToggleHelp={toggleHelp}
      />
    );
  }

  return (
    <EngineeringPageFrame pageId="deck">
      <EngineeringPageIntro
        pageId="deck"
        eyebrow="PRESENTATION MODE"
        title={bi("기술 발표 모드", "Engineering presentation mode")}
        description={bi(pageCopy.description.ko, pageCopy.description.en)}
        aside={
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button type="button" className={PRIMARY_BUTTON} onClick={enterPresentation} disabled={empty}>
              <Play size={17} aria-hidden="true" />
              {bi("발표 시작", "Start presenting")}
              <kbd className="deck-kbd" aria-hidden="true">F</kbd>
            </button>
            <button type="button" className={CONTROL_BUTTON} onClick={openPresenterWindow} disabled={empty}>
              <MonitorUp size={16} aria-hidden="true" />
              {bi("발표자 창 열기", "Open presenter window")}
            </button>
          </div>
        }
      />

      <EngineeringKeySummary
        className="mb-6"
        points={[
          bi(
            "슬라이드는 기술 문서 챕터와 연결돼 있습니다. engineering-deck-model이 챕터 id와 근거 목록을 슬라이드에 함께 실어, 발표 중 질문이 나와도 원문 위치로 되짚을 수 있습니다.",
            "Slides stay linked to the engineering chapters. engineering-deck-model carries each slide's chapter id and evidence list, so a question mid-talk can be traced back to the source text.",
          ),
          bi(
            "발표자 창은 BroadcastChannel로 청중 화면과 같은 슬라이드를 유지합니다. 타이머는 슬라이드별 계획 시간과 실제 경과를 비교해 구간 예산 대비 페이스를 알려 줍니다.",
            "The presenter window keeps the same slide as the audience screen over BroadcastChannel. The timer compares each slide's planned time with the actual pace against the section budget.",
          ),
          bi(
            "오프라인 발표본과 인쇄 덱은 영상·외부 링크·서비스 기능을 빼고 내보냅니다. 네트워크가 없는 발표장에서도 같은 슬라이드를 보여 주기 위한 제약입니다.",
            "The offline deck and the print deck are exported without videos, external links or service capabilities — a deliberate constraint so the same slides work in a venue with no network.",
          ),
        ]}
        meta={(
          <>
            <EngineeringMetaChip>
              {formatI18nTemplate(String(bi("트랙 {value0}종", "{value0} tracks")), { value0: DECK_TRACKS.length })}
            </EngineeringMetaChip>
            <EngineeringMetaChip>
              {formatI18nTemplate(String(bi("현재 트랙 {value0}장 · {value1}", "Current track: {value0} slides · {value1}")), {
                value0: model.slides.length,
                value1: formatClock(model.totalSeconds),
              })}
            </EngineeringMetaChip>
            <EngineeringMetaChip>
              {formatI18nTemplate(String(bi("워크숍 모듈 {value0}개", "{value0} workshop modules")), { value0: ENGINEERING_SEMINAR_MODULES.length })}
            </EngineeringMetaChip>
          </>
        )}
      />

      <section data-engineering-deck-shell="true" aria-labelledby="deck-preview-title" className="grid gap-4">
        <h2 id="deck-preview-title" className="sr-only">{bi("발표 미리보기와 조작", "Presentation preview and controls")}</h2>

        <div className="grid gap-3 rounded-3xl border border-line/70 bg-panel/65 p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div role="group" aria-label={bi("발표 트랙", "Presentation track")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DECK_TRACKS.map((track) => {
              const meta = DECK_TRACK_META[track];
              const selected = track === position.track;
              const trackTimed = deckTrackTotalSeconds(track) > 0;
              const minutes = Math.round(deckTrackTotalSeconds(track) / 60);
              return (
                <button
                  key={track}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    position.setTrack(track);
                    setReturnTo(null);
                    setNotice("");
                  }}
                  className={cx(
                    "flex min-h-14 min-w-0 flex-col items-start justify-center rounded-2xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:px-4",
                    selected
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
                  )}
                >
                  <span className="text-sm font-black">{bi(meta.label.ko, meta.label.en)}</span>
                  {/* 좁은 화면에서도 "19장"이 쪼개지지 않도록 시간과 장수를 따로 줄바꿈한다. */}
                  <span className={cx("flex flex-wrap gap-x-1 text-xs font-bold", selected ? "text-on-accent/80" : "text-fg-3")}>
                    {trackTimed ? (
                      <span className="whitespace-nowrap">
                        {formatI18nTemplate(String(bi("약 {value0}분 ·", "~{value0} min ·")), { value0: minutes })}
                      </span>
                    ) : (
                      <span className="whitespace-nowrap">{bi("부록 ·", "Appendix ·")}</span>
                    )}
                    <span className="whitespace-nowrap">
                      {formatI18nTemplate(String(bi("{value0}장", "{value0} slides")), { value0: deckTrackSlideCount(track) })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={CONTROL_BUTTON} onClick={() => void copyCurrentSlideLink()} disabled={empty}>
              <Copy size={15} aria-hidden="true" />
              {bi("슬라이드 링크", "Slide link")}
            </button>
            <button type="button" className={CONTROL_BUTTON} onClick={() => window.print()} disabled={empty}>
              <Printer size={15} aria-hidden="true" />
              {bi("인쇄·PDF", "Print · PDF")}
            </button>
            <button type="button" className={CONTROL_BUTTON} onClick={downloadOfflineDeck} disabled={empty}>
              <Download size={15} aria-hidden="true" />
              {bi("오프라인 발표본", "Offline deck")}
            </button>
          </div>
        </div>
        <p className="px-1 text-xs leading-6 text-fg-3">
          {bi(trackMeta.description.ko, trackMeta.description.en)}
          {scope.section ? (
            <>
              {" "}
              {formatI18nTemplate(String(bi("인쇄·오프라인 발표본은 현재 구간 “{value0}” {value1}장만 담습니다.", "Print and the offline deck include only the current section “{value0}” ({value1} slides).")), {
                value0: scope.section.title,
                value1: scope.slides.length,
              })}
            </>
          ) : null}
        </p>

        {position.resumeIndex !== null && position.resumeIndex !== index ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft/25 px-4 py-3 text-sm text-fg-2" role="status">
            <RotateCcw size={16} className="text-accent" aria-hidden="true" />
            <span className="flex-1">
              {formatI18nTemplate(String(bi("이 탭에서 {value0}번 슬라이드까지 보셨어요.", "You were on slide {value0} in this tab.")), { value0: position.resumeIndex + 1 })}
            </span>
            <button type="button" className={CONTROL_BUTTON} onClick={() => goTo(position.resumeIndex ?? 0)}>
              {bi("이어서 보기", "Resume")}
            </button>
            <button type="button" className={CONTROL_BUTTON} onClick={position.dismissResume} aria-label={bi("이어보기 안내 닫기", "Dismiss resume prompt")}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {returnPoint && !presenting ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft/25 px-4 py-3 text-sm text-fg-2" role="status">
            <Undo2 size={16} className="text-accent" aria-hidden="true" />
            <span className="flex-1">{bi("질문에 답하려고 도감 부록의 카드를 열었습니다.", "You opened an atlas card from the talk to answer a question.")}</span>
            <button type="button" className={CONTROL_BUTTON} onClick={returnPoint.onReturn}>{returnPoint.label}</button>
          </div>
        ) : null}

        {notice && !presenting ? (
          <p className="rounded-2xl border border-accent/25 bg-accent-soft/25 px-4 py-3 text-sm leading-6 text-fg-2" role="status">{notice}</p>
        ) : null}

        {empty || !slide ? (
          <EmptyAtlasState onShowTalk={() => position.setTrack("talk")} />
        ) : (
          <div className={cx("grid gap-4", sidePanelOpen && "xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start")}>
            <div ref={stageRef} data-deck-stage="true" className="grid min-w-0 scroll-mt-28 gap-3">
              {presenting ? (
                <div className="grid aspect-video place-items-center rounded-3xl border border-dashed border-line-strong bg-card/50 p-6 text-center">
                  <p className="text-sm font-bold text-fg-2">{bi("발표 화면이 열려 있습니다. Esc로 돌아옵니다.", "The presentation is open. Press Esc to return.")}</p>
                </div>
              ) : (
                <EngineeringDeckSlide slide={slide} index={index} total={model.slides.length} sections={model.sections} />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <SlideNavigator model={model} index={index} onGo={goTo} onGoCard={goToCard} />
                <div className="flex flex-wrap gap-2">
                  <ToolbarButton label={bi("개요", "Overview")} shortcut="O" pressed={overviewOpen} onClick={toggleOverview}><LayoutGrid size={16} aria-hidden="true" /></ToolbarButton>
                  <ToolbarButton label={bi("발표자 노트", "Speaker notes")} shortcut="N" pressed={sidePanelOpen} onClick={() => setSidePanelOpen((open) => !open)}>
                    {sidePanelOpen ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
                  </ToolbarButton>
                  <ToolbarButton label={bi("단축키", "Shortcuts")} shortcut="?" pressed={helpOpen} onClick={toggleHelp}><Keyboard size={16} aria-hidden="true" /></ToolbarButton>
                </div>
              </div>
              <div className="grid gap-2 rounded-2xl border border-line/70 bg-card/50 px-4 py-3">
                <p className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-fg-3">
                  <span>
                    {section ? `${String(section.order).padStart(2, "0")} · ${section.title}` : bi(trackMeta.label.ko, trackMeta.label.en)}
                    {section && timed ? ` · ${formatClock(section.seconds)}` : ""}
                  </span>
                  <span className="font-display tabular-nums">{index + 1} / {model.slides.length}</span>
                </p>
                <DeckSectionStrip model={model} index={index} />
              </div>
              {jump.buffer ? (
                <p className="text-xs font-bold text-accent" role="status">
                  {formatI18nTemplate(String(bi("{value0}번으로 이동: Enter", "Go to {value0}: Enter")), { value0: jump.buffer })}
                </p>
              ) : null}
              {helpOpen ? (
                <div className="rounded-3xl border border-line/70 bg-card/65 p-5" role="region" aria-label={bi("단축키 도움말", "Shortcut help")}>
                  <p className="mb-3 text-sm font-black text-fg">{bi("발표 단축키 (입력 칸 밖에서 동작)", "Presentation shortcuts (outside text fields)")}</p>
                  <DeckShortcutList />
                </div>
              ) : null}
            </div>

            {sidePanelOpen ? (
              <aside className="rounded-3xl border border-line/70 bg-panel/60 p-3" aria-labelledby={panelHeadingId}>
                <DeckPresenterPanel model={model} index={index} timer={timer} onJump={goTo} onOpenAtlas={openAtlasCard} returnPoint={returnPoint} headingId={panelHeadingId} />
              </aside>
            ) : (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line/70 bg-card/50 p-3">
                <DeckClock timer={timer} slide={slide} section={section} totalSeconds={model.totalSeconds} compact />
                <DeckTimerControls timer={timer} />
              </div>
            )}
          </div>
        )}

        {overviewOpen && !presenting && !empty ? (
          <div ref={overviewRef} className="scroll-mt-28 rounded-3xl border border-line/70 bg-panel/60 p-4" role="region" aria-label={bi("슬라이드 개요", "Slide overview")}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm font-black text-fg">{bi("슬라이드 개요 · 누르면 이동", "Slide overview · select to jump")}</p>
              <button type="button" className={CONTROL_BUTTON} onClick={() => setOverviewOpen(false)}>
                <X size={15} aria-hidden="true" />
                {bi("닫기", "Close")}
              </button>
            </div>
            <DeckOverview model={model} index={index} onSelect={(slideIndex) => { goTo(slideIndex); setOverviewOpen(false); }} />
          </div>
        ) : null}
      </section>

      {timed ? (
        <DeckSlideIndex
          model={model}
          index={index}
          onJump={(slideIndex) => {
            goTo(slideIndex);
            stageRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
          }}
        />
      ) : null}

      <ServiceStoryJourney current="deck" className="mt-8" />

      {position.track === "talk" ? <EngineeringSeminarPrep model={model} onJump={goTo} onOpenAtlas={openAtlasCard} /> : null}
      <WorkshopModules />
      <EngineeringSeminarResources />
      <EngineeringFreeAiTokenGuide />

      <PrintDeck slides={scope.slides} firstIndex={scope.firstIndex} total={model.slides.length} sections={model.sections} />

      {presenting && slide ? (
        <PresentationLayer
          model={model}
          index={index}
          timer={timer}
          onGo={goTo}
          onGoCard={goToCard}
          onOpenAtlas={openAtlasCard}
          returnPoint={returnPoint}
          notesOpen={notesOpen}
          onToggleNotes={() => setNotesOpen((open) => !open)}
          overviewOpen={overviewOpen}
          onToggleOverview={toggleOverview}
          blackout={blackout}
          onToggleBlackout={() => setBlackout((value) => !value)}
          helpOpen={helpOpen}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          onExit={exitPresentation}
          notice={notice}
          jumpBuffer={jump.buffer}
        />
      ) : null}
    </EngineeringPageFrame>
  );
}
