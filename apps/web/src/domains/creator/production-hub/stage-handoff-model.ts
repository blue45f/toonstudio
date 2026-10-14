/**
 * 단계 인계 모델 — 다음 단계를 시작하는 사람이 앞 단계 산출을 그 자리에서
 * 다시 읽을 수 있게, 이미 있는 데이터만 골라 인용 묶음으로 만든다.
 *
 * 원칙:
 * - 없는 내용을 지어내지 않는다. 공백뿐인 칸은 섹션 자체를 만들지 않고,
 *   어떤 소스가 없는지는 `missing` 으로 정직하게 돌려준다.
 * - 새 저장소를 만들지 않는다. 입력은 기획(EpisodePlanWithSynopsis),
 *   캐릭터 시트(StudioStoryCharacter + StudioStoryCharacterProfile),
 *   콘티 비트(StudioStoryBeat) — 전부 기존 정본 타입 그대로다.
 * - 캐릭터 한 줄 특징은 시트의 실재 필드(personality → motivation →
 *   speechStyle 순으로 첫 non-empty)만 쓴다. background·signatureLines·
 *   appearanceNotes 는 인계 요약에 끌어오지 않는다.
 * - 등장 캐릭터의 동결 모델 시트 리비전은 기준본으로 자동 첨부한다
 *   (We-toon 모델 시트 = 모든 회차의 일관성 기준). 동결되지 않은 등장
 *   캐릭터는 숨기지 않고 unfrozenCharacters 로 돌려줘 카드가 안내한다.
 */
import {
  episodeStoryCard,
  type EpisodePlanWithSynopsis,
} from "../planning/studio-episode-synopsis";
import type { StudioStoryCharacterProfile } from "../planning/studio-character-profile";
import type { StudioStoryBeat } from "../studio-storyboard-planner";
import type { StudioStoryCharacter } from "../studio-story-bible";
import {
  frozenModelSheetRevision,
  modelSheetCompleteness,
  type CharacterModelSheet,
} from "./model-sheet-freeze-model";
import type { BilingualLabel } from "./production-labels";
import {
  formatSessionDecisionLine,
  REVIEW_SESSION_SUMMARY_EXPORT_TITLE,
  type ReviewSessionSummaryExport,
} from "./review-session-summary-export";
import {
  EPISODE_STAGE_ORDER,
  episodeStageDefinition,
  type EpisodeStageDefinition,
  type EpisodeStageId,
} from "./production-project-surfaces";

export type StageHandoffSectionKind =
  | "synopsis"
  | "goal"
  | "emotion"
  | "characters"
  | "storyboard"
  | "frozenReferences"
  | "reviewSession";

export type StageHandoffMissingSource =
  | "plan"
  | "characters"
  | "storyboard"
  | "frozenReferences";

/**
 * 캐릭터 인계 요약의 입력 한 건. 이름은 연속성 레코드(StudioStoryCharacter.name),
 * 특징 후보는 서술형 시트(StudioStoryCharacterProfile)의 실재 필드만 받는다.
 * characterId 는 동결 모델 시트와 붙이는 조인 키 — 없으면 기준본 연결에서
 * 제외한다(이름으로 억지 매칭하지 않는다).
 */
export interface StageHandoffCharacterInput {
  readonly characterId?: string | null;
  readonly name: string;
  readonly personality?: string | null;
  readonly motivation?: string | null;
  readonly speechStyle?: string | null;
}

export interface StageHandoffInput {
  readonly plan?: EpisodePlanWithSynopsis | null;
  readonly characters?: readonly StageHandoffCharacterInput[];
  readonly beats?: readonly StudioStoryBeat[];
  /**
   * 동결 모델 시트 레코드(model-sheet-freeze-model 정본). 넘기지 않으면
   * 기준본 동결 여부를 판단하지 않는다 — 모른다고 미동결 안내를
   * 지어내지 않기 위해서다. 빈 배열을 넘기면 "시트 없음 = 미동결"로 본다.
   */
  readonly modelSheets?: readonly CharacterModelSheet[];
  /**
   * 이 회차 검수 기록에 붙은 세션 요약들(review-session-summary-export
   * 정본). 넘기면 가장 최근 세션의 결정 이력이 "검수 세션 결정" 섹션으로
   * 인계에 자동 포함된다. 넘기지 않거나 비어 있으면 섹션을 만들지
   * 않는다 — 세션이 없었다고 없는 결정을 지어내지 않는다.
   */
  readonly reviewSessionSummaries?: readonly ReviewSessionSummaryExport[];
  readonly targetStage: EpisodeStageId;
}

