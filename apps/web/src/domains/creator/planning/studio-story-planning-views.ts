/**
 * 프로젝트 기획(story) 표면의 7대 뷰 레지스트리와 보드별 순수 상태 어댑터.
 *
 * - 뷰 ID·한영 라벨은 `studio-project-views.ts`의 정본(`STUDIO_PROJECT_VIEW_LABELS.story`)을
 *   단일 출처로 삼아 이름 불일치를 막는다.
 * - 플롯라인 타임라인·복선 장부·사실 색인의 상태 도출과 양방향 반영 계산을
 *   순수 함수로 분리해 `StudioProjectStoryPlanning.tsx`의 크기와 책임을 억제한다.
 */
import type { SeasonPlan } from "@toonstudio/core/production";

import { STUDIO_PROJECT_VIEW_LABELS, type StudioProjectView } from "../studio-project-views";
import type { StudioStoryBible } from "../studio-story-bible";
import type { CharacterAppearanceRecord } from "./studio-character-coverage";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";
import {
  factTermsFromBible,
  factTermsFromLore,
  proposeManuscriptFix,
  recordFactCheck,
  type FactCheckVerdict,
  type FactConcordance,
  type FactConcordanceSideData,
  type FactTerm,
  type PublishedFactEpisode,
  type PublishedFactSegment,
} from "./studio-fact-concordance";
import {
  createForeshadowSeed,
  type ForeshadowSeed,
  type ForeshadowVisibility,
} from "./studio-foreshadow-ledger";
import type { StudioProjectPlanningState } from "./studio-planning-store";
import {
  MAIN_PLOTLINE_ID,
  applyTimelineToEpisodePlans,
  derivePlotlineCardsFromPlans,
  orderedEpisodePlans,
  type PlotlineCard,
} from "./studio-plotline-timeline";
import { isLoreEntryRetired, type StudioWorldLore } from "./studio-world-lore";

export const STUDIO_STORY_PLANNING_VIEWS = [
  "episodes",
  "characters",
  "world",
  "timeline",
  "relations",
  "foreshadow",
  "concordance",
] as const satisfies readonly StudioProjectView<"story">[];

export type StudioProjectStoryPlanningView = (typeof STUDIO_STORY_PLANNING_VIEWS)[number];

export interface StudioStoryPlanningViewItem {
  readonly id: StudioProjectStoryPlanningView;
  readonly indexLabel: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

const VIEW_SUMMARIES: Readonly<
  Record<StudioProjectStoryPlanningView, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  episodes: Object.freeze({
    ko: "회차 줄거리, 시즌 비트 보드, 캐릭터 등장 맵을 한 흐름으로 정리합니다.",
    en: "Plan episode synopses, the season beat board, and character coverage together.",
  }),
  characters: Object.freeze({
    ko: "캐릭터 성격, 말투, 대표 대사와 인물 관계를 시트로 관리합니다.",
    en: "Maintain character traits, voice notes, signature lines, and relationships.",
  }),
  world: Object.freeze({
    ko: "장소, 세력, 종족, 규칙, 사건을 설정 허브에 정본으로 기록합니다.",
    en: "Author canonical locations, factions, species, rules, and world events.",
  }),
  timeline: Object.freeze({
    ko: "플롯라인별 회차 비트 카드를 배치하고 세계관 연표를 시간순으로 확인합니다.",
    en: "Arrange plotline beat cards across episodes and inspect the world chronology.",
  }),
  relations: Object.freeze({
    ko: "세계관 설정 항목과 바이블 캐릭터 사이의 연결을 관계도로 확인합니다.",
    en: "Inspect connections across world lore entries and story-bible characters.",
  }),
  foreshadow: Object.freeze({
    ko: "심은 복선과 회수 예정 구간을 장부로 추적하고 상태를 직접 갱신합니다.",
    en: "Track planted foreshadowing seeds, payoff windows, and manual status updates.",
  }),
  concordance: Object.freeze({
    ko: "회차 기획 본문에서 역추출한 사실 색인을 설정집과 대조하고 수정 기록을 남깁니다.",
    en: "Cross-check reverse-extracted terms against canonical lore and log manuscript fixes.",
  }),
});

