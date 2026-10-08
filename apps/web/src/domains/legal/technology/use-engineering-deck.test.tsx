// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeckTrack } from "./engineering-deck-state";
import {
  deckCommandForKey,
  deckTimerKey,
  elapsedDeckSeconds,
  parseSyncMessage,
  parseTimer,
  reconcileDeckTimer,
  useDeckPosition,
  useDeckSync,
  useDeckTimer,
  type DeckPositionSource,
  type DeckTimerState,
} from "./use-engineering-deck";

/** 같은 브라우저의 여러 창을 흉내 내는 BroadcastChannel. 보낸 창은 받지 않고, 전달은 마이크로태스크로 비동기다. */
class FakeBroadcastChannel {
  static readonly channels = new Map<string, Set<FakeBroadcastChannel>>();
  onmessage: ((event: MessageEvent) => void) | null = null;
  private closed = false;

  constructor(readonly name: string) {
    const peers = FakeBroadcastChannel.channels.get(name) ?? new Set<FakeBroadcastChannel>();
    peers.add(this);
    FakeBroadcastChannel.channels.set(name, peers);
  }

  postMessage(data: unknown): void {
    for (const peer of FakeBroadcastChannel.channels.get(this.name) ?? []) {
      if (peer === this || peer.closed) continue;
      queueMicrotask(() => {
        if (!peer.closed) peer.onmessage?.({ data: structuredClone(data) } as MessageEvent);
      });
    }
  }

