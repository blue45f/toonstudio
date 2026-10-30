import { describe, expect, it, vi } from "vitest";
import { createStudioSculptGestureToken, type StudioSculptGestureController } from "./studio-hybrid-dcc-sculpt-gesture";
import { createStudioSculptPointerAdapter, type StudioSculptPointerCapture } from "./studio-hybrid-dcc-sculpt-pointer";

function fixture() {
  let captured = false, current = true;
  const active = vi.fn(), begin = vi.fn(() => createStudioSculptGestureToken());
  const controller: StudioSculptGestureController = { begin, isCurrent: () => current,
    sample: vi.fn(), end: vi.fn(), cancel: vi.fn() };
  const adapter = createStudioSculptPointerAdapter(active);
  const capture = { setPointerCapture: vi.fn(() => { captured = true; }),
    hasPointerCapture: vi.fn<StudioSculptPointerCapture["hasPointerCapture"]>(() => captured), releasePointerCapture: vi.fn(() => { captured = false; }) };
  const input = { assetId: "cube", pointerId: 4, localPoint: { x: .1, y: .2, z: .3 } };
  return { adapter, controller, begin, active, capture, input,
    invalidate: () => { current = false; }, lose: () => { captured = false; } };
}
describe("Sculpt 포인터의 단일 terminal·opaque token 소유권", () => {
  it("down→sample 여러 개→up은 같은 토큰을 사용하고 종료·capture release를 한 번만 한다", () => {
    const f = fixture(); expect(f.adapter.begin(f.controller, f.input, f.capture, 10)).toBe(true);
    const token = f.begin.mock.results[0]?.value;
    const a = { x: .2, y: .3, z: .4 }, b = { x: .3, y: .4, z: .5 };
    expect(f.adapter.sample(4, 11, a)).toBe(true); expect(f.adapter.sample(4, 12, b)).toBe(true);
    expect(f.controller.sample).toHaveBeenNthCalledWith(1, token, a);
    expect(f.controller.sample).toHaveBeenNthCalledWith(2, token, b);
    expect(f.adapter.end(4, 13)).toBe(true); expect(f.adapter.end(4, 14)).toBe(false);
    expect(f.controller.end).toHaveBeenCalledExactlyOnceWith(token);
    expect(f.controller.cancel).not.toHaveBeenCalled(); expect(f.capture.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(f.active.mock.calls).toEqual([[true], [false]]);
  });
  it("정상 release의 동기 lost capture는 이미 끝난 토큰을 취소하지 않는다", () => {
    const f = fixture();
    f.capture.releasePointerCapture.mockImplementation(() => {
      expect(f.adapter.isActive()).toBe(false); f.lose(); f.adapter.lostCapture(4, 20);
    });
    f.adapter.begin(f.controller, f.input, f.capture, 10); f.adapter.end(4, 19);
    expect(f.controller.end).toHaveBeenCalledTimes(1); expect(f.controller.cancel).not.toHaveBeenCalled();
  });
  it.each(["end", "cancel"] as const)("%s 콜백과 종료 통지의 동기 재진입은 다음 capture를 만들지 않는다", (kind) => {
    const f = fixture(), nextBegin = vi.fn(() => createStudioSculptGestureToken());
    const nextController: StudioSculptGestureController = { ...f.controller, begin: nextBegin, end: vi.fn(), cancel: vi.fn() };
    const attempts: boolean[] = [];
    vi.spyOn(f.controller, kind).mockImplementation(() => {
      attempts.push(f.adapter.begin(nextController, f.input, f.capture, 20));
    });
    f.capture.releasePointerCapture.mockImplementation(() => {
      attempts.push(f.adapter.begin(nextController, f.input, f.capture, 21)); f.lose();
    });
    f.active.mockImplementation((active: boolean) => {
      if (!active) attempts.push(f.adapter.begin(nextController, f.input, f.capture, 22));
    });
    expect(f.adapter.begin(f.controller, f.input, f.capture, 10)).toBe(true);
    expect(kind === "end" ? f.adapter.end(4, 19) : f.adapter.cancel("escape")).toBe(true);
    expect(attempts).toEqual([false, false, false]); expect(nextBegin).not.toHaveBeenCalled();
    expect(f.capture.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(f.capture.releasePointerCapture).toHaveBeenCalledTimes(1); expect(f.adapter.isActive()).toBe(false);
    expect(f.adapter.begin(nextController, f.input, f.capture, 30)).toBe(true);
    expect(f.capture.hasPointerCapture(4)).toBe(true); expect(f.adapter.isActive()).toBe(true);
    expect(f.active.mock.calls).toEqual([[true], [false], [true]]);
  });
  it.each(["callback", "release", "notification"] as const)("%s 실패가 있어도 종료 정리 후 다음 gesture를 시작할 수 있다", (failure) => {
    const f = fixture(), message = `terminal ${failure} failure`;
    expect(f.adapter.begin(f.controller, f.input, f.capture, 10)).toBe(true);
    if (failure === "callback") vi.spyOn(f.controller, "end").mockImplementationOnce(() => { throw new Error(message); });
    if (failure === "release") f.capture.releasePointerCapture.mockImplementationOnce(() => { throw new Error(message); });
    if (failure === "notification") f.active.mockImplementationOnce(() => { throw new Error(message); });
    expect(() => f.adapter.end(4, 20)).toThrow(message); expect(f.adapter.isActive()).toBe(false);
    expect(f.capture.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(f.active).toHaveBeenLastCalledWith(false);
    expect(f.adapter.begin(f.controller, f.input, f.capture, 30)).toBe(true);
    expect(f.capture.hasPointerCapture(4)).toBe(true); expect(f.adapter.isActive()).toBe(true);
  });
  it("R3F 논리 capture가 남아 있어도 native lost를 뒤 frame에 확인하며 정상 up·다음 gesture는 취소하지 않는다", () => {
    const f = fixture(); f.adapter.begin(f.controller, f.input, f.capture, 10);
    const lost = f.adapter.deferLostCapture(4, 11, () => false);
    expect(lost).not.toBeNull(); lost?.(); expect(f.controller.cancel).toHaveBeenCalledTimes(1);
    const normal = fixture(); normal.adapter.begin(normal.controller, normal.input, normal.capture, 10);
    const beforeUp = normal.adapter.deferLostCapture(4, 11, () => false);
    normal.adapter.end(4, 12); normal.adapter.begin(normal.controller, normal.input, normal.capture, 20); beforeUp?.();
    expect(normal.controller.end).toHaveBeenCalledTimes(1); expect(normal.controller.cancel).not.toHaveBeenCalled();
    expect(normal.adapter.isActive()).toBe(true);
  });
  it.each(["pointercancel", "blur", "escape", "unmount", "scope-changed"] as const)("%s는 전체 gesture를 한 번 취소하고 끝내지 않는다", (reason) => {
    const f = fixture(); f.adapter.begin(f.controller, f.input, f.capture, 10);
    expect(f.adapter.cancel(reason)).toBe(true); expect(f.adapter.cancel(reason)).toBe(false);
    expect(f.controller.cancel).toHaveBeenCalledTimes(1); expect(f.controller.end).not.toHaveBeenCalled();
    expect(f.capture.releasePointerCapture).toHaveBeenCalledTimes(1);
  });
  it("외부 auth/workspace 취소는 controller identity가 같아도 reconcile에서 capture를 해제한다", () => {
    const f = fixture(); f.adapter.begin(f.controller, f.input, f.capture, 10); f.invalidate(); f.adapter.reconcile();
    expect(f.adapter.isActive()).toBe(false); expect(f.capture.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(f.adapter.sample(4, 11, f.input.localPoint)).toBe(false); expect(f.adapter.end(4, 12)).toBe(false);
    expect(f.controller.sample).not.toHaveBeenCalled(); expect(f.controller.end).not.toHaveBeenCalled();
  });
  it("재사용한 pointerId의 이전 timestamp와 다른 pointer는 새 gesture를 종료하지 않는다", () => {
    const f = fixture(); f.adapter.begin(f.controller, f.input, f.capture, 10); f.adapter.end(4, 20);
    f.adapter.begin(f.controller, f.input, f.capture, 30);
    expect(f.adapter.end(4, 20)).toBe(false); expect(f.adapter.cancel("pointercancel", 5, 40)).toBe(false);
    expect(f.adapter.lostCapture(4, 40)).toBe(false);
    expect(f.adapter.isActive()).toBe(true); expect(f.begin.mock.results[0]?.value).not.toBe(f.begin.mock.results[1]?.value);
    f.lose(); expect(f.adapter.lostCapture(4, 41)).toBe(true);
    expect(f.controller.cancel).toHaveBeenCalledTimes(1); expect(f.controller.end).toHaveBeenCalledTimes(1);
  });
  it("두 번째 pointer와 거절된 begin은 sample·terminal·capture를 만들지 않는다", () => {
    const f = fixture(); f.adapter.begin(f.controller, f.input, f.capture, 10);
    expect(f.adapter.begin(f.controller, { ...f.input, pointerId: 7 }, f.capture, 11)).toBe(false);
    expect(f.begin).toHaveBeenCalledTimes(1); f.adapter.cancel("unmount");
    const reject: StudioSculptGestureController = { ...f.controller, begin: () => null };
    expect(f.adapter.begin(reject, f.input, f.capture, 20)).toBe(false);
    expect(f.capture.setPointerCapture).toHaveBeenCalledTimes(1);
  });
  it("capture 실패는 시작한 토큰을 취소하고 partial drawing 상태를 남기지 않는다", () => {
    const f = fixture(); f.capture.setPointerCapture.mockImplementation(() => { throw new Error("capture failure"); });
    expect(f.adapter.begin(f.controller, f.input, f.capture, 10)).toBe(false);
    expect(f.controller.cancel).toHaveBeenCalledWith(f.begin.mock.results[0]?.value, "capture-failed");
    expect(f.adapter.isActive()).toBe(false); expect(f.controller.end).not.toHaveBeenCalled();
  });
  it("예상하지 않은 release 실패도 active를 비우고 통지하며, 이미 lost인 NotFoundError만 허용한다", () => {
    const f = fixture(); f.adapter.begin(f.controller, f.input, f.capture, 10);
    f.capture.releasePointerCapture.mockImplementation(() => { throw new Error("unexpected release failure"); });
    expect(() => f.adapter.end(4, 20)).toThrow("unexpected release failure");
    expect(f.adapter.isActive()).toBe(false); expect(f.active).toHaveBeenLastCalledWith(false);
    const lost = fixture(); lost.adapter.begin(lost.controller, lost.input, lost.capture, 10);
    lost.capture.releasePointerCapture.mockImplementation(() => { throw new DOMException("already lost", "NotFoundError"); });
    expect(() => lost.adapter.end(4, 20)).not.toThrow(); expect(lost.active).toHaveBeenLastCalledWith(false);
  });
});
