/**
 * Wave 40F — 첫 접속 온보딩 2.5D 디오라마 · 60초 첫 컷 체험 · 창작자 성향 맞춤 매처 패널.
 *
 * - 실존 `/assets/atelier/` WebP 자산 직접 렌더링 (4장 디오라마 + 주얼 + 브러시 + 종이 + 배경 + 공방)
 * - Calm Atelier 시맨틱 토큰 전용 (원시 hex/rgb/hsl 0건 · Web Storage 0건 · 기본 빈 객체 props 미사용)
 * - `prefers-reduced-motion` 시 2.5D 틸트/오프셋 0deg·0px 완전 고정
 */

import {
  ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock, Compass, Eye, EyeOff,
  Layers, PenTool, Play, RotateCcw, SlidersHorizontal,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent, type ReactElement } from "react";

import {
  CREATOR_DEVICE_OPTIONS, CREATOR_GENRE_OPTIONS, CREATOR_GOAL_OPTIONS, CREATOR_MEDIUM_OPTIONS,
  DEFAULT_CREATOR_MATCHER_ANSWERS, FIRST_CUT_SPRINT_STEPS, ONBOARDING_DIORAMA_CHAPTERS,
  computeDioramaParallax, countFirstCutDialogueGraphemes, createInitialDioramaState, createInitialFirstCutSprint,
  getDioramaChapterById, matchCreatorStarterPrescription, normalizePointerInRect,
  recordFirstCutAction, summarizeFirstCutSprint, transitionDioramaChapter,
  type CreatorMatcherAnswers, type CreatorStarterPrescription, type DioramaChapterId,
  type DioramaChapterSpec, type DioramaState, type FirstCutCanvasPreset,
  type FirstCutSprintState, type FirstCutSprintSummary, type MatcherOptionSpec,
} from "./onboarding-diorama-engine";

