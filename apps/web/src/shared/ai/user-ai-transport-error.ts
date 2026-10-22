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
