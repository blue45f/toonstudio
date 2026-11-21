// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { createVirtualSpaceYjsDoc, encodeYjsUpdateBase64, useVirtualSpaceYjsDoc } from "./studio-virtual-space-yjs-doc";

const scopeId = "project-a:room-a";
const soloKey = `toonstudio:virtual-space-yjs-solo:v1:${scopeId}`;
const roomKey = `toonstudio:virtual-space-yjs:v1:${scopeId}`;
const otherKey = "toonstudio:virtual-space-yjs:v1:project-b:room-b";
const input = { scopeId, selfSessionId: "self", selfDisplayName: "작가", personal: false, signedIn: true, canEdit: true };

function roomSnapshot(themeId: string): string {
  const doc = new Y.Doc();
  doc.getMap("roomPreset").set("themeId", themeId);
  const encoded = encodeYjsUpdateBase64(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  return encoded;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("BroadcastChannel", undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("가상 공간 로컬 Yjs 작업 사본", () => {
  it("최초 대상 읽기가 실패했어도 병합 직전 정상 대상과 개인 작업을 모두 복원한다", () => {
    const originalRoom = roomSnapshot("saved-room-theme");
    const soloDoc = new Y.Doc();
    soloDoc.getMap("roomPreset").set("interiorDimmer", 0.31);
    const solo = encodeYjsUpdateBase64(Y.encodeStateAsUpdate(soloDoc));
    soloDoc.destroy();
    localStorage.setItem(roomKey, originalRoom);
    localStorage.setItem(soloKey, solo);
    const getItem = Storage.prototype.getItem;
    let firstRead = true;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === roomKey && firstRead) { firstRead = false; throw new Error("일시적 읽기 실패"); }
      return getItem.call(this, key);
    });
    const { result } = renderHook(() => useVirtualSpaceYjsDoc(input));
    expect(result.current.state.roomPreset).toBeNull();
    act(() => { expect(result.current.mergeSoloToCloud()).toBe(true); });
    const restored = createVirtualSpaceYjsDoc(localStorage.getItem(roomKey));
    expect(restored.getMap("roomPreset").get("themeId")).toBe("saved-room-theme");
    expect(restored.getMap("roomPreset").get("interiorDimmer")).toBe(0.31);
    restored.destroy();
    expect(result.current.state.roomPreset?.themeId).toBe("saved-room-theme");
    expect(result.current.state.roomPreset?.interiorDimmer).toBe(0.31);
    expect(localStorage.getItem(soloKey)).toBeNull();
  });

  it.each(["unavailable", "invalid-base64", "invalid-update"])("병합 대상의 읽기·검증 실패 때 대상과 개인 원본을 모두 보존한다: %s", (failure) => {
    const solo = roomSnapshot("solo-theme");
    const originalRoom = failure === "invalid-base64" ? "%%%broken-base64%%%"
      : failure === "invalid-update" ? encodeYjsUpdateBase64(new Uint8Array([255]))
        : roomSnapshot("saved-room-theme");
    localStorage.setItem(roomKey, originalRoom);
    localStorage.setItem(soloKey, solo);
    const { result } = renderHook(() => useVirtualSpaceYjsDoc(input));
    const getItem = Storage.prototype.getItem;
    if (failure === "unavailable") {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
        if (key === roomKey) throw new Error("대상 읽기 거부");
        return getItem.call(this, key);
      });
    }
    act(() => { expect(result.current.mergeSoloToCloud()).toBe(false); });
    expect(getItem.call(localStorage, roomKey)).toBe(originalRoom);
    expect(localStorage.getItem(soloKey)).toBe(solo);
    expect(result.current.hasPendingSoloMerge).toBe(true);
  });

  it("방별로 복원하고 병합 대상의 저장·재읽기 뒤에만 개인 원본을 제거한다", () => {
    const solo = roomSnapshot("solo-theme");
    const other = roomSnapshot("other-theme");
    localStorage.setItem(soloKey, solo);
    localStorage.setItem(otherKey, other);
    const { result, rerender } = renderHook((props) => useVirtualSpaceYjsDoc(props), { initialProps: input });
    expect(result.current.hasPendingSoloMerge).toBe(true);
    act(() => { expect(result.current.mergeSoloToCloud()).toBe(true); });
    expect(localStorage.getItem(soloKey)).toBeNull();
    expect(result.current.hasPendingSoloMerge).toBe(false);
    const restored = createVirtualSpaceYjsDoc(localStorage.getItem(roomKey));
    expect(restored.getMap("roomPreset").get("themeId")).toBe("solo-theme");
    restored.destroy();
    expect(localStorage.getItem(otherKey)).toBe(other);
    rerender({ ...input, scopeId: "project-b:room-b" });
    expect(result.current.state.roomPreset?.themeId).toBe("other-theme");
  });

  it("대상 쓰기가 거부되면 개인 원본과 재시도 상태를 보존한다", () => {
    const solo = roomSnapshot("unsaved-theme");
    localStorage.setItem(soloKey, solo);
    const { result } = renderHook(() => useVirtualSpaceYjsDoc(input));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("가득 참", "QuotaExceededError"); });
    act(() => { expect(result.current.mergeSoloToCloud()).toBe(false); });
    expect(localStorage.getItem(soloKey)).toBe(solo);
    expect(localStorage.getItem(roomKey)).toBeNull();
    expect(result.current.hasPendingSoloMerge).toBe(true);
    expect(result.current.state.roomPreset?.themeId).toBe("unsaved-theme");
  });

  it("방 전환 전에 보관한 콜백으로 다른 방 문서에 병합하지 않는다", () => {
    const solo = roomSnapshot("old-room-theme");
    const other = roomSnapshot("new-room-theme");
    localStorage.setItem(soloKey, solo);
    localStorage.setItem(otherKey, other);
    const { result, rerender } = renderHook((props) => useVirtualSpaceYjsDoc(props), { initialProps: input });
    const previousMerge = result.current.mergeSoloToCloud;
    rerender({ ...input, scopeId: "project-b:room-b" });
    act(() => { expect(previousMerge()).toBe(false); });
    expect(result.current.state.roomPreset?.themeId).toBe("new-room-theme");
    expect(localStorage.getItem(soloKey)).toBe(solo);
    expect(localStorage.getItem(otherKey)).toBe(other);
    expect(localStorage.getItem(roomKey)).toBeNull();
  });

  it("대상 저장이 조용히 누락돼도 재읽기 검증이 원본 삭제를 막는다", () => {
    const solo = roomSnapshot("retained-theme");
    localStorage.setItem(soloKey, solo);
    const { result } = renderHook(() => useVirtualSpaceYjsDoc(input));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => undefined);
    act(() => { expect(result.current.mergeSoloToCloud()).toBe(false); });
    expect(localStorage.getItem(soloKey)).toBe(solo);
    expect(result.current.hasPendingSoloMerge).toBe(true);
  });

  it("병합 도중 갱신된 개인 원본과 삭제가 거부된 원본을 보존한다", () => {
    const solo = roomSnapshot("initial-theme");
    const newer = roomSnapshot("newer-theme");
    localStorage.setItem(soloKey, solo);
    const { result } = renderHook(() => useVirtualSpaceYjsDoc(input));
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      setItem.call(this, key, value);
      if (key === roomKey) setItem.call(this, soloKey, newer);
    });
    act(() => { expect(result.current.mergeSoloToCloud()).toBe(false); });
    expect(localStorage.getItem(soloKey)).toBe(newer);
    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("삭제 거부"); });
    act(() => { expect(result.current.mergeSoloToCloud()).toBe(false); });
    expect(localStorage.getItem(soloKey)).toBe(newer);
    expect(result.current.hasPendingSoloMerge).toBe(true);
  });

  it("손상된 Yjs 원본을 빈 문서로 간주하여 소비하지 않는다", () => {
    localStorage.setItem(soloKey, "broken-yjs-update");
    const { result } = renderHook(() => useVirtualSpaceYjsDoc(input));
    act(() => { expect(result.current.mergeSoloToCloud()).toBe(false); });
    expect(localStorage.getItem(soloKey)).toBe("broken-yjs-update");
    expect(localStorage.getItem(roomKey)).toBeNull();
  });

  it.each([
    { canEdit: false }, { personal: true }, { signedIn: false },
  ])("읽기 전용 또는 개인 모드에서는 개인 원본을 소비하지 않는다: %j", (override) => {
    const solo = roomSnapshot("personal-theme");
    localStorage.setItem(soloKey, solo);
    const { result } = renderHook(() => useVirtualSpaceYjsDoc({ ...input, ...override }));
    act(() => { expect(result.current.mergeSoloToCloud()).toBe(false); });
    expect(localStorage.getItem(soloKey)).toBe(solo);
    expect(localStorage.getItem(roomKey)).toBeNull();
  });
});
