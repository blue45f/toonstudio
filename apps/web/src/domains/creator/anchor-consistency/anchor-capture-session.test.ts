import { afterEach, describe, expect, it, vi } from "vitest";

import { sha256HexPortable } from "../studio-sha256";

import { ANCHOR_ANGLE_IDS, ANCHOR_LIMITS, type AnchorAngleId } from "./anchor-capture-spec";
import {
  AnchorCaptureError,
  clearAnchorSlot,
  collectAnchorFrames,
  createEmptyAnchorSession,
  runAnchorCapture,
  summarizeAnchorSession,
  type AnchorCaptureContext,
  type AnchorFrameSource,
  type RawAnchorFrame,
} from "./anchor-capture-session";
import { fakePngBytes, fakeRawFrame } from "./anchor-test-kit";

afterEach(() => {
  vi.useRealTimers();
});

function sourceOf(
  handler: (angleId: AnchorAngleId, context: AnchorCaptureContext) => Promise<RawAnchorFrame>,
): AnchorFrameSource & { readonly calls: AnchorAngleId[] } {
  const calls: AnchorAngleId[] = [];
  return {
    kind: "file",
    calls,
    capture(angleId, context) {
      calls.push(angleId);
      return handler(angleId, context);
    },
  };
}

const okSource = () =>
  sourceOf((angleId) => Promise.resolve(fakeRawFrame(768, 1152, ANCHOR_ANGLE_IDS.indexOf(angleId) + 1, `${angleId}.png`)));

describe("앵커 캡처 세션 — 진행", () => {
  it("요청한 각도를 정본 순서로 하나씩 캡처하고 진행 상황을 단계별로 알린다", async () => {
    let running = 0;
    let maxRunning = 0;
    const source = sourceOf(async (angleId) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await Promise.resolve();
      running -= 1;
      return fakeRawFrame(768, 1152, ANCHOR_ANGLE_IDS.indexOf(angleId) + 1);
    });
    const phases: string[] = [];
    const frontStatuses: string[] = [];
    const result = await runAnchorCapture({
      angles: ["right", "front", "left-34"],
      source,
      onProgress: (snapshot) => {
        phases.push(snapshot.phase);
        frontStatuses.push(snapshot.slots.front.status);
      },
    });
    expect(source.calls).toEqual(["front", "left-34", "right"]);
    expect(maxRunning).toBe(1);
    expect(phases[0]).toBe("running");
    expect(phases.at(-1)).toBe("finished");
    expect(phases.slice(0, -1).every((phase) => phase === "running")).toBe(true);
    expect(frontStatuses.slice(0, 3)).toEqual(["queued", "capturing", "done"]);
    expect(frontStatuses.at(-1)).toBe("done");
    expect(result.phase).toBe("finished");
    expect(collectAnchorFrames(result).map((frame) => frame.angleId)).toEqual(["front", "left-34", "right"]);
    expect(summarizeAnchorSession(result)).toMatchObject({ requested: 3, settled: 3, progress: 1, failedAngles: [], cancelledAngles: [] });
  });

  it("프레임마다 SHA-256 과 바이트 수를 계산한다", async () => {
    const result = await runAnchorCapture({ angles: ["front"], source: okSource() });
    const frame = result.slots.front.frame;
    expect(frame?.byteLength).toBe(64);
    expect(frame?.imageSha256).toBe(frame ? sha256HexPortable(frame.bytes) : "");
    expect(frame?.imageSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(frame?.origin).toBe("file");
    expect(frame?.sourceName).toBe("front.png");
  });

  it("해시 함수를 바꿔 끼울 수 있다(네이티브 Web Crypto 등)", async () => {
    const hashBytes = vi.fn(() => Promise.resolve("a".repeat(64)));
    const result = await runAnchorCapture({ angles: ["back"], source: okSource(), hashBytes });
    expect(hashBytes).toHaveBeenCalledTimes(1);
    expect(result.slots.back.frame?.imageSha256).toBe("a".repeat(64));
  });

  it("알 수 없는 각도와 중복은 무시하고, 요청이 없으면 곧바로 끝난다", async () => {
    const source = okSource();
    const result = await runAnchorCapture({ angles: ["front", "front", "top" as never], source });
    expect(source.calls).toEqual(["front"]);
    expect(result.requested).toEqual(["front"]);
    const none = await runAnchorCapture({ angles: [], source });
    expect(none.phase).toBe("finished");
    expect(summarizeAnchorSession(none).progress).toBe(1);
  });

  it("빈 세션은 모든 슬롯이 idle 이다", () => {
    const empty = createEmptyAnchorSession();
    expect(empty.phase).toBe("idle");
    expect(ANCHOR_ANGLE_IDS.every((id) => empty.slots[id].status === "idle")).toBe(true);
    expect(collectAnchorFrames(empty)).toEqual([]);
  });
});

