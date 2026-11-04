// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import { StudioOffice2dPipelineRail } from "./StudioOffice2dPipelineRail";
import { toonHqPipelineRooms } from "./hq/toon-hq-blueprint";

afterEach(cleanup);

function renderRail(overrides: Partial<Parameters<typeof StudioOffice2dPipelineRail>[0]> = {}) {
  const requestMove = vi.fn();
  const focusWorld = vi.fn();
  const bridge = { requestMove, focusWorld } as unknown as StudioVirtualSpaceEngineBridge;
  render(<StudioOffice2dPipelineRail currentRoomId={null} bridge={bridge} {...overrides} />);
  return { requestMove, focusWorld };
}

describe("StudioOffice2dPipelineRail", () => {
  it("공정 일곱 단계의 접근성 이름이 방 이름 받침에 맞는 조사(으로/로)를 쓴다", () => {
    renderRail();
    const expected: Readonly<Record<string, string>> = {
      "1단계 시나리오·콘티 · 콘티·시나리오 룸으로 이동": "hq-story-room",
      "2단계 스케치·선화 · 작화 오픈 데스크로 이동": "hq-ink-bay",
      "3단계 채색 · 채색 랩으로 이동": "hq-color-lab",
      "4단계 배경·3D · 배경·3D 랩으로 이동": "hq-bg3d-lab",
      "5단계 식자 · 식자·편집 데스크로 이동": "hq-lettering-desk",
      "6단계 PD 검수 · PD 리뷰룸으로 이동": "hq-review-room",
      "7단계 연재 업로드 · 연재 데스크로 이동": "hq-publish-desk",
    };
    for (const name of Object.keys(expected)) {
      expect(screen.getByRole("button", { name }), name).toBeTruthy();
    }
    // 방 목록이 바뀌면 이 표도 함께 갱신해야 하므로 개수를 고정한다.
    expect(toonHqPipelineRooms().map((room) => room.id).sort()).toEqual(Object.values(expected).sort());
    // 예전 오타("룸로", "랩로")가 남지 않는다.
    expect(screen.queryByRole("button", { name: /룸로 이동|랩로 이동/u })).toBeNull();
  });

  it("공정 버튼을 누르면 그 방 시작 지점으로 이동을 요청하고 월드에 초점을 돌려준다", () => {
    const { requestMove, focusWorld } = renderRail({ currentRoomId: "hq-ink-bay" });
    fireEvent.click(screen.getByRole("button", { name: "3단계 채색 · 채색 랩으로 이동" }));
    const room = toonHqPipelineRooms().find((candidate) => candidate.id === "hq-color-lab");
    expect(requestMove).toHaveBeenCalledExactlyOnceWith(room?.spawn);
    expect(focusWorld).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "2단계 스케치·선화 · 작화 오픈 데스크로 이동" }).getAttribute("aria-current")).toBe("location");
  });
});
