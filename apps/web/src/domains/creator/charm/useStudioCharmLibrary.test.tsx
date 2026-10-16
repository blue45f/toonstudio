// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudioCharmLibrary, type StudioCharmHostLibrary } from "./useStudioCharmLibrary";

import type { StudioCharmLibraryAsset } from "./studio-charm-descriptor";

afterEach(cleanup);

function asset(id: string, name = `소재 ${id}`): StudioCharmLibraryAsset {
  return { id, name, dataUrl: "data:image/png;base64,AAAA", width: 64, height: 64 };
}

const HOST_UNREAD: StudioCharmHostLibrary = { assets: [], loaded: false, loading: false };

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("내 소재 목록 준비", () => {
  it("목록이 필요 없으면 읽지 않고 '대기' 상태로 둔다", () => {
    const loadLibrary = vi.fn(async () => [asset("a")]);
    const { result } = renderHook(() => useStudioCharmLibrary({ host: HOST_UNREAD, needed: false, loadLibrary }));
    expect(result.current).toMatchObject({ library: [], ready: false, status: "idle" });
    expect(loadLibrary).not.toHaveBeenCalled();
  });

  it("호스트가 이미 읽었다면 그 목록을 그대로 쓰고 다시 읽지 않는다", () => {
    const hostAssets = [asset("host")];
    const loadLibrary = vi.fn(async () => [asset("other")]);
    const { result } = renderHook(() => useStudioCharmLibrary({
      host: { assets: hostAssets, loaded: true, loading: false },
      needed: true,
      loadLibrary,
    }));
    expect(result.current.library).toBe(hostAssets);
    expect(result.current).toMatchObject({ ready: true, status: "ready" });
    expect(loadLibrary).not.toHaveBeenCalled();
  });

  it("호스트가 읽는 중이면 같은 보관함을 두 번 읽지 않고 기다리다가, 끝나면 호스트 목록을 쓴다", () => {
    const loadLibrary = vi.fn(async () => [asset("other")]);
    const hostAssets = [asset("host")];
    const { result, rerender } = renderHook(
      ({ host }: { host: StudioCharmHostLibrary }) => useStudioCharmLibrary({ host, needed: true, loadLibrary }),
      { initialProps: { host: { assets: [], loaded: false, loading: true } as StudioCharmHostLibrary } },
    );
    expect(result.current).toMatchObject({ library: [], ready: false, status: "loading" });
    expect(loadLibrary).not.toHaveBeenCalled();
    rerender({ host: { assets: hostAssets, loaded: true, loading: false } });
    expect(result.current.library).toBe(hostAssets);
    expect(result.current.ready).toBe(true);
    expect(loadLibrary).not.toHaveBeenCalled();
  });

  it("호스트가 아직 읽지 않았고 목록이 필요하면 읽기 전용으로 한 번만 읽는다", async () => {
    const gate = deferred<readonly StudioCharmLibraryAsset[]>();
    const loadLibrary = vi.fn(() => gate.promise);
    const { result, rerender } = renderHook(() => useStudioCharmLibrary({ host: HOST_UNREAD, needed: true, loadLibrary }));
    expect(result.current).toMatchObject({ library: [], ready: false, status: "loading" });
    rerender();
    expect(loadLibrary).toHaveBeenCalledTimes(1);
    const loaded = [asset("mine")];
    await act(async () => { gate.resolve(loaded); });
    expect(result.current.library).toBe(loaded);
    expect(result.current).toMatchObject({ ready: true, status: "ready" });
    rerender();
    expect(loadLibrary).toHaveBeenCalledTimes(1);
  });

  it("읽기에 실패하면 오류로 알리고 저절로 되풀이하지 않으며, 다시 시도하면 읽어 온다", async () => {
    const loadLibrary = vi.fn()
      .mockRejectedValueOnce(new Error("opfs unavailable"))
      .mockResolvedValueOnce([asset("mine")]);
    const { result, rerender } = renderHook(() => useStudioCharmLibrary({ host: HOST_UNREAD, needed: true, loadLibrary }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toMatchObject({ library: [], ready: false });
    rerender();
    rerender();
    expect(loadLibrary).toHaveBeenCalledTimes(1);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.library.map((item) => item.id)).toEqual(["mine"]);
    expect(loadLibrary).toHaveBeenCalledTimes(2);
  });

  it("읽는 도중 필요 없어지면 결과를 버리고, 다시 필요해지면 새로 읽는다", async () => {
    const first = deferred<readonly StudioCharmLibraryAsset[]>();
    const second = deferred<readonly StudioCharmLibraryAsset[]>();
    const loadLibrary = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ needed }: { needed: boolean }) => useStudioCharmLibrary({ host: HOST_UNREAD, needed, loadLibrary }),
      { initialProps: { needed: true } },
    );
    rerender({ needed: false });
    await act(async () => { first.resolve([asset("stale")]); });
    expect(result.current).toMatchObject({ library: [], ready: false, status: "idle" });
    rerender({ needed: true });
    expect(loadLibrary).toHaveBeenCalledTimes(2);
    await act(async () => { second.resolve([asset("fresh")]); });
    expect(result.current.library.map((item) => item.id)).toEqual(["fresh"]);
  });

  it("직접 읽은 뒤 호스트도 읽으면 호스트 목록으로 바꿔 쓴다(삭제·이름 바꾸기가 맞는다)", async () => {
    const loadLibrary = vi.fn(async () => [asset("mine", "예전 이름")]);
    const { result, rerender } = renderHook(
      ({ host }: { host: StudioCharmHostLibrary }) => useStudioCharmLibrary({ host, needed: true, loadLibrary }),
      { initialProps: { host: HOST_UNREAD } },
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.library[0]?.name).toBe("예전 이름");
    const hostAssets = [asset("mine", "새 이름")];
    rerender({ host: { assets: hostAssets, loaded: true, loading: false } });
    expect(result.current.library).toBe(hostAssets);
  });
});
