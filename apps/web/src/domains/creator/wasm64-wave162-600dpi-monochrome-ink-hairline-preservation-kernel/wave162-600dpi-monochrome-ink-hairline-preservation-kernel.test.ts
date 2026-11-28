import { describe, expect, it } from 'vitest';
import {
  OFFSET_PRINT_MIN_STROKE_MM,
  PRINT_MONOCHROME_PROFILES,
  analyzeBinaryInkComponents,
  auditBinaryInkQuality,
  binarizeGlobalThreshold,
  binarizeWithHairlinePreservation,
  bridgeCollinearHairlineGaps,
  buildMonochromeInkPreviewWgsl,
  compareInkBinarizationResults,
  computeDirectionalDarkRidgeMap,
  computeInkManifestFingerprint,
  computeOtsuThreshold,
  createSampleHairlineInkScenario,
  escapeSvgXml,
  estimateLocalStrokeWidthPx,
  pixelsToMillimeters,
  removeIsolatedInkSpeckles,
  renderMonochromeInkAuditSvg,
  resolvePrintMonochromeProfile,
  run600DpiInkHairlinePreservation,
  sha256InkHex,
  summarizeMonochromeInkAuditKo,
  validateMonochromeInkPreviewWgsl,
  type BinaryInkBuffer,
  type GrayscaleInkBuffer,
} from './index';

function makeBlankGray(width: number, height: number, dpi = 600, fill = 255): GrayscaleInkBuffer {
  const pixels = new Uint8Array(width * height);
  pixels.fill(fill);
  return { width, height, dpi, pixels };
}

function makeBlankBinary(width: number, height: number, dpi = 600): BinaryInkBuffer {
  return { width, height, dpi, bits: new Uint8Array(width * height) };
}

function setGray(buf: GrayscaleInkBuffer, x: number, y: number, v: number): void {
  if (x >= 0 && y >= 0 && x < buf.width && y < buf.height) buf.pixels[y * buf.width + x] = v;
}

function setBit(buf: BinaryInkBuffer, x: number, y: number, v: 0 | 1 = 1): void {
  if (x >= 0 && y >= 0 && x < buf.width && y < buf.height) buf.bits[y * buf.width + x] = v;
}

