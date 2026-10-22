// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ART_DIRECTOR_MAX_FILE_BYTES, type ArtDirectorBitmap, type ArtDirectorImageDeps } from "./claude-art-director-image";
import { useArtDirectorImage } from "./use-art-director-image";

function pngFile(width: number, height: number): Blob {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new Blob([bytes], { type: "image/png" });
}

interface Harness {
  readonly deps: ArtDirectorImageDeps;
  readonly bitmaps: Array<ArtDirectorBitmap & { close: ReturnType<typeof vi.fn> }>;
  readonly revoked: string[];
  /** 다음 디코드를 직접 풀어 줄 때까지 붙잡아 둔다. */
  hold(): { release(): void };
}

function harness(size = { width: 800, height: 1_000 }): Harness {
  const bitmaps: Harness["bitmaps"] = [];
  const revoked: string[] = [];
  let urlCounter = 0;
  let gate: Promise<void> | null = null;
  const deps: ArtDirectorImageDeps = {
    async decode() {
      if (gate) await gate;
      const bitmap = { ...size, source: {}, close: vi.fn() };
      bitmaps.push(bitmap);
      return bitmap;
    },
    encode: async () => new Blob([new Uint8Array(100)]),
    toBase64: async () => "QUJD",
    createObjectUrl: () => `blob:preview-${++urlCounter}`,
    revokeObjectUrl: (url) => { revoked.push(url); },
  };
  return {
    deps,
    bitmaps,
    revoked,
    hold() {
      let release = () => undefined;
      gate = new Promise<void>((resolve) => {
        release = () => { gate = null; resolve(); };
      });
      return { release };
    },
  };
}