export const STUDIO_STORY_PLANNING_VIEW_ITEMS: readonly StudioStoryPlanningViewItem[] =
  Object.freeze(
    STUDIO_STORY_PLANNING_VIEWS.map((id, index) => {
      const canonical = STUDIO_PROJECT_VIEW_LABELS.story[id];
      const summary = VIEW_SUMMARIES[id];
      return Object.freeze({
        id,
        indexLabel: String(index + 1).padStart(2, "0"),
        labelKo: canonical?.ko ?? id,
        labelEn: canonical?.en ?? id,
        summaryKo: summary.ko,
        summaryEn: summary.en,
      });
    }),
  );

export function isStudioStoryPlanningView(value: unknown): value is StudioProjectStoryPlanningView {
  return (
    typeof value === "string" &&
    (STUDIO_STORY_PLANNING_VIEWS as readonly string[]).includes(value)
  );
}

/** 알 수 없는 뷰가 들어와도 캐릭터 시트로 오분류하지 않고 기본(episodes)으로 안전 복귀한다. */
export function normalizeStudioStoryPlanningView(value: unknown): StudioProjectStoryPlanningView {
  return isStudioStoryPlanningView(value) ? value : "episodes";
}

export function studioStoryPlanningViewItem(
  view: StudioProjectStoryPlanningView,
): StudioStoryPlanningViewItem {
  return (
    STUDIO_STORY_PLANNING_VIEW_ITEMS.find((item) => item.id === view) ??
    STUDIO_STORY_PLANNING_VIEW_ITEMS[0]!
  );
}

/** WAI-ARIA tablist 키보드 탐색(ArrowLeft / ArrowRight / Home / End). */
export function nextStoryPlanningTabView(
  current: StudioProjectStoryPlanningView,
  key: string,
): StudioProjectStoryPlanningView | null {
  const index = STUDIO_STORY_PLANNING_VIEWS.indexOf(current);
  if (index < 0) return null;
  const last = STUDIO_STORY_PLANNING_VIEWS.length - 1;
  if (key === "ArrowRight") return STUDIO_STORY_PLANNING_VIEWS[index === last ? 0 : index + 1] ?? null;
  if (key === "ArrowLeft") return STUDIO_STORY_PLANNING_VIEWS[index === 0 ? last : index - 1] ?? null;
  if (key === "Home") return STUDIO_STORY_PLANNING_VIEWS[0];
  if (key === "End") return STUDIO_STORY_PLANNING_VIEWS[last] ?? null;
  return null;
}

/** 회차 플랜의 등장 태그(characterRefs)를 커버리지 맵 입력으로 변환한다. */
export function deriveCharacterAppearancesFromPlans(
  plans: readonly EpisodePlanWithSynopsis[],
): readonly CharacterAppearanceRecord[] {
  return Object.freeze(
    plans.flatMap((plan) =>
      plan.characterRefs.map((characterId) =>
        Object.freeze({
          episodeId: plan.episodeId,
          characterId,
          costumeId: null,
          appearanceId: null,
          expression: null,
          cutCount: 0,
        }),
      ),
    ),
  );
}

/**
 * 플롯라인 카드와 회차 플랜(`turningPoints`)의 양방향 동기화:
 * 메인 플롯라인 제목 목록이 이미 모든 회차 플랜과 같으면 템플릿 메모와
 * 비메인 아크 카드를 유지하고, 외부 편집으로 달라졌으면 메인 카드만 재구성한다.
 */
export function reconcilePlotlineCardsWithPlans(
  currentCards: readonly PlotlineCard[],
  plans: readonly EpisodePlanWithSynopsis[],
): readonly PlotlineCard[] {
  if (currentCards.length === 0) return derivePlotlineCardsFromPlans(plans);
  const scopeIds = plans.map((plan) => plan.episodeId);
  const projected = applyTimelineToEpisodePlans(plans, currentCards, scopeIds);
  if (projected.every((plan, index) => plan === plans[index])) return currentCards;

  const previousMainByKey = new Map<string, PlotlineCard>();
  for (const card of currentCards) {
    if (card.plotlineId !== MAIN_PLOTLINE_ID) continue;
    const key = `${card.episodeId}::${card.title}`;
    if (!previousMainByKey.has(key)) previousMainByKey.set(key, card);
  }
  const rebuiltMain = derivePlotlineCardsFromPlans(plans).map((card) => {
    const existing = previousMainByKey.get(`${card.episodeId}::${card.title}`);
    return existing
      ? Object.freeze({
          ...card,
          id: existing.id,
          summary: existing.summary,
          templateBeatKey: existing.templateBeatKey,
        })
      : card;
  });
  const otherTrackCards = currentCards.filter((card) => card.plotlineId !== MAIN_PLOTLINE_ID);
  return Object.freeze([...rebuiltMain, ...otherTrackCards]);
}

