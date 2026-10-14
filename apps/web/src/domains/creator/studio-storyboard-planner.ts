export type StudioStoryBeatKind = "setup" | "dialogue" | "action" | "reaction" | "reveal" | "transition";
export type StudioShotSize = "extreme-wide" | "wide" | "medium" | "close-up" | "extreme-close-up";

export interface StudioStoryBeat {
  readonly id: string;
  readonly sceneId: string;
  readonly order: number;
  readonly kind: StudioStoryBeatKind;
  readonly summary: string;
  readonly dialogue: string;
  readonly characterIds: readonly string[];
  readonly locationId: string | null;
  /**
   * 이 비트가 속한 회차 (흐름 F-3 콘티→작화 인계).
   * optional 인 것은 회차 연결 전에 저장된 기존 비트를 깨지 않기 위해서다 —
   * 값이 있으면 비트·샷·계획이 그 회차로 구조적으로 묶이고, 없으면 계획의
   * episodeId 는 null 이 된다(어느 회차 것인지 단정하지 않음).
   */
  readonly episodeId?: string | null;
}

export interface StudioStoryboardShot {
  readonly id: string;
  readonly beatId: string;
  readonly sceneId: string;
  /** 출처 비트의 회차. 비트에 회차 연결이 없으면 null. */
  readonly episodeId: string | null;
  readonly order: number;
  readonly shotSize: StudioShotSize;
  readonly camera: string;
  readonly composition: string;
  readonly reserveDialogueAreaRatio: number;
  readonly scrollGapAfterPx: number;
  readonly estimatedHeightPx: number;
}

export interface StudioStoryboardPlan {
  readonly status: "ready" | "review";
  /**
   * 모든 비트가 같은 회차를 가리킬 때만 그 회차 id. 회차 연결이 없는 비트만
   * 있거나 서로 다른 회차가 섞이면 null — 섞인 경우에는 warnings 에
   * `episode-mixed:<id,id>` 가 남고 status 는 review 가 된다.
   */
  readonly episodeId: string | null;
  readonly shots: readonly StudioStoryboardShot[];
  readonly estimatedCanvasHeightPx: number;
  readonly warnings: readonly string[];
}

const SHOT_BY_KIND: Readonly<Record<StudioStoryBeatKind, StudioShotSize>> = {
  setup: "wide",
  dialogue: "medium",
  action: "wide",
  reaction: "close-up",
  reveal: "extreme-close-up",
  transition: "extreme-wide",
};

const CAMERA_BY_KIND: Readonly<Record<StudioStoryBeatKind, string>> = {
  setup: "eye-level establishing",
  dialogue: "shot-reverse-shot",
  action: "dynamic three-quarter",
  reaction: "eye-line close-up",
  reveal: "controlled push-in",
  transition: "environmental bridge",
};

function dialogueRatio(text: string): number {
  if (!text.trim()) return 0.12;
  return Math.min(0.42, 0.16 + text.length / 240);
}

function shotHeight(kind: StudioStoryBeatKind): number {
  if (kind === "action") return 900;
  if (kind === "reveal") return 780;
  if (kind === "transition") return 520;
  return 680;
}

