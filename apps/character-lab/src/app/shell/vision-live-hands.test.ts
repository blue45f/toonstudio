import { describe, expect, it, vi } from "vitest";

import { createDefaultRecipe, createPresetCatalog } from "../../contracts";
import { fistHandLandmarks, openHandLandmarks } from "../../domains/vision/landmark-fixtures";
import { createLabStore } from "../../state/lab-store";
import { vocabularyCatalogEntries } from "../../testing/recipe-fixtures";

import { createLiveHandsController } from "./vision-live-hands";

import type { LiveHandFrame, LiveHandsStatus } from "./vision-live-hands";
import type { Pose } from "../../contracts";
import type { HandDetection, HandDetectorPort } from "../../domains/vision/vision-ports";

const hand = (reportedHandedness: HandDetection["reportedHandedness"] = "Left", open = false): HandDetection => ({ reportedHandedness, score: 0.81, landmarks: open ? openHandLandmarks() : fistHandLandmarks(), worldLandmarks: null });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function harness(detector: HandDetectorPort, capture?: () => Promise<LiveHandFrame | null>, apply?: (pose: Pose, id: string) => void) {
  const statuses: LiveHandsStatus[] = [];
  const applied: Array<{ pose: Pose; id: string }> = [];
  const close = vi.fn();
  const queue: Array<() => void> = [];
  let clock = 0;
  const controller = createLiveHandsController({
    ensureDetector: async () => detector,
    capture: capture ?? (async () => ({ width: 640, height: 480, source: {} as ImageData, release: close })),
    schedule(next) { queue.push(next); return () => { const at = queue.indexOf(next); if (at >= 0) queue.splice(at, 1); }; },
    apply(pose, id) { applied.push({ pose, id }); apply?.(pose, id); }, status: (next) => statuses.push(next), now: () => (clock += 71),
  });
  return { controller, statuses, applied, close, queue, next: () => queue.shift()?.() };
}