  close(): void {
    this.closed = true;
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

beforeEach(() => {
  FakeBroadcastChannel.channels.clear();
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  Object.defineProperty(window, "BroadcastChannel", { configurable: true, value: FakeBroadcastChannel });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

const timerState = (overrides: Partial<DeckTimerState> = {}): DeckTimerState => ({
  startedAt: null,
  accumulatedSeconds: 0,
  updatedAt: 0,
  ...overrides,
});

describe("타이머 상태", () => {
  it("저장된 값을 읽고(이전 형식은 updatedAt=0) 잘못된 값은 거절한다", () => {
    expect(parseTimer({ startedAt: 1000, accumulatedSeconds: 5, updatedAt: 2000 })).toEqual({ startedAt: 1000, accumulatedSeconds: 5, updatedAt: 2000 });
    expect(parseTimer({ startedAt: null, accumulatedSeconds: 0 })).toEqual({ startedAt: null, accumulatedSeconds: 0, updatedAt: 0 });
    expect(parseTimer({ startedAt: "x", accumulatedSeconds: 0 })).toBeNull();
    expect(parseTimer({ startedAt: null, accumulatedSeconds: -1 })).toBeNull();
    expect(parseTimer({ startedAt: null, accumulatedSeconds: Number.NaN })).toBeNull();
    expect(parseTimer(null)).toBeNull();
    expect(parseTimer({ startedAt: null, accumulatedSeconds: 1, updatedAt: -5 })?.updatedAt).toBe(0);
  });

  it("경과 시간은 누적 초에 실행 중인 구간을 더한다", () => {
    expect(elapsedDeckSeconds({ startedAt: null, accumulatedSeconds: 30 }, 99_999)).toBe(30);
    expect(elapsedDeckSeconds({ startedAt: 10_000, accumulatedSeconds: 30 }, 15_900)).toBe(35);
    expect(elapsedDeckSeconds({ startedAt: 10_000, accumulatedSeconds: 0 }, 5_000)).toBe(0);
  });

  it("두 창의 상태가 다르면 더 최근(updatedAt)인 쪽이 이긴다", () => {
    const older = timerState({ startedAt: 1000, updatedAt: 1000 });
    const newer = timerState({ accumulatedSeconds: 12, updatedAt: 2000 });
    expect(reconcileDeckTimer(older, newer)).toBe("apply");
    expect(reconcileDeckTimer(newer, older)).toBe("reply");
    expect(reconcileDeckTimer(newer, { ...newer })).toBe("ignore");
    expect(deckTimerKey(newer)).not.toBe(deckTimerKey(older));
  });
});

describe("창 사이 메시지", () => {
  it("위치+타이머, 타이머만, 동기화 요청을 읽고 형식이 틀리면 버린다", () => {
    const timer = { startedAt: 5, accumulatedSeconds: 1, updatedAt: 9 };
    expect(parseSyncMessage({ v: 1, kind: "state", track: "atlas", index: 3, from: "a", timer })).toEqual({ v: 1, kind: "state", track: "atlas", index: 3, from: "a", timer });
    expect(parseSyncMessage({ v: 1, kind: "state", track: "talk", index: 0, from: "a" })).toEqual({ v: 1, kind: "state", track: "talk", index: 0, from: "a" });
    expect(parseSyncMessage({ v: 1, kind: "timer", timer, from: "b" })).toEqual({ v: 1, kind: "timer", timer, from: "b" });
    expect(parseSyncMessage({ v: 1, kind: "sync-request", from: "c" })).toEqual({ v: 1, kind: "sync-request", from: "c" });
    expect(parseSyncMessage({ v: 1, kind: "timer", from: "b" })).toBeNull();
    expect(parseSyncMessage({ v: 2, kind: "sync-request", from: "c" })).toBeNull();
    expect(parseSyncMessage({ v: 1, kind: "state", track: "nope", index: 0, from: "a" })).toBeNull();
    expect(parseSyncMessage({ v: 1, kind: "state", track: "talk", index: -1, from: "a" })).toBeNull();
    expect(parseSyncMessage("text")).toBeNull();
    // 타이머가 깨진 state 는 위치만 쓴다.
    expect(parseSyncMessage({ v: 1, kind: "state", track: "talk", index: 2, from: "a", timer: { startedAt: "x" } })).toEqual({ v: 1, kind: "state", track: "talk", index: 2, from: "a" });
  });
});

/** 청중 창·발표자 창 하나가 쓰는 훅 묶음(페이지가 하는 연결과 같다). */
function useDeckWindow() {
  const timer = useDeckTimer();
  const [position, setPosition] = useState<{ readonly track: DeckTrack; readonly index: number }>({ track: "talk", index: 0 });
  const bridge = useMemo(() => ({ state: timer.state, apply: timer.apply }), [timer.state, timer.apply]);
  const sync = useDeckSync(position, (track, index) => setPosition({ track, index }), bridge);
  return { timer, position, setPosition, sync };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("발표자 창과 청중 창의 타이머 동기화", () => {
  it("한 창에서 시작·일시정지·초기화하면 다른 창이 같은 시각·같은 상태로 따라온다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-08T01:00:00Z"));
    const audience = renderHook(useDeckWindow);
    sessionStorage.clear(); // 창마다 sessionStorage 가 따로다.
    const presenter = renderHook(useDeckWindow);
    await flush();
    expect(audience.result.current.sync.available).toBe(true);

    // 청중 창에서 발표를 시작(타이머 시작)한다.
    act(() => audience.result.current.timer.start());
    await flush();
    const startedAt = Date.now();
    expect(audience.result.current.timer.running).toBe(true);
    expect(presenter.result.current.timer.running).toBe(true);
    expect(presenter.result.current.timer.startedAt).toBe(startedAt);
    expect(elapsedDeckSeconds(presenter.result.current.timer, startedAt + 3000)).toBe(3);

    // 발표자 창에서 일시정지하면 청중 창도 같은 누적 시간으로 멈춘다.
    vi.setSystemTime(startedAt + 7_000);
    act(() => presenter.result.current.timer.pause());
    await flush();
    expect(audience.result.current.timer.running).toBe(false);
    expect(audience.result.current.timer.accumulatedSeconds).toBe(7);
    expect(presenter.result.current.timer.accumulatedSeconds).toBe(7);

    // 청중 창에서 이어서 시작하면 누적 시간 위에서 이어간다.
    vi.setSystemTime(startedAt + 10_000);
    act(() => audience.result.current.timer.toggle());
    await flush();
    expect(presenter.result.current.timer.running).toBe(true);
    expect(presenter.result.current.timer.accumulatedSeconds).toBe(7);
    expect(elapsedDeckSeconds(presenter.result.current.timer, startedAt + 12_000)).toBe(9);

    // 발표자 창의 초기화도 청중 창에 전달된다.
    vi.setSystemTime(startedAt + 20_000);
    act(() => presenter.result.current.timer.reset());
    await flush();
    expect(audience.result.current.timer.running).toBe(false);
    expect(audience.result.current.timer.accumulatedSeconds).toBe(0);
    expect(audience.result.current.timer.startedAt).toBeNull();
  });

  it("나중에 열린 발표자 창은 이미 돌고 있는 청중 창의 타이머를 요청해 이어받는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-08T01:00:00Z"));
    const audience = renderHook(useDeckWindow);
    act(() => audience.result.current.timer.start());
    await flush();
    const startedAt = audience.result.current.timer.startedAt ?? 0;
    expect(startedAt).toBeGreaterThan(0);

    vi.setSystemTime(startedAt + 5_000);
    sessionStorage.clear();
    const presenter = renderHook(useDeckWindow);
    expect(presenter.result.current.timer.running).toBe(false);
    await flush();
    expect(presenter.result.current.timer.running).toBe(true);
    expect(presenter.result.current.timer.startedAt).toBe(startedAt);
    expect(elapsedDeckSeconds(presenter.result.current.timer, Date.now())).toBe(5);
  });

