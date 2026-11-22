/**
 * 발표 현장용 Remotion 아키텍처 모션 도식 플레이어.
 *
 * - `ProductTourPlayer.tsx`와 동일하게 `@remotion/player`를 사용자 동작(재생 또는 챕터 점프) 시
 *   마운트하고 `acknowledgeRemotionLicense`를 명시한다.
 * - 재생 전·오류 폴백·`prefers-reduced-motion` 환경에서도 4단계 아키텍처 스냅샷과 단계 점프,
 *   발표자 한 줄 요약, 연관 실무 레시피 이동을 그대로 사용할 수 있다.
 */

import { Player, type PlayerRef } from "@remotion/player";
import {
  AlertTriangle,
  ArrowDownRight,
  Captions,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  Maximize,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import type { AnyZodObject } from "remotion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  TechSeminarDiagramComposition,
  type TechSeminarDiagramCompositionProps,
} from "./tech-seminar-remotion-compositions";
import {
  SEMINAR_CHAPTER_DURATION_FRAMES,
  SEMINAR_FRAMES_PER_STAGE,
  SEMINAR_REMOTION_FPS,
  SEMINAR_TOTAL_DURATION_FRAMES,
  TECH_SEMINAR_MOTION_CHAPTERS,
  formatSeminarTimestamp,
  seminarChapterAtFrame,
  seminarFrameForChapterStage,
  seminarStageIndexInChapter,
  type TechSeminarChapterId,
  type TechSeminarLinkedRecipeId,
  type TechSeminarMotionChapter,
} from "./tech-seminar-remotion-data";

import { cx } from "@/shared/lib/cx";

export interface TechSeminarRemotionShowcaseProps {
  /** 외부(실무 레시피 카드)에서 특정 챕터로 점프할 때 갱신한다. */
  readonly requestedChapter?: {
    readonly id: TechSeminarChapterId;
    readonly nonce: number;
  } | null;
  /** 현재 챕터와 연결된 실무 재사용 레시피 카드로 이동한다. */
  readonly onSelectRecipe?: (recipeId: TechSeminarLinkedRecipeId) => void;
}

/** `prefers-reduced-motion: reduce` 감지 훅(jsdom/SSR 안전). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** Remotion 내부 에러 경계가 컴포지션 렌더 실패를 알릴 때 정적 단계 보드로 안전 전환한다. */
function SeminarCompositionErrorReporter({
  error,
  onReport,
}: {
  readonly error: Error;
  readonly onReport: (message: string) => void;
}) {
  const reportedRef = useRef(false);
  useEffect(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    onReport(error.message || "Remotion 도식 렌더에 실패해 정적 단계 보드로 전환했습니다.");
  }, [error, onReport]);
  return null;
}

