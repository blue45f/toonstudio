/**
 * 작품 톤 시트 — 순수 모델.
 *
 * 근거: 더그림엔터테인먼트 『백XX』 CP 체제(매일경제 인터뷰)는 단계 담당자와
 * 분리된 톤·방향 총괄이 작품 전체의 무게감·전개 속도를 지킨다. 문제는 그
 * 기준이 사람 머릿속에만 있으면 회차가 바뀔 때마다 톤이 흔들린다는 것이다.
 * 이 모델은 그 기준을 작품 단위 문서로 고정한다:
 *
 *  1) 누적만 한다 — 톤은 덮어쓰지 않는다. 모든 변경은 "톤 결정" 한 건으로
 *     이력에 쌓이고, 현재본은 마지막 결정까지 적용한 결과다. 리비전은
 *     결정 수와 같아, 누가·언제·왜 바꿨는지가 항상 남는다.
 *  2) 매 회차에 자동 첨부된다 — buildToneHandoffAttachment 가 인계 카드가
 *     그대로 붙일 수 있는 읽기 전용 스냅샷을 만든다. 시트가 비어 있으면
 *     지어내지 않고 null 을 돌려준다.
 *  3) 체크는 담당자와 분리한다 — 기획·콘티 단계의 완료 조건에는 그 단계
 *     담당자가 아닌 사람의 톤·방향 체크가 필요하다. 담당자 본인의 체크는
 *     무효로 판정한다(CP 체제의 "분리"를 구조로 강제).
 *  4) 오래된 체크는 무효다 — 체크가 본 리비전과 톤 시트 현재 리비전이
 *     다르면 stale 로 판정한다. 톤이 바뀐 뒤에는 다시 체크해야 한다.
 *
 * React·저장소에 의존하지 않는다. 시트·체크 레코드는 호스트가 보관하고,
 * 이 모델은 생성·결정 누적·첨부·완료 판정만 맡는다.
 */
import type { BilingualLabel } from "./production-labels";
import type { EpisodeStageId } from "./production-project-surfaces";

/* ------------------------------------------------------------------ */
/* 톤 어휘                                                              */
/* ------------------------------------------------------------------ */

/** 작품의 무게감 — 가벼운 일상물부터 어둡고 무거운 작품까지 4단계. */
export type WorkToneWeight = "light" | "steady" | "heavy" | "dark";

export const WORK_TONE_WEIGHTS: readonly WorkToneWeight[] = Object.freeze([
  "light",
  "steady",
  "heavy",
  "dark",
]);

export const WORK_TONE_WEIGHT_LABELS: Readonly<Record<WorkToneWeight, BilingualLabel>> =
  Object.freeze({
    light: { ko: "가볍고 밝음", en: "Light and bright" },
    steady: { ko: "담담하고 중간", en: "Measured, in between" },
    heavy: { ko: "묵직하고 진지함", en: "Weighty and serious" },
    dark: { ko: "어둡고 무거움", en: "Dark and heavy" },
  });

/** 전개 속도 — 느린 호흡부터 쉼 없이 몰아치는 전개까지 4단계. */
export type WorkTonePacing = "slow" | "steady" | "fast" | "relentless";

export const WORK_TONE_PACINGS: readonly WorkTonePacing[] = Object.freeze([
  "slow",
  "steady",
  "fast",
  "relentless",
]);

export const WORK_TONE_PACING_LABELS: Readonly<Record<WorkTonePacing, BilingualLabel>> =
  Object.freeze({
    slow: { ko: "느린 호흡", en: "Slow burn" },
    steady: { ko: "일정한 전개", en: "Steady pacing" },
    fast: { ko: "빠른 전개", en: "Fast pacing" },
    relentless: { ko: "쉼 없이 몰아침", en: "Relentless" },
  });

/* ------------------------------------------------------------------ */
/* 톤 시트 레코드                                                       */
/* ------------------------------------------------------------------ */

