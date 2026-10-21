import { describe, expect, it } from "vitest";

import {
  VOICE_COMMENTARY_DEFAULT_RETENTION_DAYS,
  VOICE_COMMENTARY_MAX_AUDIO_BYTES,
  VOICE_COMMENTARY_MAX_RETENTION_DAYS,
  finishVoiceRecording,
  parseVoiceCommentaryTrack,
  recordVoiceKeyframe,
  serializeVoiceCommentaryTrack,
  startVoiceRecording,
  voiceCommentaryAudioSizeProblem,
  voiceCommentaryRetentionExpiresAt,
  voicePlaybackCueAt,
  voiceSeekCue,
  voiceTracksForEpisode,
  type VoiceCommentaryTrack,
  type VoiceViewSnapshot,
} from "./review-voice-commentary-model";

/**
 * C4 운영 시나리오 (2026-10-22) — 단위 테스트가 조각별로 고정한 계약을
 * "녹화 → 공유 → 재생 시 해당 위치 자동 이동" 한 흐름으로 이어 검증한다.
 * 호스트(ProductionEpisodeReviewRoom)의 captureView/onApplyView 어댑터가
 * 실제로 하는 일을 순수 모델 수준에서 재현한다: 녹화 중 샘플링된 화면을
 * 키프레임으로 쌓고, 공유는 직렬화 왕복이며, 재생은 큐를 호스트 적용
 * 목록으로 수집하는 것이다.
 */

const compareView: VoiceViewSnapshot = {
  surface: "compare", poolItemId: "pool-1", pageId: null, mode: "panes", scale: 1, tx: 0, ty: 0,
};
const manuscriptView: VoiceViewSnapshot = {
  surface: "manuscript", poolItemId: null, pageId: "page-2", mode: null, scale: 1, tx: 0.25, ty: 0.5,
};

function recordScenarioTrack(): VoiceCommentaryTrack {
  let session = startVoiceRecording({
    episodeId: "ep-1",
    startedAt: "2026-10-22T00:00:00.000Z",
    initialView: compareView,
    initialPinThreadIds: ["pin-compare-1"],
  });
  // 500ms 샘플이 같은 화면을 다시 찍어도 키프레임은 늘지 않는다.
  session = recordVoiceKeyframe(session, 500, compareView, ["pin-compare-1"]);
  // 검수자가 원고 페이지로 이동해 말을 이어 간다.
  session = recordVoiceKeyframe(session, 2_000, manuscriptView, ["pin-page-1"]);
  return finishVoiceRecording({
    session,
    id: "voice-scenario-1",
    authorName: "검수자",
    durationMs: 4_000,
    audio: { kind: "blob", url: "blob:https://example.invalid/local", mimeType: "audio/webm", byteSize: 2_048 },
  });
}

