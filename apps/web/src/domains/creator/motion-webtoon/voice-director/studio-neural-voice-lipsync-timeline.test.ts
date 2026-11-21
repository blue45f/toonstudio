import { describe, expect, it } from "vitest";

import {
  auditVoiceCastingRights,
  buildVoiceDirectorTimeline,
  extractKoreanVisemeTrack,
  parseInlineVoiceTags,
  predictKoreanDialogueDurationMs,
  rippleDeleteDialogueClip,
  rippleUpdateDialogueClipText,
  type CharacterVoiceCast,
} from "./studio-neural-voice-lipsync-timeline";

const CASTING_SHEET: readonly CharacterVoiceCast[] = [
  {
    characterId: "hana",
    characterName: "한하나",
    voiceId: "supertonic-ko-female-01",
    voiceLabelKo: "온디바이스 여성 맑은 톤",
    engineKind: "local-onnx",
    defaultEmotion: "neutral",
    emotionIntensity: 1.0,
    speakingRate: 1.0,
    pitchSemitones: 0,
    rightsConsentVerified: true,
  },
  {
    characterId: "minsu",
    characterName: "박민수",
    voiceId: "typecast-ssfm-male-04",
    voiceLabelKo: "외부 성우 중저음",
    engineKind: "typecast-byok",
    defaultEmotion: "angry",
    emotionIntensity: 1.4,
    speakingRate: 1.1,
    pitchSemitones: -1,
    rightsConsentVerified: false,
  },
];

describe("studio-neural-voice-lipsync-timeline", () => {
  it("인라인 오디오 태그 파싱 · 사전 발화 길이 예측 · 한글 자모 Viseme 립싱크를 정확히 생성한다", () => {
    const parsed = parseInlineVoiceTags("[분노 1.7] 잠깐! [한숨] 거기 멈춰 서!", "neutral", 1.0);
    expect(parsed.resolvedEmotion).toBe("angry");
    expect(parsed.resolvedIntensity).toBe(1.7);
    expect(parsed.cleanText).toBe("잠깐! 거기 멈춰 서!");
    expect(parsed.inlineTags).toHaveLength(2);

    const localPred = predictKoreanDialogueDurationMs(parsed.cleanText, parsed.inlineTags, {
      speakingRate: 1.0,
      engineKind: "local-onnx",
    });
    expect(localPred.hangulSyllableCount).toBe(7);
    expect(localPred.predictedDurationMs).toBeGreaterThan(1000);
    expect(localPred.estimatedCredits).toBe(0);

    const byokPred = predictKoreanDialogueDurationMs(parsed.cleanText, parsed.inlineTags, {
      speakingRate: 1.0,
      engineKind: "typecast-byok",
    });
    expect(byokPred.estimatedCredits).toBeGreaterThan(0);

    // 한글 자모 분해: "바보" -> ㅂ(양순 폐쇄) + ㅏ(aa) + ㅂ(양순 폐쇄) + ㅗ(oh)
    const visemes = extractKoreanVisemeTrack("바보", 0, 600);
    const visemeTypes = visemes.map((k) => k.viseme);
    expect(visemeTypes).toContain("closed");
    expect(visemeTypes).toContain("aa");
    expect(visemeTypes).toContain("oh");
  });

  it("다중 트랙 타임라인 구축 후 대사 수정·삭제 시 후속 클립과 SFX가 탄성 리플 동기화된다", () => {
    const timeline = buildVoiceDirectorTimeline(
      [
        { id: "c1", cutId: "cut-01", characterId: "hana", rawText: "두근두근 심장이 뛰어!" },
        { id: "c2", cutId: "cut-02", characterId: "minsu", rawText: "[속삭임 1.2] 쾅 소리가 났어." },
        { id: "c3", cutId: "cut-03", characterId: "hana", rawText: "어둠 속에서 누군가 온다." },
      ],
      CASTING_SHEET,
      { gapMs: 300 },
    );

    expect(timeline.clips).toHaveLength(3);
    expect(timeline.clips[1]!.startMs).toBe(timeline.clips[0]!.endMs + 300);
    expect(timeline.sfxTracks.some((s) => s.kind === "heartbeat" && s.clipId === "c1")).toBe(true);
    expect(timeline.sfxTracks.some((s) => s.kind === "impact" && s.clipId === "c2")).toBe(true);

    // 1번 대사를 훨씬 길게 수정 → 2번·3번 클립과 SFX가 정확히 deltaMs만큼 밀린다
    const oldClip2Start = timeline.clips[1]!.startMs;
    const oldClip1Dur = timeline.clips[0]!.durationMs;
    const expanded = rippleUpdateDialogueClipText(
      timeline,
      "c1",
      "두근두근 심장이 너무 빠르게 뛰어서 숨을 고르기조차 어려워!",
      CASTING_SHEET,
    );
    const delta = expanded.clips[0]!.durationMs - oldClip1Dur;
    expect(delta).toBeGreaterThan(500);
    expect(expanded.clips[1]!.startMs).toBe(oldClip2Start + delta);

    // 2번 클립 삭제 → 3번 클립이 1번 클립 뒤로 정확히 당겨진다
    const afterDelete = rippleDeleteDialogueClip(expanded, "c2");
    expect(afterDelete.clips.map((c) => c.id)).toEqual(["c1", "c3"]);
    expect(afterDelete.clips[1]!.startMs).toBe(afterDelete.clips[0]!.endMs + 300);
    expect(afterDelete.sfxTracks.some((s) => s.clipId === "c2")).toBe(false);

    // Rights BOM 동의 감사
    const audit = auditVoiceCastingRights(CASTING_SHEET);
    expect(audit.ok).toBe(false);
    expect(audit.unverifiedCharacterIds).toEqual(["minsu"]);
  });
});