describe("useArtDirectorImage", () => {
  afterEach(cleanup);

  it("파일을 올리면 첫 구간까지 그려 두고 변경을 알린다", async () => {
    const env = harness();
    const onSourceChange = vi.fn();
    const { result } = renderHook(() => useArtDirectorImage({ deps: env.deps, onSourceChange }));

    await act(async () => { await result.current.load(pngFile(800, 1_000)); });

    expect(result.current.source?.width).toBe(800);
    expect(result.current.rendered?.previewUrl).toBe("blob:preview-1");
    expect(result.current.segmentIndex).toBe(0);
    expect(result.current.errorCode).toBeNull();
    expect(result.current.preparing).toBe(false);
    expect(onSourceChange).toHaveBeenCalledTimes(1);
  });

  it("실패하면 이유 코드를 남기고 이미지를 비운 채로 둔다", async () => {
    const env = harness();
    const { result } = renderHook(() => useArtDirectorImage({ deps: env.deps }));

    await act(async () => {
      await result.current.load(new Blob([new Uint8Array(ART_DIRECTOR_MAX_FILE_BYTES + 1)]));
    });
    expect(result.current.errorCode).toBe("too-large");
    expect(result.current.source).toBeNull();

    await act(async () => { await result.current.load(new Blob([new TextEncoder().encode("hello, this is not an image")])); });
    expect(result.current.errorCode).toBe("invalid-type");
  });

  it("새 파일로 바꾸면 이전 비트맵과 미리보기 주소를 해제한다", async () => {
    const env = harness();
    const { result } = renderHook(() => useArtDirectorImage({ deps: env.deps }));
    await act(async () => { await result.current.load(pngFile(800, 1_000)); });
    const first = env.bitmaps[0];

    await act(async () => { await result.current.load(pngFile(640, 900)); });

    expect(first?.close).toHaveBeenCalledTimes(1);
    expect(env.revoked).toEqual(["blob:preview-1"]);
    expect(result.current.rendered?.previewUrl).toBe("blob:preview-2");
  });

  it("실패한 새 파일은 이전에 올린 이미지를 건드리지 않는다", async () => {
    const env = harness();
    const { result } = renderHook(() => useArtDirectorImage({ deps: env.deps }));
    await act(async () => { await result.current.load(pngFile(800, 1_000)); });

    await act(async () => { await result.current.load(new Blob([new Uint8Array(ART_DIRECTOR_MAX_FILE_BYTES + 1)])); });

    expect(result.current.errorCode).toBe("too-large");
    expect(result.current.source).not.toBeNull();
    expect(env.bitmaps[0]?.close).not.toHaveBeenCalled();
  });

  it("연달아 올리면 마지막 파일만 반영하고 먼저 끝난 자원은 바로 해제한다", async () => {
    const env = harness();
    const { result } = renderHook(() => useArtDirectorImage({ deps: env.deps }));
    const gate = env.hold();

    let slow: Promise<void> = Promise.resolve();
    act(() => { slow = result.current.load(pngFile(800, 1_000)); });
    gate.release();
    await act(async () => { await result.current.load(pngFile(500, 700)); });
    await act(async () => { await slow; });

    expect(result.current.source?.width).toBe(800);
    // 두 디코드가 모두 끝났지만 화면에 남은 것은 하나뿐이어야 한다.
    const closed = env.bitmaps.filter((bitmap) => bitmap.close.mock.calls.length > 0);
    expect(closed).toHaveLength(env.bitmaps.length - 1);
  });

  it("구간을 옮기면 이전 구간의 미리보기만 해제하고 같은 구간이면 아무것도 하지 않는다", async () => {
    const env = harness({ width: 1_000, height: 6_000 });
    const { result } = renderHook(() => useArtDirectorImage({ deps: env.deps }));
    await act(async () => { await result.current.load(pngFile(1_000, 6_000)); });
    expect(result.current.source?.segments.length).toBeGreaterThan(1);

    await act(async () => { await result.current.select(0); });
    expect(env.revoked).toEqual([]);

    await act(async () => { await result.current.select(1); });
    expect(result.current.segmentIndex).toBe(1);
    expect(result.current.rendered?.segment.index).toBe(1);
    expect(env.revoked).toEqual(["blob:preview-1"]);
    expect(env.bitmaps[0]?.close).not.toHaveBeenCalled();
  });

  it("지우면 모두 해제하고 변경을 알린다", async () => {
    const env = harness();
    const onSourceChange = vi.fn();
    const { result } = renderHook(() => useArtDirectorImage({ deps: env.deps, onSourceChange }));
    await act(async () => { await result.current.load(pngFile(800, 1_000)); });
    onSourceChange.mockClear();

    act(() => { result.current.clear(); });

    expect(result.current.source).toBeNull();
    expect(result.current.rendered).toBeNull();
    expect(env.bitmaps[0]?.close).toHaveBeenCalledTimes(1);
    expect(env.revoked).toEqual(["blob:preview-1"]);
    expect(onSourceChange).toHaveBeenCalledTimes(1);
  });

  it("화면이 사라지면 비트맵과 미리보기 주소를 해제한다", async () => {
    const env = harness();
    const { result, unmount } = renderHook(() => useArtDirectorImage({ deps: env.deps }));
    await act(async () => { await result.current.load(pngFile(800, 1_000)); });

    unmount();

    await waitFor(() => { expect(env.bitmaps[0]?.close).toHaveBeenCalledTimes(1); });
    expect(env.revoked).toEqual(["blob:preview-1"]);
  });

  it("준비 중에 화면이 사라져도 늦게 끝난 자원을 남기지 않는다", async () => {
    const env = harness();
    const { result, unmount } = renderHook(() => useArtDirectorImage({ deps: env.deps }));
    const gate = env.hold();

    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = result.current.load(pngFile(800, 1_000)); });
    unmount();
    gate.release();
    await pending;

    expect(env.bitmaps).toHaveLength(1);
    expect(env.bitmaps[0]?.close).toHaveBeenCalledTimes(1);
    expect(env.revoked).toEqual(["blob:preview-1"]);
  });
});
