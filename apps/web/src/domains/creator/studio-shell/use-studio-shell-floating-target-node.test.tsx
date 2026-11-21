// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudioShellFloatingTargetNode } from "./use-studio-shell-floating-target-node";

const NativeMutationObserver = globalThis.MutationObserver;

interface ObserverRegistration {
  readonly observer: MutationObserver;
  readonly callback: MutationCallback;
  readonly counts: { deliveries: number; disconnects: number };
}

function observeRegistrations(): ObserverRegistration[] {
  const registrations: ObserverRegistration[] = [];
  class ObservedMutationObserver extends NativeMutationObserver {
    readonly counts: { deliveries: number; disconnects: number };

    constructor(callback: MutationCallback) {
      const counts = { deliveries: 0, disconnects: 0 };
      super((records, observer) => {
        counts.deliveries += 1;
        callback(records, observer);
      });
      this.counts = counts;
      registrations.push({ observer: this, callback, counts });
    }

    override disconnect(): void {
      this.counts.disconnects += 1;
      super.disconnect();
    }
  }
  vi.stubGlobal("MutationObserver", ObservedMutationObserver);
  return registrations;
}

function activeObserver(registrations: readonly ObserverRegistration[]): ObserverRegistration {
  const active = registrations.filter(({ counts }) => counts.disconnects === 0);
  expect(active).toHaveLength(1);
  const registration = active[0];
  if (!registration) throw new Error("활성 MutationObserver가 없습니다.");
  return registration;
}

function makeTarget(id: string, forceVisible = false): HTMLElement {
  const target = document.createElement("section");
  target.id = id;
  target.dataset.studioShellForceVisible = String(forceVisible);
  return target;
}

async function mutate(action: () => void = () => undefined): Promise<void> {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}

