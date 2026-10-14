/**
 * Studio Scene Provider — 문장→장면 구조화 제공자 연결 지점 (명세 분리).
 *
 * 비용 원칙에 따라 이 모듈은 어떤 외부 AI 서비스도 직접 호출하지 않는다.
 * 제공하는 것은 "연결 지점"뿐이다:
 *  - StudioSceneStructureProvider 인터페이스: AI 제공자(서버 경유 LLM 등)가
 *    구현할 계약. 입력(문장+캐릭터 명단)과 출력(슬롯 문서 원시 JSON)을
 *    고정하고, 타임아웃·형식 검증·폴백 규약을 명세한다.
 *  - studioSceneFallbackProvider: 규칙 기반 구조화기를 같은 인터페이스로
 *    감싼 로컬 제공자. 네트워크 없이 항상 동작하는 기본값이자 폴백이다.
 *  - structureSceneWithFallback: 제공자를 시도하되 실패·타임아웃·정규화
 *    불가 시 조용히 넘어가지 않고 usedFallback + 사유를 남긴 채 폴백 문서로
 *    진행한다 — 바이브 투닝 파이프라인의 "파싱 실패 대비 폴백 Scene JSON"
 *    설계 포인트 그대로다.
 *
 * 원격 제공자를 붙일 때의 규약(호스트·서버 구현자용 명세):
 *  1. API 키는 클라이언트에 두지 않는다. 제공자는 서버 엔드포인트를 통해서만
 *     호출하고, 키는 서버 env/Secure Vault에만 둔다(사용자 비용 원칙:
 *     무료 토큰·크레딧 범위를 벗어나는 호출은 사전 보고 대상).
 *  2. 제공자는 슬롯 문서 "원시 JSON"을 돌려준다. 이 모듈이
 *     normalizeStudioSceneSlotDocument로 검증·정규화한 뒤에만 조립 단계로
 *     넘긴다 — 제공자 산출을 신뢰하지 않는다.
 *  3. 응답 상한: 슬롯 상한(계약 파일 상수)을 프롬프트에도 명시하고,
 *     정규화 issues가 생기면 결과에 함께 남긴다.
 *  4. 실패(네트워크·과금·형식 오류)는 전부 폴백 사유로 기록된다.
 *     사용자에게는 "규칙 기반으로 만들었어요" 수준으로만 드러낸다.
 */

import { structureSentenceToSceneFallback } from "./studio-scene-fallback-structurer";
import {
  normalizeStudioSceneSlotDocument,
  type StudioSceneSlotDocument,
} from "./studio-scene-slot-contract";

export interface StudioSceneStructureRequest {
  readonly sentence: string;
  /** 프로젝트 캐릭터 명단 — 화자 귀속·캐릭터 슬롯의 근거. */
  readonly characterNames?: readonly string[];
}

export interface StudioSceneStructureProvider {
  /** 제공자 식별자(로그·출처 표기용. 예: "local-rules", "server-llm:<model>"). */
  readonly id: string;
  readonly kind: "local-rules" | "remote-ai";
  /**
   * 문장을 슬롯 문서 원시 형태로 구조화한다.
   * 반환값은 신뢰하지 않는다 — 호출자가 정규화를 거친다.
   * 실패 시 throw하면 호출자가 폴백한다.
   */
  structure(request: StudioSceneStructureRequest): Promise<unknown>;
}

/** 규칙 기반 폴백 구조화기를 제공자 인터페이스로 감싼 로컬 기본 제공자. */
export const studioSceneFallbackProvider: StudioSceneStructureProvider = {
  id: "local-rules",
  kind: "local-rules",
  async structure(request) {
    return structureSentenceToSceneFallback(request.sentence, {
      characterNames: request.characterNames,
    });
  },
};