/** 인계 카드에 자동 첨부되는 동결 기준본 한 건. */
export interface StageHandoffFrozenReference {
  readonly characterId: string;
  readonly characterName: string;
  /** 동결된 리비전 번호 (CharacterModelSheet.frozenRevision). */
  readonly revision: number;
  readonly expressionRef: string | null;
  readonly poseRef: string | null;
  readonly assetRefs: readonly string[];
  readonly frozenByName: string | null;
  readonly frozenAt: string | null;
  /** 동결은 됐지만 표정·포즈 중 빠진 기준본 라벨. */
  readonly missingLabels: readonly BilingualLabel[];
}

/** 등장 캐릭터인데 기준본이 동결되지 않은 경우의 안내 항목. */
export interface StageHandoffUnfrozenCharacter {
  readonly characterId: string;
  readonly characterName: string;
  /** no-sheet: 시트 레코드 자체가 없음 · draft: 초안만 있음 · no-frozen-revision: 동결 표시와 리비전이 어긋남. */
  readonly reason: "no-sheet" | "draft" | "no-frozen-revision";
}

export interface StageHandoffSection {
  readonly kind: StageHandoffSectionKind;
  readonly title: BilingualLabel;
  /** 이 인용이 온 앞 단계 — 카드가 출처 단계 표기에 쓴다. */
  readonly sourceStage: EpisodeStageId;
  readonly lines: readonly string[];
}

export interface StageHandoff {
  readonly sections: readonly StageHandoffSection[];
  /** 보여 줄 섹션이 하나도 없으면 true. */
  readonly isEmpty: boolean;
  /** 인용할 내용이 없는 소스. 대상 단계의 섹션 선택과 무관하게 소스 기준으로 판정한다. */
  readonly missing: readonly StageHandoffMissingSource[];
  /** 이 회차 등장 캐릭터의 동결 기준본. modelSheets 를 넘기지 않았으면 빈 배열이다. */
  readonly frozenReferences: readonly StageHandoffFrozenReference[];
  /** 등장 캐릭터 중 기준본이 미동결인 캐릭터 — 카드가 동결 안내를 띄우는 근거. */
  readonly unfrozenCharacters: readonly StageHandoffUnfrozenCharacter[];
}

export const STAGE_HANDOFF_SECTION_TITLES: Readonly<
  Record<StageHandoffSectionKind, BilingualLabel>
> = Object.freeze({
  synopsis: { ko: "줄거리", en: "Synopsis" },
  goal: { ko: "이번 화 목표", en: "Episode goal" },
  emotion: { ko: "감정 변화", en: "Emotional arc" },
  characters: { ko: "캐릭터", en: "Characters" },
  storyboard: { ko: "콘티 구성", en: "Storyboard" },
  frozenReferences: { ko: "동결 기준본", en: "Frozen references" },
  // 제목은 내보내기 모델의 정본 라벨을 그대로 쓴다 (표기 이원화 방지).
  reviewSession: REVIEW_SESSION_SUMMARY_EXPORT_TITLE,
});

const SECTION_SOURCE_STAGE: Readonly<Record<StageHandoffSectionKind, EpisodeStageId>> =
  Object.freeze({
    synopsis: "plan",
    goal: "plan",
    emotion: "plan",
    characters: "plan",
    storyboard: "storyboard",
    // 모델 시트 합의·동결은 캐릭터 디자인 단계 = 기획 단계의 산출이다.
    frozenReferences: "plan",
    // 세션 결정은 검수 단계에서 확정된 기록이다.
    reviewSession: "review",
  });

export const STAGE_HANDOFF_SOURCE_LABELS: Readonly<
  Record<StageHandoffMissingSource, BilingualLabel>
> = Object.freeze({
  plan: { ko: "기획", en: "Planning" },
  characters: { ko: "캐릭터 시트", en: "Character sheets" },
  storyboard: { ko: "콘티", en: "Storyboard" },
  frozenReferences: { ko: "동결 기준본", en: "Frozen references" },
});

const ALL_SECTION_KINDS: readonly StageHandoffSectionKind[] = Object.freeze([
  "synopsis",
  "goal",
  "emotion",
  "characters",
  "storyboard",
  "frozenReferences",
  "reviewSession",
]);

/**
 * 대상 단계에서 보여 줄 섹션과 그 순서. 단계마다 "시작할 때 필요한 것"만
 * 추린다 — 전부를 항상 보여 주면 정작 봐야 할 인용이 묻힌다.
 */
export const STAGE_HANDOFF_SECTION_KINDS: Readonly<
  Record<EpisodeStageId, readonly StageHandoffSectionKind[]>
