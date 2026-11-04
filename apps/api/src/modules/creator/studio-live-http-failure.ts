import { HttpException } from "@nestjs/common";

/** 프레임워크 예외 판정은 ACK 계약 leaf의 바깥에서 수행한다. */
export function isStudioLiveHttpAuthorizationDenied(error: unknown): boolean {
  return error instanceof HttpException && [403, 409].includes(error.getStatus());
}
