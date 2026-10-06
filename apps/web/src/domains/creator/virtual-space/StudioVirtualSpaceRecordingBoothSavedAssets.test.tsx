// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceRecordingBoothSavedAssets } from "./StudioVirtualSpaceRecordingBoothSavedAssets";

const io = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), remove: vi.fn() }));
vi.mock("./studio-recording-booth-asset-client", () => ({
  listStudioRecordingBoothAssets: io.list,
  readStudioRecordingBoothAsset: io.read,
  deleteStudioRecordingBoothAsset: io.remove,
}));

const asset = { contract: "studio-recording-booth-asset-v1" as const, id: "asset-1", workId: "work", authorUserId: "actor",
  name: "녹음부스 테이크 20261006", boothId: "booth-main", durationMs: 42_000, contentType: "audio/webm" as const,
  byteLength: 640_000, sha256: "b".repeat(64), createdAt: "2026-10-06T00:00:00.000Z", deletedAt: null };
const view = { asset, canDelete: true };

beforeEach(() => {
  vi.clearAllMocks();
  io.list.mockResolvedValue({ items: [view] });
  io.read.mockResolvedValue({ ...view, signedRead: { url: "https://storage.invalid/booth", expiresAtEpochMs: Date.now() + 60_000 } });
  io.remove.mockResolvedValue({ ...view, asset: { ...asset, deletedAt: "2026-10-06T01:00:00.000Z" }, replayed: false });
});

describe("StudioVirtualSpaceRecordingBoothSavedAssets", () => {
  it("서버에 저장된 테이크를 목록으로 보여준다", async () => {
    render(<StudioVirtualSpaceRecordingBoothSavedAssets workId="work" refreshKey={0} />);
    expect(await screen.findByText(/녹음부스 테이크 20261006/)).toBeTruthy();
    expect(io.list).toHaveBeenCalledWith("work");
  });

  it("저장된 테이크가 없으면 빈 상태를 정직하게 알린다", async () => {
    io.list.mockResolvedValue({ items: [] });
    render(<StudioVirtualSpaceRecordingBoothSavedAssets workId="work" refreshKey={0} />);
    expect(await screen.findByText(/아직 프로젝트에 저장된 테이크가 없어요/)).toBeTruthy();
  });

  it("불러오기 실패를 빈 목록으로 위장하지 않고 재시도를 제공한다", async () => {
    io.list.mockRejectedValueOnce(new Error("network"));
    render(<StudioVirtualSpaceRecordingBoothSavedAssets workId="work" refreshKey={0} />);
    expect(await screen.findByText(/불러오지 못했어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText(/녹음부스 테이크 20261006/)).toBeTruthy();
    expect(io.list).toHaveBeenCalledTimes(2);
  });

  it("재생을 누르면 서명 URL로 오디오를 띄운다", async () => {
    render(<StudioVirtualSpaceRecordingBoothSavedAssets workId="work" refreshKey={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /재생/ }));
    expect(io.read).toHaveBeenCalledWith("work", "asset-1");
    const audio = await screen.findByLabelText("녹음부스 테이크 20261006");
    expect((audio as HTMLAudioElement).src).toBe("https://storage.invalid/booth");
  });

  it("삭제하면 목록에서 사라지고, 실패하면 항목이 남는다", async () => {
    render(<StudioVirtualSpaceRecordingBoothSavedAssets workId="work" refreshKey={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /삭제/ }));
    expect(await screen.findByText(/아직 프로젝트에 저장된 테이크가 없어요/)).toBeTruthy();
    expect(io.remove).toHaveBeenCalledWith("work", "asset-1", expect.objectContaining({ expectedSha256: asset.sha256 }));

    io.list.mockResolvedValue({ items: [view] });
    io.remove.mockRejectedValue(new Error("network"));
    render(<StudioVirtualSpaceRecordingBoothSavedAssets workId="work" refreshKey={1} />);
    fireEvent.click(await screen.findByRole("button", { name: /삭제/ }));
    expect(await screen.findByText(/삭제하지 못했어요/)).toBeTruthy();
    expect(screen.getByText(/녹음부스 테이크 20261006/)).toBeTruthy();
  });

  it("refreshKey가 바뀌면 목록을 다시 읽는다", async () => {
    const { rerender } = render(<StudioVirtualSpaceRecordingBoothSavedAssets workId="work" refreshKey={0} />);
    await screen.findByText(/녹음부스 테이크 20261006/);
    io.list.mockResolvedValue({ items: [view, { ...view, asset: { ...asset, id: "asset-2", name: "녹음부스 테이크 20261007" } }] });
    rerender(<StudioVirtualSpaceRecordingBoothSavedAssets workId="work" refreshKey={1} />);
    expect(await screen.findByText(/녹음부스 테이크 20261007/)).toBeTruthy();
    expect(io.list).toHaveBeenCalledTimes(2);
  });
});
