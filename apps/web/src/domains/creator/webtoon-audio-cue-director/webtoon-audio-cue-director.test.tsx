// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUDIO_CUE_DATA_SOURCE_KIND,
  AUDIO_CUE_EPISODE_PRESETS,
  DEFAULT_DIALOGUE_DUCKING_DB,
  HANGUL_SYLLABLE_END,
  HANGUL_SYLLABLE_START,
  LIP_SYNC_VISEMES,
  StudioWebtoonAudioCuePanel,
  TARGET_BGM_LUFS,
  buildEpisodeAudioCueSheet,
  decomposeHangulSyllable,
  exportAudioCueJson,
  exportAudioCueWebVtt,
  formatSmpteTimecode,
  formatWebVttTimestamp,
  getAudioCueEpisodePreset,
  synthesizeKoreanLipSyncTimeline,
  type AudioCueCutInput,
} from "./index";

afterEach(cleanup);

function makeCut(overrides: Partial<AudioCueCutInput> & { readonly id: string }): AudioCueCutInput {
  return {
    id: overrides.id,
    label: overrides.label ?? `컷 ${overrides.id}`,
    panelHeightPx: overrides.panelHeightPx ?? 1000,
    speaker: overrides.speaker ?? "주인공",
    dialogue: overrides.dialogue ?? "지금 바로 출발하자!",
    emotionTone: overrides.emotionTone ?? "calm",
    syllablesPerSecond: overrides.syllablesPerSecond,
    bgmMood: overrides.bgmMood ?? "mystery-pulse",
    crossfadeMs: overrides.crossfadeMs,
    minCutDurationMs: overrides.minCutDurationMs,
    sfxMarkers: overrides.sfxMarkers,
  };
}