export interface StudioOnboardingDioramaPanelProps {
  readonly initialChapterId?: DioramaChapterId;
  readonly initialAnswers?: Partial<CreatorMatcherAnswers>;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly prefersReducedMotionOverride?: boolean;
  /** 모두 예제 선택·체크 알림이며 실제 원고·설정 적용이나 저장 완료 응답이 아니다. */
  readonly onChapterChange?: (chapter: DioramaChapterSpec) => void | Promise<void>;
  readonly onPrescriptionApply?: (prescription: CreatorStarterPrescription) => void | Promise<void>;
  readonly onSprintComplete?: (summary: FirstCutSprintSummary) => void | Promise<void>;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_SOLID = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;
const TAB_BASE = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

const CANVAS_PRESET_OPTIONS: readonly { readonly id: FirstCutCanvasPreset; readonly labelKo: string; readonly labelEn: string }[] = [
  { id: "scroll-9-16", labelKo: "9:16 세로 스크롤", labelEn: "9:16 Vertical Scroll" },
  { id: "page-3-4", labelKo: "3:4 단행본 컷", labelEn: "3:4 Page Cut" },
  { id: "square-1-1", labelKo: "1:1 SNS 컷", labelEn: "1:1 Square Cut" },
];

function detectSystemReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface MatcherQuestionFieldsetProps<T extends string> {
  readonly legend: string;
  readonly testIdPrefix: string;
  readonly options: readonly MatcherOptionSpec<T>[];
  readonly selectedId: T;
  readonly isEn: boolean;
  readonly columnsClass: string;
  readonly onSelect: (id: T) => void;
}

function MatcherQuestionFieldset<T extends string>({
  legend, testIdPrefix, options, selectedId, isEn, columnsClass, onSelect,
}: MatcherQuestionFieldsetProps<T>): ReactElement {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-bold text-fg">{legend}</legend>
      <div className={`grid gap-2 ${columnsClass}`}>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            data-testid={`${testIdPrefix}-${opt.id}`}
            aria-pressed={selectedId === opt.id}
            onClick={() => onSelect(opt.id)}
            className={`${selectedId === opt.id ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start px-3 py-2 text-left`}
          >
            <span className="font-semibold">{isEn ? opt.labelEn : opt.labelKo}</span>
            <span className="text-[11px] font-normal text-fg-2">{isEn ? opt.hintEn : opt.hintKo}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

interface PrescriptionAssetTileProps {
  readonly src: string;
  readonly alt: string;
  readonly imgTestId: string;
  readonly labelTestId: string;
  readonly categoryLabel: string;
  readonly title: string;
  readonly detail: string;
}

function PrescriptionAssetTile({
  src, alt, imgTestId, labelTestId, categoryLabel, title, detail,
}: PrescriptionAssetTileProps): ReactElement {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel">
      <img src={src} alt={alt} data-testid={imgTestId} className="aspect-[4/3] w-full object-cover" />
      <div className="space-y-0.5 p-2">
        <div className="text-[10px] font-semibold text-fg-3">{categoryLabel}</div>
        <div data-testid={labelTestId} className="text-[11px] font-bold text-fg">{title}</div>
        <div className="text-[10px] text-fg-2 tabular-nums">{detail}</div>
      </div>
    </div>
  );
}

/** Wave 40F 절차적 2.5D 온보딩 디오라마 · 60초 첫 컷 체험 · 창작자 맞춤 매처 통합 패널. */
export function StudioOnboardingDioramaPanel(props: StudioOnboardingDioramaPanelProps): ReactElement {
  const {
    initialChapterId = "first-cut-desk",
    initialAnswers,
    locale = "ko",
    className,
    prefersReducedMotionOverride,
    onChapterChange,
    onPrescriptionApply,
    onSprintComplete,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [systemReducedMotion, setSystemReducedMotion] = useState<boolean>(() => detectSystemReducedMotion());
  const [manualReducedMotion, setManualReducedMotion] = useState<boolean | null>(null);
  const reducedMotion = manualReducedMotion ?? prefersReducedMotionOverride ?? systemReducedMotion;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent): void => setSystemReducedMotion(event.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handleChange);
      return () => mq.removeEventListener("change", handleChange);
    }
    return undefined;
  }, []);

  const [diorama, setDiorama] = useState<DioramaState>(() => createInitialDioramaState(initialChapterId));
  const [pointerCoords, setPointerCoords] = useState<{ readonly x: number; readonly y: number; readonly active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });
  const [sprint, setSprint] = useState<FirstCutSprintState>(() => createInitialFirstCutSprint());
  const [answers, setAnswers] = useState<CreatorMatcherAnswers>(() => ({
    genre: initialAnswers?.genre ?? DEFAULT_CREATOR_MATCHER_ANSWERS.genre,
    goal: initialAnswers?.goal ?? DEFAULT_CREATOR_MATCHER_ANSWERS.goal,
    device: initialAnswers?.device ?? DEFAULT_CREATOR_MATCHER_ANSWERS.device,
    medium: initialAnswers?.medium ?? DEFAULT_CREATOR_MATCHER_ANSWERS.medium,
  }));
  const [appliedBanner, setAppliedBanner] = useState<string>("");
  const [notification, setNotification] = useState({ status: "idle", message: "" });
  const pendingRef = useRef(false);
  const retryRef = useRef<(() => void) | null>(null);

  function notifyExample(message: string, callbacks: readonly (() => void | Promise<void>)[]): void {
    if (pendingRef.current) return;
    let callbackIndex = 0;
    function finish(failed: boolean): void {
      pendingRef.current = false;
      if (!failed) retryRef.current = null;
      setNotification({ status: failed ? "failed" : "notified", message: failed
        ? pick("예제 알림 처리에 실패했어요. 다시 시도할 수 있어요.", "Example notification failed. You can retry.")
        : `${message} ${pick("실제 적용·저장 완료를 뜻하지 않아요.", "This does not confirm applying or saving.")}` });
    }
    function runCallbacks(start = 0): void | Promise<void> {
      for (let index = start; index < callbacks.length; index += 1) {
        callbackIndex = index;
        const result = callbacks[index]?.();
        if (result) return result.then(() => {
          callbackIndex = index + 1;
          return runCallbacks(index + 1);
        });
        callbackIndex = index + 1;
      }
    }
    retryRef.current = () => notifyExample(message, callbacks.slice(callbackIndex));
    pendingRef.current = true;
    try {
      const result = runCallbacks();
      if (result) {
        setNotification({ status: "pending", message: pick("예제 알림 처리 중이에요.", "Processing example notification.") });
        void result.then(() => finish(false), () => finish(true));
      } else finish(false);
    } catch { finish(true); }
  }

  function clearNotification(): void {
    retryRef.current = null;
    setNotification({ status: "idle", message: "" });
  }

  function updateAnswers(patch: Partial<CreatorMatcherAnswers>): void {
    if (pendingRef.current) return;
    setAnswers((prev) => ({ ...prev, ...patch }));
    setAppliedBanner("");
    clearNotification();
  }

  const activeChapter = useMemo(() => getDioramaChapterById(diorama.activeChapterId), [diorama.activeChapterId]);
  const activeHotspot = useMemo(
    () => activeChapter.hotspots.find((item) => item.hotspotId === diorama.selectedHotspotId) ?? activeChapter.hotspots[0]!,
    [activeChapter, diorama.selectedHotspotId],
  );
  const parallax = useMemo(
    () =>
      computeDioramaParallax({
        normalizedX: pointerCoords.x,
        normalizedY: pointerCoords.y,
        prefersReducedMotion: reducedMotion,
        isPointerActive: pointerCoords.active,
        depthProfile: activeChapter.depthProfile,
      }),
    [activeChapter.depthProfile, pointerCoords.active, pointerCoords.x, pointerCoords.y, reducedMotion],
  );
  const prescription = useMemo(() => matchCreatorStarterPrescription(answers), [answers]);
  const sprintSummary = useMemo(() => summarizeFirstCutSprint(sprint), [sprint]);
  const dialogueCount = useMemo(() => countFirstCutDialogueGraphemes(sprint.balloonDraftKo), [sprint.balloonDraftKo]);
  const activeSprintStep = FIRST_CUT_SPRINT_STEPS[sprint.activeStepIndex] ?? FIRST_CUT_SPRINT_STEPS[0]!;

  const dispatchChapter = (nextState: DioramaState): void => {
    if (pendingRef.current) return;
    setDiorama(nextState);
    if (nextState.activeChapterId !== diorama.activeChapterId) {
      const chapter = getDioramaChapterById(nextState.activeChapterId);
      notifyExample(pick("챕터 예제를 선택했어요.", "Selected a chapter example."), onChapterChange ? [() => onChapterChange(chapter)] : []);
    }
  };

  const handleStagePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (reducedMotion) {
      if (pointerCoords.active || pointerCoords.x !== 0 || pointerCoords.y !== 0) {
        setPointerCoords({ x: 0, y: 0, active: false });
      }
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const { normalizedX, normalizedY } = normalizePointerInRect(event.clientX, event.clientY, {
      left: rect.left,
      top: rect.top,
      width: rect.width || 320,
      height: rect.height || 180,
    });
    setPointerCoords({ x: normalizedX, y: normalizedY, active: true });
  };

  const dispatchSprint = (action: Parameters<typeof recordFirstCutAction>[1]): void => {
    if (pendingRef.current) return;
    if (action.type === "reset") clearNotification();
    const wasCompleted = sprint.status === "completed";
    const next = recordFirstCutAction(sprint, action);
    setSprint(next);
    if (!wasCompleted && next.status === "completed") {
      const summary = summarizeFirstCutSprint(next);
      notifyExample(pick("예제 단계 체크를 마쳤어요.", "Example steps checked."), onSprintComplete ? [() => onSprintComplete(summary)] : []);
    }
  };

  const handleApplyPrescription = (): void => {
    if (pendingRef.current) return;
    const next = transitionDioramaChapter(diorama, { type: "select", chapterId: prescription.recommendedChapterId });
    setDiorama(next);
    const callbacks: (() => void | Promise<void>)[] = [];
    if (next.activeChapterId !== diorama.activeChapterId && onChapterChange) callbacks.push(() => onChapterChange(getDioramaChapterById(next.activeChapterId)));
    if (onPrescriptionApply) callbacks.push(() => onPrescriptionApply(prescription));
    notifyExample(pick("추천 구성을 선택했어요.", "Selected a suggested configuration."), callbacks);
    setAppliedBanner(
      pick(
        `「${prescription.archetypeTitleKo}」 추천 예제 선택 · ${prescription.brush.labelKo} + ${prescription.paper.labelKo} + ${prescription.background.labelKo} → ${prescription.workspaceRoute.path} (실제 설정 미반영)`,
        `Selected example "${prescription.archetypeTitleEn}" · ${prescription.brush.labelEn} + ${prescription.paper.labelEn} → ${prescription.workspaceRoute.path} (settings unchanged)`,
      ),
    );
  };

  return (
    <section
      data-testid="onboarding-diorama-panel"
      aria-busy={notification.status === "pending"}
      aria-label={pick("절차적 2.5D 온보딩 디오라마 · 60초 첫 컷 체험 · 창작자 성향 맞춤 매처", "Procedural 2.5D Onboarding Diorama, 60s First Cut Sprint & Creator Style Matcher")}
      className={`space-y-5 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] sm:p-5 ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-fg-2">
            <Compass className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("Wave 40F · 아틀리에 2.5D 온보딩 디오라마 & 맞춤 매처", "Wave 40F · Atelier 2.5D Onboarding Diorama & Matcher")}</span>
          </div>
          <h2 className="text-base font-bold text-fg sm:text-lg">
            {pick("온보딩 구성 예제 · 60초 합성 예산 · 스타터 매처", "Onboarding Examples · 60s Synthetic Budget · Starter Matcher")}
          </h2>
          <p className="max-w-2xl text-xs leading-relaxed text-fg-2">
            {pick(
              "4장 삽화와 단계 체크로 작업 순서를 살펴보고, 4문항 규칙으로 브러시·종이·배경·관련 화면 추천을 비교해요.",
              "Explore four illustrations and example step checks, then compare brush, paper, backdrop and route suggestions from four fixed questions.",
            )}
          </p>
          <p data-testid="onboarding-scope-notice" className="text-xs text-fg-3">
            {pick("소개용 삽화·고정 규칙·단계 체크 예제예요. 시간은 합성 예산이며 실제 원고·설정·기기·저장에는 연결하지 않았어요. 입력 대사는 메모리에서만 유지되며 패널을 닫거나 다시 마운트하면 사라져요. 관련 화면은 입력 보존을 위해 새 탭으로 열어요.", "Illustrations, fixed rules and step checks are examples. Times are synthetic budgets; no manuscript, settings, device or storage is connected. Dialogue exists only in memory until this panel closes or remounts. Related routes open in a new tab to preserve this input.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div data-testid="diorama-visit-progress" className="rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg tabular-nums">
            {pick("탐색", "Visited")} {diorama.visitedChapterIds.length}/{ONBOARDING_DIORAMA_CHAPTERS.length}
          </div>
          <button
            type="button"
            data-testid="toggle-reduced-motion-btn"
            aria-pressed={reducedMotion}
            onClick={() => setManualReducedMotion(!reducedMotion)}
            className={reducedMotion ? BTN_ACTIVE : BTN_OUTLINE}
          >
            {reducedMotion ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{reducedMotion ? pick("모션 줄이기 고정 (0deg)", "Reduced Motion Locked") : pick("2.5D 패럴랙스 활성", "2.5D Parallax Active")}</span>
          </button>
        </div>
      </header>

      {notification.message ? <div role={notification.status === "failed" ? "alert" : "status"} data-testid="onboarding-notification-status" className="text-xs text-fg-2">
        {notification.message}
        {notification.status === "failed" ? <button type="button" data-testid="onboarding-notification-retry" onClick={() => retryRef.current?.()} className={BTN_OUTLINE}>{pick("알림 다시 시도", "Retry notification")}</button> : null}
      </div> : null}
      <fieldset disabled={notification.status === "pending"} className="m-0 min-w-0 space-y-5 border-0 p-0">

      {/* 1. 4장 인터랙티브 2.5D 디오라마 스테이지 */}
      <div className="space-y-3 rounded-xl border border-line bg-card p-3.5 sm:p-4">
        <div className="grid gap-2 lg:flex lg:flex-wrap lg:items-center lg:justify-between">
          <div role="tablist" aria-label={pick("온보딩 디오라마 4장 챕터", "Onboarding Diorama Chapters")} className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-4">
            {ONBOARDING_DIORAMA_CHAPTERS.map((chapter) => {
              const selected = chapter.id === activeChapter.id;
              return (
                <button
                  key={chapter.id}
                  id={`${uid}-chapter-tab-${chapter.id}`}
                  data-testid={`chapter-tab-${chapter.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${uid}-chapter-panel`}
                  onClick={() => dispatchChapter(transitionDioramaChapter(diorama, { type: "select", chapterId: chapter.id }))}
                  className={`${TAB_BASE} ${selected ? "border-accent bg-accent text-on-accent" : "border-line bg-panel text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"}`}
                >
                  <span className="tabular-nums">{chapter.chapterNumber}.</span>
                  <span>{isEn ? chapter.titleEn : chapter.titleKo}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-end gap-1.5">
            <button type="button" data-testid="chapter-prev-btn" aria-label={pick("이전 챕터", "Previous chapter")} onClick={() => dispatchChapter(transitionDioramaChapter(diorama, { type: "prev", wrap: true }))} className={BTN_OUTLINE}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" data-testid="chapter-next-btn" aria-label={pick("다음 챕터", "Next chapter")} onClick={() => dispatchChapter(transitionDioramaChapter(diorama, { type: "next", wrap: true }))} className={BTN_OUTLINE}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div id={`${uid}-chapter-panel`} role="tabpanel" aria-labelledby={`${uid}-chapter-tab-${activeChapter.id}`} className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <div
            data-testid="onboarding-diorama-stage"
            onPointerMove={handleStagePointerMove}
            onPointerLeave={() => setPointerCoords({ x: 0, y: 0, active: false })}
            className="relative overflow-hidden rounded-xl border border-line bg-canvas p-3"
          >
            <img
              src={activeChapter.ambientPaperSrc}
              alt=""
              aria-hidden="true"
              data-testid="diorama-bg-paper-img"
              style={{ transform: parallax.backgroundTransformCss }}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20 transition-transform duration-200 ease-out motion-reduce:transition-none"
            />
            <div
              data-testid="diorama-tilt-frame"
              style={{ transform: parallax.stageTransformCss }}
              className="relative overflow-hidden rounded-lg border border-line bg-panel transition-transform duration-200 ease-out motion-reduce:transition-none"
            >
              <img
                src={activeChapter.dioramaImageSrc}
                alt={isEn ? `${activeChapter.titleEn} atelier diorama illustration` : `${activeChapter.titleKo} 아틀리에 온보딩 디오라마`}
                data-testid="diorama-hero-img"
                style={{ transform: parallax.midgroundTransformCss }}
                className="aspect-[16/9] w-full object-cover transition-transform duration-200 ease-out motion-reduce:transition-none"
              />
              <div
                data-testid="diorama-jewel-badge"
                style={{ transform: parallax.jewelTransformCss }}
                className="absolute right-3 bottom-3 flex items-center gap-2 rounded-xl border border-line-strong bg-panel/95 p-2 shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
              >
                <img
                  src={activeChapter.jewelImageSrc}
                  alt={isEn ? `${activeChapter.titleEn} studio jewel emblem` : `${activeChapter.titleKo} 아틀리에 주얼 아이콘`}
                  data-testid="diorama-jewel-img"
                  className="h-11 w-11 rounded-lg border border-line bg-canvas object-cover"
                />
                <div className="pr-1 text-left">
                  <div className="text-[11px] font-semibold text-accent">{isEn ? activeChapter.badgeEn : activeChapter.badgeKo}</div>
                  <div className="text-xs font-bold text-fg">{isEn ? activeChapter.titleEn : activeChapter.titleKo}</div>
                </div>
              </div>
            </div>
            <div className="relative mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[11px] text-fg-2 tabular-nums">
              <span data-testid="parallax-tilt-readout">{pick("틸트", "Tilt")} X {parallax.rotateXDeg}deg · Y {parallax.rotateYDeg}deg</span>
              <span data-testid="parallax-depth-readout">FG {parallax.foreground.translateXPx}px · MG {parallax.midground.translateXPx}px · BG {parallax.background.translateXPx}px</span>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-panel p-3.5">
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-accent">{isEn ? activeChapter.badgeEn : activeChapter.badgeKo}</div>
                <h3 data-testid="active-chapter-title" className="text-base font-bold text-fg">{isEn ? activeChapter.titleEn : activeChapter.titleKo}</h3>
                <p className="text-xs font-medium text-fg">{isEn ? activeChapter.subtitleEn : activeChapter.subtitleKo}</p>
                <p className="text-xs leading-relaxed text-fg-2">{isEn ? activeChapter.summaryEn : activeChapter.summaryKo}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(isEn ? activeChapter.capabilityChipsEn : activeChapter.capabilityChipsKo).map((chip) => (
                  <span key={chip} className="rounded-md border border-line bg-card px-2 py-1 text-[11px] font-medium text-fg-2">{chip}</span>
                ))}
              </div>
              <div className="space-y-2 border-t border-line pt-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3">
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("디오라마 깊이 포인트 살펴보기", "Inspect Diorama Depth Points")}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeChapter.hotspots.map((hotspot) => (
                    <button
                      key={hotspot.hotspotId}
                      type="button"
                      data-testid={`hotspot-btn-${hotspot.hotspotId}`}
                      aria-pressed={hotspot.hotspotId === activeHotspot.hotspotId}
                      onClick={() => setDiorama((prev) => transitionDioramaChapter(prev, { type: "select-hotspot", hotspotId: hotspot.hotspotId }))}
                      className={hotspot.hotspotId === activeHotspot.hotspotId ? BTN_ACTIVE : BTN_OUTLINE}
                    >
                      <span>{isEn ? hotspot.labelEn : hotspot.labelKo}</span>
                    </button>
                  ))}
                </div>
                <p data-testid="active-hotspot-detail" className="rounded-lg border border-line bg-card px-3 py-2 text-xs leading-relaxed text-fg-2">
                  <strong className="mr-1.5 font-semibold text-fg">{isEn ? activeHotspot.labelEn : activeHotspot.labelKo}</strong>
                  {isEn ? activeHotspot.detailEn : activeHotspot.detailKo}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <span className="font-mono text-[11px] text-fg-3">{activeChapter.recommendedRoute}</span>
              <a href={activeChapter.recommendedRoute} target="_blank" rel="noopener noreferrer" data-testid="chapter-launch-link" className={BTN_SOLID}>
                <span>{isEn ? activeChapter.ctaLabelEn : activeChapter.ctaLabelKo}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 60초 첫 컷 체험 시뮬레이터 */}
      <div data-testid="first-cut-sprint-section" className="space-y-3 rounded-xl border border-line bg-card p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("60초 첫 컷 체험 시뮬레이터", "60-Second First Cut Simulator")}</span>
            </div>
            <p className="text-xs text-fg-2">
              {pick("컷 틀·펜선·배경·저장 확인 항목을 예제 상태로 체크해요. 버튼은 실제 획을 그리거나 원고를 저장하지 않아요.", "Check sample frame, ink, backdrop and save-guide steps. Buttons do not draw strokes or save a manuscript.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 tabular-nums">
            <span data-testid="sprint-remaining-readout" className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-bold text-fg">
              {pick("남은 합성 예산", "Remaining synthetic budget")} {sprint.remainingSec}s / 60s
            </span>
            <span data-testid="sprint-stroke-readout" className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-semibold text-fg-2">
              {pick("펜선", "Strokes")} {sprint.strokeCount}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-fg-2 tabular-nums">
            <span data-testid="sprint-status-text">{isEn ? sprintSummary.summaryEn : sprintSummary.summaryKo}</span>
            <span className="font-bold text-accent">{sprint.progressPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
            <div data-testid="sprint-progress-bar" style={{ width: `${sprint.progressPercent}%` }} className="h-full rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none" />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {FIRST_CUT_SPRINT_STEPS.map((step, index) => {
            const done = sprint.completedStepIds.includes(step.id);
            const isCurrent = !done && index === sprint.activeStepIndex;
            return (
              <div
                key={step.id}
                data-testid={`sprint-step-${step.id}`}
                className={`flex flex-col justify-between gap-2 rounded-lg border p-3 ${done ? "border-good/40 bg-good-soft" : isCurrent ? "border-accent bg-panel" : "border-line bg-panel"}`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] tabular-nums">
                    <span className="font-semibold text-fg-3">{step.windowStartSec}–{step.windowEndSec}s</span>
                    {done && <CheckCircle2 className="h-3.5 w-3.5 text-good" aria-hidden="true" />}
                  </div>
                  <div className="text-xs font-bold text-fg">{isEn ? step.titleEn : step.titleKo}</div>
                  <p className="text-[11px] leading-relaxed text-fg-2">{isEn ? step.guideEn : step.guideKo}</p>
                </div>
                <button
                  type="button"
                  data-testid={`sprint-complete-${step.id}`}
                  disabled={done}
                  onClick={() => dispatchSprint({ type: "complete-step", stepId: step.id })}
                  className={done ? BTN_OUTLINE : isCurrent ? BTN_SOLID : BTN_OUTLINE}
                >
                  <span>{done ? pick("완료됨", "Completed") : isEn ? step.actionLabelEn : step.actionLabelKo}</span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 rounded-lg border border-line bg-panel p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-fg-3">{pick("컷 비율 선택", "Cut Aspect Ratio")}</div>
            <div className="flex flex-wrap gap-1.5">
              {CANVAS_PRESET_OPTIONS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`sprint-preset-${preset.id}`}
                  aria-pressed={sprint.canvasPreset === preset.id}
                  onClick={() => dispatchSprint({ type: "set-canvas-preset", preset: preset.id })}
                  className={sprint.canvasPreset === preset.id ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {isEn ? preset.labelEn : preset.labelKo}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <label htmlFor={`${uid}-first-cut-balloon`} className="block text-[11px] font-semibold text-fg-2">
                {pick("첫 컷 말풍선 대사", "First Cut Balloon Line")}
              </label>
              <input
                id={`${uid}-first-cut-balloon`}
                data-testid="sprint-balloon-input"
                type="text"
                value={sprint.balloonDraftKo}
                onChange={(event) => dispatchSprint({ type: "set-balloon", text: event.target.value })}
                className={`min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg ${FOCUS_RING}`}
              />
              <p data-testid="sprint-dialogue-count" className="text-[11px] text-fg-3 tabular-nums">{dialogueCount === null ? pick("글자 수 계산 미지원 · 원문 유지", "Grapheme counting unavailable; text preserved") : pick(`입력 ${dialogueCount}글자 · 자동 절단 없음`, `${dialogueCount} graphemes; no truncation`)}</p>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-2">
            <div className="rounded-lg border border-line bg-canvas p-2.5 text-xs text-fg-2">
              <div className="font-semibold text-fg">
                {pick("현재 단계 안내", "Active Step Guide")} · {isEn ? activeSprintStep.titleEn : activeSprintStep.titleKo}
              </div>
              <div className="mt-1">
                {pick("말풍선 미리보기:", "Balloon preview:")}{" "}
                <span data-testid="sprint-balloon-preview" className="font-semibold text-fg">
                  「{sprint.balloonDraftKo || pick("대사를 입력하세요", "Enter dialogue")}」
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="sprint-add-stroke-btn" onClick={() => dispatchSprint({ type: "add-stroke", count: 3 })} className={BTN_OUTLINE}>
                <PenTool className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("예제 획 수 +3", "Add 3 sample strokes")}</span>
              </button>
              <button type="button" data-testid="sprint-instant-complete-btn" onClick={() => dispatchSprint({ type: "complete-all-instant" })} className={BTN_SOLID}>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("예제 4단계 모두 체크", "Check all 4 example steps")}</span>
              </button>
              <button type="button" data-testid="sprint-reset-btn" onClick={() => dispatchSprint({ type: "reset" })} className={BTN_OUTLINE}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("단계 초기화 · 대사 유지", "Reset steps; keep dialogue")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 창작자 성향 4문항 인터랙티브 매처 + 원클릭 추천 스튜디오 처방 카드 */}
      <div data-testid="creator-style-matcher-section" className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-xl border border-line bg-card p-3.5 sm:p-4">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-bold text-fg">{pick("창작자 성향 4문항 맞춤 스타터 매처", "4-Question Creator Starter Matcher")}</h3>
              <p className="text-[11px] text-fg-2">
                {pick("장르·목표·기기·선호 화구를 고르면 브러시·종이·배경·작업실 경로가 즉시 재계산됩니다.", "Pick genre, goal, device, and medium to generate a tailored brush, paper, backdrop, and studio route.")}
              </p>
            </div>
          </div>
          <MatcherQuestionFieldset legend={pick("1. 주로 그리고 싶은 장르", "1. Primary Genre")} testIdPrefix="matcher-genre" options={CREATOR_GENRE_OPTIONS} selectedId={answers.genre} isEn={isEn} columnsClass="grid-cols-2" onSelect={(genre) => updateAnswers({ genre })} />
          <MatcherQuestionFieldset legend={pick("2. 오늘 가장 먼저 끝내고 싶은 목표", "2. First Session Goal")} testIdPrefix="matcher-goal" options={CREATOR_GOAL_OPTIONS} selectedId={answers.goal} isEn={isEn} columnsClass="grid-cols-2" onSelect={(goal) => updateAnswers({ goal })} />
          <MatcherQuestionFieldset legend={pick("3. 주로 쓰는 작업 기기", "3. Primary Device")} testIdPrefix="matcher-device" options={CREATOR_DEVICE_OPTIONS} selectedId={answers.device} isEn={isEn} columnsClass="grid-cols-2" onSelect={(device) => updateAnswers({ device })} />
          <MatcherQuestionFieldset legend={pick("4. 손에 가장 잘 맞는 선호 화구", "4. Preferred Drawing Medium")} testIdPrefix="matcher-medium" options={CREATOR_MEDIUM_OPTIONS} selectedId={answers.medium} isEn={isEn} columnsClass="grid-cols-2 sm:grid-cols-3" onSelect={(medium) => updateAnswers({ medium })} />
        </div>

        <div data-testid="starter-prescription-card" className="flex flex-col justify-between gap-4 rounded-xl border border-accent/40 bg-card p-3.5 sm:p-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
              <div className="space-y-0.5">
                <div className="text-[11px] font-semibold text-accent">{pick("맞춤 아틀리에 처방 카드", "Tailored Atelier Prescription")}</div>
                <h3 data-testid="prescription-archetype" className="text-base font-bold text-fg">
                  {isEn ? prescription.archetypeTitleEn : prescription.archetypeTitleKo}
                </h3>
              </div>
              <div data-testid="prescription-fit-score" className="rounded-lg border border-good/40 bg-good-soft px-2.5 py-1 text-xs font-bold text-good tabular-nums">
                {pick("규칙 적합도", "Rule Fit")} {prescription.fitScorePct}%
              </div>
            </div>

            <p className="text-xs leading-relaxed text-fg-2">{isEn ? prescription.rationaleEn : prescription.rationaleKo}</p>

            <div className="grid grid-cols-3 gap-2">
              <PrescriptionAssetTile
                src={prescription.brush.imageSrc}
                alt={isEn ? prescription.brush.labelEn : prescription.brush.labelKo}
                imgTestId="prescription-brush-img"
                labelTestId="prescription-brush-label"
                categoryLabel={pick("추천 브러시", "Brush")}
                title={isEn ? prescription.brush.labelEn : prescription.brush.labelKo}
                detail={`${prescription.brush.tipSizePx}px · ${pick("보정", "Stab.")} ${prescription.brush.stabilizationPct}%`}
              />
              <PrescriptionAssetTile
                src={prescription.paper.imageSrc}
                alt={isEn ? prescription.paper.labelEn : prescription.paper.labelKo}
                imgTestId="prescription-paper-img"
                labelTestId="prescription-paper-label"
                categoryLabel={pick("종이 질감", "Paper")}
                title={isEn ? prescription.paper.labelEn : prescription.paper.labelKo}
                detail={`${pick("요철", "Grain")} ${prescription.paper.grainStrengthPct}%`}
              />
              <PrescriptionAssetTile
                src={prescription.background.imageSrc}
                alt={isEn ? prescription.background.labelEn : prescription.background.labelKo}
                imgTestId="prescription-background-img"
                labelTestId="prescription-background-label"
                categoryLabel={pick("시작 배경", "Backdrop")}
                title={isEn ? prescription.background.labelEn : prescription.background.labelKo}
                detail={isEn ? prescription.background.moodLabelEn : prescription.background.moodLabelKo}
              />
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel p-2.5">
              <img
                src={prescription.space.imageSrc}
                alt={isEn ? prescription.space.labelEn : prescription.space.labelKo}
                data-testid="prescription-space-img"
                className="h-12 w-16 shrink-0 rounded-md border border-line object-cover"
              />
              <div className="space-y-0.5 text-xs">
                <div className="font-bold text-fg">
                  {pick("추천 공방 무드:", "Recommended Space:")} {isEn ? prescription.space.labelEn : prescription.space.labelKo}
                </div>
                <p className="text-[11px] leading-relaxed text-fg-2">
                  {isEn ? prescription.deviceOptimizationEn : prescription.deviceOptimizationKo}
                </p>
              </div>
            </div>

            <ul className="space-y-1.5 rounded-lg border border-line bg-canvas p-3 text-xs text-fg-2">
              {(isEn ? prescription.checklistEn : prescription.checklistKo).map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-fg-2">{pick("추천 작업실 경로", "Recommended Route")}</span>
              <span data-testid="prescription-route-path" className="font-mono text-[11px] font-semibold text-accent">
                {prescription.workspaceRoute.path}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="apply-prescription-btn" onClick={handleApplyPrescription} className={`${BTN_SOLID} flex-1`}>
                <span>{pick("추천 예제 선택 · 챕터 보기", "Select example & view chapter")}</span>
              </button>
              <a href={prescription.workspaceRoute.fullHref} target="_blank" rel="noopener noreferrer" data-testid="launch-prescribed-workspace-link" className={BTN_OUTLINE}>
                <span>{isEn ? prescription.workspaceRoute.ctaEn : prescription.workspaceRoute.ctaKo}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
            {appliedBanner && (
              <div role="status" data-testid="prescription-applied-banner" className="rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs font-medium text-good">
                {appliedBanner}
              </div>
            )}
          </div>
        </div>
      </div>
      </fieldset>
    </section>
  );
}