> = Object.freeze({
  plan: ALL_SECTION_KINDS,
  // as const: Object.freeze 단독으로는 원소가 string 으로 넓어져
  // StageHandoffSectionKind 로 좁혀지지 않는다 (tsc strict 에서 확인).
  storyboard: Object.freeze(["synopsis", "goal", "emotion", "characters", "frozenReferences"] as const),
  // 작화 단계가 기준본을 가장 직접 쓴다 — 콘티·캐릭터와 함께 맨 앞에 둔다.
  art: Object.freeze(["storyboard", "characters", "frozenReferences", "emotion"] as const),
  lettering: Object.freeze(["storyboard", "synopsis"] as const),
  review: ALL_SECTION_KINDS,
  publish: Object.freeze(["synopsis", "goal"] as const),
  operate: ALL_SECTION_KINDS,
});

/**
 * 연속성 캐릭터 + 서술형 시트 → 인계 입력. characterId 로 시트를 붙이고,
 * 요약에 쓰는 필드(personality·motivation·speechStyle)만 추려 넘긴다.
 */
export function stageHandoffCharactersFromSheet(
  characters: readonly StudioStoryCharacter[],
  profiles: readonly StudioStoryCharacterProfile[],
): readonly StageHandoffCharacterInput[] {
  const profileByCharacterId = new Map(
    profiles.map((profile) => [profile.characterId, profile] as const),
  );
  return Object.freeze(
    characters.map((character) => {
      const profile = profileByCharacterId.get(character.id);
      return Object.freeze({
        characterId: character.id,
        name: character.name,
        personality: profile?.personality ?? null,
        motivation: profile?.motivation ?? null,
        speechStyle: profile?.speechStyle ?? null,
      });
    }),
  );
}

function section(
  kind: StageHandoffSectionKind,
  lines: readonly string[],
): StageHandoffSection {
  return Object.freeze({
    kind,
    title: STAGE_HANDOFF_SECTION_TITLES[kind],
    sourceStage: SECTION_SOURCE_STAGE[kind],
    lines: Object.freeze([...lines]),
  });
}

function buildPlanSections(
  plan: EpisodePlanWithSynopsis | null | undefined,
): readonly StageHandoffSection[] {
  if (!plan) return Object.freeze([]);
  const card = episodeStoryCard(plan);
  const sections: StageHandoffSection[] = [];

  // 줄거리: 본문이 있으면 본문, 없으면 한 줄 요약(logline).
  const synopsisText = plan.synopsis?.trim() || plan.logline.trim();
  if (synopsisText) sections.push(section("synopsis", [synopsisText]));

  // 목표: goal 이 실제로 있을 때만. episodeStoryCard 의 goalLine 은
  // logline 폴백을 포함하므로, goal 원문이 비면 섹션을 만들지 않고,
  // 줄거리 섹션에 이미 보이는 문장과 같아도 만들지 않는다(중복 인용 방지).
  const goalText = plan.goal?.trim() ?? "";
  if (goalText && goalText !== synopsisText) {
    sections.push(section("goal", [card.goalLine]));
  }

  // 감정 변화: from/to 중 하나라도 실제로 적혀 있을 때만 "from → to".
  const arc = plan.emotionalArc;
  if (arc && (arc.from.trim() || arc.to.trim())) {
    const from = arc.from.trim();
    const to = arc.to.trim();
    sections.push(section("emotion", [from && to ? `${from} → ${to}` : from || to]));
  }

  return Object.freeze(sections);
}

function buildCharacterSection(
  characters: readonly StageHandoffCharacterInput[] | undefined,
): StageHandoffSection | null {
  if (!characters) return null;
  const lines: string[] = [];
  for (const character of characters) {
    const name = character.name.trim();
    if (!name) continue;
    const trait =
      character.personality?.trim() ||
      character.motivation?.trim() ||
      character.speechStyle?.trim() ||
      "";
    lines.push(trait ? `${name} — ${trait}` : name);
  }
  return lines.length > 0 ? section("characters", lines) : null;
}

function buildStoryboardSection(
  beats: readonly StudioStoryBeat[] | undefined,
): StageHandoffSection | null {
  if (!beats || beats.length === 0) return null;
  const ordered = [...beats].sort((a, b) => a.order - b.order);
  const sceneCount = new Set(beats.map((beat) => beat.sceneId)).size;
  const lines: string[] = [`장면 ${sceneCount} · 비트 ${beats.length}`];
  // 장면 리드: 장면이 바뀌는 첫 비트의 summary 를 순서대로, 최대 3개.
  const seenScenes = new Set<string>();
  for (const beat of ordered) {
    if (lines.length >= 4) break;
    if (seenScenes.has(beat.sceneId)) continue;
    seenScenes.add(beat.sceneId);
    const summary = beat.summary.trim();
    if (summary) lines.push(summary);
  }
  return section("storyboard", lines);
}

