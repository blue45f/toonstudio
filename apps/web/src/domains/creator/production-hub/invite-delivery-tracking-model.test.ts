import { describe, expect, it } from "vitest";
import type { TeamWorkspaceInvite } from "@toonstudio/contracts/production-workspace";

import {
  buildInviteTracking,
  inviteLinkSessionKey,
  recordInviteLinkState,
  type InviteLinkSession,
} from "./invite-delivery-tracking-model";

const NOW = Date.parse("2026-10-14T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function invite(email: string, expiresAt: string, id = email): TeamWorkspaceInvite {
  return { id, email, role: "member", expiresAt };
}

describe("초대 전달·수락 추적 모델", () => {
  it("목록에 있는 초대는 전부 미수락이고, 만료 지난 것만 expired 로 가른다", () => {
    const { rows, summary } = buildInviteTracking([
      invite("a@example.com", new Date(NOW + 3 * DAY).toISOString()),
      invite("b@example.com", new Date(NOW - DAY).toISOString()),
    ], NOW, {});
    expect(rows.map((row) => row.acceptance)).toEqual(["pending", "expired"]);
    expect(summary).toMatchObject({ total: 2, pending: 1, expired: 1 });
  });

  it("만료 24시간 이내면 expiringSoon, 그 밖은 아니다", () => {
    const { rows, summary } = buildInviteTracking([
      invite("soon@example.com", new Date(NOW + 12 * 60 * 60 * 1000).toISOString()),
      invite("later@example.com", new Date(NOW + 2 * DAY).toISOString()),
    ], NOW, {});
    expect(rows[0]!.expiringSoon).toBe(true);
    expect(rows[1]!.expiringSoon).toBe(false);
    expect(summary.expiringSoon).toBe(1);
  });

  it("링크 기록이 없는 초대는 needs-reissue, 표시·복사한 초대는 link-ready/link-copied 다", () => {
    let session: InviteLinkSession = {};
    session = recordInviteLinkState(session, "shown@example.com", "shown");
    session = recordInviteLinkState(session, "copied@example.com", "copied");
    const future = new Date(NOW + DAY).toISOString();
    const { rows, summary } = buildInviteTracking([
      invite("none@example.com", future),
      invite("shown@example.com", future),
      invite("copied@example.com", future),
    ], NOW, session);
    expect(rows.map((row) => row.delivery)).toEqual(["needs-reissue", "link-ready", "link-copied"]);
    expect(summary.needsReissue).toBe(1);
    expect(summary.linkReady).toBe(2);
  });

  it("링크 상태는 뒤로 가지 않고, 이메일 키는 대소문자와 공백을 정규화한다", () => {
    let session: InviteLinkSession = {};
    session = recordInviteLinkState(session, "  User@Example.com ", "copied");
    session = recordInviteLinkState(session, "user@example.com", "shown");
    expect(session[inviteLinkSessionKey("USER@example.com")]).toBe("copied");
    expect(recordInviteLinkState(session, "   ", "shown")).toBe(session);
  });

  it("만료 시각을 읽을 수 없으면 remainingMs 를 null 로 두고 만료로 단정하지 않는다", () => {
    const { rows } = buildInviteTracking([invite("x@example.com", "not-a-date")], NOW, {});
    expect(rows[0]!.remainingMs).toBeNull();
    expect(rows[0]!.acceptance).toBe("pending");
    expect(rows[0]!.expiringSoon).toBe(false);
  });
});
