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
});