describe("앵커 캡처 세션 — 실패와 다시 시도", () => {
  it("한 각도가 실패해도 나머지는 계속하고 실패 이유 코드를 남긴다", async () => {
    const source = sourceOf((angleId) => {
      if (angleId === "left") return Promise.reject(new AnchorCaptureError("decode-failed"));
      if (angleId === "back") return Promise.reject(new Error("무언가 터졌어요"));
      return Promise.resolve(fakeRawFrame());
    });
    const result = await runAnchorCapture({ angles: ["front", "left", "back", "right"], source });
    const summary = summarizeAnchorSession(result);
    expect(summary.doneAngles).toEqual(["front", "right"]);
    expect(summary.failedAngles).toEqual(["left", "back"]);
    expect(result.slots.left).toMatchObject({ status: "failed", errorCode: "decode-failed", attempts: 1 });
    expect(result.slots.back).toMatchObject({ status: "failed", errorCode: "source-failed" });
    expect(summary.progress).toBe(1);
  });

  it("실패한 각도만 다시 실행하고 끝난 각도의 프레임은 그대로 둔다", async () => {
    let failLeft = true;
    const source = sourceOf((angleId) =>
      angleId === "left" && failLeft ? Promise.reject(new AnchorCaptureError("decode-failed")) : Promise.resolve(fakeRawFrame(768, 1152, 3)),
    );
    const first = await runAnchorCapture({ angles: ["front", "left"], source });
    expect(first.slots.left.status).toBe("failed");
    failLeft = false;
    const retried = await runAnchorCapture({ angles: ["left"], source, previous: first });
    expect(source.calls).toEqual(["front", "left", "left"]);
    expect(retried.slots.front).toBe(first.slots.front);
    expect(retried.slots.left).toMatchObject({ status: "done", attempts: 2 });
    expect(retried.slots.left.errorCode).toBeUndefined();
    expect(summarizeAnchorSession(retried)).toMatchObject({ requested: 1, doneAngles: ["left"] });
    expect(collectAnchorFrames(retried).map((frame) => frame.angleId)).toEqual(["front", "left"]);
  });

  it("출처가 돌려준 프레임이 규칙에 맞지 않으면 그 각도만 이유와 함께 실패한다", async () => {
    const results: Record<string, RawAnchorFrame> = {
      front: fakeRawFrame(100, 150),
      back: { ...fakeRawFrame(), mimeType: "image/gif" },
      left: { ...fakeRawFrame(), bytes: new Uint8Array(0) },
      right: { ...fakeRawFrame(), bytes: fakePngBytes(768, 1152, 1, ANCHOR_LIMITS.maxImageBytes + 1) },
      "left-34": fakeRawFrame(5000, 5000),
      "right-34": fakeRawFrame(768, 1152, 1, "ok.png"),
    };
    const source = sourceOf((angleId) => Promise.resolve(results[angleId] as RawAnchorFrame));
    const result = await runAnchorCapture({ angles: [...ANCHOR_ANGLE_IDS], source });
    expect(result.slots.front).toMatchObject({ status: "failed", errorCode: "image-too-small", errorParams: { width: 100, height: 150, min: ANCHOR_LIMITS.minEdgePx } });
    expect(result.slots.back).toMatchObject({ status: "failed", errorCode: "unsupported-format" });
    expect(result.slots.left).toMatchObject({ status: "failed", errorCode: "file-empty" });
    expect(result.slots.right).toMatchObject({ status: "failed", errorCode: "file-too-large" });
    expect(result.slots["left-34"]).toMatchObject({ status: "failed", errorCode: "image-too-large" });
    expect(result.slots["right-34"].status).toBe("done");
  });

  it("실패하거나 취소된 슬롯을 비우면 idle 로 돌아간다", async () => {
    const source = sourceOf(() => Promise.reject(new AnchorCaptureError("decode-failed")));
    const failed = await runAnchorCapture({ angles: ["front"], source });
    const cleared = clearAnchorSlot(failed, "front");
    expect(cleared.slots.front).toEqual({ status: "idle", attempts: 0 });
    expect(failed.slots.front.status).toBe("failed");
  });
});

