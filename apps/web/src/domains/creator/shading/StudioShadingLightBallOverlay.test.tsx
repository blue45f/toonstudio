// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildStudioShadingAssistDraft } from "../studio-shading-assist";

import {
  resolveShadingLayerOutput,
  StudioShadingAssistWiredPanel,
} from "./StudioShadingAssistWiredPanel";
import {
  clampElevationDeg,
  describeLightDirectionKo,
  normalizeAzimuthDeg,
  shadingAnglesToHandleOffset,
  shadingElevationToCoverage,
  shadingLightBallPointerToAngles,
  stepLightBallByKey,
  StudioShadingLightBallOverlay,
  type ShadingLightBallState,
} from "./StudioShadingLightBallOverlay";

import type { El } from "../studio-element-model";
import type { StudioImageDataLike } from "../studio-filters";

type ImageElWithMeta = Extract<El, { type: "image" }>;

function makeSolidImage(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { width, height, data };
}

const SAMPLE_IMAGE_EL: ImageElWithMeta = {
  id: "img-layer-1",
  type: "image",
  src: "data:image/png;base64,sample",
  x: 40,
  y: 60,
  width: 320,
  height: 480,
  rotation: 0,
  opacity: 1,
  name: "주인공 밑색",
};

const BASE_BALL_STATE: ShadingLightBallState = {
  azimuthDeg: 315,
  elevationDeg: 45,
  shadingModel: "spherical-volume",
  rimLightStrength: 35,
  anchorX: 0.5,
  anchorY: 0.42,
};

describe("StudioShadingLightBallOverlay — 순수 기하·키보드 모델", () => {
  it("방위각·고도각 포인터 좌표 변환과 역변환이 일관된다", () => {
    expect(normalizeAzimuthDeg(-45)).toBe(315);
    expect(clampElevationDeg(120)).toBe(90);
    expect(clampElevationDeg(-90)).toBe(-45);

    // 화면 위쪽(0°), 측면 반지름 1.0 -> 고도각 0°
    const topEdge = shadingLightBallPointerToAngles(0, -54, 54);
    expect(topEdge.azimuthDeg).toBe(0);
    expect(topEdge.elevationDeg).toBe(0);

    // 화면 오른쪽(90°), 반지름 0.5 -> 고도각 45°
    const rightMid = shadingLightBallPointerToAngles(27, 0, 54);
    expect(rightMid.azimuthDeg).toBe(90);
    expect(rightMid.elevationDeg).toBe(45);

    // 역변환 검증
    const offset = shadingAnglesToHandleOffset(90, 45, 54);
    expect(offset.x).toBeCloseTo(27, 3);
    expect(offset.y).toBeCloseTo(0, 3);

    // 고도각 → 음영 경계 매핑: 역광일수록 경계 비율이 넓어진다
    expect(shadingElevationToCoverage(90)).toBeLessThan(shadingElevationToCoverage(45));
    expect(shadingElevationToCoverage(45)).toBeLessThan(shadingElevationToCoverage(-30));
    expect(describeLightDirectionKo(315, 45)).toBe("좌상단 · 사광");
    expect(describeLightDirectionKo(180, -20)).toBe("하단 · 역광");
  });

  it("키보드 화살표·Shift·Home·M·[/] 단축키로 모든 광원 파라미터를 조작한다", () => {
    expect(stepLightBallByKey(BASE_BALL_STATE, "ArrowRight")).toEqual({ azimuthDeg: 330 });
    expect(stepLightBallByKey(BASE_BALL_STATE, "ArrowLeft", true)).toEqual({ azimuthDeg: 310 });
    expect(stepLightBallByKey(BASE_BALL_STATE, "ArrowUp")).toEqual({ elevationDeg: 55 });
    expect(stepLightBallByKey(BASE_BALL_STATE, "ArrowDown", true)).toEqual({ elevationDeg: 43 });
    expect(stepLightBallByKey(BASE_BALL_STATE, "m")).toEqual({ shadingModel: "linear" });
    expect(stepLightBallByKey(BASE_BALL_STATE, "]")).toEqual({ rimLightStrength: 45 });
    expect(stepLightBallByKey(BASE_BALL_STATE, "[", true)).toEqual({ rimLightStrength: 30 });
    expect(stepLightBallByKey({ ...BASE_BALL_STATE, azimuthDeg: 90, elevationDeg: -20 }, "Home")).toEqual({
      azimuthDeg: 315,
      elevationDeg: 45,
    });
  });
});