export function planStudioStoryboard(
  beats: readonly StudioStoryBeat[],
): StudioStoryboardPlan {
  if (beats.length === 0) throw new Error("Storyboard planning requires at least one story beat.");
  const ids = beats.map((beat) => beat.id);
  if (new Set(ids).size !== ids.length) throw new Error("Story beat ids must be unique.");
  const ordered = [...beats].sort((left, right) => left.order - right.order);
  const orders = ordered.map((beat) => beat.order);
  if (new Set(orders).size !== orders.length) throw new Error("Story beat order must be unique.");
  const warnings: string[] = [];
  // 회차 연결 (흐름 F-3): 비트별 episodeId 를 정규화한다. 빈 문자열은
  // "연결 없음"이 아니라 잘못된 값이라 거부한다 — 조용히 다른 회차로
  // 새는 것보다 시작점에서 드러나는 편이 안전하다.
  const beatEpisodeIds = ordered.map((beat) => {
    if (beat.episodeId === undefined || beat.episodeId === null) return null;
    const episodeId = beat.episodeId.trim();
    if (!episodeId) {
      throw new Error("Story beats require a valid episodeId when one is provided.");
    }
    return episodeId;
  });
  const distinctEpisodeIds = [...new Set(beatEpisodeIds.filter((value) => value !== null))];
  if (distinctEpisodeIds.length > 1) {
    warnings.push(`episode-mixed:${distinctEpisodeIds.join(",")}`);
  }
  const planEpisodeId = distinctEpisodeIds.length === 1 ? distinctEpisodeIds[0]! : null;
  const shots = ordered.map((beat, index): StudioStoryboardShot => {
    if (!beat.id.trim() || !beat.sceneId.trim() || !beat.summary.trim()
      || !Number.isSafeInteger(beat.order) || beat.order < 0) {
      throw new Error("Story beats require valid ids, order and summaries.");
    }
    if (beat.kind === "dialogue" && beat.dialogue.length > 100) {
      warnings.push(`long-dialogue:${beat.id}`);
    }
    if ((beat.kind === "dialogue" || beat.kind === "reaction") && beat.characterIds.length === 0) {
      warnings.push(`character-missing:${beat.id}`);
    }
    const next = ordered[index + 1];
    const sceneBreak = next !== undefined && next.sceneId !== beat.sceneId;
    const scrollGapAfterPx = sceneBreak
      ? 240
      : beat.kind === "reveal" ? 180 : beat.kind === "action" ? 60 : 100;
    return Object.freeze({
      id: `shot:${beat.id}`,
      beatId: beat.id,
      sceneId: beat.sceneId,
      episodeId: beatEpisodeIds[index] ?? null,
      order: index,
      shotSize: SHOT_BY_KIND[beat.kind],
      camera: CAMERA_BY_KIND[beat.kind],
      composition: beat.characterIds.length > 1 ? "multi-character readable staging" : "single focal subject",
      reserveDialogueAreaRatio: dialogueRatio(beat.dialogue),
      scrollGapAfterPx,
      estimatedHeightPx: shotHeight(beat.kind),
    });
  });
  const estimatedCanvasHeightPx = shots.reduce(
    (sum, shot) => sum + shot.estimatedHeightPx + shot.scrollGapAfterPx,
    0,
  );
  return Object.freeze({
    status: warnings.length > 0 ? "review" : "ready",
    episodeId: planEpisodeId,
    shots: Object.freeze(shots),
    estimatedCanvasHeightPx,
    warnings: Object.freeze(warnings),
  });
}

/**
 * 기획(EpisodePlan) → 콘티 비트 자동 시딩 (흐름 F-1).
 *
 * 기획 표면에서 이미 채운 회차 기획을 콘티 시작점으로 그대로 넘긴다.
 * 지금까지는 planStudioStoryboard 가 비트만 입력받아, 작가가 핵심 사건
 * (turningPoints)·오프닝 훅·마무리 훅을 콘티에서 다시 써야 했고
 * targetCutCount 는 콘티 규모 판단에 전혀 닿지 않았다.
 *
 * - 입력은 core EpisodePlan 에서 시딩에 필요한 필드만 뽑은 구조적 타입이라
 *   EpisodePlan 레코드가 그대로 들어가고, 이 모듈은 core 를 import 하지 않는다.
 * - 도출 규칙은 결정적이다: 오프닝 훅 → setup 비트 1개, 핵심 사건은 원래
 *   순서대로 action 비트, 마무리 훅 → reveal 비트(마지막). 빈 문자열인
 *   필드는 비트를 만들지 않고 warnings 로만 알린다(지어내지 않음).
 * - characterRefs 는 모든 비트의 characterIds 로, locationRefs 의 첫 항목은
 *   locationId 로 인용한다. 기획에 없는 대사는 만들지 않는다(dialogue 는 "").
 * - targetCutCount 는 비트별 컷 배분(cutAllocations)으로 반영한다: 합이
 *   목표 컷 수와 정확히 같고, 나머지는 앞 비트부터 1개씩 더 받는다.
 *   목표가 없거나(0 이하·비정수) 비트 수보다 적으면 warnings 로 드러낸다.
 * - 산출 비트는 일반 StudioStoryBeat 와 완전히 같은 형태라, 작가가 그대로
 *   편집하고 planStudioStoryboard 에 바로 넣을 수 있다.
 */

export type EpisodePlanBeatSeedField = "openingHook" | "turningPoint" | "cliffhanger";

/** EpisodePlan 에서 비트 시딩에 필요한 최소 필드. core EpisodePlan 이 구조적으로 그대로 들어간다. */
export interface EpisodePlanBeatSeedSource {
  readonly episodeId: string;
  readonly openingHook: string;
  readonly turningPoints: readonly string[];
  readonly cliffhanger: string;
  readonly characterRefs: readonly string[];
  /** 있으면 첫 항목을 비트 locationId 로 쓴다. EpisodePlan.locationRefs 가 그대로 들어간다. */
  readonly locationRefs?: readonly string[];
  readonly targetCutCount: number;
}