/** 타임라인 카드 이동·템플릿 적용 결과를 기획 저장소 스냅샷에 반영한다. */
export function applyPlotlineCardsToPlanningState(
  planning: StudioProjectPlanningState,
  nextCards: readonly PlotlineCard[],
): StudioProjectPlanningState | null {
  const scopeIds = planning.plans.map((plan) => plan.episodeId);
  const updatedPlans = applyTimelineToEpisodePlans(planning.plans, nextCards, scopeIds);
  let changed = false;
  const nextPlans = updatedPlans.map((plan, index) => {
    const previous = planning.plans[index];
    if (!previous || plan === previous) return plan;
    changed = true;
    return Object.freeze({ ...plan, revision: previous.revision + 1 });
  });
  if (!changed) return null;
  return Object.freeze({ ...planning, plans: Object.freeze(nextPlans) });
}

export function buildForeshadowEpisodeOptions(
  season: SeasonPlan,
  plans: readonly EpisodePlanWithSynopsis[],
): readonly { readonly episodeId: string; readonly episodeNumber: number; readonly title: string }[] {
  return Object.freeze(
    orderedEpisodePlans(season, plans).map((plan) =>
      Object.freeze({
        episodeId: plan.episodeId,
        episodeNumber: plan.episodeNumber,
        title: plan.title,
      }),
    ),
  );
}

