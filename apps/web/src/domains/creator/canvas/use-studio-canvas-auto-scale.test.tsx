// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode, Suspense, useCallback, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioCanvasAutoScale } from "./use-studio-canvas-auto-scale";

let observers: ControlledResizeObserver[] = [];
let widths = new WeakMap<HTMLElement, number>();

class ControlledResizeObserver implements ResizeObserver {
  readonly targets = new Set<Element>();
  readonly observe = vi.fn((target: Element) => { this.targets.add(target); });
  readonly unobserve = vi.fn((target: Element) => { this.targets.delete(target); });
  readonly disconnect = vi.fn(() => { this.targets.clear(); });

  constructor(private readonly callback: ResizeObserverCallback) {
    observers.push(this);
  }

  // disconnect 전에 대기열에 들어간 알림도 전달해 수명 가드를 검사한다.
  deliver(): void { this.callback([], this); }
}

interface Gate {
  pending: boolean;
  readonly promise: Promise<void>;
  release: () => void;
}

function createGate(): Gate {
  let resolve: () => void = () => { throw new Error("Suspense 대기열이 준비되지 않았습니다."); };
  const promise = new Promise<void>((done) => { resolve = done; });
  const gate: Gate = { pending: true, promise, release: () => { gate.pending = false; resolve(); } };
  return gate;
}

function PendingChild({ gate }: { readonly gate?: Gate }) {
  if (gate?.pending) throw gate.promise;
  return null;
}

function installMeasuredWidth(node: HTMLDivElement, initialWidth: number): void {
  if (!widths.has(node)) widths.set(node, initialWidth);
  // jsdom에는 배치 엔진이 없다. 실제 DOM의 폭만 공급하고 React의 ref/effect/Suspense는 그대로 실행한다.
  Object.defineProperty(node, "clientWidth", { configurable: true, get: () => {
    if (!node.isConnected) return 0;
    for (let ancestor: HTMLElement | null = node; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.hidden || ancestor.style.display === "none") return 0;
    }
    return widths.get(node) ?? 0;
  } });
}

interface OwnerProps {
  readonly initialWidth: number;
  readonly documentWidth: number;
  readonly maximumScale: number;
  readonly setScale: (scale: number) => void;
  readonly gate?: Gate;
}

function ViewportOwner({ initialWidth, documentWidth, maximumScale, setScale, gate }: OwnerProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bind = useCallback((node: HTMLDivElement | null) => {
    wrapRef.current = node;
    if (node) installMeasuredWidth(node, initialWidth);
  }, [initialWidth]);
  useStudioCanvasAutoScale({ wrapRef, documentWidth, maximumScale, setScale });
  return <div ref={bind} data-testid="viewport"><PendingChild gate={gate} /></div>;
}

interface HarnessProps {
  readonly onScale: (scale: number) => void;
  readonly initialWidth?: number;
  readonly documentWidth?: number;
  readonly maximumScale?: number;
  readonly ownerKey?: string;
  readonly gate?: Gate;
}

function Harness({ onScale, initialWidth = 720, documentWidth = 720, maximumScale = 2.5, ownerKey = "first", gate }: HarnessProps) {
  const [scale, setScaleState] = useState(1);
  const setScale = useCallback((next: number) => { onScale(next); setScaleState(next); }, [onScale]);
  return <>
    <output data-testid="scale">{scale}</output>
    <Suspense fallback={<div data-testid="loading">캔버스 준비 중</div>}>
      <ViewportOwner key={ownerKey} initialWidth={initialWidth} documentWidth={documentWidth}
        maximumScale={maximumScale} setScale={setScale} gate={gate} />
    </Suspense>
  </>;
}

function viewport(): HTMLDivElement {
  const node = screen.getByTestId("viewport");
  if (!(node instanceof HTMLDivElement)) throw new Error("실제 viewport div가 없습니다.");
  return node;
}

function observerFor(node: Element): ControlledResizeObserver {
  const active = observers.filter((observer) => observer.targets.has(node));
  expect(active).toHaveLength(1);
  const observer = active[0];
  if (!observer) throw new Error("현재 viewport의 관측자가 없습니다.");
  return observer;
}

function expectScale(scale: number): void {
  expect(Number(screen.getByTestId("scale").textContent)).toBe(scale);
}

