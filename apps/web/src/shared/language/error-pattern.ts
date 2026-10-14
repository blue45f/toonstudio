/**
 * 에러 문구 문형 강제 — "원인 + 다음 행동 (+ 데이터 안전)" 패턴.
 *
 * 실패만 알리는 문구("저장에 실패했어요")는 사용자가 다음에 무엇을 해야 할지
 * 알려 주지 않는다. 새 에러 문구는 반드시 이 패턴으로 쓰고,
 * error-copy.guard.test.ts가 i18n 사전 전수를 검사해 회귀를 막는다.
 * 판정 근거: plain-language 감사 P1-2, BLUEPRINT §3.4(에러 문형 정본).
 */

export interface ErrorCopy {
  /** 무엇이 왜 안 됐는지 (원인) */
  readonly cause: string;
  /** 사용자가 지금 바로 할 수 있는 다음 행동 */
  readonly action: string;
  /** 입력·작업 데이터가 어떻게 됐는지 (선택) */
  readonly dataSafety?: string;
}

/** 입력 내용이 그대로 남아 있을 때 쓰는 기본 데이터 안전 문구. */
export const DEFAULT_DATA_SAFETY_NOTE = "입력한 내용은 그대로 남아 있어요.";

/** 문장들을 하나의 에러 문구로 합친다. 각 부분은 마침표 없이 넘겨도 된다. */
export function composeErrorCopy(copy: ErrorCopy): string {
  return [copy.cause, copy.dataSafety, copy.action]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => {
      const trimmed = part.trim();
      return /[.!?。]$/.test(trimmed) ? trimmed : `${trimmed}.`;
    })
    .join(" ");
}

/**
 * "다음 행동"으로 인정하는 표현. 다시 하기·확인하기·직접 하기·기다리기·
 * 문의하기처럼 사용자가 취할 수 있는 행동이 문장 안에 있어야 한다.
 */
export const ERROR_ACTION_GUIDANCE_PATTERN =
  /(다시\s*(시도|저장|선택|입력|눌러|골라|올려|열어|받)|확인해|확인하세요|선택해|입력해|눌러|돌아가|새로고침|잠시\s*(후|뒤)|문의해|문의하세요|직접\s*(복사|옮겨|골라|입력)|닫은\s*뒤|닫고|버튼|인터넷 연결|네트워크)/u;

/** "실패 계열" 문구 판정. 실패를 알리는데 행동 안내가 없으면 문형 위반이다. */
export const ERROR_FAILURE_PATTERN =
  /(실패|못했|못합|오류가 발생|불러오지 못|저장하지 못|읽지 못|처리하지 못|완료하지 못|삭제하지 못|전송하지 못|연결하지 못|확인하지 못|찾지 못|열지 못|만들지 못|등록하지 못|적용하지 못|이동하지 못|복사하지 못|보내지 못|받지 못|가져오지 못|내보내지 못|업로드하지 못|다운로드하지 못|실행하지 못|시작하지 못|중단했|막혔|막혀)/u;

export function isFailureCopy(text: string): boolean {
  return ERROR_FAILURE_PATTERN.test(text);
}

export function hasErrorActionGuidance(text: string): boolean {
  return ERROR_ACTION_GUIDANCE_PATTERN.test(text);
}

/** 실패 계열인데 다음 행동이 없는 문구인지 (문형 위반 판정). */
export function violatesErrorPattern(text: string): boolean {
  return isFailureCopy(text) && !hasErrorActionGuidance(text);
}