/** 복선 카드에서 연결할 수 있는 설정 옵션 — 바이블 사실과 활성 세계관 항목을 합친다. */
export function buildForeshadowFactOptions(
  bible: StudioStoryBible | null,
  lore: StudioWorldLore | null,
): readonly { readonly id: string; readonly label: string }[] {
  const seen = new Set<string>();
  const options: { readonly id: string; readonly label: string }[] = [];
  for (const fact of bible?.facts ?? []) {
    if (seen.has(fact.id)) continue;
    seen.add(fact.id);
    options.push(Object.freeze({ id: fact.id, label: fact.label }));
  }
  for (const entry of lore?.entries ?? []) {
    if (isLoreEntryRetired(entry) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    options.push(Object.freeze({ id: entry.id, label: entry.name }));
  }
  return Object.freeze(options);
}

export interface PlanningForeshadowDraftInput {
  readonly title: string;
  readonly note: string;
  readonly plantedEpisodeId: string;
  readonly payoffFromEpisodeId: string | null;
  readonly payoffToEpisodeId: string | null;
  readonly linkedFactIds: readonly string[];
  readonly linkedCharacterIds: readonly string[];
  readonly visibility: ForeshadowVisibility;
}

export function createForeshadowSeedFromDraft(
  projectId: string,
  existingSeeds: readonly ForeshadowSeed[],
  draft: PlanningForeshadowDraftInput,
  now = new Date().toISOString(),
): ForeshadowSeed {
  const prefix = `seed:${projectId}:`;
  let maxNumber = existingSeeds.length;
  for (const seed of existingSeeds) {
    if (!seed.id.startsWith(prefix)) continue;
    const parsed = Number.parseInt(seed.id.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed > maxNumber) maxNumber = parsed;
  }
  return createForeshadowSeed({
    id: `${prefix}${maxNumber + 1}`,
    projectId,
    title: draft.title,
    note: draft.note,
    plantedIn: { episodeId: draft.plantedEpisodeId },
    expectedPayoff: draft.payoffFromEpisodeId
      ? { fromEpisodeId: draft.payoffFromEpisodeId, toEpisodeId: draft.payoffToEpisodeId }
      : undefined,
    linkedFactIds: draft.linkedFactIds,
    linkedCharacterIds: draft.linkedCharacterIds,
    visibility: draft.visibility,
    now,
  });
}

export const DEFAULT_CONCORDANCE_EPISODE_AUTHOR_ID = "story-author";
export const DEFAULT_CONCORDANCE_CHECKER_ID = "story-checker";

/** 기획 회차 플랜의 실제 작성 문장만 모아 사실 색인 역추출 입력으로 변환한다. */
export function buildPublishedEpisodesFromPlanning(
  season: SeasonPlan,
  plans: readonly EpisodePlanWithSynopsis[],
  authorId = DEFAULT_CONCORDANCE_EPISODE_AUTHOR_ID,
): readonly PublishedFactEpisode[] {
  return Object.freeze(
    orderedEpisodePlans(season, plans).map((plan, index) => {
      const segments: PublishedFactSegment[] = [];
      const pushSegment = (suffix: string, rawText: string | undefined) => {
        const text = rawText?.trim() ?? "";
        if (!text) return;
        segments.push(
          Object.freeze({
            id: `${plan.episodeId}:${suffix}`,
            kind: "narration" as const,
            speakerId: null,
            text,
          }),
        );
      };
      pushSegment("logline", plan.logline);
      pushSegment("goal", plan.goal);
      pushSegment("openingHook", plan.openingHook);
      pushSegment("coreConflict", plan.coreConflict);
      pushSegment("synopsis", plan.synopsis);
      plan.turningPoints.forEach((point, pointIndex) => pushSegment(`tp-${pointIndex + 1}`, point));
      pushSegment("cliffhanger", plan.cliffhanger);

      const trimmedTitle = plan.title.trim();
      const label =
        trimmedTitle && trimmedTitle !== `${plan.episodeNumber}화`
          ? `${plan.episodeNumber}화 ${trimmedTitle}`
          : `${plan.episodeNumber}화`;

      return Object.freeze({
        id: plan.episodeId,
        label,
        order: index + 1,
        authorId,
        segments: Object.freeze(segments),
      });
    }),
  );
}

/** 스토리 바이블 + 활성 세계관 로어의 모든 정본 용어를 사실 색인 대조 사전으로 합친다. */
export function buildFactConcordanceTerms(
  bible: StudioStoryBible | null,
  lore: StudioWorldLore | null,
): readonly FactTerm[] {
  const seen = new Set<string>();
  const terms: FactTerm[] = [];
  for (const term of [
    ...(bible ? factTermsFromBible(bible) : []),
    ...(lore ? factTermsFromLore(lore) : []),
  ]) {
    if (seen.has(term.id)) continue;
    seen.add(term.id);
    terms.push(term);
  }
  return Object.freeze(terms);
}

function nextConcordanceRecordId(prefix: "chk" | "fix", existingIds: readonly string[]): string {
  const pattern = `${prefix}:`;
  let maxNumber = existingIds.length;
  for (const id of existingIds) {
    if (!id.startsWith(pattern)) continue;
    const parsed = Number.parseInt(id.slice(pattern.length), 10);
    if (Number.isFinite(parsed) && parsed > maxNumber) maxNumber = parsed;
  }
  return `${prefix}:${maxNumber + 1}`;
}

export function appendConcordanceCheck(
  sideData: FactConcordanceSideData,
  concordance: FactConcordance,
  episodes: readonly PublishedFactEpisode[],
  input: {
    readonly entryKey: string;
    readonly checkerId: string;
    readonly verdict: FactCheckVerdict;
    readonly note: string;
    readonly checkedAt?: string;
  },
): { readonly next: FactConcordanceSideData; readonly error: string | null } {
  const result = recordFactCheck(sideData.checks, concordance, episodes, {
    id: nextConcordanceRecordId("chk", sideData.checks.map((item) => item.id)),
    entryKey: input.entryKey,
    checkerId: input.checkerId,
    verdict: input.verdict,
    note: input.note,
    checkedAt: input.checkedAt ?? new Date().toISOString().slice(0, 10),
  });
  if (result.error) return { next: sideData, error: result.error };
  return { next: Object.freeze({ ...sideData, checks: result.records }), error: null };
}

export function appendConcordanceManuscriptFix(
  sideData: FactConcordanceSideData,
  input: {
    readonly entryKey: string;
    readonly episodeId: string;
    readonly segmentId: string;
    readonly before: string;
    readonly after: string;
    readonly reason: string;
    readonly actorId: string;
    readonly at?: string;
  },
): { readonly next: FactConcordanceSideData; readonly error: string | null } {
  const result = proposeManuscriptFix(sideData.fixes, {
    id: nextConcordanceRecordId("fix", sideData.fixes.map((item) => item.id)),
    entryKey: input.entryKey,
    episodeId: input.episodeId,
    segmentId: input.segmentId,
    before: input.before,
    after: input.after,
    reason: input.reason,
    actorId: input.actorId || DEFAULT_CONCORDANCE_CHECKER_ID,
    at: input.at ?? new Date().toISOString().slice(0, 10),
  });
  if (result.error) return { next: sideData, error: result.error };
  return { next: Object.freeze({ ...sideData, fixes: result.records }), error: null };
}
