/**
 * Wave 114 검증 스위트: 한국어 웹툰 효과음 프로시저럴 폴리 DSP,
 * 정전력 공간 스테레오 믹서, 무음 독자 자막·햅틱 접근성 브리지,
 * OKLCH 타임라인 SVG 및 사운드 디렉터 한국어 QA 브리프.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_HAPTIC_BURST_MS,
  PEAK_SAFETY_CEILING_DBFS,
  PEAK_SAFETY_CEILING_LINEAR,
  SFX_FOLEY_ARCHETYPES,
  auditSfxFoleyBridge,
  classifyKoreanComicSfxText,
  compileEpisodeSfxMixAndAccessibilityBridge,
  computeConstantPowerStereoPan,
  renderSfxFoleyTimelineSvg,
  summarizeSfxFoleyBridgeKo,
  synthesizeKoreanSfxFoleyPcm,
  type EpisodeSfxCueInput,
  type SfxFoleyArchetype,
  type SfxSampleRateHz,
} from "./index";

describe("Wave 114: 한국어 효과음 프로시저럴 폴리 DSP & 공간 믹서·무음 독자 접근성 브리지", () => {
  describe("1. 한국어 만화 의성어·의태어 6종 정규 아키타입 분류기", () => {
    const canonicalCases: readonly { readonly text: string; readonly expected: SfxFoleyArchetype }[] = [
      { text: "콰광!", expected: "impact-boom" },
      { text: "쾅", expected: "impact-boom" },
      { text: "쿵", expected: "impact-boom" },
      { text: "우르릉...", expected: "impact-boom" },
      { text: "챙강!", expected: "blade-clash" },
      { text: "서걱", expected: "blade-clash" },
      { text: "차앙!!", expected: "blade-clash" },
      { text: "스릉", expected: "blade-clash" },
      { text: "두근두근", expected: "heartbeat-thump" },
      { text: "쿵쾅", expected: "heartbeat-thump" },
      { text: "휘익!", expected: "whoosh-dash" },
      { text: "스윽", expected: "whoosh-dash" },
      { text: "슈욱~", expected: "whoosh-dash" },
      { text: "휙!", expected: "whoosh-dash" },
      { text: "주룩주룩", expected: "rain-ambience" },
      { text: "후두둑", expected: "rain-ambience" },
      { text: "쏴아", expected: "rain-ambience" },
      { text: "와장창!", expected: "glass-shatter" },
      { text: "쨍그랑", expected: "glass-shatter" },
      { text: "파직!", expected: "glass-shatter" },
    ];

    it("6종 정규 아키타입의 대표 한국어 의성어를 정확히 분류한다", () => {
      for (const sample of canonicalCases) {
        const result = classifyKoreanComicSfxText(sample.text);
        expect(result.archetype, sample.text).toBe(sample.expected);
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
        expect(result.matchedKeyword).not.toBeNull();
        expect(result.captionCategoryKo.length).toBeGreaterThan(0);
      }
    });

    it("복합어 '쿵쾅'이 단음절 '쿵'보다 우선하여 heartbeat-thump로 분류된다", () => {
      const heart = classifyKoreanComicSfxText("쿵쾅쿵쾅!");
      const boom = classifyKoreanComicSfxText("쿵!");
      expect(heart.archetype).toBe("heartbeat-thump");
      expect(boom.archetype).toBe("impact-boom");
    });

    it("느낌표 강조가 많을수록 intensityHint가 증가하며 상한 1 미만으로 유지된다", () => {
      const calm = classifyKoreanComicSfxText("콰광");
      const intense = classifyKoreanComicSfxText("콰광!!!");
      expect(intense.intensityHint).toBeGreaterThan(calm.intensityHint);
      expect(intense.intensityHint).toBeLessThanOrEqual(1.0);
    });

    it("사전에 없는 미지 문자열과 빈 문자열에서도 안전하게 폴백한다", () => {
      const unknownWhoosh = classifyKoreanComicSfxText("하아앗");
      const empty = classifyKoreanComicSfxText("   ");
      expect(SFX_FOLEY_ARCHETYPES).toContain(unknownWhoosh.archetype);
      expect(unknownWhoosh.matchedKeyword).toBeNull();
      expect(SFX_FOLEY_ARCHETYPES).toContain(empty.archetype);
      expect(empty.captionCategoryKo.length).toBeGreaterThan(0);
    });
  });

  describe("2. 프로시저럴 폴리 DSP 음향 특성·스펙트럼 분리·방송 안전 불변량", () => {
    it("blade-clash와 glass-shatter는 impact-boom과 heartbeat-thump보다 스펙트럼 중심 및 영교차율이 엄격히 높다", () => {
      const impact = synthesizeKoreanSfxFoleyPcm({ sfxTextKo: "콰광!", sampleRateHz: 24000, seed: 101 });
      const heart = synthesizeKoreanSfxFoleyPcm({ sfxTextKo: "두근두근", sampleRateHz: 24000, seed: 102 });
      const blade = synthesizeKoreanSfxFoleyPcm({ sfxTextKo: "챙강!", sampleRateHz: 24000, seed: 103 });
      const glass = synthesizeKoreanSfxFoleyPcm({ sfxTextKo: "와장창!", sampleRateHz: 24000, seed: 104 });

      const lowMaxCentroid = Math.max(
        impact.descriptors.spectralCentroidHz,
        heart.descriptors.spectralCentroidHz,
      );
      const lowMaxZcr = Math.max(
        impact.descriptors.zeroCrossingRate,
        heart.descriptors.zeroCrossingRate,
      );

      expect(blade.descriptors.spectralCentroidHz).toBeGreaterThan(lowMaxCentroid * 2.5);
      expect(glass.descriptors.spectralCentroidHz).toBeGreaterThan(lowMaxCentroid * 3.0);
      expect(blade.descriptors.zeroCrossingRate).toBeGreaterThan(lowMaxZcr * 2.5);
      expect(glass.descriptors.zeroCrossingRate).toBeGreaterThan(lowMaxZcr * 3.0);
    });

    it("whoosh-dash와 rain-ambience도 저역 충격음보다 높은 스펙트럼 중심을 갖는다", () => {
      const heart = synthesizeKoreanSfxFoleyPcm({ archetype: "heartbeat-thump", seed: 201 });
      const whoosh = synthesizeKoreanSfxFoleyPcm({ archetype: "whoosh-dash", seed: 202 });
      const rain = synthesizeKoreanSfxFoleyPcm({ archetype: "rain-ambience", seed: 203 });

      expect(whoosh.descriptors.spectralCentroidHz).toBeGreaterThan(
        heart.descriptors.spectralCentroidHz * 3,
      );
      expect(rain.descriptors.spectralCentroidHz).toBeGreaterThan(
        heart.descriptors.spectralCentroidHz * 3,
      );
      expect(whoosh.descriptors.rmsLinear).toBeGreaterThan(0.01);
      expect(rain.descriptors.rmsLinear).toBeGreaterThan(0.01);
    });

    it("6종 모든 아키타입에 극단 강도(intensity: 1.5)를 입력해도 -1.0 dBFS 이하·비유한 0건·저 DC 오프셋을 만족한다", () => {
      for (const archetype of SFX_FOLEY_ARCHETYPES) {
        const res = synthesizeKoreanSfxFoleyPcm({
          archetype,
          intensity: 1.5,
          durationMs: 520,
          sampleRateHz: 24000,
          seed: `extreme-${archetype}`,
        });
        expect(res.descriptors.maxAbsSample, archetype).toBeLessThanOrEqual(0.892);
        expect(res.descriptors.maxAbsSample, archetype).toBeLessThanOrEqual(PEAK_SAFETY_CEILING_LINEAR + 1e-4);
        expect(res.descriptors.peakDbfs, archetype).toBeLessThanOrEqual(PEAK_SAFETY_CEILING_DBFS + 1e-3);
        expect(res.descriptors.nonFiniteSampleCount, archetype).toBe(0);
        expect(Math.abs(res.descriptors.dcOffset), archetype).toBeLessThan(0.01);
        expect(res.descriptors.rmsLinear, archetype).toBeGreaterThan(0.005);
      }
    });

    it("지원 샘플레이트 16000 / 24000 / 48000 Hz에서 모두 방송 안전·스펙트럼 분리 계약을 유지한다", () => {
      const rates: readonly SfxSampleRateHz[] = [16000, 24000, 48000];
      for (const rate of rates) {
        const boom = synthesizeKoreanSfxFoleyPcm({
          archetype: "impact-boom",
          sampleRateHz: rate,
          durationMs: 400,
          seed: 77,
        });
        const shatter = synthesizeKoreanSfxFoleyPcm({
          archetype: "glass-shatter",
          sampleRateHz: rate,
          durationMs: 400,
          seed: 77,
        });
        expect(boom.pcm.length).toBe(Math.round(0.4 * rate));
        expect(shatter.pcm.length).toBe(Math.round(0.4 * rate));
        expect(boom.descriptors.maxAbsSample).toBeLessThanOrEqual(0.892);
        expect(shatter.descriptors.maxAbsSample).toBeLessThanOrEqual(0.892);
        expect(shatter.descriptors.spectralCentroidHz).toBeGreaterThan(
          boom.descriptors.spectralCentroidHz * 2,
        );
      }
    });

    it("동일 시드·동일 요청은 비트 단위로 완전히 동일한 PCM Float32Array를 생성한다", () => {
      const req = {
        sfxTextKo: "챙강!",
        sampleRateHz: 24000 as const,
        durationMs: 420,
        intensity: 0.9,
        seed: "determinism-seed-114",
      };
      const first = synthesizeKoreanSfxFoleyPcm(req);
      const second = synthesizeKoreanSfxFoleyPcm(req);

      expect(first.seedNumber).toBe(second.seedNumber);
      expect(first.pcm.length).toBe(second.pcm.length);
      for (let i = 0; i < first.pcm.length; i += 1) {
        expect(first.pcm[i]).toBe(second.pcm[i]);
      }
    });

    it("서로 다른 시드는 노이즈 기반 아키타입에서 서로 다른 파형을 생성한다", () => {
      const a = synthesizeKoreanSfxFoleyPcm({ archetype: "rain-ambience", durationMs: 300, seed: "rain-a" });
      const b = synthesizeKoreanSfxFoleyPcm({ archetype: "rain-ambience", durationMs: 300, seed: "rain-b" });
      let diffCount = 0;
      for (let i = 0; i < a.pcm.length; i += 1) {
        if (Math.abs((a.pcm[i] ?? 0) - (b.pcm[i] ?? 0)) > 1e-4) {
          diffCount += 1;
        }
      }
      expect(diffCount).toBeGreaterThan(a.pcm.length * 0.5);
    });

    it("모든 아키타입 출력 PCM은 시작/끝 샘플이 0으로 안티클릭 마감된다", () => {
      for (const archetype of SFX_FOLEY_ARCHETYPES) {
        const synth = synthesizeKoreanSfxFoleyPcm({ archetype, durationMs: 320, seed: 42 });
        expect(synth.pcm[0]).toBe(0);
        expect(synth.pcm[synth.pcm.length - 1]).toBe(0);
      }
    });

    it("heartbeat-thump는 생리적 S1-S2 이중 박동 트랜지언트 타임스탬프를 2개 이상 기록한다", () => {
      const heart = synthesizeKoreanSfxFoleyPcm({
        sfxTextKo: "두근두근",
        durationMs: 900,
        seed: 99,
      });
      expect(heart.descriptors.transientTimesMs.length).toBeGreaterThanOrEqual(2);
      const t0 = heart.descriptors.transientTimesMs[0] ?? 0;
      const t1 = heart.descriptors.transientTimesMs[1] ?? 0;
      expect(t1 - t0).toBeGreaterThanOrEqual(200);
      expect(t1 - t0).toBeLessThanOrEqual(320);
    });

    it("강도(intensity)를 높이면 저강도 대비 RMS 에너지가 증가한다", () => {
      const soft = synthesizeKoreanSfxFoleyPcm({
        archetype: "whoosh-dash",
        intensity: 0.2,
        durationMs: 360,
        seed: 55,
      });
      const loud = synthesizeKoreanSfxFoleyPcm({
        archetype: "whoosh-dash",
        intensity: 0.95,
        durationMs: 360,
        seed: 55,
      });
      expect(loud.descriptors.rmsLinear).toBeGreaterThan(soft.descriptors.rmsLinear * 1.5);
    });

    it("비정상 범위의 durationMs와 NaN 강도 입력도 안전하게 클램프해 유한 PCM을 반환한다", () => {
      const synth = synthesizeKoreanSfxFoleyPcm({
        sfxTextKo: "콰광",
        durationMs: 5,
        intensity: Number.NaN,
        baseFreqHz: Number.POSITIVE_INFINITY,
      });
      expect(synth.durationMs).toBe(80);
      expect(synth.descriptors.nonFiniteSampleCount).toBe(0);
      expect(synth.descriptors.maxAbsSample).toBeLessThanOrEqual(0.892);
    });
  });

  describe("3. 정전력(Constant-Power) 스테레오 패닝 & 다중 중첩 클리핑 방어", () => {
    it("전 구간 panelXNorm에서 leftGain^2 + rightGain^2 === 1.0 (±1e-6) 불변량을 만족한다", () => {
      const points = [-0.5, 0, 0.05, 0.25, 0.5, 0.75, 0.95, 1.0, 1.8];
      for (const x of points) {
        const pan = computeConstantPowerStereoPan(x);
        expect(Math.abs(pan.leftGain * pan.leftGain + pan.rightGain * pan.rightGain - 1.0)).toBeLessThanOrEqual(
          1e-6,
        );
        expect(Math.abs(pan.powerSum - 1.0)).toBeLessThanOrEqual(1e-6);
      }
    });

    it("좌측 배치 SFX(panelXNorm=0.05)는 좌채널 RMS가 우채널보다 압도적으로 높다", () => {
      const mix = compileEpisodeSfxMixAndAccessibilityBridge([
        {
          cueId: "cue-left",
          panelId: "p-01",
          sfxTextKo: "챙강!",
          startTimeMs: 0,
          durationMs: 420,
          panelXNorm: 0.05,
          intensity: 0.85,
        },
      ]);
      expect(mix.compiledCues[0]?.pan.stereoZone).toBe("L");
      expect(mix.masterMetrics.leftRmsLinear).toBeGreaterThan(mix.masterMetrics.rightRmsLinear * 8);
    });

    it("우측 배치 SFX(panelXNorm=0.95)는 우채널 RMS가 좌채널보다 압도적으로 높다", () => {
      const mix = compileEpisodeSfxMixAndAccessibilityBridge([
        {
          cueId: "cue-right",
          panelId: "p-02",
          sfxTextKo: "와장창!",
          startTimeMs: 0,
          durationMs: 420,
          panelXNorm: 0.95,
          intensity: 0.85,
        },
      ]);
      expect(mix.compiledCues[0]?.pan.stereoZone).toBe("R");
      expect(mix.masterMetrics.rightRmsLinear).toBeGreaterThan(mix.masterMetrics.leftRmsLinear * 8);
    });

    it("중앙 배치 SFX(panelXNorm=0.5)는 좌·우 채널 RMS가 균형을 이룬다", () => {
      const mix = compileEpisodeSfxMixAndAccessibilityBridge([
        {
          cueId: "cue-center",
          panelId: "p-03",
          sfxTextKo: "휘익!",
          startTimeMs: 0,
          durationMs: 420,
          panelXNorm: 0.5,
          intensity: 0.8,
        },
      ]);
      expect(mix.compiledCues[0]?.pan.stereoZone).toBe("C");
      const ratio = mix.masterMetrics.leftRmsLinear / Math.max(1e-9, mix.masterMetrics.rightRmsLinear);
      expect(Math.abs(ratio - 1.0)).toBeLessThan(1e-4);
    });

    it("최대 강도 impact-boom 4개가 완전히 동시 충돌해도 -1.0 dBFS 이하·클리핑 0건을 유지한다", () => {
      const overlappingCues: readonly EpisodeSfxCueInput[] = [
        { cueId: "boom-1", panelId: "p-10", sfxTextKo: "콰광!!", startTimeMs: 100, durationMs: 600, panelXNorm: 0.2, intensity: 1.0, seedOverride: 1 },
        { cueId: "boom-2", panelId: "p-10", sfxTextKo: "쾅!!", startTimeMs: 100, durationMs: 600, panelXNorm: 0.45, intensity: 1.0, seedOverride: 2 },
        { cueId: "boom-3", panelId: "p-10", sfxTextKo: "우르릉!", startTimeMs: 100, durationMs: 600, panelXNorm: 0.55, intensity: 1.0, seedOverride: 3 },
        { cueId: "boom-4", panelId: "p-10", sfxTextKo: "쿵!!", startTimeMs: 100, durationMs: 600, panelXNorm: 0.8, intensity: 1.0, seedOverride: 4 },
      ];

      const mix = compileEpisodeSfxMixAndAccessibilityBridge(overlappingCues, {
        episodeId: "ep-boss-collision",
        sampleRateHz: 24000,
      });

      expect(mix.masterMetrics.maxSimultaneousCues).toBe(4);
      expect(mix.masterMetrics.clippedSampleCount).toBe(0);
      expect(mix.masterMetrics.nonFiniteSampleCount).toBe(0);
      expect(mix.masterMetrics.maxAbsMaster).toBeLessThanOrEqual(0.8913);
      expect(mix.masterMetrics.masterPeakDbfs).toBeLessThanOrEqual(PEAK_SAFETY_CEILING_DBFS + 1e-3);
      expect(mix.masterMetrics.withinBroadcastCeiling).toBe(true);
      expect(mix.masterMetrics.limiterActiveSampleCount).toBeGreaterThan(0);
    });

    it("입력 큐 순서가 섞여 있어도 시작 시각 기준으로 결정론적으로 정렬해 컴파일한다", () => {
      const unsorted: readonly EpisodeSfxCueInput[] = [
        { cueId: "c2", panelId: "p2", sfxTextKo: "챙강!", startTimeMs: 900, durationMs: 350, panelXNorm: 0.8, intensity: 0.85 },
        { cueId: "c1", panelId: "p1", sfxTextKo: "두근두근", startTimeMs: 100, durationMs: 650, panelXNorm: 0.5, intensity: 0.55 },
      ];
      const mix = compileEpisodeSfxMixAndAccessibilityBridge(unsorted);
      expect(mix.compiledCues.map((c) => c.cueId)).toEqual(["c1", "c2"]);
      expect(mix.accessibilityBridge.captionEvents.map((e) => e.cueId)).toEqual(["c1", "c2"]);
    });

    it("archetypeOverride 지정 시 텍스트 분류 대신 명시한 아키타입을 적용한다", () => {
      const mix = compileEpisodeSfxMixAndAccessibilityBridge([
        {
          cueId: "override-cue",
          panelId: "p1",
          sfxTextKo: "특수연출",
          startTimeMs: 0,
          durationMs: 360,
          panelXNorm: 0.5,
          intensity: 0.8,
          archetypeOverride: "glass-shatter",
        },
      ]);
      expect(mix.compiledCues[0]?.archetype).toBe("glass-shatter");
      expect(mix.compiledCues[0]?.accessibleCaptionKo).toContain("유리 파쇄음");
    });

    it("빈 에피소드 큐 목록도 무음 스테레오 버퍼와 오류 없는 리포트를 반환한다", () => {
      const mix = compileEpisodeSfxMixAndAccessibilityBridge([], { episodeId: "ep-empty" });
      expect(mix.compiledCues).toHaveLength(0);
      expect(mix.leftChannel.length).toBeGreaterThan(0);
      expect(mix.masterMetrics.clippedSampleCount).toBe(0);
      expect(mix.masterMetrics.nonFiniteSampleCount).toBe(0);
      expect(mix.accessibilityBridge.allCuesCaptioned).toBe(true);
      expect(mix.accessibilityBridge.captionCoverageRatio).toBe(1);
    });
  });

  describe("4. 무음 독자 자막·햅틱 접근성 브리지 & 제로-에셋 용량 절감", () => {
    const episodeCues: readonly EpisodeSfxCueInput[] = [
      { cueId: "q1", panelId: "p1", sfxTextKo: "주룩주룩", startTimeMs: 0, durationMs: 1200, panelXNorm: 0.5, intensity: 0.32 },
      { cueId: "q2", panelId: "p2", sfxTextKo: "두근두근", startTimeMs: 400, durationMs: 880, panelXNorm: 0.5, intensity: 0.58 },
      { cueId: "q3", panelId: "p3", sfxTextKo: "휘익!", startTimeMs: 1250, durationMs: 420, panelXNorm: 0.15, intensity: 0.65 },
      { cueId: "q4", panelId: "p4", sfxTextKo: "챙강!", startTimeMs: 1620, durationMs: 480, panelXNorm: 0.85, intensity: 0.92 },
      { cueId: "q5", panelId: "p5", sfxTextKo: "와장창!", startTimeMs: 2150, durationMs: 560, panelXNorm: 0.72, intensity: 0.96 },
      { cueId: "q6", panelId: "p6", sfxTextKo: "콰광!!", startTimeMs: 2650, durationMs: 650, panelXNorm: 0.5, intensity: 1.0 },
    ];

    it("모든 큐에 비어 있지 않은 구조화 한국어 접근성 자막을 100% 부착한다", () => {
      const mix = compileEpisodeSfxMixAndAccessibilityBridge(episodeCues, { episodeId: "ep-114" });
      expect(mix.accessibilityBridge.allCuesCaptioned).toBe(true);
      expect(mix.accessibilityBridge.captionCoverageRatio).toBe(1);

      const blade = mix.compiledCues.find((c) => c.cueId === "q4");
      const heart = mix.compiledCues.find((c) => c.cueId === "q2");
      const rain = mix.compiledCues.find((c) => c.cueId === "q1");

      expect(blade?.accessibleCaptionKo).toBe("[금속 검격음 · 강함]");
      expect(heart?.accessibleCaptionKo).toBe("[심장 박동 · 중간]");
      expect(rain?.accessibleCaptionKo).toBe("[빗소리 배경음 · 약함]");
      expect(blade?.spatialAccessibleCaptionKo).toContain("우측");
    });

    it("기본 햅틱 활성 모드에서 모든 개별 진동 펄스가 120ms 상한 이하로 제한된다", () => {
      const mix = compileEpisodeSfxMixAndAccessibilityBridge(episodeCues, {
        episodeId: "ep-114-haptic",
        prefersReducedMotion: false,
        hapticsEnabled: true,
      });
      expect(mix.accessibilityBridge.hapticAndShakeSuppressed).toBe(false);
      expect(mix.accessibilityBridge.hapticEvents.length).toBeGreaterThan(0);
      expect(mix.accessibilityBridge.maxObservedHapticBurstMs).toBeGreaterThan(0);
      expect(mix.accessibilityBridge.maxObservedHapticBurstMs).toBeLessThanOrEqual(MAX_HAPTIC_BURST_MS);
      for (const cue of mix.compiledCues) {
        expect(cue.hapticPatternMs.length).toBeGreaterThan(0);
        for (let i = 0; i < cue.hapticPatternMs.length; i += 2) {
          expect(cue.hapticPatternMs[i]).toBeLessThanOrEqual(MAX_HAPTIC_BURST_MS);
        }
      }
    });

    it("prefersReducedMotion: true 시 모든 진동 패턴과 화면 흔들림을 0으로 완전 차단한다", () => {
      const mix = compileEpisodeSfxMixAndAccessibilityBridge(episodeCues, {
        episodeId: "ep-114-reduced",
        prefersReducedMotion: true,
        hapticsEnabled: true,
      });
      expect(mix.accessibilityBridge.hapticAndShakeSuppressed).toBe(true);
      expect(mix.accessibilityBridge.reducedMotionCompliant).toBe(true);
      expect(mix.accessibilityBridge.maxObservedHapticBurstMs).toBe(0);
      expect(mix.accessibilityBridge.maxObservedVisualShakePx).toBe(0);
      expect(mix.accessibilityBridge.hapticEvents).toHaveLength(0);
      for (const cue of mix.compiledCues) {
        expect(cue.hapticPatternMs).toEqual([]);
        expect(cue.visualShakePx).toBe(0);
        expect(cue.accessibleCaptionKo.length).toBeGreaterThan(0);
      }
    });

    it("hapticsEnabled: false 시에도 진동 패턴과 화면 흔들림을 0으로 차단하면서 자막은 유지한다", () => {
      const mix = compileEpisodeSfxMixAndAccessibilityBridge(episodeCues, {
        episodeId: "ep-114-nohaptics",
        prefersReducedMotion: false,
        hapticsEnabled: false,
      });
      expect(mix.accessibilityBridge.hapticAndShakeSuppressed).toBe(true);
      expect(mix.accessibilityBridge.maxObservedHapticBurstMs).toBe(0);
      expect(mix.accessibilityBridge.maxObservedVisualShakePx).toBe(0);
      expect(mix.accessibilityBridge.allCuesCaptioned).toBe(true);
      for (const cue of mix.compiledCues) {
        expect(cue.hapticPatternMs).toEqual([]);
        expect(cue.visualShakePx).toBe(0);
      }
    });

    it("사용자 지정 maxHapticBurstMs(예: 60ms)를 모든 펄스 버스트에 엄격히 반영한다", () => {
      const mix = compileEpisodeSfxMixAndAccessibilityBridge(episodeCues, {
        maxHapticBurstMs: 60,
      });
      expect(mix.accessibilityBridge.maxObservedHapticBurstMs).toBeLessThanOrEqual(60);
      for (const ev of mix.accessibilityBridge.hapticEvents) {
        expect(ev.durationMs).toBeLessThanOrEqual(60);
      }
    });

    it("프로시저럴 시드 페이로드는 동등 스테레오 WAV 대비 95% 이상 바이트를 절감한다", () => {
      const mix = compileEpisodeSfxMixAndAccessibilityBridge(episodeCues, {
        episodeId: "ep-114-budget",
        sampleRateHz: 24000,
      });
      expect(mix.byteBudget.zeroAudioAssetDownloadRequired).toBe(true);
      expect(mix.byteBudget.proceduralSeedPayloadBytes).toBeGreaterThan(20);
      expect(mix.byteBudget.equivalentWavBytes).toBeGreaterThan(100_000);
      expect(mix.byteBudget.byteSavingsPercent).toBeGreaterThanOrEqual(95.0);
      expect(mix.byteBudget.compressionRatio).toBeGreaterThan(20);
    });

    it("단일 짧은 16kHz 큐에서도 무압축 WAV 대비 95% 이상 용량을 절감한다", () => {
      const mix = compileEpisodeSfxMixAndAccessibilityBridge(
        [
          {
            cueId: "short-1",
            panelId: "p1",
            sfxTextKo: "휙!",
            startTimeMs: 0,
            durationMs: 140,
            panelXNorm: 0.5,
            intensity: 0.7,
          },
        ],
        { sampleRateHz: 16000 },
      );
      expect(mix.byteBudget.byteSavingsPercent).toBeGreaterThanOrEqual(95.0);
    });
  });

  describe("5. 인쇄 안전 OKLCH SVG 타임라인 · 감사 · 자연스러운 한국어 QA 브리프", () => {
    const sampleMix = compileEpisodeSfxMixAndAccessibilityBridge(
      [
        { cueId: "s1", panelId: "p1", sfxTextKo: "두근두근", startTimeMs: 0, durationMs: 700, panelXNorm: 0.5, intensity: 0.55 },
        { cueId: "s2", panelId: "p2", sfxTextKo: "챙강! <검격 & \"충돌\">", startTimeMs: 550, durationMs: 460, panelXNorm: 0.12, intensity: 0.92 },
        { cueId: "s3", panelId: "p3", sfxTextKo: "콰광!!", startTimeMs: 900, durationMs: 600, panelXNorm: 0.88, intensity: 1.0 },
      ],
      { episodeId: "ep-svg-test", sampleRateHz: 24000 },
    );

    it("SVG는 순수 OKLCH 색상만 사용하고 원시 hex/rgb 리터럴 및 NaN/Infinity가 0건이다", () => {
      const svg = renderSfxFoleyTimelineSvg(sampleMix, {
        titleKo: "114화 클라이맥스 폴리 믹스 <검수본>",
      });
      const hexColorPattern = /#[0-9a-fA-F]{3,8}\b/;
      const rgbFuncPattern = new RegExp("rgba?" + "\\(", "i");

      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(hexColorPattern.test(svg)).toBe(false);
      expect(rgbFuncPattern.test(svg)).toBe(false);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
    });

    it("SVG는 L/R 스테레오 파형, -1 dBFS 안전선, L/C/R 패닝 배지 및 XML 이스케이프를 정확히 렌더링한다", () => {
      const svg = renderSfxFoleyTimelineSvg(sampleMix, {
        titleKo: "검수 <A & B>",
      });
      expect(svg).toContain("스테레오 L");
      expect(svg).toContain("스테레오 R");
      expect(svg).toContain("-1 dBFS");
      expect(svg).toContain(">L</text>");
      expect(svg).toContain(">C</text>");
      expect(svg).toContain(">R</text>");
      expect(svg).toContain("검수 &lt;A &amp; B&gt;");
      expect(svg).toContain("&lt;검격 &amp; &quot;충돌&quot;&gt;");
    });

    it("동작 줄이기 모드의 SVG는 진동·흔들림 0ms 차단 안내 배너를 렌더링한다", () => {
      const reducedMix = compileEpisodeSfxMixAndAccessibilityBridge(
        [
          { cueId: "r1", panelId: "p1", sfxTextKo: "콰광!", startTimeMs: 0, durationMs: 500, panelXNorm: 0.5, intensity: 0.9 },
        ],
        { episodeId: "ep-reduced-svg", prefersReducedMotion: true },
      );
      const svg = renderSfxFoleyTimelineSvg(reducedMix);
      expect(svg).toContain("동작 줄이기 안전");
      expect(svg).toContain("진동 0ms");
      expect(svg).not.toContain("NaN");
    });

    it("auditSfxFoleyBridge는 정상 믹스에서 모든 출고 감사 게이트를 통과로 판정한다", () => {
      const audit = auditSfxFoleyBridge(sampleMix);
      expect(audit.broadcastPeakSafe).toBe(true);
      expect(audit.zeroClippingAndFinite).toBe(true);
      expect(audit.constantPowerPanValid).toBe(true);
      expect(audit.silentReaderCaptionsComplete).toBe(true);
      expect(audit.reducedMotionAndHapticsSafe).toBe(true);
      expect(audit.byteSavingsTargetMet).toBe(true);
      expect(audit.readyForEpisodeDelivery).toBe(true);
    });

    it("summarizeSfxFoleyBridgeKo는 번역투 없는 자연스러운 한국어 사운드 디렉터 QA 브리프를 생성한다", () => {
      const brief = summarizeSfxFoleyBridgeKo(sampleMix);
      expect(brief).toContain("에피소드 출고 기준 통과");
      expect(brief).toContain("한국어 효과음 3건");
      expect(brief).toContain("-1.0 dBFS");
      expect(brief).toContain("절감");
      expect(brief).toContain("한국어 자막 부착 완료");
      expect(brief).toContain("햅틱 펄스");
      // AI 번역투 금지 검증
      expect(brief).not.toContain("하는 것을 가능하게 합니다");
      expect(brief).not.toContain("직관적인 경험을 제공합니다");
      expect(brief).not.toContain("원활한 워크플로우를 보장합니다");
    });

    it("동작 줄이기 적용 시 한국어 QA 브리프에 진동 0ms·흔들림 0px 차단 상태를 명시한다", () => {
      const reducedMix = compileEpisodeSfxMixAndAccessibilityBridge(
        [
          { cueId: "rm1", panelId: "p1", sfxTextKo: "와장창!", startTimeMs: 0, durationMs: 450, panelXNorm: 0.4, intensity: 0.9 },
        ],
        { episodeId: "ep-rm-brief", prefersReducedMotion: true },
      );
      const brief = summarizeSfxFoleyBridgeKo(reducedMix);
      expect(brief).toContain("진동 0ms·화면 흔들림 0px로 완전 차단됨");
      expect(brief).toContain("에피소드 출고 기준 통과");
    });
  });
});
