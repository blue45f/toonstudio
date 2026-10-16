// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudioBg3dAssetRights } from "./useStudioBg3dAssetRights";

import type { StudioBg3dAssetRightsSourceResult } from "./studio-bg3d-asset-rights-source";
import type { StudioBg3dAttachmentRights } from "./studio-bg3d-scene-document-types";

type Entry = Parameters<typeof useStudioBg3dAssetRights>[0][number];

const hash = (digit: string) => `sha256:${digit.repeat(64)}` as const;
function entry(id: string, digit: string, source: Entry["source"] = "sqlite-opfs"): Entry {
  return { id, name: `소재 ${id}`, format: "glb", source, createdAt: 1, updatedAt: 2, contentHash: hash(digit), byteSize: 100 };
}

const LICENSED: StudioBg3dAttachmentRights = { status: "licensed", commercialUse: true, attributionRequired: false, licenseName: "표준 라이선스" };
function loaded(failed = { library: false, metadata: false }): StudioBg3dAssetRightsSourceResult {
  return { libraryRightsById: new Map([["m1", LICENSED]]), metadataByHash: new Map(), failed };
}

afterEach(() => cleanup());

describe("useStudioBg3dAssetRights", () => {
  it("가져온 소재가 없으면 저장소를 읽지 않고 곧바로 준비 상태다", () => {
    const load = vi.fn();
    const { result } = renderHook(() => useStudioBg3dAssetRights([entry("env", "a", "sample")], () => undefined, load));
    expect(load).not.toHaveBeenCalled();
    expect(result.current.state).toBe("ready");
    expect(result.current.views.get("env")?.origin).toBe("bundled");
  });

  it("읽는 동안은 미확인으로 보이고, 읽고 나면 라이브러리 권리가 반영된다", async () => {
    let resolve!: (value: StudioBg3dAssetRightsSourceResult) => void;
    const load = vi.fn(() => new Promise<StudioBg3dAssetRightsSourceResult>((r) => {
      resolve = r;
    }));
    const entries = [entry("m1", "b")];
    const { result } = renderHook(() => useStudioBg3dAssetRights(entries, () => undefined, load));

    expect(result.current.state).toBe("loading");
    expect(result.current.views.get("m1")?.state.license).toBe("unknown");

    await act(async () => resolve(loaded()));
    expect(result.current.state).toBe("ready");
    expect(result.current.views.get("m1")?.state.license).toBe("licensed");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("한쪽만 실패하면 partial, 둘 다 실패하거나 읽기가 던지면 error 이고 목록은 그대로다", async () => {
    const entries = [entry("m1", "b")];
    const partial = renderHook(() => useStudioBg3dAssetRights(entries, () => undefined, async () => loaded({ library: false, metadata: true })));
    await waitFor(() => expect(partial.result.current.state).toBe("partial"));
    expect(partial.result.current.views.get("m1")?.state.license).toBe("licensed");

    const thrown = renderHook(() => useStudioBg3dAssetRights(entries, () => undefined, () => Promise.reject(new Error("boom"))));
    await waitFor(() => expect(thrown.result.current.state).toBe("error"));
    expect(thrown.result.current.views.size).toBe(1);
    expect(thrown.result.current.views.get("m1")?.state.license).toBe("unknown");
  });

  it("목록이 바뀌면 다시 읽고, 읽는 동안 직전 결과를 계속 쓴다", async () => {
    const resolvers: ((value: StudioBg3dAssetRightsSourceResult) => void)[] = [];
    const load = vi.fn(() => new Promise<StudioBg3dAssetRightsSourceResult>((r) => {
      resolvers.push(r);
    }));
    const { result, rerender } = renderHook(
      ({ entries }) => useStudioBg3dAssetRights(entries, () => undefined, load),
      { initialProps: { entries: [entry("m1", "b")] } },
    );
    await act(async () => resolvers[0]?.(loaded()));
    expect(result.current.state).toBe("ready");

    rerender({ entries: [entry("m1", "b"), entry("m2", "c")] });
    expect(result.current.state).toBe("loading");
    expect(result.current.views.get("m1")?.state.license).toBe("licensed");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("언마운트하면 읽기를 취소하고 늦게 도착한 결과를 버린다", async () => {
    let signal: AbortSignal | undefined;
    let resolve!: (value: StudioBg3dAssetRightsSourceResult) => void;
    const load = vi.fn((options?: { signal?: AbortSignal }) => {
      signal = options?.signal;
      return new Promise<StudioBg3dAssetRightsSourceResult>((r) => {
        resolve = r;
      });
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useStudioBg3dAssetRights([entry("m1", "b")], () => undefined, load));
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(loaded()));
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
