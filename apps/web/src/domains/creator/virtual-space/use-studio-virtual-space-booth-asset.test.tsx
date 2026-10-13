// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioProjectAudioAssetDescriptor } from "./studio-virtual-space-recording-booth";
import { useStudioVirtualSpaceBoothAsset } from "./use-studio-virtual-space-booth-asset";

const io = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("./studio-recording-booth-asset-client", () => ({
  uploadStudioRecordingBoothAsset: io.upload,
}));

const descriptor: StudioProjectAudioAssetDescriptor = {
  kind: "audio",
  projectId: "project-1",
  takeId: "take-booth-media-session-1",
  boothId: "booth-main",
  name: "녹음부스 테이크 20261006",
  mimeType: "audio/webm",
  durationSec: 42,
  recordedAtMs: 1_700_000_000_000,
  source: "recording-booth",
};

function setup() {
  const notify = vi.fn();
  const bt = (ko: string) => ko;
  const { result } = renderHook(() => useStudioVirtualSpaceBoothAsset({ bt, notify }));
  return { result, notify };
}

beforeEach(() => {
  vi.clearAllMocks();
  io.upload.mockResolvedValue({ view: { asset: { id: "asset" }, canDelete: true }, replayed: false });
});

describe("useStudioVirtualSpaceBoothAsset", () => {
  it("테이크 blob을 결정적 멱등 키로 서버 에셋에 업로드하고 성공을 알린다", async () => {
    const { result, notify } = setup();
    const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: "audio/webm" });
    let saved: boolean | undefined;
    await act(async () => { saved = await result.current.handleBoothProjectAsset(descriptor, blob); });
    expect(saved).toBe(true);
    expect(io.upload).toHaveBeenCalledTimes(1);
    expect(io.upload.mock.calls[0]?.[0]).toBe("project-1");
    expect(io.upload.mock.calls[0]?.[1]).toEqual({
      operationId: "booth-save:take-booth-media-session-1:1700000000000",
      assetId: "take-booth-media-session-1-1700000000000",
      name: "녹음부스 테이크 20261006",
      boothId: "booth-main",
      durationMs: 42_000,
    });
    expect(io.upload.mock.calls[0]?.[2]).toBe(blob);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("프로젝트 에셋에 넣었어요"), "success");
  });

  it("업로드가 실패하면 실패를 알리고 false를 돌려준다", async () => {
    io.upload.mockRejectedValue(new Error("network"));
    const { result, notify } = setup();
    const blob = new Blob([new Uint8Array([1])], { type: "audio/webm" });
    let saved: boolean | undefined;
    await act(async () => { saved = await result.current.handleBoothProjectAsset(descriptor, blob); });
    expect(saved).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("저장에 실패했어요"), "error");
    expect(notify).not.toHaveBeenCalledWith(expect.anything(), "success");
  });

  it("blob이 없으면 업로드하지 않고 실패로 알린다", async () => {
    const { result, notify } = setup();
    let saved: boolean | undefined;
    await act(async () => { saved = await result.current.handleBoothProjectAsset(descriptor, null); });
    expect(saved).toBe(false);
    expect(io.upload).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("찾을 수 없어"), "error");
  });

  it("게스트 저장 안내 콜백은 로그인 유도 문구를 띄운다", () => {
    const { result, notify } = setup();
    act(() => { result.current.requestSaveLogin(); });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("로그인하면 프로젝트에 저장"), "info");
  });
});
