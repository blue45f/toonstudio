// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
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
    expect(rows).toEqual(["2❤️하트", "3☕커피 타임", "4👍좋아요", "5😂웃음", "6👏박수", "7😮놀람", "8🤔생각 중", "9💡아이디어", "Z💃춤추기", "F🎆폭죽"]);
  });

  it("시점 조작을 마우스·키보드·되돌리기 순서로 알려 주고, 영어에서는 키 이름도 영어로 쓴다", () => {
    render(<SpaceShortcutsHelp open sheet={false} onClose={vi.fn()} onReplayTour={vi.fn()} />);
    const help = screen.getByRole("dialog", { name: "단축키와 조작법" });
    expect(within(help).getByText("시점을 끌어서 둘러보기 (터치는 두 손가락)")).toBeTruthy();
    const keyboardRow = within(help).getByText("누르는 동안 시점을 그쪽으로 옮기기 (아바타는 걷지 않아요)").closest("div");
    expect(keyboardRow?.querySelector("kbd")?.textContent).toBe("Space+방향키");
    expect(within(help).getByText("끌어서 옮겨 둔 시점을 내 위치로 되돌리기")).toBeTruthy();
    cleanup();
    useI18n.getState().setLang("en");
    try {
      render(<SpaceShortcutsHelp open sheet={false} onClose={vi.fn()} onReplayTour={vi.fn()} />);
      const english = screen.getByRole("dialog");
      const row = within(english).getByText("Hold to look that way (your avatar stays put)").closest("div");
      expect(row?.querySelector("kbd")?.textContent).toBe("Space+arrows");
      const drag = within(english).getByText("Drag to look around (two fingers on touch)").closest("div");
      expect(Array.from(drag?.querySelectorAll("kbd") ?? []).map((key) => key.textContent)).toEqual(["Right-drag", "Space+drag"]);
    } finally { useI18n.getState().setLang("ko"); }
  });

  it("닫혀 있으면 아무것도 그리지 않는다", () => {
    const view = render(<SpaceShortcutsHelp open={false} sheet={false} onClose={vi.fn()} onReplayTour={vi.fn()} />);
    expect(view.container.firstChild).toBeNull();
  });
});
