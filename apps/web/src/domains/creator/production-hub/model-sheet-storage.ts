/**
 * 모델 시트 저장 계약 — CharacterModelSheet 를 StudioStoryBible 의 optional
 * 컬렉션(modelSheets)으로 영속하는 규칙의 정본.
 *
 * 근거: model-sheet-freeze-gate 의 HOST_INSERTION_SPEC §2 가 "1차 장착은
 * 기획 저장소(StudioStoryBible 의 optional 컬렉션)" 로 정했고, 이 파일이
 * 그 결정을 계약으로 굳힌다. 서술형 프로필 확장(studio-character-profile)
 * 과 같은 원칙이다: 확장이 없는 기존 바이블도 그대로 유효하다.
 *
 * 계약:
 * 1. 마이그레이션 없음. modelSheets 가 없는 바이블 = 모델 시트 0개.
 *    읽는 쪽(modelSheetsFromBible)은 undefined 를 빈 목록으로만 해석하고,
 *    검증(validateStudioStoryBible)도 컬렉션이 있을 때만 검사한다.
 * 2. 캐릭터당 최대 1레코드. 쓰기는 withModelSheet(upsert) 한 경로뿐 —
 *    같은 캐릭터의 두 번째 레코드는 교체이지 추가가 아니다.
 * 3. 컬렉션이 비면 필드 자체를 뺀다. "확장 없음"이 기본 모양이라,
 *    시트를 전부 지운 바이블은 확장 이전 바이블과 같은 모양으로 돌아간다.
 * 4. 영속 경계(JSON)는 parseStoredModelSheets 로만 들어온다. 모양이 깨진
 *    항목은 조용히 고치지 않는다 — 버리고 issues 로 드러낸다. 모르는
 *    필드는 저장본에 남기지 않는다(toStoredModelSheets 가 계약 필드만 복사).
 * 5. 레코드 자체의 연산(동결·변경·영향 분석)은 model-sheet-freeze-model
 *    의 순수 함수가 정본이다. 이 파일은 보관·왕복만 책임진다.
 *
 * React·네트워크·실제 스토리지 백엔드에 의존하지 않는다. 서버 영속은
 * 호스트가 이 계약의 JSON 모양을 그대로 저장/복원하면 된다.
 */
import type { StudioStoryBible } from "../studio-story-bible";

import type {
  CharacterModelSheet,
  ModelSheetChange,
  ModelSheetRevision,
} from "./model-sheet-freeze-model";

/* ------------------------------------------------------------------ */
/* 읽기 — 부재는 빈 목록이다                                            */
/* ------------------------------------------------------------------ */

/** 바이블에 붙은 모델 시트 목록. 확장이 없는 바이블이면 빈 목록. */
export function modelSheetsFromBible(
  bible: StudioStoryBible,
): readonly CharacterModelSheet[] {
  return bible.modelSheets ?? [];
}

/** 캐릭터의 모델 시트. 없으면 null — "없음"과 "초안"은 다르다. */
export function modelSheetForCharacter(
  bible: StudioStoryBible,
  characterId: string,
): CharacterModelSheet | null {
  return modelSheetsFromBible(bible).find((sheet) => sheet.characterId === characterId) ?? null;
}

/* ------------------------------------------------------------------ */
/* 쓰기 — 전부 새 바이블을 돌려주는 순수 함수. 원본은 바꾸지 않는다.     */
/* ------------------------------------------------------------------ */

function bibleWithSheets(
  bible: StudioStoryBible,
  sheets: readonly CharacterModelSheet[],
): StudioStoryBible {
  if (sheets.length === 0) {
    const { modelSheets: _dropped, ...rest } = bible;
    return rest;
  }
  return { ...bible, modelSheets: sheets };
}

/** 컬렉션 전체를 교체한다. 순서는 characters 와 무관하게 주어진 대로 둔다. */
export function withModelSheets(
  bible: StudioStoryBible,
  sheets: readonly CharacterModelSheet[],
): StudioStoryBible {
  return bibleWithSheets(bible, [...sheets]);
}

/**
 * 캐릭터의 모델 시트를 넣거나 교체한다(upsert).
 * 이미 있으면 그 자리에서 교체하고, 없으면 끝에 붙인다.
 */