export interface DeriveStoryBeatsFromPlanOptions {
  /** 비트 id 접두. 기본값은 `plan-<episodeId>` — 회차마다 달라 재시딩·병합 시에도 id 가 겹치지 않는다. */
  readonly idPrefix?: string;
  /** 모든 시딩 비트가 속할 장면 id. 기본값은 `plan-scene-<episodeId>`. */
  readonly sceneId?: string;
  /** 첫 비트의 order. 기존 비트 뒤에 이어 붙일 때 쓴다. 기본 0. */
  readonly startOrder?: number;
}

/** 비트 하나가 기획의 어느 필드에서 왔는지 — 표면이 "기획에서 가져온 초안"으로 표시할 때 쓴다. */
export interface PlanSeededBeatOrigin {
  readonly beatId: string;
  readonly field: EpisodePlanBeatSeedField;
  /** field 가 turningPoint 일 때 turningPoints 안의 원래 인덱스. 그 외에는 null. */
  readonly turningPointIndex: number | null;
}

/** 비트 하나에 배분된 목표 컷 수. 전체 배분의 합은 유효한 targetCutCount 와 같다. */
export interface PlanSeededCutAllocation {
  readonly beatId: string;
  readonly cutCount: number;
}

export interface StoryBeatDraftFromPlan {
  readonly episodeId: string;
  readonly beats: readonly StudioStoryBeat[];
  readonly origins: readonly PlanSeededBeatOrigin[];
  readonly cutAllocations: readonly PlanSeededCutAllocation[];
  /** 기획의 목표 컷 수(양의 안전 정수일 때만). 그 외에는 null 이고 warnings 에 남는다. */
  readonly targetCutCount: number | null;
  /** 시딩할 비트가 하나라도 있으면 true. false 면 콘티는 지금까지처럼 빈 비트로 시작한다. */
  readonly hasSeed: boolean;
  readonly warnings: readonly string[];
}

const SEED_ID_PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-_]*$/;

const SEED_KIND_BY_FIELD: Readonly<Record<EpisodePlanBeatSeedField, StudioStoryBeatKind>> = {
  openingHook: "setup",
  turningPoint: "action",
  cliffhanger: "reveal",
};

function cleanSeedRefs(refs: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const ref of refs) {
    const value = ref.trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      cleaned.push(value);
    }
  }
  return Object.freeze(cleaned);
}

export function deriveStoryBeatsFromEpisodePlan(
  plan: EpisodePlanBeatSeedSource,
  options: DeriveStoryBeatsFromPlanOptions = {},
): StoryBeatDraftFromPlan {
  const episodeId = plan.episodeId.trim();
  if (!episodeId) {
    throw new Error("Episode plan beat seeding requires an episodeId.");
  }
  const idPrefix = options.idPrefix ?? `plan-${episodeId}`;
  if (!SEED_ID_PREFIX_PATTERN.test(idPrefix)) {
    throw new Error("Beat seeding idPrefix must start with a letter or digit and use only letters, digits, '-' or '_'.");
  }
  const startOrder = options.startOrder ?? 0;
  if (!Number.isSafeInteger(startOrder) || startOrder < 0) {
    throw new Error("Beat seeding startOrder must be a non-negative integer.");
  }
  const sceneId = (options.sceneId ?? `plan-scene-${episodeId}`).trim();
  if (!sceneId) {
    throw new Error("Beat seeding sceneId must not be empty.");
  }

  const characterIds = cleanSeedRefs(plan.characterRefs);
  const locationId = cleanSeedRefs(plan.locationRefs ?? [])[0] ?? null;

  const entries: { field: EpisodePlanBeatSeedField; turningPointIndex: number | null; summary: string }[] = [];
  const openingHook = plan.openingHook.trim();
  if (openingHook) {
    entries.push({ field: "openingHook", turningPointIndex: null, summary: openingHook });
  }
  plan.turningPoints.forEach((turningPoint, index) => {
    const summary = turningPoint.trim();
    if (summary) {
      entries.push({ field: "turningPoint", turningPointIndex: index, summary });
    }
  });
  const cliffhanger = plan.cliffhanger.trim();
  if (cliffhanger) {
    entries.push({ field: "cliffhanger", turningPointIndex: null, summary: cliffhanger });
  }

  const warnings: string[] = [];
  if (entries.length === 0) {
    warnings.push("plan-seed-empty");
  } else {
    if (!openingHook) warnings.push("opening-hook-missing");
    if (!entries.some((entry) => entry.field === "turningPoint")) warnings.push("turning-points-missing");
    if (!cliffhanger) warnings.push("cliffhanger-missing");
  }

  const beats = entries.map((entry, index) => Object.freeze({
    id: `${idPrefix}-b${index + 1}`,
    sceneId,
    order: startOrder + index,
    kind: SEED_KIND_BY_FIELD[entry.field],
    summary: entry.summary,
    dialogue: "",
    characterIds,
    locationId,
    // 흐름 F-3: 시딩 비트는 태어날 때부터 기획의 회차에 묶인다 — 그래야
    // planStudioStoryboard 산출 계획이 같은 회차로 작화에 인계된다.
    episodeId,
  }));
  const origins = entries.map((entry, index) => Object.freeze({
    beatId: beats[index]!.id,
    field: entry.field,
    turningPointIndex: entry.turningPointIndex,
  }));

  const targetCutCount = Number.isSafeInteger(plan.targetCutCount) && plan.targetCutCount > 0
    ? plan.targetCutCount
    : null;
  let cutAllocations: readonly PlanSeededCutAllocation[] = Object.freeze([]);
  if (targetCutCount === null) {
    if (entries.length > 0) warnings.push("target-cut-count-missing");
  } else if (beats.length > 0) {
    const base = Math.floor(targetCutCount / beats.length);
    const remainder = targetCutCount - base * beats.length;
    cutAllocations = Object.freeze(beats.map((beat, index) => Object.freeze({
      beatId: beat.id,
      cutCount: base + (index < remainder ? 1 : 0),
    })));
    if (targetCutCount < beats.length) {
      warnings.push("target-cut-count-below-beat-count");
    }
  }

  return Object.freeze({
    episodeId,
    beats: Object.freeze(beats),
    origins: Object.freeze(origins),
    cutAllocations,
    targetCutCount,
    hasSeed: beats.length > 0,
    warnings: Object.freeze(warnings),
  });
}