/** 재생 전 또는 오류 폴백 시 보여주는 반응형 4단계 아키텍처 보드. */
function SeminarStaticStagePreview({
  chapter,
  activeStageIndex,
  reducedMotion,
  fallbackReason,
  onStartPlayback,
  onSelectStage,
}: {
  readonly chapter: TechSeminarMotionChapter;
  readonly activeStageIndex: number;
  readonly reducedMotion: boolean;
  readonly fallbackReason: string | null;
  readonly onStartPlayback: () => void;
  readonly onSelectStage: (stageIndex: number) => void;
}) {
  const activeStage = chapter.stages[activeStageIndex] ?? chapter.stages[0];

  return (
    <div
      data-seminar-static-stage="true"
      className="flex h-full min-h-[22rem] flex-col justify-between gap-4 rounded-2xl border border-line-strong bg-raised p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-accent/35 bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent">
              CHAPTER 0{chapter.order} / 0{TECH_SEMINAR_MOTION_CHAPTERS.length} · {chapter.shortLabel}
            </span>
            <span className="inline-flex items-center rounded-full border border-line bg-card px-2.5 py-1 text-xs font-bold text-fg-2">
              {chapter.invariantBadge}
            </span>
          </div>
          <h4 className="mt-2.5 text-balance break-keep text-lg font-black tracking-tight text-fg sm:text-xl">
            {chapter.title}
          </h4>
          <p className="mt-1 text-xs leading-6 text-fg-3 sm:text-sm">{chapter.subtitle}</p>
        </div>

        {!fallbackReason ? (
          <button
            type="button"
            onClick={onStartPlayback}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-black text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-raised motion-reduce:transition-none"
          >
            <Play size={16} fill="currentColor" aria-hidden="true" />
            {reducedMotion ? "정적 프레임 플레이어 열기" : "모션 도식 재생"}
          </button>
        ) : null}
      </div>

      {fallbackReason ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-warn/35 bg-warn/10 px-3.5 py-2.5 text-xs font-semibold text-fg-2"
        >
          <AlertTriangle size={15} className="shrink-0 text-warn" aria-hidden="true" />
          <span>{fallbackReason}</span>
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {chapter.stages.map((stage, idx) => {
          const isCurrent = idx === activeStageIndex;
          return (
            <button
              key={stage.id}
              type="button"
              aria-pressed={isCurrent}
              onClick={() => onSelectStage(idx)}
              className={cx(
                "flex min-h-28 flex-col justify-between rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                isCurrent
                  ? "border-accent bg-card shadow-sm"
                  : "border-line bg-panel/75 hover:border-line-strong hover:bg-card/80",
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-[0.72rem] font-bold">
                  <span className={isCurrent ? "text-accent" : "text-fg-3"}>{stage.role}</span>
                  <span className="rounded-md bg-raised px-2 py-0.5 text-[0.68rem] font-extrabold text-fg-2">
                    {stage.metric}
                  </span>
                </div>
                <p className="mt-2 break-keep text-sm font-black leading-snug text-fg">{stage.label}</p>
                <p className="mt-1.5 break-keep text-xs leading-5 text-fg-2">{stage.speakerCue}</p>
              </div>
              <code className="mt-3 block truncate rounded-lg border border-line/70 bg-raised px-2 py-1 text-[0.68rem] text-fg-3">
                {stage.codeRef}
              </code>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-card px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.72rem] font-extrabold text-accent">
            발표 한 줄 요약 · 현재 단계: {activeStage.label}
          </p>
          <p className="mt-0.5 break-keep text-sm font-bold leading-6 text-fg">{chapter.presenterOneLiner}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-[0.72rem] text-fg-3">
          <FileCode2 size={14} aria-hidden="true" />
          <span className="max-w-[16rem] truncate">{chapter.sourcePaths[0]}</span>
        </span>
      </div>
    </div>
  );
}

export function TechSeminarRemotionShowcase({
  requestedChapter = null,
  onSelectRecipe,
}: TechSeminarRemotionShowcaseProps) {
  const reducedMotion = usePrefersReducedMotion();
  const playerRef = useRef<PlayerRef>(null);
  const initialMountFrameRef = useRef(0);

  const [playerMounted, setPlayerMounted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [showPresenterBar, setShowPresenterBar] = useState(true);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  const activeChapter = useMemo(() => seminarChapterAtFrame(currentFrame), [currentFrame]);
  const activeStageIndex = useMemo(
    () => seminarStageIndexInChapter(currentFrame - activeChapter.startFrame, activeChapter.stages.length),
    [activeChapter, currentFrame],
  );
  const activeChapterIndex = activeChapter.order - 1;
  const previousChapter = TECH_SEMINAR_MOTION_CHAPTERS[activeChapterIndex - 1] ?? null;
  const nextChapter = TECH_SEMINAR_MOTION_CHAPTERS[activeChapterIndex + 1] ?? null;

  const compositionProps = useMemo<TechSeminarDiagramCompositionProps>(
    () => ({
      reducedMotion,
      showPresenterBar,
    }),
    [reducedMotion, showPresenterBar],
  );

  const triggerFallback = useCallback((reason: string) => {
    playerRef.current?.pause();
    setIsPlaying(false);
    setPlayerMounted(false);
    setFallbackReason(reason);
  }, []);

  const renderErrorFallback = useCallback(
    (info: { readonly error: Error }) => (
      <SeminarCompositionErrorReporter error={info.error} onReport={triggerFallback} />
    ),
    [triggerFallback],
  );

  useLayoutEffect(() => {
    const player = playerRef.current;
    if (!player || !playerMounted || fallbackReason) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleFrameUpdate = (event: { readonly detail: { readonly frame: number } }) => {
      setCurrentFrame(event.detail.frame);
    };
    const handleError = (event: { readonly detail: { readonly error: Error } }) => {
      triggerFallback(event.detail.error.message || "Remotion 플레이어 실행 중 오류가 발생했습니다.");
    };

    player.addEventListener("play", handlePlay);
    player.addEventListener("pause", handlePause);
    player.addEventListener("ended", handleEnded);
    player.addEventListener("frameupdate", handleFrameUpdate);
    player.addEventListener("error", handleError);

    return () => {
      player.removeEventListener("play", handlePlay);
      player.removeEventListener("pause", handlePause);
      player.removeEventListener("ended", handleEnded);
      player.removeEventListener("frameupdate", handleFrameUpdate);
      player.removeEventListener("error", handleError);
    };
  }, [fallbackReason, playerMounted, triggerFallback]);

  useEffect(
    () => () => {
      playerRef.current?.pause();
    },
    [],
  );

  /** 지정 프레임으로 이동하고, 원하면 즉시 Remotion 재생을 시작한다. */
  const seekToFrame = useCallback(
    (targetFrame: number, options: { readonly play?: boolean; readonly mountIfNeeded?: boolean } = {}) => {
      const clamped = Math.max(0, Math.min(SEMINAR_TOTAL_DURATION_FRAMES - 1, Math.floor(targetFrame)));
      setCurrentFrame(clamped);

      if (fallbackReason) return;
      const shouldMount = options.mountIfNeeded ?? playerMounted;
      if (!shouldMount) return;

      if (!playerMounted) {
        initialMountFrameRef.current = clamped;
        flushSync(() => {
          setPlayerMounted(true);
        });
      }

      const player = playerRef.current;
      if (!player) return;
      player.seekTo(clamped);
      if (options.play && !reducedMotion) {
        player.play();
      } else if (options.play === false) {
        player.pause();
      }
    },
    [fallbackReason, playerMounted, reducedMotion],
  );

  // 외부 레시피 카드에서 "모션 도식에서 보기"를 누른 경우 해당 챕터 시작 프레임으로 이동한다.
  useEffect(() => {
    if (!requestedChapter) return;
    const frame = seminarFrameForChapterStage(requestedChapter.id, 0);
    setCurrentFrame(frame);
    if (playerMounted && playerRef.current && !fallbackReason) {
      playerRef.current.seekTo(frame);
    }
  }, [fallbackReason, playerMounted, requestedChapter]);

  const handleTogglePlay = useCallback(() => {
    if (fallbackReason) {
      setFallbackReason(null);
      return;
    }
    if (!playerMounted) {
      initialMountFrameRef.current = currentFrame;
      flushSync(() => {
        setPlayerMounted(true);
      });
      const player = playerRef.current;
      if (!player) return;
      player.seekTo(currentFrame);
      if (!reducedMotion) player.play();
      return;
    }
    const player = playerRef.current;
    if (!player) return;
    if (player.isPlaying()) player.pause();
    else player.play();
  }, [currentFrame, fallbackReason, playerMounted, reducedMotion]);

  const handleFullscreen = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isFullscreen()) player.exitFullscreen();
    else player.requestFullscreen();
  }, []);

  return (
    <section
      id="seminar-remotion-diagrams"
      aria-labelledby="seminar-remotion-title"
      data-seminar-remotion-showcase="true"
      data-active-chapter={activeChapter.id}
      data-current-frame={currentFrame}
      className="grid gap-5 rounded-[2rem] border border-line/80 bg-panel/65 p-5 shadow-sm sm:p-7"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow text-accent">REMOTION ARCHITECTURE MOTION</span>
            <span className="inline-flex items-center rounded-full border border-line bg-card px-2.5 py-0.5 text-[0.72rem] font-bold text-fg-2">
              5개 챕터 · 60초 · 30fps
            </span>
            {reducedMotion ? (
              <span className="inline-flex items-center rounded-full border border-good/35 bg-good/10 px-2.5 py-0.5 text-[0.72rem] font-bold text-good">
                동작 줄이기 적용됨 (정적 단계 모드)
              </span>
            ) : null}
          </div>
          <h3
            id="seminar-remotion-title"
            className="text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl"
          >
            발표 화면용 인터랙티브 아키텍처 모션 도식
          </h3>
          <p className="max-w-3xl break-keep text-sm leading-7 text-fg-2">
            발표 중 화면 공유로 띄워 두고 챕터·단계별로 바로 점프하며 설명할 수 있습니다.
            <code className="mx-1 rounded bg-card px-1.5 py-0.5 text-xs">@remotion/player</code>는
            재생을 누를 때만 마운트되므로 초기 번들과 페이지 열림 속도에 부담을 주지 않습니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTogglePlay}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-black text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
          >
            {fallbackReason ? (
              <>
                <RotateCcw size={16} aria-hidden="true" />
                플레이어 다시 시도
              </>
            ) : isPlaying ? (
              <>
                <Pause size={16} aria-hidden="true" />
                도식 일시정지
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" aria-hidden="true" />
                {playerMounted ? "도식 계속 재생" : "모션 도식 재생"}
              </>
            )}
          </button>
          <button
            type="button"
            aria-pressed={showPresenterBar}
            onClick={() => setShowPresenterBar((value) => !value)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 py-2 text-xs font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
          >
            <Captions size={15} aria-hidden="true" />
            발표자 자막 바
          </button>
          <button
            type="button"
            disabled={!playerMounted || Boolean(fallbackReason)}
            onClick={handleFullscreen}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 py-2 text-xs font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-fg disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
          >
            <Maximize size={15} aria-hidden="true" />
            도식 전체화면
          </button>
        </div>
      </header>

      {/* 5개 챕터 즉시 점프 레일 */}
      <div
        role="group"
        aria-label="모션 도식 챕터 선택"
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
      >
        {TECH_SEMINAR_MOTION_CHAPTERS.map((chapter) => {
          const selected = chapter.id === activeChapter.id;
          return (
            <button
              key={chapter.id}
              type="button"
              aria-pressed={selected}
              aria-current={selected ? "step" : undefined}
              onClick={() =>
                seekToFrame(chapter.startFrame, {
                  mountIfNeeded: playerMounted,
                  play: playerMounted && !reducedMotion,
                })
              }
              className={cx(
                "flex min-h-14 flex-col items-start justify-center rounded-2xl border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                selected
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
              )}
            >
              <span className="flex w-full items-center justify-between gap-2 text-[0.7rem] font-extrabold opacity-85">
                <span>0{chapter.order}</span>
                <span className="font-mono tabular-nums">
                  {formatSeminarTimestamp(chapter.startFrame, SEMINAR_REMOTION_FPS)}
                </span>
              </span>
              <span className="mt-0.5 truncate text-sm font-black">{chapter.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* 16:9 Remotion 스테이지 (지연 마운트 + 정적 반응형 프리뷰) */}
      <div className="overflow-hidden rounded-2xl border border-line bg-raised">
        {playerMounted && !fallbackReason ? (
          <div className="aspect-video w-full">
            <Player<AnyZodObject, TechSeminarDiagramCompositionProps>
              ref={playerRef}
              initialFrame={initialMountFrameRef.current}
              component={TechSeminarDiagramComposition}
              inputProps={compositionProps}
              durationInFrames={SEMINAR_TOTAL_DURATION_FRAMES}
              compositionWidth={1280}
              compositionHeight={720}
              fps={SEMINAR_REMOTION_FPS}
              style={{ width: "100%", height: "100%" }}
              controls
              clickToPlay
              doubleClickToFullscreen
              spaceKeyToPlayOrPause
              allowFullscreen
              loop={false}
              showPlaybackRateControl={[0.5, 1, 1.25, 1.5]}
              moveToBeginningWhenEnded={false}
              acknowledgeRemotionLicense
              errorFallback={renderErrorFallback}
            />
          </div>
        ) : (
          <SeminarStaticStagePreview
            chapter={activeChapter}
            activeStageIndex={activeStageIndex}
            reducedMotion={reducedMotion}
            fallbackReason={fallbackReason}
            onStartPlayback={handleTogglePlay}
            onSelectStage={(stageIndex) =>
              seekToFrame(activeChapter.startFrame + stageIndex * SEMINAR_FRAMES_PER_STAGE, {
                mountIfNeeded: false,
              })
            }
          />
        )}
      </div>

      {/* 하단 챕터 이동 · 4단계 스텝 점프 · 연관 레시피 바로가기 */}
      <div className="grid gap-3 rounded-2xl border border-line/75 bg-card/75 p-4 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!previousChapter}
            aria-label="이전 도식 챕터"
            onClick={() => {
              if (!previousChapter) return;
              seekToFrame(previousChapter.startFrame, {
                mountIfNeeded: playerMounted,
                play: false,
              });
            }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line bg-panel text-fg-2 transition-colors hover:border-accent/45 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={!nextChapter}
            aria-label="다음 도식 챕터"
            onClick={() => {
              if (!nextChapter) return;
              seekToFrame(nextChapter.startFrame, {
                mountIfNeeded: playerMounted,
                play: false,
              });
            }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line bg-panel text-fg-2 transition-colors hover:border-accent/45 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <span className="px-2 font-mono text-xs font-bold tabular-nums text-fg-3">
            {formatSeminarTimestamp(currentFrame, SEMINAR_REMOTION_FPS)} /{" "}
            {formatSeminarTimestamp(SEMINAR_TOTAL_DURATION_FRAMES - 1, SEMINAR_REMOTION_FPS)}
          </span>
        </div>

        <div
          role="group"
          aria-label="현재 챕터 단계 이동"
          className="flex flex-wrap items-center gap-2"
        >
          {activeChapter.stages.map((stage, stageIdx) => {
            const isCurrent = stageIdx === activeStageIndex;
            const targetFrame = activeChapter.startFrame + stageIdx * SEMINAR_FRAMES_PER_STAGE;
            const endOffsetSec = Math.round((SEMINAR_CHAPTER_DURATION_FRAMES / SEMINAR_REMOTION_FPS) * ((stageIdx + 1) / 4));
            return (
              <button
                key={stage.id}
                type="button"
                aria-pressed={isCurrent}
                onClick={() => seekToFrame(targetFrame, { mountIfNeeded: playerMounted, play: false })}
                className={cx(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                  isCurrent
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                <span>{stage.label}</span>
                <span className="font-mono text-[0.68rem] opacity-70">{endOffsetSec}s</span>
              </button>
            );
          })}
        </div>

        {onSelectRecipe ? (
          <button
            type="button"
            onClick={() => onSelectRecipe(activeChapter.relatedRecipeId)}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft/50 px-3.5 py-2 text-xs font-black text-accent transition-colors hover:bg-accent hover:text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
          >
            연관 실무 레시피 보기
            <ArrowDownRight size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  );
}
