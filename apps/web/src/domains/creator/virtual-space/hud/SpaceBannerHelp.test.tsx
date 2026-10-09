// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_SPACE_EMOTES } from "../studio-virtual-space-emote-catalog";
import { StudioEmoteKeymapStore } from "../studio-virtual-space-emote-keymap";
import { studioTownEvents } from "../studio-virtual-space-town-program";
import { SpaceShortcutsHelp } from "./SpaceShortcutsHelp";
import { SpaceTownBanner } from "./SpaceTownBanner";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("SpaceTownBanner", () => {
  const active = () => {
    const event = studioTownEvents(Date.UTC(2026, 8, 25, 0))[0];
    if (!event) throw new Error("정기 프로그램 예시가 필요합니다.");
    vi.spyOn(Date, "now").mockReturnValue(event.startsAt + 1);
    return event;
  };

  it("프로젝트 공간에서 진행 중인 정기 프로그램을 '예시'로 표시하고 보기 버튼으로 제작 공간을 연다", () => {
    const event = active();
    const onViewTown = vi.fn();
    render(<SpaceTownBanner personal={false} spotlightActive={false} onStopSpotlight={vi.fn()} onViewTown={onViewTown} />);
    expect(screen.getByText(event.labelKo)).toBeTruthy();
    expect(screen.getByText("정기 프로그램(예시)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /프로그램 보기/ }));
    expect(onViewTown).toHaveBeenCalledOnce();
  });

  it("개인 공간에는 예시 일정을 띄우지 않고, 발표 중이면 종료 버튼을 보여 준다", () => {
    active();
    const onStop = vi.fn();
    const view = render(<SpaceTownBanner personal spotlightActive={false} onStopSpotlight={onStop} onViewTown={vi.fn()} />);
    expect(view.container.firstChild).toBeNull();
    view.rerender(<SpaceTownBanner personal spotlightActive onStopSpotlight={onStop} onViewTown={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "종료" }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});

describe("SpaceShortcutsHelp", () => {
  it("조작법과 단축키가 있는 리액션을 보여 주고 첫 방문 안내를 다시 열 수 있다", () => {
    const onClose = vi.fn();
    const onReplayTour = vi.fn();
    render(<SpaceShortcutsHelp open sheet={false} onClose={onClose} onReplayTour={onReplayTour} />);
    const help = screen.getByRole("dialog", { name: "단축키와 조작법" });
    expect(within(help).getByText("가까운 대상과 상호작용")).toBeTruthy();
    const emotes = within(help).getByRole("group", { name: "리액션 단축키" });
    expect(emotes.querySelectorAll("kbd")).toHaveLength(STUDIO_SPACE_EMOTES.filter((emote) => emote.shortcut).length);
    fireEvent.click(within(help).getByRole("button", { name: "미니 투어 다시 보기" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onReplayTour).toHaveBeenCalledOnce();
  });

  it("사용자가 바꾼 리액션 키를 칸 순서대로 보여 주고, 키가 없는 리액션은 싣지 않는다", () => {
    const keymap = new StudioEmoteKeymapStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    keymap.assign("coffee", "3");
    keymap.assign("wave", null);
    render(<SpaceShortcutsHelp open sheet={false} onClose={vi.fn()} onReplayTour={vi.fn()} emoteKeymap={keymap} />);
    const emotes = within(screen.getByRole("dialog", { name: "단축키와 조작법" })).getByRole("group", { name: "리액션 단축키" });
    const rows = Array.from(emotes.children).map((row) => row.textContent);
    expect(rows).toEqual(["2❤️하트", "3☕커피 타임", "4👍좋아요", "5😂웃음", "6👏박수", "7😮놀람", "8🤔생각 중", "9💡아이디어", "Z💃춤추기"]);
  });

  it("닫혀 있으면 아무것도 그리지 않는다", () => {
    const view = render(<SpaceShortcutsHelp open={false} sheet={false} onClose={vi.fn()} onReplayTour={vi.fn()} />);
    expect(view.container.firstChild).toBeNull();
  });
});