/**
 * 톤 결정 한 건 — 시트의 모든 변경은 이 단위로만 일어난다.
 * weight/pacing/statement/forbiddenExpressions 중 실제로 바뀐 것만 담고,
 * forbidden 은 추가·제거를 나눠 기록해 이력만으로 현재본을 재현할 수 있다.
 */
export interface WorkToneDecision {
  readonly id: string;
  readonly decidedById: string;
  readonly decidedByName: string;
  readonly decidedAt: string;
  /** 무엇을 정했는지 한 문장. 비어 있는 결정은 만들 수 없다(검증 참조). */
  readonly summary: string;
  /** 왜 그렇게 정했는지. 비어도 되지만, 있으면 인계·검토 때 맥락이 된다. */
  readonly reason: string;
  readonly weight?: WorkToneWeight;
  readonly pacing?: WorkTonePacing;
  readonly statement?: string;
  readonly forbiddenAdded: readonly string[];
  readonly forbiddenRemoved: readonly string[];
}

export interface WorkToneSheet {
  readonly id: string;
  /** 작품(제작 프로젝트) id — 톤 시트는 작품당 하나다. */
  readonly projectId: string;
  /** 현재 무게감. 아직 정하지 않았으면 null — 지어내지 않는다. */
  readonly weight: WorkToneWeight | null;
  readonly pacing: WorkTonePacing | null;
  /** 한 줄 톤 선언. 예: "밝게 시작해 결말로 갈수록 묵직해진다." */
  readonly statement: string;
  /** 쓰지 않기로 한 표현들. 순서·원문 그대로 누적한다. */
  readonly forbiddenExpressions: readonly string[];
  /** 톤 결정 이력 — 시간순, append-only. */
  readonly decisions: readonly WorkToneDecision[];
  /** 리비전 = 결정 수. 체크의 stale 판정 기준이다. */
  readonly revision: number;
  readonly updatedAt: string | null;
}

export function workToneSheetId(projectId: string): string {
  return `tone-sheet:${projectId}`;
}

export function workToneDecisionId(projectId: string, revision: number): string {
  return `tone-decision:${projectId}:${revision}`;
}

/** 빈 톤 시트. 결정이 하나도 없으므로 현재본도 전부 비어 있다. */
export function createWorkToneSheet(projectId: string): WorkToneSheet {
  return Object.freeze({
    id: workToneSheetId(projectId),
    projectId,
    weight: null,
    pacing: null,
    statement: "",
    forbiddenExpressions: Object.freeze([]),
    decisions: Object.freeze([]),
    revision: 0,
    updatedAt: null,
  });
}

/* ------------------------------------------------------------------ */
/* 결정 누적                                                            */
/* ------------------------------------------------------------------ */

export interface AppendToneDecisionInput {
  readonly decidedById: string;
  readonly decidedByName: string;
  readonly decidedAt: string;
  readonly summary: string;
  readonly reason?: string;
  readonly weight?: WorkToneWeight;
  readonly pacing?: WorkTonePacing;
  readonly statement?: string;
  /** 저장 후의 금지 표현 전체 목록. 모델이 이전 목록과 diff 해 이력에 남긴다. */
  readonly forbiddenExpressions?: readonly string[];
}

export type AppendToneDecisionResult =
  | { readonly ok: true; readonly sheet: WorkToneSheet; readonly decision: WorkToneDecision }
  | { readonly ok: false; readonly code: "summary-required" | "no-change" };

function normalizeForbidden(list: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return Object.freeze(out);
}

/**
 * 톤 결정을 누적한다(불변 — 새 시트를 돌려준다).
 * - summary 가 비면 거부한다: 이유 없는 톤 변경은 다음 회차가 왜 바뀌었는지
 *   알 수 없게 만든다.
 * - 실제로 아무것도 바뀌지 않았으면 거부한다: 이력이 노이즈로 차는 것을 막는다.
 */
