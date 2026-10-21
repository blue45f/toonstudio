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
  /**
   * 씨앗 빌더가 이 회차 초안을 만들 때 인용한 설정 id (선택 확장).
   * 씨앗 적용 때만 채워지고, 손으로 쓴 회차에는 없다.
   */
  readonly referencedSettingIds?: readonly string[];
  /**
   * referencedSettingIds 를 적용 시점에 이름으로 풀어 둔 출처 목록.
   * 허브·바이블은 id 공간이 서로 달라, 인계 카드가 나중에 id 만으로 이름을
   * 되찾을 수 없기 때문에 적용 시점에 함께 저장한다.
   */
  readonly seedSettingRefs?: readonly EpisodeSeedSettingRef[];
  /** 다음 화 훅 설계 두 칸. 없으면 빈 칸으로 판정한다. */
  readonly hookDesign?: EpisodeHookDesignInput;
  /**
   * 독자 반응 기획 메모 (선택 확장) — 독자 반응 인용 카드(F3)가 이전 회차
   * 실집계 인용을 이 회차 기획에 반영하려고 저장한 본문. 카드로 저장할 때만
   * 채워지고, 손으로 쓴 회차에는 없다. 실집계가 없는 지표는 본문에 숫자가
   * 아니라 "미수집"으로만 들어간다 (studio-reader-reaction-quote.ts).
   */
  readonly readerReactionMemo?: string;
}

/** 씨앗 인용 출처 한 건 — 적용 시점에 풀어 둔 최소 모양(id·종류·이름). */
export interface EpisodeSeedSettingRef {
  readonly id: string;
  readonly kind: "character" | "location" | "lore";
  /** 이름으로 풀지 못한 출처는 빈 문자열 — 표시 쪽이 id 로 폴백한다. */
  readonly name: string;
}

/** 다음 화 훅 설계 두 칸 — 마지막 장면의 질문과 다음 화 첫 장면. 둘 다 선택 확장이다. */
export interface EpisodeHookDesignInput {
  readonly lastSceneQuestion: string;
  readonly nextOpening: string;
}

/**
 * 인계 카드가 보여 줄 씨앗 설정 출처 줄.
 * 이름 목록(seedSettingRefs)이 있으면 referencedSettingIds 순서를 따라
 * 이름으로, 이름이 비면 id 로 보여 준다. 이름 목록만 있고 id 목록이 없으면
 * 이름 목록 순서를 쓴다. 둘 다 없으면 빈 배열 — 지어내지 않는다.
 */
export function episodeSeedSettingLines(
  plan: EpisodePlanWithSynopsis,
): readonly string[] {
  const named = new Map(
    (plan.seedSettingRefs ?? []).map((ref) => [ref.id, ref] as const),
  );
  const ids = plan.referencedSettingIds ?? [];
  if (ids.length > 0) {
    return Object.freeze(
      ids
        .map((id) => {
          const ref = named.get(id);
          const name = ref?.name.trim() ?? "";
          return name || id;
        })
        .filter(Boolean),
    );
  }
  return Object.freeze(
    (plan.seedSettingRefs ?? [])
      .map((ref) => ref.name.trim() || ref.id)
      .filter(Boolean),
  );
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
  /** 훅 설계 두 칸이 다 찼으면 false. */
  readonly needsHookDesign: boolean;
  /** 남기는 질문 줄 — 마지막 장면의 질문 공백 정리본, 없으면 "". */
  readonly hookQuestionLine: string;
}

export type EpisodeHookDesignField = "lastSceneQuestion" | "nextOpening";

export interface EpisodeHookDesignView {
  readonly complete: boolean;
  readonly missing: readonly EpisodeHookDesignField[];
  readonly design: { readonly lastSceneQuestion: string; readonly nextOpening: string };
}

/** 다음 화 훅 설계 두 칸의 공백 정리본과 빈 칸 판정. 공백만 있으면 빈 칸이다. */
export function episodeHookDesign(plan: EpisodePlanWithSynopsis): EpisodeHookDesignView {
  const lastSceneQuestion = plan.hookDesign?.lastSceneQuestion.trim() ?? "";
  const nextOpening = plan.hookDesign?.nextOpening.trim() ?? "";
  const missing: EpisodeHookDesignField[] = [];
  if (!lastSceneQuestion) missing.push("lastSceneQuestion");
  if (!nextOpening) missing.push("nextOpening");
  return Object.freeze({
    complete: missing.length === 0,
    missing: Object.freeze(missing),
    design: Object.freeze({ lastSceneQuestion, nextOpening }),
  });
}