describe("C4 음성 해설 시나리오: 녹화 → 공유 → 재생 자동 이동", () => {
  it("녹화한 해설을 공유(직렬화 왕복)하면 위치·핀 묶음이 그대로고 재생 큐가 그 위치로 이동시킨다", () => {
    const recorded = recordScenarioTrack();
    expect(recorded.keyframes.map((kf) => kf.atMs)).toEqual([0, 2_000]);
    expect(recorded.pinThreadIds).toEqual(["pin-compare-1", "pin-page-1"]);

    // 공유 단계: 서버 저장본은 server 참조로 교체돼 왕복을 견디고,
    // blob 참조본은 오디오만 탈락하고 위치 기록은 남는다(기기 밖 무효 링크를 남기지 않음).
    const serverShared = parseVoiceCommentaryTrack(serializeVoiceCommentaryTrack({
      ...recorded,
      audio: { kind: "server", url: "https://example.invalid/voice-scenario-1.webm", mimeType: "audio/webm", byteSize: 2_048 },
    }));
    expect(serverShared?.audio?.kind).toBe("server");
    const blobShared = parseVoiceCommentaryTrack(serializeVoiceCommentaryTrack(recorded));
    expect(blobShared?.audio).toBeNull();
    expect(blobShared?.keyframes).toEqual(recorded.keyframes);

    // 재생 단계: 호스트가 큐를 적용한 결과(적용 화면 목록)를 수집한다.
    const shared = serverShared!;
    const applied: Array<{ atMs: number; view: VoiceViewSnapshot | null; pins: readonly string[] }> = [];
    for (const atMs of [0, 1_000, 2_000, 3_500]) {
      const cue = voicePlaybackCueAt(shared, atMs);
      applied.push({ atMs, view: cue.view, pins: cue.pinThreadIds });
    }
    // 0ms: 녹화 시작 위치(비교 화면·비교 핀)로 즉시 이동한다.
    expect(applied[0]?.view).toMatchObject({ surface: "compare", poolItemId: "pool-1" });
    expect(applied[0]?.pins).toEqual(["pin-compare-1"]);
    // 1초: 표면이 바뀌는 다음 키프레임 전이라 점프하지 않고 비교 화면을 유지한다.
    expect(applied[1]?.view?.surface).toBe("compare");
    // 2초: 원고 페이지 키프레임에 닿으면 페이지·스크롤·핀이 함께 바뀐다.
    expect(applied[2]?.view).toMatchObject({ surface: "manuscript", pageId: "page-2", tx: 0.25, ty: 0.5 });
    expect(applied[2]?.pins).toEqual(["pin-page-1"]);
    expect(applied[3]?.view?.pageId).toBe("page-2");
    // 탐색(seek)도 같은 큐를 써서 2초 지점으로 즉시 이동한다.
    expect(voiceSeekCue(shared, 2_000).view?.pageId).toBe("page-2");
  });

  it("해설이 없는 회차에서는 트랙 조회가 비어 핀 흐름이 종전대로 독립 동작한다", () => {
    const recorded = recordScenarioTrack();
    // 다른 회차의 트랙은 이 회차 목록에 섞이지 않는다.
    expect(voiceTracksForEpisode([recorded], "ep-other")).toEqual([]);
    expect(voiceTracksForEpisode([], "ep-1")).toEqual([]);
    // 키프레임 없는(위치 기록 없는) 트랙은 이동 큐를 만들지 않아 화면을 건드리지 않는다.
    const silent = finishVoiceRecording({
      session: startVoiceRecording({
        episodeId: "ep-1", startedAt: "2026-10-22T00:00:00.000Z", initialView: compareView,
      }),
      id: "voice-silent", authorName: "검수자", durationMs: 0,
    });
    expect(silent.keyframes).toHaveLength(1);
    const noFrames = { ...silent, keyframes: [] as const };
    expect(voicePlaybackCueAt(noFrames, 0).view).toBeNull();
  });

  it("저장 용량·보관 정책이 코드 상수와 서버 계약 값(5MB·기본 14일·최대 30일)으로 고정된다", () => {
    expect(VOICE_COMMENTARY_MAX_AUDIO_BYTES).toBe(5 * 1024 * 1024);
    expect(VOICE_COMMENTARY_DEFAULT_RETENTION_DAYS).toBe(14);
    expect(VOICE_COMMENTARY_MAX_RETENTION_DAYS).toBe(30);
    expect(voiceCommentaryAudioSizeProblem(VOICE_COMMENTARY_MAX_AUDIO_BYTES)).toBeNull();
    expect(voiceCommentaryAudioSizeProblem(VOICE_COMMENTARY_MAX_AUDIO_BYTES + 1)).toBe("too-large");
    expect(voiceCommentaryAudioSizeProblem(null)).toBeNull();
    // 보관 만료: 기본 14일, 요청값은 1..30일로 붙는다.
    expect(voiceCommentaryRetentionExpiresAt("2026-10-01T00:00:00.000Z")).toBe("2026-10-15T00:00:00.000Z");
    expect(voiceCommentaryRetentionExpiresAt("2026-10-01T00:00:00.000Z", 90)).toBe("2026-10-31T00:00:00.000Z");
    expect(voiceCommentaryRetentionExpiresAt("2026-10-01T00:00:00.000Z", 7)).toBe("2026-10-08T00:00:00.000Z");
    expect(voiceCommentaryRetentionExpiresAt("not-a-date")).toBeNull();
  });
});
