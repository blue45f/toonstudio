import { api } from "@/platform/api";
import type { StudioSpatialInviteContext } from "./studio-spatial-invite-context";

/**
 * 가상 스튜디오 게스트 자격의 서버 검증 클라이언트 (F-B06-1).
 *
 * 초대 토큰·입장코드는 이 검증을 통과한 뒤에만 게스트 세션을 만들 수 있다.
 * 네트워크·서버 오류는 "무효"와 구분되는 `unavailable`로 돌려준다 — 확인이
 * 안 된 것을 무효라고 거짓말하지 않고, 자격 기반 입장을 통과시키지도 않기
 * 위해서다(호출부가 fail-closed로 다룬다).
 */

export type SpatialInviteRejection = "not-found" | "revoked" | "consumed" | "expired" | "space-mismatch";
export type SpaceEntryCodeRejection = "not-found" | "revoked" | "expired" | "locked";

export type SpatialInviteVerification =
  | { readonly status: "valid"; readonly expiresAt: string }
  | { readonly status: "invalid"; readonly reason: SpatialInviteRejection }
  | { readonly status: "unavailable" };

export type SpaceEntryCodeVerification =
  | { readonly status: "valid"; readonly expiresAt: string }
  | { readonly status: "invalid"; readonly reason: SpaceEntryCodeRejection; readonly retryAfterSeconds?: number }
  | { readonly status: "unavailable" };

export type SpatialAccessVerification = SpatialInviteVerification | SpaceEntryCodeVerification;

const INVITE_REJECTIONS: ReadonlySet<string> = new Set(["not-found", "revoked", "consumed", "expired", "space-mismatch"]);
const CODE_REJECTIONS: ReadonlySet<string> = new Set(["not-found", "revoked", "expired", "locked"]);

interface VerificationResponse {
  readonly valid?: unknown;
  readonly reason?: unknown;
  readonly expiresAt?: unknown;
  readonly retryAfterSeconds?: unknown;
}

function toInviteVerification(response: VerificationResponse): SpatialInviteVerification {
  if (response.valid === true && typeof response.expiresAt === "string") {
    return { status: "valid", expiresAt: response.expiresAt };
  }
  if (response.valid === false && typeof response.reason === "string" && INVITE_REJECTIONS.has(response.reason)) {
    return { status: "invalid", reason: response.reason as SpatialInviteRejection };
  }
  // 형식이 어긋난 응답은 확인된 것으로 치지 않는다.
  return { status: "unavailable" };
}

function toCodeVerification(response: VerificationResponse): SpaceEntryCodeVerification {
  if (response.valid === true && typeof response.expiresAt === "string") {
    return { status: "valid", expiresAt: response.expiresAt };
  }
  if (response.valid === false && typeof response.reason === "string" && CODE_REJECTIONS.has(response.reason)) {
    return {
      status: "invalid",
      reason: response.reason as SpaceEntryCodeRejection,
      retryAfterSeconds: typeof response.retryAfterSeconds === "number" ? response.retryAfterSeconds : undefined,
    };
  }
  return { status: "unavailable" };
}

/** 워크스페이스 초대 토큰 검증. 토큰을 소모하지 않는다. */
export async function verifyStudioSpatialInvite(
  token: string,
  context: StudioSpatialInviteContext,
): Promise<SpatialInviteVerification> {
  try {
    const response = await api.post<VerificationResponse>("/studio/space/access/invite/verify", { token, context });
    return toInviteVerification(response);
  } catch {
    return { status: "unavailable" };
  }
}

/** 서버 발급 입장코드 검증. */
export async function verifyStudioSpaceEntryCode(
  spaceId: string,
  code: string,
): Promise<SpaceEntryCodeVerification> {
  try {
    const response = await api.post<VerificationResponse>("/studio/space/access/entry-codes/verify", { spaceId, code });
    return toCodeVerification(response);
  } catch {
    return { status: "unavailable" };
  }
}

export interface IssuedStudioSpaceEntryCode {
  readonly id: string;
  readonly code: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly expiresAt: string;
}

/**
 * 입장코드 발급(호스트용). 코드 원문은 이 응답으로만 한 번 얻을 수 있고
 * 서버에는 해시만 남는다. 실패하면 예외를 던진다 — 발급은 확인이 필요한
 * 쓰기 작업이라 조용히 성공한 척하지 않는다.
 */
export async function issueStudioSpaceEntryCode(
  spaceId: string,
  input: { readonly spaceName?: string; readonly ttlDays?: number } = {},
): Promise<IssuedStudioSpaceEntryCode> {
  return api.post<IssuedStudioSpaceEntryCode>("/studio/space/access/entry-codes", { spaceId, ...input });
}

/** 입장코드 회수(발급자·공간 관리자). */
export async function revokeStudioSpaceEntryCode(id: string): Promise<{ readonly id: string; readonly revoked: boolean }> {
  return api.post<{ readonly id: string; readonly revoked: boolean }>(`/studio/space/access/entry-codes/${encodeURIComponent(id)}/revoke`, {});
}
