import { describe, expect, it, vi } from "vitest";

import { explicitStudioFrameClipTarget, isValidStudioFrameClip, studioFrameClip, studioFrameClipBounds, studioFrameClipCacheBounds, traceStudioFrameClip } from "../frame-clip";

describe("컷의 실제 자식 클립", () => {
  const frame = { x: 100, y: 200, width: 80, height: 90 };
  it("전체 문서 크기 이미지도 명시한 실제 컷을 읽고 누락된 ID를 다른 컷으로 대체하지 않는다", () => {
    const target = { ...frame, id: "frame-1" };
    expect(explicitStudioFrameClipTarget("frame-1", [target])).toBe(target);
    expect(explicitStudioFrameClipTarget("missing", [target])).toBeNull();
    expect(explicitStudioFrameClipTarget("frame-1", [{ ...target, hidden: true }])).toBeNull();
    expect(explicitStudioFrameClipTarget("frame-1", [target, { ...target }])).toBeNull();
    expect(explicitStudioFrameClipTarget(undefined, [target])).toBeUndefined();
  });
  it("기존 사각형과 빈 다각형의 경로를 보존한다", () => {
    expect(studioFrameClip(frame)).toEqual(frame);
    expect(studioFrameClip({ ...frame, points: [] })).toEqual(frame);
  });
  it("전체 원고 PNG 합성 캐시는 실제 컷과 경계 픽셀만 할당한다", () => {
    expect(studioFrameClipCacheBounds({ x: 0, y: 0, width: 1440, height: 3600 }, studioFrameClip(frame)))
      .toEqual({ x: 99, y: 199, width: 82, height: 92 });
    const partial = { x: 110, y: 220, width: 5, height: 6 };
    expect(studioFrameClipCacheBounds(partial, studioFrameClip(frame))).toEqual(partial);
  });
  it("이동한 대각 컷의 로컬 좌표를 문서 좌표로 한 번만 옮긴다", () => {
    const clip = studioFrameClip({ ...frame, points: [-10, 0, 80, 20, 40, 90] });
    expect(clip.points).toEqual([90, 200, 180, 220, 140, 290]);
    expect(studioFrameClipBounds(clip)).toEqual({ x: 90, y: 200, width: 90, height: 90 });
    const path = { moveTo: vi.fn(), lineTo: vi.fn(), rect: vi.fn(), closePath: vi.fn() };
    traceStudioFrameClip(path, clip);
    expect(path.moveTo).toHaveBeenCalledWith(90, 200);
    expect(path.lineTo.mock.calls).toEqual([[180, 220], [140, 290]]);
    expect(path.closePath).toHaveBeenCalledOnce();
    expect(path.rect).not.toHaveBeenCalled();
  });
  it("사각형 경로의 좌표와 크기를 바꾸지 않는다", () => {
    const path = { moveTo: vi.fn(), lineTo: vi.fn(), rect: vi.fn(), closePath: vi.fn() };
    traceStudioFrameClip(path, studioFrameClip(frame));
    expect(path.rect).toHaveBeenCalledWith(100, 200, 80, 90);
    expect(path.moveTo).not.toHaveBeenCalled();
  });
  it.each([[0, 0, 1, 1], [0, 0, 1, 1, 2, 2, 3], [0, 0, 1, Infinity, 2, 2]])(
    "깨진 다각형을 사각형으로 확대하지 않는다: %j", (...points) => {
      expect(() => studioFrameClip({ ...frame, points })).toThrow();
    },
  );
  it("문서 이동에서 발생한 overflow와 잘못된 크기를 거절한다", () => {
    expect(() => studioFrameClip({ ...frame, x: Number.MAX_VALUE,
      points: [Number.MAX_VALUE, 0, 0, 2, 3, 4] })).toThrow();
    expect(isValidStudioFrameClip({ ...frame, width: 0 })).toBe(false);
    expect(isValidStudioFrameClip({ ...frame, x: Number.MAX_VALUE, width: Number.MAX_VALUE })).toBe(false);
  });
});