describe("1. 한국어 유니코드 한글 자모 분해(0xAC00..0xD7A3) 및 7대 립싱크 비젬 엔진", () => {
  it("0xAC00('가')과 0xD7A3('힣') 경계 음절을 정확히 정수 분해하고 범위 밖 문자는 null을 반환한다", () => {
    const ga = decomposeHangulSyllable("가");
    expect(ga).not.toBeNull();
    expect(ga?.codePoint).toBe(HANGUL_SYLLABLE_START);
    expect(ga?.choseong).toBe("ㄱ");
    expect(ga?.jungseong).toBe("ㅏ");
    expect(ga?.jongseong).toBe("");
    expect(ga?.vowelViseme).toBe("A");
    expect(ga?.hasBilabialOnset).toBe(false);
    expect(ga?.hasBilabialCoda).toBe(false);

    const hih = decomposeHangulSyllable("힣");
    expect(hih).not.toBeNull();
    expect(hih?.codePoint).toBe(HANGUL_SYLLABLE_END);
    expect(hih?.choseongIndex).toBe(18);
    expect(hih?.jungseongIndex).toBe(20);
    expect(hih?.jongseongIndex).toBe(27);
    expect(hih?.choseong).toBe("ㅎ");
    expect(hih?.jungseong).toBe("ㅣ");
    expect(hih?.jongseong).toBe("ㅎ");
    expect(hih?.vowelViseme).toBe("I");

    expect(decomposeHangulSyllable("A")).toBeNull();
    expect(decomposeHangulSyllable("ㄱ")).toBeNull();
    expect(decomposeHangulSyllable("")).toBeNull();
  });

  it("양순 초성(ㅁ/ㅂ/ㅃ/ㅍ)과 양순 종성(ㅁ/ㅂ/ㄼ 등) 음절에서 M-B-P 개시·종결을 정확히 식별한다", () => {
    const bam = decomposeHangulSyllable("밤");
    expect(bam?.choseong).toBe("ㅂ");
    expect(bam?.jungseong).toBe("ㅏ");
    expect(bam?.jongseong).toBe("ㅁ");
    expect(bam?.hasBilabialOnset).toBe(true);
    expect(bam?.hasBilabialCoda).toBe(true);

    const balb = decomposeHangulSyllable("밟");
    expect(balb?.hasBilabialOnset).toBe(true);
    expect(balb?.hasBilabialCoda).toBe(true);

    const ip = decomposeHangulSyllable("입");
    expect(ip?.hasBilabialOnset).toBe(false);
    expect(ip?.hasBilabialCoda).toBe(true);

    const timeline = synthesizeKoreanLipSyncTimeline({ text: "밤", fps: 24 });
    const visemes = timeline.segments.map((s) => s.viseme);
    expect(visemes.slice(0, 3)).toEqual(["M-B-P", "A", "M-B-P"]);
    expect(visemes[visemes.length - 1]).toBe("REST");
  });

  it("단모음과 이중모음(ㅘ/ㅝ/ㅟ)을 5대 모음 비젬과 활음으로 결정론적 매핑한다", () => {
    expect(decomposeHangulSyllable("아")?.vowelViseme).toBe("A");
    expect(decomposeHangulSyllable("에")?.vowelViseme).toBe("E");
    expect(decomposeHangulSyllable("어")?.vowelViseme).toBe("E");
    expect(decomposeHangulSyllable("이")?.vowelViseme).toBe("I");
    expect(decomposeHangulSyllable("오")?.vowelViseme).toBe("O");
    expect(decomposeHangulSyllable("우")?.vowelViseme).toBe("U");
    expect(decomposeHangulSyllable("으")?.vowelViseme).toBe("U");

    const wa = decomposeHangulSyllable("와");
    expect(wa?.glideViseme).toBe("O");
    expect(wa?.vowelViseme).toBe("A");

    const wo = decomposeHangulSyllable("워");
    expect(wo?.glideViseme).toBe("U");
    expect(wo?.vowelViseme).toBe("E");

    const wi = decomposeHangulSyllable("위");
    expect(wi?.glideViseme).toBe("U");
    expect(wi?.vowelViseme).toBe("I");
  });

  it("synthesizeKoreanLipSyncTimeline가 dataSourceKind='estimate'와 추정 안내를 명시한다", () => {
    const timeline = synthesizeKoreanLipSyncTimeline({ text: "안녕, 지금 출발해!" });
    expect(timeline.dataSourceKind).toBe(AUDIO_CUE_DATA_SOURCE_KIND);
    expect(timeline.dataSourceKind).toBe("estimate");
    expect(timeline.estimateNoticeKo).toContain("추정");
    expect(timeline.estimateNoticeEn).toContain("estimate");
  });

  it("복합 한국어 문장에서 7대 비젬(A/E/I/O/U/M-B-P/REST)이 모두 생성되고 분포 합계가 총 프레임과 같다", () => {
    const timeline = synthesizeKoreanLipSyncTimeline({
      text: "아빠, 에코 이쪽 오우! 밤하늘.",
      fps: 24,
      syllablesPerSecond: 4.5,
    });
    for (const viseme of LIP_SYNC_VISEMES) {
      expect(timeline.visemeDistribution[viseme], `viseme ${viseme}`).toBeGreaterThan(0);
    }
    const distSum = LIP_SYNC_VISEMES.reduce((acc, v) => acc + timeline.visemeDistribution[v], 0);
    expect(distSum).toBe(timeline.totalFrames);
    expect(timeline.frames).toHaveLength(timeline.totalFrames);
  });

  it("말하기 속도(음절/초)가 빨라질수록 추정 재생 길이와 프레임 수가 단조 감소한다", () => {
    const slow = synthesizeKoreanLipSyncTimeline({ text: "지금 당장 옥상으로 올라와!", syllablesPerSecond: 3.0, fps: 24 });
    const mid = synthesizeKoreanLipSyncTimeline({ text: "지금 당장 옥상으로 올라와!", syllablesPerSecond: 5.0, fps: 24 });
    const fast = synthesizeKoreanLipSyncTimeline({ text: "지금 당장 옥상으로 올라와!", syllablesPerSecond: 7.5, fps: 24 });

    expect(slow.durationMs).toBeGreaterThan(mid.durationMs);
    expect(mid.durationMs).toBeGreaterThan(fast.durationMs);
    expect(slow.totalFrames).toBeGreaterThan(fast.totalFrames);
  });

  it("감정 톤(whisper/calm/shout/urgent)이 실효 발화 속도와 개구 폭(openness01)에 정확히 반영된다", () => {
    const sample = "아무도 모르는 비밀이야!";
    const whisper = synthesizeKoreanLipSyncTimeline({ text: sample, emotionTone: "whisper" });
    const calm = synthesizeKoreanLipSyncTimeline({ text: sample, emotionTone: "calm" });
    const shout = synthesizeKoreanLipSyncTimeline({ text: sample, emotionTone: "shout" });
    const urgent = synthesizeKoreanLipSyncTimeline({ text: sample, emotionTone: "urgent" });

    expect(whisper.effectiveSyllablesPerSecond).toBeLessThan(calm.effectiveSyllablesPerSecond);
    expect(calm.effectiveSyllablesPerSecond).toBeLessThan(shout.effectiveSyllablesPerSecond);
    expect(shout.effectiveSyllablesPerSecond).toBeLessThan(urgent.effectiveSyllablesPerSecond);

    const maxOpen = (tl: typeof calm): number => Math.max(...tl.segments.map((s) => s.openness01));
    expect(maxOpen(whisper)).toBeLessThan(maxOpen(calm));
    expect(maxOpen(calm)).toBeLessThan(maxOpen(shout));
  });

  it("빈 문자열·공백 입력은 무대사 타임라인(0ms, 0프레임)으로 안전 처리한다", () => {
    const empty = synthesizeKoreanLipSyncTimeline({ text: "   \n  " });
    expect(empty.hasSpokenDialogue).toBe(false);
    expect(empty.durationMs).toBe(0);
    expect(empty.totalFrames).toBe(0);
    expect(empty.frames).toEqual([]);
    expect(empty.segments).toEqual([]);
  });

  it("숫자와 영문 외래어가 섞인 대사도 한글 발음·음소 비젬으로 변환한다", () => {
    const mixed = synthesizeKoreanLipSyncTimeline({ text: "3층 BGM OK!" });
    expect(mixed.hasSpokenDialogue).toBe(true);
    expect(mixed.segments.some((s) => s.sourceChar === "3" && s.viseme === "M-B-P")).toBe(true);
    expect(mixed.segments.some((s) => s.sourceChar === "B" && s.viseme === "M-B-P")).toBe(true);
    expect(mixed.segments.some((s) => s.sourceChar === "O" && s.viseme === "O")).toBe(true);
  });

  it("FPS(12/24/60)에 비례해 프레임 수가 산출되고 모든 프레임 타임스탬프가 단조 증가한다", () => {
    const tl12 = synthesizeKoreanLipSyncTimeline({ text: "비가 내리는 옥상.", fps: 12, startTimeMs: 500 });
    const tl24 = synthesizeKoreanLipSyncTimeline({ text: "비가 내리는 옥상.", fps: 24, startTimeMs: 500 });
    const tl60 = synthesizeKoreanLipSyncTimeline({ text: "비가 내리는 옥상.", fps: 60, startTimeMs: 500 });

    expect(tl24.totalFrames).toBeGreaterThan(tl12.totalFrames);
    expect(tl60.totalFrames).toBeGreaterThan(tl24.totalFrames);
    expect(tl24.frames[0]?.timeMs).toBe(500);
    for (let i = 1; i < tl24.frames.length; i += 1) {
      expect(tl24.frames[i]?.timeMs).toBeGreaterThan(tl24.frames[i - 1]?.timeMs ?? -1);
    }
  });
});

