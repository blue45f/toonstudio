// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudioEcosystemStream } from "./use-studio-ecosystem-stream";

class FakeEventSource {
  static lastInstance: FakeEventSource | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public readonly url: string) {
    FakeEventSource.lastInstance = this;
  }

  close() {
    this.closed = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeEventSource.lastInstance = null;
});

describe("useStudioEcosystemStream", () => {
  it("SSE 스트림 연결과 실시간 이벤트 수신 및 언마운트 정리를 처리한다", () => {
    vi.stubGlobal("EventSource", FakeEventSource);

    const { result, unmount } = renderHook(() => useStudioEcosystemStream(true));
    expect(FakeEventSource.lastInstance?.url).toContain("/api/studio-ecosystem/events/stream");

    act(() => {
      FakeEventSource.lastInstance?.onopen?.();
      FakeEventSource.lastInstance?.onmessage?.({
        data: JSON.stringify({
          id: "evt-1",
          type: "plaza.slot_assigned",
          payload: { partyId: "party-gate-01", avatarId: "av-1" },
          createdAt: "2026-11-19T06:00:00.000Z",
        }),
      });
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]?.type).toBe("plaza.slot_assigned");

    unmount();
    expect(FakeEventSource.lastInstance?.closed).toBe(true);
  });
});
