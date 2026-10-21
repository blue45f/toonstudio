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
  readonly onSavePlan: (plan: EpisodePlanWithSynopsis) => void;
}

export function StudioEpisodeStoryPage({
  season,
  plans,
  beatsByEpisodeId,
  genre,
  selectedEpisodeId,
  onSelectEpisode,
  onSavePlan,
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
    <section aria-label="이야기 짜기">
      <header>
        <h1>이야기 짜기</h1>
        <p>회차마다 줄거리를 짧게 적어 두면, 콘티를 짤 때 길을 잃지 않아요.</p>
      </header>

      {/* 시즌 아크 — 데이터는 SeasonPlan.goal/plotArc 를 그대로 보여준다 */}
      <section aria-label="시즌 흐름">
        <h2>{arc.title} — 시즌 흐름</h2>
        <p>{arc.goal || "이번 시즌에 이루고 싶은 것을 한 줄로 적어 보세요."}</p>
        {arc.plotArc.length > 0 && (
          <ol>
            {arc.plotArc.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        )}
        <ol aria-label="회차 목록">
          {arc.episodes.map((card) => (
            <li key={card.episodeId}>
              <button type="button" onClick={() => selectEpisode(card.episodeId)}>
                {card.episodeNumber}화 {card.title}
                {card.needsSynopsis ? " · 줄거리 쓰기" : ""}
              </button>
              <p>{card.goalLine}</p>
              {card.emotionLine && <p>마음의 변화: {card.emotionLine}</p>}
              {card.cliffhangerLine && <p>마무리: {card.cliffhangerLine}</p>}
            </li>
          ))}
        </ol>
      </section>

      {selected && (
        <EpisodeSynopsisEditor
          key={selected.episodeId}
          plan={selected}
          beats={beatsByEpisodeId?.[selected.episodeId]}
          genre={genre}
          onSavePlan={onSavePlan}
        />
      )}
    </section>
  );
}

function EpisodeSynopsisEditor({
  plan,
  beats,
  genre,
  onSavePlan,
}: {
  readonly plan: EpisodePlanWithSynopsis;
  readonly beats?: readonly StudioStoryBeat[];
  readonly genre?: string;
  readonly onSavePlan: (plan: EpisodePlanWithSynopsis) => void;
}) {
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
      onSubmit={(event) => {
        event.preventDefault();
        onSavePlan(draft);
      }}
    >
      <h2>{plan.episodeNumber}화 줄거리</h2>
      {plan.readerReactionMemo ? (
        <section aria-label="독자 반응 기획 메모">
          <h3>이전 회차 독자 반응 메모</h3>
          <p style={{ whiteSpace: "pre-line" }}>{plan.readerReactionMemo}</p>
        </section>
      ) : null}
      {beats && beats.length > 0 && (
        <button type="button" onClick={fillFromBeats}>
          콘티 비트에서 초안 가져오기
        </button>
      )}
      <label>
        이번 화의 목표
        <input
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="예: 주인공이 처음으로 거짓말을 들킨다"
        />
      </label>
      <label>
        줄거리
        <textarea
          value={synopsis}
          onChange={(event) => setSynopsis(event.target.value)}
          rows={5}
          placeholder="처음 → 중간 → 끝, 세 문장이면 충분해요"
        />
      </label>
      <fieldset>
        <legend>마음의 변화</legend>
        <label>
          시작할 때
          <input value={emotionFrom} onChange={(event) => setEmotionFrom(event.target.value)} placeholder="예: 들뜬" />
        </label>
        <label>
          끝날 때
          <input value={emotionTo} onChange={(event) => setEmotionTo(event.target.value)} placeholder="예: 불안한" />
        </label>
      </fieldset>
      <label>
        핵심 사건 (한 줄에 하나씩)
        <textarea value={keyEvents} onChange={(event) => setKeyEvents(event.target.value)} rows={4} />
      </label>
      <section aria-label="다음 전개 제안">
        <h3>다음 전개 제안</h3>
        <p>제안은 선택지예요. 마음에 드는 것만 핵심 사건에 넣고, 나머지는 무시해도 저장할 수 있어요.</p>
        {suggestions.length > 0 ? (
          <ul>
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <p>
                  <strong>{suggestion.stageLabel} · {suggestion.title}</strong>
                </p>
                <p>{suggestion.text}</p>
                <p>{suggestion.rationale}</p>
                <button type="button" onClick={() => applySuggestion(suggestion)}>
                  이 전개로 넣기
                </button>
                <button type="button" onClick={() => dismissSuggestion(suggestion)}>
                  무시
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p>지금 단계의 제안을 모두 봤어요.</p>
            <button type="button" onClick={() => setDismissedIds([])}>
              제안 다시 보기
            </button>
          </>
        )}
        {pendingSeed && (
          <div aria-live="polite">
            <p>다음 회차 씨앗: {pendingSeed}</p>
            {!cliffhanger.trim() && (
              <button type="button" onClick={() => setCliffhanger(pendingSeed)}>
                마무리 훅에 씨앗 넣기
              </button>
            )}
            <p>다음 회차를 열면 이 마무리 훅이 오프닝 초안으로 이어받아져요.</p>
          </div>
        )}
      </section>
      <label>
        마무리 훅
        <input
          value={cliffhanger}
          onChange={(event) => setCliffhanger(event.target.value)}
          placeholder="다음 화가 궁금해지는 한 장면"
        />
      </label>
      {hints.length > 0 && (
        <ul aria-label="쓰기 힌트">
          {hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      )}
      <p aria-live="polite">{card.needsSynopsis ? "아직 줄거리 칸이 비어 있어요." : "줄거리 칸이 채워졌어요."}</p>
      <button type="submit">저장</button>
      {/* 콘티 연결: PR #2303 의 시작점 값(start=storyboard)을 그대로 쓴다 */}
      <a href={`/studio/new?start=storyboard&episode=${encodeURIComponent(plan.episodeId)}`}>
        이 회차 콘티 시작하기
      </a>
    </form>
  );
}