describe("앵커 캡처 세션 — 취소와 시간 상한", () => {
  it("처리 중에 취소하면 그 각도와 남은 각도가 취소되고 끝난 각도는 남는다", async () => {
    const controller = new AbortController();
    const source = sourceOf((angleId, context) => {
      if (angleId === "left-34") {
        return new Promise<RawAnchorFrame>((_, reject) => {
          context.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
          queueMicrotask(() => controller.abort());
        });
      }
      return Promise.resolve(fakeRawFrame());
    });
    const result = await runAnchorCapture({ angles: ["front", "left-34", "left", "back"], source, signal: controller.signal });
    expect(source.calls).toEqual(["front", "left-34"]);
    expect(result.slots.front.status).toBe("done");
    expect(result.slots["left-34"]).toMatchObject({ status: "cancelled", errorCode: "cancelled" });
    expect(result.slots.left.status).toBe("cancelled");
    expect(result.slots.back.status).toBe("cancelled");
    expect(summarizeAnchorSession(result)).toMatchObject({ doneAngles: ["front"], cancelledAngles: ["left-34", "left", "back"], failedAngles: [] });
  });

  it("출처가 취소 신호를 보지 않고 계속 기다려도 세션은 취소로 끝난다", async () => {
    const controller = new AbortController();
    const source = sourceOf(() => new Promise<RawAnchorFrame>(() => { queueMicrotask(() => controller.abort()); }));
    const result = await runAnchorCapture({ angles: ["front", "back"], source, signal: controller.signal });
    expect(result.slots.front.status).toBe("cancelled");
    expect(result.slots.back.status).toBe("cancelled");
    expect(result.phase).toBe("finished");
  });

  it("이미 취소된 신호로 시작하면 출처를 한 번도 부르지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const source = okSource();
    const result = await runAnchorCapture({ angles: ["front", "back"], source, signal: controller.signal });
    expect(source.calls).toEqual([]);
    expect(summarizeAnchorSession(result).cancelledAngles).toEqual(["front", "back"]);
  });

  it("각도별 시간 상한을 넘기면 그 각도만 timeout 으로 실패하고 출처에 취소 신호를 보낸다", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | null = null;
    const source = sourceOf((angleId, context) => {
      if (angleId === "front") {
        observedSignal = context.signal;
        return new Promise<RawAnchorFrame>(() => undefined);
      }
      return Promise.resolve(fakeRawFrame());
    });
    const pending = runAnchorCapture({ angles: ["front", "back"], source, perAngleTimeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_001);
    const result = await pending;
    expect(result.slots.front).toMatchObject({ status: "failed", errorCode: "timeout" });
    expect(observedSignal).not.toBeNull();
    expect((observedSignal as AbortSignal | null)?.aborted).toBe(true);
    expect(result.slots.back.status).toBe("done");
  });
});