describe("2. 스크롤(0..100%) BGM 무드 전환 · -14 LUFS · -10dB 자동 덕킹 · SFX 스케줄러", () => {
  it("컷별 panelHeightPx 비율로 스크롤 진행률 0%..100%를 연속 분할한다", () => {
    const sheet = buildEpisodeAudioCueSheet({
      episodeTitle: "스크롤 테스트",
      cuts: [
        makeCut({ id: "c1", panelHeightPx: 1000 }),
        makeCut({ id: "c2", panelHeightPx: 2000 }),
        makeCut({ id: "c3", panelHeightPx: 1000 }),
      ],
    });
    expect(sheet.totalPanelHeightPx).toBe(4000);
    expect(sheet.cuts[0]?.scrollStartPct).toBe(0);
    expect(sheet.cuts[0]?.scrollEndPct).toBe(25);
    expect(sheet.cuts[1]?.scrollStartPct).toBe(25);
    expect(sheet.cuts[1]?.scrollEndPct).toBe(75);
    expect(sheet.cuts[2]?.scrollStartPct).toBe(75);
    expect(sheet.cuts[2]?.scrollEndPct).toBe(100);
  });

  it("첫 컷과 BGM 무드가 변경되는 컷에서만 크로스페이드 전환을 생성한다", () => {
    const sheet = buildEpisodeAudioCueSheet({
      episodeTitle: "무드 전환 검증",
      cuts: [
        makeCut({ id: "c1", bgmMood: "mystery-pulse", crossfadeMs: 1200 }),
        makeCut({ id: "c2", bgmMood: "mystery-pulse", crossfadeMs: 900 }),
        makeCut({ id: "c3", bgmMood: "action-surge", crossfadeMs: 600 }),
        makeCut({ id: "c4", bgmMood: "emotional-piano", crossfadeMs: 1800 }),
      ],
    });
    expect(sheet.bgmTransitions).toHaveLength(3);
    expect(sheet.bgmTransitions[0]?.fromMood).toBeNull();
    expect(sheet.bgmTransitions[0]?.toMood).toBe("mystery-pulse");
    expect(sheet.bgmTransitions[1]?.cutId).toBe("c3");
    expect(sheet.bgmTransitions[1]?.fromMood).toBe("mystery-pulse");
    expect(sheet.bgmTransitions[1]?.toMood).toBe("action-surge");
    expect(sheet.bgmTransitions[1]?.crossfadeMs).toBe(600);
    expect(sheet.bgmTransitions[2]?.cutId).toBe("c4");
    expect(sheet.bgmTransitions[2]?.toMood).toBe("emotional-piano");
  });

  it("기본 -14 LUFS 목표와 대사 구간 -10dB 자동 덕킹(-24 LUFS)이 발화 컷에 정확히 적용된다", () => {
    const sheet = buildEpisodeAudioCueSheet({
      episodeTitle: "덕킹 검증",
      cuts: [makeCut({ id: "c1", dialogue: "목소리가 나오면 배경음을 낮춘다.", bgmMood: "action-surge" })],
    });
    expect(sheet.targetLufs).toBe(TARGET_BGM_LUFS);
    expect(sheet.targetLufs).toBe(-14);
    expect(sheet.dialogueDuckingDb).toBe(DEFAULT_DIALOGUE_DUCKING_DB);
    expect(sheet.dialogueDuckingDb).toBe(-10);
    expect(sheet.duckingEnvelopes).toHaveLength(1);
    expect(sheet.duckingEnvelopes[0]?.baseLufs).toBe(-14);
    expect(sheet.duckingEnvelopes[0]?.duckingDb).toBe(-10);
    expect(sheet.duckingEnvelopes[0]?.duckedLufs).toBe(-24);
    expect(sheet.cuts[0]?.isDuckingActive).toBe(true);
    expect(sheet.cuts[0]?.bgmDuckedLufs).toBe(-24);
  });

  it("무대사 컷과 silence-breath 무드에서는 자동 덕킹을 활성화하지 않는다", () => {
    const sheet = buildEpisodeAudioCueSheet({
      episodeTitle: "무대사 컷 검증",
      cuts: [
        makeCut({ id: "silent-1", dialogue: "", speaker: "", bgmMood: "mystery-pulse", minCutDurationMs: 1500 }),
        makeCut({ id: "breath-2", dialogue: "잠깐 멈춰.", speaker: "유리", bgmMood: "silence-breath" }),
      ],
    });
    expect(sheet.duckingEnvelopes).toHaveLength(0);
    expect(sheet.cuts[0]?.isDuckingActive).toBe(false);
    expect(sheet.cuts[1]?.isDuckingActive).toBe(false);
    expect(sheet.cuts[1]?.bgmTargetLufs).toBe(-48);
  });

  it("SFX 히트 마커가 컷 내 offsetRatio01에 따라 정확한 스크롤 %와 시간으로 정렬 스케줄링된다", () => {
    const sheet = buildEpisodeAudioCueSheet({
      episodeTitle: "SFX 스케줄 검증",
      cuts: [
        makeCut({
          id: "c1",
          panelHeightPx: 1000,
          sfxMarkers: [
            { id: "s-late", category: "impact-hit", label: "나중 타격", offsetRatio01: 0.8, gainDb: -1.5, pan: 0.4 },
            { id: "s-early", category: "whoosh-slash", label: "먼저 검격", offsetRatio01: 0.2, gainDb: -3, pan: -0.5 },
          ],
        }),
        makeCut({
          id: "c2",
          panelHeightPx: 1000,
          sfxMarkers: [{ id: "s-c2", category: "heartbeat-pulse", label: "심장 고동", offsetRatio01: 0.5 }],
        }),
      ],
    });
    expect(sheet.sfxSchedule).toHaveLength(3);
    expect(sheet.sfxSchedule[0]?.eventId).toBe("s-early");
    expect(sheet.sfxSchedule[0]?.triggerScrollPct).toBe(10);
    expect(sheet.sfxSchedule[1]?.eventId).toBe("s-late");
    expect(sheet.sfxSchedule[1]?.triggerScrollPct).toBe(40);
    expect(sheet.sfxSchedule[2]?.eventId).toBe("s-c2");
    expect(sheet.sfxSchedule[2]?.triggerScrollPct).toBe(75);
    expect(sheet.sfxSchedule[0]?.triggerTimeMs).toBeLessThan(sheet.sfxSchedule[1]?.triggerTimeMs ?? 0);
    expect(sheet.sfxSchedule[1]?.triggerTimeMs).toBeLessThan(sheet.sfxSchedule[2]?.triggerTimeMs ?? 0);
  });

  it("크로스페이드 곡선 분류와 극단값 클램핑이 안전하게 동작한다", () => {
    const sheet = buildEpisodeAudioCueSheet({
      episodeTitle: "클램핑 검증",
      targetLufs: 5,
      dialogueDuckingDb: -99,
      fps: 240,
      cuts: [
        makeCut({ id: "c1", bgmMood: "action-surge", crossfadeMs: 40, sfxMarkers: [{ id: "s1", category: "impact-hit", label: "타격", offsetRatio01: 1.8, gainDb: 12, pan: 3 }] }),
        makeCut({ id: "c2", bgmMood: "silence-breath", crossfadeMs: 500 }),
      ],
    });
    expect(sheet.targetLufs).toBe(-8);
    expect(sheet.dialogueDuckingDb).toBe(-24);
    expect(sheet.fps).toBe(60);
    expect(sheet.bgmTransitions[0]?.curve).toBe("hard-cut");
    expect(sheet.bgmTransitions[1]?.curve).toBe("linear-fade");
    expect(sheet.sfxSchedule[0]?.offsetRatio01).toBe(1);
    expect(sheet.sfxSchedule[0]?.gainDb).toBe(0);
    expect(sheet.sfxSchedule[0]?.pan).toBe(1);
  });

  it("3종 내장 프리셋 모두 유효한 큐시트와 dataSourceKind='estimate'를 산출한다", () => {
    expect(AUDIO_CUE_EPISODE_PRESETS).toHaveLength(3);
    for (const preset of AUDIO_CUE_EPISODE_PRESETS) {
      const sheet = buildEpisodeAudioCueSheet({
        episodeTitle: preset.episodeTitle,
        episodeNumber: preset.episodeNumber,
        cuts: preset.cuts,
      });
      expect(sheet.dataSourceKind).toBe("estimate");
      expect(sheet.cuts.length).toBeGreaterThanOrEqual(4);
      expect(sheet.summary.totalHangulSyllables).toBeGreaterThan(20);
      expect(sheet.summary.reelsTeaserReady).toBe(true);
    }
  });

  it("빈 컷 배열 입력 시 예외 없이 0 길이 큐시트를 반환한다", () => {
    const emptySheet = buildEpisodeAudioCueSheet({ episodeTitle: "", cuts: [] });
    expect(emptySheet.episodeTitle).toBe("무제 에피소드");
    expect(emptySheet.totalDurationMs).toBe(0);
    expect(emptySheet.summary.cutCount).toBe(0);
    expect(emptySheet.summary.dominantViseme).toBe("REST");
    expect(emptySheet.summary.reelsTeaserReady).toBe(false);
  });
});

