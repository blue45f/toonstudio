// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { ReviewVoiceCommentaryPanel, type ReviewVoiceCommentaryPanelProps } from "./ReviewVoiceCommentaryPanel";
import type { VoiceCommentaryTrack } from "./review-voice-commentary-model";

function track(): VoiceCommentaryTrack {
  return {
    version: 1, id: "voice-1", episodeId: "episode-1", authorId: "assignment-1", authorName: "Yuna",
    createdAt: "2026-10-30T00:00:00.000Z", durationMs: 65_000,
    audio: { kind: "server", url: "https://example.test/voice.webm", mimeType: "audio/webm", byteSize: 1024 },
    keyframes: [], pinThreadIds: [],
  };
}

describe("영어 음성 해설의 표시와 복구 안내", () => {
  let previousLanguage = useI18n.getState().lang;

  beforeEach(() => {
    previousLanguage = useI18n.getState().lang;
    useI18n.setState({ lang: "en" });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    useI18n.setState({ lang: previousLanguage });
    vi.restoreAllMocks();
  });

  it("제목·재생 행동·자막 정보가 영어이고 자막 언어도 en이다", () => {
    const { container } = render(<ReviewVoiceCommentaryPanel episodeId="episode-1" tracks={[track()]} authorName="Me" readOnly />);
    expect(screen.getByText("Voice commentary")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Listen to commentary" })).toBeTruthy();
    const caption = container.querySelector("audio > track");
    expect(caption?.getAttribute("kind")).toBe("captions");
    expect(caption?.getAttribute("srclang")).toBe("en");
    expect(caption?.getAttribute("label")).toBe("Commentary information");
    const src = caption?.getAttribute("src") ?? "";
    const vtt = decodeURIComponent(src.slice(src.indexOf(",") + 1));
    expect(vtt).toContain("Yuna · Voice commentary");
    expect(vtt).toContain("00:00.000 --> 01:05.000");
  });

  it("서버 읽기 실패를 영어로 알리고 재생 중 대신 다시 듣기 행동을 제공한다", async () => {
    const prepare = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onPreparePlayback"]>>()
      .mockRejectedValue(new Error("읽기 권한이 없습니다."));
    render(<ReviewVoiceCommentaryPanel episodeId="episode-1" tracks={[track()]} authorName="Me" readOnly onPreparePlayback={prepare} />);
    fireEvent.click(screen.getByRole("button", { name: "Listen to commentary" }));
    await act(async () => { await Promise.resolve(); });
    const message = screen.getByRole("alert").textContent ?? "";
    expect(message).toContain("Could not play the commentary");
    expect(message).toContain("Check your connection and access to this commentary");
    expect(message).toContain("try playing it again");
    expect(message).not.toMatch(/[가-힣]/u);
    expect(screen.getByRole("button", { name: "Listen to commentary" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});