function mountTarget(selector: string, strictMode: boolean) {
  const render = vi.fn();
  const rendered = renderHook(({ nextSelector }: { nextSelector: string }) => {
    render();
    return useStudioShellFloatingTargetNode(nextSelector);
  }, {
    initialProps: { nextSelector: selector },
    reactStrictMode: strictMode,
  });
  return { ...rendered, render };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe.each([false, true])("부동 대상 DOM 관측 StrictMode=%s", (strictMode) => {
  it("없음·등장·제거를 노드와 표시 상태가 맞는 쌍으로 반영한다", async () => {
    const subject = mountTarget("#observed-target", strictMode);
    await mutate();
    expect(subject.result.current).toEqual({ node: null, forceVisible: false });

    const target = makeTarget("observed-target", true);
    await mutate(() => document.body.append(target));
    expect(subject.result.current).toEqual({ node: target, forceVisible: true });

    await mutate(() => target.remove());
    expect(subject.result.current).toEqual({ node: null, forceVisible: false });

    const replacement = makeTarget("observed-target");
    await mutate(() => document.body.append(replacement));
    expect(subject.result.current).toEqual({ node: replacement, forceVisible: false });
  });

  it("실제 변경 뒤 같은 쌍을 반복 관측해도 컴포넌트를 다시 실행하지 않는다", async () => {
    const target = makeTarget("observed-target");
    document.body.append(target);
    const subject = mountTarget("#observed-target", strictMode);
    await mutate();

    const assertNoRender = async () => {
      const snapshot = { ...subject.result.current };
      const before = subject.render.mock.calls.length;
      await mutate(() => document.body.append(document.createElement("i")));
      expect(subject.result.current).toEqual(snapshot);
      expect(subject.render).toHaveBeenCalledTimes(before);
    };
    await assertNoRender();
    await assertNoRender();
    await mutate(() => { target.dataset.studioShellForceVisible = "true"; });
    expect(subject.result.current.forceVisible).toBe(true);
    await assertNoRender();
    const replacement = makeTarget("observed-target", true);
    await mutate(() => target.replaceWith(replacement));
    expect(subject.result.current.node).toBe(replacement);
    await assertNoRender();
  });

  it("강제 표시 변경만 반영하고 같은 값 또는 false와 같은 문자열은 갱신하지 않는다", async () => {
    const target = makeTarget("observed-target");
    document.body.append(target);
    const subject = mountTarget("#observed-target", strictMode);
    await mutate();
    for (const value of ["true", "false"]) {
      await mutate(() => { target.dataset.studioShellForceVisible = value; });
      expect(subject.result.current).toEqual({ node: target, forceVisible: value === "true" });
      const snapshot = { ...subject.result.current };
      const before = subject.render.mock.calls.length;
      await mutate(() => { target.dataset.studioShellForceVisible = value; });
      expect(subject.result.current).toEqual(snapshot);
      expect(subject.render).toHaveBeenCalledTimes(before);
    }
    const before = subject.render.mock.calls.length;
    await mutate(() => { target.dataset.studioShellForceVisible = "TRUE"; });
    await mutate(() => { delete target.dataset.studioShellForceVisible; });
    expect(subject.result.current).toEqual({ node: target, forceVisible: false });
    expect(subject.render).toHaveBeenCalledTimes(before);
  });

  it("같은 선택자의 노드 교체를 반영하고 분리된 이전 노드 변경은 무시한다", async () => {
    const target = makeTarget("observed-target", true);
    document.body.append(target);
    const subject = mountTarget("#observed-target", strictMode);
    await mutate();
    const replacement = makeTarget("observed-target");
    await mutate(() => target.replaceWith(replacement));
    expect(subject.result.current).toEqual({ node: replacement, forceVisible: false });
    const before = subject.render.mock.calls.length;
    await mutate(() => { target.dataset.studioShellForceVisible = "false"; });
    expect(subject.result.current).toEqual({ node: replacement, forceVisible: false });
    expect(subject.render).toHaveBeenCalledTimes(before);
  });

  it("선택자 교체 때 이전 관측을 정리하고 늦은 이전 콜백은 상태를 되돌리지 않는다", async () => {
    const registrations = observeRegistrations();
    const original = makeTarget("original-target");
    const next = makeTarget("next-target", true);
    document.body.append(original, next);
    const subject = mountTarget("#original-target", strictMode);
    await mutate();
    const previous = activeObserver(registrations);
    subject.rerender({ nextSelector: "#next-target" });
    await mutate();
    expect(subject.result.current).toEqual({ node: next, forceVisible: true });
    expect(previous.counts.disconnects).toBe(1);
    expect(activeObserver(registrations)).not.toBe(previous);
    const before = subject.render.mock.calls.length;
    await mutate(() => {
      original.dataset.studioShellForceVisible = "true";
      previous.callback([], previous.observer);
    });
    expect(subject.result.current).toEqual({ node: next, forceVisible: true });
    expect(subject.render).toHaveBeenCalledTimes(before);
  });

  it("선택자가 바뀌어도 실제 쌍이 같으면 별도 상태 렌더를 추가하지 않는다", async () => {
    const registrations = observeRegistrations();
    const target = makeTarget("observed-target", true);
    target.className = "same-target";
    document.body.append(target);
    const subject = mountTarget("#observed-target", strictMode);
    await mutate();
    const previous = activeObserver(registrations);
    const snapshot = { ...subject.result.current };
    const before = subject.render.mock.calls.length;
    subject.rerender({ nextSelector: ".same-target" });
    await mutate();
    expect(subject.result.current).toEqual(snapshot);
    expect(subject.render).toHaveBeenCalledTimes(before + (strictMode ? 2 : 1));
    expect(previous.counts.disconnects).toBe(1);
    expect(activeObserver(registrations)).not.toBe(previous);
  });

  it("React 반영 전에 A→B→A 관측이 들어와도 마지막 쌍을 잃지 않는다", async () => {
    const registrations = observeRegistrations();
    const original = makeTarget("observed-target");
    document.body.append(original);
    const subject = mountTarget("#observed-target", strictMode);
    await mutate();
    const registration = activeObserver(registrations);
    const replacement = makeTarget("observed-target", true);
    await mutate(() => {
      original.replaceWith(replacement);
      registration.callback([], registration.observer);
      replacement.replaceWith(original);
      registration.callback([], registration.observer);
    });
    expect(subject.result.current).toEqual({ node: original, forceVisible: false });
    const before = subject.render.mock.calls.length;
    await mutate(() => registration.callback([], registration.observer));
    expect(subject.render).toHaveBeenCalledTimes(before);
  });

  it("StrictMode 재설치와 unmount 뒤 모든 이전 관측 및 늦은 콜백을 닫는다", async () => {
    const registrations = observeRegistrations();
    const target = makeTarget("observed-target");
    document.body.append(target);
    const subject = mountTarget("#observed-target", strictMode);
    await mutate();
    expect(registrations).toHaveLength(strictMode ? 2 : 1);
    expect(registrations.filter(({ counts }) => counts.disconnects === 0)).toHaveLength(1);
    subject.unmount();
    expect(registrations.every(({ counts }) => counts.disconnects === 1)).toBe(true);
    const before = subject.render.mock.calls.length;
    const deliveries = registrations.map(({ counts }) => counts.deliveries);
    const query = vi.spyOn(document, "querySelector");
    await mutate(() => {
      target.replaceWith(makeTarget("observed-target", true));
      for (const registration of registrations) {
        registration.callback([], registration.observer);
      }
    });
    expect(query).not.toHaveBeenCalled();
    expect(subject.render).toHaveBeenCalledTimes(before);
    expect(registrations.map(({ counts }) => counts.deliveries)).toEqual(deliveries);
  });
});
