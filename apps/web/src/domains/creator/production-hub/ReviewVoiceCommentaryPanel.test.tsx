// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emitSession, getAuthUserId } from "@/domains/auth/public/session/auth-session-state";
import { useI18n } from "@/shared/lib/i18n";
import { ReviewVoiceCommentaryPanel, type ReviewVoiceCommentaryPanelProps, type VoiceViewCapture } from "./ReviewVoiceCommentaryPanel";
import { VOICE_COMMENTARY_MAX_AUDIO_BYTES, type VoiceCommentaryTrack } from "./review-voice-commentary-model";

let previousLanguage = useI18n.getState().lang;
beforeEach(() => {
  previousLanguage = useI18n.getState().lang;
  useI18n.setState({ lang: "ko" });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterEach(() => { act(() => useI18n.setState({ lang: previousLanguage })); vi.restoreAllMocks(); });

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

    expect(screen.getByText(/해설 음성은 1건 최대 5MB/)).toBeTruthy();
    expect(screen.getByText(/기본 14일/)).toBeTruthy();
    expect(screen.getByText(/최대 30일/)).toBeTruthy();
    expect(screen.getByText(/서버 저장에 실패한 녹음은 이 탭에서만 들을 수 있고/)).toBeTruthy();
    expect(screen.getByText(/새로고침하면 사라/)).toBeTruthy();
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

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Promise가 아직 초기화되지 않았습니다."); };
  let reject: (reason: Error) => void = () => { throw new Error("Promise가 아직 초기화되지 않았습니다."); };
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

/** 실제 DOM 계약을 갖춘 소유 stream이며, track.stop 호출만 관찰한다. */
function microphone() {
  const stop = vi.fn();
  const mediaTrack: MediaStreamTrack = Object.assign(new EventTarget(), {
    contentHint: "", enabled: true, id: "mic-track", kind: "audio", label: "마이크", muted: false,
    onended: null, onmute: null, onunmute: null, readyState: "live" as const,
    applyConstraints: vi.fn(async () => undefined),
    clone: vi.fn(() => mediaTrack),
    getCapabilities: vi.fn(() => ({})),
    getConstraints: vi.fn(() => ({})),
    getSettings: vi.fn(() => ({})),
    stop,
  });
  const stream: MediaStream = Object.assign(new EventTarget(), {
    active: true, id: "mic-stream", onaddtrack: null, onremovetrack: null,
    addTrack: vi.fn(), removeTrack: vi.fn(), clone: vi.fn(() => stream),
    getAudioTracks: () => [mediaTrack], getVideoTracks: () => [], getTracks: () => [mediaTrack],
    getTrackById: (id: string) => id === mediaTrack.id ? mediaTrack : null,
  });
  return { stream, stop };
}

/** stop()은 이벤트를 보내지 않는다. 시험이 마지막 dataavailable과 stop 순서를 직접 결정한다. */
class ControlledMediaRecorder {
  static instances: ControlledMediaRecorder[] = [];
  static constructorError: Error | null = null;
  static startError: Error | null = null;
  mimeType = "audio/webm;codecs=opus";
  state: RecordingState = "inactive";
  ondataavailable: ((event: { readonly data: Blob }) => void) | null = null;
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly start = vi.fn(() => {
    if (ControlledMediaRecorder.startError) throw ControlledMediaRecorder.startError;
    this.state = "recording";
  });
  readonly stop = vi.fn(() => {
    this.state = "inactive";
    // 실제 stop의 비활성화 경로처럼 mimeType이 복원돼도 종료 요청 때 형식을 보존해야 한다.
    this.mimeType = "";
  });
  constructor(readonly stream: MediaStream) {
    if (ControlledMediaRecorder.constructorError) throw ControlledMediaRecorder.constructorError;
    ControlledMediaRecorder.instances.push(this);
  }
  emitChunk(data: Blob): void { this.ondataavailable?.({ data }); }
  emitStop(): void { this.onstop?.(); }
  emitError(): void { this.onerror?.(); }
}

function currentRecorder(): ControlledMediaRecorder {
  const recorder = ControlledMediaRecorder.instances[ControlledMediaRecorder.instances.length - 1];
  if (!recorder) throw new Error("녹음기가 생성되지 않았습니다.");
  return recorder;
}

function viewCapture(pageId = "page-1"): VoiceViewCapture {
  return {
    view: { surface: "manuscript", poolItemId: null, pageId, mode: null, scale: 1, tx: 0, ty: 0 },
    pinThreadIds: ["pin-" + pageId],
  };
}

function blobContents(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result) : reject(new Error("Blob을 텍스트로 읽지 못했습니다."));
    reader.onerror = () => reject(reader.error ?? new Error("Blob 읽기가 실패했습니다."));
    reader.readAsText(blob);
  });
}

