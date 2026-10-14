/**
 * 캐릭터 모델 시트 동결 게이트 — 순수 모델 (실제 사례 흡수: We-toon 연구).
 *
 * 근거: Ko et al., We-toon (ACM UIST '22) — 글·그림 협업에서 소통량이 가장
 * 많은 지점은 캐릭터 디자인과 초안 수정이며, 선화 단계에 들어간 뒤의 수정은
 * 시간 비용이 급증해 사실상 불가능하다. 현장의 해법은 합의된 표정·포즈
 * 세트인 "모델 시트"를 만들어 이후 모든 회차의 일관성 기준으로 쓰는 것.
 *
 * 이 모델은 그 모델 시트를 제품의 동결 게이트로 옮긴다:
 * - 캐릭터마다 모델 시트 레코드(리비전 목록)를 두고, 동결하면 그 리비전이
 *   이후 회차 작화의 기준본이 된다.
 * - 동결된 시트를 바꾸는 것은 금지하지 않는다. 대신 사유 필수 + 변경
 *   이력 기록 + 영향 회차 경고를 강제한다 — 동결의 의미는 "못 바꾼다"가
 *   아니라 "바꾸면 누가·왜·어디에 영향인지가 남는다"이다.
 * - 선화 진입 판정은 기본이 경고다(작업은 멈추지 않는다). 호스트가
 *   엄격 모드를 켜면 미동결 캐릭터가 있을 때 진입을 막을 수 있게
 *   판정값만 분리해 돌려준다.
 *
 * 기준본 참조(assetRefs)는 에셋 ID 문자열이다 — 실제 에셋 저장·렌더는
 * 호스트 몫이다. React·저장소에 의존하지 않는다.
 */
import type { BilingualLabel } from "./production-labels";

/* ------------------------------------------------------------------ */
/* 모델 시트 레코드                                                     */
/* ------------------------------------------------------------------ */

export interface ModelSheetRevision {
  readonly revision: number;
  /** 표정 기준본 에셋 참조. 모델 시트의 핵심(We-toon: 표정·포즈 세트). */
  readonly expressionRef: string | null;
  /** 포즈 기준본 에셋 참조. */
  readonly poseRef: string | null;
  /** 그 밖의 기준 이미지(의상·소품 등) 참조들. */
  readonly assetRefs: readonly string[];
  readonly note: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly createdAt: string;
}

export interface ModelSheetChange {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly changedById: string;
  readonly changedByName: string;
  readonly changedAt: string;
  /** 동결 후 변경에는 사유가 필수다 (validateModelSheetChange). */
  readonly reason: string;
  /** 이 변경의 영향을 확인했다고 표시한 회차들. */
  readonly acknowledgedEpisodeIds: readonly string[];
}

export interface CharacterModelSheet {
  readonly characterId: string;
  readonly status: "draft" | "frozen";
  readonly revisions: readonly ModelSheetRevision[];
  readonly frozenRevision: number | null;
  readonly frozenById: string | null;
  readonly frozenByName: string | null;
  readonly frozenAt: string | null;
  readonly changes: readonly ModelSheetChange[];
}

export function emptyModelSheet(characterId: string): CharacterModelSheet {
  return {
    characterId,
    status: "draft",
    revisions: [],
    frozenRevision: null,
    frozenById: null,
    frozenByName: null,
    frozenAt: null,
    changes: [],
  };
}

export function latestModelSheetRevision(sheet: CharacterModelSheet): ModelSheetRevision | null {
  return sheet.revisions[sheet.revisions.length - 1] ?? null;
}

export function frozenModelSheetRevision(sheet: CharacterModelSheet): ModelSheetRevision | null {
  if (sheet.frozenRevision === null) return null;
  return sheet.revisions.find((revision) => revision.revision === sheet.frozenRevision) ?? null;
}

/** 기준본 completeness — 표정·포즈가 갖춰졌는가. 동결 가능 여부와 별개로 안내에 쓴다. */
export interface ModelSheetCompleteness {
  readonly hasExpression: boolean;
  readonly hasPose: boolean;
  readonly extraAssetCount: number;
  readonly complete: boolean;
  readonly missingLabels: readonly BilingualLabel[];
}

