// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, ALL_UNAVAILABLE_CAPABILITIES, createPresetCatalog } from "../../../contracts";
import { fistHandLandmarks, openHandLandmarks } from "../../../domains/vision/landmark-fixtures";
import { createLabStore } from "../../../state/lab-store";
import { MockLabProvider } from "../../../testing/mock-store";
import { vocabularyCatalogEntries } from "../../../testing/recipe-fixtures";

import { VisionPanel } from "./VisionPanel";

import type { VisionPanelDeps } from "./VisionPanel";
import type { PaintUndoToken, SlotCapabilityMap } from "../../../contracts";
import type { HandDetection, HandDetectorPort } from "../../../domains/vision/vision-ports";

const hand = (open = false): HandDetection => ({ reportedHandedness: "Left", score: 0.87, landmarks: open ? openHandLandmarks() : fistHandLandmarks(), worldLandmarks: null });
const paintToken = (): PaintUndoToken => ({ part: "skin", tiles: [{ x: 0, y: 0, data: new Uint8ClampedArray(64 * 64 * 4) }], tileSize: 64 });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function setup(port: HandDetectorPort, opening?: (stream: MediaStream) => Promise<MediaStream>, capabilities: SlotCapabilityMap = ALL_AVAILABLE_CAPABILITIES, historyLimit = 200) {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const frames = new Map<number, FrameRequestCallback>(); let sequence = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++sequence; frames.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const track = new EventTarget(); const stop = vi.fn();
  const stream = { getTracks: () => [Object.assign(track, { stop })] } as unknown as MediaStream;
  const close = vi.fn(); const photoSourceClose = vi.fn(); const photoPreviewClose = vi.fn(); const dispose = vi.fn(); const openCamera = vi.fn(async () => opening ? opening(stream) : stream);
  const model = { key: "handLandmarker" as const, port, observedSha256: "ab".repeat(32), pinned: true, bytes: 10, license: "Apache-2.0", delegate: "CPU" as const, dispose };
  const deps: VisionPanelDeps = {
    createLoaders: async () => ({ handLandmarker: async () => model, poseLandmarker: async () => { throw new Error("body model must not load"); }, imageEmbedder: async () => { throw new Error("embedder must not load"); } }),
    decodeImage: async () => ({ width: 8, height: 8, source: {} as ImageData, rgba: new Uint8ClampedArray(256), previewUrl: null, label: "photo", releaseSource: photoSourceClose, releasePreview: photoPreviewClose }),
    rasterToImage: () => ({} as ImageData), openCamera,
    captureHandsFrame: async () => ({ width: 8, height: 8, source: {} as ImageData, release: close }),
  };
  const catalog = createPresetCatalog(vocabularyCatalogEntries());
  const store = createLabStore({ catalog, initial: { capabilities }, history: { limit: historyLimit } });
  const view = render(<MockLabProvider catalog={catalog} store={store}><VisionPanel deps={deps} /></MockLabProvider>);
  const start = async () => {
    fireEvent.click(screen.getByRole("radio", { name: "손 포즈" }));
    fireEvent.click(screen.getByRole("button", { name: "카메라 열기" }));
    await screen.findByLabelText("카메라 미리보기");
    fireEvent.click(screen.getByRole("button", { name: "손 연속 인식 시작" }));
  };
  const next = () => act(() => { const first = frames.entries().next().value as [number, FrameRequestCallback] | undefined; if (first) { frames.delete(first[0]); first[1](1); } });
  return { ...view, store, stop, close, photoSourceClose, photoPreviewClose, dispose, track, stream, start, next, openCamera };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("명시 클릭 전 카메라·추론을 실행하지 않고 연속 적용을 한 단계로 묶으며 undo가 즉시 추적·카메라를 중지한다", async () => {
  let open = false;
  const detect = vi.fn(async () => [hand(open)]);
  const h = setup({ detect });
  expect(h.openCamera).not.toHaveBeenCalled(); expect(detect).not.toHaveBeenCalled();
  await h.start();
  await waitFor(() => expect(h.store.getState().history.depth).toBe(1));
  const pose = h.store.getState().recipe.pose;
  expect(Object.keys(pose)).toHaveLength(15);
  expect(Object.keys(pose).every((name) => name.startsWith("right"))).toBe(true);
  expect(h.store.getPlan().boneRotations).toMatchObject(pose);
  open = true; h.next();
  await waitFor(() => expect(detect).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(h.close).toHaveBeenCalledTimes(2));
  expect(h.store.getState().history.depth).toBe(1);
  act(() => h.store.dispatch({ type: "history/undo" }));
  expect(h.store.getState().recipe.pose).toEqual({}); expect(h.stop).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("live-hands-status").textContent).toContain("중지");
  h.next(); expect(detect).toHaveBeenCalledTimes(2);
});

