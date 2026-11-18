// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StudioVirtualSpaceBotRecorder } from "./StudioVirtualSpaceBotRecorder";
import { startWorkspaceVideoCapture } from "./studio-workspace-video-capture";
import { listWorkspaceVideos, readWorkspaceVideo, saveWorkspaceVideo } from "./studio-workspace-video-library";
import { downloadBlob } from "../export/studio-export";

vi.mock("./studio-workspace-video-capture", () => ({ startWorkspaceVideoCapture: vi.fn() }));
vi.mock("./studio-workspace-video-library", () => ({
  listWorkspaceVideos: vi.fn(), readWorkspaceVideo: vi.fn(), saveWorkspaceVideo: vi.fn(), removeWorkspaceVideo: vi.fn(),
}));
vi.mock("../export/studio-export", () => ({ downloadBlob: vi.fn() }));

const zones = [{ id: "zone:meeting", name: "회의실" }, { id: "zone:review", name: "검수실" }];
const video = new Blob(["encoded video"], { type: "video/webm" });
const pause = vi.fn(), resume = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listWorkspaceVideos).mockResolvedValue([]);
  vi.mocked(readWorkspaceVideo).mockResolvedValue(video);
  vi.mocked(saveWorkspaceVideo).mockResolvedValue("saved");
  vi.mocked(startWorkspaceVideoCapture).mockImplementation(async (_source, _canvas, _quality, finish) => ({
    pause, resume, stop: () => finish(video), discard: vi.fn(),
  }));
});
afterEach(cleanup);

async function start() {
  fireEvent.click(screen.getByRole("button", { name: "녹화 시작" }));
  await screen.findByText("녹화 중");
}

describe("작업 화면 녹화", () => {
  it("선택한 구역에서 정지와 재개를 실제 인코더에 전달하고 녹화 파일을 내려받는다", async () => {
    const assetize = vi.fn();
    render(<MemoryRouter initialEntries={["/studio/bg3d?room=work-local"]}><StudioVirtualSpaceBotRecorder zones={zones} onAssetize={assetize} /></MemoryRouter>);
    expect(screen.getByText(/아직 녹화물이 없습니다/u)).toBeTruthy();
    const zone = screen.getByRole("combobox", { name: "기록할 구역" }) as HTMLSelectElement;
    fireEvent.change(zone, { target: { value: "zone:review" } });
    await start();
    expect(zone.disabled).toBe(true);
    expect((screen.getByRole("combobox", { name: "녹화 품질" }) as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(pause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "다시 녹화" }));
    expect(resume).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "녹화 중지" }));
    fireEvent.click(await screen.findByRole("button", { name: "다운로드" }));
    expect(saveWorkspaceVideo).toHaveBeenCalledWith(expect.objectContaining({ scope: JSON.stringify([null, "work-local"]) }), video);
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(video, expect.stringMatching(/검수실.*\.webm$/u)));
    fireEvent.click(screen.getByRole("button", { name: "에셋으로 편입" }));
    expect(assetize).toHaveBeenCalledWith(expect.objectContaining({ zoneId: "zone:review" }));
  });
  it("입력 거절 시 완료된 영상을 만들지 않고 다시 시작할 수 있다", async () => {
    vi.mocked(startWorkspaceVideoCapture).mockRejectedValueOnce(new DOMException("cancelled", "NotAllowedError"));
    render(<MemoryRouter><StudioVirtualSpaceBotRecorder zones={zones} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "녹화 시작" }));
    await screen.findByText(/화면 공유가 시작되지 않았습니다/u);
    expect(saveWorkspaceVideo).not.toHaveBeenCalled();
    await start();
  });
  it("DB 저장이 실패하면 현재 세션의 원본 파일을 내려받을 수 있다", async () => {
    vi.mocked(saveWorkspaceVideo).mockRejectedValueOnce(new DOMException("quota", "QuotaExceededError"));
    render(<MemoryRouter><StudioVirtualSpaceBotRecorder zones={zones} /></MemoryRouter>);
    await start();
    fireEvent.click(screen.getByRole("button", { name: "녹화 중지" }));
    await screen.findByText(/기기 저장 공간을 확인/u);
    fireEvent.click(screen.getByRole("button", { name: "다운로드" }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
    expect(readWorkspaceVideo).not.toHaveBeenCalled();
  });
});
