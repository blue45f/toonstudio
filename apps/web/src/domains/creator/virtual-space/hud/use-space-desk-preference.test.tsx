// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioOfficeDeskPreferenceScope } from "../office-desk-preference";
import type { StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { useSpaceDeskPreference } from "./use-space-desk-preference";

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

const scope: StudioOfficeDeskPreferenceScope = { userId: "user-1", projectId: "project-1", activeWorldScope: "world-a", authoringMode: false };
const manifest = { interactionSlots: [{ id: "desk-1" }, { id: "desk-2" }] } as unknown as StudioVirtualSpaceWorldManifest;

describe("내 자리 기억", () => {
  it("처음에는 기억한 자리가 없고, 고르면 기억하며, 같은 자리를 다시 고르면 지운다", () => {
    const { result } = renderHook(() => useSpaceDeskPreference(scope, manifest, vi.fn()));
    expect(result.current.preferredSlotId).toBeNull();
    act(() => result.current.preferDesk("desk-2"));
    expect(result.current.preferredSlotId).toBe("desk-2");
    act(() => result.current.preferDesk("desk-1"));
    expect(result.current.preferredSlotId).toBe("desk-1");
    act(() => result.current.preferDesk("desk-1"));
    expect(result.current.preferredSlotId).toBeNull();
  });

  it("기억한 자리는 새로 열어도 복원되고, 월드에 없는 자리는 무시한다", () => {
    const first = renderHook(() => useSpaceDeskPreference(scope, manifest, vi.fn()));
    act(() => first.result.current.preferDesk("desk-2"));
    first.unmount();
    expect(renderHook(() => useSpaceDeskPreference(scope, manifest, vi.fn())).result.current.preferredSlotId).toBe("desk-2");
    const otherWorld = { interactionSlots: [{ id: "desk-9" }] } as unknown as StudioVirtualSpaceWorldManifest;
    expect(renderHook(() => useSpaceDeskPreference(scope, otherWorld, vi.fn())).result.current.preferredSlotId).toBeNull();
  });

  it("저장하지 못하면 알리고 기억을 바꾸지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const onSaveFailed = vi.fn();
    const { result } = renderHook(() => useSpaceDeskPreference(scope, manifest, onSaveFailed));
    act(() => result.current.preferDesk("desk-1"));
    expect(onSaveFailed).toHaveBeenCalledOnce();
    expect(result.current.preferredSlotId).toBeNull();
  });
});
