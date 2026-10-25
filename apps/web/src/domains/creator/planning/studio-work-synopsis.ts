/**
 * studio-work-synopsis.ts — 작품 단위 시놉시스 (순수 모듈, fetch 없음).
 *
 * 회차 단위 시놉시스(이번 화 줄거리)는 배선돼 있으나 작품 단위 시놉시스
 * 문서(전체 줄거리·로그라인·기획 의도)를 별도 필드로 다루는 기능은
 * 없었다. 이 모듈은 회차 줄거리와 구분되는 작품 시놉시스 스키마와
 * 검증·갱신만 담당한다. 저장은 호출부가 작품 메타데이터 경로로 수행한다.
 */

export interface StudioWorkSynopsis {
  readonly workId: string;
  readonly logline: string;
  readonly synopsis: string;
  readonly intent: string;
  readonly updatedAt: number;
}

const MAX_LOGLINE = 200;
const MAX_SYNOPSIS = 2000;
const MAX_INTENT = 1000;

export type StudioWorkSynopsisResult =
  | { readonly ok: true; readonly synopsis: StudioWorkSynopsis }
  | { readonly ok: false; readonly reason: "empty_work_id" };

/** 작품 시놉시스를 만든다. 길이 상한을 넘기면 자른다. */
export function createWorkSynopsis(input: {
  readonly workId: string;
  readonly logline: string;
  readonly synopsis: string;
  readonly intent: string;
  readonly now?: number;
}): StudioWorkSynopsisResult {
  if (!input.workId.trim()) return { ok: false, reason: "empty_work_id" };
  return {
    ok: true,
    synopsis: {
      workId: input.workId,
      logline: input.logline.trim().slice(0, MAX_LOGLINE),
      synopsis: input.synopsis.trim().slice(0, MAX_SYNOPSIS),
      intent: input.intent.trim().slice(0, MAX_INTENT),
      updatedAt: input.now ?? Date.now(),
    },
  };
}

/** 기존 시놉시스에 부분 갱신을 적용한다. */
export function updateWorkSynopsis(
  prev: StudioWorkSynopsis,
  patch: Partial<Pick<StudioWorkSynopsis, "logline" | "synopsis" | "intent">>,
  now: number = Date.now(),
): StudioWorkSynopsis {
  return {
    ...prev,
    logline:
      patch.logline !== undefined
        ? patch.logline.trim().slice(0, MAX_LOGLINE)
        : prev.logline,
    synopsis:
      patch.synopsis !== undefined
        ? patch.synopsis.trim().slice(0, MAX_SYNOPSIS)
        : prev.synopsis,
    intent:
      patch.intent !== undefined
        ? patch.intent.trim().slice(0, MAX_INTENT)
        : prev.intent,
    updatedAt: now,
  };
}
