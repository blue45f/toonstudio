/**
 * Studio Dialogue Spellcheck → QC 자동 인계 브리지 — 순수 코어 + 저장 어댑터.
 *
 * 왜 이 모듈이 따로 있어야 하는가
 * ------------------------------
 * QC 체크리스트(production-episode-qc)의 "대사 맞춤법 검사" 항목은 aggregate 밖의
 * 검사 결과를 EpisodeQcExtras로 "호출자가 넘길 때만" 계산했다. 그런데 실제로 넘기는
 * 호출자가 없어서, 식자에서 검사를 실행해도 QC는 영원히 결과 없음(skipped)이었다 —
 * 검사를 한 사람과 QC를 보는 사람이 달라지는 순간 인계가 끊기는 구조적 단절이다.
 *
 * 이 모듈이 추가하는 것:
 *  · 검사 실행 지점(식자 표면)이 요약을 회차 키(projectId+episodeId)로 저장하는
 *    단일 기록 형식(DialogueSpellcheckQcRecord)과 저장/읽기 어댑터.
 *  · QC 표면은 이 기록을 스스로 읽어 extras로 변환한다 — 손으로 넘기는 단계가 없다.
 *  · 저장은 StorageLike(getItem/setItem) 인터페이스 뒤에 둔다. 브라우저에서는
 *    localStorage를 쓰지만, 코어와 테스트는 메모리 구현으로 그대로 검증된다.
 *    서버 aggregate 계약을 건드리지 않으므로 저장 실패가 검수 흐름을 막지 않는다
 *    (읽기·쓰기 실패는 전부 "기록 없음"으로 수렴한다).
 *
 * 규칙:
 *  - Konva/DOM 의존 없음. localStorage 접근은 resolve 함수 한 곳에서만, 실패하면 null.
 *  - 깨진 기록(버전 불일치·필드 손상·키와 내용 불일치)은 없는 것으로 취급한다 —
 *    잘못된 건수로 QC가 pass/blocked로 오판하는 것보다 "검사 미실행"이 정직하다.
 *  - production-episode-qc를 import하지 않는다(구조적 타이핑 — QC 모듈이 식자 모듈을
 *    import하지 않는 기존 규율과 대칭).
 */

import type { DialogueBatchItem } from "./studio-dialogue-batch";
import {
  summarizeDialogueSpellcheck,
  type DialogueSpellFinding,
  type DialogueSpellcheckOptions,
  type DialogueSpellcheckSummary,
} from "./studio-dialogue-spellcheck";

// ── 기록 형식 ───────────────────────────────────────────────────────────────

/** 식자에서 실행한 맞춤법 검사 1회의 회차 단위 요약 기록. */
export interface DialogueSpellcheckQcRecord {
  readonly version: 1;
  readonly projectId: string;
  readonly episodeId: string;
  /** 검사를 실행한 시각(ISO 8601). */
  readonly checkedAt: string;
  readonly errorCount: number;
  readonly warningCount: number;
  /** 검사 대상이 된 대사 수(숨김 제외 — summarizeDialogueSpellcheck와 같은 기준). */
  readonly checkedItemCount: number;
  readonly findingCount: number;
}

/** 저장소 최소 계약 — localStorage와 메모리 구현이 모두 만족한다. */
export interface SpellcheckQcStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DIALOGUE_SPELLCHECK_QC_STORAGE_PREFIX = "toonstudio:dialogue-spellcheck-qc:v1:";

export function dialogueSpellcheckQcStorageKey(projectId: string, episodeId: string): string {
  return `${DIALOGUE_SPELLCHECK_QC_STORAGE_PREFIX}${encodeURIComponent(projectId)}:${encodeURIComponent(episodeId)}`;
}

function requireNonEmptyId(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Dialogue spellcheck QC record requires a ${field}.`);
  return trimmed;
}

function requireCount(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Dialogue spellcheck QC record requires a non-negative integer ${field}.`);
  }
  return value;
}

/**
 * 검사 요약으로 QC 인계 기록을 만든다. 계약 위반(빈 id·손상된 건수·해석할 수 없는
 * 시각)은 조용히 넘기지 않고 throw한다 — 잘못된 기록이 저장되는 것을 원천에서 막는다.
 */
export function buildDialogueSpellcheckQcRecord(input: {
  readonly projectId: string;
  readonly episodeId: string;
  readonly summary: DialogueSpellcheckSummary;
  readonly checkedAt: Date | string;
}): DialogueSpellcheckQcRecord {
  const checkedAtTime = input.checkedAt instanceof Date
    ? input.checkedAt.getTime()
    : Date.parse(input.checkedAt);
  if (Number.isNaN(checkedAtTime)) {
    throw new Error("Dialogue spellcheck QC record requires a valid checkedAt.");
  }
  const checkedAtIso = new Date(checkedAtTime).toISOString();
  return Object.freeze({
    version: 1 as const,
    projectId: requireNonEmptyId(input.projectId, "projectId"),
    episodeId: requireNonEmptyId(input.episodeId, "episodeId"),
    checkedAt: checkedAtIso,
    errorCount: requireCount(input.summary.errorCount, "errorCount"),
    warningCount: requireCount(input.summary.warningCount, "warningCount"),
    checkedItemCount: requireCount(input.summary.checkedItemCount, "checkedItemCount"),
    findingCount: requireCount(input.summary.findingCount, "findingCount"),
  });
}