/** QC 브리지 — QC extras와 같은 모양으로 정리된 설계 값을 돌려준다. */
export function episodeHookQcExtras(plan: EpisodePlanWithSynopsis): {
  readonly nextEpisodeHook: { readonly lastSceneQuestion: string; readonly nextOpening: string };
} {
  return Object.freeze({ nextEpisodeHook: episodeHookDesign(plan).design });
}

export function episodeStoryCard(plan: EpisodePlanWithSynopsis): EpisodeStoryCard {
  const goalLine = plan.goal?.trim() || plan.logline.trim();
  const emotionLine = plan.emotionalArc
    ? `${plan.emotionalArc.from} → ${plan.emotionalArc.to}`
    : "";
  const hook = episodeHookDesign(plan);
  return Object.freeze({
    episodeId: plan.episodeId,
    episodeNumber: plan.episodeNumber,
    title: plan.title,
    status: plan.status,
    goalLine,
    emotionLine,
    cliffhangerLine: plan.cliffhanger.trim(),
    needsSynopsis: !(plan.synopsis?.trim() || plan.goal?.trim()),
    needsHookDesign: !hook.complete,
    hookQuestionLine: hook.design.lastSceneQuestion,
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

/**
 * 운영 → 다음 회차 기획 인계 (흐름 F-7).
 *
 * 이전 회차의 마무리 훅을 다음 회차 기획의 오프닝 초안으로 인용한다.
 * - 1순위 재료: 이전 회차 훅 설계의 nextOpening("다음 화 첫 장면이 받을 것").
 *   main 타입에는 아직 없는 선택 확장이므로 구조적 타입으로만 읽는다 —
 *   필드가 없는 레코드에서는 자연히 cliffhanger 로 떨어진다.
 * - 2순위 재료: 이전 회차 cliffhanger(마무리 훅) 원문.
 * 어느 쪽이든 새로 지어내지 않고 앞뒤 공백만 정리한 원문을 그대로 인용한다.
 * 인용은 "초안"이다: 대상 회차의 openingHook 이 이미 차 있으면 덮지 않는다.
 */
export interface EpisodeNextOpeningSource {
  /** 다음 화 첫 장면이 받을 것 — 훅 설계 확장이 있을 때만 존재한다. */
  readonly nextOpening?: string;
}

/** 인용 재료로 읽을 수 있는 이전 회차 기획 (구조적 — core 타입을 그대로 넣을 수 있다). */
export type PreviousEpisodePlanLike = EpisodePlanWithSynopsis & {
  readonly hookDesign?: EpisodeNextOpeningSource;
};

export type NextEpisodeOpeningSourceField = "nextOpening" | "cliffhanger";

export type NextEpisodeOpeningWarning =
  | "previous-cliffhanger-missing"
  | "previous-episode-missing";

export interface NextEpisodeOpeningDraft {
  readonly previousEpisodeId: string;
  readonly previousEpisodeNumber: number;
  readonly previousTitle: string;
  /** 인용 출처 필드. 재료가 없으면 null. */
  readonly sourceField: NextEpisodeOpeningSourceField | null;
  /** 인용 원문 (공백 정리본). 재료가 없으면 "". */
  readonly sourceText: string;
  /** 이전 회차 마무리 훅 원문 (공백 정리본) — 출처가 nextOpening 이어도 함께 보여 준다. */
  readonly cliffhangerText: string;
  /** 다음 회차 openingHook 초안 — sourceText 와 동일 (변형·생성 없음). */
  readonly openingHookDraft: string;
  readonly hasSeed: boolean;
  readonly warnings: readonly NextEpisodeOpeningWarning[];
}

/**
 * 이전 회차 1건 → 다음 회차 오프닝 초안.
 * previous 가 없으면 null (첫 회차 등 — 호출자는 백지 시작이 정상임을 구분할 수 있다).
 */
export function deriveNextEpisodeOpeningDraft(
  previous: PreviousEpisodePlanLike | null | undefined,
): NextEpisodeOpeningDraft | null {
  if (!previous) return null;
  const cliffhangerText = previous.cliffhanger.trim();
  const nextOpeningText = previous.hookDesign?.nextOpening?.trim() ?? "";
  const sourceField: NextEpisodeOpeningSourceField | null = nextOpeningText
    ? "nextOpening"
    : cliffhangerText
      ? "cliffhanger"
      : null;
  const sourceText = sourceField === "nextOpening" ? nextOpeningText : cliffhangerText;
  const warnings: NextEpisodeOpeningWarning[] =
    sourceField === null ? ["previous-cliffhanger-missing"] : [];
  return Object.freeze({
    previousEpisodeId: previous.episodeId,
    previousEpisodeNumber: previous.episodeNumber,
    previousTitle: previous.title,
    sourceField,
    sourceText,
    cliffhangerText,
    openingHookDraft: sourceText,
    hasSeed: sourceField !== null,
    warnings: Object.freeze(warnings),
  });
}

/**
 * 시즌 안에서 대상 회차의 "이전 회차"를 찾는다.
 * 우선순위: SeasonPlan.episodeOrder 의 바로 앞 항목 (연재 순서가 정본).
 * 대상이 순서표에 없거나 앞 항목이 없으면 episodeNumber 가 가장 큰 하위 회차로 폴백한다.
 */
export function findPreviousEpisodePlan(
  season: SeasonPlan | null | undefined,
  plans: readonly PreviousEpisodePlanLike[],
  current: PreviousEpisodePlanLike,
): PreviousEpisodePlanLike | null {
  if (season) {
    const orderIndex = season.episodeOrder.indexOf(current.episodeId);
    if (orderIndex > 0) {
      const byId = new Map(plans.map((plan) => [plan.episodeId, plan]));
      for (let index = orderIndex - 1; index >= 0; index -= 1) {
        const candidate = byId.get(season.episodeOrder[index]!);
        if (candidate && candidate.episodeId !== current.episodeId) return candidate;
      }
    }
  }
  const lower = plans
    .filter(
      (plan) => plan.episodeId !== current.episodeId && plan.episodeNumber < current.episodeNumber,
    )
    .sort((a, b) => b.episodeNumber - a.episodeNumber || a.episodeId.localeCompare(b.episodeId));
  return lower[0] ?? null;
}

export interface NextEpisodeHandoff {
  readonly currentEpisodeId: string;
  /** 이전 회차가 없으면 null — 이 경우 draft 도 null 이다. */
  readonly draft: NextEpisodeOpeningDraft | null;
  /** 대상 openingHook 이 비어 있고 초안 재료가 있을 때만 초안 문자열, 아니면 "". */
  readonly autoFillOpeningHook: string;
  readonly targetHasOpeningHook: boolean;
  readonly warnings: readonly NextEpisodeOpeningWarning[];
}

/**
 * 기획 표면용 인계 묶음: 이전 회차 찾기 + 초안 도출 + 자동 채움 판정을 한 번에 낸다.
 * autoFillOpeningHook 은 "기획을 열었을 때 오프닝 칸에 미리 들어갈 값"이다 —
 * 이미 적힌 오프닝 훅은 절대 덮지 않는다.
 */
export function deriveNextEpisodeHandoff(
  season: SeasonPlan | null | undefined,
  plans: readonly PreviousEpisodePlanLike[],
  current: PreviousEpisodePlanLike,
): NextEpisodeHandoff {
  const previous = findPreviousEpisodePlan(season, plans, current);
  const draft = deriveNextEpisodeOpeningDraft(previous);
  const targetHasOpeningHook = current.openingHook.trim().length > 0;
  const warnings: NextEpisodeOpeningWarning[] = draft
    ? [...draft.warnings]
    : ["previous-episode-missing"];
  return Object.freeze({
    currentEpisodeId: current.episodeId,
    draft,
    autoFillOpeningHook: draft?.hasSeed && !targetHasOpeningHook ? draft.openingHookDraft : "",
    targetHasOpeningHook,
    warnings: Object.freeze(warnings),
  });
}

/**
 * 초안을 대상 기획에 적용한 새 레코드를 돌려준다 (원본 불변).
 * openingHook 이 이미 차 있으면 applied=false 로 같은 레코드를 그대로 돌려준다.
 */
export function applyNextEpisodeOpeningDraft<T extends EpisodePlanWithSynopsis>(
  plan: T,
  draft: NextEpisodeOpeningDraft | null | undefined,
): { readonly plan: T; readonly applied: boolean } {
  if (!draft?.hasSeed || plan.openingHook.trim()) return { plan, applied: false };
  return {
    plan: Object.freeze({ ...plan, openingHook: draft.openingHookDraft }),
    applied: true,
  };
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
  const hookMissing = episodeHookDesign(plan).missing;
  if (hookMissing.length > 0) {
    const names = hookMissing.map((field) =>
      field === "lastSceneQuestion" ? "마지막 장면의 질문" : "다음 화 첫 장면",
    );
    hints.push(`훅 설계가 비어 있어요. ${names.join("·")} 칸을 채워 보세요.`);
  }
  return Object.freeze(hints);
}
