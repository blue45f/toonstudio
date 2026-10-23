// @vitest-environment jsdom

import { Color, OrthographicCamera, PerspectiveCamera, Scene } from "three";
import { describe, expect, it, vi } from "vitest";

import {
  clearStudioBg3dView,
  drawStudioBg3dView,
  placeStudioBg3dViewOnRenderer,
} from "./studio-bg3d-view-track-render";

import type { StudioBg3dViewRenderer } from "./studio-bg3d-view-track-render";

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height);
}

function createRenderer(canvasRect: DOMRect) {
  const calls: string[] = [];
  const renderer: StudioBg3dViewRenderer = {
    autoClear: true,
    domElement: { getBoundingClientRect: () => canvasRect },
    setViewport: vi.fn((...args: number[]) => { calls.push(`viewport ${args.join(",")}`); }),
    setScissor: vi.fn((...args: number[]) => { calls.push(`scissor ${args.join(",")}`); }),
    setScissorTest: vi.fn((enabled: boolean) => { calls.push(`scissorTest ${enabled}`); }),
    getClearColor: vi.fn((target: Color) => target.set("#336699")),
    getClearAlpha: vi.fn(() => 0.5),
    setClearColor: vi.fn((color: Color, alpha?: number) => { calls.push(`clearColor ${color.getHexString()} ${alpha}`); }),
    clear: vi.fn((...args: boolean[]) => { calls.push(`clear ${args.join(",")} autoClear=${renderer.autoClear}`); }),
    render: vi.fn(() => { calls.push(`render autoClear=${renderer.autoClear}`); }),
  };
  return { renderer, calls };
}

describe("Studio BG3D View 그리기", () => {
  it("정밀 편집 배치의 트랙을 그린다: 캔버스 상대 viewport·scissor, 카메라 비율, 상태 복구", () => {
    const canvas = domRect(316, 590, 677.109375, 380);
    const track = domRect(315, 589, 679.109375, 382);
    const { renderer, calls } = createRenderer(canvas);
    const camera = new PerspectiveCamera(50, 1, 0.1, 200);
    const scene = new Scene();

    const placement = placeStudioBg3dViewOnRenderer(renderer, track);
    expect(placement.isOffscreen).toBe(false);
    drawStudioBg3dView(renderer, camera, scene, placement);

    expect(calls).toEqual([
      "viewport -1,-1,679.109375,382",
      "scissor -1,-1,679.109375,382",
      "scissorTest true",
      "render autoClear=false",
      "scissorTest false",
    ]);
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
    expect(camera.aspect).toBeCloseTo(679.109375 / 382, 10);
    expect(renderer.autoClear).toBe(true);
  });

  it("캔버스가 움직이면 같은 트랙 칸의 viewport 도 따라 움직인다(캔버스 사각형을 그때그때 잰다)", () => {
    const track = domRect(400, 300, 400, 300);
    const first = placeStudioBg3dViewOnRenderer(createRenderer(domRect(0, 0, 800, 600)).renderer, track);
    const moved = placeStudioBg3dViewOnRenderer(createRenderer(domRect(100, 50, 800, 600)).renderer, track);
    expect(first).toMatchObject({ left: 400, bottom: 0, isOffscreen: false });
    expect(moved).toMatchObject({ left: 300, bottom: 50, isOffscreen: false });
  });

  it("직교 카메라는 트랙 크기로 절두체를 맞추고, manual 카메라는 투영 행렬만 다시 만든다", () => {
    const { renderer } = createRenderer(domRect(0, 0, 800, 600));
    const automatic = new OrthographicCamera(-1, 1, 1, -1, -100, 100);
    const update = vi.spyOn(automatic, "updateProjectionMatrix");
    drawStudioBg3dView(renderer, automatic, new Scene(), {
      left: 0, bottom: 0, width: 400, height: 300, isOffscreen: false,
    });
    expect([automatic.left, automatic.right, automatic.top, automatic.bottom]).toEqual([-200, 200, 150, -150]);
    expect(update).toHaveBeenCalledOnce();

    const manual = Object.assign(new OrthographicCamera(-5, 5, 5, -5, -100, 100), { manual: true });
    const manualUpdate = vi.spyOn(manual, "updateProjectionMatrix");
    drawStudioBg3dView(renderer, manual, new Scene(), {
      left: 0, bottom: 0, width: 400, height: 300, isOffscreen: false,
    });
    expect([manual.left, manual.right, manual.top, manual.bottom]).toEqual([-5, 5, 5, -5]);
    expect(manualUpdate).toHaveBeenCalledOnce();
  });

  it("트랙 칸만 지우고 지우기 색과 autoClear 를 그대로 둔다", () => {
    const { renderer, calls } = createRenderer(domRect(0, 0, 800, 600));
    clearStudioBg3dView(renderer, new PerspectiveCamera(), {
      left: 10, bottom: 20, width: 300, height: 200, isOffscreen: false,
    });
    expect(calls).toEqual([
      "viewport 10,20,300,200",
      "scissor 10,20,300,200",
      "scissorTest true",
      "clearColor 336699 0.5",
      "clear true,true autoClear=false",
      "scissorTest false",
    ]);
    expect(renderer.autoClear).toBe(true);
  });
});