  it("받은 값을 적용한 변화는 다시 방송하지 않아 창 사이에서 되돌아 울리지 않는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-08T01:00:00Z"));
    const sent: unknown[] = [];
    const original = FakeBroadcastChannel.prototype.postMessage;
    vi.spyOn(FakeBroadcastChannel.prototype, "postMessage").mockImplementation(function recordPost(this: FakeBroadcastChannel, data: unknown) {
      sent.push(data);
      original.call(this, data);
    });
    const audience = renderHook(useDeckWindow);
    sessionStorage.clear();
    const presenter = renderHook(useDeckWindow);
    await flush();
    sent.length = 0;

    act(() => audience.result.current.timer.start());
    await flush();
    const timerMessages = sent.filter((message) => parseSyncMessage(message)?.kind === "timer");
    // 시작한 창이 한 번 보냈고, 받은 창은 다시 보내지 않는다.
    expect(timerMessages).toHaveLength(1);
    expect(presenter.result.current.timer.running).toBe(true);
  });

  it("슬라이드 위치도 같은 채널로 맞춘다(타이머와 별개로 계속 동작)", async () => {
    const audience = renderHook(useDeckWindow);
    sessionStorage.clear();
    const presenter = renderHook(useDeckWindow);
    await flush();
    act(() => audience.result.current.setPosition({ track: "atlas", index: 4 }));
    await flush();
    expect(presenter.result.current.position).toEqual({ track: "atlas", index: 4 });
  });

  it("BroadcastChannel 이 없는 브라우저에서도 타이머는 이 창에서 정상 동작한다", async () => {
    Object.defineProperty(window, "BroadcastChannel", { configurable: true, value: undefined });
    const only = renderHook(useDeckWindow);
    expect(only.result.current.sync.available).toBe(false);
    act(() => only.result.current.timer.start());
    await flush();
    expect(only.result.current.timer.running).toBe(true);
  });
});