/**
 * 콘티 → 작화 샷 인계 (흐름 F-3).
 *
 * 지금까지 planStudioStoryboard 의 산출(샷 사이즈·카메라·구도·대사 영역
 * 비율·스크롤 간격·예상 높이)은 실측 파일 안에 소비처가 없었고, 비트와
 * 계획에 episodeId 자체가 없어 회차와 구조적으로 묶이지 않았다. 이제
 * 비트가 episodeId 를 지니고 계획이 그것을 승계하므로, 작화 시작
 * 경로는 "어느 회차의 어떤 샷부터 그릴지"를 계획 그대로 받을 수 있다.
 *
 * - bindBeatsToEpisode: 회차별 비트 묶음(beatsByEpisodeId 처럼 이미 회차로
 *   나뉜 출처)에서 온 기존 비트에 회차를 각인한다. 다른 회차를 가리키는
 *   비트가 섞여 있으면 조용히 덮지 않고 throw 한다.
 * - planStudioStoryboardForEpisode: 섞인 비트 목록에서 한 회차 것만 골라
 *   계획을 만든다. 회차 연결이 없는 비트는 어느 회차 것인지 단정할 수
 *   없어 포함하지 않는다.
 * - deriveStoryboardArtHandoff: 계획의 샷과 비트의 내용(요약·대사·등장
 *   인물·장소)을 beatId 로 결합한 작화 작업 목록. 계획이 단일 회차에
 *   묶여 있지 않거나 샷에 대응하는 비트가 없으면 throw 한다 — 작화
 *   화면이 엉뚱한 회차의 계획을 여는 일을 구조적으로 막는다.
 * - storyboardArtStartHref: 작화 시작 링크. 콘티 시작 링크(F-1)와 같은
 *   /studio/new 시작점에 start=art 와 회차를 싣고, 계획이 있으면 샷 수와
 *   예상 캔버스 높이를 함께 실어 시작 화면이 계획을 검증·표시할 수 있게
 *   한다.
 */

/** 작화 화면이 샷 하나를 그리기 시작할 때 필요한 전부 — 계획의 샷 규격 + 비트의 내용. */
export interface StudioStoryboardArtShot {
  readonly shotId: string;
  readonly beatId: string;
  readonly episodeId: string;
  readonly order: number;
  readonly summary: string;
  readonly dialogue: string;
  readonly characterIds: readonly string[];
  readonly locationId: string | null;
  readonly shotSize: StudioShotSize;
  readonly camera: string;
  readonly composition: string;
  readonly reserveDialogueAreaRatio: number;
  readonly scrollGapAfterPx: number;
  readonly estimatedHeightPx: number;
}