export interface StudioSceneStructureOutcome {
  readonly document: StudioSceneSlotDocument;
  /** 실제로 문서를 만든 제공자 id. */
  readonly providerId: string;
  /** 원격 제공자를 시도했지만 폴백으로 진행했으면 true. */
  readonly usedFallback: boolean;
  /** 폴백 사유(제공자 오류·타임아웃·정규화 불가). 폴백이 없으면 null. */
  readonly fallbackReason: string | null;
  /** 정규화 issues(잘린 슬롯 등). */
  readonly issues: readonly string[];
}

/** 원격 제공자 기본 타임아웃(ms). 호스트가 옵션으로 조정한다. */
export const STUDIO_SCENE_PROVIDER_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("provider-timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * 제공자로 구조화를 시도하고, 어떤 실패에서도 폴백 문서로 진행한다.
 * provider를 주지 않으면 처음부터 폴백 제공자로 동작한다(usedFallback=false
 * — 폴백이 기본 동선인 경우를 "실패"로 기록하지 않는다).
 */
export async function structureSceneWithFallback(
  request: StudioSceneStructureRequest,
  provider?: StudioSceneStructureProvider,
  options: { timeoutMs?: number } = {}
): Promise<StudioSceneStructureOutcome> {
  const active = provider ?? studioSceneFallbackProvider;
  const isFallbackProvider = active.kind === "local-rules";
  try {
    const raw = await withTimeout(
      Promise.resolve(active.structure(request)),
      options.timeoutMs ?? STUDIO_SCENE_PROVIDER_TIMEOUT_MS
    );
    // 제공자가 원문 문장을 빠뜨렸으면 요청 문장으로 메운다(추적 필드일 뿐,
    // 슬롯 내용에는 관여하지 않는다).
    const rawWithSentence =
      raw && typeof raw === "object" && !Array.isArray(raw) && !(raw as { sentence?: unknown }).sentence
        ? { ...(raw as Record<string, unknown>), sentence: request.sentence }
        : raw;
    const { document, issues } = normalizeStudioSceneSlotDocument(
      rawWithSentence,
      isFallbackProvider ? "fallback" : "ai"
    );
    if (!document) {
      throw new Error("provider-output-unusable");
    }
    // 원격 제공자가 슬롯이 하나도 없는 빈 문서를 내면 형식 오류와 다를 바
    // 없으므로 폴백한다(로컬 폴백 제공자 자체의 빈 결과는 그대로 둔다 —
    // 그 경우 구조화기가 원문을 나레이션으로 보존한 상태다).
    if (
      !isFallbackProvider &&
      !document.background &&
      document.characters.length === 0 &&
      document.props.length === 0 &&
      document.dialogues.length === 0 &&
      document.narrations.length === 0 &&
      document.sfx.length === 0
    ) {
      throw new Error("provider-output-unusable");
    }
    return {
      document,
      providerId: active.id,
      usedFallback: false,
      fallbackReason: null,
      issues,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "provider-error";
    if (isFallbackProvider) {
      // 폴백 제공자 자체가 실패하는 일은 없어야 하지만, 계약상 문서는
      // 반드시 돌려준다 — 최후 수단으로 구조화기를 직접 다시 부른다.
      const document = structureSentenceToSceneFallback(request.sentence, {
        characterNames: request.characterNames,
      });
      return {
        document,
        providerId: studioSceneFallbackProvider.id,
        usedFallback: false,
        fallbackReason: reason,
        issues: ["fallback-provider-error"],
      };
    }
    const fallbackRaw = await studioSceneFallbackProvider.structure(request);
    const { document, issues } = normalizeStudioSceneSlotDocument(fallbackRaw, "fallback");
    return {
      // normalize가 폴백 산출을 거부할 수 없게 설계됐지만, 타입상 방어한다.
      document: document ?? structureSentenceToSceneFallback(request.sentence, {
        characterNames: request.characterNames,
      }),
      providerId: studioSceneFallbackProvider.id,
      usedFallback: true,
      fallbackReason: reason,
      issues,
    };
  }
}