describe("3. 표준 WebVTT 자막 및 SMPTE EDL/JSON 큐시트 직렬화", () => {
  it("formatWebVttTimestamp와 formatSmpteTimecode가 밀리초·프레임 경계를 정확히 포맷한다", () => {
    expect(formatWebVttTimestamp(0)).toBe("00:00:00.000");
    expect(formatWebVttTimestamp(3_723_456)).toBe("01:02:03.456");
    expect(formatWebVttTimestamp(-250)).toBe("00:00:00.000");

    expect(formatSmpteTimecode(0, 24)).toBe("00:00:00:00");
    expect(formatSmpteTimecode(1500, 24)).toBe("00:00:01:12");
    expect(formatSmpteTimecode(62_500, 30)).toBe("00:01:02:15");
  });

  it("exportAudioCueWebVtt가 표준 WEBVTT 헤더, 타임스탬프, 화자 태그, SFX 캡션을 출력한다", () => {
    const preset = getAudioCueEpisodePreset("noir-rooftop-chase");
    const sheet = buildEpisodeAudioCueSheet({ episodeTitle: preset.episodeTitle, cuts: preset.cuts });
    const vtt = exportAudioCueWebVtt(sheet);

    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toContain("dataSourceKind=estimate");
    expect(vtt).toContain("target=-14 LUFS");
    expect(vtt).toContain("ducking=-10 dB");
    expect(vtt).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/u);
    expect(vtt).toContain("<v 서진>");
    expect(vtt).toContain("[SFX: 금속 난간 강타]");
  });

  it("exportAudioCueWebVtt가 대사 내 '-->', '--!>' 및 줄바꿈을 안전 치환하고 옵션을 반영한다", () => {
    const sheet = buildEpisodeAudioCueSheet({
      episodeTitle: "새니타이징",
      cuts: [
        makeCut({
          id: "san-1",
          speaker: "서진",
          dialogue: "1단계 --> 2단계 --!> 3단계\n바로 돌파!",
          sfxMarkers: [{ id: "sfx-san", category: "impact-hit", label: "충격", offsetRatio01: 0.5 }],
        }),
      ],
    });
    const vttMinimal = exportAudioCueWebVtt(sheet, { includeCueNotes: false, includeSfxCaptions: false });
    expect(vttMinimal).not.toContain("NOTE ");
    expect(vttMinimal).not.toContain("[SFX:");
    expect(vttMinimal).toContain("<v 서진>1단계 —> 2단계 —!> 3단계 바로 돌파!");
  });

  it("exportAudioCueJson이 유효한 EDL/JSON 구조와 BGM·VOICE·DUCK·SFX SMPTE 이벤트를 직렬화한다", () => {
    const preset = getAudioCueEpisodePreset("noir-rooftop-chase");
    const sheet = buildEpisodeAudioCueSheet({ episodeTitle: preset.episodeTitle, cuts: preset.cuts });
    const jsonStr = exportAudioCueJson(sheet);
    const parsed = JSON.parse(jsonStr) as {
      schemaVersion: string;
      dataSourceKind: string;
      metadata: { targetLufs: number; dialogueDuckingDb: number; fps: number };
      edlEvents: { track: string; inTimecode: string; outTimecode: string }[];
      cuts: { lipSync: { frames?: unknown[] } }[];
    };

    expect(parsed.schemaVersion).toBe("webtoon-audio-cue-edl/v1");
    expect(parsed.dataSourceKind).toBe("estimate");
    expect(parsed.metadata.targetLufs).toBe(-14);
    expect(parsed.metadata.dialogueDuckingDb).toBe(-10);
    expect(parsed.metadata.fps).toBe(24);
    const tracks = new Set(parsed.edlEvents.map((e) => e.track));
    expect(tracks.has("BGM")).toBe(true);
    expect(tracks.has("VOICE")).toBe(true);
    expect(tracks.has("DUCK")).toBe(true);
    expect(tracks.has("SFX")).toBe(true);
    expect(parsed.edlEvents[0]?.inTimecode).toMatch(/^\d{2}:\d{2}:\d{2}:\d{2}$/u);
    expect(parsed.cuts[0]?.lipSync.frames).toBeUndefined();
  });

  it("exportAudioCueJson의 includeLipSyncFrames:true 옵션이 컷별 프레임 시퀀스를 포함한다", () => {
    const sheet = buildEpisodeAudioCueSheet({
      episodeTitle: "프레임 직렬화",
      cuts: [makeCut({ id: "f1", dialogue: "밤하늘" })],
    });
    const parsed = JSON.parse(exportAudioCueJson(sheet, { includeLipSyncFrames: true, pretty: false })) as {
      cuts: { lipSync: { frames: { viseme: string }[] } }[];
    };
    expect(parsed.cuts[0]?.lipSync.frames.length).toBeGreaterThan(0);
    expect(parsed.cuts[0]?.lipSync.frames.some((f) => f.viseme === "M-B-P")).toBe(true);
  });
});

