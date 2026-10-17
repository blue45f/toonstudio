// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { notifyStudioBg3dAssetRightsChanged } from "./studio-bg3d-asset-rights-refresh";
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

  it("라이브러리를 못 읽은 결과는 소재별 읽기 실패로 표시하고, 다시 읽는 동안에는 직전 실패를 소재에 알리지 않는다", async () => {
    const resolvers: ((value: StudioBg3dAssetRightsSourceResult) => void)[] = [];
    const load = vi.fn(() => new Promise<StudioBg3dAssetRightsSourceResult>((r) => {
      resolvers.push(r);
    }));
    const { result, rerender } = renderHook(
      ({ entries }) => useStudioBg3dAssetRights(entries, () => undefined, load),
      { initialProps: { entries: [entry("m1", "b")] } },
    );
    // 읽는 중에는 아직 실패한 것이 없다.
    expect(result.current.views.get("m1")?.readFailed).toBe(false);

    await act(async () => resolvers[0]?.({ libraryRightsById: new Map(), metadataByHash: new Map(), failed: { library: true, metadata: false } }));
    expect(result.current.state).toBe("partial");
    expect(result.current.views.get("m1")?.readFailed).toBe(true);

    // 목록이 바뀌어 다시 읽는 동안: 직전 값은 쓰되, 직전 읽기의 실패는 지금 목록에 대한 것이 아니다.
    rerender({ entries: [entry("m1", "b"), entry("m2", "c")] });
    expect(result.current.state).toBe("loading");
    expect(result.current.views.get("m1")?.readFailed).toBe(false);

    await act(async () => resolvers[1]?.(loaded()));
    expect(result.current.state).toBe("ready");
    expect(result.current.views.get("m1")?.readFailed).toBe(false);
    // 라이브러리 기록이 없는 m2 는 읽기에 실패한 것이 아니라 기록이 없을 뿐이다.
    expect(result.current.views.get("m2")?.readFailed).toBe(false);
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

  it("권리 기록이 새로 저장되면 목록이 같아도 다시 읽고, 읽는 동안 직전 결과를 계속 쓴다", async () => {
    const resolvers: ((value: StudioBg3dAssetRightsSourceResult) => void)[] = [];
    const load = vi.fn(() => new Promise<StudioBg3dAssetRightsSourceResult>((r) => {
      resolvers.push(r);
    }));
    const entries = [entry("m1", "b")];
    const { result } = renderHook(() => useStudioBg3dAssetRights(entries, () => undefined, load));
    await act(async () => resolvers[0]?.(loaded()));
    expect(result.current.state).toBe("ready");
    expect(load).toHaveBeenCalledTimes(1);

    // 가져오기 직후 AI 사용 표기가 늦게 저장된 상황: 같은 항목이지만 새 기록을 읽어야 한다.
    act(() => notifyStudioBg3dAssetRightsChanged());
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("ready");
    expect(result.current.views.get("m1")?.state.license).toBe("licensed");

    const withAi: StudioBg3dAssetRightsSourceResult = {
      libraryRightsById: new Map([["m1", LICENSED]]),
      metadataByHash: new Map([[hash("b"), {
        version: 3,
        contentHash: hash("b"),
        name: "소재 m1",
        format: "glb",
        createdAt: 1,
        updatedAt: 2,
        byteSize: 100,
        triangles: null,
        textures: null,
        favorite: false,
        collections: [],
        tags: [],
        rights: { status: "licensed", commercialUse: true, teamShareAllowed: false, license: "표준 라이선스", aiGenerated: "yes" },
      }]]),
      failed: { library: false, metadata: false },
    };
    await act(async () => resolvers[1]?.(withAi));
    expect(result.current.views.get("m1")?.state.aiGenerated).toBe("yes");
  });

  it("언마운트한 뒤의 저장 알림은 다시 읽지 않는다", () => {
    const load = vi.fn(() => new Promise<StudioBg3dAssetRightsSourceResult>(() => undefined));
    const { unmount } = renderHook(() => useStudioBg3dAssetRights([entry("m1", "b")], () => undefined, load));
    expect(load).toHaveBeenCalledTimes(1);
    unmount();
    notifyStudioBg3dAssetRightsChanged();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