describe("연속 IMAGE 손 인식", () => {
  it("실제 손 변환·셀피/거울 매핑을 쓰며 미검출/좌우 미정은 마지막 포즈를 보존한다", async () => {
    let hands: readonly HandDetection[] = [hand()];
    const h = harness({ detect: async () => hands });
    h.controller.start({ selfie: false, mirror: true });
    await vi.waitFor(() => expect(h.applied).toHaveLength(1));
    expect(Object.keys(h.applied[0]?.pose ?? {})).toHaveLength(15);
    expect(Object.keys(h.applied[0]?.pose ?? {}).every((bone) => bone.startsWith("left"))).toBe(true);
    expect(h.statuses.at(-1)).toMatchObject({ phase: "running", latencyMs: 71, appliedHands: 1 });
    hands = []; h.next();
    await vi.waitFor(() => expect(h.statuses.at(-1)?.frames).toBe(2));
    expect(h.applied).toHaveLength(1);
    expect(h.statuses.at(-1)?.messageKo).toContain("마지막 손 포즈를 유지");
    hands = [hand("Unknown")]; h.next();
    await vi.waitFor(() => expect(h.close).toHaveBeenCalledTimes(3));
    expect(h.applied).toHaveLength(1);
    h.controller.stop(); expect(h.queue).toHaveLength(0);
  });

  it("손 월드 21점을 우선 사용하고 없을 때만 이미지 좌표를 쓰며 거울 적용도 유지한다", async () => {
    const world = fistHandLandmarks().map((point) => ({ ...point, x: point.x * 0.1, y: point.y * 0.1, z: point.z * 0.1 }));
    let detection: HandDetection = { ...hand("Left", true), worldLandmarks: world };
    const h = harness({ detect: async () => [detection] });
    h.controller.start({ selfie: true, mirror: false });
    await vi.waitFor(() => expect(h.applied).toHaveLength(1));
    expect(h.applied[0]?.pose.leftIndexIntermediate?.[2]).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(h.statuses.at(-1)?.coordinateSpace).toBe("world");
    detection = { ...detection, worldLandmarks: null }; h.next();
    await vi.waitFor(() => expect(h.applied).toHaveLength(2));
    expect(h.applied[1]?.pose.leftIndexIntermediate?.[2]).toBeCloseTo(0, 5);
    expect(h.statuses.at(-1)?.coordinateSpace).toBe("image");
    h.controller.stop(); detection = { ...detection, worldLandmarks: world };
    h.controller.start({ selfie: true, mirror: true });
    await vi.waitFor(() => expect(h.applied).toHaveLength(3));
    expect(Object.keys(h.applied[2]?.pose ?? {}).every((bone) => bone.startsWith("right"))).toBe(true);
    expect(h.applied[2]?.pose.rightIndexIntermediate?.[2]).toBeCloseTo(Math.SQRT1_2, 5);
    h.controller.dispose();
  });

  it("중지·재시작 사이에도 캡처/추론은 하나만 진행하고 늦은 프레임은 해제 후 버린다", async () => {
    const pending = deferred<readonly HandDetection[]>();
    let calls = 0;
    const h = harness({ detect: async () => ++calls === 1 ? pending.promise : [hand()] });
    h.controller.start({ selfie: true, mirror: false });
    await vi.waitFor(() => expect(calls).toBe(1));
    h.controller.stop(); h.controller.start({ selfie: true, mirror: false });
    await Promise.resolve(); expect(calls).toBe(1);
    pending.resolve([hand()]);
    await vi.waitFor(() => expect(h.close).toHaveBeenCalledTimes(1));
    expect(h.applied).toHaveLength(0);
    h.next();
    await vi.waitFor(() => expect(h.applied).toHaveLength(1));
    h.controller.dispose(); expect(h.queue).toHaveLength(0);
  });

  it("언마운트 뒤 끝난 캡처도 한번 해제하고 추론·상태 반영은 하지 않는다", async () => {
    const pending = deferred<LiveHandFrame | null>();
    const close = vi.fn(); const detect = vi.fn(async () => [hand()]);
    const h = harness({ detect }, () => pending.promise);
    h.controller.start({ selfie: true, mirror: false });
    await Promise.resolve();
    h.controller.dispose();
    const statuses = h.statuses.length;
    pending.resolve({ width: 8, height: 8, source: {} as ImageData, release: close });
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(detect).not.toHaveBeenCalled(); expect(h.applied).toHaveLength(0); expect(h.statuses).toHaveLength(statuses);
  });

  it("추론 실패는 오류를 노출하고 재시도 루프를 만들지 않는다", async () => {
    const h = harness({ detect: async () => { throw new Error("WASM detect failed"); } });
    h.controller.start({ selfie: true, mirror: false });
    await vi.waitFor(() => expect(h.statuses.at(-1)?.phase).toBe("failed"));
    expect(h.statuses.at(-1)?.failure?.code).toBe("vision-live-hands-failed");
    expect(h.close).toHaveBeenCalledTimes(1); expect(h.queue).toHaveLength(0);
  });

  it("실제 store는 250ms를 넘긴 프레임도 한 세션 undo로 묶고 기존 팔·몸·반대 손을 보존한다", async () => {
    let at = 0; let open = false;
    const recipe = createDefaultRecipe();
    const existing: Pose = { hips: [0, 0.2, 0, Math.sqrt(0.96)], leftUpperArm: [0.1, 0, 0, Math.sqrt(0.99)], rightIndexProximal: [0.3, 0, 0, Math.sqrt(0.91)] };
    const store = createLabStore({ catalog: createPresetCatalog(vocabularyCatalogEntries()), initial: { recipe: { ...recipe, pose: existing } }, now: () => at });
    const h = harness({ detect: async () => [hand("Left", open)] }, undefined, (pose, id) => {
      store.dispatch({ type: "pose/set", pose: { ...store.getState().recipe.pose, ...pose }, scope: "arms-hands", labelKo: "연속 손 인식", coalesceKey: id, coalesceMode: "session" });
    });
    h.controller.start({ selfie: true, mirror: false });
    await vi.waitFor(() => expect(h.applied).toHaveLength(1));
    at = 8000; open = true; h.next();
    await vi.waitFor(() => expect(h.applied).toHaveLength(2));
    expect(store.getState().history.depth).toBe(1);
    expect(store.getState().recipe.pose).toMatchObject(existing);
    h.controller.stop(); store.dispatch({ type: "history/undo" });
    expect(store.getState().recipe.pose).toEqual(existing);
    h.controller.start({ selfie: true, mirror: false });
    await vi.waitFor(() => expect(h.applied).toHaveLength(3));
    expect(h.applied[2]?.id).not.toBe(h.applied[0]?.id);
    h.controller.dispose();
  });
});