export function appendToneDecision(
  sheet: WorkToneSheet,
  input: AppendToneDecisionInput,
): AppendToneDecisionResult {
  const summary = input.summary.trim();
  if (!summary) return { ok: false, code: "summary-required" };

  const nextForbidden =
    input.forbiddenExpressions !== undefined
      ? normalizeForbidden(input.forbiddenExpressions)
      : sheet.forbiddenExpressions;
  const forbiddenAdded = nextForbidden.filter((entry) => !sheet.forbiddenExpressions.includes(entry));
  const forbiddenRemoved = sheet.forbiddenExpressions.filter((entry) => !nextForbidden.includes(entry));
  const nextStatement = input.statement !== undefined ? input.statement.trim() : sheet.statement;
  const changed =
    (input.weight !== undefined && input.weight !== sheet.weight) ||
    (input.pacing !== undefined && input.pacing !== sheet.pacing) ||
    nextStatement !== sheet.statement ||
    forbiddenAdded.length > 0 ||
    forbiddenRemoved.length > 0;
  if (!changed) return { ok: false, code: "no-change" };

  const revision = sheet.revision + 1;
  const decision: WorkToneDecision = Object.freeze({
    id: workToneDecisionId(sheet.projectId, revision),
    decidedById: input.decidedById,
    decidedByName: input.decidedByName,
    decidedAt: input.decidedAt,
    summary,
    reason: input.reason?.trim() ?? "",
    ...(input.weight !== undefined && input.weight !== sheet.weight ? { weight: input.weight } : {}),
    ...(input.pacing !== undefined && input.pacing !== sheet.pacing ? { pacing: input.pacing } : {}),
    ...(nextStatement !== sheet.statement ? { statement: nextStatement } : {}),
    forbiddenAdded: Object.freeze(forbiddenAdded),
    forbiddenRemoved: Object.freeze(forbiddenRemoved),
  });
  const next: WorkToneSheet = Object.freeze({
    ...sheet,
    weight: input.weight !== undefined ? input.weight : sheet.weight,
    pacing: input.pacing !== undefined ? input.pacing : sheet.pacing,
    statement: nextStatement,
    forbiddenExpressions: nextForbidden,
    decisions: Object.freeze([...sheet.decisions, decision]),
    revision,
    updatedAt: input.decidedAt,
  });
  return { ok: true, sheet: next, decision };
}

/* ------------------------------------------------------------------ */
/* 완성도 — 인계·완료 판정이 참조하는 최소 조건                          */
/* ------------------------------------------------------------------ */

export interface WorkToneSheetCompleteness {
  readonly hasWeight: boolean;
  readonly hasPacing: boolean;
  /** 무게감·전개 속도가 모두 정해져 체크·인계가 의미를 가지는 상태. */
  readonly ready: boolean;
  readonly missingLabels: readonly BilingualLabel[];
}

export function workToneSheetCompleteness(sheet: WorkToneSheet | null | undefined): WorkToneSheetCompleteness {
  const missingLabels: BilingualLabel[] = [];
  const hasWeight = Boolean(sheet && sheet.weight);
  const hasPacing = Boolean(sheet && sheet.pacing);
  if (!hasWeight) missingLabels.push({ ko: "무게감", en: "Weight" });
  if (!hasPacing) missingLabels.push({ ko: "전개 속도", en: "Pacing" });
  return Object.freeze({
    hasWeight,
    hasPacing,
    ready: hasWeight && hasPacing,
    missingLabels: Object.freeze(missingLabels),
  });
}

/** 시트에 보여 줄 내용이 하나라도 있는가. 전부 비면 인계 첨부는 null 이다. */
export function hasToneContent(sheet: WorkToneSheet | null | undefined): sheet is WorkToneSheet {
  if (!sheet) return false;
  return Boolean(
    sheet.weight ||
      sheet.pacing ||
      sheet.statement.trim() ||
      sheet.forbiddenExpressions.length > 0 ||
      sheet.decisions.length > 0,
  );
}

