import { describe, expect, it } from "vitest";

import {
  ARENA_DEFAULT_ALIGNMENT_BYTES,
  GenerationalArenaCompactor,
  IntelligentReaderEngine,
  P2pEncryptedBackupVault,
  SUPER_RES_2X_UNIFORM_BYTES,
  WCAG_HEATMAP_UNIFORM_BYTES,
  WGSL_ATROUS_BILATERAL_DENOISER,
  WGSL_READER_SUPER_RES_2X,
  WGSL_WCAG_CVD_CONTRAST_HEATMAP,
  analyzeBalloonReadabilityHeatmap,
  buildMerkleTree,
  computeAtrousWorkgroups,
  computeSuperRes2xWorkgroups,
  computeWcagContrastRatio,
  createAtrousDenoiserPipelineDescriptor,
  createInMemoryP2pPeerNetwork,
  createInMemoryReaderOpfsAdapter,
  createSuperRes2xPipelineDescriptor,
  createWcagHeatmapPipelineDescriptor,
  denoiseRgbaAtrousCpu,
  deserializeArenaSimdFrame,
  evaluateAudioToonMix,
  generateVaultKey,
  getMerkleProof,
  importRawVaultKey,
  linearRgbToLms,
  lmsToLinearRgb,
  packAtrousDenoiserUniforms,
  packGenerationalHandle,
  packSuperRes2xUniforms,
  packWcagHeatmapUniforms,
  reflowBalloonTextForLocale,
  simulateColorVisionDeficiencyCpu,
  simulateRgbColorVision,
  splitIntoContentChunks,
  unpackGenerationalHandle,
  upscaleImage2xEdgeDirectedCpu,
  validateAtrousDenoiserWgsl,
  validateSuperRes2xWgsl,
  validateWcagHeatmapWgsl,
  verifyMerkleProof,
  type AudioToonCueTrack,
} from "./index";

function createDeterministicBytes(length: number, seed = 17): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = (state >>> 24) & 0xff;
  }
  return out;
}

