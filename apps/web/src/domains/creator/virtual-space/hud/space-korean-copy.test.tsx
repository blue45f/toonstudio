// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { STUDIO_BUILD_CATALOG } from "../studio-virtual-space-build-mode";
import { SpaceRequestToast } from "./SpaceRequestToast";
import { spaceNpcZoneGuide } from "./space-npc-dialogue-content";

afterEach(cleanup);

const noop = () => undefined;

describe("한국어 조사 일치 (받침 있는 낱말 뒤에 고정 조사를 붙이지 않는다)", () => {
  it("요청 토스트: 받침 없는 '초대'는 '가', 받침 있는 '요청'은 '이'로 이어진다", () => {
    const peer = { sessionId: "bob", displayName: "Bob", role: "editor" as const };
    const { rerender } = render(
      <SpaceRequestToast
        requests={[{ id: "r1", peer, action: "review", direction: "incoming", status: "offered", createdAt: Date.now(), expiresAt: Date.now() + 60_000 }]}
        ignoreFollowRequests={false}
        acceptDisabledReason={null}
        onRespond={noop}
        onOpenPeople={noop}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("함께 검토 초대가 왔어요");
    rerender(
      <SpaceRequestToast
        requests={[{ id: "r2", peer, action: "talk", direction: "incoming", status: "offered", createdAt: Date.now(), expiresAt: Date.now() + 60_000 }]}
        ignoreFollowRequests={false}
        acceptDisabledReason={null}
        onRespond={noop}
        onOpenPeople={noop}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("대화 요청이 왔어요");
  });

  it("구역 안내 기본 문구: 방 이름 받침에 따라 '이에요/예요'를 고른다", () => {
    const guide = (roomLabelKo: string) => spaceNpcZoneGuide({ roomId: null, roomLabelKo, roomLabelEn: "Room", interactions: [] }).ko;
    expect(guide("작화 오픈 데스크")).toContain("여기는 작화 오픈 데스크예요.");
    expect(guide("로비·리셉션")).toContain("여기는 로비·리셉션이에요.");
    expect(guide("PD 리뷰룸")).toContain("여기는 PD 리뷰룸이에요.");
  });

  it("조명 설치 안내: 받침에 맞는 '을/를'을 쓴다", () => {
    const description = (id: string) => STUDIO_BUILD_CATALOG.find((entry) => entry.id === id)?.descriptionKo;
    expect(description("light:ceiling-light")).toBe("천장등을 설치해요.");
    expect(description("light:neon-sign")).toBe("네온사인을 설치해요.");
    expect(description("light:spotlight")).toBe("스포트라이트를 설치해요.");
    expect(description("light:desk-lamp")).toBe("책상 스탠드를 설치해요.");
  });
});
