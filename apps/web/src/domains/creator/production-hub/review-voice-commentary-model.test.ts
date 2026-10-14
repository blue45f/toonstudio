import { describe, expect, it } from "vitest";

import {
  createVoiceCommentaryTrack,
  finishVoiceRecording,
  formatVoiceTime,
  mergeVoiceCommentaryTracks,
  parseVoiceCommentaryTrack,
  recordVoiceKeyframe,
  serializeVoiceCommentaryTrack,
  startVoiceRecording,
  voicePlaybackCueAt,
  voiceTracksForEpisode,
  type VoiceViewSnapshot,
} from "./review-voice-commentary-model";

const viewA: VoiceViewSnapshot = { surface: "compare", poolItemId: "pool-1", pageId: null, mode: "panes", scale: 1, tx: 0, ty: 0 };
const viewB: VoiceViewSnapshot = { surface: "compare", poolItemId: "pool-1", pageId: null, mode: "panes", scale: 2, tx: 0.5, ty: 0 };

describe("review-voice-commentary-model", () => {
  it("녹화 시작 키프레임(0ms)을 반드시 남기고 중복 화면은 다시 찍지 않는다", () => {
    const session = startVoiceRecording({ episodeId: "ep-1", startedAt: "2026-10-14T00:00:00Z", initialView: viewA, initialPinThreadIds: ["t1"] });
    expect(session.keyframes).toHaveLength(1);
    expect(recordVoiceKeyframe(session, 500, viewA, ["t1"])).toBe(session);
    const moved = recordVoiceKeyframe(session, 1000, viewB, ["t2"]);
    expect(moved.keyframes).toHaveLength(2);
    expect(moved.keyframes[1].pinThreadIds).toEqual(["t2"]);
  });

  it("종료 시 키프레임이 시각 순으로 정규화되고 핀 묶음이 합집합으로 남는다", () => {
    const track = createVoiceCommentaryTrack({
      id: "v1",
      episodeId: "ep-1",
      authorName: "검수자",
      createdAt: "2026-10-14T00:00:00Z",
      durationMs: 3000,
      keyframes: [
        { atMs: 2000, view: viewB, pinThreadIds: ["t2", "t1"] },
        { atMs: 0, view: viewA, pinThreadIds: ["t1"] },
      ],
    });
    expect(track.keyframes.map((k) => k.atMs)).toEqual([0, 2000]);
    expect(track.pinThreadIds).toEqual(["t1", "t2"]);
  });

  it("재생 큐는 같은 소스 안에서 뷰포트를 보간하고 소스가 바뀌면 점프한다", () => {
    const track = createVoiceCommentaryTrack({
      id: "v1",
      episodeId: "ep-1",
      authorName: "검수자",
      createdAt: "2026-10-14T00:00:00Z",
      durationMs: 4000,
      keyframes: [
        { atMs: 0, view: viewA, pinThreadIds: ["t1"] },
        { atMs: 2000, view: viewB, pinThreadIds: ["t2"] },
        { atMs: 3000, view: { ...viewB, poolItemId: "pool-2" }, pinThreadIds: [] },
      ],
    });
    const mid = voicePlaybackCueAt(track, 1000);
    expect(mid.keyframeIndex).toBe(0);
    expect(mid.view?.scale).toBeCloseTo(1.5);
    expect(mid.pinThreadIds).toEqual(["t1"]);
    const after = voicePlaybackCueAt(track, 2500);
    expect(after.view?.poolItemId).toBe("pool-1");
    expect(after.pinThreadIds).toEqual(["t2"]);
    expect(voicePlaybackCueAt(track, 3000).view?.poolItemId).toBe("pool-2");
  });

  it("키프레임이 없는 트랙은 이동 큐를 만들지 않는다(기존 핀 흐름과 공존)", () => {
    const track = createVoiceCommentaryTrack({
      id: "v0", episodeId: "ep-1", authorName: "검수자", createdAt: "2026-10-14T00:00:00Z", durationMs: 0, keyframes: [],
    });
    expect(voicePlaybackCueAt(track, 0)).toEqual({ keyframeIndex: -1, view: null, pinThreadIds: [], nextKeyframeInMs: null });
    expect(voiceTracksForEpisode([], "ep-1")).toEqual([]);
  });

  it("직렬화 왕복에서 server 오디오는 유지되고 blob 오디오는 탈락한다", () => {
    const base = {
      id: "v1", episodeId: "ep-1", authorName: "검수자", createdAt: "2026-10-14T00:00:00Z", durationMs: 1000,
      keyframes: [{ atMs: 0, view: viewA, pinThreadIds: [] }],
    };
    const server = createVoiceCommentaryTrack({ ...base, audio: { kind: "server", url: "https://example.invalid/a.webm", mimeType: "audio/webm", byteSize: 10 } });
    expect(parseVoiceCommentaryTrack(serializeVoiceCommentaryTrack(server))?.audio?.kind).toBe("server");
    const blob = createVoiceCommentaryTrack({ ...base, audio: { kind: "blob", url: "blob:https://example.invalid/x", mimeType: null, byteSize: 10 } });
    expect(parseVoiceCommentaryTrack(serializeVoiceCommentaryTrack(blob))?.audio).toBeNull();
    expect(parseVoiceCommentaryTrack("{broken")).toBeNull();
    expect(parseVoiceCommentaryTrack(null)).toBeNull();
  });

  it("서버 목록 병합은 같은 id를 서버본으로 교체하고 세션 전용 트랙을 보존한다", () => {
    const base = {
      episodeId: "ep-1", authorName: "검수자", createdAt: "2026-10-14T00:00:00Z", durationMs: 1000,
      keyframes: [{ atMs: 0, view: viewA, pinThreadIds: [] }],
    };
    const staleServer = createVoiceCommentaryTrack({ ...base, id: "v1", audio: { kind: "server", url: "https://example.invalid/old.webm", mimeType: "audio/webm", byteSize: 10 } });
    const sessionOnly = createVoiceCommentaryTrack({ ...base, id: "v2", audio: { kind: "blob", url: "blob:https://example.invalid/x", mimeType: null, byteSize: 10 } });
    const freshServer = createVoiceCommentaryTrack({ ...base, id: "v1", audio: { kind: "server", url: "https://example.invalid/new.webm", mimeType: "audio/webm", byteSize: 10 } });
    const newServer = createVoiceCommentaryTrack({ ...base, id: "v3", audio: { kind: "server", url: "https://example.invalid/v3.webm", mimeType: "audio/webm", byteSize: 10 } });

    const merged = mergeVoiceCommentaryTracks([staleServer, sessionOnly], [freshServer, newServer]);
    expect(merged.map((track) => track.id)).toEqual(["v1", "v2", "v3"]);
    expect(merged[0]?.audio?.url).toBe("https://example.invalid/new.webm");
    expect(merged[1]).toBe(sessionOnly);
    // 빈 서버 목록은 세션 상태를 그대로 돌려준다(복사본).
    expect(mergeVoiceCommentaryTracks([sessionOnly], [])).toEqual([sessionOnly]);
  });

  it("녹화 종료 헬퍼와 시간 표기가 동작한다", () => {
    const session = startVoiceRecording({ episodeId: "ep-9", startedAt: "2026-10-14T00:00:00Z", initialView: viewA });
    const track = finishVoiceRecording({ session, id: "v9", authorName: "검수자", durationMs: 65_000 });
    expect(track.episodeId).toBe("ep-9");
    expect(formatVoiceTime(65_000)).toBe("1:05");
    expect(formatVoiceTime(0)).toBe("0:00");
  });
});
