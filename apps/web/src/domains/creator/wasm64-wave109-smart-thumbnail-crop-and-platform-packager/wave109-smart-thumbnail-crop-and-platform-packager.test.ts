import { describe, expect, it } from "vitest";
import {
  ALL_PLATFORM_THUMBNAIL_PRESET_IDS,
  PLATFORM_THUMBNAIL_PRESETS,
  ResamplerError,
  SmartThumbnailError,
  compilePlatformThumbnailPackageManifest,
  computeNaiveCenterCrop,
  computeTileEdgeAcutance,
  lanczos3Weight,
  measureInkEdgeRingingOvershoot,
  renderSmartThumbnailSheetSvg,
  resampleTileBilinear,
  resampleTileLanczos3,
  sha256HexSync,
  solveSmartThumbnailCrops,
  summarizePlatformThumbnailPackageKo,
  type CropSubjectSpec,
  type PlatformThumbnailPresetId,
  type ResamplerErrorCode,
  type RgbaTileBuffer,
  type SmartThumbnailErrorCode,
  type SmartThumbnailSourceSpec,
} from "./index";

function makeSource(
  artworkId: string,
  titleKo: string,
  sourceWidthPx: number,
  sourceHeightPx: number,
  subjects: readonly CropSubjectSpec[],
  logoBox?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): SmartThumbnailSourceSpec {
  return logoBox
    ? { artworkId, titleKo, sourceWidthPx, sourceHeightPx, subjects, logoBox }
    : { artworkId, titleKo, sourceWidthPx, sourceHeightPx, subjects };
}

function makeSubject(
  subjectId: string,
  labelKo: string,
  priority: number,
  fx: number,
  fy: number,
  fw: number,
  fh: number,
  ex: number,
  ey: number,
  fullBodyBox?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): CropSubjectSpec {
  const base: CropSubjectSpec = {
    subjectId,
    labelKo,
    priority,
    faceBox: { x: fx, y: fy, width: fw, height: fh },
    eyeLinePoint: { x: ex, y: ey },
  };
  return fullBodyBox ? { ...base, fullBodyBox } : base;
}

function createUniformTile(width: number, height: number, color: readonly [number, number, number, number]): RgbaTileBuffer {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba.set(color, i * 4);
  }
  return { width, height, rgba };
}

function createStepEdgeTile(width: number, height: number, leftVal: number, rightVal: number, alphaLeft = 255, alphaRight = 255): RgbaTileBuffer {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const splitX = Math.floor(width / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = x < splitX ? leftVal : rightVal;
      rgba.set([v, v, v, x < splitX ? alphaLeft : alphaRight], (y * width + x) * 4);
    }
  }
  return { width, height, rgba };
}

function createComicInkSceneTile(width: number, height: number): RgbaTileBuffer {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onVertical = Math.abs(x - Math.floor(width * 0.35)) <= 1;
      const onDiagonal = Math.abs(x - y) <= 1;
      const onBlock = x >= Math.floor(width * 0.62) && y >= Math.floor(height * 0.25) && y <= Math.floor(height * 0.72);
      const val = onVertical || onDiagonal ? 24 : onBlock ? 48 : 232;
      rgba.set([val, val, val, 255], (y * width + x) * 4);
    }
  }
  return { width, height, rgba };
}

function createQuadrantTile(width: number, height: number): RgbaTileBuffer {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color: readonly [number, number, number, number] =
        y < midY
          ? x < midX ? [220, 40, 40, 255] : [40, 200, 60, 255]
          : x < midX ? [50, 90, 230, 255] : [230, 210, 50, 255];
      rgba.set(color, (y * width + x) * 4);
    }
  }
  return { width, height, rgba };
}

function expectSmartErrorCode(fn: () => void, code: SmartThumbnailErrorCode): void {
  try {
    fn();
    expect.unreachable(`SmartThumbnailError(${code})가 발생해야 합니다.`);
  } catch (err) {
    expect(err).toBeInstanceOf(SmartThumbnailError);
    expect((err as SmartThumbnailError).code).toBe(code);
  }
}

function expectResamplerErrorCode(fn: () => void, code: ResamplerErrorCode): void {
  try {
    fn();
    expect.unreachable(`ResamplerError(${code})가 발생해야 합니다.`);
  } catch (err) {
    expect(err).toBeInstanceOf(ResamplerError);
    expect((err as ResamplerError).code).toBe(code);
  }
}

