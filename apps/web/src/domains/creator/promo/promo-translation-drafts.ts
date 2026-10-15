import {
  CREATOR_ECOSYSTEM_MAX_BYTES,
  CREATOR_ECOSYSTEM_STORAGE_KEY,
  normalizeCreatorEcosystemState,
  type CreatorEcosystemState,
} from "../ecosystem/creator-ecosystem-model";
import {
  isPromoLocaleCode,
  PROMO_TRANSLATION_DRAFTS_KIND,
  PROMO_TRANSLATION_DRAFTS_MAX,
  PROMO_TRANSLATION_DRAFTS_VERSION,
  PROMO_TRANSLATION_FILE_MAX_BYTES,
  PROMO_TRANSLATION_ROWS_MAX,
  PROMO_TRANSLATION_TEXT_MAX,
} from "./promo-handoff-contract";

// 이름표와 상한은 Studio 내보내기와 공유하는 계약 파일에 있다. 기존 import 경로를 그대로 쓰도록 다시 내보낸다.
export {
  isPromoLocaleCode,
  PROMO_TRANSLATION_DRAFTS_KIND,
  PROMO_TRANSLATION_DRAFTS_MAX,
  PROMO_TRANSLATION_DRAFTS_VERSION,
  PROMO_TRANSLATION_FILE_MAX_BYTES,
  PROMO_TRANSLATION_ROWS_MAX,
};

/**
 * 번역 초안 묶음 — 로케일별 자막 일괄 출력의 입력.
 *
 * 입력은 두 곳에서 온다.
 *  1. 창작 생태계 작업대(/studio/ecosystem)의 대사 번역 — 번역이 "원문 개정(sourceRevision)"에 묶이고 승인 여부를 가진다.
 *     원문을 고치면 개정이 올라가 기존 번역이 오래됨(stale)이 된다. 이 브라우저의 저장소에서 바로 읽는다.
 *  2. 파일 — Studio 내보내기의 「번역 초안 JSON」(번역 시점의 원문 스냅샷 `source`로 오래됨을 판정), 창작 생태계 제작 기록의
 *     `translations`, 초안 배열, 창작 생태계 기록 JSON.
 * 두 방식 모두 "번역한 시점의 원문"이 문서의 "현재 원문"과 달라졌는지로 오래됨을 판정한다. 개정 번호가 있으면 개정으로,
 * 없으면 원문 글자로 비교한다.
 */
export interface PromoTranslationDraft {
  readonly id: string;
  readonly pageId: string;
  readonly elementId: string;
  /** 번역한 시점의 원문 스냅샷. */
  readonly source: string;
  readonly locale: string;
  readonly text: string;
  readonly approved: boolean;
  /** 갱신 시각(ISO). 시각을 남기지 않는 기록(창작 생태계 대사 번역)은 없다. */
  readonly updatedAt?: string;
  /** 번역한 시점의 원문 개정 번호(있으면). 행의 revision과 다르면 오래된 번역이다. */
  readonly sourceRevision?: number;
}

/** 문서의 현재 원문 한 줄(말풍선·텍스트). 오래됨 판정의 기준이다. */
export interface PromoTranslationRow {
  readonly pageId: string;
  readonly elementId: string;
  readonly source: string;
  /** 현재 원문의 개정 번호(있으면). 초안의 sourceRevision과 같아야 최신 번역이다. */
  readonly revision?: number;
}
export interface PromoTranslationBundle {
  readonly documentId: string | null;
  /** 제작 기록의 revision(있으면). 초안이 묶인 개정을 사람이 확인하는 표시용이다. */
  readonly revision: number | null;
  readonly drafts: readonly PromoTranslationDraft[];
  /** 문서의 현재 원문. 비어 있으면 오래됨(stale)을 판정할 수 없다. */
  readonly rows: readonly PromoTranslationRow[];
}

