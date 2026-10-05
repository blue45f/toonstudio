// ContentPacksPage와 같은 상대 경로 import: worktree에서도 이 브랜치의 core 사전을
// 그대로 바인딩하기 위한 기존 도메인 관례다. 병합 뒤에는 패키지 import와 동일 파일이다.
import { REFERENCE_QUERY_MAX_LENGTH, resolveReferenceQuery } from "../../../../../packages/core/src/reference-query-language";

/**
 * 리서치 데스크 공용 한→영 검색어 변환 계층.
 *
 * 사다리:
 * 1차 — 내장 용어 사전(@toonstudio/core reference-query-language). 즉답·오프라인.
 * 2차 — 클라이언트 ONNX 번역 모델(research-query-mt). 사전으로 풀리지 않은
 *       한글이 남았을 때만 lazy load 한다. 로드 실패·미지원 환경이면 조용히
 *       사전 결과(부분 변환 포함) 또는 원문으로 폴백하고, 검색 자체는 막지 않는다.
 *
 * 영문만 있는 입력은 사전·모델 어느 층도 거치지 않고 종전과 동일하게 동작한다.
 */

export type ResearchQueryTranslationSource = "not-needed" | "dictionary" | "model" | "original";

export interface ResearchQueryTranslation {
  /** 정규화된 원본 입력 */
  original: string;
  /** 제공처에 실제로 보내는 검색어 */
  effectiveQuery: string;
  source: ResearchQueryTranslationSource;
  /** 사전으로 풀리지 않아 원문 그대로 남은 한글 조각 (사전 부분 변환일 때만) */
  unresolved: readonly string[];
  /** 2차 번역 모델 사용을 시도했는지 */
  modelAttempted: boolean;
}

/** 한→영 번역기 계약. 실패하면 null을 돌려주고, 던지지 않는 것이 계약이다. */
export type ResearchQueryTranslator = (koreanText: string) => Promise<string | null>;

const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u;

export function containsHangul(value: string): boolean {
  return HANGUL.test(value);
}

function normalizeInput(input: string): string {
  return input.normalize("NFC").trim().replace(/\s+/gu, " ");
}

/** 1차 사전 변환만으로 동기 해석한다. 모델 층이 필요 없거나 아직 준비 전일 때의 기본값. */
export function translateResearchQuerySync(input: string): ResearchQueryTranslation {
  const normalized = normalizeInput(input);
  if (!normalized) {
    return { original: "", effectiveQuery: "", source: "not-needed", unresolved: [], modelAttempted: false };
  }
  if (!containsHangul(normalized)) {
    return { original: normalized, effectiveQuery: normalized, source: "not-needed", unresolved: [], modelAttempted: false };
  }
  const resolution = resolveReferenceQuery(normalized);
  if (resolution.status === "translated") {
    return { original: normalized, effectiveQuery: resolution.providerQuery, source: "dictionary", unresolved: [], modelAttempted: false };
  }
  if (resolution.status === "partial") {
    return { original: normalized, effectiveQuery: resolution.providerQuery, source: "dictionary", unresolved: resolution.unresolved, modelAttempted: false };
  }
  // unsupported(사전 매칭 없음) · invalid(길이 초과 등) — 모델 층이 결정한다.
  return { original: normalized, effectiveQuery: normalized, source: "original", unresolved: resolution.unresolved, modelAttempted: false };
}

function usableModelOutput(candidate: string | null, original: string): string | null {
  if (candidate === null) return null;
  const cleaned = normalizeInput(candidate);
  if (!cleaned || cleaned === original) return null;
  if (containsHangul(cleaned)) return null;
  if (cleaned.length > REFERENCE_QUERY_MAX_LENGTH) return null;
  return cleaned;
}

async function loadTranslatorSafely(
  loadTranslator?: () => Promise<ResearchQueryTranslator | null>,
): Promise<ResearchQueryTranslator | null> {
  try {
    if (loadTranslator) return await loadTranslator();
    const mt = await import("./research-query-mt");
    return await mt.loadOpusMtTranslator();
  } catch {
    return null;
  }
}

async function runTranslatorSafely(
  translator: ResearchQueryTranslator,
  text: string,
): Promise<string | null> {
  try {
    return await translator(text);
  } catch {
    return null;
  }
}

/**
 * 사전 → 모델 → 사전 부분 결과/원문 순으로 해석하는 전체 사다리.
 * `loadTranslator`를 주입하지 않으면 research-query-mt의 기본 로더를 lazy import 한다.
 * 어떤 실패도 던지지 않는다 — 최악의 경우 원문 검색으로 귀결된다.
 */
export async function resolveResearchQueryTranslation(
  input: string,
  loadTranslator?: () => Promise<ResearchQueryTranslator | null>,
): Promise<ResearchQueryTranslation> {
  const sync = translateResearchQuerySync(input);
  const needsModel = sync.source === "original" || sync.unresolved.length > 0;
  if (!needsModel) return sync;
  const translator = await loadTranslatorSafely(loadTranslator);
  if (!translator) return { ...sync, modelAttempted: true };
  const usable = usableModelOutput(await runTranslatorSafely(translator, sync.original), sync.original);
  if (!usable) return { ...sync, modelAttempted: true };
  return { original: sync.original, effectiveQuery: usable, source: "model", unresolved: [], modelAttempted: true };
}