export function withModelSheet(
  bible: StudioStoryBible,
  sheet: CharacterModelSheet,
): StudioStoryBible {
  const current = modelSheetsFromBible(bible);
  const index = current.findIndex((entry) => entry.characterId === sheet.characterId);
  const next = index >= 0
    ? current.map((entry, entryIndex) => (entryIndex === index ? sheet : entry))
    : [...current, sheet];
  return bibleWithSheets(bible, next);
}

/** 캐릭터의 모델 시트를 지운다. 없는 캐릭터면 같은 바이블을 돌려준다. */
export function removeModelSheet(
  bible: StudioStoryBible,
  characterId: string,
): StudioStoryBible {
  const current = modelSheetsFromBible(bible);
  if (!current.some((sheet) => sheet.characterId === characterId)) return bible;
  return bibleWithSheets(bible, current.filter((sheet) => sheet.characterId !== characterId));
}

/* ------------------------------------------------------------------ */
/* 영속 모양 — 계약 필드만 복사한 JSON-safe 사본                          */
/* ------------------------------------------------------------------ */

function storedRevision(revision: ModelSheetRevision): ModelSheetRevision {
  return {
    revision: revision.revision,
    expressionRef: revision.expressionRef,
    poseRef: revision.poseRef,
    assetRefs: [...revision.assetRefs],
    note: revision.note,
    authorId: revision.authorId,
    authorName: revision.authorName,
    createdAt: revision.createdAt,
  };
}

function storedChange(change: ModelSheetChange): ModelSheetChange {
  return {
    fromRevision: change.fromRevision,
    toRevision: change.toRevision,
    changedById: change.changedById,
    changedByName: change.changedByName,
    changedAt: change.changedAt,
    reason: change.reason,
    acknowledgedEpisodeIds: [...change.acknowledgedEpisodeIds],
  };
}

/**
 * 저장본으로 내보낼 사본. 계약에 없는 필드는 따라가지 않는다 —
 * 메모리 레코드에 임시 필드가 붙어 있어도 저장 모양은 계약 그대로다.
 */
export function toStoredModelSheets(
  sheets: readonly CharacterModelSheet[],
): readonly CharacterModelSheet[] {
  return sheets.map((sheet) => ({
    characterId: sheet.characterId,
    status: sheet.status,
    revisions: sheet.revisions.map(storedRevision),
    frozenRevision: sheet.frozenRevision,
    frozenById: sheet.frozenById,
    frozenByName: sheet.frozenByName,
    frozenAt: sheet.frozenAt,
    changes: sheet.changes.map(storedChange),
  }));
}

export function stringifyModelSheets(sheets: readonly CharacterModelSheet[]): string {
  return JSON.stringify(toStoredModelSheets(sheets));
}

/* ------------------------------------------------------------------ */
/* 복원 — unknown 에서 계약 모양으로. 깨진 항목은 버리고 issues 로 말한다 */
/* ------------------------------------------------------------------ */

export interface ModelSheetStorageIssue {
  readonly code:
    | "not-a-collection"
    | "invalid-json"
    | "invalid-entry"
    | "duplicate-character";
  readonly message: string;
  /** 문제를 일으킨 항목의 characterId 를 알 수 있을 때만 채운다. */
  readonly characterId: string | null;
}