describe('Wave 162: 600DPI 1비트 흑백 펜선 이진화 & 머리카락 끊김 방지 커널', () => {
  describe('1. 기준선 전역 임계값(Fixed / Otsu) 및 입력 유효성 검증', () => {
    it('고정 임계값 128은 진한 먹선만 1로 변환하고 순수 0/1 이진 출력을 보장한다', () => {
      const gray = makeBlankGray(16, 16);
      for (let x = 2; x < 14; x += 1) {
        setGray(gray, x, 5, 20);
        setGray(gray, x, 10, 170);
      }
      const res = binarizeGlobalThreshold(gray, { mode: 'fixed', threshold: 128 });
      expect(res.thresholdUsed).toBe(128);
      expect(res.inkPixelCount).toBe(12);
      expect(res.binary.width).toBe(16);
      expect(res.binary.height).toBe(16);
      for (let i = 0; i < res.binary.bits.length; i += 1) {
        expect(res.binary.bits[i] === 0 || res.binary.bits[i] === 1).toBe(true);
      }
    });

    it('Otsu 자동 임계값은 이봉 먹선·원고지 히스토그램의 최적 분계점을 찾는다', () => {
      const gray = makeBlankGray(20, 20, 600, 245);
      for (let y = 4; y < 16; y += 1) {
        for (let x = 4; x < 10; x += 1) setGray(gray, x, y, 30);
      }
      const t = computeOtsuThreshold(gray);
      expect(t).toBeGreaterThanOrEqual(30);
      expect(t).toBeLessThan(245);
      const res = binarizeGlobalThreshold(gray, { mode: 'otsu' });
      expect(res.mode).toBe('otsu');
      expect(res.inkPixelCount).toBe(72);
    });

    it('완전 백지 원고에서는 Otsu 폴백 128과 0px 잉크를 반환한다', () => {
      const blank = makeBlankGray(12, 12, 600, 255);
      expect(computeOtsuThreshold(blank)).toBe(128);
      expect(binarizeGlobalThreshold(blank, { mode: 'otsu' }).inkPixelCount).toBe(0);
    });

    it('잘못된 해상도·길이·DPI 입력은 명시적 RangeError를 던진다', () => {
      expect(() => binarizeGlobalThreshold({ width: 0, height: 8, dpi: 600, pixels: new Uint8Array(0) })).toThrow(RangeError);
      expect(() => binarizeGlobalThreshold({ width: 8, height: 8, dpi: 0, pixels: new Uint8Array(64) })).toThrow(RangeError);
      expect(() => binarizeGlobalThreshold({ width: 8, height: 8, dpi: 600, pixels: new Uint8Array(10) })).toThrow(RangeError);
    });

    it('인쇄 프로파일 해석기는 명시 프로파일과 DPI 기반 폴백을 정확히 매핑한다', () => {
      expect(resolvePrintMonochromeProfile('600dpi-tankobon-offset').dpi).toBe(600);
      expect(resolvePrintMonochromeProfile('1200dpi-magazine-litho').minRecommendedStrokePx).toBe(3);
      expect(resolvePrintMonochromeProfile('300dpi-pod-digital').dpi).toBe(300);
      expect(resolvePrintMonochromeProfile(undefined, 1200).id).toBe('1200dpi-magazine-litho');
      expect(resolvePrintMonochromeProfile(undefined, 300).id).toBe('300dpi-pod-digital');
      expect(PRINT_MONOCHROME_PROFILES['600dpi-tankobon-offset'].minSafeStrokeWidthMm).toBe(OFFSET_PRINT_MIN_STROKE_MM);
    });
  });

  describe('2. 4방향 어두운 능선 검출기(0°/45°/90°/135°)', () => {
    it('수평(0°)·수직(90°)·대각(45°/135°) 연한 머리카락 선의 방향과 능선 강도를 정확히 검출한다', () => {
      const gray = makeBlankGray(32, 32);
      for (let i = 4; i <= 14; i += 1) setGray(gray, i, 4, 175);
      for (let i = 4; i <= 14; i += 1) setGray(gray, 26, i, 175);
      for (let i = 0; i <= 10; i += 1) setGray(gray, 4 + i, 16 + i, 175);
      for (let i = 0; i <= 10; i += 1) setGray(gray, 18 + i, 28 - i, 175);

      const map = computeDirectionalDarkRidgeMap(gray);
      expect(map.activeRidgePixels).toBeGreaterThanOrEqual(40);
      expect(map.orientations[4 * 32 + 9]).toBe(0);
      expect(map.orientations[9 * 32 + 26]).toBe(2);
      expect(map.orientations[21 * 32 + 9]).toBe(1);
      expect(map.orientations[23 * 32 + 23]).toBe(3);
    });

    it('고립된 1px 검은 먼지는 접선 지지도가 없어 능선 응답이 0이다', () => {
      const gray = makeBlankGray(16, 16);
      setGray(gray, 8, 8, 10);
      const map = computeDirectionalDarkRidgeMap(gray);
      expect(map.responses[8 * 16 + 8]).toBe(0);
      expect(map.activeRidgePixels).toBe(0);
    });

    it('연한 배경 미세 잡음(밝기 242~255)에서는 능선 오탐을 일으키지 않는다', () => {
      const gray = makeBlankGray(20, 20, 600, 250);
      for (let x = 2; x < 18; x += 1) setGray(gray, x, 10, 242);
      expect(computeDirectionalDarkRidgeMap(gray).activeRidgePixels).toBe(0);
    });

    it('안티앨리어싱 외곽 번짐(225)은 중심선(165) 옆에서 국소 최소값 탈락으로 억제된다', () => {
      const gray = makeBlankGray(24, 16);
      for (let x = 3; x <= 20; x += 1) {
        setGray(gray, x, 7, 225);
        setGray(gray, x, 8, 165);
        setGray(gray, x, 9, 225);
      }
      const map = computeDirectionalDarkRidgeMap(gray);
      expect(map.responses[8 * 24 + 12]).toBeGreaterThan(0.5);
      expect(map.responses[7 * 24 + 12]).toBe(0);
      expect(map.responses[9 * 24 + 12]).toBe(0);
    });
  });

  describe('3. 머리카락 선 끊김 복구(Hairline Dropout Recovery)', () => {
    it('연한 대각선 머리카락(피크 170)에서 전역 128은 전량 소실되지만 보존 커널은 단일 8연결 선으로 복구한다', () => {
      const gray = makeBlankGray(36, 36);
      for (let i = 4; i <= 30; i += 1) {
        setGray(gray, i, i, 170);
        setGray(gray, i + 1, i, 226);
        setGray(gray, i, i + 1, 226);
      }
      const baseline = binarizeGlobalThreshold(gray, { mode: 'fixed', threshold: 128 });
      const preserved = binarizeWithHairlinePreservation(gray);
      const cmp = compareInkBinarizationResults(baseline.binary, preserved.binary, {
        sourceGrayscale: gray,
        ridgeMap: preserved.ridgeMap,
      });

      expect(baseline.inkPixelCount).toBe(0);
      expect(preserved.inkPixelCount).toBeGreaterThanOrEqual(25);
      expect(cmp.preservedConnectedComponents).toBe(1);
      expect(cmp.dropoutRecovered).toBe(true);
      expect(cmp.preservedDropoutCount).toBe(0);
    });

    it('연한 곡선 머리카락(피크 160~185)을 끊김 없는 1개 연결 성분으로 보존한다', () => {
      const gray = makeBlankGray(48, 32);
      for (let x = 5; x <= 42; x += 1) {
        const yf = 12 + 6 * Math.sin(((x - 5) / 37) * Math.PI);
        const y0 = Math.floor(yf);
        const frac = yf - y0;
        setGray(gray, x, frac <= 0.5 ? y0 : y0 + 1, 168);
        setGray(gray, x, frac <= 0.5 ? y0 + 1 : y0, 224);
      }
      const baseline = binarizeGlobalThreshold(gray, { threshold: 128 });
      const preserved = binarizeWithHairlinePreservation(gray);
      const cmp = compareInkBinarizationResults(baseline.binary, preserved.binary, {
        sourceGrayscale: gray,
        ridgeMap: preserved.ridgeMap,
      });
      expect(cmp.baselineInkPixels).toBe(0);
      expect(cmp.preservedConnectedComponents).toBe(1);
      expect(cmp.dropoutRecovered).toBe(true);
    });

    it('초미세 205 밝기 머리카락 선도 능선 부스트로 놓치지 않고 복구한다', () => {
      const gray = makeBlankGray(32, 16);
      for (let x = 4; x <= 27; x += 1) setGray(gray, x, 8, 205);
      const baseline = binarizeGlobalThreshold(gray, { threshold: 128 });
      const preserved = binarizeWithHairlinePreservation(gray);
      expect(baseline.inkPixelCount).toBe(0);
      expect(preserved.inkPixelCount).toBeGreaterThanOrEqual(22);
      expect(analyzeBinaryInkComponents(preserved.binary).componentCount).toBe(1);
    });

    it('중간 밝기가 출렁여 기준선에서 3조각으로 갈라진 세선을 1개 선분으로 봉합한다', () => {
      const gray = makeBlankGray(36, 16);
      for (let x = 4; x <= 31; x += 1) {
        setGray(gray, x, 8, x === 12 || x === 22 || x === 23 ? 178 : 110);
      }
      const baseline = binarizeGlobalThreshold(gray, { threshold: 128 });
      const preserved = binarizeWithHairlinePreservation(gray);
      const cmp = compareInkBinarizationResults(baseline.binary, preserved.binary, {
        sourceGrayscale: gray,
        ridgeMap: preserved.ridgeMap,
      });
      expect(cmp.baselineConnectedComponents).toBe(3);
      expect(cmp.preservedConnectedComponents).toBe(1);
      expect(cmp.fragmentationReduction).toBe(2);
      expect(cmp.dropoutRecovered).toBe(true);
    });

    it('접선 정렬 끊김 보간기는 수평·대각 1px 및 2px 간극을 정확히 연결한다', () => {
      const bin = makeBlankBinary(32, 32);
      for (let x = 3; x <= 24; x += 1) {
        if (x !== 10 && x !== 17 && x !== 18) setBit(bin, x, 5, 1);
      }
      for (let i = 0; i <= 12; i += 1) {
        if (i !== 6) setBit(bin, 4 + i, 12 + i, 1);
      }
      expect(analyzeBinaryInkComponents(bin).componentCount).toBe(5);
      const bridged = bridgeCollinearHairlineGaps(bin, { maxGapPx: 2 });
      expect(bridged.bridgedGapCount).toBe(3);
      expect(bridged.bridgedPixelCount).toBe(4);
      expect(analyzeBinaryInkComponents(bridged.binary).componentCount).toBe(2);
    });

    it('3px 이상의 의도적 여백은 maxGapPx=2에서 과도하게 메우지 않는다', () => {
      const bin = makeBlankBinary(24, 12);
      for (let x = 2; x <= 8; x += 1) setBit(bin, x, 6, 1);
      for (let x = 12; x <= 18; x += 1) setBit(bin, x, 6, 1);
      const bridged = bridgeCollinearHairlineGaps(bin, { maxGapPx: 2 });
      expect(bridged.bridgedGapCount).toBe(0);
      expect(analyzeBinaryInkComponents(bridged.binary).componentCount).toBe(2);
    });
  });

  describe('4. 인접 평행선 비유착 가드(Parallel Strand Non-Fusion Guard)', () => {
    it('2px 백색 간격의 수평 평행 머리카락 2가닥은 보존 변환 후에도 2개 독립 성분으로 유지된다', () => {
      const gray = makeBlankGray(40, 20);
      for (let x = 4; x <= 35; x += 1) {
        setGray(gray, x, 7, 165);
        setGray(gray, x, 10, 165);
      }
      const preserved = binarizeWithHairlinePreservation(gray);
      const comps = analyzeBinaryInkComponents(preserved.binary);
      const audit = auditBinaryInkQuality(preserved.binary, { sourceGrayscale: gray });
      expect(comps.componentCount).toBe(2);
      expect(audit.fusedParallelStrandCount).toBe(0);
      for (let x = 4; x <= 35; x += 1) {
        expect(preserved.binary.bits[8 * 40 + x]).toBe(0);
        expect(preserved.binary.bits[9 * 40 + x]).toBe(0);
      }
    });

    it('3px 백색 간격의 수직 평행 머리카락 2가닥도 양 끝점까지 유착 없이 2개로 유지된다', () => {
      const gray = makeBlankGray(24, 36);
      for (let y = 4; y <= 31; y += 1) {
        setGray(gray, 9, y, 168);
        setGray(gray, 13, y, 168);
      }
      const preserved = binarizeWithHairlinePreservation(gray);
      expect(analyzeBinaryInkComponents(preserved.binary).componentCount).toBe(2);
      for (let y = 4; y <= 31; y += 1) {
        expect(preserved.binary.bits[y * 24 + 10]).toBe(0);
        expect(preserved.binary.bits[y * 24 + 11]).toBe(0);
        expect(preserved.binary.bits[y * 24 + 12]).toBe(0);
      }
    });

    it('대각(45°) 평행 머리카락 2가닥 역시 유착 없이 2개 성분으로 보존된다', () => {
      const gray = makeBlankGray(36, 36);
      for (let i = 4; i <= 24; i += 1) {
        setGray(gray, i, i, 166);
        setGray(gray, i, i + 4, 166);
      }
      const preserved = binarizeWithHairlinePreservation(gray);
      const audit = auditBinaryInkQuality(preserved.binary, { sourceGrayscale: gray });
      expect(analyzeBinaryInkComponents(preserved.binary).componentCount).toBe(2);
      expect(audit.fusedParallelStrandCount).toBe(0);
    });

    it('bridgeCollinearHairlineGaps는 1~2px 간격 평행선 사이의 수직 교차 브리지를 명시적으로 거부한다', () => {
      const bin = makeBlankBinary(28, 16);
      for (let x = 4; x <= 23; x += 1) {
        setBit(bin, x, 6, 1);
        setBit(bin, x, 8, 1);
      }
      const bridged = bridgeCollinearHairlineGaps(bin, { maxGapPx: 2 });
      expect(bridged.bridgedPixelCount).toBe(0);
      expect(bridged.rejectedParallelBridgeCount).toBeGreaterThan(0);
      expect(analyzeBinaryInkComponents(bridged.binary).componentCount).toBe(2);
    });

    it('한쪽 평행선에 1px 끊김이 있어도 이웃 평행선과 합쳐지지 않고 자기 선분만 복구한다', () => {
      const bin = makeBlankBinary(30, 18);
      for (let x = 4; x <= 25; x += 1) {
        if (x !== 14) setBit(bin, x, 6, 1);
        setBit(bin, x, 9, 1);
      }
      const bridged = bridgeCollinearHairlineGaps(bin, { maxGapPx: 2 });
      expect(bridged.bridgedPixelCount).toBe(1);
      expect(bridged.binary.bits[6 * 30 + 14]).toBe(1);
      expect(bridged.binary.bits[7 * 30 + 14]).toBe(0);
      expect(bridged.binary.bits[8 * 30 + 14]).toBe(0);
      expect(analyzeBinaryInkComponents(bridged.binary).componentCount).toBe(2);
    });

    it('감사기는 평행선 사이 백색 골짜기가 잉크로 오염된 유착 결함을 FAIL로 검출한다', () => {
      const gray = makeBlankGray(28, 16);
      const fused = makeBlankBinary(28, 16);
      for (let x = 4; x <= 23; x += 1) {
        setGray(gray, x, 6, 150);
        setGray(gray, x, 9, 150);
        setBit(fused, x, 6, 1);
        setBit(fused, x, 9, 1);
      }
      setBit(fused, 14, 7, 1);
      setBit(fused, 14, 8, 1);
      const audit = auditBinaryInkQuality(fused, { sourceGrayscale: gray });
      expect(audit.fusedParallelStrandCount).toBeGreaterThanOrEqual(1);
      expect(audit.status).toBe('FAIL');
    });
  });

  describe('5. 고립 먼지 노이즈 제거(Isolated Speckle Cleanup)', () => {
    it('1px 단독 먼지는 모두 제거하면서 얇은 1px 세선(길이 10px)은 그대로 유지한다', () => {
      const bin = makeBlankBinary(24, 24);
      for (let x = 4; x <= 13; x += 1) setBit(bin, x, 12, 1);
      setBit(bin, 2, 2, 1);
      setBit(bin, 20, 3, 1);
      setBit(bin, 19, 20, 1);

      const cleaned = removeIsolatedInkSpeckles(bin, { maxSpeckleAreaPx: 1 });
      expect(cleaned.removedSpeckleCount).toBe(3);
      expect(cleaned.removedPixelCount).toBe(3);
      expect(analyzeBinaryInkComponents(cleaned.binary).componentCount).toBe(1);
      expect(analyzeBinaryInkComponents(cleaned.binary).totalInkPixels).toBe(10);
    });

    it('전체 이진화 파이프라인에서도 고립 검은 먼지는 사라지고 진한 외곽선·세선만 남는다', () => {
      const gray = makeBlankGray(32, 24);
      for (let x = 4; x <= 27; x += 1) setGray(gray, x, 10, 172);
      setGray(gray, 3, 3, 5);
      setGray(gray, 28, 20, 12);
      const preserved = binarizeWithHairlinePreservation(gray);
      expect(preserved.removedSpeckleCount).toBe(2);
      expect(analyzeBinaryInkComponents(preserved.binary).componentCount).toBe(1);
    });

    it('maxSpeckleAreaPx=0이면 고립 픽셀을 제거하지 않고 원본을 보존한다', () => {
      const bin = makeBlankBinary(10, 10);
      setBit(bin, 5, 5, 1);
      const cleaned = removeIsolatedInkSpeckles(bin, { maxSpeckleAreaPx: 0 });
      expect(cleaned.removedSpeckleCount).toBe(0);
      expect(cleaned.binary.bits[5 * 10 + 5]).toBe(1);
    });
  });

  describe('6. 600DPI / 1200DPI 물리 선폭 감사(mm) 및 순수 이진 보장', () => {
    it('pixelsToMillimeters가 600DPI 및 1200DPI 물리 선폭을 정확히 환산한다', () => {
      expect(pixelsToMillimeters(1, 600)).toBeCloseTo(25.4 / 600, 6);
      expect(pixelsToMillimeters(2, 600)).toBeCloseTo(50.8 / 600, 6);
      expect(pixelsToMillimeters(3, 1200)).toBeCloseTo(76.2 / 1200, 6);
      expect(pixelsToMillimeters(0, 600)).toBe(0);
    });

    it('600DPI에서 2px 먹선(0.085mm)은 옵셋 하한(0.05mm) 이상으로 PASS 판정을 받는다', () => {
      const bin = makeBlankBinary(24, 16, 600);
      for (let x = 3; x <= 20; x += 1) {
        setBit(bin, x, 7, 1);
        setBit(bin, x, 8, 1);
      }
      const audit = auditBinaryInkQuality(bin, { profileId: '600dpi-tankobon-offset' });
      expect(audit.minStrokeWidthPx).toBe(2);
      expect(audit.minStrokeWidthMm).toBeCloseTo((2 * 25.4) / 600, 5);
      expect(audit.minPhysicalWidthMm).toBe(audit.minStrokeWidthMm);
      expect(audit.belowPrintMinimum).toBe(false);
      expect(audit.status).toBe('PASS');
    });

    it('600DPI에서 1px 극세선(0.042mm)은 옵셋 하한(0.05mm) 미만 경고를 발생시킨다', () => {
      const bin = makeBlankBinary(24, 16, 600);
      for (let x = 3; x <= 20; x += 1) setBit(bin, x, 8, 1);
      const audit = auditBinaryInkQuality(bin, { profileId: '600dpi-tankobon-offset' });
      expect(audit.minStrokeWidthPx).toBe(1);
      expect(audit.minStrokeWidthMm).toBeCloseTo(25.4 / 600, 5);
      expect(audit.belowPrintMinimum).toBe(true);
      expect(audit.status).toBe('WARN');
    });

    it('1200DPI에서는 2px 선(0.042mm)이 경고, 3px 선(0.064mm)이 안전 통과로 구분된다', () => {
      const thin2 = makeBlankBinary(24, 16, 1200);
      const safe3 = makeBlankBinary(24, 16, 1200);
      for (let x = 3; x <= 20; x += 1) {
        setBit(thin2, x, 7, 1);
        setBit(thin2, x, 8, 1);
        setBit(safe3, x, 6, 1);
        setBit(safe3, x, 7, 1);
        setBit(safe3, x, 8, 1);
      }
      const audit2 = auditBinaryInkQuality(thin2, { profileId: '1200dpi-magazine-litho' });
      const audit3 = auditBinaryInkQuality(safe3, { profileId: '1200dpi-magazine-litho' });
      expect(audit2.belowPrintMinimum).toBe(true);
      expect(audit2.minStrokeWidthMm).toBeCloseTo((2 * 25.4) / 1200, 5);
      expect(audit3.belowPrintMinimum).toBe(false);
      expect(audit3.minStrokeWidthMm).toBeCloseTo((3 * 25.4) / 1200, 5);
      expect(audit3.status).toBe('PASS');
    });

    it('국소 선폭 추정기가 1px 대각선과 3px 수직선의 폭을 정확히 계산한다', () => {
      const bin = makeBlankBinary(24, 24, 600);
      for (let i = 2; i <= 12; i += 1) setBit(bin, i, i, 1);
      for (let y = 2; y <= 18; y += 1) {
        setBit(bin, 18, y, 1);
        setBit(bin, 19, y, 1);
        setBit(bin, 20, y, 1);
      }
      expect(estimateLocalStrokeWidthPx(bin.bits, 24, 24, 7, 7)).toBe(1);
      expect(estimateLocalStrokeWidthPx(bin.bits, 24, 24, 19, 10)).toBe(3);
      expect(estimateLocalStrokeWidthPx(bin.bits, 24, 24, 0, 0)).toBe(0);
    });

    it('보존 이진화 출력 버퍼는 입력 해상도와 동일하며 모든 바이트가 엄격히 0 또는 1이다', () => {
      const scenario = createSampleHairlineInkScenario({ width: 52, height: 42, dpi: 600 });
      const res = binarizeWithHairlinePreservation(scenario.grayscale);
      expect(res.binary.width).toBe(52);
      expect(res.binary.height).toBe(42);
      expect(res.binary.dpi).toBe(600);
      expect(res.binary.bits.length).toBe(52 * 42);
      for (let i = 0; i < res.binary.bits.length; i += 1) {
        expect(res.binary.bits[i] === 0 || res.binary.bits[i] === 1).toBe(true);
      }
    });
  });

  describe('7. WebGPU 64바이트 유니폼 WGSL 셰이더 및 정적 계약 검증기', () => {
    it('기본 생성된 64B 유니폼 WGSL 번들은 정적 계약 검증을 통과한다', () => {
      const bundle = buildMonochromeInkPreviewWgsl({ width: 64, height: 48, dpi: 600 });
      const validation = validateMonochromeInkPreviewWgsl(bundle);
      expect(bundle.uniformByteSize).toBe(64);
      expect(bundle.uniformBuffer.byteLength).toBe(64);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
      expect(validation.bindingCount).toBe(5);
    });

    it('닫히지 않은 중괄호가 있으면 검증에 실패한다', () => {
      const bundle = buildMonochromeInkPreviewWgsl({ width: 64, height: 48, dpi: 600 });
      const bad = validateMonochromeInkPreviewWgsl({ ...bundle, wgsl: `${bundle.wgsl}\nfn broken() {` });
      expect(bad.valid).toBe(false);
      expect(bad.errors.some((e) => e.includes('괄호'))).toBe(true);
    });

    it('중복된 @group/@binding 선언을 거부한다', () => {
      const bundle = buildMonochromeInkPreviewWgsl({ width: 64, height: 48, dpi: 600 });
      const bad = validateMonochromeInkPreviewWgsl({
        ...bundle,
        wgsl: bundle.wgsl.replace('@binding(2)', '@binding(1)'),
      });
      expect(bad.valid).toBe(false);
      expect(bad.errors.some((e) => e.includes('중복'))).toBe(true);
    });

    it('16바이트 정렬이 깨진 유니폼 버퍼 크기를 거부한다', () => {
      const bundle = buildMonochromeInkPreviewWgsl({ width: 64, height: 48, dpi: 600 });
      const bad = validateMonochromeInkPreviewWgsl({
        ...bundle,
        uniformByteSize: 52,
        uniformBuffer: new Float32Array(13),
      });
      expect(bad.valid).toBe(false);
      expect(bad.errors.some((e) => e.includes('16바이트'))).toBe(true);
    });

    it('GLSL 금지 토큰(vec4 비제네릭, texture2D, gl_FragCoord)을 모두 거부한다', () => {
      const bundle = buildMonochromeInkPreviewWgsl({ width: 64, height: 48, dpi: 600 });
      expect(
        validateMonochromeInkPreviewWgsl({ ...bundle, wgsl: bundle.wgsl.replace('vec4<f32>(0.12', 'vec4(0.12') }).valid,
      ).toBe(false);
      expect(
        validateMonochromeInkPreviewWgsl({
          ...bundle,
          wgsl: `${bundle.wgsl}\nfn g() -> f32 { let t = texture2D(a, b); return t; }`,
        }).valid,
      ).toBe(false);
      expect(
        validateMonochromeInkPreviewWgsl({ ...bundle, wgsl: `${bundle.wgsl}\nfn h() -> f32 { return gl_FragCoord.x; }` }).valid,
      ).toBe(false);
    });

    it('유니폼 배열에 NaN 또는 Infinity가 들어가면 검증에 실패한다', () => {
      const bundle = buildMonochromeInkPreviewWgsl({ width: 64, height: 48, dpi: 600 });
      const nanBuf = new Float32Array(bundle.uniformBuffer);
      nanBuf[4] = Number.NaN;
      const infBuf = new Float32Array(bundle.uniformBuffer);
      infBuf[11] = Number.POSITIVE_INFINITY;
      expect(validateMonochromeInkPreviewWgsl({ ...bundle, uniformBuffer: nanBuf }).valid).toBe(false);
      expect(validateMonochromeInkPreviewWgsl({ ...bundle, uniformBuffer: infBuf }).valid).toBe(false);
    });
  });

  describe('8. FIPS 180-4 SHA-256 표준 벡터 및 판하 지문 결정론', () => {
    it('NIST 표준 SHA-256 테스트 벡터("", "abc", 56바이트 경계)와 정확히 일치한다', () => {
      expect(sha256InkHex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      expect(sha256InkHex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      expect(sha256InkHex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
      );
    });

    it('한글 UTF-8 문자열과 Uint8Array 직접 입력을 결정론적으로 해시한다', () => {
      const koA = sha256InkHex('단행본 600DPI 펜선');
      expect(koA).toBe(sha256InkHex('단행본 600DPI 펜선'));
      expect(koA).toMatch(/^[0-9a-f]{64}$/);
      expect(sha256InkHex(new Uint8Array([0x61, 0x62, 0x63]))).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });

    it('1비트 판하에서 임의의 1픽셀만 뒤집어도 SHA-256 지문이 완전히 달라진다', () => {
      const binA = makeBlankBinary(16, 16, 600);
      setBit(binA, 4, 4, 1);
      const binB = makeBlankBinary(16, 16, 600);
      binB.bits.set(binA.bits);
      setBit(binB, 9, 11, 1);

      const fpA1 = computeInkManifestFingerprint(binA, '600dpi-tankobon-offset');
      const fpA2 = computeInkManifestFingerprint(binA, '600dpi-tankobon-offset');
      const fpB = computeInkManifestFingerprint(binB, '600dpi-tankobon-offset');
      expect(fpA1).toBe(fpA2);
      expect(fpA1).not.toBe(fpB);
    });
  });

  describe('9. 순수 OKLCH SVG 리포트, XML 이스케이프 및 자연스러운 한글 QA 브리프', () => {
    it('SVG는 oklch()만 사용하고 raw hex/rgb/hsl 및 NaN/Infinity가 전혀 없다', () => {
      const result = run600DpiInkHairlinePreservation(
        createSampleHairlineInkScenario({ title: '테스트 <원고> & "펜선" \'검수\'' }),
      );
      expect(result.auditSvg).toContain('<svg');
      expect(result.auditSvg).toContain('oklch(');
      expect(result.auditSvg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(result.auditSvg).not.toMatch(/\brgba?\s*\(/i);
      expect(result.auditSvg).not.toMatch(/\bhsla?\s*\(/i);
      expect(result.auditSvg).not.toContain('NaN');
      expect(result.auditSvg).not.toContain('Infinity');
      expect(result.auditSvg).toContain('&lt;원고&gt; &amp; &quot;펜선&quot; &#39;검수&#39;');
    });

    it('escapeSvgXml이 5개 XML 특수문자를 모두 안전하게 치환한다', () => {
      expect(escapeSvgXml(`<tag attr="a&b">'c'</tag>`)).toBe(
        '&lt;tag attr=&quot;a&amp;b&quot;&gt;&#39;c&#39;&lt;/tag&gt;',
      );
    });

    it('한글 QA 요약은 PASS/WARN/FAIL 상태를 명확히 표시하고 번역투를 쓰지 않는다', () => {
      const profile = resolvePrintMonochromeProfile('600dpi-tankobon-offset');
      const passBin = makeBlankBinary(24, 16, 600);
      for (let x = 3; x <= 20; x += 1) {
        setBit(passBin, x, 7, 1);
        setBit(passBin, x, 8, 1);
      }
      const passCmp = compareInkBinarizationResults(passBin, passBin, { profileId: profile.id });
      const passSummary = summarizeMonochromeInkAuditKo(profile, passCmp, 'a'.repeat(64));
      const warnResult = run600DpiInkHairlinePreservation(createSampleHairlineInkScenario());

      const failGray = makeBlankGray(24, 16, 600);
      const failBin = makeBlankBinary(24, 16, 600);
      for (let x = 3; x <= 20; x += 1) {
        setGray(failGray, x, 6, 150);
        setGray(failGray, x, 9, 150);
        setBit(failBin, x, 6, 1);
        setBit(failBin, x, 9, 1);
      }
      setBit(failBin, 10, 7, 1);
      setBit(failBin, 10, 8, 1);
      const failCmp = compareInkBinarizationResults(failBin, failBin, {
        profileId: profile.id,
        sourceGrayscale: failGray,
      });
      const failSummary = summarizeMonochromeInkAuditKo(profile, failCmp, 'b'.repeat(64));

      expect(passSummary).toContain('[PASS]');
      expect(warnResult.summaryKo).toContain('[WARN]');
      expect(failSummary).toContain('[FAIL]');
      expect(warnResult.summaryKo).not.toContain('가능하게 합니다');
      expect(warnResult.summaryKo).not.toContain('직관적인 경험을 제공');

      const manualSvg = renderMonochromeInkAuditSvg({
        title: '직접 호출 검수',
        profile,
        baseline: passBin,
        preserved: passBin,
        comparison: passCmp,
        binaryFingerprintSha256: 'a'.repeat(64),
      });
      expect(manualSvg).toContain('PASS · 제판 적합');
    });
  });

  describe('10. 전체 파이프라인 오케스트레이터(run600DpiInkHairlinePreservation)', () => {
    it('기본 합성 600DPI 원고 시나리오에서 기준선 대비 정량적 연속성 개선·비유착·먼지 제거를 달성한다', () => {
      const out = run600DpiInkHairlinePreservation(createSampleHairlineInkScenario());
      expect(out.profile.id).toBe('600dpi-tankobon-offset');
      expect(out.wgslValidation.valid).toBe(true);
      expect(out.comparison.dropoutRecovered).toBe(true);
      expect(out.comparison.parallelStrandsPreserved).toBe(true);
      expect(out.comparison.preservedDropoutCount).toBe(0);
      expect(out.comparison.baselineDropoutCount).toBeGreaterThanOrEqual(2);
      expect(out.comparison.recoveredInkPixels).toBeGreaterThan(40);
      expect(out.comparison.specklesRemoved).toBe(3);
      expect(out.comparison.preservedAudit.speckleCount).toBe(0);
      expect(out.comparison.preservedAudit.nonSpeckleComponents).toBe(4);
      expect(out.comparison.continuityScoreAfter).toBeGreaterThan(out.comparison.continuityScoreBefore);
      expect(out.sourceFingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(out.binaryFingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(out.sourceFingerprintSha256).not.toBe(out.binaryFingerprintSha256);
    });

    it('동일 입력으로 두 번 실행하면 비트·지문·SVG·요약이 100% 결정론적으로 일치한다', () => {
      const scenario = createSampleHairlineInkScenario();
      const run1 = run600DpiInkHairlinePreservation(scenario);
      const run2 = run600DpiInkHairlinePreservation(scenario);
      expect(run1.binaryFingerprintSha256).toBe(run2.binaryFingerprintSha256);
      expect(run1.auditSvg).toBe(run2.auditSvg);
      expect(run1.summaryKo).toBe(run2.summaryKo);
      expect(Array.from(run1.preserved.binary.bits)).toEqual(Array.from(run2.preserved.binary.bits));
    });

    it('1200DPI 잡지 제판 프로파일과 300DPI POD 프로파일에서도 안정적으로 완주한다', () => {
      const litho = run600DpiInkHairlinePreservation(
        createSampleHairlineInkScenario({ profileId: '1200dpi-magazine-litho', dpi: 1200 }),
      );
      const pod = run600DpiInkHairlinePreservation(
        createSampleHairlineInkScenario({ profileId: '300dpi-pod-digital', dpi: 300 }),
      );
      expect(litho.profile.dpi).toBe(1200);
      expect(litho.wgslValidation.valid).toBe(true);
      expect(litho.comparison.dropoutRecovered).toBe(true);
      expect(pod.profile.dpi).toBe(300);
      expect(pod.wgslValidation.valid).toBe(true);
      expect(pod.comparison.preservedAudit.belowPrintMinimum).toBe(false);
      expect(pod.comparison.preservedAudit.status).toBe('PASS');
    });

    it('굵은 먹선만 있는 원고에서는 불필요한 변형 없이 100점 연속성과 PASS를 반환한다', () => {
      const gray = makeBlankGray(32, 24, 600, 255);
      for (let y = 6; y <= 17; y += 1) {
        for (let x = 8; x <= 11; x += 1) setGray(gray, x, y, 8);
      }
      const out = run600DpiInkHairlinePreservation({ grayscale: gray, profileId: '600dpi-tankobon-offset' });
      expect(out.comparison.preservedAudit.status).toBe('PASS');
      expect(out.comparison.preservedAudit.minStrokeWidthPx).toBe(4);
      expect(out.comparison.continuityScoreAfter).toBe(100);
    });

    it('완전 백지 원고를 입력해도 오류 없이 0px·PASS·유효 SVG로 완주한다', () => {
      const blank = makeBlankGray(24, 24, 600, 255);
      const out = run600DpiInkHairlinePreservation({ grayscale: blank });
      expect(out.preserved.inkPixelCount).toBe(0);
      expect(out.comparison.preservedAudit.status).toBe('PASS');
      expect(out.wgslValidation.valid).toBe(true);
      expect(out.auditSvg).toContain('<svg');
    });
  });
});
