/**
 * Studio Writing Polish Provider — 글 고도화 제안 제공자 연결 지점 (명세 분리).
 *
 * 비용 원칙에 따라 이 모듈은 어떤 외부 AI 서비스도 직접 호출하지 않는다.
 * 제공하는 것은 "연결 지점"뿐이다:
 *  - WritingPolishProvider 인터페이스: AI 제공자(서버 경유 LLM 등)가 구현할 계약.
 *    입력(문서 목록+옵션)과 출력(제안 목록)을 코어 스키마로 고정한다.
 *  - localRuleWritingPolishProvider: 로컬 규칙 엔진을 같은 인터페이스로 감싼
 *    기본 제공자. 네트워크 없이 항상 동작하고 폴백이기도 하다.
 *  - polishWithProvider: 제공자를 시도하되 실패·타임아웃·검증 불가가 있으면
 *    usedFallback + 사유를 남긴 채 로컬 제안으로 진행한다(조용히 삼키지 않음).
 *
 * 원격 제공자를 붙일 때의 규약(호스트·서버 구현자용 명세):
 *  1. API 키는 클라이언트에 두지 않는다. 제공자는 서버 엔드포인트를 통해서만
 *     호출하고, 키는 서버 env/Secure Vault에만 둔다(사용자 비용 원칙:
 *     무료 토큰·크레딧 범위를 벗어나는 호출은 사전 보고 대상).
 *  2. 제공자는 WritingPolishSuggestion 스키마로 돌려준다. 이 모듈이
 *     원문 구간(start/end ↔ original 일치)으로 전수 검증한 제안만 통과시킨다 —
 *     제공자 산출을 신뢰하지 않는다. 검증에 실패한 제안은 버리고, 전부
 *     실패하면 로컬 규칙으로 폴백한다.
 *  3. 제공자는 원문을 확정하지 않는다. 제안은 패널에서 사람이 [적용]을 눌러야
 *     반영되며, 그 적용도 코어의 apply 함수(구간 검증 포함)를 거친다.
 *  4. 맞춤법 층위와 섞지 않는다: 제공자 프롬프트는 표현 제안만 요구하고,
 *     오기·띄어쓰기 지적은 studio-dialogue-spellcheck 의 몫으로 남긴다.
 *  5. 실패(네트워크·과금·형식 오류)는 전부 폴백 사유로 기록된다.
 *     사용자에게는 "기본 다듬기로 제안했어요" 수준으로만 드러낸다.
 */

import {
  suggestWritingPolish,
  type WritingPolishDocument,
  type WritingPolishOptions,
  type WritingPolishSuggestion,
} from "./studio-writing-polish";

export interface WritingPolishRequest {
  readonly documents: readonly WritingPolishDocument[];
  readonly options?: WritingPolishOptions;
}

export interface WritingPolishProvider {
  /** 제공자 식별자(로그·출처 표기용. 예: "local-rules", "server-llm:<model>"). */
  readonly id: string;
  readonly kind: "local-rules" | "remote-ai";
  /**
   * 문서들의 표현 제안을 돌려준다. 반환값은 신뢰하지 않는다 —
   * polishWithProvider 가 원문 구간으로 검증한 것만 통과시킨다.
   * 실패 시 throw 하면 호출자가 폴백한다.
   */
  suggest(request: WritingPolishRequest): Promise<readonly WritingPolishSuggestion[]>;
}

/** 로컬 규칙 엔진을 제공자 인터페이스로 감싼 기본 제공자(비용 없음). */
export const localRuleWritingPolishProvider: WritingPolishProvider = {
  id: "local-rules",
  kind: "local-rules",
  async suggest(request) {
    return suggestWritingPolish(request.documents, request.options ?? {});
  },
};

export interface WritingPolishOutcome {
  readonly suggestions: readonly WritingPolishSuggestion[];
  readonly providerId: string;
  readonly usedFallback: boolean;
  /** 폴백했거나 제안을 걸렀을 때의 사유. 정상 원격 성공이면 없음. */
  readonly fallbackReason?: string;
  /** 검증에서 걸러진 원격 제안 수(제공자 산출을 신뢰하지 않는 경계의 흔적). */
  readonly rejectedCount: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("writing-polish-timeout")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** 원격 제안 검증: 문서가 실재하고 원문 구간이 정확히 일치하는 것만 통과. */
export function validateRemotePolishSuggestions(
  documents: readonly WritingPolishDocument[],
  raw: readonly WritingPolishSuggestion[],
): { readonly accepted: readonly WritingPolishSuggestion[]; readonly rejectedCount: number } {
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const accepted: WritingPolishSuggestion[] = [];
  let rejectedCount = 0;
  for (const suggestion of raw) {
    const doc = byId.get(suggestion.documentId);
    if (!doc || suggestion.start < 0 || suggestion.end > doc.text.length || suggestion.start >= suggestion.end) {
      rejectedCount += 1;
      continue;
    }
    if (suggestion.original !== doc.text.slice(suggestion.start, suggestion.end)) {
      rejectedCount += 1;
      continue;
    }
    if (suggestion.suggested === suggestion.original && suggestion.suggested !== "") {
      rejectedCount += 1;
      continue;
    }
    accepted.push(suggestion);
  }
  return { accepted: Object.freeze(accepted), rejectedCount };
}

/**
 * 제공자(기본 로컬)로 제안을 받는다. 원격 제공자가 실패·타임아웃하거나
 * 검증 통과 제안이 하나도 없으면 로컬 규칙으로 폴백하고 사유를 남긴다.
 */
export async function polishWithProvider(
  provider: WritingPolishProvider,
  request: WritingPolishRequest,
  options: { readonly timeoutMs?: number } = {},
): Promise<WritingPolishOutcome> {
  if (provider.kind === "local-rules") {
    return {
      suggestions: await provider.suggest(request),
      providerId: provider.id,
      usedFallback: false,
      rejectedCount: 0,
    };
  }
  const fallback = async (reason: string, rejectedCount = 0): Promise<WritingPolishOutcome> => ({
    suggestions: await localRuleWritingPolishProvider.suggest(request),
    providerId: localRuleWritingPolishProvider.id,
    usedFallback: true,
    fallbackReason: reason,
    rejectedCount,
  });
  try {
    const raw = await withTimeout(provider.suggest(request), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const { accepted, rejectedCount } = validateRemotePolishSuggestions(request.documents, raw);
    if (accepted.length === 0) {
      return fallback(
        rejectedCount > 0 ? "원격 제안이 원문 검증에서 전부 걸러졌어요." : "원격 제안이 비어 있어요.",
        rejectedCount,
      );
    }
    return { suggestions: accepted, providerId: provider.id, usedFallback: false, rejectedCount };
  } catch (error) {
    return fallback(error instanceof Error && error.message === "writing-polish-timeout"
      ? "원격 제공자 응답이 늦어 기본 다듬기로 제안했어요."
      : "원격 제공자를 쓰지 못해 기본 다듬기로 제안했어요.");
  }
}
