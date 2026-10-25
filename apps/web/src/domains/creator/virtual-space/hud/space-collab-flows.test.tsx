// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpaceCoworkSheet, type SpaceCoworkPeer } from "./SpaceCoworkSheet";
import { SpaceProximityStrip } from "./SpaceProximityStrip";
import { SpaceRequestToast } from "./SpaceRequestToast";
import { SpaceStatusMenu } from "./SpaceStatusMenu";
import { SpaceZoneWorkbar } from "./SpaceZoneWorkbar";
import { spaceAutoMeetingDecision } from "./use-space-auto-meeting";
import { spaceZoneWorkItems, spaceZoneWorkKind } from "./space-zone-workflow";

afterEach(cleanup);

describe("협업 구역 동선", () => {
  it("회의실·작업실·공동 작업실·갤러리를 구역 id나 방 동작으로 알아본다", () => {
    expect(spaceZoneWorkKind("team-meeting")).toBe("meeting");
    expect(spaceZoneWorkKind("personal-atelier")).toBe("atelier");
    expect(spaceZoneWorkKind("story-lab")).toBe("story");
    expect(spaceZoneWorkKind("review-gallery")).toBe("review");
    expect(spaceZoneWorkKind("some-room", "live")).toBe("meeting");
    expect(spaceZoneWorkKind("creator-cafe")).toBeNull();
    expect(spaceZoneWorkKind(null)).toBeNull();
  });

  it("회의실은 회차 보드·원고 검토·피드백·화면 공유로, 제작 프로젝트가 있으면 production-hub 경로로 잇는다", () => {
    const linked = spaceZoneWorkItems("meeting", { projectId: "work 1", productionProjectId: "prod-9", personal: false });
    expect(linked.map((item) => item.id)).toEqual(["board", "review", "feedback", "share"]);
    expect(linked[0]).toMatchObject({ kind: "href", href: "/production/projects/prod-9/episodes" });
    expect(linked[1]).toMatchObject({ kind: "href", href: "/production/projects/prod-9/review" });
    expect(linked[2]).toMatchObject({ kind: "panel", panel: "work" });
    const fallback = spaceZoneWorkItems("meeting", { projectId: "work 1", productionProjectId: null, personal: false });
    expect(fallback[0]).toMatchObject({ href: "/studio/p/work%201/production" });
    expect(fallback[1]).toMatchObject({ href: "/studio/p/work%201/review?view=inbox" });
  });

  it("작업실은 내 원고·회차 보드·같이 작업하기, 개인 공간은 팀 동선 없이 내 원고만 둔다", () => {
    expect(spaceZoneWorkItems("atelier", { projectId: "w", productionProjectId: null, personal: false }).map((item) => item.id))
      .toEqual(["manuscript", "board", "cowork"]);
    expect(spaceZoneWorkItems("meeting", { projectId: "w", productionProjectId: null, personal: true }).map((item) => item.id)).toEqual(["manuscript"]);
  });

  it("바로 가기 줄은 링크는 링크로, 패널·같이 작업하기·화면 공유는 HUD 동작으로 연다", () => {
    const onPanel = vi.fn(); const onCowork = vi.fn(); const onShare = vi.fn();
    const items = spaceZoneWorkItems("meeting", { projectId: "w", productionProjectId: null, personal: false });
    render(<MemoryRouter><SpaceZoneWorkbar kind="meeting" items={items} onPanel={onPanel} onCowork={onCowork} onShare={onShare} /></MemoryRouter>);
    const bar = screen.getByRole("navigation", { name: "회의실에서 바로" });
    expect(within(bar).getByRole("link", { name: "회차 보드" }).getAttribute("href")).toBe("/studio/p/w/production");
    fireEvent.click(within(bar).getByRole("button", { name: "피드백·검수함" }));
    fireEvent.click(within(bar).getByRole("button", { name: "화면 공유" }));
    expect(onPanel).toHaveBeenCalledExactlyOnceWith("work");
    expect(onShare).toHaveBeenCalledOnce();
    expect(onCowork).not.toHaveBeenCalled();
  });
});

describe("회의 구역 자동 '회의 중'", () => {
  const base = { userStatus: null, activity: "available" as const, enabled: true };
  it("대화 가능 상태로 프라이빗 구역에 들어가면 회의 중, 자동으로 바꾼 상태만 나올 때 되돌린다", () => {
    expect(spaceAutoMeetingDecision(false, { ...base, inPrivateZone: true }, false)).toBe("set-meeting");
    expect(spaceAutoMeetingDecision(true, { ...base, inPrivateZone: false, userStatus: "in-meeting" }, true)).toBe("clear-meeting");
    expect(spaceAutoMeetingDecision(true, { ...base, inPrivateZone: false, userStatus: "in-meeting" }, false)).toBeNull();
  });
  it("직접 고른 상태·집중 중·꺼짐이면 건드리지 않는다", () => {
    expect(spaceAutoMeetingDecision(false, { ...base, inPrivateZone: true, userStatus: "break" }, false)).toBeNull();
    expect(spaceAutoMeetingDecision(false, { ...base, inPrivateZone: true, activity: "focused" }, false)).toBeNull();
    expect(spaceAutoMeetingDecision(false, { ...base, inPrivateZone: true, enabled: false }, false)).toBeNull();
    expect(spaceAutoMeetingDecision(true, { ...base, inPrivateZone: false, userStatus: "break" }, true)).toBeNull();
  });
});