/** 창작 생태계의 translationState·translationStatus와 같은 규칙 — 원문이 달라졌으면 stale, 같으면 승인 여부. */
export type PromoTranslationState = "missing" | "stale" | "draft" | "approved";
export function promoTranslationState(
  row: Pick<PromoTranslationRow, "source" | "revision">,
  draft: Pick<PromoTranslationDraft, "source" | "approved" | "sourceRevision"> | undefined,
): PromoTranslationState {
  if (!draft) return "missing";
  // 개정 번호가 양쪽에 있으면 개정으로 비교한다(원문 글자가 되돌아와도 번역 이후에 원문이 한 번 바뀐 것은 사실이다).
  const outdated = row.revision !== undefined && draft.sourceRevision !== undefined
    ? draft.sourceRevision !== row.revision
    : draft.source !== row.source;
  if (outdated) return "stale";
  return draft.approved ? "approved" : "draft";
}

export function promoTranslationRowKey(pageId: string, elementId: string): string {
  return `${pageId}\u0000${elementId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringIn(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== "string" || value.length < min || value.length > max) throw new Error(`${label} 값이 올바르지 않아요.`);
  return value;
}
function revisionIn(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} 값이 올바르지 않아요.`);
  return value;
}
/** 갱신 시각(밀리초). 시각이 없는 초안은 가장 오래된 것으로 본다. */
function updatedTime(draft: PromoTranslationDraft): number {
  return draft.updatedAt ? Date.parse(draft.updatedAt) : 0;
}

function parseDraft(value: unknown, index: number): PromoTranslationDraft {
  if (!isRecord(value)) throw new Error(`번역 초안 ${index + 1}의 형식이 올바르지 않아요.`);
  const locale = stringIn(value.locale, 2, 20, `번역 초안 ${index + 1}의 로케일`);
  if (!isPromoLocaleCode(locale)) throw new Error(`번역 초안 ${index + 1}의 로케일(${locale.slice(0, 20)})이 올바르지 않아요. 예: en, ja, zh-Hans`);
  const updatedAt = stringIn(value.updatedAt, 1, 64, `번역 초안 ${index + 1}의 갱신 시각`);
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error(`번역 초안 ${index + 1}의 갱신 시각이 올바르지 않아요.`);
  if (typeof value.approved !== "boolean") throw new Error(`번역 초안 ${index + 1}의 승인 여부가 올바르지 않아요.`);
  return {
    id: stringIn(value.id, 1, 200, `번역 초안 ${index + 1}의 ID`),
    pageId: stringIn(value.pageId, 1, 200, `번역 초안 ${index + 1}의 페이지 ID`),
    elementId: stringIn(value.elementId, 1, 200, `번역 초안 ${index + 1}의 대사 ID`),
    source: stringIn(value.source, 0, PROMO_TRANSLATION_TEXT_MAX, `번역 초안 ${index + 1}의 원문`),
    locale,
    text: stringIn(value.text, 0, PROMO_TRANSLATION_TEXT_MAX, `번역 초안 ${index + 1}의 번역문`),
    approved: value.approved,
    updatedAt,
    ...(value.sourceRevision === undefined ? {} : { sourceRevision: revisionIn(value.sourceRevision, `번역 초안 ${index + 1}의 원문 개정`) }),
  };
}
function parseRow(value: unknown, index: number): PromoTranslationRow {
  if (!isRecord(value)) throw new Error(`원문 행 ${index + 1}의 형식이 올바르지 않아요.`);
  return {
    pageId: stringIn(value.pageId, 1, 200, `원문 행 ${index + 1}의 페이지 ID`),
    elementId: stringIn(value.elementId, 1, 200, `원문 행 ${index + 1}의 대사 ID`),
    source: stringIn(value.source, 0, PROMO_TRANSLATION_TEXT_MAX, `원문 행 ${index + 1}의 원문`),
    ...(value.revision === undefined ? {} : { revision: revisionIn(value.revision, `원문 행 ${index + 1}의 개정`) }),
  };
}

// ── 창작 생태계 작업대(/studio/ecosystem)의 대사 번역 ─────────────────────────

/** 창작 생태계 대사는 문서 페이지에 속하지 않는다. 행·초안이 같은 페이지 ID를 써서 서로 짝지어진다. */
export const PROMO_ECOSYSTEM_PAGE_ID = "ecosystem";