/**
 * "이 회차에 등장하는 캐릭터"의 판정 — 시즌 비트 보드와 같은 정본 규칙을
 * 쓴다: 콘티 비트의 characterIds 와 회차 계획의 characterRefs 가 등장
 * 근거다. 둘 다 근거를 주지 않을 때만, 호출부가 넘긴 캐릭터 목록 자체를
 * 등장 목록으로 본다(호출부가 이미 회차 기준으로 골라 넘긴 경우).
 * 순서는 근거 등장 순서(계획 characterRefs → 비트 등장 순)를 유지하고,
 * 이름은 characters 입력에서만 찾는다 — 없으면 ID를 그대로 표시한다
 * (이름을 지어내지 않는다).
 */
export function episodeCharacterIdsForHandoff(
  input: Pick<StageHandoffInput, "plan" | "characters" | "beats">,
): readonly string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const id = raw.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const ref of input.plan?.characterRefs ?? []) push(ref);
  if (input.beats) {
    const ordered = [...input.beats].sort((a, b) => a.order - b.order);
    for (const beat of ordered) for (const id of beat.characterIds) push(id);
  }
  if (ids.length > 0) return Object.freeze(ids);
  for (const character of input.characters ?? []) {
    if (character.characterId) push(character.characterId);
  }
  return Object.freeze(ids);
}

export interface StageHandoffFrozenAttachment {
  readonly references: readonly StageHandoffFrozenReference[];
  readonly unfrozen: readonly StageHandoffUnfrozenCharacter[];
  /** modelSheets 자체를 넘기지 않아 동결 여부를 판단하지 않은 경우 true. */
  readonly notEvaluated: boolean;
}

/**
 * 등장 캐릭터의 동결 모델 시트 리비전을 기준본으로 붙인다.
 * 동결 판정·리비전 해석은 model-sheet-freeze-model 정본
 * (frozenModelSheetRevision·modelSheetCompleteness)을 그대로 쓴다.
 */
export function buildFrozenReferenceAttachment(
  input: Pick<StageHandoffInput, "plan" | "characters" | "beats" | "modelSheets">,
): StageHandoffFrozenAttachment {
  if (!input.modelSheets) {
    return Object.freeze({
      references: Object.freeze([]),
      unfrozen: Object.freeze([]),
      notEvaluated: true,
    });
  }
  const nameById = new Map<string, string>();
  for (const character of input.characters ?? []) {
    if (character.characterId && character.name.trim()) {
      nameById.set(character.characterId, character.name.trim());
    }
  }
  const sheetById = new Map(input.modelSheets.map((sheet) => [sheet.characterId, sheet]));
  const references: StageHandoffFrozenReference[] = [];
  const unfrozen: StageHandoffUnfrozenCharacter[] = [];
  for (const characterId of episodeCharacterIdsForHandoff(input)) {
    const characterName = nameById.get(characterId) ?? characterId;
    const sheet = sheetById.get(characterId);
    if (!sheet) {
      unfrozen.push(Object.freeze({ characterId, characterName, reason: "no-sheet" }));
      continue;
    }
    if (sheet.status !== "frozen") {
      unfrozen.push(Object.freeze({ characterId, characterName, reason: "draft" }));
      continue;
    }
    const revision = frozenModelSheetRevision(sheet);
    if (!revision || sheet.frozenRevision === null) {
      unfrozen.push(Object.freeze({ characterId, characterName, reason: "no-frozen-revision" }));
      continue;
    }
    references.push(
      Object.freeze({
        characterId,
        characterName,
        revision: sheet.frozenRevision,
        expressionRef: revision.expressionRef,
        poseRef: revision.poseRef,
        assetRefs: Object.freeze([...revision.assetRefs]),
        frozenByName: sheet.frozenByName,
        frozenAt: sheet.frozenAt,
        missingLabels: modelSheetCompleteness(revision).missingLabels,
      }),
    );
  }
  return Object.freeze({
    references: Object.freeze(references),
    unfrozen: Object.freeze(unfrozen),
    notEvaluated: false,
  });
}

