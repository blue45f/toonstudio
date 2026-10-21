// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReviewVoiceCommentaryPanel } from "./ReviewVoiceCommentaryPanel";
import type { VoiceCommentaryTrack } from "./review-voice-commentary-model";

function track(overrides: Partial<VoiceCommentaryTrack> = {}): VoiceCommentaryTrack {
  return {
    version: 1,
    id: "voice-1",
    episodeId: "episode-1",
    authorId: "user-1",
    authorName: "유나",
    createdAt: "2026-10-01T00:00:00.000Z",
    durationMs: 65_000,
    audio: { kind: "server", url: "https://example.test/voice-1.webm", mimeType: "audio/webm", byteSize: 1024 },
    keyframes: [],
    pinThreadIds: [],
    ...overrides,
  };
}

describe("ReviewVoiceCommentaryPanel 자막 트랙", () => {
  afterEach(cleanup);

  it("전사가 없는 해설 오디오에는 해설자를 알리는 자막 트랙이 달린다", () => {
    const { container } = render(
      <ReviewVoiceCommentaryPanel episodeId="episode-1" tracks={[track()]} authorName="나" readOnly />,
    );

    const caption = container.querySelector("audio > track");
    expect(caption).not.toBeNull();
    expect(caption?.getAttribute("kind")).toBe("captions");
    expect(caption?.getAttribute("srclang")).toBe("ko");
    expect(caption?.hasAttribute("default")).toBe(true);

    const src = caption?.getAttribute("src") ?? "";
    expect(src.startsWith("data:text/vtt")).toBe(true);
    const vtt = decodeURIComponent(src.slice(src.indexOf(",") + 1));
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    // 말한 내용을 지어내지 않고 누구의 해설인지만 해설 길이(65초)만큼 보여 준다.
    expect(vtt).toContain("유나 · 음성 해설");
    expect(vtt).toContain("00:00.000 --> 01:05.000");
  });

  it("음성이 서버에 저장되지 않은 해설에는 오디오 요소를 만들지 않는다", () => {
    const { container } = render(
      <ReviewVoiceCommentaryPanel episodeId="episode-1" tracks={[track({ audio: null })]} authorName="나" readOnly />,
    );

    expect(container.querySelector("audio")).toBeNull();
  });

  it("저장 정책(용량·보관 기간)을 패널 문구로 명시한다", () => {
    render(
      <ReviewVoiceCommentaryPanel episodeId="episode-1" tracks={[track()]} authorName="나" readOnly />,
    );

    expect(screen.getByText(/저장 정책: 해설 음성은 1건 최대 5MB/)).toBeTruthy();
    expect(screen.getByText(/서버 보관 기본 14일·최대 30일/)).toBeTruthy();
    expect(screen.getByText(/외부 유료 저장소는 쓰지 않습니다/)).toBeTruthy();
  });

  it("음성이 없는 해설도 '위치 따라가기'로 첫 키프레임 위치 이동을 요청한다", () => {
    const onApplyView = vi.fn();
    render(
      <ReviewVoiceCommentaryPanel
        episodeId="episode-1"
        tracks={[track({
          audio: null,
          keyframes: [{
            atMs: 0,
            view: { surface: "manuscript", poolItemId: null, pageId: "page-2", mode: null, scale: 1, tx: 0.25, ty: 0.5 },
            pinThreadIds: ["pin-1"],
          }],
        })]}
        authorName="나"
        readOnly
        onApplyView={onApplyView}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /위치 따라가기/ }));
    expect(onApplyView).toHaveBeenCalledTimes(1);
    expect(onApplyView.mock.calls[0]?.[0]).toMatchObject({ surface: "manuscript", pageId: "page-2" });
    expect(onApplyView.mock.calls[0]?.[1]).toEqual(["pin-1"]);
  });
});