export interface ModelSheetStorageParseResult {
  readonly sheets: readonly CharacterModelSheet[];
  readonly issues: readonly ModelSheetStorageIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRevisionNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function parseRevision(raw: unknown): ModelSheetRevision | null {
  if (!isRecord(raw)) return null;
  if (!isRevisionNumber(raw.revision)) return null;
  if (!isStringOrNull(raw.expressionRef) || !isStringOrNull(raw.poseRef)) return null;
  if (!isStringArray(raw.assetRefs)) return null;
  if (typeof raw.note !== "string" || typeof raw.authorId !== "string") return null;
  if (typeof raw.authorName !== "string" || typeof raw.createdAt !== "string") return null;
  return {
    revision: raw.revision,
    expressionRef: raw.expressionRef,
    poseRef: raw.poseRef,
    assetRefs: [...raw.assetRefs],
    note: raw.note,
    authorId: raw.authorId,
    authorName: raw.authorName,
    createdAt: raw.createdAt,
  };
}

function parseChange(raw: unknown): ModelSheetChange | null {
  if (!isRecord(raw)) return null;
  if (!isRevisionNumber(raw.fromRevision) || !isRevisionNumber(raw.toRevision)) return null;
  if (typeof raw.changedById !== "string" || typeof raw.changedByName !== "string") return null;
  if (typeof raw.changedAt !== "string" || typeof raw.reason !== "string") return null;
  if (!isStringArray(raw.acknowledgedEpisodeIds)) return null;
  return {
    fromRevision: raw.fromRevision,
    toRevision: raw.toRevision,
    changedById: raw.changedById,
    changedByName: raw.changedByName,
    changedAt: raw.changedAt,
    reason: raw.reason,
    acknowledgedEpisodeIds: [...raw.acknowledgedEpisodeIds],
  };
}

function parseSheet(raw: unknown): CharacterModelSheet | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.characterId !== "string" || raw.characterId.trim().length === 0) return null;
  if (raw.status !== "draft" && raw.status !== "frozen") return null;
  if (!Array.isArray(raw.revisions) || !Array.isArray(raw.changes)) return null;
  if (!(raw.frozenRevision === null || isRevisionNumber(raw.frozenRevision))) return null;
  if (!isStringOrNull(raw.frozenById) || !isStringOrNull(raw.frozenByName)) return null;
  if (!isStringOrNull(raw.frozenAt)) return null;
  const revisions: ModelSheetRevision[] = [];
  for (const rawRevision of raw.revisions) {
    const revision = parseRevision(rawRevision);
    if (!revision) return null;
    revisions.push(revision);
  }
  const changes: ModelSheetChange[] = [];
  for (const rawChange of raw.changes) {
    const change = parseChange(rawChange);
    if (!change) return null;
    changes.push(change);
  }
  return {
    characterId: raw.characterId,
    status: raw.status,
    revisions,
    frozenRevision: raw.frozenRevision,
    frozenById: raw.frozenById,
    frozenByName: raw.frozenByName,
    frozenAt: raw.frozenAt,
    changes,
  };
}

/**
 * 저장본(unknown)에서 모델 시트 컬렉션을 복원한다.
 * - undefined/null 은 "확장 없음"이라 issues 없이 빈 목록이다(마이그레이션 없음).
 * - 항목 하나가 깨지면 그 항목만 버리고 나머지는 살린다. 중복 캐릭터는
 *   먼저 온 레코드를 정본으로 삼는다. 어느 경우든 issues 에 남긴다.
 */
export function parseStoredModelSheets(raw: unknown): ModelSheetStorageParseResult {
  if (raw === undefined || raw === null) return { sheets: [], issues: [] };
  if (!Array.isArray(raw)) {
    return {
      sheets: [],
      issues: [{
        code: "not-a-collection",
        message: "Stored model sheets are not a collection; nothing was restored.",
        characterId: null,
      }],
    };
  }
  const sheets: CharacterModelSheet[] = [];
  const issues: ModelSheetStorageIssue[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, index) => {
    const sheet = parseSheet(entry);
    if (!sheet) {
      issues.push({
        code: "invalid-entry",
        message: `Stored model sheet #${index + 1} does not match the storage contract and was skipped.`,
        characterId: isRecord(entry) && typeof entry.characterId === "string"
          ? entry.characterId
          : null,
      });
      return;
    }
    if (seen.has(sheet.characterId)) {
      issues.push({
        code: "duplicate-character",
        message: "Two stored model sheets name the same character; the first one wins.",
        characterId: sheet.characterId,
      });
      return;
    }
    seen.add(sheet.characterId);
    sheets.push(sheet);
  });
  return { sheets, issues };
}

/** JSON 문자열 저장본 복원. 파싱 실패는 issues 로만 말한다(throw 하지 않음). */
export function parseModelSheetsJson(text: string): ModelSheetStorageParseResult {
  try {
    return parseStoredModelSheets(JSON.parse(text) as unknown);
  } catch {
    return {
      sheets: [],
      issues: [{
        code: "invalid-json",
        message: "Stored model sheets are not valid JSON; nothing was restored.",
        characterId: null,
      }],
    };
  }
}