describe("ReviewVoiceCommentaryPanel 녹음 시도 수명", () => {
  const getUserMedia = vi.fn<MediaDevices["getUserMedia"]>();
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:voice-session");
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  let nowMs = 0;

  beforeEach(() => {
    emitSession(null);
    nowMs = Date.parse("2026-10-30T00:00:00.000Z");
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    getUserMedia.mockReset();
    createObjectURL.mockReset().mockReturnValue("blob:voice-session");
    ControlledMediaRecorder.instances = [];
    ControlledMediaRecorder.constructorError = null;
    ControlledMediaRecorder.startError = null;
    vi.stubGlobal("MediaRecorder", ControlledMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  });

  afterEach(() => {
    cleanup();
    emitSession(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalMediaDevices) Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    else Reflect.deleteProperty(navigator, "mediaDevices");
    if (originalCreateObjectURL) Object.defineProperty(URL, "createObjectURL", originalCreateObjectURL);
    else Reflect.deleteProperty(URL, "createObjectURL");
  });

  function props(overrides: Partial<ReviewVoiceCommentaryPanelProps> = {}): ReviewVoiceCommentaryPanelProps {
    return { episodeId: "episode-1", tracks: [], authorName: "검수자", authorId: "assignment-1",
      captureView: () => viewCapture(), ...overrides };
  }

  async function start(mic: ReturnType<typeof microphone>): Promise<ControlledMediaRecorder> {
    getUserMedia.mockResolvedValueOnce(mic.stream);
    fireEvent.click(screen.getByRole("button", { name: "해설 녹화 시작" }));
    await act(async () => { await Promise.resolve(); });
    return currentRecorder();
  }

  it("권한 대기 중 이동한 화면을 실제 녹음의 첫 키프레임으로 다시 읽는다", async () => {
    const pending = deferred<MediaStream>(), mic = microphone();
    const save = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onSaveTrack"]>>();
    let capture = viewCapture("before-permission");
    getUserMedia.mockReturnValueOnce(pending.promise);
    render(<ReviewVoiceCommentaryPanel {...props({ captureView: () => capture, onSaveTrack: save })} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 녹화 시작" }));
    nowMs += 20_000;
    capture = viewCapture("actual-start");
    await act(async () => { pending.resolve(mic.stream); await pending.promise; });
    const recorder = currentRecorder();
    nowMs += 100;
    fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    act(() => { recorder.emitChunk(new Blob(["시작 화면 설명"])); recorder.emitStop(); });
    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0]?.[0];
    expect(saved?.durationMs).toBe(100);
    expect(saved?.keyframes[0]).toMatchObject({
      atMs: 0,
      view: { pageId: "actual-start" },
      pinThreadIds: ["pin-actual-start"],
    });
    expect(saved?.keyframes.some((frame) => frame.view.pageId === "before-permission")).toBe(false);
  });

  it.each(["null", "throw"] as const)("권한 응답 뒤 화면 읽기 %s 실패는 소유 stream을 닫고 저장하지 않는다", async (failure) => {
    const pending = deferred<MediaStream>(), mic = microphone(), save = vi.fn();
    let permissionReturned = false;
    const captureView = () => {
      if (!permissionReturned) return viewCapture();
      if (failure === "throw") throw new Error("현재 화면을 읽을 수 없습니다.");
      return null;
    };
    getUserMedia.mockReturnValueOnce(pending.promise);
    render(<ReviewVoiceCommentaryPanel {...props({ captureView, onSaveTrack: save })} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 녹화 시작" }));
    permissionReturned = true;
    await act(async () => { pending.resolve(mic.stream); await pending.promise; });
    expect(mic.stop).toHaveBeenCalledTimes(1);
    expect(ControlledMediaRecorder.instances.every((recorder) => recorder.start.mock.calls.length === 0)).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "해설 녹화 시작" }).hasAttribute("disabled")).toBe(false);
  });

  it("명시 종료 직후에는 저장하지 않고 마지막 chunk와 stop 뒤 전체 오디오·고정 화면을 한 번 저장한다", async () => {
    const mic = microphone();
    const save = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onSaveTrack"]>>();
    let capture = viewCapture("page-1");
    render(<ReviewVoiceCommentaryPanel {...props({ captureView: () => capture, onSaveTrack: save })} />);
    const recorder = await start(mic);
    act(() => recorder.emitChunk(new Blob(["앞부분"], { type: "audio/webm" })));
    nowMs += 1200;
    capture = viewCapture("page-final");
    fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    expect(save).not.toHaveBeenCalled();
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "해설 녹화 시작" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "해설 녹화 시작" }));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    // 종료 이벤트를 기다리는 동안 바뀐 화면과 시간은 완료 트랙에 섞이면 안 된다.
    capture = viewCapture("page-too-late");
    nowMs += 9000;
    act(() => recorder.emitChunk(new Blob(["마지막"], { type: "audio/webm" })));
    expect(save).not.toHaveBeenCalled();
    const queuedStop = recorder.onstop;
    act(() => { recorder.emitStop(); queuedStop?.(); });
    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0];
    if (!saved?.[1]) throw new Error("완료 오디오가 없습니다.");
    expect(await blobContents(saved[1])).toBe("앞부분마지막");
    expect(saved[1].type).toBe("audio/webm;codecs=opus");
    expect(saved[0]).toMatchObject({ episodeId: "episode-1", authorId: "assignment-1", durationMs: 1200 });
    expect(saved[0].keyframes.map((frame) => frame.view.pageId)).toEqual(["page-1", "page-final"]);
    expect(mic.stop).toHaveBeenCalledTimes(1);
  });

  it("즉시 종료한 짧은 녹음도 stop 직전 전달된 단 하나의 최종 chunk를 보관한다", async () => {
    const mic = microphone();
    const save = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onSaveTrack"]>>();
    render(<ReviewVoiceCommentaryPanel {...props({ onSaveTrack: save })} />);
    const recorder = await start(mic);
    fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    act(() => recorder.emitChunk(new Blob(["짧은 음성"], { type: "audio/webm" })));
    expect(save).not.toHaveBeenCalled();
    act(() => recorder.emitStop());
    expect(save).toHaveBeenCalledTimes(1);
    const blob = save.mock.calls[0]?.[1];
    if (!blob) throw new Error("최종 chunk가 보관되지 않았습니다.");
    expect(await blobContents(blob)).toBe("짧은 음성");
  });

  it("마이크 자연 종료는 자동 저장하지 않고 그 시점의 음성·화면·기간을 명시 종료로 한 번 보관한다", async () => {
    const mic = microphone();
    const save = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onSaveTrack"]>>();
    let capture = viewCapture("page-1");
    render(<ReviewVoiceCommentaryPanel {...props({ captureView: () => capture, onSaveTrack: save })} />);
    const recorder = await start(mic);
    act(() => recorder.emitChunk(new Blob(["자연 종료 앞"], { type: "audio/webm" })));
    nowMs += 1800;
    capture = viewCapture("page-natural-end");
    act(() => {
      recorder.state = "inactive";
      recorder.mimeType = "";
      recorder.emitChunk(new Blob(["자연 종료 끝"], { type: "audio/webm" }));
      recorder.emitStop();
    });
    expect(save).not.toHaveBeenCalled();
    expect(mic.stop).toHaveBeenCalledTimes(1);
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(screen.getByText(/마이크 입력이 종료되었어요/)).toBeTruthy();
    capture = viewCapture("page-after-end");
    nowMs += 20_000;
    const queuedStop = recorder.onstop;
    fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    act(() => queuedStop?.());
    expect(save).toHaveBeenCalledTimes(1);
    expect(recorder.stop).not.toHaveBeenCalled();
    const saved = save.mock.calls[0];
    if (!saved?.[1]) throw new Error("자연 종료 오디오가 없습니다.");
    expect(await blobContents(saved[1])).toBe("자연 종료 앞자연 종료 끝");
    expect(saved[0].durationMs).toBe(1800);
    expect(saved[0].keyframes.map((frame) => frame.view.pageId)).toEqual(["page-1", "page-natural-end"]);
    expect(mic.stop).toHaveBeenCalledTimes(1);
  });

  it("이미 비활성화됐지만 stop 이벤트가 대기 중이면 재요청 없이 마지막 데이터를 기다려 명시 보관한다", async () => {
    const mic = microphone(), save = vi.fn();
    render(<ReviewVoiceCommentaryPanel {...props({ onSaveTrack: save })} />);
    const recorder = await start(mic);
    recorder.state = "inactive";
    fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    act(() => recorder.emitChunk(new Blob(["대기하던 최종 데이터"])));
    expect(save).not.toHaveBeenCalled();
    act(() => recorder.emitStop());
    expect(save).toHaveBeenCalledTimes(1);
    expect(mic.stop).toHaveBeenCalledTimes(1);
  });

  it.each(["unmount", "episode", "author", "readonly"] as const)("권한 대기 중 %s 전환 뒤 도착한 stream은 닫고 저장하지 않는다", async (change) => {
    const pending = deferred<MediaStream>();
    const mic = microphone();
    const save = vi.fn();
    getUserMedia.mockReturnValueOnce(pending.promise);
    const initial = props({ onSaveTrack: save });
    const view = render(<ReviewVoiceCommentaryPanel {...initial} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 녹화 시작" }));
    expect(screen.getByRole("button", { name: "해설 녹화 시작" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "해설 녹화 시작" }));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    if (change === "unmount") view.unmount();
    else view.rerender(<ReviewVoiceCommentaryPanel {...initial}
      episodeId={change === "episode" ? "episode-2" : initial.episodeId}
      authorId={change === "author" ? "assignment-2" : initial.authorId ?? null}
      readOnly={change === "readonly"} />);
    await act(async () => { pending.resolve(mic.stream); await pending.promise; });
    expect(mic.stop).toHaveBeenCalledTimes(1);
    expect(ControlledMediaRecorder.instances).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
  });

  it("회차 A→B→A 후 옛 권한 응답은 새 녹음 시도를 대체하지 못한다", async () => {
    const oldPermission = deferred<MediaStream>(), newPermission = deferred<MediaStream>();
    const oldMic = microphone(), newMic = microphone();
    getUserMedia.mockReturnValueOnce(oldPermission.promise).mockReturnValueOnce(newPermission.promise);
    const save = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onSaveTrack"]>>();
    const initial = props({ onSaveTrack: save });
    const view = render(<ReviewVoiceCommentaryPanel {...initial} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 녹화 시작" }));
    view.rerender(<ReviewVoiceCommentaryPanel {...initial} episodeId="episode-B" />);
    view.rerender(<ReviewVoiceCommentaryPanel {...initial} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 녹화 시작" }));
    await act(async () => { oldPermission.resolve(oldMic.stream); await oldPermission.promise; });
    expect(oldMic.stop).toHaveBeenCalledTimes(1);
    expect(ControlledMediaRecorder.instances).toHaveLength(0);
    await act(async () => { newPermission.resolve(newMic.stream); await newPermission.promise; });
    const recorder = currentRecorder();
    expect(recorder.stream).toBe(newMic.stream);
    fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    act(() => { recorder.emitChunk(new Blob(["새 시도"])); recorder.emitStop(); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(newMic.stop).toHaveBeenCalledTimes(1);
  });

  it("이전 recorder의 대기 이벤트는 다음 녹음의 chunk·stream·저장에 영향을 주지 않는다", async () => {
    const oldMic = microphone(), newMic = microphone();
    const save = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onSaveTrack"]>>();
    const initial = props({ onSaveTrack: save });
    const view = render(<ReviewVoiceCommentaryPanel {...initial} />);
    const oldRecorder = await start(oldMic);
    const lateData = oldRecorder.ondataavailable, lateStop = oldRecorder.onstop, lateError = oldRecorder.onerror;
    expect(lateData).not.toBeNull();
    expect(lateStop).not.toBeNull();
    view.rerender(<ReviewVoiceCommentaryPanel {...initial} episodeId="episode-2" />);
    expect(oldMic.stop).toHaveBeenCalledTimes(1);
    const next = await start(newMic);
    act(() => {
      next.emitChunk(new Blob(["다음 앞"]));
      lateData?.({ data: new Blob(["이전 오염"]) });
      lateStop?.();
      lateError?.();
    });
    expect(newMic.stop).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    act(() => { next.emitChunk(new Blob(["다음 끝"])); next.emitStop(); });
    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0];
    if (!saved?.[1]) throw new Error("다음 녹음이 없습니다.");
    expect(await blobContents(saved[1])).toBe("다음 앞다음 끝");
    expect(saved[0].episodeId).toBe("episode-2");
    expect(newMic.stop).toHaveBeenCalledTimes(1);
  });

  it.each(["episode", "author", "readonly"] as const)("종료 대기 중 %s 전환은 뒤늦은 완료 저장을 막는다", async (change) => {
    const mic = microphone(), save = vi.fn();
    const initial = props({ onSaveTrack: save });
    const view = render(<ReviewVoiceCommentaryPanel {...initial} />);
    const recorder = await start(mic);
    fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    const lateData = recorder.ondataavailable, lateStop = recorder.onstop;
    view.rerender(<ReviewVoiceCommentaryPanel {...initial}
      episodeId={change === "episode" ? "episode-2" : initial.episodeId}
      authorId={change === "author" ? "assignment-2" : initial.authorId ?? null}
      readOnly={change === "readonly"} />);
    act(() => { lateData?.({ data: new Blob(["폐기할 마지막 데이터"]) }); lateStop?.(); });
    expect(save).not.toHaveBeenCalled();
    expect(mic.stop).toHaveBeenCalledTimes(1);
  });

  it.each(["recording", "stopping"] as const)("%s 중 화면 이탈은 소유 마이크를 닫고 늦은 이벤트를 저장하지 않는다", async (phase) => {
    const mic = microphone(), save = vi.fn();
    const view = render(<ReviewVoiceCommentaryPanel {...props({ onSaveTrack: save })} />);
    const recorder = await start(mic);
    if (phase === "stopping") fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    const lateData = recorder.ondataavailable, lateStop = recorder.onstop;
    view.unmount();
    act(() => { lateData?.({ data: new Blob(["이탈 후 데이터"]) }); lateStop?.(); });
    expect(mic.stop).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it.each(["constructor", "start"] as const)("녹음기 %s 실패는 소유 stream을 닫고 사용자가 재시도할 수 있다", async (failure) => {
    const mic = microphone(), retryMic = microphone(), save = vi.fn();
    if (failure === "constructor") ControlledMediaRecorder.constructorError = new Error("생성 실패");
    else ControlledMediaRecorder.startError = new Error("시작 실패");
    const view = render(<ReviewVoiceCommentaryPanel {...props({ onSaveTrack: save })} />);
    getUserMedia.mockResolvedValueOnce(mic.stream);
    fireEvent.click(screen.getByRole("button", { name: "해설 녹화 시작" }));
    await act(async () => { await Promise.resolve(); });
    expect(mic.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    ControlledMediaRecorder.constructorError = null;
    ControlledMediaRecorder.startError = null;
    await start(retryMic);
    expect(screen.getByRole("button", { name: /녹화 종료/ })).toBeTruthy();
    view.unmount();
    expect(retryMic.stop).toHaveBeenCalledTimes(1);
  });

  it("녹음 오류 이벤트는 마이크를 닫고 명시 종료 없이 일부 오디오를 저장하지 않는다", async () => {
    const mic = microphone(), save = vi.fn();
    render(<ReviewVoiceCommentaryPanel {...props({ onSaveTrack: save })} />);
    const recorder = await start(mic);
    act(() => { recorder.emitChunk(new Blob(["불완전"])); recorder.emitError(); recorder.emitStop(); });
    expect(save).not.toHaveBeenCalled();
    expect(mic.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "해설 녹화 시작" }).hasAttribute("disabled")).toBe(false);
  });

  it.each(["blob", "url"] as const)("최종 %s 생성 실패는 저장하지 않고 마이크와 대기 상태를 정리해 재시도를 허용한다", async (failure) => {
    const mic = microphone(), retryMic = microphone(), save = vi.fn();
    render(<ReviewVoiceCommentaryPanel {...props({ onSaveTrack: save })} />);
    const recorder = await start(mic);
    const chunk = new Blob(["완료 데이터"]);
    act(() => recorder.emitChunk(chunk));
    fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    if (failure === "url") createObjectURL.mockImplementationOnce(() => { throw new Error("URL 생성 실패"); });
    else {
      vi.stubGlobal("Blob", class extends Blob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          throw new Error("Blob 생성 실패");
        }
      });
    }
    act(() => recorder.emitStop());
    expect(save).not.toHaveBeenCalled();
    expect(mic.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("다시 녹화해 주세요");
    expect(screen.getByRole("button", { name: "해설 녹화 시작" }).hasAttribute("disabled")).toBe(false);
    // 실패 뒤에도 새 권한 요청을 시작할 수 있어야 한다. 이전 녹음의 자동 재실행은 아니다.
    await start(retryMic);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: /녹화 종료/ })).toBeTruthy();
  });

  it("실제 인증 UID가 바뀌면 권한 응답을 폐기하며 assignmentId와 UID를 비교하지 않는다", async () => {
    emitSession({ user: { id: "account-A" }, token: null });
    const pending = deferred<MediaStream>(), mic = microphone(), save = vi.fn();
    getUserMedia.mockReturnValueOnce(pending.promise);
    render(<ReviewVoiceCommentaryPanel {...props({ onSaveTrack: save })} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 녹화 시작" }));
    act(() => emitSession({ user: { id: "account-B" }, token: null }));
    await act(async () => { pending.resolve(mic.stream); await pending.promise; });
    expect(mic.stop).toHaveBeenCalledTimes(1);
    expect(ControlledMediaRecorder.instances).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
  });

  it("rerender 없이 동기 발행된 실제 UID A→B→A도 옛 권한 응답을 폐기한다", async () => {
    emitSession({ user: { id: "account-A" }, token: null });
    const pending = deferred<MediaStream>(), mic = microphone(), save = vi.fn();
    getUserMedia.mockReturnValueOnce(pending.promise);
    render(<ReviewVoiceCommentaryPanel {...props({ onSaveTrack: save })} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 녹화 시작" }));
    // 실제 공개 전환 API의 동기 publication을 같은 React 배치 안에서 왕복한다.
    act(() => {
      emitSession({ user: { id: "account-B" }, token: null });
      emitSession({ user: { id: "account-A" }, token: null });
    });
    expect(getAuthUserId()).toBe("account-A");
    await act(async () => { pending.resolve(mic.stream); await pending.promise; });
    expect(mic.stop).toHaveBeenCalledTimes(1);
    expect(ControlledMediaRecorder.instances).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("같은 UID의 프로필·세션 publication은 권한 요청과 진행 중 녹음을 취소하지 않는다", async () => {
    emitSession({ user: { id: "account-A", name: "이전 이름" }, token: null });
    const pending = deferred<MediaStream>(), mic = microphone();
    const save = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onSaveTrack"]>>();
    getUserMedia.mockReturnValueOnce(pending.promise);
    render(<ReviewVoiceCommentaryPanel {...props({ onSaveTrack: save })} />);
    fireEvent.click(screen.getByRole("button", { name: "해설 녹화 시작" }));
    act(() => emitSession({ user: { id: "account-A", name: "갱신한 이름" }, token: null }));
    await act(async () => { pending.resolve(mic.stream); await pending.promise; });
    const recorder = currentRecorder();
    act(() => emitSession({ user: { id: "account-A", name: "새 프로필", image: null }, token: null }));
    expect(getAuthUserId()).toBe("account-A");
    expect(mic.stop).not.toHaveBeenCalled();
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /녹화 종료/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    act(() => { recorder.emitChunk(new Blob(["같은 소유자의 음성"])); recorder.emitStop(); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].authorId).toBe("assignment-1");
    expect(mic.stop).toHaveBeenCalledTimes(1);
  });

  it("인증 UID와 다른 assignmentId 및 null UID 샘플을 그대로 저장한다", async () => {
    emitSession({ user: { id: "account-A" }, token: null });
    const firstMic = microphone(), secondMic = microphone();
    const save = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onSaveTrack"]>>();
    const view = render(<ReviewVoiceCommentaryPanel {...props({ onSaveTrack: save })} />);
    const first = await start(firstMic);
    fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    act(() => { first.emitChunk(new Blob(["실제 계정"])); first.emitStop(); });
    expect(save.mock.calls[0]?.[0].authorId).toBe("assignment-1");
    view.unmount();
    emitSession(null);
    render(<ReviewVoiceCommentaryPanel {...props({ onSaveTrack: save })} />);
    const second = await start(secondMic);
    fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    act(() => { second.emitChunk(new Blob(["샘플"])); second.emitStop(); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0].authorId).toBe("assignment-1");
  });

  it("마지막 chunk까지 합쳐 5MB를 넘으면 안내하고 기존 세션 보관 callback은 한 번 유지한다", async () => {
    const mic = microphone();
    const save = vi.fn<NonNullable<ReviewVoiceCommentaryPanelProps["onSaveTrack"]>>();
    render(<ReviewVoiceCommentaryPanel {...props({ onSaveTrack: save })} />);
    const recorder = await start(mic);
    act(() => recorder.emitChunk(new Blob([new Uint8Array(VOICE_COMMENTARY_MAX_AUDIO_BYTES)])));
    fireEvent.click(screen.getByRole("button", { name: /녹화 종료/ }));
    act(() => { recorder.emitChunk(new Blob([new Uint8Array(1)])); recorder.emitStop(); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[1]?.size).toBe(VOICE_COMMENTARY_MAX_AUDIO_BYTES + 1);
    expect(save.mock.calls[0]?.[0].audio?.kind).toBe("blob");
    expect(screen.getByRole("alert").textContent).toContain("이 탭에서만 들을 수 있어요");
  });
});
