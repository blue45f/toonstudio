import type { TeamWorkspaceInvite } from "@toonstudio/contracts/production-workspace";

/**
 * 초대 전달·수락 추적 모델 (collab-flow-audit REPORT §1.1·마찰 4 후속).
 *
 * 서버 계약이 실제로 아는 것만 상태로 만든다 — 없는 사실을 지어내지 않는다.
 * - 수락 상태: TeamWorkspaceDetail.invites 는 "아직 수락되지 않은" 초대만 담는다.
 *   수락하면 목록에서 사라지고 members 로 이동한다. 그래서 이 목록의 모든 행은
 *   정의상 미수락이며, 남은 구분은 만료 여부뿐이다.
 * - 전달 상태: 서버는 이메일 자동 발송을 하지 않고(mutation 결과 delivery: "manual-link"),
 *   비밀 링크는 발급 순간 1회만 표시되며 재표시되지 않는다. 따라서 이 세션에서
 *   링크가 표시·복사된 기록이 없는 초대는 초대자가 지금 손에 링크가 없어
 *   전달할 수 없는 상태다 — "재발행 필요"가 정직한 표기다. 서버가 상대의
 *   메일함 도착 여부를 아는 것처럼 꾸미지 않는다.
 */

export const INVITE_EXPIRING_SOON_MS = 24 * 60 * 60 * 1000;

/** 이 세션에서 초대 링크가 어디까지 갔는지. 이메일(정규화) 기준. */
export type InviteLinkSessionState = "none" | "shown" | "copied";
export type InviteLinkSession = Readonly<Record<string, InviteLinkSessionState>>;

export type InviteAcceptanceState = "pending" | "expired";
export type InviteDeliveryState = "needs-reissue" | "link-ready" | "link-copied";

export interface InviteTrackingRow {
  readonly invite: TeamWorkspaceInvite;
  /** invites 목록에 있다는 것 자체가 미수락이다. 만료만 별도로 가른다. */
  readonly acceptance: InviteAcceptanceState;
  readonly delivery: InviteDeliveryState;
  /** 만료까지 남은 ms. expiresAt 을 읽을 수 없으면 null(모름을 0으로 꾸미지 않는다). */
  readonly remainingMs: number | null;
  readonly expiringSoon: boolean;
}

export interface InviteTrackingSummary {
  readonly total: number;
  readonly pending: number;
  readonly expired: number;
  readonly expiringSoon: number;
  /** 링크가 손에 없어 재발행부터 해야 하는 초대 수. */
  readonly needsReissue: number;
  readonly linkReady: number;
}

export function inviteLinkSessionKey(email: string): string {
  return email.trim().toLowerCase();
}

const LINK_STATE_RANK: Record<InviteLinkSessionState, number> = { none: 0, shown: 1, copied: 2 };

/** 링크 상태 기록. 뒤로 가지 않는다(copied 를 shown 으로 되돌리지 않는다). */
export function recordInviteLinkState(
  session: InviteLinkSession,
  email: string,
  state: Exclude<InviteLinkSessionState, "none">,
): InviteLinkSession {
  const key = inviteLinkSessionKey(email);
  if (!key) return session;
  const current = session[key] ?? "none";
  if (LINK_STATE_RANK[current] >= LINK_STATE_RANK[state]) return session;
  return { ...session, [key]: state };
}

export function inviteDeliveryState(session: InviteLinkSession, email: string): InviteDeliveryState {
  const state = session[inviteLinkSessionKey(email)] ?? "none";
  if (state === "copied") return "link-copied";
  if (state === "shown") return "link-ready";
  return "needs-reissue";
}

export function buildInviteTracking(
  invites: readonly TeamWorkspaceInvite[],
  nowMs: number,
  session: InviteLinkSession,
): { readonly rows: readonly InviteTrackingRow[]; readonly summary: InviteTrackingSummary } {
  const rows = invites.map((invite): InviteTrackingRow => {
    const expiresMs = Date.parse(invite.expiresAt);
    const remainingMs = Number.isFinite(expiresMs) ? expiresMs - nowMs : null;
    const expired = remainingMs !== null && remainingMs <= 0;
    return {
      invite,
      acceptance: expired ? "expired" : "pending",
      delivery: inviteDeliveryState(session, invite.email),
      remainingMs,
      expiringSoon: !expired && remainingMs !== null && remainingMs <= INVITE_EXPIRING_SOON_MS,
    };
  });
  return {
    rows,
    summary: {
      total: rows.length,
      pending: rows.filter((row) => row.acceptance === "pending").length,
      expired: rows.filter((row) => row.acceptance === "expired").length,
      expiringSoon: rows.filter((row) => row.expiringSoon).length,
      needsReissue: rows.filter((row) => row.delivery === "needs-reissue").length,
      linkReady: rows.filter((row) => row.delivery !== "needs-reissue").length,
    },
  };
}
