/**
 * 창작자 친화 "이야기" 표면.
 *
 * 진입 원칙 (DESIGN.md §3):
 * - production 관리 프레임(production-hub 운영 워크스페이스)과 분리된 기획 전용 표면.
 * - 진입점: /create 의 "이야기부터 시작하기" 카드, 프로젝트 홈의 "이야기" 탭.
 * - 화면 언어는 작가 말로: 시놉시스 → "이번 화 줄거리", emotionalArc → "마음의 변화".
 * - 데이터는 props 로 받는다 (스토어·영속 연결은 후속 단계; 정본은 EpisodePlan/SeasonPlan).
 */
import { useMemo, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";
import type { SeasonPlan } from "@toonstudio/core/production";
import {
  deriveSynopsisDraftFromBeats,
  episodeStoryCard,
  seasonArcView,
  synopsisHints,
  type EpisodePlanWithSynopsis,
} from "./studio-episode-synopsis";
import type { StudioStoryBeat } from "../studio-storyboard-planner";
import {
  applyDevelopmentSuggestion,
  nextEpisodeSeedFromSuggestion,
  suggestNextDevelopments,
  type PlotDevelopmentSuggestion,
} from "./studio-plot-development";

export interface StudioEpisodeStoryPageProps {
  readonly season: SeasonPlan;
  readonly plans: readonly EpisodePlanWithSynopsis[];
  /** 회차별 콘티 비트 — "비트에서 줄거리 초안 가져오기"용. 없으면 버튼을 숨긴다. */
  readonly beatsByEpisodeId?: Readonly<Record<string, readonly StudioStoryBeat[]>>;
  /** 작품 장르 — 전개 제안의 장르 비트 라이브러리 선택에 쓴다. 없으면 공통 라이브러리. */
  readonly genre?: string;
  /**
   * 편집 대상 회차의 controlled 선택. 호스트가 비트 보드와 선택을 공유할 때 넘긴다.
   * undefined 면 내부 상태로 동작한다 (커버리지 맵의 controlled 규약과 동일).
   */
  readonly selectedEpisodeId?: string | null;
  /** 회차가 골라질 때의 알림. 내부 선택과 함께 갱신된다. */
  readonly onSelectEpisode?: (episodeId: string) => void;
  readonly onSavePlan: (plan: EpisodePlanWithSynopsis) => boolean | void;
  /** 호스트가 확인한 기존 원고만 연다. 연결되지 않으면 새 작품으로 우회하지 않는다. */
  readonly storyboardHrefForEpisode?: (episodeId: string) => string | null;
}

const INPUT_CLASS =
  "mt-1.5 min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const TEXTAREA_CLASS =
  "mt-1.5 w-full resize-y rounded-lg border border-line bg-card px-3 py-2.5 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function StudioEpisodeStoryPage({
  season,
  plans,
  beatsByEpisodeId,
  genre,
  selectedEpisodeId,
  onSelectEpisode,
  onSavePlan,
  storyboardHrefForEpisode,
}: StudioEpisodeStoryPageProps) {
  const arc = useMemo(() => seasonArcView(season, plans), [season, plans]);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    arc.episodes[0]?.episodeId ?? null,
  );
  const selectedId = selectedEpisodeId !== undefined ? selectedEpisodeId : internalSelectedId;
  const selectEpisode = (episodeId: string) => {
    setInternalSelectedId(episodeId);
    onSelectEpisode?.(episodeId);
  };
  const selected = plans.find((plan) => plan.episodeId === selectedId) ?? null;

  return (
    <section aria-label="이야기 짜기" className="space-y-4 text-fg">
      <header className="rounded-xl border border-line bg-panel p-4 sm:p-5">
        <h1 className="text-lg font-semibold tracking-tight text-fg">이야기 짜기</h1>
        <p className="mt-1 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
          회차마다 줄거리를 짧게 적어 두면, 콘티를 짤 때 길을 잃지 않아요.
        </p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(16rem,21rem)_minmax(0,1fr)]">
        {/* 시즌 아크 — 데이터는 SeasonPlan.goal/plotArc 를 그대로 보여준다 */}
        <section
          aria-label="시즌 흐름"
          className="space-y-3 rounded-xl border border-line bg-panel p-4"
        >
          <div className="space-y-1 border-b border-line pb-3">
            <h2 className="text-sm font-semibold text-fg">{arc.title} — 시즌 흐름</h2>
            <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
              {arc.goal || "이번 시즌에 이루고 싶은 것을 한 줄로 적어 보세요."}
            </p>
          </div>
          {arc.plotArc.length > 0 && (
            <ol className="flex flex-wrap gap-1.5">
              {arc.plotArc.map((step, index) => (
                <li
                  key={index}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-fg-2"
                >
                  <span className="font-semibold tabular-nums text-accent">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
          <ol aria-label="회차 목록" className="space-y-2">
            {arc.episodes.map((card) => {
              const isSelected = card.episodeId === selectedId;
              return (
                <li
                  key={card.episodeId}
                  className={`rounded-xl border p-3 transition-colors ${
                    isSelected
                      ? "border-accent/55 bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]"
                      : "border-line bg-card hover:border-line-strong hover:bg-raised"
                  }`}
                >
                  <button
                    type="button"
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => selectEpisode(card.episodeId)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <span className="min-w-0 truncate tabular-nums">
                      {card.episodeNumber}화 {card.title}
                      {card.needsSynopsis ? " · 줄거리 쓰기" : ""}
                    </span>
                  </button>
                  <p className="mt-1 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                    {card.goalLine}
                  </p>
                  {card.emotionLine && (
                    <p className="mt-1.5 text-xs text-fg-3">마음의 변화: {card.emotionLine}</p>
                  )}
                  {card.cliffhangerLine && (
                    <p className="mt-1 text-xs text-fg-3">마무리: {card.cliffhangerLine}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {selected && (
          <EpisodeSynopsisEditor
            key={selected.episodeId}
            plan={selected}
            beats={beatsByEpisodeId?.[selected.episodeId]}
            genre={genre}
            onSavePlan={onSavePlan}
            storyboardHref={storyboardHrefForEpisode?.(selected.episodeId) ?? null}
          />
        )}
      </div>
    </section>
  );
}

function EpisodeSynopsisEditor({
  plan,
  beats,
  genre,
  onSavePlan,
  storyboardHref,
}: {
  readonly plan: EpisodePlanWithSynopsis;
  readonly beats?: readonly StudioStoryBeat[];
  readonly genre?: string;
  readonly onSavePlan: (plan: EpisodePlanWithSynopsis) => boolean | void;
  readonly storyboardHref: string | null;
}) {
  const bt = useBilingual("StudioEpisodeStoryPage.handoff");
  const [goal, setGoal] = useState(plan.goal ?? "");
  const [synopsis, setSynopsis] = useState(plan.synopsis ?? "");
  const [emotionFrom, setEmotionFrom] = useState(plan.emotionalArc?.from ?? "");
  const [emotionTo, setEmotionTo] = useState(plan.emotionalArc?.to ?? "");
  const [keyEvents, setKeyEvents] = useState(plan.turningPoints.join("\n"));
  const [cliffhanger, setCliffhanger] = useState(plan.cliffhanger);
  // 전개 제안 루프 상태 — 무시는 이 화면의 세션 상태일 뿐 저장 데이터에 남지 않는다.
  const [dismissedIds, setDismissedIds] = useState<readonly string[]>([]);
  const [pendingSeed, setPendingSeed] = useState("");
  const draft: EpisodePlanWithSynopsis = {
    ...plan,
    goal,
    synopsis,
    emotionalArc: { from: emotionFrom, to: emotionTo },
    turningPoints: keyEvents.split("\n").map((line) => line.trim()).filter(Boolean),
    cliffhanger,
  };
  const hints = synopsisHints(draft);
  const card = episodeStoryCard(draft);

  const fillFromBeats = () => {
    if (!beats || beats.length === 0) return;
    const fromBeats = deriveSynopsisDraftFromBeats(beats);
    if (!synopsis.trim() && fromBeats.synopsisDraft) setSynopsis(fromBeats.synopsisDraft);
    if (!keyEvents.trim() && fromBeats.keyEvents.length > 0) setKeyEvents(fromBeats.keyEvents.join("\n"));
    if (!cliffhanger.trim() && fromBeats.cliffhangerCandidate) setCliffhanger(fromBeats.cliffhangerCandidate);
  };

  // 전개 제안: 현재 핵심 사건(turningPoints) 뒤에 올 후보. 넣으면 단계가 전진해 다시 도출된다.
  const currentPoints = keyEvents.split("\n").map((line) => line.trim()).filter(Boolean);
  const suggestions = suggestNextDevelopments(
    {
      genre,
      turningPoints: currentPoints,
      coreConflict: plan.coreConflict,
      logline: plan.logline,
      cliffhanger,
    },
    { dismissedIds },
  );

  const applySuggestion = (suggestion: PlotDevelopmentSuggestion) => {
    const result = applyDevelopmentSuggestion(currentPoints, suggestion);
    if (!result.applied) return;
    setKeyEvents(result.turningPoints.join("\n"));
    // hook 단계 제안의 다음 회차 씨앗은 F-7 인계 재료(cliffhanger)로 곁들일 수 있게 남긴다.
    setPendingSeed(nextEpisodeSeedFromSuggestion(suggestion));
  };

  const dismissSuggestion = (suggestion: PlotDevelopmentSuggestion) => {
    setDismissedIds((previous) => [...previous, suggestion.id]);
  };

  return (
    <form
      aria-label={`${plan.episodeNumber}화 줄거리`}
      className="space-y-4 rounded-xl border border-line bg-panel p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSavePlan(draft);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <h2 className="text-base font-semibold tabular-nums text-fg">{plan.episodeNumber}화 줄거리</h2>
        {beats && beats.length > 0 && (
          <button
            type="button"
            onClick={fillFromBeats}
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3.5 text-xs font-semibold text-fg transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            콘티 비트에서 초안 가져오기
          </button>
        )}
      </div>

      {plan.readerReactionMemo ? (
        <section
          aria-label="독자 반응 기획 메모"
          className="rounded-xl border border-line bg-card p-3.5 shadow-[inset_2px_0_0_var(--color-accent)]"
        >
          <h3 className="text-xs font-semibold text-accent">이전 회차 독자 반응 메모</h3>
          <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-fg-2">
            {plan.readerReactionMemo}
          </p>
        </section>
      ) : null}

      <label className="block text-xs font-semibold text-fg-2">
        이번 화의 목표
        <input
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="예: 주인공이 처음으로 거짓말을 들킨다"
          className={INPUT_CLASS}
        />
      </label>

      <label className="block text-xs font-semibold text-fg-2">
        줄거리
        <textarea
          value={synopsis}
          onChange={(event) => setSynopsis(event.target.value)}
          rows={5}
          placeholder="처음 → 중간 → 끝, 세 문장이면 충분해요"
          className={TEXTAREA_CLASS}
        />
      </label>

      <fieldset className="rounded-xl border border-line bg-card/50 p-3.5">
        <legend className="px-1 text-xs font-semibold text-fg-2">마음의 변화</legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-fg-2">
            시작할 때
            <input
              value={emotionFrom}
              onChange={(event) => setEmotionFrom(event.target.value)}
              placeholder="예: 들뜬"
              className={INPUT_CLASS}
            />
          </label>
          <label className="block text-xs font-medium text-fg-2">
            끝날 때
            <input
              value={emotionTo}
              onChange={(event) => setEmotionTo(event.target.value)}
              placeholder="예: 불안한"
              className={INPUT_CLASS}
            />
          </label>
        </div>
      </fieldset>

      <label className="block text-xs font-semibold text-fg-2">
        핵심 사건 (한 줄에 하나씩)
        <textarea
          value={keyEvents}
          onChange={(event) => setKeyEvents(event.target.value)}
          rows={4}
          className={TEXTAREA_CLASS}
        />
      </label>

      <section
        aria-label="다음 전개 제안"
        className="space-y-3 rounded-xl border border-line bg-card/55 p-3.5"
      >
        <div>
          <h3 className="text-sm font-semibold text-fg">다음 전개 제안</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
            제안은 선택지예요. 마음에 드는 것만 핵심 사건에 넣고, 나머지는 무시해도 저장할 수 있어요.
          </p>
        </div>
        {suggestions.length > 0 ? (
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.id}
                className="flex flex-col justify-between gap-2.5 rounded-xl border border-line bg-card p-3"
              >
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-accent">
                    <strong>{suggestion.stageLabel} · {suggestion.title}</strong>
                  </p>
                  <p className="text-xs leading-relaxed text-fg">{suggestion.text}</p>
                  <p className="text-xs leading-relaxed text-fg-3">{suggestion.rationale}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applySuggestion(suggestion)}
                    className="min-h-11 rounded-lg border border-accent/40 bg-accent-soft px-3 text-xs font-semibold text-accent transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    이 전개로 넣기
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissSuggestion(suggestion)}
                    className="min-h-11 rounded-lg border border-line bg-panel px-3 text-xs font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    무시
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-line bg-panel px-3 py-2.5">
            <p className="text-xs text-fg-2">지금 단계의 제안을 모두 봤어요.</p>
            <button
              type="button"
              onClick={() => setDismissedIds([])}
              className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg transition-colors hover:bg-raised"
            >
              제안 다시 보기
            </button>
          </div>
        )}
        {pendingSeed && (
          <div
            aria-live="polite"
            className="space-y-2 rounded-lg border border-accent/35 bg-accent-soft/60 p-3 text-xs"
          >
            <p className="font-semibold text-fg">다음 회차 씨앗: {pendingSeed}</p>
            {!cliffhanger.trim() && (
              <button
                type="button"
                onClick={() => setCliffhanger(pendingSeed)}
                className="min-h-11 rounded-lg bg-accent px-3.5 text-xs font-semibold text-on-accent"
              >
                마무리 훅에 씨앗 넣기
              </button>
            )}
            <p className="text-fg-2">다음 회차를 열면 이 마무리 훅이 오프닝 초안으로 이어받아져요.</p>
          </div>
        )}
      </section>

      <label className="block text-xs font-semibold text-fg-2">
        마무리 훅
        <input
          value={cliffhanger}
          onChange={(event) => setCliffhanger(event.target.value)}
          placeholder="다음 화가 궁금해지는 한 장면"
          className={INPUT_CLASS}
        />
      </label>

      {hints.length > 0 && (
        <ul
          aria-label="쓰기 힌트"
          className="space-y-1 rounded-xl border border-line bg-card p-3 text-xs leading-relaxed text-fg-2"
        >
          {hints.map((hint) => (
            <li key={hint}>· {hint}</li>
          ))}
        </ul>
      )}

      <div className="space-y-3 border-t border-line pt-4">
        <p aria-live="polite" className="text-xs font-medium text-fg-2">
          {card.needsSynopsis
            ? r3c04StatusText("studio.r3c04Status.planning.storyPage.synopsisEmpty", "아직 줄거리 칸이 비어 있어요.")
            : r3c04StatusText("studio.r3c04Status.planning.storyPage.synopsisFilled", "줄거리 칸이 채워졌어요.")}
        </p>
        <p className="text-xs leading-relaxed text-fg-3">
          {bt("현재 기획을 저장하고 선택한 기존 원고를 엽니다. 원고 내용은 자동으로 바꾸지 않습니다.", "Save this episode plan and open the selected manuscript. Its artwork is not changed automatically.")}
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            저장
          </button>
          {storyboardHref ? (
            <Link
              href={storyboardHref}
              onClick={(event) => {
                if (onSavePlan(draft) === false) event.preventDefault();
              }}
              className="inline-flex min-h-11 items-center rounded-lg border border-accent/45 bg-accent-soft px-4 text-sm font-semibold text-accent transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {bt("이 회차 콘티 시작하기", "Open this episode storyboard")}
            </Link>
          ) : (
            <span
              role="status"
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3.5 text-xs text-fg-3"
            >
              {bt("콘티를 이어갈 기존 원고를 선택해 주세요.", "Select the existing manuscript for this storyboard.")}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