describe("Wave 109 — 스마트 썸네일 크롭 솔버 & 플랫폼 UI 배지 회피", () => {
  it("1. 6종 표준 플랫폼 프리셋 규격과 UI 배지 안전 영역을 정확히 정의한다", () => {
    expect(ALL_PLATFORM_THUMBNAIL_PRESET_IDS).toEqual([
      "naver-episode-thumb", "naver-series-square", "kakao-vertical-poster",
      "global-webtoon-banner", "og-social-card", "hero-widescreen",
    ]);
    expect(PLATFORM_THUMBNAIL_PRESETS["naver-episode-thumb"]).toMatchObject({ targetWidthPx: 202, targetHeightPx: 120 });
    expect(PLATFORM_THUMBNAIL_PRESETS["naver-episode-thumb"].uiBadgeZones[0].badgeText).toBe("UP");
    expect(PLATFORM_THUMBNAIL_PRESETS["naver-series-square"]).toMatchObject({ targetWidthPx: 434, targetHeightPx: 408 });
    expect(PLATFORM_THUMBNAIL_PRESETS["naver-series-square"].uiBadgeZones).toHaveLength(2);
    expect(PLATFORM_THUMBNAIL_PRESETS["kakao-vertical-poster"]).toMatchObject({ targetWidthPx: 600, targetHeightPx: 900 });
    expect(PLATFORM_THUMBNAIL_PRESETS["kakao-vertical-poster"].uiBadgeZones[1].normRect.height).toBeCloseTo(0.22, 6);
    expect(PLATFORM_THUMBNAIL_PRESETS["global-webtoon-banner"]).toMatchObject({ targetWidthPx: 1080, targetHeightPx: 1920 });
    expect(PLATFORM_THUMBNAIL_PRESETS["og-social-card"]).toMatchObject({ targetWidthPx: 1200, targetHeightPx: 630 });
    expect(PLATFORM_THUMBNAIL_PRESETS["hero-widescreen"]).toMatchObject({ targetWidthPx: 1920, targetHeightPx: 1080 });
  });

  it("2. 가로형 마스터 원고에서 6종 프리셋 모두 종횡비 상대오차 1e-4 미만과 원본 경계 내 크롭을 보장한다", () => {
    const source = makeSource("art-ep109-landscape", "달빛 서고 1화 표지", 1600, 1000, [
      makeSubject("hero-jiyoon", "주인공 지윤", 10, 640, 210, 220, 250, 750, 315, { x: 540, y: 180, width: 420, height: 780 }),
    ]);
    const sol = solveSmartThumbnailCrops(source);
    expect(sol.crops).toHaveLength(6);
    expect(sol.maxAspectRatioRelativeError).toBeLessThan(1e-4);
    expect(sol.allPrimaryFacesContained).toBe(true);
    expect(sol.anyPrimaryEyeOccludedByUiBadge).toBe(false);

    for (const crop of sol.crops) {
      expect(crop.aspectRatioRelativeError).toBeLessThan(1e-4);
      expect(crop.withinSourceBounds).toBe(true);
      expect(crop.cropWindow.x).toBeGreaterThanOrEqual(-1e-6);
      expect(crop.cropWindow.y).toBeGreaterThanOrEqual(-1e-6);
      expect(crop.cropWindow.x + crop.cropWindow.width).toBeLessThanOrEqual(source.sourceWidthPx + 1e-6);
      expect(crop.cropWindow.y + crop.cropWindow.height).toBeLessThanOrEqual(source.sourceHeightPx + 1e-6);
    }
  });

  it("3. 세로형 웹툰 원고(800×1800)에서도 6종 프리셋 종횡비 정밀도와 경계 제약을 만족한다", () => {
    const source = makeSource("art-ep109-tall", "청명검기 세로 컷", 800, 1800, [
      makeSubject("hero-taeho", "주인공 태호", 10, 260, 380, 200, 230, 360, 475),
    ]);
    const sol = solveSmartThumbnailCrops(source);
    expect(sol.allPrimaryFacesContained).toBe(true);
    expect(sol.anyPrimaryEyeOccludedByUiBadge).toBe(false);
    expect(sol.maxAspectRatioRelativeError).toBeLessThan(1e-4);
    for (const c of sol.crops) {
      expect(c.withinSourceBounds).toBe(true);
      expect(c.primaryFaceFullyContained).toBe(true);
    }
  });

  it("4. 동일 입력에 대해 크롭 솔버 결과가 완벽히 결정론적으로 재현된다", () => {
    const source = makeSource("art-determinism", "결정론 검증 원고", 1440, 960, [
      makeSubject("hero-a", "주연", 9, 880, 240, 190, 210, 975, 330),
    ]);
    expect(JSON.stringify(solveSmartThumbnailCrops(source))).toBe(JSON.stringify(solveSmartThumbnailCrops(source)));
  });

  it("5. 우상단 치우친 주연(x=1150, y=280)은 단순 중앙 크롭에서 잘리지만 스마트 크롭은 전 규격 100% 보존한다", () => {
    const source = makeSource("art-offcenter-right", "우상단 치우친 주연 검증", 1600, 1000, [
      makeSubject("hero-right", "우측 주연", 10, 1150, 280, 210, 240, 1255, 380),
    ]);
    const naivePortrait = computeNaiveCenterCrop(source, "kakao-vertical-poster");
    expect(naivePortrait.primaryFaceFullyContained).toBe(false);
    expect(naivePortrait.primaryFaceContainedRatio).toBeLessThan(0.5);
    expect(computeNaiveCenterCrop(source, "global-webtoon-banner").primaryFaceFullyContained).toBe(false);

    const sol = solveSmartThumbnailCrops(source);
    expect(sol.allPrimaryFacesContained).toBe(true);
    expect(sol.anyPrimaryEyeOccludedByUiBadge).toBe(false);
    for (const c of sol.crops) {
      expect(c.primaryFaceFullyContained).toBe(true);
      expect(c.primaryFaceContainedRatio).toBeCloseTo(1, 5);
    }
  });

  it("6. 좌하단 가장자리 주연도 세로·정방형·와이드 규격 모두 얼굴 잘림 없이 프레이밍한다", () => {
    const source = makeSource("art-corner-bl", "좌하단 주연 컷", 1400, 1000, [
      makeSubject("hero-bl", "좌하단 주연", 10, 70, 660, 180, 200, 160, 745),
    ]);
    const sol = solveSmartThumbnailCrops(source);
    expect(sol.allPrimaryFacesContained).toBe(true);
    expect(sol.maxAspectRatioRelativeError).toBeLessThan(1e-4);
  });

  it("7. 여유 공간이 충분한 원고에서 주연 눈높이를 상단 삼분할(0.28..0.46)과 균형 수평선에 정렬한다", () => {
    const source = makeSource("art-thirds", "삼분할 눈높이 정렬", 1800, 1400, [
      makeSubject("hero-center", "중앙 주연", 10, 760, 520, 220, 240, 870, 620),
    ]);
    const sol = solveSmartThumbnailCrops(source, ["og-social-card", "hero-widescreen", "naver-series-square"]);
    for (const c of sol.crops) {
      const eye = c.primaryEyeNorm ?? { x: 0, y: 0 };
      expect(eye.y).toBeGreaterThanOrEqual(0.28);
      expect(eye.y).toBeLessThanOrEqual(0.46);
      expect(c.ruleOfThirdsAlignmentScore).toBeGreaterThan(0.75);
    }
  });

  it("8. 피사체가 없는 배경·로고 단독 원고도 안전하게 중앙 구도 크롭을 산출한다", () => {
    const source = makeSource("art-bg-only", "배경 타이틀 원고", 1600, 900, [], { x: 520, y: 310, width: 560, height: 200 });
    const sol = solveSmartThumbnailCrops(source);
    expect(sol.primarySubjectId).toBeNull();
    expect(sol.allPrimaryFacesContained).toBe(true);
    expect(sol.anyPrimaryEyeOccludedByUiBadge).toBe(false);
    expect(sol.maxAspectRatioRelativeError).toBeLessThan(1e-4);
  });

  it("9. 좌상단 네이버 UP 배지 구역에 걸친 주연도 크롭을 조정해 시선 가림을 0으로 회피한다", () => {
    const source = makeSource("art-naver-up-guard", "좌상단 UP 배지 회피 테스트", 1200, 900, [
      makeSubject("hero-tl", "좌상단 주연", 10, 115, 72, 165, 185, 195, 148),
    ]);
    const naver = solveSmartThumbnailCrops(source, ["naver-episode-thumb"]).crops[0];
    expect(naver.primaryFaceFullyContained).toBe(true);
    expect(naver.primaryEyeOccludedByUiBadge).toBe(false);
    expect(naver.primaryFaceBadgeOverlapRatio).toBeLessThan(0.05);
  });

  it("10. 네이버 시리즈 좌상단 NEW 및 우하단 등급 배지 모두에서 주연 시선 가림을 회피한다", () => {
    const source = makeSource("art-series-corners", "시리즈 코너 배지 회피", 1200, 1200, [
      makeSubject("hero-br", "우하단 인접 주연", 10, 840, 820, 190, 210, 935, 905),
    ]);
    const square = solveSmartThumbnailCrops(source, ["naver-series-square"]).crops[0];
    expect(square.primaryFaceFullyContained).toBe(true);
    expect(square.primaryEyeOccludedByUiBadge).toBe(false);
  });

  it("11. 카카오 세로 포스터 하단 22% 타이틀 안전 영역 위에 주연 시선을 배치한다", () => {
    const source = makeSource("art-kakao-title-bar", "카카오 타이틀바 회피", 1200, 1500, [
      makeSubject("hero-lower", "하단 인접 주연", 10, 460, 1020, 220, 240, 570, 1120),
    ]);
    const kakao = solveSmartThumbnailCrops(source, ["kakao-vertical-poster"]).crops[0];
    expect(kakao.primaryFaceFullyContained).toBe(true);
    expect(kakao.primaryEyeOccludedByUiBadge).toBe(false);
    expect(kakao.primaryEyeNorm?.y ?? 1).toBeLessThan(0.78);
  });

  it("12. 글로벌 웹툰 세로 배너의 상단·하단 UI 크롬 여백 사이 안전 대역에 주연 시선을 배치한다", () => {
    const source = makeSource("art-global-chrome", "글로벌 상하단 크롬 회피", 1400, 1800, [
      makeSubject("hero-top", "상단 인접 주연", 10, 550, 110, 210, 230, 655, 205),
    ]);
    const banner = solveSmartThumbnailCrops(source, ["global-webtoon-banner"]).crops[0];
    expect(banner.primaryFaceFullyContained).toBe(true);
    expect(banner.primaryEyeOccludedByUiBadge).toBe(false);
    expect(banner.primaryEyeNorm?.y ?? 0).toBeGreaterThan(0.11);
    expect(banner.primaryEyeNorm?.y ?? 1).toBeLessThan(0.82);
  });

  it("13. 주연(priority 10)과 멀리 떨어진 조연(priority 3)이 공존할 때 좁은 세로 크롭은 주연 얼굴을 우선 보존한다", () => {
    const source = makeSource("art-priority-conflict", "주연 우선순위 분리", 1800, 1000, [
      makeSubject("bystander-left", "행인 조연", 3, 90, 280, 170, 190, 175, 360),
      makeSubject("hero-right", "핵심 주연", 10, 1420, 250, 200, 220, 1520, 340),
    ]);
    const sol = solveSmartThumbnailCrops(source, ["kakao-vertical-poster", "global-webtoon-banner"]);
    expect(sol.primarySubjectId).toBe("hero-right");
    for (const c of sol.crops) {
      expect(c.primarySubjectId).toBe("hero-right");
      expect(c.primaryFaceFullyContained).toBe(true);
      expect(c.subjectCoverages.find((s) => s.subjectId === "bystander-left")?.faceFullyContained).toBe(false);
    }
  });

  it("14. 주연과 인접 조연이 함께 담길 수 있는 와이드 규격에서는 두 캐릭터를 함께 포용한다", () => {
    const source = makeSource("art-duo-wide", "주연·조연 동반 프레이밍", 1920, 1080, [
      makeSubject("hero-main", "주연", 10, 640, 240, 200, 220, 740, 330),
      makeSubject("partner-sub", "파트너", 7, 1020, 260, 190, 210, 1115, 345),
    ]);
    const heroCrop = solveSmartThumbnailCrops(source, ["hero-widescreen"]).crops[0];
    expect(heroCrop.primaryFaceFullyContained).toBe(true);
    expect(heroCrop.subjectCoverages.find((s) => s.subjectId === "partner-sub")?.faceFullyContained).toBe(true);
  });

  it("15. 업스케일 배율이 2.0을 초과하면 lowResolutionWarning을 발행하고, 고해상도 원본에서는 경고하지 않는다", () => {
    const lowRes = makeSource("art-lowres", "저해상도 원본 테스트", 480, 320, [
      makeSubject("hero-small", "주연", 10, 180, 70, 100, 110, 230, 115),
    ]);
    const lowSol = solveSmartThumbnailCrops(lowRes, ["hero-widescreen", "global-webtoon-banner"]);
    expect(lowSol.lowResolutionPresetIds).toEqual(["hero-widescreen", "global-webtoon-banner"]);
    expect(lowSol.crops[0].lowResolutionWarning).toBe(true);
    expect(lowSol.crops[0].upscaleRatio).toBeGreaterThan(2.0);
    expect(lowSol.crops[0].warningsKo.length).toBeGreaterThan(0);

    const hiRes = makeSource("art-hires", "고해상도 원본 테스트", 2400, 1800, [
      makeSubject("hero-hi", "주연", 10, 960, 420, 340, 380, 1130, 580),
    ]);
    const hiSol = solveSmartThumbnailCrops(hiRes, ["naver-episode-thumb", "naver-series-square"]);
    expect(hiSol.lowResolutionPresetIds).toEqual([]);
    expect(hiSol.crops[0].lowResolutionWarning).toBe(false);
    expect(hiSol.crops[0].upscaleRatio).toBeLessThan(1.0);
  });

  it("16. 잘못된 원본 치수·우선순위·캔버스 이탈 얼굴 박스·빈 프리셋 목록에 fail-closed 오류를 던진다", () => {
    const validBase = makeSource("art-valid", "검증용", 800, 600, []);
    expectSmartErrorCode(() => solveSmartThumbnailCrops({ ...validBase, sourceWidthPx: 0 }), "INVALID_SOURCE_DIMENSIONS");
    expectSmartErrorCode(
      () => solveSmartThumbnailCrops({ ...validBase, subjects: [makeSubject("bad-p", "오류", 11, 100, 100, 80, 80, 140, 140)] }),
      "INVALID_SUBJECT_SPEC",
    );
    expectSmartErrorCode(
      () => solveSmartThumbnailCrops({ ...validBase, subjects: [makeSubject("oob", "이탈", 8, 760, 100, 80, 80, 780, 140)] }),
      "INVALID_SUBJECT_SPEC",
    );
    expectSmartErrorCode(() => solveSmartThumbnailCrops(validBase, []), "EMPTY_PRESET_LIST");
    expectSmartErrorCode(
      () => solveSmartThumbnailCrops(validBase, ["unknown-preset" as PlatformThumbnailPresetId]),
      "UNKNOWN_PRESET_ID",
    );
  });
});