describe("같이 작업하기 요청 흐름", () => {
  const peers: readonly SpaceCoworkPeer[] = [
    { id: "bob", name: "Bob", activity: "available", avatarIndex: 0, near: true },
    { id: "cleo", name: "Cleo", activity: "available", userStatus: "in-meeting", avatarIndex: 1, near: false },
  ];
  const handlers = () => ({ onSelectTarget: vi.fn(), onRequest: vi.fn(), onApproach: vi.fn(), onOpenTeam: vi.fn() });

  it("팀원이 없으면 초대로 안내하고 NPC는 팀원으로 세지 않는다", () => {
    const actions = handlers();
    render(<SpaceCoworkSheet peers={[]} targetId={null} disabledReason={null} links={[]} {...actions} />);
    expect(screen.getByText(/NPC는 팀원 수에 들어가지 않아요/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "팀·초대 열기" }));
    expect(actions.onOpenTeam).toHaveBeenCalledOnce();
  });

  it("근처 팀원을 기본으로 고르고, 고른 요청을 기존 동의 흐름으로 보낸다", () => {
    const actions = handlers();
    render(<MemoryRouter><SpaceCoworkSheet peers={peers} targetId={null} disabledReason={null}
      links={[{ id: "board", href: "/studio/p/w/production", labelKo: "회차 보드", labelEn: "Episode board" }]} {...actions} /></MemoryRouter>);
    expect(screen.getByRole("radio", { name: /Bob/u }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /대화하며 같이 작업/u }));
    expect(actions.onRequest).toHaveBeenCalledExactlyOnceWith("bob", "talk");
    expect(screen.getByRole("link", { name: "회차 보드" })).toBeTruthy();
  });

  it("먼 팀원은 대화·이동 요청 대신 다가가기를 먼저 안내하고 검토 초대는 보낼 수 있다", () => {
    const actions = handlers();
    render(<SpaceCoworkSheet peers={peers} targetId="cleo" disabledReason={null} links={[]} {...actions} />);
    expect(screen.getByRole("status").textContent).toContain("조금 떨어져 있어요");
    const talk = screen.getByRole("button", { name: /대화하며 같이 작업/u });
    expect(talk.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(talk);
    expect(actions.onRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /같은 원고 함께 검토/u }));
    expect(actions.onRequest).toHaveBeenCalledExactlyOnceWith("cleo", "review");
    fireEvent.click(screen.getByRole("button", { name: "다가가기" }));
    expect(actions.onApproach).toHaveBeenCalledExactlyOnceWith("cleo");
    expect(screen.getByRole("radio", { name: /Cleo/u }).textContent).toContain("회의 중");
  });

  it("요청을 보낼 수 없는 이유가 있으면 모든 요청을 막고 이유를 보여 준다", () => {
    const actions = handlers();
    render(<SpaceCoworkSheet peers={peers} targetId="bob" disabledReason="팀원 연결을 확인하는 중이에요" links={[]} {...actions} />);
    for (const name of [/대화하며 같이 작업/u, /같은 원고 함께 검토/u, /같이 이동하기/u, /따라오게 하기/u]) {
      const button = screen.getByRole("button", { name });
      expect(button.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(button);
    }
    expect(actions.onRequest).not.toHaveBeenCalled();
  });

  it("따라오게 하기는 근처 팀원에게 lead 요청으로 보내고, 먼 팀원에게는 다가가기를 먼저 안내한다", () => {
    const near = handlers();
    const { unmount } = render(<SpaceCoworkSheet peers={peers} targetId="bob" disabledReason={null} links={[]} {...near} />);
    fireEvent.click(screen.getByRole("button", { name: /따라오게 하기/u }));
    expect(near.onRequest).toHaveBeenCalledExactlyOnceWith("bob", "lead");
    unmount();
    const far = handlers();
    render(<SpaceCoworkSheet peers={peers} targetId="cleo" disabledReason={null} links={[]} {...far} />);
    const lead = screen.getByRole("button", { name: /따라오게 하기/u });
    expect(lead.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(lead);
    expect(far.onRequest).not.toHaveBeenCalled();
  });

  it("근처 스트립에서 1:1 귓속말 버튼을 누르면 귓속말을 켜고 끌 수 있다", () => {
    const onWhisper = vi.fn();
    render(
      <SpaceProximityStrip
        people={[{ id: "bob", name: "Bob", activity: "available", avatarIndex: 0, inConversation: false }]}
        npcs={[]}
        artStyle="webtoon"
        socialDisabled={null}
        followingPeerId={null}
        whisperPeerId="bob"
        onWave={vi.fn()}
        onTalk={vi.fn()}
        onFollow={vi.fn()}
        onWhisper={onWhisper}
        onNpcTalk={vi.fn()}
      />,
    );
    expect(screen.getByText("1:1 귓속말 중")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Bob에게 1:1 귓속말" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(onWhisper).toHaveBeenCalledExactlyOnceWith("bob");
  });

  it("손 흔들기 인사를 받으면 토스트에서 바로 인사 돌려주기·다가가기를 실행할 수 있다", () => {
    const onWaveBack = vi.fn();
    const onApproach = vi.fn();
    render(
      <SpaceRequestToast
        requests={[]}
        greetings={[
          {
            id: "greet-1",
            peer: { sessionId: "bob", displayName: "Bob", role: "editor" },
            direction: "incoming",
            status: "received",
            createdAt: Date.now(),
          },
        ]}
        acceptDisabledReason={null}
        onRespond={vi.fn()}
        onOpenPeople={vi.fn()}
        onWaveBack={onWaveBack}
        onApproach={onApproach}
      />,
    );
    expect(screen.getByText(/님이 손을 흔들었어요/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bob님에게 인사 돌려주기" }));
    expect(onWaveBack).toHaveBeenCalledExactlyOnceWith("bob");
  });

  it("대화 가능 이외의 상태에서는 자동 해제 시간(바꿀 때까지·30분·1시간)을 고를 수 있다", () => {
    const onStatusExpiry = vi.fn();
    render(
      <SpaceStatusMenu
        status="focused"
        onStatus={vi.fn()}
        onEditCharacter={vi.fn()}
        statusExpiryMinutes={null}
        onStatusExpiry={onStatusExpiry}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "상태 자동 해제" });
    fireEvent.click(within(group).getByRole("radio", { name: "30분 뒤 해제" }));
    expect(onStatusExpiry).toHaveBeenCalledExactlyOnceWith(30);
  });

  it("상태 메뉴에서 oVice 긴급도 배지·WorkAdventure 동행 펫·근접 버블 효과음·따라가기 거절을 설정할 수 있다", () => {
    const onStatusUrgency = vi.fn();
    const onCompanionChange = vi.fn();
    const onProximityPreferences = vi.fn();
    render(
      <SpaceStatusMenu
        status="available"
        onStatus={vi.fn()}
        onEditCharacter={vi.fn()}
        onStatusUrgency={onStatusUrgency}
        onCompanionChange={onCompanionChange}
        onProximityPreferences={onProximityPreferences}
      />,
    );
    const urgencyGroup = screen.getByRole("radiogroup", { name: "상태 긴급도" });
    fireEvent.click(within(urgencyGroup).getByRole("radio", { name: /긴급 · 마감/u }));
    expect(onStatusUrgency).toHaveBeenCalledExactlyOnceWith("urgent");

    const companionGroup = screen.getByRole("radiogroup", { name: "동행 펫" });
    fireEvent.click(within(companionGroup).getByRole("radio", { name: /치즈냥/u }));
    expect(onCompanionChange).toHaveBeenCalledExactlyOnceWith("cat");

    const soundGroup = screen.getByRole("radiogroup", { name: "근접 버블 효과음" });
    fireEvent.click(within(soundGroup).getByRole("radio", { name: /물방울/u }));
    expect(onProximityPreferences).toHaveBeenCalledWith(expect.objectContaining({ bubbleSound: "wobble" }));

    fireEvent.click(screen.getByRole("button", { name: "따라가기 요청 자동 거절" }));
    expect(onProximityPreferences).toHaveBeenLastCalledWith(expect.objectContaining({ ignoreFollowRequests: true }));
  });

  it("따라가기 요청 자동 거절(ignoreFollowRequests)이 켜지면 follow·lead 토스트는 숨기고 대화 요청만 표시한다", () => {
    render(
      <SpaceRequestToast
        requests={[
          {
            id: "req-follow",
            peer: { sessionId: "bob", displayName: "Bob", role: "editor" },
            action: "follow",
            direction: "incoming",
            status: "offered",
            createdAt: Date.now(),
            expiresAt: Date.now() + 60_000,
          },
          {
            id: "req-talk",
            peer: { sessionId: "cleo", displayName: "Cleo", role: "editor" },
            action: "talk",
            direction: "incoming",
            status: "offered",
            createdAt: Date.now(),
            expiresAt: Date.now() + 60_000,
          },
        ]}
        ignoreFollowRequests
        acceptDisabledReason={null}
        onRespond={vi.fn()}
        onOpenPeople={vi.fn()}
      />,
    );
    expect(screen.queryByText("Bob")).toBeNull();
    expect(screen.getByText("Cleo")).toBeTruthy();
  });
});
