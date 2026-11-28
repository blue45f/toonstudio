import { describe, expect, it } from "vitest";
import {
  COMIC_VISEME_ALPHABET,
  LOCAL_VOICE_PRIVACY_CONTRACT,
  alignDialogueToVoiceAudio,
  auditLipsyncCutRig,
  decomposeKoreanTextToVisemeSequence,
  evaluateFacialRigTimelineAt60fps,
  extractVoiceAudioProsodyFrames,
  renderLipsyncDopesheetSvg,
  summarizeLipsyncCutRigKo,
  synthesizeDeterministicVoicePcmForScript,
  type FacialRigTimeline,
  type VoiceAudioProsodyAnalysis,
} from "./index";

function runFullPipeline(
  dialogueText: string,
  synthOptions?: Parameters<typeof synthesizeDeterministicVoicePcmForScript>[1],
  rigOptions?: Parameters<typeof evaluateFacialRigTimelineAt60fps>[2],
): {
  readonly synth: ReturnType<typeof synthesizeDeterministicVoicePcmForScript>;
  readonly prosody: VoiceAudioProsodyAnalysis;
  readonly alignment: ReturnType<typeof alignDialogueToVoiceAudio>;
  readonly timeline: FacialRigTimeline;
} {
  const synth = synthesizeDeterministicVoicePcmForScript(dialogueText, synthOptions);
  const prosody = extractVoiceAudioProsodyFrames(synth.samples, synth.sampleRateHz, 10);
  const alignment = alignDialogueToVoiceAudio(dialogueText, prosody, { targetFps: 60 });
  const timeline = evaluateFacialRigTimelineAt60fps(alignment, prosody, rigOptions);
  return { synth, prosody, alignment, timeline };
}

function meanWindow(
  timeline: FacialRigTimeline,
  startMs: number,
  endMs: number,
  selector: (frame: FacialRigTimeline["frames"][number]) => number,
): number {
  const hits = timeline.frames.filter((f) => f.timeMs >= startMs && f.timeMs <= endMs);
  if (hits.length === 0) return 0;
  return hits.reduce((sum, f) => sum + selector(f), 0) / hits.length;
}