describe("4. StudioWebtoonAudioCuePanel UI 단독 렌더 · 인터랙션 · 코드 위생 자가 검증", () => {
  it("Props 없이 단독 렌더링 시 추정 배지, KPI, 비젬 타임라인 바, BGM 매트릭스, WebVTT 프리뷰를 표시한다", () => {
    render(<StudioWebtoonAudioCuePanel />);
    expect(screen.getByTestId("studio-webtoon-audio-cue-panel")).toBeTruthy();
    expect(screen.getByTestId("audio-cue-estimate-badge").textContent).toContain("추정");
    expect(screen.getByTestId("audio-cue-kpi-bgm").textContent).toContain("-14.0 LUFS");
    expect(screen.getByTestId("audio-cue-kpi-ducking").textContent).toContain("-10.0 dB");
    expect(screen.getByTestId("audio-cue-viseme-bar")).toBeTruthy();
    expect(screen.getByTestId("audio-cue-bgm-matrix")).toBeTruthy();
    expect(screen.getByTestId("audio-cue-export-preview").textContent).toContain("WEBVTT");
  });

  it("대사·화자·감정 톤 편집 시 실시간 립싱크 비젬 타임라인과 WebVTT 출력이 즉시 갱신된다", () => {
    render(<StudioWebtoonAudioCuePanel />);
    const dialogueInput = screen.getByTestId("audio-cue-dialogue-input");
    fireEvent.change(dialogueInput, { target: { value: "밤바다 파도 소리!" } });
    fireEvent.change(screen.getByTestId("audio-cue-speaker-input"), { target: { value: "민재" } });
    fireEvent.click(screen.getByTestId("audio-cue-tone-shout"));

    expect(screen.getByTestId("audio-cue-viseme-count-M-B-P").textContent).not.toContain("0f");
    expect(screen.getByTestId("audio-cue-export-preview").textContent).toContain("<v 민재>밤바다 파도 소리!");
  });

  it("무대사 컷 전환 및 프레임 스크러버 이동 시 안내와 자모 분해 배지·입모양 SVG가 갱신된다", () => {
    render(<StudioWebtoonAudioCuePanel />);
    const scrubber = screen.getByTestId("audio-cue-frame-scrubber");
    fireEvent.change(scrubber, { target: { value: "4" } });
    expect(screen.getByTestId("audio-cue-active-frame-readout").textContent).toContain("#5/");
    expect(screen.getByTestId("audio-cue-mouth-svg").getAttribute("data-viseme")).toBeTruthy();

    fireEvent.click(screen.getByTestId("audio-cue-cut-item-3"));
    expect(screen.getByTestId("audio-cue-silent-cut-notice")).toBeTruthy();
    expect(screen.getByTestId("audio-cue-duck-badge-3").textContent).toContain("덕킹 없음");
  });

  it("프리셋 전환, 컷 추가/삭제, SFX 마커 추가, FPS·속도·덕킹 조작 및 기본값 복원이 동작한다", () => {
    render(<StudioWebtoonAudioCuePanel />);
    fireEvent.click(screen.getByTestId("audio-cue-preset-romance-station-confession"));
    expect(screen.getByTestId("audio-cue-export-preview").textContent).toContain("막차 플랫폼");

    fireEvent.click(screen.getByTestId("audio-cue-add-cut-btn"));
    expect(screen.getByTestId("audio-cue-matrix-row-4")).toBeTruthy();

    fireEvent.change(screen.getByTestId("audio-cue-sfx-label-input"), { target: { value: "문 닫히는 소리" } });
    fireEvent.click(screen.getByTestId("audio-cue-add-sfx-btn"));
    expect(screen.getByTestId("audio-cue-status-banner").textContent).toContain("문 닫히는 소리");

    fireEvent.click(screen.getByTestId("audio-cue-fps-30"));
    fireEvent.change(screen.getByTestId("audio-cue-sps-slider"), { target: { value: "6.0" } });
    expect(screen.getByTestId("audio-cue-sps-value").textContent).toBe("6.0/s");

    fireEvent.click(screen.getByTestId("audio-cue-remove-cut-4"));
    expect(screen.queryByTestId("audio-cue-matrix-row-4")).toBeNull();

    fireEvent.click(screen.getByTestId("audio-cue-reset-btn"));
    expect(screen.getByTestId("audio-cue-kpi-bgm").textContent).toContain("-14.0 LUFS");
    expect(screen.getByTestId("audio-cue-sps-value").textContent).toBe("4.8/s");
  });

  it("WebVTT / EDL·JSON 탭 전환과 복사 버튼이 콜백과 상태 배너를 정상 호출한다", () => {
    const onCopyWebVtt = vi.fn();
    const onCopyJson = vi.fn();
    render(<StudioWebtoonAudioCuePanel onCopyWebVtt={onCopyWebVtt} onCopyJson={onCopyJson} />);

    fireEvent.click(screen.getByTestId("audio-cue-copy-vtt-btn"));
    expect(onCopyWebVtt).toHaveBeenCalledTimes(1);
    expect(onCopyWebVtt.mock.calls[0]?.[0]).toContain("WEBVTT");
    expect(screen.getByTestId("audio-cue-status-banner").textContent).toContain("WebVTT");

    fireEvent.click(screen.getByTestId("audio-cue-export-tab-json"));
    expect(screen.getByTestId("audio-cue-export-preview").textContent).toContain("webtoon-audio-cue-edl/v1");

    fireEvent.click(screen.getByTestId("audio-cue-copy-json-btn"));
    expect(onCopyJson).toHaveBeenCalledTimes(1);
    expect(onCopyJson.mock.calls[0]?.[0]).toContain("\"dataSourceKind\": \"estimate\"");
  });

  it("영문 로케일(locale='en')과 onCueSheetChange 콜백이 정상 동작한다", () => {
    const onCueSheetChange = vi.fn();
    render(<StudioWebtoonAudioCuePanel locale="en" onCueSheetChange={onCueSheetChange} />);
    expect(screen.getByTestId("audio-cue-estimate-badge").textContent).toContain("Estimate");
    expect(onCueSheetChange).toHaveBeenCalled();
    expect(onCueSheetChange.mock.calls[0]?.[0]?.dataSourceKind).toBe("estimate");
  });

  it("4개 파일 존재, 각 800줄 이하, 금지 패턴 0건 및 Calm Atelier 필수 토큰을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "audio-cue-director-engine.ts",
      "StudioWebtoonAudioCuePanel.tsx",
      "index.ts",
      "webtoon-audio-cue-director.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles).toHaveLength(4);

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length, `${file} line count`).toBeLessThanOrEqual(800);

      if (file !== "webtoon-audio-cue-director.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/\bBigInt\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }

      if (file === "StudioWebtoonAudioCuePanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("추정");
      }
    }
  });
});
