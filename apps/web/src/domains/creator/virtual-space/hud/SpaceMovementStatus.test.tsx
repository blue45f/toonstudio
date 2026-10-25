// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCameraPanStore } from "../studio-virtual-space-camera-pan";
import { DEFAULT_STUDIO_FOLLOW_CONFIG } from "../studio-virtual-space-follow";
import { SpaceMovementStatus } from "./SpaceMovementStatus";

afterEach(cleanup);

const BOB = { sessionId: "bob", displayName: "Bob", role: "editor" } as const;

function setup(sharedActivity: Parameters<typeof SpaceMovementStatus>[0]["sharedActivity"], followingName: string | null = null) {
  const cameraPan = new StudioCameraPanStore();
  const handlers = { onStopFollowing: vi.fn(), onStopLeading: vi.fn(), onConfig: vi.fn(), onRecentered: vi.fn() };
  render(<SpaceMovementStatus followingName={followingName} sharedActivity={sharedActivity} config={DEFAULT_STUDIO_FOLLOW_CONFIG} cameraPan={cameraPan} {...handlers} />);
  return { cameraPan, ...handlers };
}

describe("이동·시점 상태 칩 묶음", () => {
  it("함께하기도 따라가기도 시점 이동도 없으면 아무것도 그리지 않는다", () => {
    setup(null);
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it.each([
    ["follow", "incoming", true],
    ["lead", "outgoing", true],
    ["follow", "outgoing", false],
    ["lead", "incoming", false],
    ["talk", "incoming", false],
    ["review", "outgoing", false],
  ] as const)("%s(%s) 합의에서 '따라오는 중' 칩: %s", (action, direction, shown) => {
    setup({ action, direction, peer: BOB });
    expect(screen.queryByRole("button", { name: "Bob 님이 따라오는 중" }) !== null).toBe(shown);
  });

  it("내가 따라가는 중이면 따라가기 칩이, 시점을 옮기면 시점 칩이 나타나 각자 자기 일만 한다", () => {
    const { cameraPan, onStopFollowing, onStopLeading, onRecentered } = setup({ action: "follow", direction: "outgoing", peer: BOB }, "Bob");
    fireEvent.click(screen.getByRole("button", { name: "Bob 따라가는 중" }));
    expect(onStopFollowing).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /시점을 옮겼어요/u })).toBeNull();
    act(() => { cameraPan.setPanned(true); });
    fireEvent.click(screen.getByRole("button", { name: /시점을 옮겼어요/u }), { detail: 1 });
    expect(cameraPan.consumeRecenter()).toBe(true);
    expect(onRecentered).toHaveBeenCalledOnce();
    expect(onStopLeading).not.toHaveBeenCalled();
  });

  it("수락된 함께 걷기 요청이 여러 개면 모든 추종자를 묶어 보여 준다", () => {
    const cameraPan = new StudioCameraPanStore();
    const CLEO = { sessionId: "cleo", displayName: "Cleo", role: "editor" } as const;
    render(
      <SpaceMovementStatus
        followingName={null}
        sharedActivity={{ action: "follow", direction: "incoming", peer: BOB }}
        socialRequests={[
          { action: "follow", direction: "incoming", peer: BOB, status: "accepted" },
          { action: "lead", direction: "outgoing", peer: CLEO, status: "accepted" },
        ]}
        config={DEFAULT_STUDIO_FOLLOW_CONFIG}
        cameraPan={cameraPan}
        onStopFollowing={vi.fn()}
        onStopLeading={vi.fn()}
        onConfig={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Bob 님 외 1명이 따라오는 중" })).toBeTruthy();
  });

  it("1:1 귓속말과 조용히 모드가 켜지면 하단 상태 칩을 보여 주고 끝내기·기본으로 되돌릴 수 있다", () => {
    const cameraPan = new StudioCameraPanStore();
    const onStopWhisper = vi.fn();
    const onResetProximityRange = vi.fn();
    render(
      <SpaceMovementStatus
        followingName={null}
        sharedActivity={null}
        config={DEFAULT_STUDIO_FOLLOW_CONFIG}
        cameraPan={cameraPan}
        whisperPeerName="Bob"
        proximityRange="quiet"
        onStopFollowing={vi.fn()}
        onStopLeading={vi.fn()}
        onStopWhisper={onStopWhisper}
        onResetProximityRange={onResetProximityRange}
        onConfig={vi.fn()}
      />,
    );
    expect(screen.getByText(/1:1 귓속말 중 · Bob 님만 들려요/u)).toBeTruthy();
    expect(screen.getByText(/조용히 모드 · 바로 옆 사람만 들려요/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "끝내기" }));
    fireEvent.click(screen.getByRole("button", { name: "기본으로" }));
    expect(onStopWhisper).toHaveBeenCalledOnce();
    expect(onResetProximityRange).toHaveBeenCalledOnce();
  });
});