export interface StudioStoryboardArtHandoff {
  readonly episodeId: string;
  /** 계획의 판정 그대로 — review 면 작화 전에 확인할 샷이 있다는 뜻이다. */
  readonly status: StudioStoryboardPlan["status"];
  readonly shots: readonly StudioStoryboardArtShot[];
  readonly estimatedCanvasHeightPx: number;
  readonly warnings: readonly string[];
}

function requireHandoffEpisodeId(value: string, message: string): string {
  const episodeId = value.trim();
  if (!episodeId) throw new Error(message);
  return episodeId;
}

export function bindBeatsToEpisode(
  beats: readonly StudioStoryBeat[],
  episodeId: string,
): readonly StudioStoryBeat[] {
  const target = requireHandoffEpisodeId(
    episodeId,
    "Binding story beats to an episode requires an episodeId.",
  );
  return Object.freeze(beats.map((beat) => {
    const current = beat.episodeId?.trim() ?? null;
    if (current === target) return beat;
    if (current) {
      throw new Error(
        `Story beat ${beat.id} belongs to episode ${current}, not ${target}.`,
      );
    }
    return Object.freeze({ ...beat, episodeId: target });
  }));
}

export function planStudioStoryboardForEpisode(
  beats: readonly StudioStoryBeat[],
  episodeId: string,
): StudioStoryboardPlan {
  const target = requireHandoffEpisodeId(
    episodeId,
    "Planning a storyboard for an episode requires an episodeId.",
  );
  const scoped = beats.filter((beat) => beat.episodeId?.trim() === target);
  if (scoped.length === 0) {
    throw new Error(
      "Storyboard planning for an episode requires at least one story beat bound to that episode.",
    );
  }
  return planStudioStoryboard(scoped);
}

export function deriveStoryboardArtHandoff(
  plan: StudioStoryboardPlan,
  beats: readonly StudioStoryBeat[],
): StudioStoryboardArtHandoff {
  if (plan.episodeId === null) {
    throw new Error(
      "Storyboard art handoff requires a storyboard plan bound to a single episode.",
    );
  }
  const episodeId = plan.episodeId;
  const beatsById = new Map<string, StudioStoryBeat>();
  for (const beat of beats) {
    if (beatsById.has(beat.id)) {
      throw new Error("Storyboard art handoff requires unique story beat ids.");
    }
    beatsById.set(beat.id, beat);
  }
  const shots = plan.shots.map((shot): StudioStoryboardArtShot => {
    const beat = beatsById.get(shot.beatId);
    if (!beat) {
      throw new Error(
        `Storyboard art handoff is missing the story beat for shot ${shot.id}.`,
      );
    }
    const beatEpisodeId = beat.episodeId?.trim() ?? null;
    if (beatEpisodeId !== null && beatEpisodeId !== episodeId) {
      throw new Error(
        `Story beat ${beat.id} belongs to episode ${beatEpisodeId}, not ${episodeId}.`,
      );
    }
    if (shot.episodeId !== null && shot.episodeId !== episodeId) {
      throw new Error(
        `Storyboard shot ${shot.id} belongs to episode ${shot.episodeId}, not ${episodeId}.`,
      );
    }
    return Object.freeze({
      shotId: shot.id,
      beatId: beat.id,
      episodeId,
      order: shot.order,
      summary: beat.summary,
      dialogue: beat.dialogue,
      characterIds: beat.characterIds,
      locationId: beat.locationId,
      shotSize: shot.shotSize,
      camera: shot.camera,
      composition: shot.composition,
      reserveDialogueAreaRatio: shot.reserveDialogueAreaRatio,
      scrollGapAfterPx: shot.scrollGapAfterPx,
      estimatedHeightPx: shot.estimatedHeightPx,
    });
  });
  return Object.freeze({
    episodeId,
    status: plan.status,
    shots: Object.freeze(shots),
    estimatedCanvasHeightPx: plan.estimatedCanvasHeightPx,
    warnings: plan.warnings,
  });
}

export function storyboardArtStartHref(
  episodeId: string,
  plan?: StudioStoryboardPlan,
): string {
  const target = requireHandoffEpisodeId(
    episodeId,
    "A storyboard art start link requires an episodeId.",
  );
  const base = `/studio/new?start=art&episode=${encodeURIComponent(target)}`;
  if (!plan) return base;
  if (plan.episodeId !== target) {
    throw new Error(
      "A storyboard art start link requires a plan bound to the same episode.",
    );
  }
  return `${base}&shots=${plan.shots.length}&height=${plan.estimatedCanvasHeightPx}`;
}
