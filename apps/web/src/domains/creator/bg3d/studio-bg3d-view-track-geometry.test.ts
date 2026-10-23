import { describe, expect, it } from "vitest";

import { placeStudioBg3dViewTrack } from "./studio-bg3d-view-track-geometry";

import type { StudioBg3dViewRect } from "./studio-bg3d-view-track-geometry";

function rect(left: number, top: number, width: number, height: number): StudioBg3dViewRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

describe("Studio BG3D View 트랙 좌표", () => {
  it("정밀 편집 배치(트랙 top 589 > 캔버스 높이 380)에서도 화면 밖으로 보지 않는다", () => {
    // 3D 정밀 편집: 뷰포트 위에 '컷 버전 · 원본 고정' 패널이 있어 호스트가 창 589px 아래에 있다.
    // Drei 는 viewport 좌표 top(589)을 캔버스 높이(380)와 비교해 이 View 를 화면 밖으로 보고 그리기를 멈췄다.
    const canvas = rect(316, 590, 677.109375, 380);
    const track = rect(315, 589, 679.109375, 382);
    expect(track.top).toBeGreaterThan(canvas.height);
    expect(placeStudioBg3dViewTrack(canvas, track)).toEqual({
      left: -1, bottom: -1, width: 679.109375, height: 382, isOffscreen: false,
    });
  });

  it("트랙 left 가 캔버스 너비보다 커도(오른쪽 열 배치) 화면 밖으로 보지 않는다", () => {
    const canvas = rect(900, 120, 300, 300);
    const track = rect(900, 120, 300, 300);
    expect(track.left).toBeGreaterThan(canvas.width);
    expect(placeStudioBg3dViewTrack(canvas, track)).toMatchObject({ left: 0, bottom: 0, isOffscreen: false });
  });

  it("캔버스가 창 어디에 있든 같은 칸은 같은 캔버스 상대 좌표를 낸다", () => {
    const first = placeStudioBg3dViewTrack(rect(0, 0, 800, 600), rect(400, 300, 400, 300));
    const moved = placeStudioBg3dViewTrack(rect(250, 700, 800, 600), rect(650, 1000, 400, 300));
    expect(first).toEqual({ left: 400, bottom: 0, width: 400, height: 300, isOffscreen: false });
    expect(moved).toEqual(first);
  });

  it("4분할: 캔버스를 덮는 네 칸은 모두 그릴 수 있고 viewport 원점은 캔버스 왼쪽 아래다", () => {
    const canvas = rect(100, 200, 800, 600);
    const quadrants = [
      rect(100, 200, 400, 300), rect(500, 200, 400, 300),
      rect(100, 500, 400, 300), rect(500, 500, 400, 300),
    ];
    expect(quadrants.map((track) => placeStudioBg3dViewTrack(canvas, track))).toEqual([
      { left: 0, bottom: 300, width: 400, height: 300, isOffscreen: false },
      { left: 400, bottom: 300, width: 400, height: 300, isOffscreen: false },
      { left: 0, bottom: 0, width: 400, height: 300, isOffscreen: false },
      { left: 400, bottom: 0, width: 400, height: 300, isOffscreen: false },
    ]);
  });

  it.each([
    ["위쪽 밖", rect(100, 0, 100, 100)],
    ["아래쪽 밖", rect(100, 1000, 100, 100)],
    ["왼쪽 밖", rect(0, 300, 50, 100)],
    ["오른쪽 밖", rect(1000, 300, 100, 100)],
  ])("캔버스와 겹치지 않는 트랙은 화면 밖이다: %s", (_label, track) => {
    expect(placeStudioBg3dViewTrack(rect(100, 200, 800, 600), track).isOffscreen).toBe(true);
  });

  it("가장자리가 맞닿은 트랙은 화면 밖이 아니다", () => {
    const canvas = rect(100, 200, 800, 600);
    expect(placeStudioBg3dViewTrack(canvas, rect(100, 100, 100, 100)).isOffscreen).toBe(false);
    expect(placeStudioBg3dViewTrack(canvas, rect(900, 300, 100, 100)).isOffscreen).toBe(false);
  });

  it("면적이 없는 트랙(닫힌 대화상자 등)은 그리지 않는다", () => {
    const canvas = rect(100, 200, 800, 600);
    expect(placeStudioBg3dViewTrack(canvas, rect(0, 0, 0, 0)).isOffscreen).toBe(true);
    expect(placeStudioBg3dViewTrack(canvas, rect(150, 250, 0, 100)).isOffscreen).toBe(true);
    expect(placeStudioBg3dViewTrack(canvas, rect(150, 250, 100, Number.NaN)).isOffscreen).toBe(true);
  });
});
