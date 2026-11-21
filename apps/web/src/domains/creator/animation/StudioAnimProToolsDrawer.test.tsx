// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyAnimationTimelineDoc } from "../studio-anim-tracks";

import { LIGHT_TABLE_STORAGE_KEY, StudioAnimProToolsDrawer } from "./StudioAnimProToolsDrawer";
import { parseAnimatedWebpSummary } from "./studio-webp-anim-muxer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  window.localStorage.clear();
});

function makeValidVp8lWebpBytes(width = 32, height = 32): Uint8Array {
  const packed = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  const vp8l = [0x2f, ...u32(packed), 0x00];
  const chunk = [0x56, 0x50, 0x38, 0x4c, ...u32(vp8l.length), ...vp8l];
  return Uint8Array.from([
    0x52, 0x49, 0x46, 0x46,
    ...u32(4 + chunk.length),
    0x57, 0x45, 0x42, 0x50,
    ...chunk,
  ]);
}

describe("StudioAnimProToolsDrawer — 실제 타임라인 반영·WebP 조립·동영상 추출·로컬 유지", () => {
  it("노출표 원문 생성 후 불러오기를 실행하면 실제 onDocChange로 타임라인 트랙과 길이를 갱신한다", () => {
    const onDocChange = vi.fn();
    const onXdtsImported = vi.fn();
    const doc = createEmptyAnimationTimelineDoc(8, 12);

    render(
      <StudioAnimProToolsDrawer
        doc={doc}
        activeTrackId="track-main"
        availableCels={[
          { id: "c1", src: "data:image/png;base64,AA==" },
          { id: "c2", src: "data:image/png;base64,BB==" },
        ]}
        onDocChange={onDocChange}
        onXdtsImported={onXdtsImported}
      />,
    );

    expect(screen.getByText("노출표 입출력 · 셀 일괄 배치")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "셀 일괄 배치" }));
    expect(onDocChange).toHaveBeenCalledTimes(1);
    const assignedDoc = onDocChange.mock.calls[0]![0];
    expect(assignedDoc.tracks["track-main"]).toHaveLength(4);

    // 변경된 타임라인을 노출표 원문으로 만들고, 다른 문서에서 다시 불러와 onDocChange 반영 확인
    cleanup();
    onDocChange.mockClear();

    render(
      <StudioAnimProToolsDrawer
        doc={assignedDoc}
        activeTrackId="track-main"
        onDocChange={onDocChange}
        onXdtsImported={onXdtsImported}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "노출표 원문 만들기" }));
    const textarea = screen.getByLabelText("노출표 원문 데이터") as HTMLTextAreaElement;
    expect(textarea.value).toContain("exchangeDigitalTimeSheet Save Data");

    fireEvent.click(screen.getByRole("button", { name: "노출표 불러와 타임라인 반영" }));
    expect(onXdtsImported).toHaveBeenCalledTimes(1);
    expect(onDocChange).toHaveBeenCalledTimes(1);
    expect(onDocChange.mock.calls[0]![0].tracks["track-main"]).toHaveLength(4);
  });

  it("라이트 테이블 상태를 localStorage에 영속화하고 속도 곡선 보간값과 카메라 경로를 실시간 계산한다", () => {
    const doc = createEmptyAnimationTimelineDoc(16, 12);

    const first = render(
      <StudioAnimProToolsDrawer
        doc={doc}
        activeTrackId="track-main"
        availableCels={[
          { id: "c1", src: "data:1" },
          { id: "c2", src: "data:2" },
        ]}
        onDocChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "어니언스킨 프레임 등록" }));
    expect(screen.getByText(/활성 참조 1개/)).toBeTruthy();
    expect(window.localStorage.getItem(LIGHT_TABLE_STORAGE_KEY)).toContain("lt-onion-c2");

    // 언마운트 후 다시 열어도 라이트 테이블 참조가 그대로 복원된다.
    first.unmount();
    render(
      <StudioAnimProToolsDrawer
        doc={doc}
        activeTrackId="track-main"
        onDocChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/활성 참조 1개/)).toBeTruthy();

    // 속도 곡선 채널 변경 및 보간 방식 변경 시 실제 평가값 갱신 확인
    fireEvent.change(screen.getByLabelText("속도 곡선 보간 방식"), {
      target: { value: "constant" },
    });
    expect(screen.getByText(/가로 위치 보간 결과: 시작 0\.00 → 중간\(8프레임\) 0\.00/)).toBeTruthy();

    // 카메라 끝 좌표 변경 시 SVG 경로 점 갱신 확인
    fireEvent.change(screen.getByLabelText("카메라 끝 가로 좌표"), {
      target: { value: "180" },
    });
    expect(screen.getByRole("img", { name: "카메라 이동 경로 미리보기" })).toBeTruthy();
  });

  it("상위 콜백 없이도 실제 움직이는 WebP 컨테이너를 조립·다운로드하고 동영상 파일 프레임을 트랙에 추출한다", async () => {
    let capturedBlob: Blob | null = null;
    vi.spyOn(URL, "createObjectURL").mockImplementation((obj: Blob | MediaSource) => {
      if (obj instanceof Blob) capturedBlob = obj;
      return "blob:toonstudio-test";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    const onDocChange = vi.fn();
    const doc = {
      ...createEmptyAnimationTimelineDoc(4, 10),
      tracks: {
        "track-main": [
          { frameIndex: 0, frame: { id: "f1", src: "data:1" } },
          { frameIndex: 2, frame: { id: "f2", src: "data:2" } },
        ],
      },
    };

    render(
      <StudioAnimProToolsDrawer
        doc={doc}
        activeTrackId="track-main"
        onDocChange={onDocChange}
        encodeFrameWebpBytes={async () => makeValidVp8lWebpBytes(32, 32)}
        createVideoDecodeAdapter={() => ({
          decodeFrameAt: async (_sec, idx) => ({
            src: `data:image/png;base64,video_${idx}`,
            width: 320,
            height: 180,
          }),
          close: vi.fn(),
        })}
      />,
    );

    // 1. 움직이는 WebP 실제 바이너리 조립 및 다운로드 검증
    fireEvent.change(screen.getByLabelText("움직이는 이미지 반복 횟수"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "움직이는 이미지 파일 저장" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("움직이는 이미지 파일(2장)을 저장했어요");
    });
    expect(capturedBlob).not.toBeNull();
    const muxedBytes = new Uint8Array(await capturedBlob!.arrayBuffer());
    const webpSummary = parseAnimatedWebpSummary(muxedBytes);
    expect(webpSummary.frameCount).toBe(2);
    expect(webpSummary.loopCount).toBe(2);
    expect(webpSummary.totalDurationMs).toBe(400);

    // 2. 동영상 파일 선택 전에는 실행 버튼이 비활성화되어 가짜 완료 메시지가 뜨지 않는다.
    const movieBtn = screen.getByRole("button", { name: "동영상 셀 불러오기 실행" }) as HTMLButtonElement;
    expect(movieBtn.disabled).toBe(true);

    // 3. 실제 동영상 파일 선택 후 프레임 추출 → onDocChange로 트랙 키프레임 반영 확인
    fireEvent.change(screen.getByLabelText("동영상 구간 종료 초"), { target: { value: "0.5" } });
    const fileInput = screen.getByLabelText("동영상 파일 선택");
    const fakeVideo = new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput, { target: { files: [fakeVideo] } });
    expect(movieBtn.disabled).toBe(false);

    fireEvent.click(movieBtn);
    await waitFor(() => {
      expect(onDocChange).toHaveBeenCalledTimes(1);
    });
    const movieUpdatedDoc = onDocChange.mock.calls[0]![0];
    expect(movieUpdatedDoc.tracks["track-main"].length).toBeGreaterThan(0);
    expect(movieUpdatedDoc.tracks["track-main"][0].frame.src).toContain("data:image/png;base64,video_");
  });

  it("허용되지 않은 파일 형식이나 비정상 리소스 스킴은 DOM 동영상 디코더에 전달하지 않고 차단한다", async () => {
    const createUrlSpy = vi.spyOn(URL, "createObjectURL");
    const revokeUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const doc = createEmptyAnimationTimelineDoc(4, 10);

    render(
      <StudioAnimProToolsDrawer
        doc={doc}
        activeTrackId="track-main"
        onDocChange={vi.fn()}
      />,
    );

    const fileInput = screen.getByLabelText("동영상 파일 선택");
    const movieBtn = screen.getByRole("button", { name: "동영상 셀 불러오기 실행" });

    const spoofedSvg = new File(["<svg onload='alert(1)'/>"], "evil.svg", { type: "image/svg+xml" });
    fireEvent.change(fileInput, { target: { files: [spoofedSvg] } });
    fireEvent.click(movieBtn);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("지원하지 않는 동영상 파일 형식입니다.");
    });
    expect(createUrlSpy).not.toHaveBeenCalled();

    createUrlSpy.mockReturnValueOnce("javascript:alert(1)");
    const validVideo = new File(["mp4-bytes"], "safe.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput, { target: { files: [validVideo] } });
    fireEvent.click(movieBtn);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("유효하지 않은 동영상 리소스 주소입니다.");
    });
    expect(revokeUrlSpy).toHaveBeenCalledWith("javascript:alert(1)");
  });
});
