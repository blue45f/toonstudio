// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emitSession } from "@/domains/auth/public/session/auth-session-state";
import { ReviewVoiceCommentaryPanel, type ReviewVoiceCommentaryPanelProps } from "./ReviewVoiceCommentaryPanel";
import type { VoiceCommentaryTrack } from "./review-voice-commentary-model";

function track(id = "voice-1", authorName = "검수자 1"): VoiceCommentaryTrack {
  return {
    version: 1, id, episodeId: "episode-1", authorId: "assignment-1", authorName,
    createdAt: "2026-10-30T00:00:00.000Z", durationMs: 10_000,
    audio: { kind: "server", url: `https://example.test/${id}-expired.webm`, mimeType: "audio/webm", byteSize: 1024 },
    keyframes: [{ atMs: 0, view: { surface: "manuscript", pageId: id, poolItemId: null, mode: null, scale: 1, tx: 0, ty: 0 }, pinThreadIds: [] }],
    pinThreadIds: [],
  };
}

function freshTrack(source: VoiceCommentaryTrack): VoiceCommentaryTrack {
  return { ...source, audio: { kind: "server", url: `https://example.test/${source.id}-fresh.webm`, mimeType: "audio/webm", byteSize: 1024 } };
}

function trackWithFinalCue(): VoiceCommentaryTrack {
  const source = track();
  return {
    ...source, durationMs: 1037,
    audio: { kind: "blob", url: "blob:recorded-commentary", mimeType: "audio/webm", byteSize: 8983 },
    keyframes: [
      ...source.keyframes,
      { atMs: 1007, view: { surface: "compare", pageId: null, poolItemId: "external:final", mode: "overlay", scale: 1.5625, tx: 0.25, ty: 0.125 }, pinThreadIds: [] },
    ],
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Promise가 아직 초기화되지 않았습니다."); };
  let reject: (reason: Error) => void = () => { throw new Error("Promise가 아직 초기화되지 않았습니다."); };
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

function audioElement(container: HTMLElement): HTMLAudioElement {
  const audio = container.querySelector("audio");
  if (!audio) throw new Error("해설 오디오 요소가 없습니다.");
  return audio;
}

function props(overrides: Partial<ReviewVoiceCommentaryPanelProps> = {}): ReviewVoiceCommentaryPanelProps {
  return { episodeId: "episode-1", tracks: [track()], authorName: "나", authorId: "assignment-1", readOnly: true, ...overrides };
}

function playbackPosition(): HTMLInputElement {
  const position = screen.getByRole("slider", { name: "해설 재생 위치" });
  if (!(position instanceof HTMLInputElement)) throw new Error("해설 재생 위치 입력이 없습니다.");
  return position;
}

function nativeAudioState(audio: HTMLAudioElement, paused: boolean, ended: boolean) {
  Object.defineProperty(audio, "paused", { configurable: true, value: paused });
  Object.defineProperty(audio, "ended", { configurable: true, value: ended });
  Object.defineProperty(audio, "currentSrc", { configurable: true, value: audio.src });
}

async function startNativePlayback(container: HTMLElement): Promise<HTMLAudioElement> {
  fireEvent.click(screen.getByRole("button", { name: "해설 듣기" }));
  await act(async () => { await Promise.resolve(); });
  const audio = audioElement(container);
  nativeAudioState(audio, false, false);
  fireEvent.play(audio);
  return audio;
}

async function endAtShorterAudioTime(container: HTMLElement): Promise<HTMLAudioElement> {
  const audio = await startNativePlayback(container);
  audio.currentTime = 0.96;
  fireEvent.timeUpdate(audio);
  nativeAudioState(audio, true, true);
  fireEvent.ended(audio);
  return audio;
}

describe("음성 해설의 명시적 재생과 요청 수명", () => {
  beforeEach(() => {
    emitSession({ user: { id: "account-A" }, token: null });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  });

  afterEach(() => { cleanup(); emitSession(null); vi.restoreAllMocks(); });

  it("서버 해설은 현재 읽기 응답을 기다린 뒤 갱신된 주소로 재생하고 중복 클릭을 합친다", async () => {
    const pending = deferred<VoiceCommentaryTrack>();
    const prepare = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onPreparePlayback"]>>(() => pending.promise);
    const source = track();
    const { container } = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [source], onPreparePlayback: prepare })} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 듣기" }));
    fireEvent.click(screen.getByRole("button", { name: /해설 듣기|준비|불러/ }));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0]?.[0]).toBe(source);
    expect(prepare.mock.calls[0]?.[1].aborted).toBe(false);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    const refreshed = freshTrack(source);
    await act(async () => { pending.resolve(refreshed); await pending.promise; });
    expect(audioElement(container).src).toBe(refreshed.audio?.url);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it("호스트의 서버 트랙 갱신이 대기 중인 재생 주소를 중복 설정하지 않는다", async () => {
    const reading = deferred<VoiceCommentaryTrack>(), playing = deferred<void>();
    const source = track(), refreshed = freshTrack(source);
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(playing.promise);
    function Host() {
      const [tracks, setTracks] = useState<readonly VoiceCommentaryTrack[]>([source]);
      const prepare: NonNullable<ReviewVoiceCommentaryPanelProps["onPreparePlayback"]> = async () => {
        const current = await reading.promise;
        setTracks([current]);
        return current;
      };
      return <ReviewVoiceCommentaryPanel {...props({ tracks, onPreparePlayback: prepare })} />;
    }
    const { container } = render(<Host />);
    const audio = audioElement(container), sourceChanges: (string | null)[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName === "src") sourceChanges.push(audio.getAttribute("src"));
      }
    });
    observer.observe(audio, { attributes: true, attributeFilter: ["src"] });
    try {
      fireEvent.click(screen.getByRole("button", { name: "해설 듣기" }));
      await act(async () => { reading.resolve(refreshed); await reading.promise; await Promise.resolve(); });
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
      expect(audio.getAttribute("src")).toBe(refreshed.audio?.url);
      expect(sourceChanges).toEqual([refreshed.audio?.url]);
      await act(async () => { playing.resolve(undefined); await playing.promise; });
      expect(screen.getByRole("button", { name: "일시정지" })).toBeTruthy();
      expect(audio.getAttribute("src")).toBe(refreshed.audio?.url);
      expect(sourceChanges).toEqual([refreshed.audio?.url]);
    } finally { observer.disconnect(); }
  });

  it("서명 읽기 실패를 재생 중으로 표시하지 않으며 사용자의 다음 클릭으로 다시 시도한다", async () => {
    const pending = deferred<VoiceCommentaryTrack>();
    const source = track(), refreshed = freshTrack(source);
    const prepare = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onPreparePlayback"]>>()
      .mockReturnValueOnce(pending.promise).mockResolvedValueOnce(refreshed);
    const { container } = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [source], onPreparePlayback: prepare })} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 듣기" }));
    await act(async () => { pending.reject(new Error("현재 권한으로 음성을 읽을 수 없습니다.")); await pending.promise.catch(() => undefined); });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "일시정지" })).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "해설 듣기" }));
    await act(async () => { await Promise.resolve(); });
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(audioElement(container).src).toBe(refreshed.audio?.url);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it("브라우저가 play를 거절하면 오류를 안내하고 다음 명시적 재생을 허용한다", async () => {
    const source = track();
    const prepare = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onPreparePlayback"]>>().mockResolvedValue(freshTrack(source));
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException("사용자 동작이 필요합니다.", "NotAllowedError"));
    render(<ReviewVoiceCommentaryPanel {...props({ tracks: [source], onPreparePlayback: prepare })} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 듣기" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "일시정지" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "해설 듣기" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it("서명 읽기 대기 중 선택한 재생 시각을 응답 뒤에도 보존하고 그 위치의 화면을 적용한다", async () => {
    const pending = deferred<VoiceCommentaryTrack>();
    const source: VoiceCommentaryTrack = {
      ...track(),
      keyframes: [
        ...track().keyframes,
        { atMs: 6000, view: { surface: "manuscript", pageId: "page-at-six", poolItemId: null, mode: null, scale: 2, tx: 0.25, ty: 0.5 }, pinThreadIds: ["pin-at-six"] },
      ],
    };
    const prepare = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onPreparePlayback"]>>(() => pending.promise);
    const apply = vi.fn();
    const { container } = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [source], onPreparePlayback: prepare, onApplyView: apply })} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 듣기" }));
    fireEvent.change(screen.getByRole("slider", { name: "해설 재생 위치" }), { target: { value: "6000" } });
    expect(audioElement(container).currentTime).toBe(6);
    apply.mockClear();
    await act(async () => { pending.resolve(freshTrack(source)); await pending.promise; });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(audioElement(container).currentTime).toBe(6);
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ pageId: "page-at-six" }), ["pin-at-six"]);
  });

  it("정지 중 선택한 마지막 큐를 오디오 탐색 보정이 이전 화면으로 되돌리지 않는다", () => {
    const source = trackWithFinalCue(), apply = vi.fn();
    const { container } = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [source], onApplyView: apply })} />);
    fireEvent.click(screen.getByRole("button", { name: /external:final/u }));
    const slider = screen.getByRole("slider", { name: "해설 재생 위치" });
    expect(slider.getAttribute("value")).toBe("1007");
    expect(apply).toHaveBeenLastCalledWith(source.keyframes[1]?.view, []);
    const audio = audioElement(container);
    expect(audio.paused).toBe(true);
    Object.defineProperty(audio, "ended", { configurable: true, value: true });
    audio.currentTime = 0.96;
    fireEvent.timeUpdate(audio);
    expect(slider.getAttribute("value")).toBe("1007");
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenLastCalledWith(source.keyframes[1]?.view, []);
  });

  it("수동 큐 선택 뒤 실제 재생이 시작되면 오디오 시각을 다시 따라간다", () => {
    const source = trackWithFinalCue(), apply = vi.fn();
    const { container } = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [source], onApplyView: apply })} />);
    fireEvent.click(screen.getByRole("button", { name: /external:final/u }));
    const audio = audioElement(container);
    Object.defineProperty(audio, "paused", { configurable: true, value: false });
    fireEvent.play(audio);
    audio.currentTime = 0.96;
    fireEvent.timeUpdate(audio);
    const slider = screen.getByRole("slider", { name: "해설 재생 위치" });
    expect(slider.getAttribute("value")).toBe("960");
    expect(apply).toHaveBeenLastCalledWith(source.keyframes[0]?.view, []);
    audio.currentTime = 1.02;
    fireEvent.timeUpdate(audio);
    expect(slider.getAttribute("value")).toBe("1020");
    expect(apply).toHaveBeenLastCalledWith(source.keyframes[1]?.view, []);
  });

  it("수동 탐색 없이 재생하다 멈출 때는 마지막 오디오 시각도 반영한다", () => {
    const source = trackWithFinalCue(), apply = vi.fn();
    const { container } = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [source], onApplyView: apply })} />);
    const audio = audioElement(container);
    Object.defineProperty(audio, "paused", { configurable: true, value: false });
    fireEvent.play(audio);
    audio.currentTime = 0.96;
    fireEvent.timeUpdate(audio);
    Object.defineProperty(audio, "paused", { configurable: true, value: true });
    fireEvent.pause(audio);
    audio.currentTime = 1.02;
    fireEvent.timeUpdate(audio);
    expect(screen.getByRole("slider", { name: "해설 재생 위치" }).getAttribute("value")).toBe("1020");
    expect(apply).toHaveBeenLastCalledWith(source.keyframes[1]?.view, []);
    Object.defineProperty(audio, "ended", { configurable: true, value: true });
    fireEvent.ended(audio);
    audio.currentTime = 1.037;
    fireEvent.timeUpdate(audio);
    expect(screen.getByRole("slider", { name: "해설 재생 위치" }).getAttribute("value")).toBe("1037");
    expect(apply).toHaveBeenLastCalledWith(source.keyframes[1]?.view, []);
  });

  it.each([
    { kind: "blob" as const, url: "blob:recorded-commentary" },
    { kind: "server" as const, url: "/voice/recorded-commentary.webm" },
  ])("실제 음성이 마지막 큐보다 먼저 끝나도 마지막 화면과 논리적 종료 시각을 보존한다: $url", async ({ kind, url }) => {
    const source: VoiceCommentaryTrack = { ...trackWithFinalCue(), audio: { kind, url, mimeType: "audio/webm", byteSize: 8983 } };
    const apply = vi.fn();
    const { container } = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [source], onApplyView: apply })} />);
    const audio = await endAtShorterAudioTime(container);
    expect(audio.currentTime).toBe(0.96);
    const slider = playbackPosition();
    expect(slider.value).toBe("1037");
    expect(apply).toHaveBeenLastCalledWith(source.keyframes[1]?.view, []);
    expect(screen.getByRole("button", { name: "해설 듣기" })).toBeTruthy();
    apply.mockClear();
    audio.currentTime = 0.96;
    fireEvent.timeUpdate(audio);
    expect(slider.value).toBe("1037");
    expect(apply).not.toHaveBeenCalled();
  });

  it("자연 종료 뒤 다시 재생하면 종료 화면 고정을 해제하고 처음부터 오디오 시각을 따른다", async () => {
    const source = trackWithFinalCue(), apply = vi.fn();
    const { container } = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [source], onApplyView: apply })} />);
    await endAtShorterAudioTime(container);
    expect(playbackPosition().value).toBe("1037");
    const audio = await startNativePlayback(container);
    expect(audio.currentTime).toBe(0);
    fireEvent.timeUpdate(audio);
    expect(playbackPosition().value).toBe("0");
    expect(apply).toHaveBeenLastCalledWith(source.keyframes[0]?.view, []);
    audio.currentTime = 0.5;
    fireEvent.timeUpdate(audio);
    expect(playbackPosition().value).toBe("500");
    expect(apply).toHaveBeenLastCalledWith(source.keyframes[0]?.view, []);
  });

  it("자연 종료 뒤 명시적으로 탐색하면 고정된 마지막 큐를 떠나고 다음 재생도 선택 시각을 따른다", async () => {
    const source = trackWithFinalCue(), apply = vi.fn();
    const { container } = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [source], onApplyView: apply })} />);
    const audio = await endAtShorterAudioTime(container);
    nativeAudioState(audio, true, false);
    fireEvent.change(screen.getByRole("slider", { name: "해설 재생 위치" }), { target: { value: "500" } });
    expect(playbackPosition().value).toBe("500");
    expect(apply).toHaveBeenLastCalledWith(source.keyframes[0]?.view, []);
    expect(audio.currentTime).toBe(0.5);
    await startNativePlayback(container);
    expect(audio.currentTime).toBe(0.5);
    audio.currentTime = 0.6;
    fireEvent.timeUpdate(audio);
    expect(playbackPosition().value).toBe("600");
    expect(apply).toHaveBeenLastCalledWith(source.keyframes[0]?.view, []);
  });

  it("이전 해설의 늦은 ended 이벤트가 새 해설의 진행 중인 재생을 종료하지 않는다", async () => {
    const first = trackWithFinalCue(), second = track("voice-2", "검수자 2"), apply = vi.fn();
    const { container } = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [second, first], onApplyView: apply })} />);
    const oldAudio = await endAtShorterAudioTime(container);
    fireEvent.click(screen.getByRole("button", { name: /검수자 2 ·/ }));
    const currentAudio = await startNativePlayback(container);
    currentAudio.currentTime = 0.25;
    fireEvent.timeUpdate(currentAudio);
    apply.mockClear();
    fireEvent.ended(oldAudio);
    expect(screen.getByRole("button", { name: "일시정지" })).toBeTruthy();
    expect(playbackPosition().value).toBe("250");
    expect(apply).not.toHaveBeenCalled();
    expect(currentAudio.getAttribute("src")).toBe(second.audio?.url);
  });

  it("새 해설을 선택한 직후 이전 오디오 소스의 종료가 새 해설의 마지막 화면을 적용하지 않는다", async () => {
    const first = trackWithFinalCue(), second = track("voice-2", "검수자 2"), apply = vi.fn();
    const { container } = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [second, first], onApplyView: apply })} />);
    const oldAudio = await endAtShorterAudioTime(container);
    fireEvent.click(screen.getByRole("button", { name: /검수자 2 ·/ }));
    apply.mockClear();
    fireEvent.ended(oldAudio);
    expect(playbackPosition().value).toBe("0");
    expect(apply).not.toHaveBeenCalled();
    expect(audioElement(container).getAttribute("src")).toBe(second.audio?.url);
  });

  it("다른 해설을 선택하면 대기 요청을 취소하고 늦은 주소·위치를 새 선택에 적용하지 않는다", async () => {
    const pending = deferred<VoiceCommentaryTrack>(), first = track(), second = track("voice-2", "검수자 2");
    const prepare = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onPreparePlayback"]>>(() => pending.promise);
    const apply = vi.fn();
    const { container } = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [second, first], onPreparePlayback: prepare, onApplyView: apply })} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 듣기" }));
    const signal = prepare.mock.calls[0]?.[1];
    fireEvent.click(screen.getByRole("button", { name: /검수자 2 ·/ }));
    expect(signal?.aborted).toBe(true);
    apply.mockClear();
    await act(async () => { pending.resolve(freshTrack(first)); await pending.promise; });
    expect(audioElement(container).src).toBe(second.audio?.url);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("회차가 바뀌면 이전 재생 준비를 취소하고 늦은 응답을 무시한다", async () => {
    const pending = deferred<VoiceCommentaryTrack>(), first = track();
    const prepare = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onPreparePlayback"]>>(() => pending.promise);
    const initial = props({ tracks: [first], onPreparePlayback: prepare });
    const view = render(<ReviewVoiceCommentaryPanel {...initial} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 듣기" }));
    const signal = prepare.mock.calls[0]?.[1];
    view.rerender(<ReviewVoiceCommentaryPanel {...initial} episodeId="episode-2" tracks={[]} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => { pending.resolve(freshTrack(first)); await pending.promise; });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(view.container.querySelector("audio")).toBeNull();
  });

  it("렌더 없는 실제 UID A→B→A도 이전 재생 응답을 되살리지 않는다", async () => {
    const pending = deferred<VoiceCommentaryTrack>(), source = track();
    const prepare = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onPreparePlayback"]>>(() => pending.promise);
    render(<ReviewVoiceCommentaryPanel {...props({ tracks: [source], onPreparePlayback: prepare })} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 듣기" }));
    const signal = prepare.mock.calls[0]?.[1];
    act(() => {
      emitSession({ user: { id: "account-B" }, token: null });
      emitSession({ user: { id: "account-A" }, token: null });
    });
    expect(signal?.aborted).toBe(true);
    await act(async () => { pending.resolve(freshTrack(source)); await pending.promise; });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "일시정지" })).toBeNull();
  });

  it("오디오 오류는 재생 상태를 해제하고 사용자에게 재시도를 알린다", async () => {
    const source = track();
    const prepare = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onPreparePlayback"]>>().mockResolvedValue(freshTrack(source));
    const { container } = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [source], onPreparePlayback: prepare })} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 듣기" }));
    await act(async () => { await Promise.resolve(); });
    fireEvent.play(audioElement(container));
    expect(screen.getByRole("button", { name: "일시정지" })).toBeTruthy();
    fireEvent.error(audioElement(container));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "해설 듣기" })).toBeTruthy();
  });

  it("패널을 닫아도 호스트가 보관하는 Blob URL을 해제하지 않는다", async () => {
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const revoke = vi.fn();
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    try {
      const source = track();
      const local: VoiceCommentaryTrack = { ...source, audio: { kind: "blob", url: "blob:host-owned", mimeType: "audio/webm", byteSize: 100 } };
      const prepare = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onPreparePlayback"]>>().mockResolvedValue(local);
      const view = render(<ReviewVoiceCommentaryPanel {...props({ tracks: [local], onPreparePlayback: prepare })} />);
      fireEvent.click(screen.getByRole("button", { name: "해설 듣기" }));
      await act(async () => { await Promise.resolve(); });
      expect(prepare).not.toHaveBeenCalled();
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
      view.unmount();
      expect(revoke).not.toHaveBeenCalled();
    } finally {
      if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke);
      else Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });
});
