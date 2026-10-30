// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emitSession } from "@/domains/auth/public/session/auth-session-state";
import { addStudioCommentThread, createEmptyStudioCommentsDocument } from "../studio-comments";
import {
  listProductionVoiceCommentaries,
  readProductionVoiceCommentary,
  uploadProductionVoiceCommentary,
  type ProductionVoiceCommentaryRead,
  type ProductionVoiceCommentaryView,
} from "./production-voice-commentary-api";
import { VOICE_COMMENTARY_MAX_AUDIO_BYTES, type VoiceCommentaryTrack, type VoiceViewSnapshot } from "./review-voice-commentary-model";
import { useEpisodeVoiceCommentary, type EpisodeVoiceCommentaryHostInput } from "./use-episode-voice-commentary";

vi.mock("./production-voice-commentary-api", () => ({
  listProductionVoiceCommentaries: vi.fn(),
  readProductionVoiceCommentary: vi.fn(),
  uploadProductionVoiceCommentary: vi.fn(),
}));

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Promise가 아직 초기화되지 않았습니다."); };
  let reject: (reason: Error) => void = () => { throw new Error("Promise가 아직 초기화되지 않았습니다."); };
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

function track(kind: "blob" | "server" = "blob", url = kind === "blob" ? "blob:voice-local" : "https://example.test/voice-expired.webm"): VoiceCommentaryTrack {
  return { version: 1, id: "voice-1", episodeId: "episode-1", authorId: "assignment-1", authorName: "검수자",
    createdAt: "2026-10-30T00:00:00.000Z", durationMs: 1000,
    audio: { kind, url, mimeType: "audio/webm", byteSize: 10 }, keyframes: [], pinThreadIds: [] };
}

function view(source: VoiceCommentaryTrack): ProductionVoiceCommentaryView {
  return { track: source, canDelete: true };
}

function readResult(source: VoiceCommentaryTrack): ProductionVoiceCommentaryRead {
  return { ...view(source), signedRead: { url: "https://example.test/current-read.webm", expiresAtEpochMs: Date.now() + 300_000 } };
}

function input(overrides: Partial<EpisodeVoiceCommentaryHostInput> = {}): EpisodeVoiceCommentaryHostInput {
  return { projectId: "project-1", episodeId: "episode-1", isDemo: false, tab: "viewer", comments: null,
    compareItems: [], pageId: "page-1", panelRef: { current: null }, programmaticScrollRef: { current: false },
    setTab: vi.fn(), ...overrides };
}