/**
 * 창작 생태계 상태의 대사(원문 + 개정 번호) → 번역 초안 묶음. 번역은 "그 번역을 만든 시점의 원문 개정"을 가지고,
 * 행은 "지금 원문 개정"을 가진다. 둘이 다르면 오래된 번역이다(창작 생태계의 translationStatus와 같은 판정).
 * 같은 ID가 둘 이상이면 뒤의 것을 쓴다. 번역하거나 고치지 않고, 번역이 없는 대사도 행으로 남겨 "번역 없음"을 판정한다.
 */
export function promoTranslationBundleFromEcosystem(state: Pick<CreatorEcosystemState, "dialogue">): PromoTranslationBundle {
  const latest = new Map<string, CreatorEcosystemState["dialogue"][number]>();
  for (const record of state.dialogue) latest.set(record.id, record);
  const rows: PromoTranslationRow[] = [];
  const drafts: PromoTranslationDraft[] = [];
  for (const record of latest.values()) {
    rows.push({ pageId: PROMO_ECOSYSTEM_PAGE_ID, elementId: record.id, source: record.source, revision: record.sourceRevision });
    for (const [locale, translation] of Object.entries(record.translations)) {
      if (!isPromoLocaleCode(locale)) continue;
      drafts.push({
        id: `${record.id}:${locale}`,
        pageId: PROMO_ECOSYSTEM_PAGE_ID,
        elementId: record.id,
        source: record.source,
        locale,
        text: translation.text,
        approved: translation.approved,
        sourceRevision: translation.sourceRevision,
      });
    }
  }
  return { documentId: null, revision: null, drafts, rows };
}

export type PromoEcosystemReadFailure = "unavailable" | "empty" | "no-translations" | "corrupt";
export type PromoEcosystemRead =
  | { readonly ok: true; readonly bundle: PromoTranslationBundle }
  | { readonly ok: false; readonly reason: PromoEcosystemReadFailure };

/**
 * 이 브라우저에 저장된 창작 생태계 기록에서 대사 번역을 읽는다. 저장소를 못 쓰거나(시크릿 모드·차단), 기록이 없거나,
 * 대사는 있지만 번역이 없거나, 기록이 깨졌는지를 구분해 돌려준다. 내용은 창작 생태계 쪽 검증(normalize)을 거친다.
 */
