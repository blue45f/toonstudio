// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
