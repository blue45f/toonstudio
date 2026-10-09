// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_FOLLOW_CONFIG } from "../studio-virtual-space-follow";
import { SpaceFollowStatus } from "./SpaceFollowStatus";

afterEach(cleanup);

function handlers() {
  return { onStopFollowing: vi.fn(), onStopLeading: vi.fn(), onConfig: vi.fn() };
}

describe("함께 걷기 상태 칩", () => {
  it("따라가는 사람도 따라오는 사람도 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<SpaceFollowStatus followingName={null} followedByName={null} config={DEFAULT_STUDIO_FOLLOW_CONFIG} {...handlers()} />);
    expect(container.innerHTML).toBe("");
  });

  it("따라가는 중이면 대상 이름 칩과 따라가기 방식(도슨트·벽 통과)을 보이고, 눌러서 끝낸다", () => {
    const actions = handlers();
    render(<SpaceFollowStatus followingName="Bob" followedByName={null} config={DEFAULT_STUDIO_FOLLOW_CONFIG} {...actions} />);
    expect(screen.queryByRole("button", { name: /따라오는 중/u })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Bob 따라가는 중" }));
    expect(actions.onStopFollowing).toHaveBeenCalledOnce();
    expect(actions.onStopLeading).not.toHaveBeenCalled();
    const docent = screen.getByRole("button", { name: "도슨트" });
    const walls = screen.getByRole("button", { name: "벽 통과" });
    expect(docent.getAttribute("aria-pressed")).toBe("false");
    expect(walls.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(docent);
    expect(actions.onConfig).toHaveBeenLastCalledWith({ mode: "docent" });
    fireEvent.click(walls);
    expect(actions.onConfig).toHaveBeenLastCalledWith({ ignoreCollisions: true });
  });

  it("도슨트·벽 통과가 켜져 있으면 다시 누를 때 꺼진다", () => {
    const actions = handlers();
    render(<SpaceFollowStatus followingName="Bob" followedByName={null} config={{ ...DEFAULT_STUDIO_FOLLOW_CONFIG, mode: "docent", ignoreCollisions: true }} {...actions} />);
    expect(screen.getByRole("button", { name: "도슨트" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "벽 통과" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "도슨트" }));
    expect(actions.onConfig).toHaveBeenLastCalledWith({ mode: "standard" });
    fireEvent.click(screen.getByRole("button", { name: "벽 통과" }));
    expect(actions.onConfig).toHaveBeenLastCalledWith({ ignoreCollisions: false });
  });

  it("누가 나를 따라오는 중이면 이름 칩만 보이고(방식 설정은 따라가는 쪽의 것), 눌러서 끝낸다", () => {
    const actions = handlers();
    render(<SpaceFollowStatus followingName={null} followedByName="Cleo" config={DEFAULT_STUDIO_FOLLOW_CONFIG} {...actions} />);
    expect(screen.queryByRole("button", { name: "도슨트" })).toBeNull();
    expect(screen.queryByRole("button", { name: /따라가는 중/u })).toBeNull();
    const chip = screen.getByRole("button", { name: "Cleo 님이 따라오는 중" });
    expect(chip.getAttribute("title")).toBe("누르면 따라오기를 끝내요");
    fireEvent.click(chip);
    expect(actions.onStopLeading).toHaveBeenCalledOnce();
    expect(actions.onStopFollowing).not.toHaveBeenCalled();
  });

  it("따라가면서 동시에 누가 따라올 수 있어 두 칩이 따로 동작한다", () => {
    const actions = handlers();
    render(<SpaceFollowStatus followingName="Bob" followedByName="Cleo" config={DEFAULT_STUDIO_FOLLOW_CONFIG} {...actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Cleo 님이 따라오는 중" }));
    expect(actions.onStopLeading).toHaveBeenCalledOnce();
    expect(actions.onStopFollowing).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bob 따라가는 중" }));
    expect(actions.onStopFollowing).toHaveBeenCalledOnce();
  });
});