export function readPromoEcosystemTranslations(storage: Storage | null | undefined): PromoEcosystemRead {
  if (!storage) return { ok: false, reason: "unavailable" };
  let raw: string | null;
  try {
    raw = storage.getItem(CREATOR_ECOSYSTEM_STORAGE_KEY);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (raw === null) return { ok: false, reason: "empty" };
  if (raw.length > CREATOR_ECOSYSTEM_MAX_BYTES) return { ok: false, reason: "corrupt" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  const state = normalizeCreatorEcosystemState(parsed);
  if (!state.dialogue.length) return { ok: false, reason: "empty" };
  const bundle = promoTranslationBundleFromEcosystem(state);
  if (!bundle.drafts.length) return { ok: false, reason: "no-translations" };
  return { ok: true, bundle };
}

// ── 파일 ───────────────────────────────────────────────────────────────────

/**
 * 번역 초안 파일을 읽는다. 받는 모양:
 *  1. `{ kind: "toonstudio-translation-drafts", version: 1, drafts, rows?, revision?, documentId? }`
 *  2. 창작 생태계 제작 기록 `{ translations, revision?, documentId? }`
 *  3. 초안 배열 `[...]`
 *  4. 창작 생태계 작업대 기록 `{ version: 1, dialogue: [...] }` — 원문 개정 번호로 오래됨을 판정한다.
 * 같은 (페이지, 대사, 로케일) 초안이 여럿이면 가장 늦게 갱신된 하나만 남긴다.
 */
export function parsePromoTranslationBundle(input: unknown): PromoTranslationBundle {
  let rawDrafts: unknown;
  let rawRows: unknown;
  let documentId: string | null = null;
  let revision: number | null = null;
  if (Array.isArray(input)) {
    rawDrafts = input;
  } else if (isRecord(input)) {
    if (input.kind === undefined && input.version === 1 && Array.isArray(input.dialogue)
      && !Array.isArray(input.drafts) && !Array.isArray(input.translations)) {
      const bundle = promoTranslationBundleFromEcosystem(normalizeCreatorEcosystemState(input));
      if (bundle.drafts.length > PROMO_TRANSLATION_DRAFTS_MAX) throw new Error(`번역 초안은 ${PROMO_TRANSLATION_DRAFTS_MAX}건까지 불러올 수 있어요.`);
      return bundle;
    }
    if (input.kind !== undefined && input.kind !== PROMO_TRANSLATION_DRAFTS_KIND) {
      throw new Error(input.kind === "toonstudio-document-cuts" ? "컷 묶음 파일이에요. 번역 초안은 「번역 초안 JSON」 파일을 선택해 주세요." : "번역 초안 파일이 아니에요.");
    }
    if (input.kind !== undefined && input.version !== PROMO_TRANSLATION_DRAFTS_VERSION) throw new Error("지원하지 않는 번역 초안 파일 버전이에요.");
    rawDrafts = Array.isArray(input.drafts) ? input.drafts : input.translations;
    rawRows = input.rows;
    if (input.documentId !== undefined && input.documentId !== null) documentId = stringIn(input.documentId, 1, 200, "문서 ID");
    if (input.revision !== undefined && input.revision !== null) {
      if (typeof input.revision !== "number" || !Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("revision 값이 올바르지 않아요.");
      revision = input.revision;
    }
  } else {
    throw new Error("번역 초안 파일의 형식이 올바르지 않아요.");
  }
  if (!Array.isArray(rawDrafts)) throw new Error("번역 초안 목록(drafts 또는 translations)을 찾지 못했어요.");
  if (rawDrafts.length > PROMO_TRANSLATION_DRAFTS_MAX) throw new Error(`번역 초안은 ${PROMO_TRANSLATION_DRAFTS_MAX}건까지 불러올 수 있어요.`);
  if (rawRows !== undefined && (!Array.isArray(rawRows) || rawRows.length > PROMO_TRANSLATION_ROWS_MAX)) throw new Error("원문 행(rows) 목록이 올바르지 않아요.");

  const latest = new Map<string, PromoTranslationDraft>();
  rawDrafts.forEach((item, index) => {
    const draft = parseDraft(item, index);
    const key = `${promoTranslationRowKey(draft.pageId, draft.elementId)}\u0000${draft.locale}`;
    const current = latest.get(key);
    if (!current || updatedTime(draft) >= updatedTime(current)) latest.set(key, draft);
  });
  const rows = (Array.isArray(rawRows) ? rawRows : []).map(parseRow);
  const rowKeys = new Set<string>();
  for (const row of rows) {
    const key = promoTranslationRowKey(row.pageId, row.elementId);
    if (rowKeys.has(key)) throw new Error("원문 행(rows)에 같은 대사가 두 번 들어 있어요.");
    rowKeys.add(key);
  }
  return { documentId, revision, drafts: [...latest.values()], rows };
}

export async function readPromoTranslationBundle(file: File): Promise<PromoTranslationBundle> {
  if (file.size === 0) throw new Error("빈 파일이에요.");
  if (file.size > PROMO_TRANSLATION_FILE_MAX_BYTES) throw new Error("번역 초안 파일은 8MB 이하여야 해요.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("JSON으로 읽을 수 없는 파일이에요. 번역 초안(.json)을 선택해 주세요.");
  }
  return parsePromoTranslationBundle(parsed);
}

/** 초안에 등장하는 로케일을 가나다·알파벳 순으로. */
export function promoTranslationLocales(bundle: Pick<PromoTranslationBundle, "drafts">): string[] {
  return [...new Set(bundle.drafts.map((draft) => draft.locale))].sort((left, right) => left.localeCompare(right));
}
