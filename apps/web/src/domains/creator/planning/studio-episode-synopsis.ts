/**
 * 회차 시놉시스 뷰모델 + 콘티 비트 연결.
 *
 * 원칙:
 * - 정본 데이터는 @toonstudio/core/production 의 EpisodePlan / SeasonPlan 을 그대로 쓴다.
 *   이미 있는 필드(logline·openingHook·coreConflict·turningPoints·cliffhanger·targetCutCount)는
 *   새로 만들지 않고, 타입에 없는 3개(goal·synopsis·emotionalArc)만 "선택 확장"으로 제안한다.
 * - 확장은 전부 optional 이라 기존 EpisodePlan 레코드·검증기(validateEpisodePlan)를 깨지 않는다.
 *   core 타입에 optional 필드를 더하는 안(A)과, 웹 앱 로컬 뷰모델로만 두는 안(B) 중
 *   DESIGN.md 는 A를 권한다 (운영 표면·기획서 내보내기가 같은 정본을 읽어야 하므로).
 */
import type { EpisodePlan, SeasonPlan } from "@toonstudio/core/production";
import type { StudioStoryBeat } from "../studio-storyboard-planner";

/** EpisodePlan 에 더할 선택 확장 (core 반영 시 EpisodePlan 에 optional 로 합류). */
export interface EpisodeSynopsisExtension {
  /** 이번 회차의 목표 — "무엇이 달라져야 이 화가 끝난 것인가" 한 문장. */
  readonly goal?: string;
  /** 줄거리 본문 3~5문장. logline(한 줄)과 별개로 회차 전체 흐름을 적는 자리. */
  readonly synopsis?: string;
  /** 감정 변화 — 공정 템플릿 완료 기준 "회차 목표와 감정 변화 확정"의 후반부. */
  readonly emotionalArc?: {
    readonly from: string;
    readonly to: string;
  };
}

export type EpisodePlanWithSynopsis = EpisodePlan & EpisodeSynopsisExtension;

/** 회차 카드 한 장에 필요한 읽기 전용 요약. 시즌 아크 띠와 회차 목록이 공유한다. */
export interface EpisodeStoryCard {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly title: string;
  readonly status: EpisodePlan["status"];
  readonly goalLine: string;
  readonly emotionLine: string;
  readonly cliffhangerLine: string;
  /** 시놉시스 핵심 칸이 비어 있으면 true — 카드에 "줄거리 쓰기" 유도 표시에 쓴다. */
  readonly needsSynopsis: boolean;
}

export function episodeStoryCard(plan: EpisodePlanWithSynopsis): EpisodeStoryCard {
  const goalLine = plan.goal?.trim() || plan.logline.trim();
  const emotionLine = plan.emotionalArc
    ? `${plan.emotionalArc.from} → ${plan.emotionalArc.to}`
    : "";
  return Object.freeze({
    episodeId: plan.episodeId,
    episodeNumber: plan.episodeNumber,
    title: plan.title,
    status: plan.status,
    goalLine,
    emotionLine,
    cliffhangerLine: plan.cliffhanger.trim(),
    needsSynopsis: !(plan.synopsis?.trim() || plan.goal?.trim()),
  });
}

/** 시즌 아크 한눈에 보기: SeasonPlan.goal/plotArc + 회차 카드 나열. 새 데이터 없음. */
export interface SeasonArcView {
  readonly seasonId: string;
  readonly title: string;
  readonly goal: string;
  readonly plotArc: readonly string[];
  readonly episodes: readonly EpisodeStoryCard[];
}

export function seasonArcView(
  season: SeasonPlan,
  plans: readonly EpisodePlanWithSynopsis[],
): SeasonArcView {
  const byId = new Map(plans.map((plan) => [plan.episodeId, plan]));
  const ordered = season.episodeOrder
    .map((episodeId) => byId.get(episodeId))
    .filter((plan): plan is EpisodePlanWithSynopsis => plan !== undefined)
    .map(episodeStoryCard);
  const rest = plans
    .filter((plan) => plan.seasonId === season.seasonId && !season.episodeOrder.includes(plan.episodeId))
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .map(episodeStoryCard);
  return Object.freeze({
    seasonId: season.seasonId,
    title: season.title,
    goal: season.goal,
    plotArc: season.plotArc,
    episodes: Object.freeze([...ordered, ...rest]),
  });
}

/**
 * 콘티 비트 → 시놉시스 초안 가져오기.
 * 이미 콘티를 짠 회차에서 빈칸 부담을 줄이는 방향의 연결이다.
 * - 핵심 사건 후보: 비트 summary 를 순서대로 (장면이 바뀌는 첫 비트는 사건 시작으로 취급)
 * - 줄거리 초안: 장면별 첫 비트 summary 를 이은 단락
 * - 마무리 훅 후보: 마지막 reveal/transition 비트의 summary
 * 자동 확정하지 않고 "초안으로 넣기" 버튼이 채우는 값만 만든다.
 */
export interface SynopsisDraftFromBeats {
  readonly keyEvents: readonly string[];
  readonly synopsisDraft: string;
  readonly cliffhangerCandidate: string;
}

export function deriveSynopsisDraftFromBeats(
  beats: readonly StudioStoryBeat[],
): SynopsisDraftFromBeats {
  const ordered = [...beats].sort((a, b) => a.order - b.order);
  const sceneLeads: string[] = [];
  const seenScenes = new Set<string>();
  for (const beat of ordered) {
    if (!seenScenes.has(beat.sceneId)) {
      seenScenes.add(beat.sceneId);
      if (beat.summary.trim()) sceneLeads.push(beat.summary.trim());
    }
  }
  const keyEvents = ordered
    .filter((beat) => beat.kind === "reveal" || beat.kind === "action")
    .map((beat) => beat.summary.trim())
    .filter(Boolean);
  const tail = [...ordered]
    .reverse()
    .find((beat) => beat.kind === "reveal" || beat.kind === "transition");
  return Object.freeze({
    keyEvents: Object.freeze(keyEvents.length > 0 ? keyEvents : sceneLeads),
    synopsisDraft: sceneLeads.join(" "),
    cliffhangerCandidate: tail?.summary.trim() ?? "",
  });
}

/** 시놉시스 칸의 가벼운 자체 검증 (core validateEpisodePlan 과 별개, 표면 안내용). */
export function synopsisHints(plan: EpisodePlanWithSynopsis): readonly string[] {
  const hints: string[] = [];
  if (!plan.goal?.trim() && !plan.logline.trim()) {
    hints.push("이번 화의 목표나 한 줄 줄거리 중 하나는 적어 두는 게 좋아요.");
  }
  if (plan.turningPoints.length === 0) {
    hints.push("핵심 사건이 비어 있어요. 콘티 비트에서 가져올 수도 있어요.");
  }
  if (!plan.cliffhanger.trim()) {
    hints.push("마무리 훅이 없으면 다음 화로 이어지는 힘이 약해져요.");
  }
  if (plan.emotionalArc && !plan.emotionalArc.from.trim() && !plan.emotionalArc.to.trim()) {
    hints.push("감정 변화가 비어 있어요. 시작 감정만 적어도 충분해요.");
  }
  return Object.freeze(hints);
}