describe("wasm64-reader-a11y-resilience", () => {
  describe("1. 무지연 웹툰 리더(OPFS 프리페치 · AudioToon 크로스페이드 · 2× 초해상도)", () => {
    it("스크롤 속도 ETA 예측으로 다음 2개 에피소드를 OPFS에 선행 적재하고 LRU 용량을 유지한다", async () => {
      const fetchCounts = new Map<string, number>();
      const payloads = new Map<string, Uint8Array>([
        ["ep-01", createDeterministicBytes(4096, 1)],
        ["ep-02", createDeterministicBytes(4096, 2)],
        ["ep-03", createDeterministicBytes(4096, 3)],
        ["ep-04", createDeterministicBytes(4096, 4)],
      ]);

      let fakeNow = 1000;
      const engine = new IntelligentReaderEngine({
        episodeIds: ["ep-01", "ep-02", "ep-03", "ep-04"],
        storage: createInMemoryReaderOpfsAdapter(),
        lookaheadEpisodes: 2,
        prefetchStartProgress: 0.75,
        prefetchLeadTimeSec: 6,
        minVelocityPxPerSec: 200,
        maxCacheBytes: 9000, // 최대 2개 에피소드(8192B) 보관 → 3번째 적재 시 LRU 퇴출
        nowMs: () => {
          fakeNow += 10;
          return fakeNow;
        },
        fetcher: async (episodeId) => {
          fetchCounts.set(episodeId, (fetchCounts.get(episodeId) ?? 0) + 1);
          const data = payloads.get(episodeId);
          if (!data) throw new Error(`missing episode ${episodeId}`);
          return data;
        },
      });

      // 초기 느린 스크롤(진행도 10%): 프리페치 미발동
      const step1 = engine.onScroll({
        episodeId: "ep-01",
        scrollY: 1000,
        viewportHeight: 1000,
        contentHeight: 11000,
        timestampMs: 0,
      });
      expect(step1.prefetch.triggered).toBe(false);
      await step1.prefetchPromise;

      // 빠른 정방향 스크롤(2500 px/s, 남은 거리 6500px → ETA 2.6초 <= 6초, 진행도 35% < 75%)
      const step2 = engine.onScroll({
        episodeId: "ep-01",
        scrollY: 3500,
        viewportHeight: 1000,
        contentHeight: 11000,
        timestampMs: 1000,
      });
      expect(step2.prefetch.triggered).toBe(true);
      expect(step2.prefetch.reason).toBe("velocity-eta");
      expect(step2.prefetch.queuedEpisodeIds).toEqual(["ep-02", "ep-03"]);
      const completed = await step2.prefetchPromise;
      expect(completed).toEqual(["ep-02", "ep-03"]);

      // 선행 적재된 ep-02를 읽으면 네트워크 재요청 없이 OPFS 캐시 즉시 히트
      const readEp2 = await engine.readEpisode("ep-02");
      expect(readEp2.fromOpfsCache).toBe(true);
      expect(readEp2.bytes).toEqual(payloads.get("ep-02"));
      expect(fetchCounts.get("ep-02")).toBe(1);

      // ep-03을 읽으면 접근 시각 갱신 후 ep-04 로드 시 LRU 퇴출 발생
      const step3 = engine.onScroll({
        episodeId: "ep-02",
        scrollY: 8500,
        viewportHeight: 1000,
        contentHeight: 11000,
        timestampMs: 2000,
      });
      expect(step3.prefetch.queuedEpisodeIds).toEqual(["ep-04"]);
      await step3.prefetchPromise;

      const metrics = engine.getMetrics();
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.prefetchedEpisodes).toBe(3);
      expect(metrics.evictedEpisodes).toBeGreaterThanOrEqual(1);
      expect(metrics.cachedBytes).toBeLessThanOrEqual(9000);
    });

    it("AudioToon 스크롤 진행도(0..1)에 따라 동등-전력 BGM 크로스페이드와 SFX 더킹을 정확히 스케줄한다", () => {
      const tracks: AudioToonCueTrack[] = [
        {
          id: "bgm-intro",
          kind: "bgm",
          startProgress: 0.0,
          endProgress: 0.6,
          fadeInSpan: 0.1,
          fadeOutSpan: 0.2,
          baseGain: 1.0,
          curve: "equal-power",
        },
        {
          id: "bgm-climax",
          kind: "bgm",
          startProgress: 0.4,
          endProgress: 1.0,
          fadeInSpan: 0.2,
          fadeOutSpan: 0.1,
          baseGain: 1.0,
          curve: "equal-power",
        },
        {
          id: "sfx-thunder",
          kind: "sfx",
          startProgress: 0.7,
          endProgress: 0.82,
          fadeInSpan: 0.02,
          fadeOutSpan: 0.04,
          baseGain: 0.9,
          curve: "smoothstep",
          duckingFactor: 0.35,
        },
      ];

      // 페이드인 구간(0.05): bgm-intro 상승, bgm-climax 비활성
      const early = evaluateAudioToonMix(0.05, tracks);
      expect(early.activeBgmIds).toEqual(["bgm-intro"]);
      expect(early.tracks[0]?.phase).toBe("fading-in");
      expect(early.tracks[0]?.gain).toBeCloseTo(Math.SQRT1_2, 3);

      // 두 BGM의 동등-전력 교차 중심(0.50): 각 gain ≈ 0.7071, 합산 RMS 에너지 ≈ 1.0 (음량 꺼짐 없음)
      const cross = evaluateAudioToonMix(0.5, tracks);
      expect(cross.activeBgmIds).toEqual(["bgm-intro", "bgm-climax"]);
      expect(cross.tracks[0]?.gain).toBeCloseTo(Math.SQRT1_2, 3);
      expect(cross.tracks[1]?.gain).toBeCloseTo(Math.SQRT1_2, 3);
      expect(cross.totalRmsEnergy).toBeCloseTo(1.0, 3);

      // SFX 피크 구간(0.75): BGM이 duckingFactor(0.35)로 자동 더킹
      const sfxPeak = evaluateAudioToonMix(0.75, tracks);
      expect(sfxPeak.activeSfxIds).toEqual(["sfx-thunder"]);
      expect(sfxPeak.bgmDuckMultiplier).toBeCloseTo(0.35, 3);
      expect(sfxPeak.tracks[1]?.gain).toBeCloseTo(0.35, 3);
    });

    it("WebGPU 2× 엣지 방향성 초해상도 WGSL 셰이더 구조와 CPU 패리티 선화 보존을 검증한다", () => {
      const validation = validateSuperRes2xWgsl(WGSL_READER_SUPER_RES_2X);
      expect(validation.valid).toBe(true);
      expect(validation.entryPoint).toBe("main");
      expect(validation.workgroupSize).toEqual([16, 16, 1]);
      expect(validation.bindings).toHaveLength(3);

      const uniforms = packSuperRes2xUniforms({ width: 16, height: 16 });
      expect(uniforms.byteLength).toBe(SUPER_RES_2X_UNIFORM_BYTES);
      expect(uniforms.outWidth).toBe(32);
      expect(uniforms.outHeight).toBe(32);
      expect(computeSuperRes2xWorkgroups(32, 32).totalWorkgroups).toBe(4);
      expect(createSuperRes2xPipelineDescriptor({ label: "sr" }).compute.entryPoint).toBe("main");

      // 16×16 대각선 잉크 선화(흰 배경 위 검은 대각선) 생성
      const w = 16;
      const h = 16;
      const src = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const isInk = Math.abs(x - y) <= 1;
          const v = isInk ? 12 : 248;
          const idx = (y * w + x) * 4;
          src[idx] = v;
          src[idx + 1] = v;
          src[idx + 2] = v;
          src[idx + 3] = 255;
        }
      }

      const upscaled = upscaleImage2xEdgeDirectedCpu(src, { width: w, height: h });
      expect(upscaled.width).toBe(32);
      expect(upscaled.height).toBe(32);
      expect(upscaled.rgba.length).toBe(32 * 32 * 4);
      expect(upscaled.directedEdgePixelCount).toBeGreaterThan(20);

      // 대각선 중심(16, 16)은 잉크 색(12)을 선명하게 유지, 배경(2, 28)은 백색(248)을 링잉 없이 유지
      const centerIdx = (16 * 32 + 16) * 4;
      const bgIdx = (28 * 32 + 2) * 4;
      expect(upscaled.rgba[centerIdx]).toBeLessThanOrEqual(20);
      expect(upscaled.rgba[bgIdx]).toBeGreaterThanOrEqual(245);
      // 오버슈트 클램핑 검증: 입력 [12, 248] 범위를 벗어나는 링잉 픽셀이 0개여야 한다
      for (let i = 0; i < upscaled.rgba.length; i += 4) {
        expect(upscaled.rgba[i]).toBeGreaterThanOrEqual(12);
        expect(upscaled.rgba[i]).toBeLessThanOrEqual(248);
      }
    });
  });

  describe("2. 글로벌 다국어 말풍선 자동 조판 및 금칙(Kinsoku) 처리", () => {
    it("한국어·영어·일본어(세로쓰기)·중국어(간체/번체) 대사를 말풍선 안전 영역에 금칙 위반 없이 조판한다", () => {
      const cases = [
        {
          locale: "ko" as const,
          shape: "ellipse" as const,
          text: "잠깐만! (여기서 멈추면 안 돼,) 끝까지 달려야 해!",
          widthPx: 260,
          heightPx: 190,
        },
        {
          locale: "en" as const,
          shape: "cloud" as const,
          text: "Wait a second! We cannot stop right here—keep pushing forward until dawn!",
          widthPx: 290,
          heightPx: 200,
        },
        {
          locale: "ja" as const,
          shape: "ellipse" as const,
          text: "「待って！」ここで諦めるわけにはいかないよ、絶対に勝つんだ！",
          widthPx: 200,
          heightPx: 280,
        },
        {
          locale: "zh-Hans" as const,
          shape: "rect" as const,
          text: "「别停下来！」我们马上就能冲出这片迷雾，坚持住！",
          widthPx: 250,
          heightPx: 170,
        },
        {
          locale: "zh-Hant" as const,
          shape: "ellipse" as const,
          text: "「千萬別放棄！」前方就是出口了，大家再撐一下！",
          widthPx: 190,
          heightPx: 260,
        },
      ];

      for (const spec of cases) {
        const result = reflowBalloonTextForLocale(spec);
        expect(result.overflow).toBe(false);
        expect(result.kinsokuViolationCount).toBe(0);
        expect(result.fittedFontSizePx).toBeGreaterThanOrEqual(10);
        expect(result.lines.length).toBeGreaterThanOrEqual(1);
        for (const line of result.lines) {
          expect(line.advancePx).toBeLessThanOrEqual(line.maxAvailablePx * 1.03);
        }
        if (spec.locale === "ja" || spec.locale === "zh-Hant") {
          expect(result.writingMode).toBe("ttb");
          const firstLine = result.lines[0];
          const secondLine = result.lines[1];
          if (firstLine && secondLine) {
            // 세로쓰기 열은 오른쪽에서 왼쪽으로 진행한다.
            expect(firstLine.x).toBeGreaterThan(secondLine.x);
          }
        }
      }
    });

    it("지나치게 좁은 말풍선에 과도한 대사가 들어가면 overflow 진단과 보정 힌트를 반환한다", () => {
      const overflowed = reflowBalloonTextForLocale({
        locale: "ko",
        shape: "ellipse",
        widthPx: 90,
        heightPx: 70,
        minFontSizePx: 12,
        maxFontSizePx: 24,
        text: "이 문장은 매우 작은 타원 말풍선 안에 12px 최소 글꼴로도 절대로 다 들어갈 수 없을 만큼 길게 작성된 테스트 대사입니다.",
      });
      expect(overflowed.overflow).toBe(true);
      expect(overflowed.readabilityGrade).toBe("overflow");
      expect(overflowed.overflowRatio).toBeGreaterThan(0);
      expect(overflowed.remediationHints.length).toBeGreaterThan(0);
    });
  });

  describe("3. WCAG 2.2 색각이상(CVD) 시뮬레이터 및 말풍선 가독성 대비 히트맵", () => {
    it("WCAG 2.2 대비비 정확도(흑/백 21:1)와 Viénot/Machado LMS 색각 변환의 무채색 불변성을 검증한다", () => {
      expect(computeWcagContrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21.0, 5);
      expect(computeWcagContrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21.0, 5);
      expect(computeWcagContrastRatio([120, 120, 120], [120, 120, 120])).toBeCloseTo(1.0, 5);

      // 선형 RGB <-> LMS 왕복 정밀도 확인
      const sampleLin = [0.42, 0.71, 0.19] as const;
      const roundTrip = lmsToLinearRgb(linearRgbToLms(sampleLin));
      expect(roundTrip[0]).toBeCloseTo(sampleLin[0], 3);
      expect(roundTrip[1]).toBeCloseTo(sampleLin[1], 3);
      expect(roundTrip[2]).toBeCloseTo(sampleLin[2], 3);

      // 백색·흑색·중간 회색은 모든 색각이상 모드에서 색편향 없이 보존되어야 한다
      const modes = ["protanopia", "deuteranopia", "tritanopia", "achromatopsia"] as const;
      for (const mode of modes) {
        const white = simulateRgbColorVision([255, 255, 255], mode, 1.0);
        const black = simulateRgbColorVision([0, 0, 0], mode, 1.0);
        const gray = simulateRgbColorVision([128, 128, 128], mode, 1.0);
        expect(white).toEqual([255, 255, 255]);
        expect(black).toEqual([0, 0, 0]);
        expect(Math.abs(gray[0] - 128)).toBeLessThanOrEqual(1);
        expect(Math.abs(gray[1] - 128)).toBeLessThanOrEqual(1);
        expect(Math.abs(gray[2] - 128)).toBeLessThanOrEqual(1);
      }

      // 적녹 색맹(deuteranopia)에서는 순적(255,0,0)과 녹색(0,175,0) 간 색차가 정상 시각 대비 크게 축소된다
      const redNormal = [255, 0, 0] as const;
      const greenNormal = [0, 175, 0] as const;
      const distNormal = Math.hypot(
        redNormal[0] - greenNormal[0],
        redNormal[1] - greenNormal[1],
        redNormal[2] - greenNormal[2],
      );
      const redDeutan = simulateRgbColorVision(redNormal, "deuteranopia", 1.0);
      const greenDeutan = simulateRgbColorVision(greenNormal, "deuteranopia", 1.0);
      const distDeutan = Math.hypot(
        redDeutan[0] - greenDeutan[0],
        redDeutan[1] - greenDeutan[1],
        redDeutan[2] - greenDeutan[2],
      );
      expect(distDeutan).toBeLessThan(distNormal * 0.25);

      // 전색맹(achromatopsia)은 순수 무채색(R === G === B)으로 출력
      const achro = simulateRgbColorVision([220, 60, 40], "achromatopsia", 1.0);
      expect(achro[0]).toBe(achro[1]);
      expect(achro[1]).toBe(achro[2]);

      // severity 0은 원본 항등 변환
      const patch = new Uint8ClampedArray([240, 40, 20, 255, 20, 200, 80, 255]);
      const identity = simulateColorVisionDeficiencyCpu(patch, 2, 1, { mode: "protanopia", severity: 0 });
      expect(identity.meanChromaticShift).toBe(0);
      expect(Array.from(identity.rgba)).toEqual(Array.from(patch));
    });

    it("AA/AAA 실패 말풍선 영역을 히트맵으로 검출하고 AAA 충족 외곽선·대체색 보정 힌트를 자동 산출한다", () => {
      const wgsl = validateWcagHeatmapWgsl(WGSL_WCAG_CVD_CONTRAST_HEATMAP);
      expect(wgsl.valid).toBe(true);
      expect(wgsl.workgroupSize).toEqual([16, 16, 1]);
      const packed = packWcagHeatmapUniforms({
        width: 24,
        height: 8,
        modeFlag: 1,
        cvdMode: "deuteranopia",
      });
      expect(packed.byteLength).toBe(WCAG_HEATMAP_UNIFORM_BYTES);
      expect(createWcagHeatmapPipelineDescriptor({ label: "wcag" }).compute.entryPoint).toBe("main");

      // 24×8 캔버스: 좌(0..7)=흰색, 중(8..15)=밝은 회색(190), 우(16..23)=중간 청회색(220,220,220)
      const w = 24;
      const h = 8;
      const canvas = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const idx = (y * w + x) * 4;
          if (x < 8) {
            canvas[idx] = 255; canvas[idx + 1] = 255; canvas[idx + 2] = 255; canvas[idx + 3] = 255;
          } else if (x < 16) {
            canvas[idx] = 190; canvas[idx + 1] = 190; canvas[idx + 2] = 190; canvas[idx + 3] = 255;
          } else {
            canvas[idx] = 255; canvas[idx + 1] = 255; canvas[idx + 2] = 255; canvas[idx + 3] = 255;
          }
        }
      }

      const result = analyzeBalloonReadabilityHeatmap(canvas, w, h, [
        { id: "balloon-aaa", x: 0, y: 0, width: 8, height: 8, textRgb: [0, 0, 0] },
        { id: "balloon-fail", x: 8, y: 0, width: 8, height: 8, textRgb: [120, 120, 120] },
        { id: "balloon-aa-only", x: 16, y: 0, width: 8, height: 8, textRgb: [108, 108, 108] },
      ]);

      expect(result.overallConformance).toBe("fail");
      expect(result.totalAaFailingRegions).toBe(1);
      expect(result.totalAaaFailingRegions).toBe(2);

      const aaaRegion = result.regions[0];
      const failRegion = result.regions[1];
      const aaRegion = result.regions[2];

      expect(aaaRegion?.conformance).toBe("aaa");
      expect(aaaRegion?.minContrastRatio).toBeCloseTo(21, 1);
      expect(aaaRegion?.remediation.needed).toBe(false);

      expect(failRegion?.conformance).toBe("fail");
      expect(failRegion?.failingAaPixelCount).toBe(64);
      expect(failRegion?.remediation.needed).toBe(true);
      expect(failRegion?.remediation.outlineWidthPx).toBe(2.5);
      expect(failRegion?.remediation.recommendedTextContrast).toBeGreaterThanOrEqual(7.0);
      // 실패 구역 히트맵 픽셀(x=10, y=4)이 크림슨 레드(220, 42, 52)로 마킹됨을 확인
      const failPxIdx = (4 * w + 10) * 4;
      expect(result.heatmapRgba[failPxIdx]).toBe(220);
      expect(result.heatmapRgba[failPxIdx + 1]).toBe(42);

      expect(aaRegion?.conformance).toBe("aa");
      expect(aaRegion?.remediation.needed).toBe(true);
      expect(aaRegion?.remediation.outlineWidthPx).toBe(1.5);

      // 적녹색맹(deuteranopia) 시뮬레이션에서 적색 텍스트 + 녹색 배경이 대비 붕괴로 실패 판정되는지 검증
      const cvdCanvas = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < cvdCanvas.length; i += 4) {
        cvdCanvas[i] = 20;
        cvdCanvas[i + 1] = 152;
        cvdCanvas[i + 2] = 24;
        cvdCanvas[i + 3] = 255;
      }
      const cvdHeat = analyzeBalloonReadabilityHeatmap(cvdCanvas, 4, 4, [
        {
          id: "red-on-green-deutan",
          x: 0,
          y: 0,
          width: 4,
          height: 4,
          textRgb: [224, 34, 24],
          simulatedCvdMode: "deuteranopia",
        },
      ]);
      expect(cvdHeat.regions[0]?.conformance).toBe("fail");
      expect(cvdHeat.regions[0]?.minContrastRatio).toBeLessThan(2.0);
      expect(cvdHeat.regions[0]?.remediation.needed).toBe(true);
      expect(cvdHeat.regions[0]?.remediation.outlineWidthPx).toBe(2.5);
      expect(cvdHeat.regions[0]?.remediation.recommendedTextContrast).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe("4. WebGPU À-Trous 에지 보존 디노이저 · 세대 안전 메모리 풀 및 단편화 압축기", () => {
    it("À-Trous 디노이저가 몬테카를로 그레인 노이즈 분산을 크게 줄이면서 잉크 선화 경계를 보존한다", () => {
      const wgsl = validateAtrousDenoiserWgsl(WGSL_ATROUS_BILATERAL_DENOISER);
      expect(wgsl.valid).toBe(true);
      expect(wgsl.workgroupSize).toEqual([16, 16, 1]);
      expect(packAtrousDenoiserUniforms({ width: 32, height: 32 }, 2).stepSize).toBe(2);
      expect(computeAtrousWorkgroups(32, 32).totalWorkgroups).toBe(4);
      expect(createAtrousDenoiserPipelineDescriptor({ label: "atrous" }).compute.entryPoint).toBe("main");

      // 32×32 타일: 중앙 수직 검은 잉크선(x=15..16) + 배경에 ±26 결정적 체커/그레인 노이즈 주입
      const w = 32;
      const h = 32;
      const noisy = new Uint8ClampedArray(w * h * 4);
      let rng = 20261126;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
          const jitter = ((rng >>> 24) % 53) - 26;
          const isInk = x === 15 || x === 16;
          const base = isInk ? 10 : 215 + jitter;
          const clamped = Math.max(0, Math.min(255, base));
          const idx = (y * w + x) * 4;
          noisy[idx] = clamped;
          noisy[idx + 1] = clamped;
          noisy[idx + 2] = clamped;
          noisy[idx + 3] = 255;
        }
      }

      const result = denoiseRgbaAtrousCpu(noisy, {
        width: w,
        height: h,
        passes: 3,
        sigmaColor: 0.22,
        sigmaSpatial: 2.0,
        inkLuminanceThreshold: 0.2,
        inkProtectionStrength: 0.98,
      });

      expect(result.passesExecuted).toBe(3);
      expect(result.inputNoiseVariance).toBeGreaterThan(0.001);
      expect(result.outputNoiseVariance).toBeLessThan(result.inputNoiseVariance * 0.35);
      expect(result.noiseReductionRatio).toBeGreaterThan(0.65);
      expect(result.edgePreservationScore).toBeGreaterThan(0.85);
      // 중앙 잉크 선화 픽셀(x=15, y=16)이 흐려지지 않고 어둡게 유지됨
      const inkIdx = (16 * w + 15) * 4;
      expect(result.rgba[inkIdx]).toBeLessThanOrEqual(22);
    });

    it("세대 핸들이 UAF/ABA 스테일 접근을 차단하고 compact()가 단편화율을 0%로 복구한다", () => {
      const packed = packGenerationalHandle(42, 7);
      expect(unpackGenerationalHandle(packed.packedId)).toEqual(packed);

      const arena = new GenerationalArenaCompactor({
        capacityBytes: 1024,
        alignmentBytes: ARENA_DEFAULT_ALIGNMENT_BYTES,
      });

      // 8개 × 128B 슬랩 할당(총 1024B 전체 점유)
      const payloads: Uint8Array[] = [];
      const handles = [];
      for (let i = 0; i < 8; i += 1) {
        const data = createDeterministicBytes(100, 100 + i);
        payloads.push(data);
        const alloc = arena.allocate(100, data, `slot-${i}`);
        expect(alloc.ok).toBe(true);
        if (alloc.ok) {
          expect(alloc.offset % ARENA_DEFAULT_ALIGNMENT_BYTES).toBe(0);
          handles.push(alloc.handle);
        }
      }

      // 짝수 슬랩 4개(0, 2, 4, 6) 해제 → 4개의 비연속 112B 구멍 발생(높은 외부 단편화)
      const freedHandle0 = handles[0];
      const handle2 = handles[2];
      const handle4 = handles[4];
      const handle6 = handles[6];
      expect(freedHandle0).toBeDefined();
      expect(handle2).toBeDefined();
      expect(handle4).toBeDefined();
      expect(handle6).toBeDefined();
      if (!freedHandle0 || !handle2 || !handle4 || !handle6) throw new Error("핸들 할당 누락");

      expect(arena.free(freedHandle0)).toEqual({ ok: true });
      expect(arena.free(handle2)).toEqual({ ok: true });
      expect(arena.free(handle4)).toEqual({ ok: true });
      expect(arena.free(handle6)).toEqual({ ok: true });

      // 해제된 핸들 재접근·이중 해제 차단 검증
      expect(arena.read(freedHandle0)).toEqual({ ok: false, error: "stale-handle" });
      expect(arena.free(freedHandle0)).toEqual({ ok: false, error: "stale-handle" });

      // 같은 슬롯 인덱스가 재할당되어도 세대가 증가하므로 옛 핸들은 여전히 거부된다(ABA 차단)
      const beforeCompactStats = arena.getStats();
      expect(beforeCompactStats.freeBlockCount).toBeGreaterThanOrEqual(4);
      expect(beforeCompactStats.fragmentationRatio).toBeGreaterThan(0.6);

      // 총 여유 공간은 충분(>= 448B)하지만 연속 블록이 없어 384B 할당은 단편화로 실패(needsCompaction: true)
      const oomFragmented = arena.allocate(384);
      expect(oomFragmented).toEqual({ ok: false, error: "out-of-memory", needsCompaction: true });

      // 실시간 단편화 압축 실행: 단편화율 -> 정확히 0%, 단일 연속 여유 블록으로 통합
      const report = arena.compact();
      expect(report.fragmentationRatioBefore).toBeGreaterThan(0.6);
      expect(report.fragmentationRatioAfter).toBe(0);
      expect(report.freeBlocksAfter).toBe(1);
      expect(report.movedAllocations).toBeGreaterThan(0);

      // 압축 후에도 살아있는 홀수 핸들(1, 3, 5, 7)은 100% 비트-동일 데이터 유지
      for (const liveIdx of [1, 3, 5, 7]) {
        const liveHandle = handles[liveIdx];
        expect(liveHandle).toBeDefined();
        if (!liveHandle) continue;
        const readRes = arena.read(liveHandle);
        expect(readRes.ok).toBe(true);
        if (readRes.ok) {
          expect(readRes.bytes).toEqual(payloads[liveIdx]);
          expect(readRes.offset % ARENA_DEFAULT_ALIGNMENT_BYTES).toBe(0);
        }
      }

      // 압축 후에는 384B 대용량 연속 할당이 즉시 성공하며, 재사용된 슬롯의 옛 핸들은 여전히 거부됨
      const largeAlloc = arena.allocate(384, createDeterministicBytes(384, 999), "large");
      expect(largeAlloc.ok).toBe(true);
      expect(arena.read(freedHandle0)).toEqual({ ok: false, error: "stale-handle" });

      // 정렬 SIMD 바이너리 프레임 직렬화/역직렬화 + 1비트 변조 체크섬 차단 검증
      const simdFrame = arena.serializeSimdFrame();
      const decoded = deserializeArenaSimdFrame(simdFrame);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(decoded.alignmentBytes).toBe(16);
        expect(decoded.records).toHaveLength(5);
      }

      const tampered = new Uint8Array(simdFrame);
      tampered[tampered.byteLength - 1] = (tampered[tampered.byteLength - 1] ?? 0) ^ 0x01;
      expect(deserializeArenaSimdFrame(tampered)).toEqual({ ok: false, error: "checksum-mismatch" });

      // autoCompactOnOom 옵션 활성 시 단편화 OOM 상황에서 자동 압축 후 할당 성공 확인
      const autoArena = new GenerationalArenaCompactor({ capacityBytes: 256, autoCompactOnOom: true });
      const a0 = autoArena.allocate(64);
      const a1 = autoArena.allocate(64);
      const a2 = autoArena.allocate(64);
      const a3 = autoArena.allocate(64);
      expect(a0.ok && a1.ok && a2.ok && a3.ok).toBe(true);
      if (a0.ok && a2.ok) {
        autoArena.free(a0.handle);
        autoArena.free(a2.handle);
      }
      const recoveredAlloc = autoArena.allocate(128);
      expect(recoveredAlloc.ok).toBe(true);
      expect(autoArena.getStats().compactionCount).toBe(1);
    });
  });

  describe("5. 무서버(₩0) P2P 암호화 자동 백업 · Merkle 무결성 검증 · 피어 유실 복구", () => {
    it("SHA-256 이진 Merkle 포함 증명과 1비트 변조 탐지를 검증한다", async () => {
      const snapshot = createDeterministicBytes(2048, 77);
      const chunks = splitIntoContentChunks(snapshot, 256);
      expect(chunks).toHaveLength(8);

      const tree = await buildMerkleTree(chunks, "sha-256");
      expect(tree.rootHex).toHaveLength(64);

      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        expect(chunk).toBeDefined();
        if (!chunk) continue;
        const proof = getMerkleProof(tree, i);
        const ok = await verifyMerkleProof(chunk, proof);
        expect(ok.valid).toBe(true);
        expect(ok.computedRootHex).toBe(tree.rootHex);
      }

      // 청크 3의 단 1비트만 변조해도 Merkle 증명 즉시 실패
      const chunk3 = chunks[3];
      expect(chunk3).toBeDefined();
      if (!chunk3) throw new Error("청크 3 누락");
      const tamperedChunk = new Uint8Array(chunk3);
      tamperedChunk[10] = (tamperedChunk[10] ?? 0) ^ 0x01;
      const tamperedResult = await verifyMerkleProof(tamperedChunk, getMerkleProof(tree, 3));
      expect(tamperedResult.valid).toBe(false);

      // FNV-1a-128 모드 + 형제 증명 해시 변조 거부 검증
      const fnvTree = await buildMerkleTree(chunks, "fnv1a-128");
      const fnvProof = getMerkleProof(fnvTree, 2);
      const chunk2 = chunks[2];
      expect(chunk2).toBeDefined();
      if (chunk2) {
        expect((await verifyMerkleProof(chunk2, fnvProof)).valid).toBe(true);
        const badSiblings = fnvProof.siblings.map((s, idx) =>
          idx === 0 ? { ...s, digestHex: `${s.digestHex.slice(0, -1)}${s.digestHex.endsWith("0") ? "1" : "0"}` } : s,
        );
        expect((await verifyMerkleProof(chunk2, { ...fnvProof, siblings: badSiblings })).valid).toBe(false);
      }
    });

    it("AES-256-GCM 암호화 + k+1 XOR 패리티 분산 후 피어 1대 유실·변조 시에도 100% 비트-동일 복구한다", async () => {
      const peers = createInMemoryP2pPeerNetwork(["peer-a", "peer-b", "peer-c", "peer-d", "peer-parity"]);
      const vault = new P2pEncryptedBackupVault(peers);

      // 결정적 32바이트 테스트 키 및 스냅샷 페이로드(평문 시그니처 포함)
      const testRawKey = createDeterministicBytes(32, 2026);
      const vaultKey = await importRawVaultKey(testRawKey);
      const secretMarker = new TextEncoder().encode("TOONSTUDIO-EPISODE-MASTER-SCENE-SECRET");
      const snapshot = new Uint8Array(2400);
      snapshot.set(secretMarker, 128);
      snapshot.set(createDeterministicBytes(2400 - 256, 303), 256);

      const manifest = await vault.backupSnapshot(snapshot, vaultKey, {
        snapshotId: "snap-2026-11-26-ep12",
        chunkSizeBytes: 512,
        dataShardCount: 4,
        hashAlgorithm: "sha-256",
        deterministicIvSeed: createDeterministicBytes(12, 88),
        createdAtIso: "2026-11-26T08:00:00.000Z",
      });

      expect(manifest.serverStorageBytes).toBe(0);
      expect(manifest.shards).toHaveLength(5);

      // 피어 저장소에 평문 마커 문자열이 노출되지 않음을 확인(종단간 암호화)
      const markerText = "TOONSTUDIO-EPISODE-MASTER-SCENE-SECRET";
      for (const shard of manifest.shards) {
        const raw = peers.inspectRawShard(shard.peerId, shard.shardKey);
        expect(raw).not.toBeNull();
        const decodedText = new TextDecoder("latin1").decode(raw ?? new Uint8Array(0));
        expect(decodedText.includes(markerText)).toBe(false);
      }

      // 1) 정상 상태 복구
      const healthyRecovery = await vault.recoverSnapshot(manifest, vaultKey);
      expect(healthyRecovery.ok).toBe(true);
      if (healthyRecovery.ok) {
        expect(healthyRecovery.data).toEqual(snapshot);
        expect(healthyRecovery.report.recoveredFromParity).toBe(false);
        expect(healthyRecovery.report.serverStorageBytes).toBe(0);
      }

      // 2) 데이터 피어 1대(peer-c, shardIndex=2) 완전 유실 → XOR 패리티로 100% 비트-동일 복구
      peers.setPeerOffline("peer-c", true);
      const parityRecovery = await vault.recoverSnapshot(manifest, vaultKey);
      expect(parityRecovery.ok).toBe(true);
      if (parityRecovery.ok) {
        expect(parityRecovery.data).toEqual(snapshot);
        expect(parityRecovery.report.recoveredFromParity).toBe(true);
        expect(parityRecovery.report.reconstructedShardIndex).toBe(2);
        expect(parityRecovery.report.lostOrCorruptedPeerIds).toEqual(["peer-c"]);
        expect(parityRecovery.report.verifiedChunkCount).toBe(manifest.chunkCount);
      }
      peers.setPeerOffline("peer-c", false);

      // 3) 피어 1대의 샤드 1바이트 조용한 변조 → 다이제스트로 오염 탐지 후 패리티로 무결성 복구
      const shard1 = manifest.shards[1];
      expect(shard1).toBeDefined();
      if (!shard1) throw new Error("샤드 1 누락");
      expect(peers.corruptPeerShard(shard1.peerId, shard1.shardKey, 12)).toBe(true);
      const corruptRecovery = await vault.recoverSnapshot(manifest, vaultKey);
      expect(corruptRecovery.ok).toBe(true);
      if (corruptRecovery.ok) {
        expect(corruptRecovery.data).toEqual(snapshot);
        expect(corruptRecovery.report.recoveredFromParity).toBe(true);
        expect(corruptRecovery.report.lostOrCorruptedPeerIds).toEqual([shard1.peerId]);
      }

      // 4) 동시 2개 피어 장애(변조 1 + 오프라인 1) → 복구 불가 오류 명확 반환
      peers.setPeerOffline("peer-d", true);
      const doubleLoss = await vault.recoverSnapshot(manifest, vaultKey);
      expect(doubleLoss.ok).toBe(false);
      if (!doubleLoss.ok) {
        expect(doubleLoss.error).toBe("insufficient-shards-for-recovery");
      }
      peers.setPeerOffline("peer-d", false);

      // 5) 잘못된 AES-256-GCM 키로 복구 시도 → 복호화 인증 실패 차단
      const wrongKey = await generateVaultKey();
      const wrongKeyRes = await vault.recoverSnapshot(manifest, wrongKey);
      expect(wrongKeyRes.ok).toBe(false);
      if (!wrongKeyRes.ok) {
        expect(wrongKeyRes.error).toBe("decryption-failed");
      }
    });
  });
});
