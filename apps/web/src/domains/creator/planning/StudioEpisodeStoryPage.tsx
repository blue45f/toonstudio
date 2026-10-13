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

export interface StudioEpisodeStoryPageProps {
  readonly season: SeasonPlan;
  readonly plans: readonly EpisodePlanWithSynopsis[];
  /** 회차별 콘티 비트 — "비트에서 줄거리 초안 가져오기"용. 없으면 버튼을 숨긴다. */
  readonly beatsByEpisodeId?: Readonly<Record<string, readonly StudioStoryBeat[]>>;
  readonly onSavePlan: (plan: EpisodePlanWithSynopsis) => void;
}

export function StudioEpisodeStoryPage({
  season,
  plans,
  beatsByEpisodeId,
  onSavePlan,
}: StudioEpisodeStoryPageProps) {
  const arc = useMemo(() => seasonArcView(season, plans), [season, plans]);
  const [selectedId, setSelectedId] = useState<string | null>(arc.episodes[0]?.episodeId ?? null);
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
              <button type="button" onClick={() => setSelectedId(card.episodeId)}>
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
          onSavePlan={onSavePlan}
        />
      )}
    </section>
  );
}

function EpisodeSynopsisEditor({
  plan,
  beats,
  onSavePlan,
}: {
  readonly plan: EpisodePlanWithSynopsis;
  readonly beats?: readonly StudioStoryBeat[];
  readonly onSavePlan: (plan: EpisodePlanWithSynopsis) => void;
}) {
  const [goal, setGoal] = useState(plan.goal ?? "");
  const [synopsis, setSynopsis] = useState(plan.synopsis ?? "");
  const [emotionFrom, setEmotionFrom] = useState(plan.emotionalArc?.from ?? "");
  const [emotionTo, setEmotionTo] = useState(plan.emotionalArc?.to ?? "");
  const [keyEvents, setKeyEvents] = useState(plan.turningPoints.join("\n"));
  const [cliffhanger, setCliffhanger] = useState(plan.cliffhanger);
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

  return (
    <form
      aria-label={`${plan.episodeNumber}화 줄거리`}
      onSubmit={(event) => {
        event.preventDefault();
        onSavePlan(draft);
      }}
    >
      <h2>{plan.episodeNumber}화 줄거리</h2>
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
