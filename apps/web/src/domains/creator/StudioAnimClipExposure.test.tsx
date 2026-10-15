// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAnimClipExposure } from "./StudioAnimClipExposure";

import type { AnimationTimelineDoc, StudioAnimClipRange } from "./studio-anim-tracks";

const CLIP: StudioAnimClipRange = { id: "clip-a", name: "도입", startFrame: 2, endFrame: 7 };

function makeDoc(overrides: Partial<AnimationTimelineDoc> = {}): AnimationTimelineDoc {
  return { fps: 12, frameCount: 24, tracks: {}, clips: [CLIP], ...overrides };
}

function renderExposure(options: { doc?: AnimationTimelineDoc; clip?: StudioAnimClipRange } = {}) {
  const onDocChange = vi.fn<(next: AnimationTimelineDoc) => void>();
  const clip = options.clip ?? CLIP;
  render(
    <StudioAnimClipExposure
      doc={options.doc ?? makeDoc({ clips: [clip] })}
      clip={clip}
      onDocChange={onDocChange}
    />,
  );
  return onDocChange;
}

/** 마지막으로 부모에 올라간 문서의 첫 클립 구간. */
function lastClipRange(onDocChange: ReturnType<typeof renderExposure>) {
  const doc = onDocChange.mock.lastCall?.[0];
  const clip = doc?.clips?.[0];
  return clip ? { start: clip.startFrame, end: clip.endFrame } : null;
}

/** jsdom 은 레이아웃이 없어 폭이 0 이다 — 24프레임을 240px 로 가정해 1프레임 = 10px 로 만든다. */
function sizeTrack(width: number): HTMLElement {
  const track = document.querySelector<HTMLElement>('[data-clip-bar-track="true"]');
  if (!track) throw new Error("노출 막대 트랙이 렌더되지 않았습니다.");
  track.getBoundingClientRect = () => ({ width, height: 24, top: 0, left: 0, right: width, bottom: 24, x: 0, y: 0, toJSON: () => ({}) });
  return track;
}

function barParts() {
  const bar = screen.getByTestId("timeline-clip-bar-clip-a");
  const handles = bar.querySelectorAll("span");
  const [startHandle, endHandle] = [handles[0], handles[1]];
  if (!startHandle || !endHandle) throw new Error("노출 막대 손잡이가 두 개여야 합니다.");
  return { bar, startHandle, endHandle };
}

afterEach(cleanup);

describe("StudioAnimClipExposure 숫자 입력", () => {
  it("시작은 1부터 세어 보여 주고, 활성 클립이면 활성 노출 프레임 수를 안내한다", () => {
    renderExposure();
    expect(screen.getByRole("spinbutton", { name: "도입 시작 프레임" })).toHaveProperty("value", "3");
    expect(screen.getByRole("spinbutton", { name: "도입 노출 길이(프레임)" })).toHaveProperty("value", "6");
    expect(screen.getByText("노출 6프레임 · 3–8f")).toBeTruthy();
    cleanup();

    renderExposure({ doc: makeDoc({ activeClipId: "clip-a" }) });
    expect(screen.getByText("활성 노출 6프레임 · 3–8f")).toBeTruthy();
  });

  it("시작 입력은 길이를 유지한 채 클립을 옮긴다(입력은 1부터)", () => {
    const onDocChange = renderExposure();
    fireEvent.change(screen.getByRole("spinbutton", { name: "도입 시작 프레임" }), { target: { value: "10" } });
    expect(lastClipRange(onDocChange)).toEqual({ start: 9, end: 14 });
  });

  it("길이 입력은 시작을 고정한 채 끝을 정한다", () => {
    const onDocChange = renderExposure();
    fireEvent.change(screen.getByRole("spinbutton", { name: "도입 노출 길이(프레임)" }), { target: { value: "10" } });
    expect(lastClipRange(onDocChange)).toEqual({ start: 2, end: 11 });
  });

  it("범위를 넘는 입력은 모델이 타임라인 안으로 보정한다", () => {
    const onDocChange = renderExposure();
    fireEvent.change(screen.getByRole("spinbutton", { name: "도입 노출 길이(프레임)" }), { target: { value: "99" } });
    // 시작(프레임 3)부터 남은 22프레임까지만 — 끝은 마지막 프레임(24)이다.
    expect(lastClipRange(onDocChange)).toEqual({ start: 2, end: 23 });
    fireEvent.change(screen.getByRole("spinbutton", { name: "도입 시작 프레임" }), { target: { value: "99" } });
    // 길이 6을 유지하려면 시작은 프레임 19(0부터 18)가 한계다.
    expect(lastClipRange(onDocChange)).toEqual({ start: 18, end: 23 });
  });

  it("보정 결과가 그대로면 문서를 바꾸지 않는다", () => {
    const atEnd: StudioAnimClipRange = { ...CLIP, startFrame: 18, endFrame: 23 };
    const onDocChange = renderExposure({ clip: atEnd });
    // 이미 마지막 프레임에 닿아 더 늘일 수 없다 — 같은 문서를 undo 한 스텝으로 올리지 않는다.
    fireEvent.change(screen.getByRole("spinbutton", { name: "도입 노출 길이(프레임)" }), { target: { value: "9" } });
    expect(onDocChange).not.toHaveBeenCalled();
  });
});

