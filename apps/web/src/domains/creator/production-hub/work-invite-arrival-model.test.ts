import { describe, expect, it } from "vitest";

import type { StudioTeamInvitationSummary } from "../studio-team-client";

import {
  WORK_INVITE_ARRIVAL_PREVIEW_LIMIT,
  workInviteAcceptHref,
  workInviteArrivalModel,
} from "./work-invite-arrival-model";

const INVITATION_ID = "123e4567-e89b-42d3-a456-426614174000";

function invitation(
  overrides: Partial<StudioTeamInvitationSummary> = {},
): StudioTeamInvitationSummary {
  return {
    workId: "work-1",
    workTitle: "달빛 기사단",
    owner: { name: "김작가" },
    role: "editor",
    invitationId: INVITATION_ID,
    invitedAt: "2026-10-10T09:00:00.000Z",
    ...overrides,
  };
}

describe("작품 초대 도착 신호", () => {
  it("초대가 없으면 신호를 만들지 않는다(0건을 배너로 말하지 않음)", () => {
    expect(workInviteArrivalModel([])).toBeNull();
  });

  it("헤드라인은 체크리스트 문구 그대로 '대기 중인 작품 초대 N건'이다", () => {
    const arrival = workInviteArrivalModel([
      invitation(),
      invitation({ workId: "work-2", workTitle: "두 번째 작품" }),
    ]);
    expect(arrival).not.toBeNull();
    expect(arrival!.count).toBe(2);
    expect(arrival!.headline.ko).toBe("대기 중인 작품 초대 2건");
    expect(arrival!.headline.en).toBe("2 work invitations waiting");
    expect(arrival!.moreCount).toBe(0);
    expect(arrival!.moreLabel).toBeNull();
  });

  it("수락 지점은 작품 팀·권한 표면 주소와 바이트 단위로 같다", () => {
    expect(workInviteAcceptHref("work-1")).toBe(
      "/studio/p/work-1/settings?view=team",
    );
    // 식별자는 인코딩해 경로를 깨지 않는다.
    expect(workInviteAcceptHref("work /1")).toBe(
      "/studio/p/work%20%2F1/settings?view=team",
    );
    const arrival = workInviteArrivalModel([invitation()]);
    expect(arrival!.items[0]!.acceptHref).toBe(
      "/studio/p/work-1/settings?view=team",
    );
  });

  it("최신 초대가 먼저 오고, 역할 이름표는 패널 표기와 같다", () => {
    const arrival = workInviteArrivalModel([
      invitation({
        workId: "old",
        workTitle: "오래된 초대",
        role: "viewer",
        invitedAt: "2026-10-01T09:00:00.000Z",
      }),
      invitation({
        workId: "new",
        workTitle: "최근 초대",
        role: "commenter",
        invitedAt: "2026-10-12T09:00:00.000Z",
      }),
    ]);
    expect(arrival!.items.map((item) => item.workId)).toEqual(["new", "old"]);
    expect(arrival!.items[0]!.roleLabel.ko).toBe("검토자");
    expect(arrival!.items[1]!.roleLabel.ko).toBe("열람자");
    expect(arrival!.items[0]!.ownerName).toBe("김작가");
  });

  it("미리보기는 최대 개수로 자르고 나머지는 moreCount로 정직하게 알린다", () => {
    const many = Array.from(
      { length: WORK_INVITE_ARRIVAL_PREVIEW_LIMIT + 2 },
      (_, index) =>
        invitation({
          workId: `work-${index}`,
          workTitle: `작품 ${index}`,
          invitedAt: `2026-10-${String(10 + index).padStart(2, "0")}T09:00:00.000Z`,
        }),
    );
    const arrival = workInviteArrivalModel(many);
    expect(arrival!.count).toBe(WORK_INVITE_ARRIVAL_PREVIEW_LIMIT + 2);
    expect(arrival!.items).toHaveLength(WORK_INVITE_ARRIVAL_PREVIEW_LIMIT);
    expect(arrival!.moreCount).toBe(2);
    expect(arrival!.moreLabel?.ko).toContain("작품 초대 2건이 더 있어요");
    // 입력 배열을 정렬 때문에 변형하지 않는다.
    expect(many[0]!.workId).toBe("work-0");
  });
});