/* ------------------------------------------------------------------ */
/* 인계 첨부 — 매 회차 인계 카드에 자동으로 붙는 읽기 전용 스냅샷        */
/* ------------------------------------------------------------------ */

export interface ToneHandoffAttachment {
  readonly sheetId: string;
  readonly projectId: string;
  readonly revision: number;
  readonly weight: WorkToneWeight | null;
  readonly weightLabel: BilingualLabel | null;
  readonly pacing: WorkTonePacing | null;
  readonly pacingLabel: BilingualLabel | null;
  readonly statement: string;
  readonly forbiddenExpressions: readonly string[];
  /** 가장 최근 톤 결정. 없으면 null. */
  readonly latestDecision: {
    readonly summary: string;
    readonly decidedByName: string;
    readonly decidedAt: string;
  } | null;
  /** 카드가 그대로 나열할 수 있는 표시 줄 (한글 정본 — 카드는 라벨을 병기한다). */
  readonly lines: readonly string[];
}

export function buildToneHandoffAttachment(
  sheet: WorkToneSheet | null | undefined,
): ToneHandoffAttachment | null {
  if (!hasToneContent(sheet)) return null;
  const lines: string[] = [];
  if (sheet.weight) lines.push(`무게감: ${WORK_TONE_WEIGHT_LABELS[sheet.weight].ko}`);
  if (sheet.pacing) lines.push(`전개 속도: ${WORK_TONE_PACING_LABELS[sheet.pacing].ko}`);
  if (sheet.statement.trim()) lines.push(sheet.statement.trim());
  if (sheet.forbiddenExpressions.length > 0) {
    lines.push(`금지 표현: ${sheet.forbiddenExpressions.join(" · ")}`);
  }
  const last = sheet.decisions[sheet.decisions.length - 1];
  if (last) lines.push(`최근 결정: ${last.summary}`);
  return Object.freeze({
    sheetId: sheet.id,
    projectId: sheet.projectId,
    revision: sheet.revision,
    weight: sheet.weight,
    weightLabel: sheet.weight ? WORK_TONE_WEIGHT_LABELS[sheet.weight] : null,
    pacing: sheet.pacing,
    pacingLabel: sheet.pacing ? WORK_TONE_PACING_LABELS[sheet.pacing] : null,
    statement: sheet.statement.trim(),
    forbiddenExpressions: sheet.forbiddenExpressions,
    latestDecision: last
      ? Object.freeze({
          summary: last.summary,
          decidedByName: last.decidedByName,
          decidedAt: last.decidedAt,
        })
      : null,
    lines: Object.freeze(lines),
  });
}

/* ------------------------------------------------------------------ */
/* 톤·방향 체크 + 기획·콘티 단계 완료 조건                               */
/* ------------------------------------------------------------------ */

/** 톤·방향 체크가 완료 조건에 포함되는 단계. 그 밖의 단계는 이 조건이 없다. */
export const TONE_CHECK_STAGE_IDS = ["plan", "storyboard"] as const;
export type ToneCheckStageId = (typeof TONE_CHECK_STAGE_IDS)[number];

type ToneCheckStageIsEpisodeStage = ToneCheckStageId extends EpisodeStageId ? true : never;
const TONE_CHECK_STAGE_ASSERT: ToneCheckStageIsEpisodeStage = true;
void TONE_CHECK_STAGE_ASSERT;

export type ToneCheckVerdict = "fits" | "adjust" | "off-tone";

export const TONE_CHECK_VERDICT_LABELS: Readonly<Record<ToneCheckVerdict, BilingualLabel>> =
  Object.freeze({
    fits: { ko: "톤에 맞아요", en: "On tone" },
    adjust: { ko: "톤 조정 필요", en: "Needs a tone adjustment" },
    "off-tone": { ko: "톤에서 벗어남", en: "Off tone" },
  });

/**
 * 톤·방향 체크 한 건. 체크한 사람이 그 단계 담당자와 달라야 유효하다 —
 * 분리 원칙은 evaluateToneStageCompletion 이 강제한다.
 */
