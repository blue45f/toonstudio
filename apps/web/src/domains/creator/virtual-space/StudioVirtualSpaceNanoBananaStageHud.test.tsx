// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  StudioVirtualSpaceNanoBananaLobbyShowcase,
  StudioVirtualSpaceNanoBananaStageHud,
} from "./StudioVirtualSpaceNanoBananaStageHud";

afterEach(cleanup);

describe("StudioVirtualSpaceNanoBananaLobbyShowcase & StageHud", () => {
  it("입장 로비 쇼케이스에서 12대 테마, 8인 캐스트, 4방향 보행(v14), 4종 특화 룸(v14)을 전환하고 로컬스토리지에 저장한다", () => {
    render(<StudioVirtualSpaceNanoBananaLobbyShowcase />);

    expect(screen.getByTestId("lobby-nano-banana-showcase")).toBeTruthy();
    expect(
      screen.getByTestId("lobby-nano-banana-theme-hero-img").getAttribute("src"),
    ).toContain("/assets/virtual-studio/nano-banana-v11/themes/seoul-editorial-hq.webp");

    // 12대 테마 중 v13 아스트랄 도서관 테마 선택
    fireEvent.click(
      screen.getByTestId("lobby-theme-magic-academy-astral-library-btn"),
    );
    expect(
      screen.getByTestId("lobby-nano-banana-theme-hero-img").getAttribute("src"),
    ).toContain(
      "/assets/virtual-studio/nano-banana-v13/themes/magic-academy-astral-library.webp",
    );

    // 8인 크리에이터 중 사운드·식자 아티스트 선택
    fireEvent.click(screen.getByTestId("lobby-persona-sound-letterer-btn"));
    expect(
      screen.getByTestId("lobby-nano-banana-cast-img").getAttribute("src"),
    ).toContain("/assets/virtual-studio/nano-banana-v12/cast/sound-letterer-work.webp");

    // v14 4방향 보행 중 UP(후면) 선택
    fireEvent.click(screen.getByTestId("lobby-walk-dir-up-btn"));
    expect(
      screen.getByTestId("lobby-nano-banana-walk-img").getAttribute("src"),
    ).toBe("/assets/virtual-studio/nano-banana-v14/walk/creator-walk-up.webp");

    // v14 4종 룸 모듈 중 글로벌 IP 피칭 보드룸 선택
    fireEvent.click(
      screen.getByTestId("lobby-room-global-ip-pitch-boardroom-btn"),
    );
    expect(
      screen.getByTestId("lobby-nano-banana-room-img").getAttribute("src"),
    ).toBe(
      "/assets/virtual-studio/nano-banana-v14/rooms/global-ip-pitch-boardroom.webp",
    );
  });

  it("메인 스테이지 HUD에서 테마·보행 방향을 순환하고 원클릭으로 나노바나나 2.5D 스튜디오 & 실무 워크벤치 오버레이를 연다", () => {
    render(<StudioVirtualSpaceNanoBananaStageHud />);

    expect(screen.getByTestId("main-stage-nano-banana-hud")).toBeTruthy();

    fireEvent.click(screen.getByTestId("main-stage-cycle-theme-btn"));
    fireEvent.click(screen.getByTestId("main-stage-cycle-walk-btn"));

    fireEvent.click(
      screen.getByTestId("main-stage-open-nano-banana-workbench-btn"),
    );
    expect(
      screen.getByTestId("main-stage-nano-banana-workbench-drawer"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("virtual-office-nextgen-engine-panel"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("studio-virtual-office-spatial-canvas-hud"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByTestId("main-stage-close-nano-banana-workbench-btn"),
    );
    expect(
      screen.queryByTestId("main-stage-nano-banana-workbench-drawer"),
    ).toBeNull();
  });
});
