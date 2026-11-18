import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeWorkfileInWorker, encodeWorkfileInWorker } from "./studio-hybrid-dcc-workfile-worker-client";
import { createStudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

class HeldWorker {
  static last: HeldWorker;
  postMessage = vi.fn();
  terminate = vi.fn();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { HeldWorker.last = this; }
}
afterEach(() => { vi.unstubAllGlobals(); });

describe(".toon3d 파일 처리기 수명", () => {
  it("열기 전용 버퍼를 이전하고 취소 시 처리기를 즉시 종료한다", async () => {
    vi.stubGlobal("Worker", HeldWorker);
    const signal = new AbortController();
    const bytes = new Uint8Array(10);
    const result = decodeWorkfileInWorker(bytes, "doc", signal.signal);
    expect(HeldWorker.last.postMessage).toHaveBeenCalledWith({ kind: "decode", bytes, documentId: "doc" }, [bytes.buffer]);
    signal.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(HeldWorker.last.terminate).toHaveBeenCalledOnce();
  });

  it("저장 중 워커 오류를 호출자에게 전달하고 활성 메시의 버퍼 소유권은 유지한다", async () => {
    vi.stubGlobal("Worker", HeldWorker);
    const bytes = encodeWorkfileInWorker(createStudioHybridDccWorkspace("doc"), new AbortController().signal);
    expect(HeldWorker.last.postMessage.mock.calls[0]?.[1]).toEqual([]);
    HeldWorker.last.onerror?.();
    await expect(bytes).rejects.toThrow("처리기");
    expect(HeldWorker.last.terminate).toHaveBeenCalledOnce();
  });
});