export function modelSheetCompleteness(revision: ModelSheetRevision | null): ModelSheetCompleteness {
  const missingLabels: BilingualLabel[] = [];
  if (!revision?.expressionRef) missingLabels.push({ ko: "표정 기준본", en: "expression reference" });
  if (!revision?.poseRef) missingLabels.push({ ko: "포즈 기준본", en: "pose reference" });
  return {
    hasExpression: Boolean(revision?.expressionRef),
    hasPose: Boolean(revision?.poseRef),
    extraAssetCount: revision?.assetRefs.length ?? 0,
    complete: missingLabels.length === 0,
    missingLabels,
  };
}

/* ------------------------------------------------------------------ */
/* 연산 — 전부 새 레코드를 돌려주는 순수 함수. 실패는 issues로 말한다.    */
/* ------------------------------------------------------------------ */

export interface ModelSheetIssue {
  readonly code:
    | "no-revision"
    | "empty-reference"
    | "already-frozen"
    | "not-frozen"
    | "reason-required"
    | "frozen-revision-locked";
  readonly message: BilingualLabel;
}

export interface ModelSheetOpResult {
  readonly sheet: CharacterModelSheet;
  readonly issues: readonly ModelSheetIssue[];
  /** 실제로 레코드가 바뀌었는가. */
  readonly changed: boolean;
}

export interface ModelSheetRevisionInput {
  readonly expressionRef: string | null;
  readonly poseRef: string | null;
  readonly assetRefs: readonly string[];
  readonly note: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly createdAt: string;
}

function hasAnyReference(input: Pick<ModelSheetRevisionInput, "expressionRef" | "poseRef" | "assetRefs">): boolean {
  return Boolean(input.expressionRef || input.poseRef || input.assetRefs.length > 0);
}

/**
 * 초안 리비전을 추가한다. 동결된 시트에는 쓸 수 없다 — 동결 후 변경은
 * reviseFrozenModelSheet(사유 필수)를 통해서만 한다.
 */
export function addModelSheetRevision(
  sheet: CharacterModelSheet,
  input: ModelSheetRevisionInput,
): ModelSheetOpResult {
  if (sheet.status === "frozen") {
    return {
      sheet,
      changed: false,
      issues: [{
        code: "frozen-revision-locked",
        message: {
          ko: "동결된 모델 시트예요. 바꾸려면 사유와 함께 변경으로 등록해 주세요 — 영향 회차에 경고가 가요.",
          en: "This model sheet is frozen. Register the change with a reason — affected episodes get warned.",
        },
      }],
    };
  }
  if (!hasAnyReference(input)) {
    return {
      sheet,
      changed: false,
      issues: [{
        code: "empty-reference",
        message: {
          ko: "기준본이 하나도 없어요. 표정·포즈 중 하나라도 먼저 올려 주세요.",
          en: "No reference at all. Add at least an expression or pose reference first.",
        },
      }],
    };
  }
  const revision: ModelSheetRevision = {
    revision: (latestModelSheetRevision(sheet)?.revision ?? 0) + 1,
    ...input,
  };
  return { sheet: { ...sheet, revisions: [...sheet.revisions, revision] }, issues: [], changed: true };
}

/** 최신 초안 리비전을 기준본으로 동결한다. */
export function freezeModelSheet(
  sheet: CharacterModelSheet,
  actor: { readonly byId: string; readonly byName: string; readonly at: string },
): ModelSheetOpResult {
  if (sheet.status === "frozen") {
    return {
      sheet,
      changed: false,
      issues: [{
        code: "already-frozen",
        message: { ko: "이미 동결된 모델 시트예요.", en: "This model sheet is already frozen." },
      }],
    };
  }
  const latest = latestModelSheetRevision(sheet);
  if (!latest) {
    return {
      sheet,
      changed: false,
      issues: [{
        code: "no-revision",
        message: {
          ko: "동결할 기준본이 없어요. 표정·포즈 기준본을 먼저 올려 주세요.",
          en: "Nothing to freeze yet. Add an expression/pose reference first.",
        },
      }],
    };
  }
  return {
    sheet: {
      ...sheet,
      status: "frozen",
      frozenRevision: latest.revision,
      frozenById: actor.byId,
      frozenByName: actor.byName,
      frozenAt: actor.at,
    },
    issues: [],
    changed: true,
  };
}

/**
 * 동결된 시트를 바꾼다 — 새 리비전을 기준본으로 삼고 변경 이력을 남긴다.
 * 사유가 비면 거부한다. 바뀐 기준본은 영향 분석(deriveModelSheetImpact)의
 * 입력이 된다.
 */