describe("StudioAnimClipExposure 노출 막대", () => {
  it("막대는 보조기기에 감추고 클립 구간 비율로 그린다(같은 조작은 숫자 입력으로 가능)", () => {
    renderExposure();
    const track = sizeTrack(240);
    expect(track.getAttribute("aria-hidden")).toBe("true");
    const { bar } = barParts();
    // 24프레임 중 시작 2, 길이 6 → 왼쪽 8.333…%, 폭 25%.
    expect(Number.parseFloat(bar.style.left)).toBeCloseTo(8.333, 2);
    expect(Number.parseFloat(bar.style.width)).toBeCloseTo(25, 5);
  });

  it("본체 드래그는 길이를 유지한 채 이동하고, 같은 기준에서 다시 계산해 되돌릴 수 있다", () => {
    const onDocChange = renderExposure();
    sizeTrack(240);
    const { bar } = barParts();
    fireEvent.pointerDown(bar, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 130, pointerId: 1 });
    expect(lastClipRange(onDocChange)).toEqual({ start: 5, end: 10 });
    // 원래 자리로 돌아오면 처음 문서 그대로가 부모에 올라간다(누적 오차 없음).
    fireEvent.pointerMove(bar, { clientX: 100, pointerId: 1 });
    expect(lastClipRange(onDocChange)).toEqual({ start: 2, end: 7 });
  });

  it("왼쪽 손잡이는 끝을 고정한 채 시작만, 오른쪽 손잡이는 시작을 고정한 채 길이만 바꾼다", () => {
    const left = renderExposure();
    sizeTrack(240);
    const leftParts = barParts();
    fireEvent.pointerDown(leftParts.startHandle, { button: 0, clientX: 50, pointerId: 1 });
    fireEvent.pointerMove(leftParts.startHandle, { clientX: 70, pointerId: 1 });
    expect(lastClipRange(left)).toEqual({ start: 4, end: 7 });
    // 손잡이에서 시작한 드래그가 본체의 이동 드래그로 겹쳐 시작되지 않는다.
    expect(left).toHaveBeenCalledTimes(1);
    cleanup();

    const right = renderExposure();
    sizeTrack(240);
    const rightParts = barParts();
    fireEvent.pointerDown(rightParts.endHandle, { button: 0, clientX: 80, pointerId: 1 });
    fireEvent.pointerMove(rightParts.endHandle, { clientX: 100, pointerId: 1 });
    expect(lastClipRange(right)).toEqual({ start: 2, end: 9 });
    expect(right).toHaveBeenCalledTimes(1);
  });

  it("손을 떼면 드래그가 끝나 이후 이동은 무시한다", () => {
    const onDocChange = renderExposure();
    sizeTrack(240);
    const { bar } = barParts();
    fireEvent.pointerDown(bar, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 110, pointerId: 1 });
    expect(onDocChange).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(bar, { pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 200, pointerId: 1 });
    expect(onDocChange).toHaveBeenCalledTimes(1);
  });

  it("주 버튼이 아닌 입력이나 폭을 알 수 없는 막대에서는 드래그를 시작하지 않는다", () => {
    const onDocChange = renderExposure();
    const { bar } = barParts();
    // 폭 0(레이아웃 없음)
    fireEvent.pointerDown(bar, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 150, pointerId: 1 });
    expect(onDocChange).not.toHaveBeenCalled();
    // 보조 버튼
    sizeTrack(240);
    fireEvent.pointerDown(bar, { button: 2, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 150, pointerId: 1 });
    expect(onDocChange).not.toHaveBeenCalled();
  });
});
