import { describe, expect, it } from "vitest";

import {
  capabilityPermissionExplanation,
  permissionBlockNotice,
  projectRolePermissionExplanation,
  workspaceRolePermissionExplanation,
  type PermissionBlockAction,
} from "./role-permission-explain-model";

const WORKSPACE_ROLES = ["owner", "admin", "member", "guest"] as const;
const PROJECT_ROLES = ["owner", "admin", "editor", "commenter", "viewer"] as const;
const BLOCK_ACTIONS: readonly PermissionBlockAction[] = [
  "invite-member",
  "manage-members",
  "team-settings",
  "edit-manuscript",
  "comment-manuscript",
  "publish-work",
  "project-access",
];

describe("워크스페이스 역할 자기설명", () => {
  it("네 역할 모두 라벨·요약·할 수 있는 일을 갖추고 ko/en 문장이 비지 않는다", () => {
    for (const role of WORKSPACE_ROLES) {
      const explanation = workspaceRolePermissionExplanation(role);
      expect(explanation.label.ko.length).toBeGreaterThan(0);
      expect(explanation.label.en.length).toBeGreaterThan(0);
      expect(explanation.summary.ko.length).toBeGreaterThan(0);
      expect(explanation.can.length).toBeGreaterThan(0);
      for (const item of [...explanation.can, ...explanation.cannot]) {
        expect(item.ko.length).toBeGreaterThan(0);
        expect(item.en.length).toBeGreaterThan(0);
      }
    }
  });

  it("서버 강제 사실과 어긋나지 않는다 — 관리자 초대는 소유자 전용, 게스트는 구성원 목록 비공개", () => {
    const admin = workspaceRolePermissionExplanation("admin");
    expect(admin.cannot.some((item) => item.ko.includes("소유자만"))).toBe(true);
    const guest = workspaceRolePermissionExplanation("guest");
    expect(guest.cannot.some((item) => item.ko.includes("구성원 목록"))).toBe(true);
    const member = workspaceRolePermissionExplanation("member");
    // 팀 소속만으로 원고가 열리지 않는다는 정본 사실을 모든 비관리자 역할이 알린다.
    expect(member.cannot.some((item) => item.ko.includes("작품별로 따로"))).toBe(true);
  });
});

describe("작품 역할 자기설명", () => {
  it("다섯 역할 모두 설명을 갖추고, 게시는 소유자에게만 열린다", () => {
    for (const role of PROJECT_ROLES) {
      const explanation = projectRolePermissionExplanation(role);
      expect(explanation.can.length).toBeGreaterThan(0);
      expect(explanation.label.ko.length).toBeGreaterThan(0);
    }
    expect(
      projectRolePermissionExplanation("admin").cannot.some((item) =>
        item.ko.includes("소유자만"),
      ),
    ).toBe(true);
    expect(
      projectRolePermissionExplanation("viewer").cannot.some((item) =>
        item.ko.includes("댓글"),
      ),
    ).toBe(true);
  });
});

describe("서버 판정(capabilities) 문장 변환", () => {
  it("boolean 판정을 그대로 문장으로 옮기고 없는 권한을 있는 것처럼 말하지 않는다", () => {
    const reviewer = capabilityPermissionExplanation({
      view: true,
      comment: true,
      edit: false,
      manageMembers: false,
      respondInvite: true,
    });
    expect(reviewer.can.some((item) => item.ko.includes("댓글"))).toBe(true);
    expect(reviewer.cannot.some((item) => item.ko.includes("고치기"))).toBe(true);
    expect(reviewer.can.some((item) => item.ko.includes("초대"))).toBe(true);

    const manager = capabilityPermissionExplanation({
      view: true,
      comment: true,
      edit: true,
      manageMembers: true,
      respondInvite: false,
    });
    expect(manager.cannot).toHaveLength(0);
    expect(manager.can).toHaveLength(4);
  });
});

describe("권한 차단 안내", () => {
  it("모든 차단 행동에 이유와 요청 방법이 함께 있다", () => {
    for (const action of BLOCK_ACTIONS) {
      const notice = permissionBlockNotice(action);
      expect(notice.title.ko.length).toBeGreaterThan(0);
      expect(notice.reason.ko.length).toBeGreaterThan(0);
      expect(notice.requestGuide.ko.length).toBeGreaterThan(0);
      // 링크가 있으면 라벨도 반드시 있다(빈 링크 금지).
      if (notice.requestHref) expect(notice.requestLinkLabel).not.toBeNull();
    }
  });

  it("팀 관리 차단은 사람·권한 화면으로 요청 경로를 잇는다", () => {
    expect(permissionBlockNotice("invite-member").requestHref).toBe("/team/people");
    expect(permissionBlockNotice("project-access").requestHref).toBe("/team/people");
    // 작품 내부 차단은 지어낸 경로를 만들지 않고 문구로만 안내한다.
    expect(permissionBlockNotice("edit-manuscript").requestHref).toBeNull();
  });
});