export function reviseFrozenModelSheet(
  sheet: CharacterModelSheet,
  input: ModelSheetRevisionInput & { readonly reason: string },
): ModelSheetOpResult {
  if (sheet.status !== "frozen" || sheet.frozenRevision === null) {
    return {
      sheet,
      changed: false,
      issues: [{
        code: "not-frozen",
        message: {
          ko: "아직 동결되지 않은 시트예요. 초안 리비전 추가로 충분해요.",
          en: "This sheet isn't frozen yet — a plain revision is enough.",
        },
      }],
    };
  }
  if (input.reason.trim().length === 0) {
    return {
      sheet,
      changed: false,
      issues: [{
        code: "reason-required",
        message: {
          ko: "동결된 기준본을 바꾸려면 이유가 필요해요. 이미 그린 회차가 왜 영향받는지 판단할 근거예요.",
          en: "Changing a frozen reference needs a reason — it's how drawn episodes judge the impact.",
        },
      }],
    };
  }
  if (!hasAnyReference(input)) {
    return {
      sheet,
      changed: false,
      issues: [{
        code: "empty-reference",
        message: {
          ko: "새 기준본이 하나도 없어요. 바꿀 기준본을 먼저 올려 주세요.",
          en: "The new revision has no reference. Add one before changing.",
        },
      }],
    };
  }
  const revision: ModelSheetRevision = {
    revision: (latestModelSheetRevision(sheet)?.revision ?? 0) + 1,
    expressionRef: input.expressionRef,
    poseRef: input.poseRef,
    assetRefs: input.assetRefs,
    note: input.note,
    authorId: input.authorId,
    authorName: input.authorName,
    createdAt: input.createdAt,
  };
  const change: ModelSheetChange = {
    fromRevision: sheet.frozenRevision,
    toRevision: revision.revision,
    changedById: input.authorId,
    changedByName: input.authorName,
    changedAt: input.createdAt,
    reason: input.reason,
    acknowledgedEpisodeIds: [],
  };
  return {
    sheet: {
      ...sheet,
      revisions: [...sheet.revisions, revision],
      frozenRevision: revision.revision,
      frozenById: input.authorId,
      frozenByName: input.authorName,
      frozenAt: input.createdAt,
      changes: [...sheet.changes, change],
    },
    issues: [],
    changed: true,
  };
}

/** 영향 확인 — 이 회차는 변경된 기준본을 확인했다고 표시한다 (최신 변경에 기록). */
export function acknowledgeModelSheetChange(
  sheet: CharacterModelSheet,
  episodeId: string,
): CharacterModelSheet {
  if (sheet.changes.length === 0) return sheet;
  const lastIndex = sheet.changes.length - 1;
  const last = sheet.changes[lastIndex];
  if (!last || last.acknowledgedEpisodeIds.includes(episodeId)) return sheet;
  const changes = sheet.changes.map((change, index) =>
    index === lastIndex
      ? { ...change, acknowledgedEpisodeIds: [...change.acknowledgedEpisodeIds, episodeId] }
      : change);
  return { ...sheet, changes };
}

/* ------------------------------------------------------------------ */
/* 영향 분석 — 동결 변경이 이미 그린/그릴 회차에 미치는 범위              */
/* ------------------------------------------------------------------ */

/** 호스트가 회차별로 집계해 넘기는 사용 정보. 모델은 이 값만으로 판단한다. */
export interface ModelSheetUsageEpisode {
  readonly episodeId: string;
  readonly episodeLabel: string;
  /** 이 회차에서 캐릭터가 등장하는 컷 수. */
  readonly cutCount: number;
  /**
   * 이 회차를 그릴 때 기준으로 삼은 모델 시트 리비전.
   * 아직 그리기 전이면 null — null은 "영향 없음"이 아니라
   * "새 기준본을 처음부터 적용하면 됨"이라 영향 목록에서 제외한다.
   */
  readonly drawnRevision: number | null;
}

export interface ModelSheetImpact {
  readonly characterId: string;
  readonly frozenRevision: number | null;
  readonly latestChange: ModelSheetChange | null;
  /** 옛 기준본으로 그려진 회차들 — 다시 확인이 필요한 회차. */
  readonly affectedEpisodes: readonly ModelSheetUsageEpisode[];
  readonly affectedCutCount: number;
  /** 영향 회차 중 아직 확인 표시가 없는 회차 ID들. */
  readonly unacknowledgedEpisodeIds: readonly string[];
}