function buildFrozenReferenceSection(
  references: readonly StageHandoffFrozenReference[],
): StageHandoffSection | null {
  if (references.length === 0) return null;
  const lines = references.map((reference) => {
    const parts: string[] = [`${reference.characterName} — 동결 기준본 ${reference.revision}판`];
    if (reference.expressionRef) parts.push(`표정 ${reference.expressionRef}`);
    if (reference.poseRef) parts.push(`포즈 ${reference.poseRef}`);
    if (reference.assetRefs.length > 0) parts.push(`기타 기준 ${reference.assetRefs.length}개`);
    if (reference.missingLabels.length > 0) {
      parts.push(`빠진 기준본: ${reference.missingLabels.map((label) => label.ko).join(", ")}`);
    }
    return parts.join(" · ");
  });
  return section("frozenReferences", lines);
}

/** 인계 섹션에 싣는 판정 줄 상한. 넘치면 "외 N건"으로 접어 기록 존재를 알린다. */
const REVIEW_SESSION_SECTION_DECISION_CAP = 10;

function buildReviewSessionSection(
  summaries: readonly ReviewSessionSummaryExport[] | undefined,
): StageHandoffSection | null {
  if (!summaries || summaries.length === 0) return null;
  // 대표 인용은 가장 최근에 끝난 세션. 이전 세션은 검수 기록 장부에 남는다.
  const latest = [...summaries].sort((a, b) => a.endedAt.localeCompare(b.endedAt)).at(-1);
  if (!latest) return null;
  const lines: string[] = [latest.headline];
  const shown = latest.decisions.slice(0, REVIEW_SESSION_SECTION_DECISION_CAP);
  for (const decision of shown) lines.push(formatSessionDecisionLine(decision));
  const rest = latest.decisions.length - shown.length;
  if (rest > 0) lines.push(`외 ${rest}건 — 검수 기록에서 전체를 볼 수 있어요`);
  if (summaries.length > 1) lines.push(`이전 세션 ${summaries.length - 1}건도 검수 기록에 남아 있어요`);
  return section("reviewSession", lines);
}

export function buildStageHandoff(input: StageHandoffInput): StageHandoff {
  const planSections = buildPlanSections(input.plan);
  const characterSection = buildCharacterSection(input.characters);
  const storyboardSection = buildStoryboardSection(input.beats);
  const frozenAttachment = buildFrozenReferenceAttachment(input);
  const frozenSection = buildFrozenReferenceSection(frozenAttachment.references);
  const reviewSessionSection = buildReviewSessionSection(input.reviewSessionSummaries);

  const byKind = new Map<StageHandoffSectionKind, StageHandoffSection>();
  for (const entry of planSections) byKind.set(entry.kind, entry);
  if (characterSection) byKind.set("characters", characterSection);
  if (storyboardSection) byKind.set("storyboard", storyboardSection);
  if (frozenSection) byKind.set("frozenReferences", frozenSection);
  if (reviewSessionSection) byKind.set("reviewSession", reviewSessionSection);

  const wanted = STAGE_HANDOFF_SECTION_KINDS[input.targetStage];
  const sections = Object.freeze(
    wanted
      .map((kind) => byKind.get(kind))
      .filter((entry): entry is StageHandoffSection => entry !== undefined),
  );

  const missing: StageHandoffMissingSource[] = [];
  if (planSections.length === 0) missing.push("plan");
  if (!characterSection) missing.push("characters");
  if (!storyboardSection) missing.push("storyboard");
  // 동결 기준본 missing 은 "등장 캐릭터가 있는데 동결본이 하나도 없을 때"만.
  // 판단 재료(modelSheets)를 받지 않았으면 모른다고 missing 으로 단정하지 않는다.
  if (
    !frozenAttachment.notEvaluated &&
    frozenAttachment.references.length === 0 &&
    frozenAttachment.unfrozen.length > 0
  ) {
    missing.push("frozenReferences");
  }

  return Object.freeze({
    sections,
    isEmpty: sections.length === 0,
    missing: Object.freeze(missing),
    frozenReferences: frozenAttachment.references,
    unfrozenCharacters: frozenAttachment.unfrozen,
  });
}

/**
 * 빈 상태에서 안내할 "앞 단계". 대상 단계의 바로 앞 단계이며,
 * 대상이 첫 단계(plan)이면 기획 자체가 앞 단계다.
 */
export function previousEpisodeStage(targetStage: EpisodeStageId): EpisodeStageDefinition {
  const index = EPISODE_STAGE_ORDER.indexOf(targetStage);
  const previousId = index > 0 ? EPISODE_STAGE_ORDER[index - 1] : "plan";
  return episodeStageDefinition(previousId ?? "plan");
}