it("외부 페인트가 레시피 revision을 유지해도 추적과 카메라를 중지하고 손 세션을 한 단계로 보존한다", async () => {
  const detect = vi.fn(async () => [hand()]);
  const h = setup({ detect }); await h.start();
  await waitFor(() => expect(h.store.getState().history.depth).toBe(1));
  const pose = h.store.getState().recipe.pose;
  const revision = h.store.getState().history.revision;
  act(() => h.store.dispatch({ type: "paint/stroke", undoToken: paintToken() }));
  expect(h.store.getState().history.revision).toBe(revision);
  expect(h.stop).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("live-hands-status").textContent).toContain("다른 편집");
  h.next(); expect(detect).toHaveBeenCalledTimes(1);
  expect(h.store.getState().history.depth).toBe(2);
  act(() => h.store.dispatch({ type: "history/undo" }));
  expect(h.store.getState().recipe.pose).toEqual(pose);
  act(() => h.store.dispatch({ type: "history/undo" }));
  expect(h.store.getState().recipe.pose).toEqual({});
});

it("히스토리 상한에서 페인트가 깊이·revision을 유지해도 외부 편집을 감지한다", async () => {
  const detect = vi.fn(async () => [hand()]);
  const h = setup({ detect }, undefined, ALL_AVAILABLE_CAPABILITIES, 2);
  act(() => {
    h.store.dispatch({ type: "paint/stroke", undoToken: paintToken() });
    h.store.dispatch({ type: "paint/stroke", undoToken: paintToken() });
  });
  await h.start(); await waitFor(() => expect(detect).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(h.close).toHaveBeenCalledTimes(1));
  const before = h.store.getState().history;
  act(() => h.store.dispatch({ type: "paint/stroke", undoToken: paintToken() }));
  expect(h.store.getState().history.depth).toBe(before.depth);
  expect(h.store.getState().history.revision).toBe(before.revision);
  expect(h.stop).toHaveBeenCalledTimes(1);
  h.next(); expect(detect).toHaveBeenCalledTimes(1);
});

it.each(["undo", "redo"] as const)("외부 페인트 %s도 revision 변경 없이 대기 중 추론을 폐기하고 카메라를 닫는다", async (direction) => {
  const pending = deferred<readonly HandDetection[]>();
  const detect = vi.fn(() => pending.promise);
  const h = setup({ detect });
  act(() => {
    h.store.dispatch({ type: "paint/stroke", undoToken: paintToken() });
    if (direction === "redo") h.store.dispatch({ type: "history/undo" });
  });
  await h.start(); await waitFor(() => expect(detect).toHaveBeenCalledTimes(1));
  const revision = h.store.getState().history.revision;
  act(() => h.store.dispatch({ type: direction === "undo" ? "history/undo" : "history/redo" }));
  expect(h.store.getState().history.revision).toBe(revision);
  expect(h.stop).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve([hand()]));
  await waitFor(() => expect(h.close).toHaveBeenCalledTimes(1));
  expect(h.store.getState().recipe.pose).toEqual({});
  expect(h.store.getState().failures).toEqual([]);
  h.next(); expect(detect).toHaveBeenCalledTimes(1);
});

