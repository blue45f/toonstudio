/**
 * 사용자 클라우드 AI 전송 오류. `user-ai-transport.ts`와 Claude 어댑터가 함께 쓰며, 둘이 서로를
 * import하지 않도록 별도 파일로 둔다(기존 import 경로는 transport 모듈이 재수출한다).
 */
export type UserAiTransportErrorCode =
  | "not-configured"
  | "quota-exhausted"
  | "all-free-exhausted"
  | "authentication"
  | "http-error";

export class UserAiTransportError extends Error {
  constructor(
    readonly code: UserAiTransportErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "UserAiTransportError";
  }
}

/**
 * 답이 출력 상한에 걸려 보이는 글 없이 끝났다(추론 모델이 생각에 상한을 다 쓴 경우가 많다). 처리는 됐지만 쓸 내용이
 * 없으므로, 호출 쪽은 이 키를 실패로 보고 더 큰 출력을 주는 다음 경로(ToonStudio AI)로 넘길 수 있다.
 */
export class UserAiEmptyTruncatedError extends UserAiTransportError {
  constructor() {
    super("http-error", "AI 답이 출력 한도에 걸려 비어 있어요. 더 짧게 요청하거나 다른 경로로 다시 시도해 주세요.", 200);
    this.name = "UserAiEmptyTruncatedError";
  }
}