describe("Wave 109 — 안티링잉 Lanczos-3 만화 선화 리샘플러 & SHA-256 매니페스트", () => {
  it("17. Lanczos-3 커널의 핵심 수학 불변식(영점·대칭성·부엽 부호·유한 지지)을 정확히 만족한다", () => {
    expect(lanczos3Weight(0)).toBe(1);
    for (const z of [1, -1, 2, -2, 3, -3, 4.25, Number.NaN]) {
      expect(lanczos3Weight(z)).toBe(0);
    }
    for (const x of [0.25, 0.5, 0.75, 1.35, 1.5, 2.45]) {
      expect(lanczos3Weight(-x)).toBe(lanczos3Weight(x));
    }
    expect(lanczos3Weight(0.5)).toBeGreaterThan(0);
    expect(lanczos3Weight(1.5)).toBeLessThan(0);
    expect(lanczos3Weight(2.5)).toBeGreaterThan(0);
  });

  it("18. 고대비 만화 잉크 경계(30↔225) 업샘플링 시 Raw Lanczos-3는 링잉을 내지만 안티링잉은 0픽셀로 억제하고 Bilinear보다 선명하다", () => {
    const src = createStepEdgeTile(24, 24, 30, 225);
    const rawLanczos = resampleTileLanczos3(src, 60, 60, { antiRinging: false });
    const antiRingingLanczos = resampleTileLanczos3(src, 60, 60, { antiRinging: true });
    const bilinear = resampleTileBilinear(src, 60, 60);

    expect(measureInkEdgeRingingOvershoot(rawLanczos, 30, 225).ringingOvershootCount).toBeGreaterThan(0);
    const guardedRing = measureInkEdgeRingingOvershoot(antiRingingLanczos, 30, 225);
    expect(guardedRing.ringingOvershootCount).toBe(0);
    expect(guardedRing.observedMinChannel).toBeGreaterThanOrEqual(30);
    expect(guardedRing.observedMaxChannel).toBeLessThanOrEqual(225);

    const lanczosAc = computeTileEdgeAcutance(antiRingingLanczos);
    const bilinearAc = computeTileEdgeAcutance(bilinear);
    expect(lanczosAc.rmsSobelAcutance).toBeGreaterThan(bilinearAc.rmsSobelAcutance);
    expect(lanczosAc.maxSobelMagnitude).toBeGreaterThan(bilinearAc.maxSobelMagnitude);
    expect(lanczosAc.meanLaplacianMagnitude).toBeGreaterThan(bilinearAc.meanLaplacianMagnitude);
  });

  it("19. 고대비 만화 잉크 경계(30↔225) 비정수 축소(64×64→39×39)에서도 안티링잉 오버슈트 0과 Bilinear 대비 높은 선명도를 유지한다", () => {
    const src = createStepEdgeTile(64, 64, 30, 225);
    const rawLanczos = resampleTileLanczos3(src, 39, 39, { antiRinging: false });
    const guarded = resampleTileLanczos3(src, 39, 39, { antiRinging: true });
    const bilinear = resampleTileBilinear(src, 39, 39);

    expect(measureInkEdgeRingingOvershoot(rawLanczos, 30, 225).ringingOvershootCount).toBeGreaterThan(0);
    expect(measureInkEdgeRingingOvershoot(guarded, 30, 225).ringingOvershootCount).toBe(0);
    expect(computeTileEdgeAcutance(guarded).rmsSobelAcutance).toBeGreaterThan(computeTileEdgeAcutance(bilinear).rmsSobelAcutance);
  });

  it("20. 극단적 흑백 잉크 선화(24↔232 복합 수직·대각선) 리샘플링에서 오버슈트 0과 선화 선명도 우위를 보장한다", () => {
    const comicTile = createComicInkSceneTile(64, 48);
    const guarded = resampleTileLanczos3(comicTile, 44, 33, { antiRinging: true });
    const bilinear = resampleTileBilinear(comicTile, 44, 33);

    expect(measureInkEdgeRingingOvershoot(guarded, 24, 232).ringingOvershootCount).toBe(0);
    expect(computeTileEdgeAcutance(guarded).rmsSobelAcutance).toBeGreaterThan(computeTileEdgeAcutance(bilinear).rmsSobelAcutance);
  });

  it("21. 단색 평탄 타일(사용자 지정 반투명 알파 포함)은 확대·축소 모두 비트 단위 완전 일치를 보존한다", () => {
    const src = createUniformTile(16, 16, [42, 137, 211, 180]);
    for (const tile of [resampleTileLanczos3(src, 37, 29), resampleTileLanczos3(src, 7, 9)]) {
      for (let i = 0; i < tile.width * tile.height; i += 1) {
        expect(Array.from(tile.rgba.slice(i * 4, i * 4 + 4))).toEqual([42, 137, 211, 180]);
      }
    }
  });

  it("22. 알파 채널 경계(40↔210)에서도 안티링잉 클램프가 알파 오버슈트 없이 부드럽게 보간한다", () => {
    const out = resampleTileLanczos3(createStepEdgeTile(20, 20, 128, 128, 40, 210), 48, 48, { antiRinging: true });
    let minAlpha = 255;
    let maxAlpha = 0;
    for (let i = 0; i < out.width * out.height; i += 1) {
      const a = out.rgba[i * 4 + 3];
      if (a < minAlpha) minAlpha = a;
      if (a > maxAlpha) maxAlpha = a;
    }
    expect(minAlpha).toBeGreaterThanOrEqual(40);
    expect(maxAlpha).toBeLessThanOrEqual(210);
  });

  it("23. sourceCrop 부분 영역 지정 시 4사분면 테스트 타일에서 해당 사분면 색상만 정확히 추출한다", () => {
    const cropped = resampleTileLanczos3(createQuadrantTile(40, 40), 12, 12, {
      antiRinging: true,
      sourceCrop: { x: 22, y: 22, width: 16, height: 16 },
    });
    for (let i = 0; i < cropped.width * cropped.height; i += 1) {
      expect(Array.from(cropped.rgba.slice(i * 4, i * 4 + 4))).toEqual([230, 210, 50, 255]);
    }
  });

  it("24. 리샘플러는 동일 입력에서 바이트 단위 결정론을 보장하고 잘못된 버퍼·치수 입력을 거부한다", () => {
    const src = createComicInkSceneTile(32, 24);
    expect(Array.from(resampleTileLanczos3(src, 21, 16).rgba)).toEqual(Array.from(resampleTileLanczos3(src, 21, 16).rgba));
    expectResamplerErrorCode(
      () => resampleTileLanczos3({ width: 4, height: 4, rgba: new Uint8ClampedArray(10) }, 8, 8),
      "INVALID_TILE_BUFFER",
    );
    expectResamplerErrorCode(() => resampleTileLanczos3(src, 0, 10), "INVALID_TARGET_DIMENSIONS");
    expectResamplerErrorCode(
      () => resampleTileLanczos3(src, 10, 10, { sourceCrop: { x: 0, y: 0, width: -5, height: 10 } }),
      "INVALID_CROP_RECT",
    );
  });

  it("25. 3×3 미만 초소형 타일에서도 computeTileEdgeAcutance가 예외 없이 0을 반환한다", () => {
    const metrics = computeTileEdgeAcutance(createUniformTile(2, 2, [100, 100, 100, 255]));
    expect(metrics.interiorPixelCount).toBe(0);
    expect(metrics.rmsSobelAcutance).toBe(0);
  });

  it("26. 순수 ES2017 동기 FIPS 180-4 SHA-256이 NIST 공식 테스트 벡터와 UTF-8 입력을 정확히 일치시킨다", () => {
    expect(sha256HexSync("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256HexSync("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256HexSync("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    const ko = sha256HexSync("툰스튜디오 스마트 썸네일");
    expect(ko).toMatch(/^[0-9a-f]{64}$/);
    expect(ko).toBe(sha256HexSync("툰스튜디오 스마트 썸네일"));
  });

  it("27. compilePlatformThumbnailPackageManifest는 결정론적 64자리 SHA-256 매니페스트 다이제스트를 생성한다", () => {
    const source = makeSource("art-pack-manifest", "별빛 기사단 12화", 1600, 1200, [
      makeSubject("hero-arin", "기사 아린", 10, 700, 260, 220, 250, 810, 365),
    ]);
    const reportA = compilePlatformThumbnailPackageManifest({ sourceSpec: source });
    const reportB = compilePlatformThumbnailPackageManifest({ sourceSpec: source });
    expect(reportA.manifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(reportA.manifestSha256Hex).toBe(reportB.manifestSha256Hex);
    expect(reportA.manifestCanonicalJson).toBe(reportB.manifestCanonicalJson);
    expect(reportA.readyForPublish).toBe(true);
    expect(reportA.deliverables).toHaveLength(6);
  });

  it("28. 원본 RGBA 타일을 포함한 패키징은 전 프리셋 오버슈트 0, Bilinear 대비 선명도 향상, 픽셀 변조 민감도를 증명한다", () => {
    const source = makeSource("art-pack-pixel-audit", "먹선 검객 3화", 1600, 1200, [
      makeSubject("hero-swordsman", "검객 유진", 10, 620, 240, 240, 260, 740, 350),
    ]);
    const tile = createComicInkSceneTile(80, 60);
    const report = compilePlatformThumbnailPackageManifest({
      sourceSpec: source,
      sourceTile: tile,
      resamplePreviewMaxEdgePx: 48,
      antiRinging: true,
    });
    expect(report.readyForPublish).toBe(true);
    expect(report.resamplerAudit.resampledPresetCount).toBe(6);
    expect(report.resamplerAudit.totalRingingOvershootCount).toBe(0);
    expect(report.resamplerAudit.sharpnessGainRatio).toBeGreaterThan(1.0);
    for (const d of report.deliverables) {
      expect(d.tileSha256Hex).toMatch(/^[0-9a-f]{64}$/);
      expect(d.ringingReport?.ringingOvershootCount).toBe(0);
    }

    const mutatedRgba = new Uint8ClampedArray(tile.rgba);
    const midIdx = (30 * tile.width + 40) * 4;
    mutatedRgba[midIdx] = mutatedRgba[midIdx] === 232 ? 120 : 232;
    const mutatedReport = compilePlatformThumbnailPackageManifest({
      sourceSpec: source,
      sourceTile: { width: tile.width, height: tile.height, rgba: mutatedRgba },
      resamplePreviewMaxEdgePx: 48,
      antiRinging: true,
    });
    expect(mutatedReport.manifestSha256Hex).not.toBe(report.manifestSha256Hex);
  });
});

describe("Wave 109 — 인쇄 안전 OKLCH SVG 검수 시트 & 자연스러운 한국어 출고 보고서", () => {
  const sampleSource = makeSource(
    "art-svg-audit-01",
    "청풍서원 5화 대표 컷",
    1600,
    1100,
    [makeSubject("hero-seoyeon", "서연", 10, 960, 260, 220, 240, 1070, 360)],
    { x: 120, y: 90, width: 320, height: 110 },
  );

  it("29. renderSmartThumbnailSheetSvg는 6종 프리셋 카드, 마스터 오버레이, 시선 조준선을 NaN 없이 렌더링한다", () => {
    const pkg = compilePlatformThumbnailPackageManifest({
      sourceSpec: sampleSource,
      sourceTile: createComicInkSceneTile(64, 44),
      resamplePreviewMaxEdgePx: 40,
    });
    const sheet = renderSmartThumbnailSheetSvg(pkg, sampleSource);
    expect(sheet.containsNaN).toBe(false);
    expect(sheet.svg.startsWith("<svg ")).toBe(true);
    expect(sheet.svg.endsWith("</svg>")).toBe(true);
    expect(sheet.renderedPresetCount).toBe(6);
    expect(sheet.hasPrimaryEyeCrosshair).toBe(true);
    expect(sheet.svg).toContain('data-primary-eye-crosshair="master"');
    for (const id of ALL_PLATFORM_THUMBNAIL_PRESET_IDS) {
      expect(sheet.svg).toContain(`data-preset-card="${id}"`);
      expect(sheet.svg).toContain(`data-master-crop="${id}"`);
    }
  });

  it("30. SVG 출력물은 순수 OKLCH 색상만 사용하고 raw hex 및 rgb()/hsl() 리터럴을 0건 유지한다", () => {
    const sheet = renderSmartThumbnailSheetSvg(
      compilePlatformThumbnailPackageManifest({ sourceSpec: sampleSource }),
      sampleSource,
    );
    expect(sheet.svg).toContain("oklch(");
    expect(sheet.svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(sheet.svg).not.toMatch(/\brgba?\s*\(/i);
    expect(sheet.svg).not.toMatch(/\bhsla?\s*\(/i);
  });

  it("31. 작품명·ID에 XML 특수문자(<>&\"')가 포함돼도 안전하게 이스케이프 처리한다", () => {
    const trickySource: SmartThumbnailSourceSpec = {
      ...sampleSource,
      artworkId: 'art-<x>&"test"',
      titleKo: `<script>alert("xss")</script> & '검수'`,
    };
    const sheet = renderSmartThumbnailSheetSvg(
      compilePlatformThumbnailPackageManifest({ sourceSpec: trickySource }),
      trickySource,
    );
    expect(sheet.containsNaN).toBe(false);
    expect(sheet.svg).not.toContain("<script>");
    expect(sheet.svg).toContain("&lt;script&gt;");
    expect(sheet.svg).toContain("&amp;");
  });

  it("32. summarizePlatformThumbnailPackageKo는 번역투 없는 자연스러운 한국어 출고 QA 브리프를 생성한다", () => {
    const pkg = compilePlatformThumbnailPackageManifest({
      sourceSpec: sampleSource,
      sourceTile: createComicInkSceneTile(64, 44),
      resamplePreviewMaxEdgePx: 40,
    });
    const brief = summarizePlatformThumbnailPackageKo(pkg);
    expect(brief).toContain("[플랫폼별 스마트 썸네일 출고 QA 브리프]");
    expect(brief).toContain("출고 승인");
    expect(brief).toContain("청풍서원 5화 대표 컷");
    expect(brief).toContain(pkg.manifestSha256Hex);
    expect(brief).toContain("안티링잉 Lanczos-3 감사(6종): 오버슈트 0px");
    expect(brief).toContain("네이버 웹툰 회차 썸네일(202×120)");
    expect(brief).toContain("카카오페이지·웹툰 세로형 포스터(600×900)");
    expect(brief).not.toContain("하는 것을 가능하게 합니다");
    expect(brief).not.toContain("직관적인 경험을 제공합니다");
    expect(brief).not.toContain("원활한 워크플로우를 보장합니다");
  });
});