describe("StudioShadingLightBallOverlay — 인터랙션 & 접근성", () => {
  afterEach(() => {
    cleanup();
  });

  it("포인터 드래그·키보드 화살표·구면/방향광 전환·림라이트 슬라이더가 실시간 바인딩된다", () => {
    const onChange = vi.fn();
    render(<StudioShadingLightBallOverlay value={BASE_BALL_STATE} onChange={onChange} />);

    const track = screen.getByTestId("shading-light-ball-track");
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 144,
      bottom: 144,
      width: 144,
      height: 144,
      toJSON: () => ({}),
    });

    // 포인터 드래그로 우측(90°) 이동
    fireEvent.pointerDown(track, { clientX: 126, clientY: 72, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith({ azimuthDeg: 90, elevationDeg: 0 });
    fireEvent.pointerMove(track, { clientX: 72, clientY: 18, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith({ azimuthDeg: 0, elevationDeg: 0 });
    fireEvent.pointerUp(track, { pointerId: 1 });

    // 키보드 화살표 조작
    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith({ azimuthDeg: 330 });
    fireEvent.keyDown(track, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith({ elevationDeg: 55 });

    // 구면 ↔ 방향광 전환 버튼 (44px 터치 타깃 클래스 확인)
    const directionalBtn = screen.getByRole("button", { name: "방향광" });
    expect(directionalBtn.className).toContain("min-h-11");
    expect(directionalBtn.className).toContain("min-w-11");
    fireEvent.click(directionalBtn);
    expect(onChange).toHaveBeenCalledWith({ shadingModel: "linear" });

    // 림라이트 강도 슬라이더 실시간 바인딩
    const rimSlider = screen.getByLabelText("광원 볼 림라이트 강도");
    fireEvent.change(rimSlider, { target: { value: "80" } });
    expect(onChange).toHaveBeenCalledWith({ rimLightStrength: 80 });
  });

  it("canvas-overlay 모드에서는 Esc와 닫기 버튼으로 닫히고 드래그로 앵커를 이동한다", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <StudioShadingLightBallOverlay
        value={BASE_BALL_STATE}
        onChange={onChange}
        variant="canvas-overlay"
        onClose={onClose}
      />,
    );

    const dragHandle = screen.getByTestId("shading-light-ball-drag-handle");
    fireEvent.pointerDown(dragHandle, { clientX: 200, clientY: 200, pointerId: 2 });
    fireEvent.pointerMove(dragHandle, { clientX: 328, clientY: 280, pointerId: 2 });
    fireEvent.pointerUp(dragHandle, { pointerId: 2 });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorX: expect.any(Number),
        anchorY: expect.any(Number),
      }),
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("광원 볼 닫기"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("StudioShadingAssistWiredPanel — 3D 구면 볼륨·림라이트 라이브 커밋", () => {
  afterEach(() => {
    cleanup();
  });

  it("resolveShadingLayerOutput은 곱하기 단독일 때 마스크+multiply, 림라이트 활성 시 합성 레이어를 선택한다", () => {
    const source = makeSolidImage(12, 12, [220, 180, 150, 255]);
    const multiplyOnly = buildStudioShadingAssistDraft(source, {
      blendMode: "multiply",
      shadingModel: "spherical-volume",
      rimLightStrength: 0,
    });
    expect(multiplyOnly.status).toBe("created");
    if (multiplyOnly.status === "created") {
      const resolved = resolveShadingLayerOutput(multiplyOnly, "캐릭터");
      expect(resolved.layerBlendMode).toBe("multiply");
      expect(resolved.clipBelow).toBe(true);
      expect(resolved.imageData).toBe(multiplyOnly.mask);
    }

    const withRim = buildStudioShadingAssistDraft(source, {
      blendMode: "multiply",
      shadingModel: "spherical-volume",
      rimLightStrength: 65,
      rimLightWidthPx: 2,
    });
    expect(withRim.status).toBe("created");
    if (withRim.status === "created") {
      const resolved = resolveShadingLayerOutput(withRim, "캐릭터");
      expect(resolved.layerBlendMode).toBe("source-over");
      expect(resolved.clipBelow).toBe(true);
      expect(resolved.imageData).toBe(withRim.preview);
      expect(resolved.layerName).toContain("림라이트");
    }
  });

  it("음영 레이어 만들기 클릭 시 실제 엔진으로 계산된 데이터 URL과 림라이트 통계를 호스트 콜백에 커밋한다", async () => {
    const onPatch = vi.fn();
    const onCreateShadingLayer = vi.fn(() => true);
    const decodeSource = vi.fn(async () => makeSolidImage(16, 16, [215, 175, 145, 255]));
    const encodePng = vi.fn(() => "data:image/png;base64,shaded-layer-output");

    render(
      <StudioShadingAssistWiredPanel
        selected={SAMPLE_IMAGE_EL}
        onPatch={onPatch}
        onCreateShadingLayer={onCreateShadingLayer}
        decodeSource={decodeSource}
        encodePng={encodePng}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "음영 레이어 만들기" }));

    await waitFor(() => {
      expect(onCreateShadingLayer).toHaveBeenCalledTimes(1);
    });
    expect(onCreateShadingLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        dataUrl: "data:image/png;base64,shaded-layer-output",
        clipBelow: true,
        shadingModel: "spherical-volume",
        coverageRatio: expect.any(Number),
        rimLightPixelCount: expect.any(Number),
      }),
    );
    expect(screen.getByRole("status").textContent).toContain("새 음영 레이어를 만들었어요");
  });

  it("onCreateShadingLayer가 없으면 onPatch로 현재 레이어에 음영 결과를 커밋하고, 투명 소스는 거절 사유를 노출한다", async () => {
    const onPatch = vi.fn();
    const decodeSource = vi.fn(async () => makeSolidImage(10, 10, [200, 180, 160, 255]));
    const encodePng = vi.fn(() => "data:image/png;base64,patched-shaded");

    const { unmount } = render(
      <StudioShadingAssistWiredPanel
        selected={SAMPLE_IMAGE_EL}
        onPatch={onPatch}
        decodeSource={decodeSource}
        encodePng={encodePng}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "음영 적용하기" }));
    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith({ src: "data:image/png;base64,patched-shaded" });
    });

    unmount();

    const emptyDecode = vi.fn(async () => makeSolidImage(6, 6, [0, 0, 0, 0]));
    render(
      <StudioShadingAssistWiredPanel
        selected={SAMPLE_IMAGE_EL}
        onPatch={vi.fn()}
        onCreateShadingLayer={vi.fn()}
        decodeSource={emptyDecode}
        encodePng={encodePng}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "음영 레이어 만들기" }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("불투명");
    });
  });

  it("캔버스 광원 볼 버튼으로 플로팅 오버레이를 열고 닫을 수 있다", () => {
    render(
      <StudioShadingAssistWiredPanel
        selected={SAMPLE_IMAGE_EL}
        onPatch={vi.fn()}
        decodeSource={vi.fn(async () => makeSolidImage(8, 8, [200, 180, 160, 255]))}
      />,
    );

    expect(screen.queryByTestId("studio-shading-light-ball-canvas-overlay")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "캔버스 광원 볼" }));
    expect(screen.getByTestId("studio-shading-light-ball-canvas-overlay")).toBeDefined();

    fireEvent.click(screen.getByLabelText("광원 볼 닫기"));
    expect(screen.queryByTestId("studio-shading-light-ball-canvas-overlay")).toBeNull();
  });
});