describe("Wave 97: 성우 보이스 연동 60fps 립싱크·표정 쉐이프키 컷 연출 엔진", () => {
  it("1. 로컬 전용 프라이버시 불변 계약이 모든 파이프라인 산출물에 유지된다", () => {
    expect(LOCAL_VOICE_PRIVACY_CONTRACT).toEqual({
      uploadsVoiceAudio: false,
      storesBiometricVoiceprint: false,
      runsLocallyOnly: true,
    });
    const { synth, prosody, alignment, timeline } = runFullPipeline("지금 바로 출발하자!");
    const audit = auditLipsyncCutRig(timeline);
    expect(synth.privacy).toEqual(LOCAL_VOICE_PRIVACY_CONTRACT);
    expect(prosody.privacy).toEqual(LOCAL_VOICE_PRIVACY_CONTRACT);
    expect(alignment.privacy).toEqual(LOCAL_VOICE_PRIVACY_CONTRACT);
    expect(timeline.privacy).toEqual(LOCAL_VOICE_PRIVACY_CONTRACT);
    expect(audit.privacy).toEqual(LOCAL_VOICE_PRIVACY_CONTRACT);
  });

  it("2. 12종 표준 만화 비즘 알파벳이 중복 없이 정의되어 있다", () => {
    expect(COMIC_VISEME_ALPHABET).toHaveLength(12);
    expect(new Set(COMIC_VISEME_ALPHABET).size).toBe(12);
    expect(COMIC_VISEME_ALPHABET).toContain("M_B_P");
    expect(COMIC_VISEME_ALPHABET).toContain("S_Z_CH");
    expect(COMIC_VISEME_ALPHABET).toContain("W_OO");
  });

  it("3. 한글 자모 분해: '지금 바로 출발하자!'의 초성·중성·종성과 문장부호 휴지를 정확히 분해한다", () => {
    const tokens = decomposeKoreanTextToVisemeSequence("지금 바로 출발하자!");
    const visemes = tokens.map((t) => t.viseme);
    // 지(S_Z_CH, I) 금(K_G, E, M_B_P) 바(M_B_P, A) 로(L_N_T_D, O) 출(S_Z_CH, U, L_N_T_D) 발(M_B_P, A, L_N_T_D) 하(K_G, A) 자(S_Z_CH, A) !(SIL)
    expect(visemes).toEqual([
      "S_Z_CH",
      "I",
      "K_G",
      "E",
      "M_B_P",
      "M_B_P",
      "A",
      "L_N_T_D",
      "O",
      "S_Z_CH",
      "U",
      "L_N_T_D",
      "M_B_P",
      "A",
      "L_N_T_D",
      "K_G",
      "A",
      "S_Z_CH",
      "A",
      "SIL",
    ]);
    const bilabials = tokens.filter((t) => t.isBilabial);
    expect(bilabials.map((t) => `${t.grapheme}:${t.jamoLabel}`)).toEqual(["금:ㅁ", "바:ㅂ", "발:ㅂ"]);
  });

  it("4. 한글 자모 분해: '엄마, 밥 먹었어?'에서 무음 초성 ㅇ 제거, 받침 양순음 및 쉼표 휴지를 처리한다", () => {
    const tokens = decomposeKoreanTextToVisemeSequence("엄마, 밥 먹었어?");
    // 엄(E, M_B_P) 마(M_B_P, A) ,(SIL) 밥(M_B_P, A, M_B_P) 먹(M_B_P, E, K_G) 었(E, S_Z_CH) 어(E) ?(SIL)
    expect(tokens.map((t) => t.viseme)).toEqual([
      "E",
      "M_B_P",
      "M_B_P",
      "A",
      "SIL",
      "M_B_P",
      "A",
      "M_B_P",
      "M_B_P",
      "E",
      "K_G",
      "E",
      "S_Z_CH",
      "E",
      "SIL",
    ]);
    expect(tokens.filter((t) => t.viseme === "SIL")).toHaveLength(2);
    expect(tokens.filter((t) => t.isBilabial)).toHaveLength(5);
  });

  it("5. 원순 이중모음(와·왜·위·워)은 W_OO 활음과 목표 모음으로 자연스럽게 분해한다", () => {
    const tokens = decomposeKoreanTextToVisemeSequence("와위워");
    expect(tokens.map((t) => t.viseme)).toEqual(["W_OO", "A", "W_OO", "I", "W_OO", "E"]);
  });

  it("6. 단독 호환 자모('ㅁㅂㅍㅅㅋ')도 안전하게 비즘으로 변환한다", () => {
    const tokens = decomposeKoreanTextToVisemeSequence("ㅁㅂㅍㅅㅋ");
    expect(tokens.map((t) => t.viseme)).toEqual(["M_B_P", "M_B_P", "M_B_P", "S_Z_CH", "K_G"]);
  });

  it("7. 영문·라틴 대사 폴백: 양순음·순치음(F_V)·치찰음·이중자음(oo/sh)과 휴지를 처리한다", () => {
    const tokens = decomposeKoreanTextToVisemeSequence("Boom, save shop!");
    const visemes = tokens.map((t) => t.viseme);
    expect(visemes).toContain("M_B_P");
    expect(visemes).toContain("W_OO");
    expect(visemes).toContain("F_V");
    expect(visemes).toContain("S_Z_CH");
    expect(visemes.filter((v) => v === "SIL")).toHaveLength(2);
  });

  it("8. 공백·빈 문자열 입력에서도 예외 없이 안전한 단일 SIL 토큰을 반환한다", () => {
    const tokens = decomposeKoreanTextToVisemeSequence("   ");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].viseme).toBe("SIL");
  });

  it("9. 연속 문장부호('?!...')는 하나의 휴지 토큰으로 병합하고 더 긴 휴지 길이를 유지한다", () => {
    const tokens = decomposeKoreanTextToVisemeSequence("어?!...");
    const sils = tokens.filter((t) => t.viseme === "SIL");
    expect(sils).toHaveLength(1);
    expect(sils[0].intrinsicDurationMs).toBeGreaterThanOrEqual(340);
  });

  it("10. 로컬 PCM 운율 추출기: 유성 모음 사인·포먼트 합성파에서 F0(140~260Hz)·높은 RMS·낮은 ZCR을 정확히 분리한다", () => {
    const sampleRateHz = 16000;
    const len = Math.round(sampleRateHz * 0.4);
    const pcm = new Float32Array(len);
    const targetF0 = 192;
    for (let i = 0; i < len; i += 1) {
      const t = i / sampleRateHz;
      pcm[i] =
        0.55 * Math.sin(2 * Math.PI * targetF0 * t) +
        0.18 * Math.sin(2 * Math.PI * 760 * t) +
        0.08 * Math.sin(2 * Math.PI * 1200 * t);
    }
    const analysis = extractVoiceAudioProsodyFrames(pcm, sampleRateHz, 10);
    const midFrames = analysis.frames.slice(4, analysis.frames.length - 4);
    expect(midFrames.length).toBeGreaterThan(10);
    for (const f of midFrames) {
      expect(f.voiced).toBe(true);
      expect(f.rmsEnergy).toBeGreaterThan(0.7);
      expect(f.zcr).toBeLessThan(0.18);
      expect(f.f0Hz).toBeGreaterThanOrEqual(175);
      expect(f.f0Hz).toBeLessThanOrEqual(210);
    }
    expect(analysis.baselineF0Hz).toBeGreaterThanOrEqual(180);
    expect(analysis.baselineF0Hz).toBeLessThanOrEqual(205);
  });

  it("11. 로컬 PCM 운율 추출기: 고주파 치찰음 노이즈 버스트를 높은 ZCR과 무성음(voiced === false)으로 판별한다", () => {
    const sampleRateHz = 16000;
    const len = Math.round(sampleRateHz * 0.3);
    const pcm = new Float32Array(len);
    let state = 1234567;
    let prev = 0;
    for (let i = 0; i < len; i += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const white = (state / 4294967296) * 2 - 1;
      pcm[i] = (white - 0.88 * prev) * 0.35;
      prev = white;
    }
    const analysis = extractVoiceAudioProsodyFrames(pcm, sampleRateHz, 10);
    const midFrames = analysis.frames.slice(3, analysis.frames.length - 3);
    expect(midFrames.length).toBeGreaterThan(5);
    const avgZcr = midFrames.reduce((acc, f) => acc + f.zcr, 0) / midFrames.length;
    expect(avgZcr).toBeGreaterThan(0.35);
    expect(midFrames.every((f) => !f.voiced)).toBe(true);
    expect(analysis.activeSpeechSegments.length).toBeGreaterThanOrEqual(1);
  });

  it("12. 로컬 PCM 운율 추출기: 무음 버퍼에서 voiced === false 및 발화 구간 0건을 반환한다", () => {
    const silence = new Float32Array(16000 * 0.5);
    const analysis = extractVoiceAudioProsodyFrames(silence, 16000, 10);
    expect(analysis.frames.every((f) => !f.voiced && f.rmsEnergy === 0)).toBe(true);
    expect(analysis.activeSpeechSegments).toHaveLength(0);
    expect(analysis.baselineF0Hz).toBe(0);
  });

  it("13. 결정론적 테스트 음성 합성기는 동일 입력에 대해 비트 단위로 동일한 PCM을 생성한다", () => {
    const a = synthesizeDeterministicVoicePcmForScript("지금 바로 출발하자!", { seed: 42 });
    const b = synthesizeDeterministicVoicePcmForScript("지금 바로 출발하자!", { seed: 42 });
    expect(a.samples.length).toBe(b.samples.length);
    expect(a.durationMs).toBe(b.durationMs);
    for (let i = 0; i < a.samples.length; i += 25) {
      expect(a.samples[i]).toBe(b.samples[i]);
    }
  });

  it("14. 합성 PCM에서 양순음(M_B_P) 구간은 인접 모음(A)보다 뚜렷한 음향 폐쇄 딥(RMS 저하)을 만든다", () => {
    const synth = synthesizeDeterministicVoicePcmForScript("아바아", { baseF0Hz: 185 });
    const prosody = extractVoiceAudioProsodyFrames(synth.samples, synth.sampleRateHz, 10);
    const bilabialTruth = synth.groundTruthSpans.find((s) => s.viseme === "M_B_P");
    const firstVowelTruth = synth.groundTruthSpans.find((s) => s.viseme === "A");
    expect(bilabialTruth).toBeDefined();
    expect(firstVowelTruth).toBeDefined();
    if (!bilabialTruth || !firstVowelTruth) return;

    const bilabialFrames = prosody.frames.filter(
      (f) => f.timeMs >= bilabialTruth.startMs + 8 && f.timeMs <= bilabialTruth.endMs - 8,
    );
    const vowelFrames = prosody.frames.filter(
      (f) => f.timeMs >= firstVowelTruth.startMs + 20 && f.timeMs <= firstVowelTruth.endMs - 20,
    );
    const bilabialRms = bilabialFrames.reduce((s, f) => s + f.rmsEnergy, 0) / Math.max(1, bilabialFrames.length);
    const vowelRms = vowelFrames.reduce((s, f) => s + f.rmsEnergy, 0) / Math.max(1, vowelFrames.length);
    expect(bilabialRms).toBeLessThan(vowelRms * 0.55);
  });

  it("15. 강제 정렬 단조성 및 60fps 프레임 동기 오차(<= 16.67ms): '지금 바로 출발하자!'", () => {
    const { alignment, prosody } = runFullPipeline("지금 바로 출발하자!");
    expect(alignment.isStrictlyMonotonic).toBe(true);
    expect(alignment.maxAudioAlignmentDriftMs).toBeLessThanOrEqual(16.67);
    expect(alignment.speechSpanCount).toBeGreaterThanOrEqual(15);
    expect(prosody.activeSpeechSegments.length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < alignment.spans.length; i += 1) {
      const span = alignment.spans[i];
      expect(span.startMs).toBeLessThan(span.endMs);
      if (i > 0) {
        expect(span.startMs).toBeGreaterThanOrEqual(alignment.spans[i - 1].endMs - 1e-6);
      }
    }
  });

  it("16. 쉼표 휴지가 있는 다중 구절 대사('엄마, 밥 먹었어?')가 두 발화 구간과 중간 SIL로 정렬된다", () => {
    const { alignment, prosody } = runFullPipeline("엄마, 밥 먹었어?");
    expect(prosody.activeSpeechSegments.length).toBe(2);
    expect(alignment.isStrictlyMonotonic).toBe(true);
    expect(alignment.maxAudioAlignmentDriftMs).toBeLessThanOrEqual(16.67);

    const interiorSil = alignment.spans.find(
      (s, idx) => s.viseme === "SIL" && idx > 0 && idx < alignment.spans.length - 1,
    );
    expect(interiorSil).toBeDefined();
    expect(interiorSil?.durationMs ?? 0).toBeGreaterThan(80);
  });

  it("17. 무음 오디오에 대사를 정렬해도 NaN 없이 안전한 단조 SIL 구간을 반환한다", () => {
    const silentPcm = new Float32Array(8000);
    const prosody = extractVoiceAudioProsodyFrames(silentPcm, 16000, 10);
    const alignment = alignDialogueToVoiceAudio("지금 바로 출발하자!", prosody);
    expect(alignment.isStrictlyMonotonic).toBe(true);
    expect(alignment.spans).toHaveLength(1);
    expect(alignment.spans[0].viseme).toBe("SIL");
    expect(alignment.maxAudioAlignmentDriftMs).toBeLessThanOrEqual(16.67);
  });

  it("18. 오디오 발화 구간 수와 대사 구절 수가 달라도 단조 강제 정렬이 무너지지 않는다", () => {
    const synth = synthesizeDeterministicVoicePcmForScript("지금, 바로, 출발하자!");
    const prosody = extractVoiceAudioProsodyFrames(synth.samples, synth.sampleRateHz, 10);
    // 오디오에는 3개 구간이 있지만 대사는 쉼표 없이 1개 구절인 불일치 케이스
    const alignmentA = alignDialogueToVoiceAudio("지금 바로 출발하자", prosody);
    expect(alignmentA.isStrictlyMonotonic).toBe(true);
    expect(alignmentA.speechSpanCount).toBeGreaterThan(10);

    // 반대로 연속 오디오에 다중 쉼표 대사를 정렬하는 케이스
    const continuousSynth = synthesizeDeterministicVoicePcmForScript("지금 바로 출발하자");
    const continuousProsody = extractVoiceAudioProsodyFrames(
      continuousSynth.samples,
      continuousSynth.sampleRateHz,
      10,
    );
    const alignmentB = alignDialogueToVoiceAudio("지금, 바로, 출발하자!", continuousProsody);
    expect(alignmentB.isStrictlyMonotonic).toBe(true);
    expect(alignmentB.speechSpanCount).toBeGreaterThan(10);
  });

  it("19. 양순음 폐쇄 지배 원칙: '엄마, 밥 먹었어?'의 모든 ㅁ·ㅂ 피크에서 jawOpen <= 0.05 및 lipSeal >= 0.85를 달성한다", () => {
    const { timeline } = runFullPipeline("엄마, 밥 먹었어?");
    expect(timeline.bilabialAudit.totalBilabials).toBe(5);
    expect(timeline.bilabialAudit.hitRate).toBe(1);
    for (const check of timeline.bilabialAudit.checks) {
      expect(check.passed).toBe(true);
      expect(check.minJawOpen).toBeLessThanOrEqual(0.05);
      expect(check.maxLipSeal).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("20. 빠른 발화 속도(1.85배속)에서도 양순음(ㅁ·ㅂ·ㅍ) 입술 닫힘을 100% 놓치지 않는다", () => {
    const { timeline } = runFullPipeline("바보 뽀뽀 파파 엄마", { speakingRateScale: 1.85 });
    expect(timeline.bilabialAudit.totalBilabials).toBeGreaterThanOrEqual(7);
    expect(timeline.bilabialAudit.hitRate).toBe(1);
    for (const check of timeline.bilabialAudit.checks) {
      expect(check.minJawOpen).toBeLessThanOrEqual(0.05);
      expect(check.maxLipSeal).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("21. 모음 입 열림은 성우 음량(RMS)에 비례해 크게 외칠수록 더 크게 열린다", () => {
    const loudSynth = synthesizeDeterministicVoicePcmForScript("아아아", {
      emphasisAmplitudeScale: 1.45,
      stressedSyllableIndices: [0, 1, 2],
    });
    const softSamples = new Float32Array(loudSynth.samples.length);
    for (let i = 0; i < loudSynth.samples.length; i += 1) {
      // 배경 기준 대비 아주 작은 속삭임 레벨(0.032)로 감쇠
      softSamples[i] = loudSynth.samples[i] * 0.055;
    }

    const loudProsody = extractVoiceAudioProsodyFrames(loudSynth.samples, loudSynth.sampleRateHz, 10);
    const softProsody = extractVoiceAudioProsodyFrames(softSamples, loudSynth.sampleRateHz, 10);
    const loudAlign = alignDialogueToVoiceAudio("아아아", loudProsody);
    const softAlign = alignDialogueToVoiceAudio("아아아", softProsody);
    const loudRig = evaluateFacialRigTimelineAt60fps(loudAlign, loudProsody);
    const softRig = evaluateFacialRigTimelineAt60fps(softAlign, softProsody);

    expect(loudRig.metrics.peakJawOpen).toBeGreaterThan(softRig.metrics.peakJawOpen + 0.12);
  });

  it("22. Cohen-Massaro 조음 결합 부드러움: 연속 모음 전환 시 프레임당 턱 변화량이 억제되어 기계적 튀김이 없다", () => {
    const { timeline } = runFullPipeline("아오이우에아오이");
    expect(timeline.metrics.maxVowelTransitionJawDeltaPerFrame).toBeLessThanOrEqual(0.16);
    expect(timeline.metrics.maxJawDeltaPerFrame).toBeLessThanOrEqual(0.32);
    expect(timeline.metrics.peakJawOpen).toBeGreaterThan(0.55);
  });

  it("23. 원순 모음('우오')은 lipRound를, 평순 전설 모음('이이')은 lipSpread를 뚜렷하게 구동한다", () => {
    const rounded = runFullPipeline("우오우오").timeline;
    const spread = runFullPipeline("이이이이").timeline;

    const maxRoundInU = Math.max(...rounded.frames.map((f) => f.pose.lipRound));
    const maxSpreadInU = Math.max(...rounded.frames.map((f) => f.pose.lipSpread));
    const maxSpreadInI = Math.max(...spread.frames.map((f) => f.pose.lipSpread));
    const maxRoundInI = Math.max(...spread.frames.map((f) => f.pose.lipRound));

    expect(maxRoundInU).toBeGreaterThan(0.7);
    expect(maxRoundInU).toBeGreaterThan(maxSpreadInU + 0.4);
    expect(maxSpreadInI).toBeGreaterThan(0.65);
    expect(maxSpreadInI).toBeGreaterThan(maxRoundInI + 0.4);
  });

  it("24. 운율-표정 연동: 피치 강세가 실린 음절에서 눈썹(browRaise)이 비강세 음절보다 확실히 높이 올라간다", () => {
    const dialogue = "가나다라마바사";
    const { alignment, timeline } = runFullPipeline(dialogue, {
      baseF0Hz: 170,
      stressedSyllableIndices: [5],
      emphasisPitchLiftHz: 85,
      emphasisAmplitudeScale: 1.35,
    });
    const unstressedSpan = alignment.spans.find((s) => s.syllableIndex === 1 && s.role === "nucleus");
    const stressedSpan = alignment.spans.find((s) => s.syllableIndex === 5 && s.role === "nucleus");
    expect(unstressedSpan).toBeDefined();
    expect(stressedSpan).toBeDefined();
    if (!unstressedSpan || !stressedSpan) return;

    const unstressedBrow = meanWindow(timeline, unstressedSpan.startMs, unstressedSpan.endMs, (f) => f.pose.browRaise);
    const stressedBrow = meanWindow(timeline, stressedSpan.startMs, stressedSpan.endMs, (f) => f.pose.browRaise);
    expect(stressedBrow).toBeGreaterThan(unstressedBrow + 0.14);
  });

  it("25. 감정 태그 편향(joy·anger·sadness·shock)이 눈썹·입꼬리·눈웃음을 구별하고 shock에서도 양순음 닫힘을 보존한다", () => {
    const script = "밥 먹자!";
    const neutral = runFullPipeline(script, {}, { emotion: "neutral" }).timeline;
    const joy = runFullPipeline(script, {}, { emotion: "joy" }).timeline;
    const anger = runFullPipeline(script, {}, { emotion: "anger" }).timeline;
    const shock = runFullPipeline(script, {}, { emotion: "shock" }).timeline;

    const avg = (tl: FacialRigTimeline, fn: (f: FacialRigTimeline["frames"][number]) => number): number =>
      tl.frames.reduce((s, f) => s + fn(f), 0) / tl.frames.length;

    expect(avg(anger, (f) => f.pose.browFurrow)).toBeGreaterThan(avg(neutral, (f) => f.pose.browFurrow) + 0.45);
    expect(avg(joy, (f) => f.pose.eyeSquint)).toBeGreaterThan(avg(neutral, (f) => f.pose.eyeSquint) + 0.18);
    expect(avg(shock, (f) => f.pose.browRaise)).toBeGreaterThan(avg(neutral, (f) => f.pose.browRaise) + 0.35);
    expect(shock.frames.every((f) => f.pose.eyeSquint === 0)).toBe(true);
    expect(shock.bilabialAudit.hitRate).toBe(1);
  });

  it("26. 생리적 눈 깜박임은 긴 대사에서 2.8~4.8초 간격으로 자연스럽게 트리거된다", () => {
    const longDialogue =
      "지금 바로 출발하자, 서둘러야 늦지 않아. 엄마, 밥 먹었어? 오늘 밤까지 원고를 꼭 끝내야 해! 지금 바로 출발하자, 서둘러야 늦지 않아.";
    const { timeline } = runFullPipeline(longDialogue, { speakingRateScale: 0.85 }, { emotion: "neutral", blinkSeed: 97 });
    expect(timeline.durationMs).toBeGreaterThan(9500);
    expect(timeline.blinkEvents.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < timeline.blinkEvents.length; i += 1) {
      const gapMs = timeline.blinkEvents[i].peakTimeMs - timeline.blinkEvents[i - 1].peakTimeMs;
      expect(gapMs).toBeGreaterThanOrEqual(2800);
      expect(gapMs).toBeLessThanOrEqual(4800);
    }
    const maxBlink = Math.max(...timeline.frames.map((f) => f.pose.eyeBlinkLeft));
    expect(maxBlink).toBeGreaterThanOrEqual(0.88);
  });

  it("27. 'shock' 감정에서는 긴 대사에서도 눈 깜박임을 완전히 억제한다", () => {
    const longDialogue =
      "지금 바로 출발하자, 서둘러야 늦지 않아. 엄마, 밥 먹었어? 믿을 수가 없어, 저 건물이 무너지고 있어!";
    const { timeline } = runFullPipeline(longDialogue, { speakingRateScale: 0.85 }, { emotion: "shock" });
    expect(timeline.durationMs).toBeGreaterThan(8000);
    expect(timeline.blinkEvents).toHaveLength(0);
    expect(timeline.frames.every((f) => f.pose.eyeBlinkLeft === 0 && f.pose.eyeBlinkRight === 0)).toBe(true);
  });

  it("28. prefersReducedMotion: true는 고개 끄덕임·호흡 흔들림 0 고정, 초당 입 전환 <= 12단계, 양순음 닫힘을 동시에 충족한다", () => {
    const { timeline } = runFullPipeline(
      "엄마, 밥 먹었어? 지금 바로 출발하자!",
      {},
      { prefersReducedMotion: true, emotion: "joy" },
    );
    expect(timeline.prefersReducedMotion).toBe(true);
    expect(timeline.frames.every((f) => f.pose.headNodDeg === 0)).toBe(true);
    expect(timeline.frames.every((f) => f.pose.breathChestOffsetPx === 0)).toBe(true);
    expect(timeline.metrics.maxAbsHeadNodDeg).toBe(0);
    expect(timeline.metrics.maxAbsBreathOffsetPx).toBe(0);
    expect(timeline.metrics.lipStepTransitionsPerSec).toBeLessThanOrEqual(12);
    expect(timeline.bilabialAudit.hitRate).toBe(1);

    const audit = auditLipsyncCutRig(timeline);
    expect(audit.reducedMotionCompliant).toBe(true);
    expect(audit.readyForCutExport).toBe(true);
  });

  it("29. renderLipsyncDopesheetSvg는 고대비 OKLCH SVG를 출력하며 NaN/원시 HEX가 없고 XML 이스케이프를 수행한다", () => {
    const dangerousScript = "엄마 <script>&\"밥\"</script>, 바로 출발하자!";
    const { timeline } = runFullPipeline(
      `${dangerousScript} 지금 바로 출발하자, 늦지 않게 서둘러!`,
      { speakingRateScale: 0.85 },
      { emotion: "neutral" },
    );
    const svg = renderLipsyncDopesheetSvg(timeline, {
      titleKo: "컷 <01> & \"성우\" 리허설",
    });

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/\b(?:NaN|Infinity)\b/);
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toContain("rgb(");
    expect(svg).toContain('data-layer="rms-waveform"');
    expect(svg).toContain('data-layer="viseme-blocks"');
    expect(svg).toContain('data-layer="blendshape-curves"');
    expect(svg).toContain('data-layer="blink-markers"');
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;01&gt; &amp; &quot;성우&quot;");
  });

  it("30. summarizeLipsyncCutRigKo와 auditLipsyncCutRig가 자연스러운 한국어 요약과 출고 준비 판정을 제공한다", () => {
    const { timeline } = runFullPipeline(
      "엄마, 밥 먹었어? 지금 바로 출발하자!",
      {},
      { emotion: "joy", prefersReducedMotion: true },
    );
    const audit = auditLipsyncCutRig(timeline);
    const summary = summarizeLipsyncCutRigKo(timeline);

    expect(audit.readyForCutExport).toBe(true);
    expect(audit.allBilabialsClosed).toBe(true);
    expect(audit.withinFrameSyncBudget).toBe(true);
    expect(summary).toContain("기쁨");
    expect(summary).toContain("60fps");
    expect(summary).toContain("양순음(ㅁ·ㅂ·ㅍ)");
    expect(summary).toContain("100%");
    expect(summary).toContain("동작 줄이기 안전 모드");
    expect(summary).toContain("로컬에서만 처리");
    // 번역투 금지 점검
    expect(summary).not.toContain("가능하게 합니다");
    expect(summary).not.toContain("직관적인 경험을 제공");
    expect(summary).not.toContain("원활한 워크플로우를 보장");
  });
});