export function serializeDialogueSpellcheckQcRecord(record: DialogueSpellcheckQcRecord): string {
  return JSON.stringify(record);
}

function isValidCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** 저장된 문자열을 기록으로 되돌린다. 어떤 손상이든 null — 호출자는 "기록 없음"으로 다룬다. */
export function parseDialogueSpellcheckQcRecord(raw: string | null): DialogueSpellcheckQcRecord | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== 1) return null;
  if (typeof candidate.projectId !== "string" || !candidate.projectId.trim()) return null;
  if (typeof candidate.episodeId !== "string" || !candidate.episodeId.trim()) return null;
  if (typeof candidate.checkedAt !== "string" || Number.isNaN(Date.parse(candidate.checkedAt))) return null;
  if (!isValidCount(candidate.errorCount) || !isValidCount(candidate.warningCount)
    || !isValidCount(candidate.checkedItemCount) || !isValidCount(candidate.findingCount)) return null;
  return Object.freeze({
    version: 1 as const,
    projectId: candidate.projectId,
    episodeId: candidate.episodeId,
    checkedAt: candidate.checkedAt,
    errorCount: candidate.errorCount,
    warningCount: candidate.warningCount,
    checkedItemCount: candidate.checkedItemCount,
    findingCount: candidate.findingCount,
  });
}

// ── 저장/읽기 ───────────────────────────────────────────────────────────────

/** 기록을 저장한다. 저장소 예외(용량·차단)는 false로 수렴한다 — 검수 흐름을 막지 않는다. */
export function saveDialogueSpellcheckQcRecord(
  storage: SpellcheckQcStorageLike,
  record: DialogueSpellcheckQcRecord,
): boolean {
  try {
    storage.setItem(dialogueSpellcheckQcStorageKey(record.projectId, record.episodeId), serializeDialogueSpellcheckQcRecord(record));
    return true;
  } catch {
    return false;
  }
}

/**
 * 회차의 최신 검사 기록을 읽는다. 키와 기록 내용의 projectId·episodeId가 다르면
 * 다른 회차의 기록이므로 없는 것으로 취급한다.
 */
export function loadDialogueSpellcheckQcRecord(
  storage: SpellcheckQcStorageLike,
  projectId: string,
  episodeId: string,
): DialogueSpellcheckQcRecord | null {
  let raw: string | null;
  try {
    raw = storage.getItem(dialogueSpellcheckQcStorageKey(projectId, episodeId));
  } catch {
    return null;
  }
  const record = parseDialogueSpellcheckQcRecord(raw);
  if (!record) return null;
  if (record.projectId !== projectId || record.episodeId !== episodeId) return null;
  return record;
}

/** 브라우저 localStorage를 저장소로 돌려준다. 서버 렌더·접근 차단 환경이면 null. */
export function resolveDialogueSpellcheckQcStorage(): SpellcheckQcStorageLike | null {
  try {
    const storage = (globalThis as { localStorage?: unknown }).localStorage;
    if (!storage || typeof storage !== "object") return null;
    const candidate = storage as Partial<Storage>;
    if (typeof candidate.getItem !== "function" || typeof candidate.setItem !== "function") return null;
    return candidate as SpellcheckQcStorageLike;
  } catch {
    return null;
  }
}

// ── QC 인계 ─────────────────────────────────────────────────────────────────

/** production-episode-qc의 EpisodeQcExtras와 구조가 같은 인계 형태(의도적으로 import하지 않는다). */
export interface EpisodeDialogueSpellcheckQcExtras {
  readonly dialogueSpellcheck: {
    readonly errorCount: number;
    readonly warningCount: number;
    readonly checkedAt: string;
  };
}

/** 저장된 기록을 QC extras로 바꾼다. 기록이 없으면 undefined — QC 항목은 "검사 미실행" 명시 상태가 된다. */
export function episodeQcExtrasFromSpellcheckRecord(
  record: DialogueSpellcheckQcRecord | null,
): EpisodeDialogueSpellcheckQcExtras | undefined {
  if (!record) return undefined;
  return {
    dialogueSpellcheck: {
      errorCount: record.errorCount,
      warningCount: record.warningCount,
      checkedAt: record.checkedAt,
    },
  };
}

/**
 * 식자 표면의 검사 실행 지점이 부르는 단일 인계 함수.
 * 이미 계산된 findings를 요약해 회차 기록으로 저장한다 — 이 호출 한 번으로
 * QC 체크리스트가 다음 렌더부터 pass/blocked로 바뀐다. 저장에 실패해도 기록 자체는
 * 돌려주므로, 호출자는 이번 화면의 표시를 기록 기준으로 이어갈 수 있다.
 */
export function publishDialogueSpellcheckQcResult(
  storage: SpellcheckQcStorageLike,
  input: {
    readonly projectId: string;
    readonly episodeId: string;
    readonly items: readonly DialogueBatchItem[];
    readonly findings: readonly DialogueSpellFinding[];
    readonly options?: DialogueSpellcheckOptions;
    readonly checkedAt?: Date;
  },
): DialogueSpellcheckQcRecord {
  const summary = summarizeDialogueSpellcheck(input.items, input.findings, input.options ?? {});
  const record = buildDialogueSpellcheckQcRecord({
    projectId: input.projectId,
    episodeId: input.episodeId,
    summary,
    checkedAt: input.checkedAt ?? new Date(),
  });
  saveDialogueSpellcheckQcRecord(storage, record);
  return record;
}
