// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useStudioSharedRecoveryVisit } from "./use-studio-shared-recovery-visit";

const original = { key: "owner:work-a", user: "owner", work: "work-a", revision: 2, edit: true, locked: false };
const useVisit = (p: typeof original) => useStudioSharedRecoveryVisit(p.key, p.user, p.work, p.revision, p.edit);
afterEach(cleanup);

describe("공동 원고 시작 복구", () => {
  it("최초 검사 완료 후 전송 잠금이 잠시 걸려도 같은 탭에서 구형 9획을 다시 불러오지 않는다", () => {
    const { result, rerender } = renderHook(useVisit, { initialProps: original });
    expect(result.current?.resolved()).toBe(false);
    act(() => result.current?.resolve());
    rerender({ ...original, locked: true });
    rerender({ ...original, locked: false });
    expect(result.current?.resolved()).toBe(true);
  });

  it("실패하거나 미해결인 최초 검사는 일시적 잠금 뒤에도 다시 시작할 수 있다", () => {
    const { result, rerender } = renderHook(useVisit, { initialProps: original });
    rerender({ ...original, locked: true });
    rerender(original);
    expect(result.current?.resolved()).toBe(false);
  });

  it.each([{ key: "new-draft" }, { user: "other" }, { work: "work-b" }, { revision: 3 }])(
    "범위가 바뀌면 앞선 영수증과 늦게 도착한 복구 결과를 계승하지 않는다 (%o)", changed => {
      const { result, rerender } = renderHook(useVisit, { initialProps: original });
      const previous = result.current!;
      act(() => previous.resolve());
      rerender({ ...original, ...changed });
      expect(result.current).not.toBe(previous);
      act(() => previous.resolve());
      expect(result.current?.resolved()).toBe(false);
      rerender(original);
      expect(result.current?.resolved()).toBe(false);
    },
  );

  it("읽기 전용 전환과 새 탭은 각각 현재 권한으로 시작한다", () => {
    const view = renderHook(useVisit, { initialProps: original });
    act(() => view.result.current?.resolve());
    view.rerender({ ...original, edit: false });
    expect(view.result.current).toBeNull();
    view.rerender(original);
    expect(view.result.current?.resolved()).toBe(false);
    act(() => view.result.current?.resolve());
    view.unmount();
    expect(renderHook(useVisit, { initialProps: original }).result.current?.resolved()).toBe(false);
  });
});