export interface ToneDirectionCheck {
  readonly id: string;
  readonly episodeId: string;
  readonly stageId: ToneCheckStageId;
  readonly checkerId: string;
  readonly checkerName: string;
  /** 체크 당시 톤 시트 리비전. 현재 리비전과 다르면 stale 이다. */
  readonly toneRevision: number;
  readonly verdict: ToneCheckVerdict;
  readonly note: string;
  readonly checkedAt: string;
}

export function toneDirectionCheckId(episodeId: string, stageId: ToneCheckStageId, checkerId: string, toneRevision: number): string {
  return `tone-check:${episodeId}:${stageId}:${checkerId}:r${toneRevision}`;
}

export type ToneCompletionBlockerCode =
  | "tone-sheet-missing"
  | "tone-sheet-incomplete"
  | "tone-check-missing"
  | "tone-check-by-assignee"
  | "tone-check-stale"
  | "tone-check-not-fitting";

export interface ToneCompletionBlocker {
  readonly code: ToneCompletionBlockerCode;
  readonly message: BilingualLabel;
}

export interface ToneStageCompletion {
  readonly stageId: EpisodeStageId;
  /** 이 단계에 톤 완료 조건이 있는가 (기획·콘티만 true). */
  readonly applies: boolean;
  /** 완료를 확정할 수 있는가. applies=false 인 단계는 항상 true 다. */
  readonly satisfied: boolean;
  readonly blockers: readonly ToneCompletionBlocker[];
  /** 판정에 쓰인 유효 체크. 없으면 null — 본인 체크·stale 체크는 여기에 오지 않는다. */
  readonly effectiveCheck: ToneDirectionCheck | null;
}

const BLOCKER_MESSAGES: Readonly<Record<ToneCompletionBlockerCode, BilingualLabel>> = Object.freeze({
  "tone-sheet-missing": {
    ko: "작품 톤 시트가 아직 없어요. 톤을 먼저 정해야 체크할 기준이 생겨요.",
    en: "There is no work tone sheet yet — set the tone first so there is a standard to check against.",
  },
  "tone-sheet-incomplete": {
    ko: "톤 시트에 무게감·전개 속도 중 비어 있는 항목이 있어요.",
    en: "The tone sheet is missing its weight or pacing.",
  },
  "tone-check-missing": {
    ko: "이 단계 담당자가 아닌 사람의 톤·방향 체크가 아직 없어요.",
    en: "No tone & direction check from someone other than this stage's owner yet.",
  },
  "tone-check-by-assignee": {
    ko: "담당자 본인의 체크만 있어요. 톤 체크는 담당자와 분리되어야 해요.",
    en: "Only the stage owner's own check exists — the tone check must come from someone else.",
  },
  "tone-check-stale": {
    ko: "톤 시트가 체크 이후에 바뀌었어요. 현재 톤 기준으로 다시 체크해 주세요.",
    en: "The tone sheet changed after the check — please re-check against the current tone.",
  },
  "tone-check-not-fitting": {
    ko: "최근 톤 체크가 '톤에 맞음'이 아니에요. 조정 후 다시 체크가 필요해요.",
    en: "The latest tone check is not 'on tone' — adjust and check again.",
  },
});

function blocker(code: ToneCompletionBlockerCode): ToneCompletionBlocker {
  return Object.freeze({ code, message: BLOCKER_MESSAGES[code] });
}

export interface EvaluateToneStageCompletionInput {
  readonly stageId: EpisodeStageId;
  readonly sheet: WorkToneSheet | null | undefined;
  readonly checks: readonly ToneDirectionCheck[];
  /** 이 단계 담당자 id. 이 사람의 체크는 분리 원칙상 무효다. */
  readonly stageAssigneeId?: string | null;
}