it("손 본을 지원하지 않는 모델은 사유와 함께 연속 적용을 막고 빈 플랜을 적용 성공으로 세지 않는다", async () => {
  const detect = vi.fn(async () => [hand()]);
  const h = setup({ detect }, undefined, ALL_UNAVAILABLE_CAPABILITIES);
  await h.start();
  expect((screen.getByRole("button", { name: "손 연속 인식 시작" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("note").textContent).toContain("손가락 포즈 변형을 지원하지 않습니다");
  expect(detect).not.toHaveBeenCalled();
  expect(h.store.getState().history.depth).toBe(0);
  expect(h.store.getState().recipe.pose).toEqual({});
  expect(h.store.getPlan().boneRotations).toEqual({});
});

it("인식 중 손 지원 능력을 잃으면 카메라를 닫고 진행 중인 검출 결과를 폐기한다", async () => {
  const pending = deferred<readonly HandDetection[]>();
  const detect = vi.fn(() => pending.promise);
  const h = setup({ detect }); await h.start();
  await waitFor(() => expect(detect).toHaveBeenCalledTimes(1));
  act(() => h.store.applyEvent({ type: "source/capabilities", capabilities: ALL_UNAVAILABLE_CAPABILITIES }));
  expect(h.stop).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve([hand()]));
  await waitFor(() => expect(h.close).toHaveBeenCalledTimes(1));
  expect(h.store.getState().history.depth).toBe(0);
  expect(h.store.getState().recipe.pose).toEqual({});
  expect(h.store.getState().failures).toEqual([]);
  expect(screen.getByTestId("live-hands-status").textContent).toContain("지원하지 않아 인식을 중지");
});

it.each(["target", "photo", "ended", "unmount", "stop", "delegate"])("%s 전환 뒤 늦은 손 추론을 폐기하고 비트맵·스트림·모델 소유권을 지킨다", async (reason) => {
  const pending = deferred<readonly HandDetection[]>();
  const detect = vi.fn(() => pending.promise);
  const h = setup({ detect }); await h.start();
  await waitFor(() => expect(detect).toHaveBeenCalledTimes(1));
  if (reason === "target") fireEvent.click(screen.getByRole("radio", { name: "전신 포즈" }));
  if (reason === "photo") fireEvent.change(screen.getByLabelText("포즈 사진 파일"), { target: { files: [new File(["x"], "pose.png")] } });
  if (reason === "ended") act(() => { h.track.dispatchEvent(new Event("ended")); });
  if (reason === "unmount") h.unmount();
  if (reason === "stop") fireEvent.click(screen.getByRole("button", { name: "손 연속 인식 중지" }));
  if (reason === "delegate") fireEvent.change(screen.getByLabelText(/델리게이트/u), { target: { value: "GPU" } });
  await act(async () => { pending.resolve([hand()]); });
  await waitFor(() => expect(h.close).toHaveBeenCalledTimes(1));
  expect(h.store.getState().recipe.pose).toEqual({});
  expect(h.stop).toHaveBeenCalledTimes(1);
  if (reason === "unmount" || reason === "delegate") expect(h.dispose).toHaveBeenCalledTimes(1);
  else { expect(h.dispose).not.toHaveBeenCalled(); h.unmount(); expect(h.dispose).toHaveBeenCalledTimes(1); }
});

it("추론 실패 사유를 유지하며 카메라를 닫고 자동 반복하지 않는다", async () => {
  const detect = vi.fn(async () => { throw new Error("actual detector error"); });
  const h = setup({ detect }); await h.start();
  await waitFor(() => expect(screen.getByTestId("live-hands-status").textContent).toContain("vision-live-hands-failed"));
  expect(h.stop).toHaveBeenCalledTimes(1);
  h.next(); expect(detect).toHaveBeenCalledTimes(1);
});

it("권한 요청 중 언마운트되면 나중에 열린 스트림을 즉시 닫는다", async () => {
  const pending = deferred<MediaStream>(); const detect = vi.fn(async () => []);
  const h = setup({ detect }, () => pending.promise);
  fireEvent.click(screen.getByRole("button", { name: "카메라 열기" }));
  h.unmount();
  await act(async () => { pending.resolve(h.stream); });
  expect(h.stop).toHaveBeenCalledTimes(1);
  expect(detect).not.toHaveBeenCalled(); expect(h.dispose).not.toHaveBeenCalled();
});

it.each(["result", "error"])("모델 교체 뒤 늦은 사진 %s는 UI·전역 실패를 바꾸지 않고 비트맵을 한번 해제한다", async (kind) => {
  let resolve!: (value: readonly HandDetection[]) => void;
  let reject!: (error: unknown) => void;
  const pending = new Promise<readonly HandDetection[]>((done, fail) => { resolve = done; reject = fail; });
  const detect = vi.fn(() => pending);
  const h = setup({ detect });
  fireEvent.click(screen.getByRole("radio", { name: "손 포즈" }));
  fireEvent.change(screen.getByLabelText("포즈 사진 파일"), { target: { files: [new File(["x"], "late.png")] } });
  await waitFor(() => expect(detect).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText(/델리게이트/u), { target: { value: "GPU" } });
  await act(async () => { if (kind === "result") resolve([hand()]); else reject(new Error("late model closed")); });
  await waitFor(() => expect(h.photoSourceClose).toHaveBeenCalledTimes(1));
  expect(h.photoPreviewClose).toHaveBeenCalledTimes(1);
  expect(h.store.getState().failures).toEqual([]);
  expect(screen.queryByRole("button", { name: /손 포즈 적용/u })).toBeNull();
  expect(h.openCamera).not.toHaveBeenCalled();
  h.unmount(); expect(h.photoSourceClose).toHaveBeenCalledTimes(1); expect(h.photoPreviewClose).toHaveBeenCalledTimes(1);
});
