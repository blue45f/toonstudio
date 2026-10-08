import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STUDIO_TEXT_RESOLUTION_MAX,
  StudioTextResolutionRuntime,
  studioTextResolutionForScale,
} from "./studio-virtual-space-text-resolution";

type Listener = (...args: never[]) => void;

/** 장면 이벤트와 Text를 최소한만 흉내 낸다. */
function harness() {
  const listeners = new Map<string, Set<Listener>>();
  const events = {
    on(event: string, listener: Listener) { (listeners.get(event) ?? listeners.set(event, new Set()).get(event))?.add(listener); },
    off(event: string, listener: Listener) { listeners.get(event)?.delete(listener); },
  };
  const addToScene = (object: unknown) => listeners.get("addedtoscene")?.forEach((listener) => { (listener as (value: unknown) => void)(object); });
  const text = (resolution = 1, type = "Text") => {
    const destroyListeners: Array<() => void> = [];
    const calls: number[] = [];
    const object = {
      type,
      style: { resolution },
      frame: { source: { resolution } },
      setResolution(value: number) { calls.push(value); object.style.resolution = value; return object; },
      once(_event: string, listener: () => void) { destroyListeners.push(listener); return object; },
      destroy() { destroyListeners.forEach((listener) => { listener(); }); },
      calls,
    };
    return object;
  };
  return { events, addToScene, text, listenerCount: () => listeners.get("addedtoscene")?.size ?? 0 };
}

describe("studioTextResolutionForScale", () => {
  it("배율이 1 이하이거나 잘못된 값이면 1이다", () => {
    for (const value of [1, 0.5, 0, -2, Number.NaN, Number.POSITIVE_INFINITY]) expect(studioTextResolutionForScale(value)).toBe(1);
  });

  it("배율을 올림한 정수 단계를 쓴다", () => {
    expect(studioTextResolutionForScale(1.15)).toBe(2);
    expect(studioTextResolutionForScale(1.5)).toBe(2);
    expect(studioTextResolutionForScale(2)).toBe(2);
    expect(studioTextResolutionForScale(2.2)).toBe(3);
    expect(studioTextResolutionForScale(2.4)).toBe(3);
  });

  it("정수보다 0.1배 안쪽으로 큰 배율은 한 단계 위로 올리지 않는다(실측 DPR 2 화면의 카메라 줌 2.07)", () => {
    expect(studioTextResolutionForScale(1.05)).toBe(1);
    expect(studioTextResolutionForScale(2.071)).toBe(2);
    expect(studioTextResolutionForScale(2.0000001)).toBe(2);
    expect(studioTextResolutionForScale(1.0000001)).toBe(1);
  });

  it("메모리를 아끼려고 상한을 둔다", () => {
    expect(studioTextResolutionForScale(9)).toBe(STUDIO_TEXT_RESOLUTION_MAX);
  });
});

describe("StudioTextResolutionRuntime", () => {
  it("화면 배율이 올라가면 이미 있던 글자와 새로 들어온 글자를 모두 올린다", () => {
    const { events, addToScene, text } = harness();
    const runtime = new StudioTextResolutionRuntime(events);
    const early = text();
    addToScene(early);
    expect(early.calls).toEqual([]);

    runtime.sync(2);
    expect(early.calls).toEqual([2]);
    expect(early.frame.source.resolution).toBe(2);

    const late = text();
    addToScene(late);
    expect(late.calls).toEqual([2]);
    expect(runtime.current).toBe(2);
  });

  it("같은 해상도에서는 글자를 다시 그리지 않는다", () => {
    const { events, addToScene, text } = harness();
    const runtime = new StudioTextResolutionRuntime(events);
    const label = text();
    addToScene(label);
    runtime.sync(2);
    runtime.sync(1.9);
    runtime.sync(2);
    addToScene(label);
    expect(label.calls).toEqual([2]);
    expect(runtime.size).toBe(1);
  });

  it("Text가 아닌 오브젝트는 건드리지 않는다", () => {
    const { events, addToScene, text } = harness();
    const runtime = new StudioTextResolutionRuntime(events);
    const image = text(1, "Image");
    addToScene(image);
    runtime.sync(3);
    expect(image.calls).toEqual([]);
    expect(runtime.size).toBe(0);
  });

  it("만든 쪽이 더 높은 해상도를 골랐다면 그 값을 바닥으로 지킨다", () => {
    const { events, addToScene, text } = harness();
    const runtime = new StudioTextResolutionRuntime(events);
    const motto = text(4);
    addToScene(motto);
    runtime.sync(2);
    expect(motto.calls).toEqual([]);
    expect(motto.style.resolution).toBe(4);
    runtime.sync(1);
    expect(motto.style.resolution).toBe(4);
  });

  it("정수 경계 근처에서 줌이 떨려도 글자를 다시 그리지 않는다", () => {
    const { events, addToScene, text } = harness();
    const runtime = new StudioTextResolutionRuntime(events);
    const label = text();
    addToScene(label);
    runtime.sync(2.2);
    expect(runtime.current).toBe(3);
    for (const scale of [2.0, 1.95, 2.1, 1.93, 2.05, 1.96]) runtime.sync(scale);
    expect(runtime.current).toBe(3);
    expect(label.calls).toEqual([3]);
    runtime.sync(1.7);
    expect(runtime.current).toBe(2);
    expect(label.calls).toEqual([3, 2]);
  });

  it("해상도를 올릴 때는 여유 없이 곧바로 올린다", () => {
    const { events, addToScene, text } = harness();
    const runtime = new StudioTextResolutionRuntime(events);
    const label = text();
    addToScene(label);
    runtime.sync(1.98);
    expect(runtime.current).toBe(2);
    runtime.sync(2.2);
    expect(runtime.current).toBe(3);
    expect(label.calls).toEqual([2, 3]);
  });

  it("파괴된 글자는 더 이상 붙잡지 않는다", () => {
    const { events, addToScene, text } = harness();
    const runtime = new StudioTextResolutionRuntime(events);
    const label = text();
    addToScene(label);
    label.destroy();
    runtime.sync(2);
    expect(label.calls).toEqual([]);
    expect(runtime.size).toBe(0);
  });

  it("dispose하면 이벤트 구독을 풀고 글자 목록을 비운다", () => {
    const { events, addToScene, text, listenerCount } = harness();
    const runtime = new StudioTextResolutionRuntime(events);
    expect(listenerCount()).toBe(1);
    runtime.dispose();
    expect(listenerCount()).toBe(0);
    addToScene(text());
    expect(runtime.size).toBe(0);
  });
});

describe("캔버스 연결 계약", () => {
  const canvas = readFileSync(new URL("./StudioVirtualSpacePhaserCanvas.tsx", import.meta.url), "utf8");

  it("픽셀 아트가 아닌 화풍에서만 장면 시작 때 만들고 매 프레임 배율을 맞춘다", () => {
    expect(canvas).toMatch(/textResolution = artProfile\.pixelated \? null : new StudioTextResolutionRuntime\(this\.sys\.events\)/u);
    expect(canvas).toMatch(/textResolution\?\.sync\(Math\.max\(cameraBaseZoom, viewport\.ratio\)\)/u);
    expect(canvas).toMatch(/cleanup\.push\(\(\) => textResolution\?\.dispose\(\)\)/u);
  });
});
