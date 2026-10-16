import { describe, expect, it } from "vitest";

import {
  clampSplitPosition,
  clientToImagePoint,
  displayScale,
  isDrawableRect,
  keyboardStep,
  percentRectStyle,
  rectFromPoints,
  regionBackgroundStyle,
} from "./panel-canvas-geometry";
import { PANEL_EDIT_MIN_SIDE } from "./panel-detect-edit";

const IMAGE = { width: 400, height: 200 } as const;

describe("컷 편집 캔버스 좌표", () => {
  it("이미지 픽셀 사각형을 상자 대비 퍼센트로 바꾼다", () => {
    expect(percentRectStyle({ x: 100, y: 50, width: 200, height: 100 }, IMAGE)).toEqual({
      left: "25%",
      top: "25%",
      width: "50%",
      height: "50%",
    });
    expect(percentRectStyle({ x: 1, y: 0, width: 3, height: 200 }, { width: 3, height: 200 })).toMatchObject({ left: "33.333%", width: "100%" });
  });

  it("화면 좌표를 이미지 픽셀로 되돌리고 이미지 밖은 가장자리로 맞춘다", () => {
    const bounds = { left: 10, top: 20, width: 200, height: 100 };
    expect(clientToImagePoint({ x: 110, y: 70 }, bounds, IMAGE)).toEqual({ x: 200, y: 100 });
    expect(clientToImagePoint({ x: -50, y: 1_000 }, bounds, IMAGE)).toEqual({ x: 0, y: 200 });
    expect(clientToImagePoint({ x: 5_000, y: -5 }, bounds, IMAGE)).toEqual({ x: 400, y: 0 });
  });

  it("상자가 비어 있으면(아직 배치 전) 좌표를 만들지 않는다", () => {
    expect(clientToImagePoint({ x: 1, y: 1 }, { left: 0, top: 0, width: 0, height: 100 }, IMAGE)).toBeNull();
    expect(clientToImagePoint({ x: 1, y: 1 }, { left: 0, top: 0, width: 100, height: 0 }, IMAGE)).toBeNull();
    expect(clientToImagePoint({ x: 1, y: 1 }, { left: 0, top: 0, width: Number.NaN, height: 10 }, IMAGE)).toBeNull();
  });

  it("표시 배율은 화면 폭을 이미지 폭으로 나눈다", () => {
    expect(displayScale({ left: 0, top: 0, width: 200, height: 100 }, IMAGE)).toBe(0.5);
    expect(displayScale({ left: 0, top: 0, width: 200, height: 100 }, { width: 0, height: 0 })).toBe(0);
  });

  it("두 점은 방향과 상관없이 같은 정수 사각형이 된다", () => {
    // 이진수로 정확히 표현되는 값(.25·.5·.75)만 써서 반올림 경계가 흔들리지 않게 한다.
    const a = { x: 10.25, y: 80.75 };
    const b = { x: 50.5, y: 20.25 };
    expect(rectFromPoints(a, b)).toEqual(rectFromPoints(b, a));
    expect(rectFromPoints(a, b)).toEqual({ x: 10, y: 20, width: 40, height: 61 });
    expect(rectFromPoints(a, a)).toEqual({ x: 10, y: 81, width: 0, height: 0 });
  });

  it("새 컷은 편집 모델의 최소 변 길이 이상일 때만 그릴 수 있다", () => {
    expect(isDrawableRect({ x: 0, y: 0, width: PANEL_EDIT_MIN_SIDE, height: PANEL_EDIT_MIN_SIDE })).toBe(true);
    expect(isDrawableRect({ x: 0, y: 0, width: PANEL_EDIT_MIN_SIDE - 1, height: 100 })).toBe(false);
    expect(isDrawableRect({ x: 0, y: 0, width: 100, height: PANEL_EDIT_MIN_SIDE - 1 })).toBe(false);
  });

  it("방향키 한 번의 이동량은 화면 4px 정도이고 Shift 는 정확히 1픽셀이다", () => {
    expect(keyboardStep({ shiftKey: true }, 0.25)).toBe(1);
    expect(keyboardStep({ shiftKey: false }, 0.5)).toBe(8);
    expect(keyboardStep({ shiftKey: false }, 4)).toBe(1);
    expect(keyboardStep({ shiftKey: false }, 0)).toBe(1);
  });

  it("분할선은 컷 안쪽 최소 변 길이만큼 떨어진 곳으로 맞춘다", () => {
    const rect = { x: 100, y: 200, width: 300, height: 400 };
    expect(clampSplitPosition(rect, "horizontal", 350)).toBe(350);
    expect(clampSplitPosition(rect, "horizontal", 201)).toBe(200 + PANEL_EDIT_MIN_SIDE);
    expect(clampSplitPosition(rect, "horizontal", 10_000)).toBe(600 - PANEL_EDIT_MIN_SIDE);
    expect(clampSplitPosition(rect, "vertical", 99)).toBe(100 + PANEL_EDIT_MIN_SIDE);
    expect(clampSplitPosition(rect, "vertical", 250.6)).toBe(251);
  });
});

describe("원본 일부만 보여 주는 CSS 배경", () => {
  it("영역이 이미지 전체면 배경을 그대로 채운다", () => {
    expect(regionBackgroundStyle("blob:a", IMAGE, { x: 0, y: 0, width: 400, height: 200 })).toMatchObject({
      backgroundSize: "100% 100%",
      backgroundPosition: "0% 0%",
    });
  });

  it("가운데 영역은 배경을 두 배로 키우고 중앙으로 민다", () => {
    expect(regionBackgroundStyle("blob:a", IMAGE, { x: 100, y: 50, width: 200, height: 100 })).toMatchObject({
      backgroundSize: "200% 200%",
      backgroundPosition: "50% 50%",
    });
  });

  it("오른쪽·아래 끝 영역은 100% 위치가 된다", () => {
    expect(regionBackgroundStyle("blob:a", IMAGE, { x: 200, y: 100, width: 200, height: 100 })).toMatchObject({
      backgroundPosition: "100% 100%",
    });
  });

  it("주소는 따옴표로 감싸 CSS 값으로 안전하게 넣는다", () => {
    expect(regionBackgroundStyle("blob:http://localhost/x", IMAGE, { x: 0, y: 0, width: 100, height: 100 }).backgroundImage).toBe('url("blob:http://localhost/x")');
  });
});
