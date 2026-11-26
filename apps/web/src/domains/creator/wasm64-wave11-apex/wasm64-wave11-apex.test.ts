import { describe, expect, it } from "vitest";

import {
  buildTsarcInclusionProof,
  computeBs1770KWeightingFilters,
  computeTruePeakEnvelope4x,
  DEFAULT_TARGET_INTEGRATED_LUFS,
  DEFAULT_TARGET_TRUE_PEAK_DBTP,
  estimateOculomotorReadingLoad,
  kubelkaMunkKsToReflectance,
  masterAudioToonEpisode,
  measureBs1770Loudness,
  mixKubelkaMunkSpectralPigments,
  packTsarcCartridge,
  projectPointHomography,
  reflectanceToKubelkaMunkKs,
  sha256Hex,
  solveHomography3x3,
  SPECTRAL_WAVELENGTHS_NM,
  spectralReflectance8ToSrgb,
  srgbToSpectralReflectance8,
  TSARC_HEADER_SIZE_BYTES,
  TSARC_MAGIC_BYTES,
  TSARC_MAGIC_SIGNATURE,
  verifyAndUnpackTsarcCartridge,
  verifyTsarcInclusionProof,
  warpRgbaDecalWithHomography,
  type QuadCorners2D,
} from "./index";

describe("Wasm64 Wave 11 Apex — 안구 도약·Kubelka-Munk·3×3 호모그래피·BS.1770-4 LUFS·TSARC 아카이브", () => {
  describe("1. Oculomotor Saccade & Reading Load Estimator", () => {
    it("자연스러운 좌→우·상→하 Z 시선 흐름에서는 역-Z 교차 없이 응시·도약 시간을 산출한다", () => {
      const report = estimateOculomotorReadingLoad({
        readingDirection: "ltr",
        cuts: [{ cutId: "cut-1", x: 0, y: 0, widthPx: 800, heightPx: 1000 }],
        balloons: [
          {
            balloonId: "b-1", cutId: "cut-1", readingOrder: 1,
            centerX: 200, centerY: 180, widthPx: 180, heightPx: 110,
            text: "오늘 바람이 꽤 차갑네.", fontSizePx: 16,
          },
          {
            balloonId: "b-2", cutId: "cut-1", readingOrder: 2,
            centerX: 560, centerY: 420, widthPx: 190, heightPx: 115,
            text: "외투 단단히 여미고 가자!", fontSizePx: 16,
          },
        ],
      });

      expect(report.serverCostKrw).toBe(0);
      expect(report.reverseZCrossoverCount).toBe(0);
      expect(report.overloadedCutCount).toBe(0);
      expect(report.anomalies).toHaveLength(0);
      expect(report.balloonFixations).toHaveLength(2);
      expect(report.balloonFixations[0]!.fixationDurationMs).toBeGreaterThan(250);
      expect(report.saccades).toHaveLength(1);
      expect(report.saccades[0]!.visualAngleDeg).toBeGreaterThan(1);
      expect(report.saccades[0]!.fittsIndexOfDifficultyBits).toBeGreaterThan(1);
      expect(report.totalEpisodeReadingDurationMs).toBeGreaterThan(900);
    });

    it("역-Z 가로 역행(dx 역전), 상향 회귀(dy 역전), 시선 선분 X자 교차 및 컷 과밀도를 정확히 잡아낸다", () => {
      const report = estimateOculomotorReadingLoad({
        readingDirection: "ltr",
        cuts: [{ cutId: "cut-dense", x: 0, y: 0, widthPx: 720, heightPx: 600 }],
        balloons: [
          {
            balloonId: "b-1", cutId: "cut-dense", readingOrder: 1,
            centerX: 580, centerY: 140, widthPx: 220, heightPx: 140,
            text: "오른쪽 위에서 먼저 시작해 버린 긴 대사입니다, 독자 시선이 당황하기 시작합니다.",
            fontSizePx: 11,
          },
          {
            balloonId: "b-2", cutId: "cut-dense", readingOrder: 2,
            centerX: 140, centerY: 150, widthPx: 220, heightPx: 140,
            text: "같은 가로줄인데 왼쪽으로 역행해 읽어야 하는 두 번째 대사입니다.",
            fontSizePx: 11,
          },
          {
            balloonId: "b-3", cutId: "cut-dense", readingOrder: 3,
            centerX: 590, centerY: 460, widthPx: 230, heightPx: 140,
            text: "오른쪽 아래로 크게 내려갔다가 다시 위로 거슬러 올라갈 예정입니다.",
            fontSizePx: 11,
          },
          {
            balloonId: "b-4", cutId: "cut-dense", readingOrder: 4,
            centerX: 540, centerY: 80, widthPx: 220, heightPx: 130,
            text: "위쪽으로 역주행하면서 첫 도약 선분과 X자로 교차하는 네 번째 과밀 대사입니다!",
            fontSizePx: 11,
          },
        ],
      });

      const kinds = new Set(report.anomalies.map((a) => a.kind));
      expect(kinds.has("reverse-z-dx-inversion")).toBe(true);
      expect(kinds.has("upward-dy-regression")).toBe(true);
      expect(kinds.has("gaze-segment-intersection")).toBe(true);
      expect(kinds.has("excessive-cut-cognitive-density")).toBe(true);
      expect(report.reverseZCrossoverCount).toBeGreaterThanOrEqual(3);
      expect(report.overloadedCutCount).toBe(1);
      expect(report.cutSummaries[0]!.overloaded).toBe(true);
    });
  });

  describe("2. Kubelka-Munk 8-Band Spectral Subtractive Paint Mixer", () => {
    it("8개 가시광 파장(400..700nm)과 K/S 정·역변환 항등성을 만족한다", () => {
      expect(SPECTRAL_WAVELENGTHS_NM).toEqual([400, 443, 486, 529, 571, 614, 657, 700]);
      for (const r of [0.02, 0.15, 0.42, 0.78, 0.95]) {
        const ks = reflectanceToKubelkaMunkKs(r);
        const restored = kubelkaMunkKsToReflectance(ks);
        expect(restored).toBeCloseTo(r, 9);
      }
    });

    it("노란 안료와 파란 안료를 감산 혼합하면 회색이 아닌 고채도 녹색이 합성된다", () => {
      const cadmiumYellow = [255, 228, 0] as const;
      const cobaltBlue = [0, 72, 232] as const;

      const mix = mixKubelkaMunkSpectralPigments([
        { srgb: cadmiumYellow, concentration: 0.5 },
        { srgb: cobaltBlue, concentration: 0.5 },
      ]);

      const [r, g, b] = mix.srgb;
      expect(mix.serverCostKrw).toBe(0);
      // G 채널이 R 및 B 채널보다 뚜렷하게 우세한 실제 회화풍 에메랄드/리프 그린 확인
      expect(g).toBeGreaterThan(120);
      expect(g).toBeGreaterThan(r + 75);
      expect(g).toBeGreaterThan(b + 25);

      // 순수 sRGB 노랑 [255,255,0] + 파랑 [0,0,255]의 단순 가산 평균 [128,128,128](채도 0) 대비 높은 채도 이득
      const extremeMix = mixKubelkaMunkSpectralPigments([
        { srgb: [255, 255, 0], concentration: 1 },
        { srgb: [0, 0, 255], concentration: 1 },
      ]);
      expect(extremeMix.naiveAdditiveSrgb).toEqual([128, 128, 128]);
      expect(extremeMix.srgb[1]).toBeGreaterThan(extremeMix.srgb[0] + 80);
      expect(extremeMix.srgb[1]).toBeGreaterThan(extremeMix.srgb[2] + 25);
      expect(extremeMix.chromaGainOverAdditive).toBeGreaterThan(90);
    });

    it("혼색 교환법칙, 티타늄 화이트 산란력 조색, metamer-calibrated 색 복원을 검증한다", () => {
      const ab = mixKubelkaMunkSpectralPigments([
        { srgb: [230, 45, 35], concentration: 0.35 },
        { srgb: [250, 215, 15], concentration: 0.65 },
      ]);
      const ba = mixKubelkaMunkSpectralPigments([
        { srgb: [250, 215, 15], concentration: 0.65 },
        { srgb: [230, 45, 35], concentration: 0.35 },
      ]);
      expect(ab.srgb).toEqual(ba.srgb);

      // 티타늄 화이트(산란력 2.4) 혼합 시 반사 휘도(CIE Y)가 2배 가까이로 뚜렷하게 상승
      const deepBlueOnly = mixKubelkaMunkSpectralPigments([{ srgb: [15, 45, 190], concentration: 1 }]);
      const tintedWithWhite = mixKubelkaMunkSpectralPigments([
        { srgb: [15, 45, 190], concentration: 0.5, scatteringStrength: 1.0 },
        { srgb: [252, 252, 250], concentration: 0.5, scatteringStrength: 2.4 },
      ]);
      expect(tintedWithWhite.cieXyzD65[1]).toBeGreaterThan(deepBlueOnly.cieXyzD65[1] * 1.95);

      // metamer-calibrated 모드에서 임의 파스텔 색상의 정밀 CIE XYZ -> sRGB 왕복 복원
      const targetSrgb = [196, 118, 84] as const;
      const uplifted = srgbToSpectralReflectance8(targetSrgb, "metamer-calibrated");
      const roundTrip = spectralReflectance8ToSrgb(uplifted);
      expect(Math.abs(roundTrip.srgb[0] - targetSrgb[0])).toBeLessThanOrEqual(2);
      expect(Math.abs(roundTrip.srgb[1] - targetSrgb[1])).toBeLessThanOrEqual(2);
      expect(Math.abs(roundTrip.srgb[2] - targetSrgb[2])).toBeLessThanOrEqual(2);
    });
  });

  describe("3. Projective 3×3 Homography Prop Decal Mapper", () => {
    it("대형 캔버스 좌표에서도 Hartley 정규화 DLT로 서브픽셀 오차 1e-8 이하의 3×3 호모그래피를 해독한다", () => {
      const srcQuad: QuadCorners2D = [[0, 0], [512, 0], [512, 256], [0, 256]];
      const dstQuad: QuadCorners2D = [[1240, 2180], [2190, 2340], [2140, 2890], [1195, 2980]];

      const solved = solveHomography3x3(srcQuad, dstQuad);
      expect(solved.maxCornerReprojectionErrorPx).toBeLessThan(1e-8);

      for (let i = 0; i < 4; i += 1) {
        const p = projectPointHomography(solved.matrix, srcQuad[i]!);
        expect(p[0]).toBeCloseTo(dstQuad[i]![0], 7);
        expect(p[1]).toBeCloseTo(dstQuad[i]![1], 7);

        const invP = projectPointHomography(solved.inverseMatrix, p);
        expect(invP[0]).toBeCloseTo(srcQuad[i]![0], 7);
        expect(invP[1]).toBeCloseTo(srcQuad[i]![1], 7);
      }

      expect(() =>
        solveHomography3x3(srcQuad, [[10, 10], [50, 50], [90, 90], [10, 90]]),
      ).toThrow(/일직선/);
    });

    it("소실점 벽면 사다리꼴에 RGBA 간판 텍스처를 4×4 슈퍼샘플링 워핑하고 배경 위에 깔끔히 합성한다", () => {
      const srcW = 8;
      const srcH = 8;
      const srcRgba = new Uint8ClampedArray(srcW * srcH * 4);
      for (let y = 0; y < srcH; y += 1) {
        for (let x = 0; x < srcW; x += 1) {
          const idx = (y * srcW + x) * 4;
          const isLeftHalf = x < 4;
          srcRgba[idx] = isLeftHalf ? 220 : 30;
          srcRgba[idx + 1] = isLeftHalf ? 55 : 185;
          srcRgba[idx + 2] = isLeftHalf ? 40 : 210;
          srcRgba[idx + 3] = 255;
        }
      }

      const dstW = 32;
      const dstH = 32;
      const bg = new Uint8ClampedArray(dstW * dstH * 4);
      for (let i = 0; i < bg.length; i += 4) {
        bg[i] = 240; bg[i + 1] = 238; bg[i + 2] = 230; bg[i + 3] = 255;
      }

      const targetQuad: QuadCorners2D = [[6, 5], [26, 8], [24, 27], [5, 29]];
      const warped = warpRgbaDecalWithHomography({
        srcRgba, srcWidth: srcW, srcHeight: srcH,
        dstWidth: dstW, dstHeight: dstH,
        targetQuad, dstRgba: bg,
        antiAliasing: "supersample-4x4",
      });

      expect(warped.serverCostKrw).toBe(0);
      expect(warped.coveredPixelCount).toBeGreaterThan(250);

      // 사각형 바깥 픽셀(1, 1)은 원본 배경색 그대로 보존
      const outsideIdx = (1 * dstW + 1) * 4;
      expect(Array.from(warped.rgba.slice(outsideIdx, outsideIdx + 4))).toEqual([240, 238, 230, 255]);

      // 왼쪽 내부 픽셀(9, 17)은 붉은 간판 영역, 오른쪽 내부 픽셀(21, 17)은 청록 간판 영역으로 매핑됨
      const leftInnerIdx = (17 * dstW + 9) * 4;
      const rightInnerIdx = (17 * dstW + 21) * 4;
      expect(warped.rgba[leftInnerIdx]!).toBeGreaterThan(190);
      expect(warped.rgba[leftInnerIdx + 2]!).toBeLessThan(70);
      expect(warped.rgba[rightInnerIdx + 2]!).toBeGreaterThan(180);
      expect(warped.rgba[rightInnerIdx]!).toBeLessThan(60);
    });
  });

  describe("4. ITU-R BS.1770-4 Integrated LUFS & True-Peak AudioToon Mastering Engine", () => {
    it("48kHz 표준 K-가중 계수 일치, -70/-10 게이팅 불변성 및 4x 인터샘플 트루피크 검출을 검증한다", () => {
      const filters48k = computeBs1770KWeightingFilters(48000);
      expect(filters48k.highShelf.b0).toBeCloseTo(1.53512485958697, 11);
      expect(filters48k.rlbHighPass.a1).toBeCloseTo(-1.99004745483398, 11);

      // fs/4 코사인 파형(45도 위상): 샘플 피크는 0.7071(-3.01 dBFS)이나 실제 아날로그 트루피크는 ~1.0(0 dBTP)
      const nSamples = 256;
      const interSampleWave = new Float32Array(nSamples);
      for (let n = 0; n < nSamples; n += 1) {
        interSampleWave[n] = Math.cos((Math.PI * 0.5) * n + Math.PI * 0.25);
      }
      const tp = computeTruePeakEnvelope4x([interSampleWave]);
      expect(tp.maxSamplePeakLinear).toBeCloseTo(Math.SQRT1_2, 4);
      expect(tp.maxTruePeakLinear).toBeGreaterThan(0.99);

      // 2초 활성 신호 뒤에 2초 저레벨(-15 LU 이하) 구간을 붙여도 -70 LUFS / -10 LU 게이트가 조용한 블록을 배제함
      // (경계에 걸친 3개의 75%-오버랩 블록 이론치 10*log10(18.5/20) = -0.3386 LU와 정밀 일치, 비게이팅 -3.01 LU 하락 방어)
      const sr = 48000;
      const activeOnly = new Float32Array(sr * 2);
      const withQuietTail = new Float32Array(sr * 4);
      for (let i = 0; i < sr * 4; i += 1) {
        const amp = i < sr * 2 ? 0.2 : 0.02; // 후반 2초는 -20 dB (상대 게이트 -10 LU 미만)
        const s = amp * Math.sin((2 * Math.PI * 997 * i) / sr);
        if (i < sr * 2) activeOnly[i] = s;
        withQuietTail[i] = s;
      }
      const mActive = measureBs1770Loudness([activeOnly, activeOnly], sr);
      const mGated = measureBs1770Loudness([withQuietTail, withQuietTail], sr);
      expect(mActive.ungatedLufs - mGated.ungatedLufs).toBeGreaterThan(2.8);
      expect(Math.abs(mActive.integratedLufs - mGated.integratedLufs)).toBeLessThan(0.4);
      expect(mGated.gatedBlockCount).toBe(20);
      expect(mGated.totalBlockCount).toBe(37);
    });

    it("저음량 에피소드와 과입력 피크 에피소드 모두 -14.0 LUFS 및 -1.0 dBTP 이하로 정밀 마스터링한다", () => {
      const sr = 48000;
      const frames = sr * 2;
      const left = new Float32Array(frames);
      const right = new Float32Array(frames);

      for (let i = 0; i < frames; i += 1) {
        const t = i / sr;
        const body = 0.06 * Math.sin(2 * Math.PI * 440 * t) + 0.04 * Math.sin(2 * Math.PI * 880 * t);
        // 간헐적 트랜지언트 스파이크 추가(리미터 소프트니 동작 유발)
        const spike = i >= 24000 && i < 24120 ? 0.32 * Math.sin(2 * Math.PI * 2200 * t) : 0;
        left[i] = body + spike;
        right[i] = body * 0.95 - spike;
      }

      const mastered = masterAudioToonEpisode([left, right], {
        sampleRateHz: sr,
        targetIntegratedLufs: DEFAULT_TARGET_INTEGRATED_LUFS,
        targetTruePeakDbtp: DEFAULT_TARGET_TRUE_PEAK_DBTP,
      });

      expect(mastered.serverCostKrw).toBe(0);
      expect(mastered.inputMetrics.integratedLufs).toBeLessThan(-20);
      expect(mastered.outputMetrics.integratedLufs).toBeCloseTo(-14.0, 0);
      expect(Math.abs(mastered.outputMetrics.integratedLufs - (-14.0))).toBeLessThan(0.25);
      expect(mastered.outputMetrics.truePeakDbtp).toBeLessThanOrEqual(-1.0 + 1e-3);
      expect(mastered.maxGainReductionDb).toBeGreaterThan(0);
    });
  });

  describe("5. Self-Verifying Archival Cartridge (.tsarc) Packager & Verifier", () => {
    it("순수 SHA-256 구현이 FIPS 180-4 공식 테스트 벡터와 정확히 일치한다", () => {
      const enc = new TextEncoder();
      expect(sha256Hex(new Uint8Array(0))).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(sha256Hex(enc.encode("abc"))).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
      expect(
        sha256Hex(enc.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")),
      ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    });

    it("입력 순서와 무관하게 결정론적 .tsarc 바이너리를 생성하고 머클 포함 증명·무결성 언패킹을 통과한다", () => {
      expect(TSARC_MAGIC_SIGNATURE.length).toBe(8);
      expect(TSARC_MAGIC_BYTES[0]).toBe(0x54); // 'T'
      expect(TSARC_MAGIC_BYTES[4]).toBe(0x43); // 'C'
      expect(TSARC_MAGIC_BYTES[5]).toBe(0x00);
      expect(TSARC_MAGIC_BYTES[6]).toBe(0x01);
      expect(TSARC_MAGIC_BYTES[7]).toBe(0x00);

      const layerBg = {
        layerId: "layer-bg", name: "배경 하늘", zIndex: 0, widthPx: 800, heightPx: 1280,
        blendMode: "normal" as const, opacityMilli: 1000, encoding: "webp" as const,
        payloadBytes: new Uint8Array([10, 20, 30, 40, 50]),
      };
      const layerInk = {
        layerId: "layer-ink", name: "펜선 원화", zIndex: 10, widthPx: 800, heightPx: 1280,
        blendMode: "multiply" as const, opacityMilli: 950, encoding: "png" as const,
        payloadBytes: new Uint8Array([99, 88, 77, 66, 55, 44, 33]),
      };
      const fontKo = {
        fontId: "pretendard", fontFamily: "Pretendard", fontWeight: 700, subsetTag: "ko-ep01",
        unicodeRanges: ["U+AC00-D7A3"], glyphCount: 412, licenseSpdx: "OFL-1.1",
        subsetBytes: new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01]),
      };
      const colorProfile = {
        colorSpace: "oklch-d65" as const,
        whitePointChromaticity: [0.3127, 0.329] as const,
        transferCharacteristic: "perceptual-oklch" as const,
        renderingIntent: "perceptual" as const,
        iccProfileBytes: new Uint8Array([1, 2, 3, 4]),
      };

      const packedA = packTsarcCartridge({
        documentId: "ep-2026-011", episodeTitle: "11화 — 폭풍의 언덕",
        createdUnixEpochSec: 1_900_000_000, colorProfile,
        fontSubsets: [fontKo], layers: [layerInk, layerBg],
      });
      const packedB = packTsarcCartridge({
        documentId: "ep-2026-011", episodeTitle: "11화 — 폭풍의 언덕",
        createdUnixEpochSec: 1_900_000_000, colorProfile,
        fontSubsets: [fontKo], layers: [layerBg, layerInk],
      });

      expect(packedA.merkleRootHex).toBe(packedB.merkleRootHex);
      expect(packedA.cartridgeBytes).toEqual(packedB.cartridgeBytes);
      expect(packedA.totalByteLength).toBeGreaterThan(TSARC_HEADER_SIZE_BYTES);

      // 모든 TOC 항목에 대한 머클 포함 증명 검증
      for (let i = 0; i < packedA.tocEntries.length; i += 1) {
        const proof = buildTsarcInclusionProof(packedA.tocEntries, i);
        expect(verifyTsarcInclusionProof(proof)).toBe(true);
      }

      const verified = verifyAndUnpackTsarcCartridge(packedA.cartridgeBytes);
      expect(verified.valid).toBe(true);
      expect(verified.issues).toHaveLength(0);
      expect(verified.documentId).toBe("ep-2026-011");
      expect(verified.episodeTitle).toBe("11화 — 폭풍의 언덕");
      expect(verified.createdUnixEpochSec).toBe(1_900_000_000);
      expect(verified.colorProfile?.colorSpace).toBe("oklch-d65");
      expect(verified.fontSubsets).toHaveLength(1);
      expect(verified.layers.map((l) => l.layerId)).toEqual(["layer-bg", "layer-ink"]);
      expect(verified.layers[1]!.payloadBytes).toEqual(layerInk.payloadBytes);
    });

    it("단일 비트 부패(페이로드·헤더·매직·절단) 발생 시 오프라인 자가 검증기가 손상 위치를 특정한다", () => {
      const packed = packTsarcCartridge({
        documentId: "ep-rot-check", episodeTitle: "무결성 테스트",
        createdUnixEpochSec: 1_800_000_000,
        colorProfile: {
          colorSpace: "srgb-iec61966", whitePointChromaticity: [0.3127, 0.329],
          transferCharacteristic: "srgb", renderingIntent: "relative-colorimetric",
        },
        fontSubsets: [],
        layers: [{
          layerId: "hero-cut", name: "주인공 클로즈업", zIndex: 1, widthPx: 64, heightPx: 64,
          blendMode: "normal", opacityMilli: 1000, encoding: "raw-rgba8",
          payloadBytes: new Uint8Array([12, 34, 56, 78, 90, 123, 200, 255]),
        }],
      });

      // 1) 레이어 페이로드 1비트 반전 (Bit-rot)
      const layerEntry = packed.tocEntries.find((e) => e.kind === "layer-payload")!;
      const bitRotted = new Uint8Array(packed.cartridgeBytes);
      bitRotted[layerEntry.payloadOffset + 2] = bitRotted[layerEntry.payloadOffset + 2]! ^ 0x01;
      const rotRes = verifyAndUnpackTsarcCartridge(bitRotted);
      expect(rotRes.valid).toBe(false);
      expect(rotRes.issues.some((i) => i.code === "entry-payload-corrupted" && i.entryId === "layer:hero-cut")).toBe(true);
      expect(rotRes.issues.some((i) => i.code === "merkle-root-mismatch")).toBe(true);

      // 2) 헤더 타임스탬프 변조 -> 헤더 체크섬 불일치
      const headerTampered = new Uint8Array(packed.cartridgeBytes);
      headerTampered[16] = headerTampered[16]! ^ 0xff;
      const headerRes = verifyAndUnpackTsarcCartridge(headerTampered);
      expect(headerRes.valid).toBe(false);
      expect(headerRes.issues.some((i) => i.code === "header-checksum-mismatch")).toBe(true);

      // 3) 잘못된 매직 및 절단된 컨테이너 검출
      const badMagic = new Uint8Array(packed.cartridgeBytes);
      badMagic[0] = 0x00;
      expect(verifyAndUnpackTsarcCartridge(badMagic).issues.some((i) => i.code === "invalid-magic")).toBe(true);
      expect(verifyAndUnpackTsarcCartridge(packed.cartridgeBytes.subarray(0, 32)).issues[0]?.code).toBe("truncated-container");
    });
  });
});