export function deriveModelSheetImpact(
  sheet: CharacterModelSheet,
  usage: readonly ModelSheetUsageEpisode[],
): ModelSheetImpact {
  const frozenRevision = sheet.frozenRevision;
  const affected = frozenRevision === null
    ? []
    : usage.filter(
        (episode) => episode.drawnRevision !== null && episode.drawnRevision < frozenRevision,
      );
  const acknowledged = new Set(sheet.changes.flatMap((change) => change.acknowledgedEpisodeIds));
  return {
    characterId: sheet.characterId,
    frozenRevision,
    latestChange: sheet.changes[sheet.changes.length - 1] ?? null,
    affectedEpisodes: affected,
    affectedCutCount: affected.reduce((sum, episode) => sum + episode.cutCount, 0),
    unacknowledgedEpisodeIds: affected
      .map((episode) => episode.episodeId)
      .filter((episodeId) => !acknowledged.has(episodeId)),
  };
}

/* ------------------------------------------------------------------ */
/* 선화 진입 게이트 — 기본은 경고, 엄격 모드에서만 차단                   */
/* ------------------------------------------------------------------ */

export interface ModelSheetArtGate {
  /** 등장 캐릭터 전원의 시트가 동결됐는가. */
  readonly ready: boolean;
  /** 시트가 없거나 아직 초안인 캐릭터들 — 선화 전에 동결이 필요한 쪽. */
  readonly unfrozenCharacterIds: readonly string[];
  /** 동결은 됐지만 변경 미확인 회차가 남은 캐릭터들 — 경고 대상. */
  readonly changedCharacterIds: readonly string[];
  readonly warnings: readonly BilingualLabel[];
}

/**
 * 선화(작화 단계 본격 진입) 직전 판정.
 * sheets에 없는 캐릭터는 "시트 없음 = 미동결"로 본다. impacts를 넘기면
 * 변경 미확인 경고까지 계산하고, 안 넘기면 동결 여부만으로 판정한다
 * (모른다고 경고를 지어내지 않는다).
 */
export function deriveModelSheetArtGate(
  sheets: readonly CharacterModelSheet[],
  characterIds: readonly string[],
  impacts?: ReadonlyMap<string, ModelSheetImpact>,
): ModelSheetArtGate {
  const byId = new Map(sheets.map((sheet) => [sheet.characterId, sheet]));
  const unfrozen: string[] = [];
  const changed: string[] = [];
  const warnings: BilingualLabel[] = [];
  for (const characterId of characterIds) {
    const sheet = byId.get(characterId);
    if (!sheet || sheet.status !== "frozen") {
      unfrozen.push(characterId);
      continue;
    }
    const impact = impacts?.get(characterId);
    if (impact && impact.unacknowledgedEpisodeIds.length > 0) changed.push(characterId);
  }
  if (unfrozen.length > 0) {
    warnings.push({
      ko: `모델 시트가 동결되지 않은 캐릭터 ${unfrozen.length}명이 있어요. 선화를 시작하면 나중 수정이 어려워져요 — 먼저 모델 시트를 합의·동결하는 걸 권해요.`,
      en: `${unfrozen.length} character(s) have no frozen model sheet. Fixes after line art starts get expensive — agree and freeze the model sheet first.`,
    });
  }
  if (changed.length > 0) {
    warnings.push({
      ko: `모델 시트가 바뀐 캐릭터 ${changed.length}명이 있어요. 이미 그린 회차에 영향이 없는지 확인해 주세요.`,
      en: `${changed.length} character(s) had a model-sheet change. Check the episodes already drawn against it.`,
    });
  }
  return {
    ready: unfrozen.length === 0,
    unfrozenCharacterIds: unfrozen,
    changedCharacterIds: changed,
    warnings,
  };
}

/**
 * 진입 차단 여부. 기본(false)은 어떤 경우에도 막지 않는다 — 경고만 한다.
 * strict=true인 호스트에서만 미동결이 진입을 막는다. 변경 미확인은
 * 엄격 모드에서도 막지 않는다(경고 유지).
 */
export function modelSheetArtGateBlocks(gate: ModelSheetArtGate, options?: { readonly strict?: boolean }): boolean {
  return Boolean(options?.strict) && !gate.ready;
}