beforeEach(() => {
  observers = [];
  widths = new WeakMap();
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("실제 캔버스 소유자의 자동 폭 배율", () => {
  it("mount의 첫 유효폭을 배율에 반영하고 같은 DOM의 양수 resize를 따른다", () => {
    const onScale = vi.fn();
    render(<Harness onScale={onScale} initialWidth={1440} />);
    const node = viewport(), observer = observerFor(node);
    expectScale(2);
    expect(onScale).toHaveBeenCalledExactlyOnceWith(2);
    widths.set(node, 360);
    act(() => observer.deliver());
    expectScale(0.5);
    expect(onScale.mock.calls.map(([scale]) => scale)).toEqual([2, 0.5]);
  });

  it("초기 0폭과 다시 숨은 0폭은 배율을 쓰지 않고 다음 유효폭을 기다린다", () => {
    const onScale = vi.fn();
    render(<Harness onScale={onScale} initialWidth={0} />);
    const node = viewport(), observer = observerFor(node);
    expectScale(1);
    expect(onScale).not.toHaveBeenCalled();
    widths.set(node, 360);
    act(() => observer.deliver());
    expectScale(0.5);
    onScale.mockClear();
    widths.set(node, 0);
    act(() => observer.deliver());
    expectScale(0.5);
    expect(onScale).not.toHaveBeenCalled();
    widths.set(node, 720);
    act(() => observer.deliver());
    expectScale(1);
    expect(onScale).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("유효한 작은 양수폭에는 기존 최소 10% 배율을 적용한다", () => {
    const onScale = vi.fn();
    render(<Harness onScale={onScale} initialWidth={36} />);
    expectScale(0.1);
    expect(onScale).toHaveBeenCalledExactlyOnceWith(0.1);
  });

  it("첫 Suspense 대기 중에는 관측하지 않고 실제 mount가 완료되면 폭을 읽는다", async () => {
    const onScale = vi.fn(), gate = createGate();
    render(<Harness onScale={onScale} initialWidth={1080} gate={gate} />);
    expect(screen.getByTestId("loading")).toBeTruthy();
    expect(screen.queryByTestId("viewport")).toBeNull();
    expect(observers).toHaveLength(0);
    expect(onScale).not.toHaveBeenCalled();
    await act(async () => { gate.release(); });
    expect(screen.queryByTestId("loading")).toBeNull();
    observerFor(viewport());
    expectScale(1.5);
    expect(onScale).toHaveBeenCalledExactlyOnceWith(1.5);
  });

  it("Suspense가 같은 DOM을 숨겼다가 복원하면 RO 알림 없이 재측정하고 옛 알림을 무시한다", async () => {
    const onScale = vi.fn();
    const view = render(<Harness onScale={onScale} initialWidth={1440} />);
    const node = viewport(), previous = observerFor(node), gate = createGate();
    onScale.mockClear();
    await act(async () => { view.rerender(<Harness onScale={onScale} initialWidth={1440} gate={gate} />); });
    expect(screen.getByTestId("loading")).toBeTruthy();
    expect(node.isConnected).toBe(true);
    expect(node.clientWidth).toBe(0);
    expect(previous.disconnect).toHaveBeenCalledOnce();
    act(() => previous.deliver());
    expectScale(2);
    expect(onScale).not.toHaveBeenCalled();

    widths.set(node, 1080);
    await act(async () => { gate.release(); });
    expect(screen.queryByTestId("loading")).toBeNull();
    expect(viewport()).toBe(node);
    expectScale(1.5);
    const current = observerFor(node);
    expect(current).not.toBe(previous);
    expect(onScale).toHaveBeenCalledExactlyOnceWith(1.5);
    onScale.mockClear();
    widths.set(node, 720);
    act(() => previous.deliver());
    expectScale(1.5);
    expect(onScale).not.toHaveBeenCalled();
    act(() => current.deliver());
    expectScale(1);
    expect(onScale).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("아직 owner가 있어도 분리된 DOM의 callback은 배율을 바꾸지 않는다", () => {
    const onScale = vi.fn();
    render(<Harness onScale={onScale} initialWidth={1080} />);
    const node = viewport(), observer = observerFor(node), parent = node.parentNode;
    if (!parent) throw new Error("viewport의 실제 부모가 없습니다.");
    onScale.mockClear();
    node.remove();
    try {
      widths.set(node, 360);
      act(() => observer.deliver());
      expectScale(1.5);
      expect(onScale).not.toHaveBeenCalled();
    } finally { parent.appendChild(node); }
  });

  it("owner remount는 새 노드를 관측하고 제거된 노드의 늦은 알림을 버린다", () => {
    const onScale = vi.fn();
    const view = render(<Harness onScale={onScale} initialWidth={1440} />);
    const previousNode = viewport(), previous = observerFor(previousNode);
    onScale.mockClear();
    view.rerender(<Harness onScale={onScale} initialWidth={360} ownerKey="replacement" />);
    const nextNode = viewport(), current = observerFor(nextNode);
    expect(nextNode).not.toBe(previousNode);
    expect(previousNode.isConnected).toBe(false);
    expect(previous.disconnect).toHaveBeenCalledOnce();
    expectScale(0.5);
    expect(onScale).toHaveBeenCalledExactlyOnceWith(0.5);
    onScale.mockClear();
    act(() => previous.deliver());
    expect(onScale).not.toHaveBeenCalled();
    widths.set(nextNode, 1080);
    act(() => current.deliver());
    expectScale(1.5);
  });

  it("cap 변경은 같은 노드에서 최신 상한을 반영하고 이전 관측자를 정리한다", () => {
    const onScale = vi.fn();
    const view = render(<Harness onScale={onScale} initialWidth={3600} />);
    const node = viewport(), previous = observerFor(node);
    expectScale(2.5);
    onScale.mockClear();
    view.rerender(<Harness onScale={onScale} initialWidth={3600} maximumScale={4} />);
    expect(viewport()).toBe(node);
    expectScale(4);
    expect(previous.disconnect).toHaveBeenCalledOnce();
    expect(observerFor(node)).not.toBe(previous);
    expect(onScale).toHaveBeenCalledExactlyOnceWith(4);
  });

  it("문서폭 변경만으로 보기를 다시 맞추지 않으며 다음 resize는 새 문서폭을 쓴다", () => {
    const onScale = vi.fn();
    const view = render(<Harness onScale={onScale} initialWidth={720} />);
    const node = viewport(), observer = observerFor(node);
    onScale.mockClear();
    view.rerender(<Harness onScale={onScale} initialWidth={720} documentWidth={1440} />);
    expectScale(1);
    expect(onScale).not.toHaveBeenCalled();
    expect(observerFor(node)).toBe(observer);
    widths.set(node, 1080);
    act(() => observer.deliver());
    expectScale(0.75);
    expect(onScale).toHaveBeenCalledExactlyOnceWith(0.75);
  });

  it("ResizeObserver가 없으면 실제 window resize로 갱신하고 unmount에서 해제한다", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const onScale = vi.fn();
    const view = render(<Harness onScale={onScale} initialWidth={1440} />);
    const node = viewport();
    expectScale(2);
    expect(observers).toHaveLength(0);
    onScale.mockClear();
    widths.set(node, 360);
    act(() => { window.dispatchEvent(new Event("resize")); });
    expectScale(0.5);
    expect(onScale).toHaveBeenCalledExactlyOnceWith(0.5);
    view.unmount();
    onScale.mockClear();
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(onScale).not.toHaveBeenCalled();
  });

  it("StrictMode 재연결 뒤에도 관측자는 하나이며 cleanup 전 알림은 활성 DOM에도 적용하지 않는다", () => {
    const onScale = vi.fn();
    const view = render(<StrictMode><Harness onScale={onScale} initialWidth={1440} /></StrictMode>);
    const node = viewport(), current = observerFor(node);
    const previous = observers.find((observer) => observer !== current);
    if (!previous) throw new Error("StrictMode의 effect 재연결이 실행되지 않았습니다.");
    expect(previous.disconnect).toHaveBeenCalledOnce();
    expect(node.isConnected).toBe(true);
    expectScale(2);
    onScale.mockClear();
    widths.set(node, 360);
    act(() => previous.deliver());
    expectScale(2);
    expect(onScale).not.toHaveBeenCalled();
    act(() => current.deliver());
    expectScale(0.5);
    expect(onScale).toHaveBeenCalledExactlyOnceWith(0.5);
    view.unmount();
    expect(current.disconnect).toHaveBeenCalledOnce();
    onScale.mockClear();
    act(() => current.deliver());
    expect(onScale).not.toHaveBeenCalled();
  });
});