/**
 * 기획·콘티 단계 완료 조건 중 "톤·방향" 부분의 판정.
 * 순서가 의미를 가진다: 시트 없이는 체크가 무의미하고, 분리·최신성·적합을
 * 모두 통과한 체크 하나만으로 충족한다. 작업 시작을 막는 조건이 아니다 —
 * 게이트 모델과 마찬가지로 "완료 확정"에만 쓰인다.
 */
export function evaluateToneStageCompletion(
  input: EvaluateToneStageCompletionInput,
): ToneStageCompletion {
  const { stageId } = input;
  if (!(TONE_CHECK_STAGE_IDS as readonly string[]).includes(stageId)) {
    return Object.freeze({ stageId, applies: false, satisfied: true, blockers: Object.freeze([]), effectiveCheck: null });
  }
  const stage = stageId as ToneCheckStageId;
  const blockers: ToneCompletionBlocker[] = [];
  if (!hasToneContent(input.sheet)) {
    blockers.push(blocker("tone-sheet-missing"));
    return Object.freeze({ stageId, applies: true, satisfied: false, blockers: Object.freeze(blockers), effectiveCheck: null });
  }
  const sheet = input.sheet as WorkToneSheet;
  if (!workToneSheetCompleteness(sheet).ready) {
    blockers.push(blocker("tone-sheet-incomplete"));
  }
  const stageChecks = input.checks
    .filter((check) => check.stageId === stage)
    .slice()
    .sort((a, b) => (a.checkedAt < b.checkedAt ? 1 : a.checkedAt > b.checkedAt ? -1 : 0));
  const ownChecks = input.stageAssigneeId
    ? stageChecks.filter((check) => check.checkerId === input.stageAssigneeId)
    : [];
  const externalChecks = input.stageAssigneeId
    ? stageChecks.filter((check) => check.checkerId !== input.stageAssigneeId)
    : stageChecks;
  const latestExternal = externalChecks[0] ?? null;
  if (!latestExternal) {
    blockers.push(blocker(ownChecks.length > 0 ? "tone-check-by-assignee" : "tone-check-missing"));
    return Object.freeze({
      stageId,
      applies: true,
      satisfied: false,
      blockers: Object.freeze(blockers),
      effectiveCheck: null,
    });
  }
  if (latestExternal.toneRevision !== sheet.revision) {
    blockers.push(blocker("tone-check-stale"));
  } else if (latestExternal.verdict !== "fits") {
    blockers.push(blocker("tone-check-not-fitting"));
  }
  const satisfied = blockers.length === 0;
  return Object.freeze({
    stageId,
    applies: true,
    satisfied,
    blockers: Object.freeze(blockers),
    effectiveCheck: satisfied ? latestExternal : null,
  });
}

/**
 * 기존 단계 완료 맵(예: 합의 게이트의 completionByStage)에 톤 조건을 합친다.
 * 톤 조건이 없는 단계와, 입력 맵에 없는 단계는 건드리지 않는다.
 */
export function applyToneCompletion(
  completionByStage: Readonly<Partial<Record<EpisodeStageId, boolean>>>,
  input: {
    readonly sheet: WorkToneSheet | null | undefined;
    readonly checksByStage: Readonly<Partial<Record<ToneCheckStageId, readonly ToneDirectionCheck[]>>>;
    readonly assigneeByStage?: Readonly<Partial<Record<ToneCheckStageId, string | null>>>;
  },
): Readonly<Partial<Record<EpisodeStageId, boolean>>> {
  const next: Partial<Record<EpisodeStageId, boolean>> = { ...completionByStage };
  for (const stageId of TONE_CHECK_STAGE_IDS) {
    if (!(stageId in next)) continue;
    const tone = evaluateToneStageCompletion({
      stageId,
      sheet: input.sheet,
      checks: input.checksByStage[stageId] ?? [],
      stageAssigneeId: input.assigneeByStage?.[stageId] ?? null,
    });
    next[stageId] = Boolean(next[stageId]) && tone.satisfied;
  }
  return Object.freeze(next);
}