describe("회차 해설 호스트의 Blob 소유권과 현재 권한 재생", () => {
  const revoke = vi.fn();
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

  beforeEach(() => {
    emitSession({ user: { id: "account-A" }, token: null });
    vi.mocked(listProductionVoiceCommentaries).mockReset().mockResolvedValue({ items: [] });
    vi.mocked(readProductionVoiceCommentary).mockReset();
    vi.mocked(uploadProductionVoiceCommentary).mockReset();
    revoke.mockReset();
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  });

  afterEach(() => {
    cleanup(); emitSession(null); vi.restoreAllMocks();
    if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke);
    else Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("비교 댓글에만 있는 핀을 열면 마지막 비교 화면과 핀을 적용하고 비교 탭으로 이동한다", () => {
    const setTab = vi.fn(), applyCompareView = vi.fn();
    const compareComments = addStudioCommentThread(createEmptyStudioCommentsDocument(), {
      id: "compare-pin", anchor: { type: "compare-image", poolItemId: "revision:line:rev-1", x: 0.3, y: 0.4 },
      author: { id: "reviewer", displayName: "검수자" }, body: "이 버전의 손 위치를 확인해 주세요.",
    }, new Date("2026-10-30T00:00:00.000Z"));
    const captured: VoiceViewSnapshot = {
      surface: "compare", poolItemId: "revision:line:rev-1", pageId: null,
      mode: "overlay", scale: 3, tx: -0.25, ty: 0.5,
    };
    const { result } = renderHook(() => useEpisodeVoiceCommentary(input({
      isDemo: true, comments: createEmptyStudioCommentsDocument(), compareComments, setTab, applyCompareView,
    })));
    act(() => result.current.applyVoiceView(captured, []));
    setTab.mockClear(); applyCompareView.mockClear();
    act(() => result.current.handleOpenVoicePin("compare-pin"));
    expect(setTab.mock.calls).toEqual([["compare"]]);
    expect(applyCompareView).toHaveBeenCalledTimes(1);
    expect(applyCompareView).toHaveBeenCalledWith(captured, ["compare-pin"]);
    expect(result.current.voicePinIds).toEqual(["compare-pin"]);
  });

  it("비교 화면 뒤 원고 화면을 적용하면 비교 어댑터에도 원고 전환을 전달한다", () => {
    const setTab = vi.fn(), applyCompareView = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 0));
    try {
      const compare: VoiceViewSnapshot = {
        surface: "compare", poolItemId: "revision:line:rev-1", pageId: null, mode: "panes", scale: 2, tx: 0.1, ty: 0.2,
      };
      const manuscript: VoiceViewSnapshot = {
        surface: "manuscript", poolItemId: null, pageId: "page-2", mode: null, scale: 1, tx: 0, ty: 0.75,
      };
      const { result } = renderHook(() => useEpisodeVoiceCommentary(input({ isDemo: true, setTab, applyCompareView })));
      act(() => result.current.applyVoiceView(compare, ["compare-pin"]));
      act(() => result.current.applyVoiceView(manuscript, ["manuscript-pin"]));
      expect(applyCompareView).toHaveBeenNthCalledWith(1, compare, ["compare-pin"]);
      expect(applyCompareView).toHaveBeenNthCalledWith(2, manuscript, ["manuscript-pin"]);
      expect(applyCompareView).toHaveBeenCalledTimes(2);
      expect(setTab.mock.calls).toEqual([["compare"], ["viewer"]]);
      expect(result.current.voicePinIds).toEqual(["manuscript-pin"]);
    } finally { vi.unstubAllGlobals(); }
  });

  it("서버본으로 바뀐 로컬 음성 URL은 화면 참조가 바뀐 뒤 한 번 해제한다", async () => {
    const pending = deferred<{ view: ProductionVoiceCommentaryView; replayed: boolean }>();
    vi.mocked(uploadProductionVoiceCommentary).mockReturnValueOnce(pending.promise);
    const local = track(), stored = track("server", "https://example.test/uploaded.webm");
    const { result, unmount } = renderHook(() => useEpisodeVoiceCommentary(input()));
    act(() => result.current.handleSaveVoiceTrack(local, new Blob(["음성"])));
    expect(result.current.voiceTracks[0]?.audio?.url).toBe(local.audio?.url);
    expect(revoke).not.toHaveBeenCalled();
    await act(async () => { pending.resolve({ view: view(stored), replayed: false }); await pending.promise; });
    expect(result.current.voiceTracks[0]?.audio?.kind).toBe("server");
    expect(result.current.voiceTracks[0]?.audio?.url).toBe(stored.audio?.url);
    expect(revoke.mock.calls).toEqual([[local.audio?.url]]);
    unmount();
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it.each(["upload-failed", "too-large"] as const)("%s이면 로컬 해설을 유지하고 호스트 해제 때 정리한다", async (failure) => {
    vi.mocked(uploadProductionVoiceCommentary).mockRejectedValueOnce(new Error("서버에 보관하지 못했습니다."));
    const local = track();
    const blob = failure === "too-large" ? new Blob([new Uint8Array(VOICE_COMMENTARY_MAX_AUDIO_BYTES + 1)]) : new Blob(["음성"]);
    const { result, unmount } = renderHook(() => useEpisodeVoiceCommentary(input()));
    await act(async () => { result.current.handleSaveVoiceTrack(local, blob); await Promise.resolve(); });
    expect(result.current.voiceTracks[0]?.audio?.url).toBe(local.audio?.url);
    expect(result.current.voiceSaveError).toBeTruthy();
    expect(revoke).not.toHaveBeenCalled();
    unmount();
    expect(revoke.mock.calls).toEqual([[local.audio?.url]]);
  });

  it("패널만 닫아도 세션 해설은 유지하고 호스트 이탈 후 늦은 업로드는 다시 붙이지 않는다", async () => {
    const pending = deferred<{ view: ProductionVoiceCommentaryView; replayed: boolean }>();
    vi.mocked(uploadProductionVoiceCommentary).mockReturnValueOnce(pending.promise);
    const local = track();
    const { result, unmount } = renderHook(() => useEpisodeVoiceCommentary(input()));
    act(() => result.current.handleSaveVoiceTrack(local, new Blob(["음성"])));
    act(() => result.current.setVoicePanelOpen(false));
    expect(result.current.voiceTracks[0]?.audio?.url).toBe(local.audio?.url);
    expect(revoke).not.toHaveBeenCalled();
    const uploadSignal = vi.mocked(uploadProductionVoiceCommentary).mock.calls[0]?.[1];
    unmount();
    expect(uploadSignal?.aborted).toBe(true);
    expect(revoke.mock.calls).toEqual([[local.audio?.url]]);
    await act(async () => { pending.resolve({ view: view(track("server")), replayed: false }); await pending.promise; });
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("같은 id로 새 로컬 음성이 들어오면 이전 업로드가 새 폴백을 덮어쓰지 않는다", async () => {
    const first = deferred<{ view: ProductionVoiceCommentaryView; replayed: boolean }>();
    const second = deferred<{ view: ProductionVoiceCommentaryView; replayed: boolean }>();
    vi.mocked(uploadProductionVoiceCommentary).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const oldLocal = track("blob", "blob:first"), newLocal = track("blob", "blob:second");
    const { result, unmount } = renderHook(() => useEpisodeVoiceCommentary(input()));
    act(() => result.current.handleSaveVoiceTrack(oldLocal, new Blob(["이전"])));
    act(() => result.current.handleSaveVoiceTrack(newLocal, new Blob(["새 녹음"])));
    expect(result.current.voiceTracks[0]?.audio?.url).toBe("blob:second");
    await act(async () => { first.resolve({ view: view(track("server", "https://example.test/first.webm")), replayed: false }); await first.promise; });
    expect(result.current.voiceTracks[0]?.audio?.url).toBe("blob:second");
    expect(revoke.mock.calls).toEqual([["blob:first"]]);
    await act(async () => { second.reject(new Error("연결이 끊겼습니다.")); await second.promise.catch(() => undefined); });
    expect(result.current.voiceTracks[0]?.audio?.url).toBe("blob:second");
    unmount();
    expect(revoke.mock.calls).toEqual([["blob:first"], ["blob:second"]]);
  });

  it("같은 계정의 프로필 갱신은 업로드와 로컬 보관을 취소하지 않는다", async () => {
    const pending = deferred<{ view: ProductionVoiceCommentaryView; replayed: boolean }>();
    vi.mocked(uploadProductionVoiceCommentary).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useEpisodeVoiceCommentary(input()));
    act(() => result.current.handleSaveVoiceTrack(track(), new Blob(["음성"])));
    act(() => emitSession({ user: { id: "account-A", name: "새 이름" }, token: null }));
    expect(revoke).not.toHaveBeenCalled();
    expect(vi.mocked(uploadProductionVoiceCommentary).mock.calls[0]?.[1]?.aborted).toBe(false);
    await act(async () => { pending.resolve({ view: view(track("server")), replayed: false }); await pending.promise; });
    expect(result.current.voiceTracks[0]?.audio?.kind).toBe("server");
  });

  it("재생할 때 현재 권한을 다시 읽고 갱신된 서명 주소를 반환한다", async () => {
    const source = track("server"), read = readResult(track("server", "https://example.test/view-fresh.webm"));
    vi.mocked(listProductionVoiceCommentaries).mockResolvedValueOnce({ items: [view(source)] });
    vi.mocked(readProductionVoiceCommentary).mockResolvedValueOnce(read);
    const { result } = renderHook(() => useEpisodeVoiceCommentary(input()));
    await act(async () => { await Promise.resolve(); });
    const controller = new AbortController();
    let prepared: VoiceCommentaryTrack | null = null;
    await act(async () => { prepared = await result.current.handlePrepareVoicePlayback(source, controller.signal); });
    expect(readProductionVoiceCommentary).toHaveBeenCalledWith("project-1", "episode-1", "voice-1", expect.any(AbortSignal));
    expect(prepared).toMatchObject({ id: source.id, episodeId: source.episodeId, audio: { kind: "server", url: read.signedRead.url } });
    expect(result.current.voiceTracks[0]?.audio?.url).toBe(read.signedRead.url);
  });

  it("로컬 음성은 서버 읽기를 추가하지 않고 그대로 재생 준비를 마친다", async () => {
    const source = track();
    const { result } = renderHook(() => useEpisodeVoiceCommentary(input({ isDemo: true })));
    act(() => result.current.handleSaveVoiceTrack(source, new Blob(["음성"])));
    const prepared = await result.current.handlePrepareVoicePlayback(source, new AbortController().signal);
    expect(prepared).toBe(source);
    expect(readProductionVoiceCommentary).not.toHaveBeenCalled();
  });

  it("읽기 실패를 호출자에게 전달하고 기존 해설을 성공 응답으로 바꾸지 않는다", async () => {
    const source = track("server");
    vi.mocked(listProductionVoiceCommentaries).mockResolvedValueOnce({ items: [view(source)] });
    vi.mocked(readProductionVoiceCommentary).mockRejectedValueOnce(new Error("접근 권한이 없습니다."));
    const { result } = renderHook(() => useEpisodeVoiceCommentary(input()));
    await act(async () => { await Promise.resolve(); });
    await expect(result.current.handlePrepareVoicePlayback(source, new AbortController().signal)).rejects.toThrow("접근 권한이 없습니다.");
    expect(result.current.voiceTracks[0]?.audio?.url).toBe(source.audio?.url);
    expect(readProductionVoiceCommentary).toHaveBeenCalledTimes(1);
  });

  it.each(["id", "episode", "audio"] as const)("읽기 응답의 %s가 바뀌면 다른 해설을 재생하거나 목록에 적용하지 않는다", async (changed) => {
    const source = track("server");
    const mismatched: VoiceCommentaryTrack = {
      ...source,
      id: changed === "id" ? "another-track" : source.id,
      episodeId: changed === "episode" ? "another-episode" : source.episodeId,
      audio: changed === "audio" ? null : source.audio,
    };
    vi.mocked(listProductionVoiceCommentaries).mockResolvedValueOnce({ items: [view(source)] });
    vi.mocked(readProductionVoiceCommentary).mockResolvedValueOnce(readResult(mismatched));
    const { result } = renderHook(() => useEpisodeVoiceCommentary(input()));
    await act(async () => { await Promise.resolve(); });
    await expect(result.current.handlePrepareVoicePlayback(source, new AbortController().signal)).rejects.toBeInstanceOf(Error);
    expect(result.current.voiceTracks).toEqual([source]);
  });

  it("선택 해제 신호는 읽기 요청을 취소하고 늦은 응답을 반환하지 않는다", async () => {
    const pending = deferred<ProductionVoiceCommentaryRead>(), source = track("server");
    vi.mocked(listProductionVoiceCommentaries).mockResolvedValueOnce({ items: [view(source)] });
    vi.mocked(readProductionVoiceCommentary).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useEpisodeVoiceCommentary(input()));
    await act(async () => { await Promise.resolve(); });
    const controller = new AbortController();
    const prepared = result.current.handlePrepareVoicePlayback(source, controller.signal).then(
      (value) => ({ kind: "resolved" as const, value }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    );
    controller.abort();
    expect(vi.mocked(readProductionVoiceCommentary).mock.calls[0]?.[3]?.aborted).toBe(true);
    await act(async () => { pending.resolve(readResult(source)); await pending.promise; });
    expect((await prepared).kind).toBe("rejected");
    expect(result.current.voiceTracks[0]?.audio?.url).toBe(source.audio?.url);
  });

  it("UID A→B→A 뒤 이전 읽기와 업로드는 같은 계정으로 돌아와도 되살아나지 않는다", async () => {
    const reading = deferred<ProductionVoiceCommentaryRead>();
    const uploading = deferred<{ view: ProductionVoiceCommentaryView; replayed: boolean }>();
    const source = track("server"), local = { ...track(), id: "voice-local" };
    vi.mocked(listProductionVoiceCommentaries).mockResolvedValueOnce({ items: [view(source)] });
    vi.mocked(readProductionVoiceCommentary).mockReturnValueOnce(reading.promise);
    vi.mocked(uploadProductionVoiceCommentary).mockReturnValueOnce(uploading.promise);
    const { result } = renderHook(() => useEpisodeVoiceCommentary(input()));
    await act(async () => { await Promise.resolve(); });
    act(() => result.current.handleSaveVoiceTrack(local, new Blob(["이전 계정 음성"])));
    const prepared = result.current.handlePrepareVoicePlayback(source, new AbortController().signal).then(
      (value) => ({ kind: "resolved" as const, value }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    );
    act(() => {
      emitSession({ user: { id: "account-B" }, token: null });
      emitSession({ user: { id: "account-A" }, token: null });
    });
    expect(vi.mocked(readProductionVoiceCommentary).mock.calls[0]?.[3]?.aborted).toBe(true);
    expect(vi.mocked(uploadProductionVoiceCommentary).mock.calls[0]?.[1]?.aborted).toBe(true);
    await act(async () => {
      reading.resolve(readResult(source)); uploading.resolve({ view: view({ ...track("server"), id: local.id }), replayed: false });
      await Promise.all([reading.promise, uploading.promise]);
    });
    expect((await prepared).kind).toBe("rejected");
    expect(result.current.voiceTracks).toEqual([]);
    expect(revoke.mock.calls).toEqual([[local.audio?.url]]);
  });
});