describe("슬라이드 id 딥링크(useDeckPosition)", () => {
  const source: DeckPositionSource = {
    count: (track) => (track === "atlas" ? 6 : 4),
    ids: (track) => (track === "atlas"
      ? ["atlas-a-diagram", "atlas-a-code-1", "atlas-a-usage", "atlas-b-diagram", "atlas-b-code-1", "atlas-b-usage"]
      : ["talk-cover", "talk-agenda", "talk-ai", "talk-qa"]),
  };

  it("#slide-<id> 는 모델의 슬라이드 id 로 위치를 풀고, 번호 해시(#slide-3)는 그대로 번호로 읽는다", () => {
    window.history.replaceState(null, "", "/about/technology/deck?track=talk#slide-talk-ai");
    const byId = renderHook(() => useDeckPosition(source));
    expect(byId.result.current.index).toBe(2);
    expect(byId.result.current.track).toBe("talk");
    byId.unmount();

    window.history.replaceState(null, "", "/about/technology/deck?track=talk#slide-3");
    const byNumber = renderHook(() => useDeckPosition(source));
    expect(byNumber.result.current.index).toBe(2);
  });

  it("모르는 id 는 첫 슬라이드로 열고 주소를 번호 형식으로 바로잡는다", () => {
    window.history.replaceState(null, "", "/about/technology/deck?track=talk#slide-talk-removed");
    const { result } = renderHook(() => useDeckPosition(source));
    expect(result.current.index).toBe(0);
    expect(window.location.hash).toBe("#slide-1");
  });

  it("부록 트랙은 주소창에도 슬라이드 id 를 쓰고, 다른 트랙은 번호 형식을 유지한다", () => {
    window.history.replaceState(null, "", "/about/technology/deck?track=atlas#slide-atlas-b-code-1");
    const { result } = renderHook(() => useDeckPosition(source));
    expect(result.current.index).toBe(4);
    expect(window.location.hash).toBe("#slide-atlas-b-code-1");

    act(() => result.current.goTo(2));
    expect(window.location.hash).toBe("#slide-atlas-a-usage");

    act(() => result.current.setTrack("talk"));
    expect(window.location.search).toBe("?track=talk");
    expect(window.location.hash).toBe("#slide-1");
  });

  it("openSlide 는 트랙과 위치를 한 번에 바꾸고 범위를 제한한다", () => {
    window.history.replaceState(null, "", "/about/technology/deck?track=talk#slide-2");
    const { result } = renderHook(() => useDeckPosition(source));
    act(() => result.current.openSlide("atlas", 3));
    expect(result.current.track).toBe("atlas");
    expect(result.current.index).toBe(3);
    expect(window.location.hash).toBe("#slide-atlas-b-diagram");
    act(() => result.current.openSlide("atlas", 99));
    expect(result.current.index).toBe(5);
  });

  it("뒤로·앞으로 가기(hashchange)로 주소가 바뀌면 id 도 다시 풀어 같은 슬라이드로 따라간다", () => {
    window.history.replaceState(null, "", "/about/technology/deck?track=atlas#slide-atlas-a-diagram");
    const { result } = renderHook(() => useDeckPosition(source));
    expect(result.current.index).toBe(0);
    act(() => {
      window.history.replaceState(null, "", "/about/technology/deck?track=atlas#slide-atlas-b-usage");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current.index).toBe(5);
  });
});

describe("카드 단위 이동 키", () => {
  const key = (value: string, init: Partial<Pick<KeyboardEvent, "shiftKey" | "altKey" | "ctrlKey" | "metaKey">> & { target?: EventTarget | null } = {}) => ({
    key: value,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    target: null,
    ...init,
  });

  it("[ ] 는 이전·다음 카드 명령이다", () => {
    expect(deckCommandForKey(key("["), false)).toBe("previousCard");
    expect(deckCommandForKey(key("]"), false)).toBe("nextCard");
    expect(deckCommandForKey(key("["), true)).toBe("previousCard");
  });

  it("입력 칸·선택 상자·수정 키가 눌린 상태에서는 가로채지 않는다", () => {
    expect(deckCommandForKey(key("]", { target: document.createElement("input") }), true)).toBeNull();
    expect(deckCommandForKey(key("]", { target: document.createElement("select") }), true)).toBeNull();
    expect(deckCommandForKey(key("]", { ctrlKey: true }), false)).toBeNull();
    expect(deckCommandForKey(key("]", { metaKey: true }), true)).toBeNull();
    // 발표 중이 아니면 버튼에 초점이 있을 때 기본 동작을 보존한다.
    expect(deckCommandForKey(key("]", { target: document.createElement("button") }), false)).toBeNull();
  });
});
