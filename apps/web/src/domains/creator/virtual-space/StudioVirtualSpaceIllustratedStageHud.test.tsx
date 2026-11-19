// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  StudioVirtualSpaceIllustratedLobbyShowcase,
  StudioVirtualSpaceIllustratedStageHud,
} from "./StudioVirtualSpaceIllustratedStageHud";
import { readStudioSpaceTheme, writeStudioSpaceTheme } from "./studio-virtual-space-theme";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe("StudioVirtualSpaceIllustratedLobbyShowcase & StageHud", () => {
  it("캐스트·방·보행·감정 변경은 사무실 테마를 보존하고 테마를 직접 고를 때만 공간에 적용한다", () => {
    const events: string[] = [];
    function onTheme(event: Event) {
      events.push((event as CustomEvent<string>).detail);
    }
    writeStudioSpaceTheme("neon-night");
    window.addEventListener("toonspectrum:space-theme-change", onTheme);
    try {
      render(<><StudioVirtualSpaceIllustratedLobbyShowcase /><StudioVirtualSpaceIllustratedStageHud /></>);
      for (const action of [
        "lobby-persona-sound-letterer-btn", "lobby-walk-dir-up-btn",
        "lobby-room-global-ip-pitch-boardroom-btn", "main-stage-cycle-persona-btn",
        "main-stage-cycle-walk-btn", "main-stage-cycle-emote-btn",
      ]) {
        fireEvent.click(screen.getByTestId(action));
        expect(readStudioSpaceTheme()).toBe("neon-night");
      }
      expect(events).toEqual([]);
      fireEvent.click(screen.getByTestId("lobby-theme-seoul-editorial-hq-btn"));
      expect(readStudioSpaceTheme()).toBe("webtoon-atelier");
      expect(events).toEqual(["webtoon-atelier"]);
      fireEvent.click(screen.getByTestId("main-stage-cycle-theme-btn"));
      expect(events).toHaveLength(2);
      expect(readStudioSpaceTheme()).toBe(events[1]);
    } finally {
      window.removeEventListener("toonspectrum:space-theme-change", onTheme);
    }
  });

  it("입장 로비 쇼케이스에서 12대 테마, 8인 캐스트, 4방향 보행(v14), 4종 특화 룸(v14)을 전환하고 로컬스토리지에 저장한다", () => {
    render(<StudioVirtualSpaceIllustratedLobbyShowcase />);

    expect(screen.getByTestId("lobby-illustrated-showcase")).toBeTruthy();
    expect(
      screen.getByTestId("lobby-illustrated-theme-hero-img").getAttribute("src"),
    ).toContain("/assets/virtual-studio/studio-art-v11/themes/seoul-editorial-hq.webp");

    // 12대 테마 중 v13 아스트랄 도서관 테마 선택
    fireEvent.click(
      screen.getByTestId("lobby-theme-magic-academy-astral-library-btn"),
    );
    expect(
      screen.getByTestId("lobby-illustrated-theme-hero-img").getAttribute("src"),
    ).toContain(
      "/assets/virtual-studio/studio-art-v13/themes/magic-academy-astral-library.webp",
    );

    // 8인 크리에이터 중 사운드·식자 아티스트 선택
    fireEvent.click(screen.getByTestId("lobby-persona-sound-letterer-btn"));
    expect(
      screen.getByTestId("lobby-illustrated-cast-img").getAttribute("src"),
    ).toContain("/assets/virtual-studio/studio-art-v12/cast/sound-letterer-work.webp");

    // v14 4방향 보행 중 UP(후면) 선택
    const rearWalk = screen.getByRole("button", { name: "후면 보행 (UP)" });
    fireEvent.click(rearWalk);
    expect(rearWalk.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "정면 보행 (DOWN)" }).getAttribute("aria-pressed")).toBe("false");
    expect(
      screen.getByTestId("lobby-illustrated-walk-img").getAttribute("src"),
    ).toBe("/assets/virtual-studio/studio-art-v14/walk/creator-walk-up.webp");

    // v14 4종 룸 모듈 중 글로벌 IP 피칭 보드룸 선택
    fireEvent.click(
      screen.getByTestId("lobby-room-global-ip-pitch-boardroom-btn"),
    );
    expect(
      screen.getByTestId("lobby-illustrated-room-img").getAttribute("src"),
    ).toBe(
      "/assets/virtual-studio/studio-art-v14/rooms/global-ip-pitch-boardroom.webp",
    );
  });

  it("메인 스테이지 HUD에서 테마·보행 방향을 순환하고 원클릭으로 스마트 AI 2.5D 스튜디오 & 실무 워크벤치 오버레이를 연다", () => {
    const { container } = render(<StudioVirtualSpaceIllustratedStageHud />);

    expect(screen.getByTestId("main-stage-illustrated-hud")).toBeTruthy();
    expect(container.textContent).not.toMatch(/나노\s*바나나|Nano\s*Banana/iu);

    fireEvent.click(screen.getByTestId("main-stage-cycle-theme-btn"));
    fireEvent.click(screen.getByTestId("main-stage-cycle-walk-btn"));

    fireEvent.click(
      screen.getByTestId("main-stage-open-illustrated-workbench-btn"),
    );
    expect(
      screen.getByTestId("main-stage-illustrated-workbench-drawer"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("virtual-office-nextgen-engine-panel"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("studio-virtual-office-spatial-canvas-hud"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByTestId("main-stage-close-illustrated-workbench-btn"),
    );
    expect(
      screen.queryByTestId("main-stage-illustrated-workbench-drawer"),
    ).toBeNull();
  });
});
