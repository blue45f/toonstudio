/**
 * Wave 138 — 멀티 플랫폼 지능형 세로 컷 자동 슬라이스 · 말풍선/얼굴 절단 제로 DP 리패킹 컴파일러 Vitest 스위트.
 */

import { describe, expect, it } from "vitest";
import {
  PLATFORM_SLICE_PRESETS,
  PLATFORM_SLICE_PRESET_IDS,
  buildDeterministicRowEnergyProfile,
  canonicalJsonStringify,
  compareNaiveVsSmartSlices,
  compileMultiPlatformSliceBundle,
  compileSmartPlatformSlices,
  escapeSliceSvgXml,
  estimateSliceEncodedBytes,
  getPlatformSlicePreset,
  normalizeManuscriptForPlatform,
  planNaiveFixedHeightSlices,
  renderSmartSliceComparisonSvg,
  sha256HexSync,
  summarizeMultiPlatformSliceAuditKo,
  type PlatformSlicePlan,
  type PlatformSlicePreset,
  type ProtectedSpan,
  type VerticalManuscriptInput,
} from "./index";

/**
 * 1600x24000px 웹툰 마스터 원고 픽스처.
 * 축소 비율(0.5 기준 LINE 1280px · Naver 1600px, 0.45 기준 Kakao 1440px, 0.475 기준 Piccoma 1500px,
 * 1.0 기준 Studio HD 3200px)의 고정 분할선에 캐릭터 얼굴·대사 말풍선·효과음이 정면으로 걸리도록 배치하고,
 * 주변에 안전한 여백 밴드를 함께 배치해 DP 솔버의 절단 제로 회피 성능을 검증한다.
 */
function createRealisticHeroEpisode(): VerticalManuscriptInput {
  const spans: ProtectedSpan[] = [
    { id: "gutter-01", kind: "gutter-safe-band", startY: 2050, endY: 2240, labelKo: "1컷-2컷 여백" },
    // LINE 1280px(마스터 2560px) 정면 충돌 얼굴
    { id: "face-01", kind: "character-face", startY: 2380, endY: 2740, labelKo: "주인공 클로즈업", priority: 5 },
    { id: "gutter-02", kind: "gutter-safe-band", startY: 2820, endY: 3000, labelKo: "2컷-3컷 여백" },
    // Naver 1600px / Studio HD 3200px(마스터 3200px) 정면 충돌 말풍선
    { id: "balloon-01", kind: "dialogue-balloon", startY: 3040, endY: 3380, labelKo: "핵심 고백 대사", priority: 5 },
    { id: "gutter-03", kind: "gutter-safe-band", startY: 3480, endY: 3680, labelKo: "3컷-4컷 여백" },
    // LINE 2560px(마스터 5120px) 정면 충돌 말풍선
    { id: "balloon-02", kind: "dialogue-balloon", startY: 4960, endY: 5280, labelKo: "반격 대사 말풍선", priority: 4 },
    { id: "gutter-04", kind: "gutter-safe-band", startY: 5400, endY: 5620, labelKo: "4컷-5컷 여백" },
    // Naver 3200px / Studio HD 6400px(마스터 6400px) 정면 충돌 얼굴
    { id: "face-02", kind: "character-face", startY: 6220, endY: 6600, labelKo: "라이벌 등장 얼굴", priority: 5 },
    { id: "gutter-05", kind: "gutter-safe-band", startY: 6760, endY: 6980, labelKo: "5컷-6컷 여백" },
    // LINE 3840px(마스터 7680px) 정면 충돌 효과음
    { id: "sfx-01", kind: "sfx-lettering", startY: 7520, endY: 7860, labelKo: "콰광 충격 효과음", priority: 4 },
    { id: "gutter-06", kind: "gutter-safe-band", startY: 8000, endY: 8220, labelKo: "6컷-7컷 여백" },
    // Naver 4800px / Studio HD 9600px(마스터 9600px) 정면 충돌 얼굴
    { id: "face-03", kind: "character-face", startY: 9420, endY: 9780, labelKo: "조연 놀람 표정", priority: 5 },
    { id: "gutter-07", kind: "gutter-safe-band", startY: 9900, endY: 10120, labelKo: "7컷-8컷 여백" },
    // LINE 5120px(마스터 10240px) 정면 충돌 얼굴
    { id: "face-04", kind: "character-face", startY: 10140, endY: 10440, labelKo: "전투 돌입 눈빛", priority: 5 },
    { id: "gutter-08", kind: "gutter-safe-band", startY: 11800, endY: 12040, labelKo: "8컷-9컷 여백" },
    // LINE 6400px / Naver 6400px(마스터 12800px) 정면 충돌 말풍선
    { id: "balloon-03", kind: "dialogue-balloon", startY: 12620, endY: 12980, labelKo: "클라이맥스 외침", priority: 5 },
    { id: "gutter-09", kind: "gutter-safe-band", startY: 13160, endY: 13400, labelKo: "9컷-10컷 여백" },
    { id: "seam-01", kind: "panel-border-seam", startY: 14800, endY: 14860, labelKo: "대컷 하단 테두리" },
    { id: "gutter-10", kind: "gutter-safe-band", startY: 15020, endY: 15280, labelKo: "10컷-11컷 여백" },
    // Naver 8000px / Studio HD 16000px(마스터 16000px) 정면 충돌 얼굴
    { id: "face-05", kind: "character-face", startY: 15820, endY: 16200, labelKo: "결말 미소 얼굴", priority: 5 },
    { id: "gutter-11", kind: "gutter-safe-band", startY: 17400, endY: 17640, labelKo: "11컷-12컷 여백" },
    // LINE 8960px(마스터 17920px) 정면 충돌 말풍선
    { id: "balloon-04", kind: "dialogue-balloon", startY: 17760, endY: 18100, labelKo: "에필로그 독백", priority: 4 },
    { id: "gutter-12", kind: "gutter-safe-band", startY: 19600, endY: 19860, labelKo: "12컷-13컷 여백" },
    // LINE 10240px(마스터 20480px) 정면 충돌 효과음
    { id: "sfx-02", kind: "sfx-lettering", startY: 20320, endY: 20640, labelKo: "엔딩 여운 효과음", priority: 4 },
    { id: "gutter-13", kind: "gutter-safe-band", startY: 21800, endY: 22060, labelKo: "13컷-엔딩 여백" },
  ];

  return {
    episodeId: "ep042-dawn-blade",
    episodeTitleKo: "42화 새벽 검격과 침묵",
    masterWidthPx: 1600,
    masterHeightPx: 24000,
    protectedSpans: spans,
    averageColorComplexity: 1.0,
  };
}

function assertLosslessMonotonicCoverage(plan: PlatformSlicePlan): void {
  expect(plan.slices.length).toBeGreaterThanOrEqual(1);
  expect(plan.slices[0].startY).toBe(0);

  let heightSum = 0;
  for (let i = 0; i < plan.slices.length; i += 1) {
    const slice = plan.slices[i];
    expect(slice.index).toBe(i);
    expect(slice.startY).toBeLessThan(slice.endY);
    expect(slice.heightPx).toBe(slice.endY - slice.startY);
    expect(slice.heightPx).toBeLessThanOrEqual(plan.preset.maxSliceHeightPx);
    expect(slice.widthPx).toBe(plan.scaledWidthPx);
    if (i > 0) {
      expect(slice.startY).toBe(plan.slices[i - 1].endY);
    }
    heightSum += slice.heightPx;
  }

  expect(plan.slices[plan.slices.length - 1].endY).toBe(plan.scaledHeightPx);
  expect(heightSum).toBe(plan.scaledHeightPx);
  expect(plan.cutPositionsY.length).toBe(plan.slices.length - 1);
  for (let i = 0; i < plan.cutPositionsY.length; i += 1) {
    expect(plan.cutPositionsY[i]).toBe(plan.slices[i].endY);
  }
}

describe("Wave 138 — 플랫폼 출고 규격 프리셋 및 정규화", () => {
  it("T01: 5종 플랫폼 프리셋 규격 계약과 단조 감소 품질 계단을 모두 제공한다", () => {
    expect(PLATFORM_SLICE_PRESET_IDS).toHaveLength(5);
    for (let i = 0; i < PLATFORM_SLICE_PRESET_IDS.length; i += 1) {
      const id = PLATFORM_SLICE_PRESET_IDS[i];
      const preset = PLATFORM_SLICE_PRESETS[id];
      expect(preset.id).toBe(id);
      expect(preset.targetWidthPx).toBeGreaterThanOrEqual(720);
      expect(preset.maxSliceHeightPx).toBeGreaterThan(preset.minSliceHeightPx);
      expect(preset.preferredSliceHeightPx).toBeGreaterThanOrEqual(preset.minSliceHeightPx);
      expect(preset.preferredSliceHeightPx).toBeLessThanOrEqual(preset.maxSliceHeightPx);
      expect(preset.maxBytesPerSlice).toBeGreaterThan(0);
      expect(preset.maxTotalEpisodeBytes).toBeGreaterThan(preset.maxBytesPerSlice);
      expect(preset.allowedFormats).toContain(preset.defaultFormat);
      expect(preset.colorProfile.length).toBeGreaterThan(0);
      expect(preset.qualityLadder.length).toBeGreaterThanOrEqual(4);
      for (let q = 1; q < preset.qualityLadder.length; q += 1) {
        expect(preset.qualityLadder[q]).toBeLessThan(preset.qualityLadder[q - 1]);
      }
    }
  });

  it("T02: getPlatformSlicePreset이 각 플랫폼별 핵심 픽셀 규격을 정확히 반환한다", () => {
    expect(getPlatformSlicePreset("naver-webtoon-kr").maxSliceHeightPx).toBe(1600);
    expect(getPlatformSlicePreset("naver-webtoon-kr").targetWidthPx).toBe(800);
    expect(getPlatformSlicePreset("kakao-page-kr").targetWidthPx).toBe(720);
    expect(getPlatformSlicePreset("kakao-page-kr").maxSliceHeightPx).toBe(1440);
    expect(getPlatformSlicePreset("line-webtoon-global").maxSliceHeightPx).toBe(1280);
    expect(getPlatformSlicePreset("piccoma-jp").targetWidthPx).toBe(760);
    expect(getPlatformSlicePreset("studio-hd-archive").targetWidthPx).toBe(1600);
    expect(getPlatformSlicePreset("studio-hd-archive").maxSliceHeightPx).toBe(3200);
  });

  it("T03: 1600x24000px 원고를 5종 플랫폼 너비에 맞춰 정확히 스케일 정규화한다", () => {
    const ep = createRealisticHeroEpisode();
    const naver = normalizeManuscriptForPlatform(ep, getPlatformSlicePreset("naver-webtoon-kr"));
    const kakao = normalizeManuscriptForPlatform(ep, getPlatformSlicePreset("kakao-page-kr"));
    const piccoma = normalizeManuscriptForPlatform(ep, getPlatformSlicePreset("piccoma-jp"));
    const archive = normalizeManuscriptForPlatform(ep, getPlatformSlicePreset("studio-hd-archive"));

    expect(naver.scaleRatio).toBeCloseTo(0.5, 6);
    expect(naver.scaledHeightPx).toBe(12000);
    expect(kakao.scaleRatio).toBeCloseTo(0.45, 6);
    expect(kakao.scaledHeightPx).toBe(10800);
    expect(piccoma.scaleRatio).toBeCloseTo(0.475, 6);
    expect(piccoma.scaledHeightPx).toBe(11400);
    expect(archive.scaleRatio).toBeCloseTo(1.0, 6);
    expect(archive.scaledHeightPx).toBe(24000);
    expect(naver.scaledSpans.length).toBe(ep.protectedSpans.length);
  });

  it("T04: 보호 영역 기반 행 시각 에너지가 여백 < 배경 < 컷선 < 효과음 < 말풍선 < 얼굴 순서를 따른다", () => {
    const norm = normalizeManuscriptForPlatform(
      {
        episodeId: "energy-order",
        episodeTitleKo: "에너지 계층 테스트",
        masterWidthPx: 800,
        masterHeightPx: 1400,
        protectedSpans: [
          { id: "g", kind: "gutter-safe-band", startY: 50, endY: 150 },
          { id: "s", kind: "panel-border-seam", startY: 300, endY: 400 },
          { id: "x", kind: "sfx-lettering", startY: 500, endY: 600 },
          { id: "b", kind: "dialogue-balloon", startY: 750, endY: 850 },
          { id: "f", kind: "character-face", startY: 1000, endY: 1100 },
        ],
      },
      getPlatformSlicePreset("naver-webtoon-kr"),
    );

    const eGutter = norm.normalizedRowEnergy[100];
    const eAmbient = norm.normalizedRowEnergy[220];
    const eSeam = norm.normalizedRowEnergy[350];
    const eSfx = norm.normalizedRowEnergy[550];
    const eBalloon = norm.normalizedRowEnergy[800];
    const eFace = norm.normalizedRowEnergy[1050];

    expect(eGutter).toBeLessThan(eAmbient);
    expect(eAmbient).toBeLessThan(eSeam);
    expect(eSeam).toBeLessThan(eSfx);
    expect(eSfx).toBeLessThan(eBalloon);
    expect(eBalloon).toBeLessThan(eFace);
  });

  it("T05: 사용자 지정 rowVisualEnergy의 1:1 매핑, 다운스케일, 업스케일 및 비유한수 클램핑을 보장한다", () => {
    const exact = buildDeterministicRowEnergyProfile(4, [], [0.1, Number.NaN, 1.8, -0.5]);
    expect(exact).toEqual([0.1, 0.18, 1, 0]);

    const down = buildDeterministicRowEnergyProfile(2, [], [0.2, 0.4, 0.8, 1.0]);
    expect(down[0]).toBeCloseTo(0.3, 6);
    expect(down[1]).toBeCloseTo(0.9, 6);

    const up = buildDeterministicRowEnergyProfile(5, [], [0.0, 1.0]);
    expect(up[0]).toBeCloseTo(0.0, 6);
    expect(up[2]).toBeCloseTo(0.5, 6);
    expect(up[4]).toBeCloseTo(1.0, 6);
  });

  it("T06: 역전 좌표·영길이 영역·허용 외 포맷 오버라이드를 방어적으로 정규화한다", () => {
    const norm = normalizeManuscriptForPlatform(
      {
        episodeId: "  ep-sanitize  ",
        episodeTitleKo: "  방어 입력 회차  ",
        masterWidthPx: 1600,
        masterHeightPx: 4000,
        formatOverride: "png", // line-webtoon-global은 jpeg만 허용
        protectedSpans: [
          { id: "reversed", kind: "character-face", startY: 1600, endY: 1200 },
          { id: "zero-len", kind: "dialogue-balloon", startY: 500, endY: 500 },
        ],
      },
      getPlatformSlicePreset("line-webtoon-global"),
    );

    expect(norm.episodeId).toBe("ep-sanitize");
    expect(norm.format).toBe("jpeg");
    expect(norm.scaledSpans).toHaveLength(1);
    expect(norm.scaledSpans[0].id).toBe("reversed");
    expect(norm.scaledSpans[0].startY).toBe(600);
    expect(norm.scaledSpans[0].endY).toBe(800);
  });

  it("T07: 바이트 추정기가 포맷(webp < jpeg < png) 및 품질 계단 단조성을 지킨다", () => {
    const webp92 = estimateSliceEncodedBytes(800, 1280, 0.5, "webp", 92, 1.0);
    const jpeg92 = estimateSliceEncodedBytes(800, 1280, 0.5, "jpeg", 92, 1.0);
    const png100 = estimateSliceEncodedBytes(800, 1280, 0.5, "png", 100, 1.0);
    expect(webp92).toBeLessThan(jpeg92);
    expect(jpeg92).toBeLessThan(png100);

    const jpeg88 = estimateSliceEncodedBytes(800, 1280, 0.5, "jpeg", 88, 1.0);
    const jpeg84 = estimateSliceEncodedBytes(800, 1280, 0.5, "jpeg", 84, 1.0);
    const jpeg78 = estimateSliceEncodedBytes(800, 1280, 0.5, "jpeg", 78, 1.0);
    expect(jpeg92).toBeGreaterThan(jpeg88);
    expect(jpeg88).toBeGreaterThan(jpeg84);
    expect(jpeg84).toBeGreaterThan(jpeg78);
  });
});

describe("Wave 138 — 1px 누락·중복 제로 완전 분할 불변량 및 경계 조건", () => {
  it("T08: 단순 고정 높이 분할이 5종 플랫폼 모두에서 단조 연속 무손실 커버를 보장한다", () => {
    const ep = createRealisticHeroEpisode();
    for (let i = 0; i < PLATFORM_SLICE_PRESET_IDS.length; i += 1) {
      const plan = planNaiveFixedHeightSlices(ep, PLATFORM_SLICE_PRESET_IDS[i]);
      assertLosslessMonotonicCoverage(plan);
    }
  });

  it("T09: DP 스마트 리패커가 5종 플랫폼 모두에서 1px 누락·중복 없이 완전 커버를 보장한다", () => {
    const ep = createRealisticHeroEpisode();
    for (let i = 0; i < PLATFORM_SLICE_PRESET_IDS.length; i += 1) {
      const plan = compileSmartPlatformSlices(ep, PLATFORM_SLICE_PRESET_IDS[i]);
      assertLosslessMonotonicCoverage(plan);
    }
  });

  it("T10: 플랫폼 최대 높이 이하의 짧은 원고는 1장 단일 슬라이스·절단 0개로 출력한다", () => {
    const shortEp: VerticalManuscriptInput = {
      episodeId: "short-ep",
      episodeTitleKo: "단컷 프롤로그",
      masterWidthPx: 800,
      masterHeightPx: 1100,
      protectedSpans: [{ id: "face-1", kind: "character-face", startY: 200, endY: 700 }],
    };
    const plan = compileSmartPlatformSlices(shortEp, "line-webtoon-global");
    assertLosslessMonotonicCoverage(plan);
    expect(plan.slices).toHaveLength(1);
    expect(plan.cutPositionsY).toHaveLength(0);
    expect(plan.criticalCutCount).toBe(0);
    expect(plan.auditGrade).toBe("PASS");
  });

  it("T11: 플랫폼 최대 높이의 정확한 배수 원고를 빈 조각 없이 분할한다", () => {
    const exactMultipleEp: VerticalManuscriptInput = {
      episodeId: "exact-mult",
      episodeTitleKo: "정배수 테스트",
      masterWidthPx: 800,
      masterHeightPx: 3840, // 1280 * 3
      protectedSpans: [],
    };
    const naive = planNaiveFixedHeightSlices(exactMultipleEp, "line-webtoon-global");
    const smart = compileSmartPlatformSlices(exactMultipleEp, "line-webtoon-global");
    assertLosslessMonotonicCoverage(naive);
    assertLosslessMonotonicCoverage(smart);
    expect(naive.slices).toHaveLength(3);
  });

  it("T12: 권장 최소 높이(minSliceHeightPx)보다 짧은 초단편 원고도 분할 없이 PASS 처리한다", () => {
    const tinyEp: VerticalManuscriptInput = {
      episodeId: "tiny-banner",
      episodeTitleKo: "공지 배너",
      masterWidthPx: 800,
      masterHeightPx: 200,
      protectedSpans: [{ id: "b1", kind: "dialogue-balloon", startY: 40, endY: 160 }],
    };
    const plan = compileSmartPlatformSlices(tinyEp, "naver-webtoon-kr");
    assertLosslessMonotonicCoverage(plan);
    expect(plan.slices).toHaveLength(1);
    expect(plan.auditGrade).toBe("PASS");
  });

  it("T13: 틈 없이 맞닿은 얼굴·말풍선 경계(합이 maxHeight 초과)에서 DP가 정확 경계선을 찾아 0건 절단한다", () => {
    const tightEp: VerticalManuscriptInput = {
      episodeId: "back-to-back",
      episodeTitleKo: "연속 밀착 컷",
      masterWidthPx: 800,
      masterHeightPx: 2000,
      protectedSpans: [
        { id: "face-a", kind: "character-face", startY: 0, endY: 1000, labelKo: "상단 얼굴" },
        { id: "balloon-b", kind: "dialogue-balloon", startY: 1000, endY: 2000, labelKo: "하단 말풍선" },
      ],
    };
    const cmp = compareNaiveVsSmartSlices(tightEp, "line-webtoon-global");
    assertLosslessMonotonicCoverage(cmp.smart);
    expect(cmp.naive.criticalCutCount).toBe(1);
    expect(cmp.smart.criticalCutCount).toBe(0);
    expect(cmp.smart.cutPositionsY).toEqual([1000]);
  });
});

describe("Wave 138 — 단순 고정 분할 vs DP 절단 제로 최적화 증명", () => {
  it("T14: LINE WEBTOON(800x1280px)에서 고정 분할 치명 절단을 DP가 0건으로 완전 차단한다", () => {
    const cmp = compareNaiveVsSmartSlices(createRealisticHeroEpisode(), "line-webtoon-global");
    expect(cmp.naive.criticalCutCount).toBeGreaterThanOrEqual(5);
    expect(cmp.naive.faceCutCount).toBeGreaterThanOrEqual(2);
    expect(cmp.naive.balloonCutCount).toBeGreaterThanOrEqual(2);
    expect(cmp.smart.criticalCutCount).toBe(0);
    expect(cmp.smart.faceCutCount).toBe(0);
    expect(cmp.smart.balloonCutCount).toBe(0);
    expect(cmp.smart.sfxCutCount).toBe(0);
    expect(cmp.improvedZeroCriticalCuts).toBe(true);
    expect(cmp.preventedCriticalCuts).toBe(cmp.naive.criticalCutCount);
    expect(cmp.smart.auditGrade).toBe("PASS");
  });

  it("T15: 네이버웹툰 한국(800x1600px)에서 얼굴·말풍선 절단을 DP가 0건으로 차단한다", () => {
    const cmp = compareNaiveVsSmartSlices(createRealisticHeroEpisode(), "naver-webtoon-kr");
    expect(cmp.naive.criticalCutCount).toBeGreaterThanOrEqual(4);
    expect(cmp.smart.criticalCutCount).toBe(0);
    expect(cmp.improvedZeroCriticalCuts).toBe(true);
    expect(cmp.smart.auditGrade).toBe("PASS");
  });

  it("T16: 카카오페이지(720x1440px)와 픽코마(760x1500px)에서도 DP가 얼굴·말풍선 절단 0건을 달성한다", () => {
    const ep = createRealisticHeroEpisode();
    const kakao = compareNaiveVsSmartSlices(ep, "kakao-page-kr");
    const piccoma = compareNaiveVsSmartSlices(ep, "piccoma-jp");

    expect(kakao.smart.criticalCutCount).toBe(0);
    expect(piccoma.smart.criticalCutCount).toBe(0);
    expect(kakao.smart.auditGrade).toBe("PASS");
    expect(piccoma.smart.auditGrade).toBe("PASS");
  });

  it("T17: 스튜디오 HD 아카이브(1600x3200px)에서 1:1 마스터 해상도 치명 절단을 0건으로 차단한다", () => {
    const cmp = compareNaiveVsSmartSlices(createRealisticHeroEpisode(), "studio-hd-archive");
    expect(cmp.naive.criticalCutCount).toBeGreaterThanOrEqual(3);
    expect(cmp.smart.criticalCutCount).toBe(0);
    expect(cmp.improvedZeroCriticalCuts).toBe(true);
  });

  it("T18: 얼굴 인접 구간에 여백 안전대가 있으면 얼굴 경계가 아닌 여백 밴드 중앙 부근에서 절단한다", () => {
    const ep: VerticalManuscriptInput = {
      episodeId: "gutter-center",
      episodeTitleKo: "여백 중앙 정렬 검증",
      masterWidthPx: 800,
      masterHeightPx: 2200,
      protectedSpans: [
        { id: "face-top", kind: "character-face", startY: 500, endY: 960, labelKo: "상단 얼굴" },
        { id: "gutter-mid", kind: "gutter-safe-band", startY: 1000, endY: 1200, labelKo: "넓은 여백" },
        { id: "balloon-bot", kind: "dialogue-balloon", startY: 1260, endY: 1620, labelKo: "하단 말풍선" },
      ],
    };
    const plan = compileSmartPlatformSlices(ep, "line-webtoon-global");
    assertLosslessMonotonicCoverage(plan);
    expect(plan.criticalCutCount).toBe(0);
    expect(plan.gutterAlignedCutCount).toBe(1);
    expect(plan.cutPositionsY).toHaveLength(1);
    expect(plan.cutPositionsY[0]).toBeGreaterThanOrEqual(1050);
    expect(plan.cutPositionsY[0]).toBeLessThanOrEqual(1150);
  });

  it("T19: 명시적 여백 밴드 없이 행 에너지 프로파일만 주어져도 최저 에너지 골짜기를 선택한다", () => {
    const height = 2200;
    const energy: number[] = [];
    for (let y = 0; y < height; y += 1) {
      // y=1040..1080 구간만 극저에너지 골짜기(0.02), 나머지는 고에너지(0.88)
      energy.push(y >= 1040 && y <= 1080 ? 0.02 : 0.88);
    }
    const plan = compileSmartPlatformSlices(
      {
        episodeId: "energy-valley",
        episodeTitleKo: "저에너지 골짜기 탐색",
        masterWidthPx: 800,
        masterHeightPx: height,
        protectedSpans: [],
        rowVisualEnergy: energy,
      },
      "line-webtoon-global",
    );
    assertLosslessMonotonicCoverage(plan);
    expect(plan.cutPositionsY).toHaveLength(1);
    expect(plan.cutPositionsY[0]).toBeGreaterThanOrEqual(1040);
    expect(plan.cutPositionsY[0]).toBeLessThanOrEqual(1080);
    expect(plan.slices[0].cutEnergyAtEnd).toBeLessThan(0.05);
  });

  it("T20: 얼굴과 컷 테두리가 겹쳐 하나를 선택해야 할 때 얼굴을 지키고 컷 테두리 쪽으로 우회한다", () => {
    const ep: VerticalManuscriptInput = {
      episodeId: "priority-overlap",
      episodeTitleKo: "우선순위 우회 테스트",
      masterWidthPx: 800,
      masterHeightPx: 2000,
      protectedSpans: [
        { id: "face-hero", kind: "character-face", startY: 200, endY: 1100, labelKo: "대형 클로즈업", priority: 5 },
        { id: "seam-overlap", kind: "panel-border-seam", startY: 950, endY: 1850, labelKo: "사선 컷 테두리", priority: 2 },
      ],
    };
    const plan = compileSmartPlatformSlices(ep, "line-webtoon-global");
    assertLosslessMonotonicCoverage(plan);
    expect(plan.faceCutCount).toBe(0);
    expect(plan.criticalCutCount).toBe(0);
    expect(plan.cutPositionsY[0]).toBeGreaterThanOrEqual(1100);
  });

  it("T21: 끝부분 초박형 자투리 슬라이스를 방지하기 위해 직전 여백 절단선을 균형 조정한다", () => {
    const ep: VerticalManuscriptInput = {
      episodeId: "anti-sliver",
      episodeTitleKo: "자투리 슬라이스 억제",
      masterWidthPx: 800,
      masterHeightPx: 1320, // 고정 1280 분할 시 마지막 40px 자투리 발생
      protectedSpans: [
        { id: "gutter-early", kind: "gutter-safe-band", startY: 620, endY: 700, labelKo: "중앙 여백" },
        { id: "gutter-late", kind: "gutter-safe-band", startY: 1240, endY: 1275, labelKo: "말단 좁은 여백" },
      ],
    };
    const naive = planNaiveFixedHeightSlices(ep, "line-webtoon-global");
    const smart = compileSmartPlatformSlices(ep, "line-webtoon-global");
    assertLosslessMonotonicCoverage(smart);
    expect(naive.slices[naive.slices.length - 1].heightPx).toBe(40);
    expect(smart.slices[smart.slices.length - 1].heightPx).toBeGreaterThanOrEqual(500);
  });

  it("T22: compareNaiveVsSmartSlices가 절감 지표와 자연스러운 한국어 요약 문장을 산출한다", () => {
    const cmp = compareNaiveVsSmartSlices(createRealisticHeroEpisode(), "line-webtoon-global");
    expect(cmp.preventedFaceCuts).toBeGreaterThan(0);
    expect(cmp.preventedBalloonCuts).toBeGreaterThan(0);
    expect(cmp.cutEnergyReductionRatio).toBeGreaterThan(0.5);
    expect(cmp.gutterAlignmentGainCount).toBeGreaterThan(0);
    expect(cmp.summaryKo).toContain("LINE WEBTOON");
    expect(cmp.summaryKo).toContain("0건");
  });
});

describe("Wave 138 — 초대형 스플래시(maxHeight 초과) 예외 처리", () => {
  function createOversizedSplashEpisode(): VerticalManuscriptInput {
    const height = 3400;
    const energy: number[] = [];
    for (let y = 0; y < height; y += 1) {
      // 초대형 스플래시 [150, 3250] 내부의 두 저에너지 안개 띠(1120, 2240)
      const inQuietBand1 = y >= 1116 && y <= 1124;
      const inQuietBand2 = y >= 2236 && y <= 2244;
      energy.push(inQuietBand1 || inQuietBand2 ? 0.015 : 0.91);
    }
    return {
      episodeId: "oversized-splash",
      episodeTitleKo: "초대형 성곽 낙하 스플래시",
      masterWidthPx: 800,
      masterHeightPx: height,
      protectedSpans: [
        {
          id: "splash-hero",
          kind: "character-face",
          startY: 150,
          endY: 3250,
          labelKo: "3100px 전신 스플래시",
          priority: 5,
        },
      ],
      rowVisualEnergy: energy,
    };
  }

  it("T23: maxSliceHeightPx를 초과하는 초대형 스플래시에서도 모든 슬라이스가 상한 이하·무손실 커버를 지킨다", () => {
    const plan = compileSmartPlatformSlices(createOversizedSplashEpisode(), "line-webtoon-global");
    assertLosslessMonotonicCoverage(plan);
    expect(plan.slices.length).toBe(3);
  });

  it("T24: 초대형 스플래시 내부의 불가피한 절단에서 최저 시각 에너지 행을 선택하고 경고를 발령한다", () => {
    const plan = compileSmartPlatformSlices(createOversizedSplashEpisode(), "line-webtoon-global");
    expect(plan.forcedOversizedCutCount).toBeGreaterThanOrEqual(2);
    expect(plan.avoidableCriticalCutCount).toBe(0);
    for (let i = 0; i < plan.cutPositionsY.length; i += 1) {
      const cutY = plan.cutPositionsY[i];
      const nearBand1 = Math.abs(cutY - 1120) <= 6;
      const nearBand2 = Math.abs(cutY - 2240) <= 6;
      expect(nearBand1 || nearBand2).toBe(true);
      expect(plan.slices[i].cutEnergyAtEnd).toBeLessThan(0.05);
      expect(plan.slices[i].forcedOversizedCut).toBe(true);
    }
  });

  it("T25: 초대형 스플래시 단독 예외는 FAIL 대신 WARN 등급과 명확한 한국어 경고로 분류된다", () => {
    const plan = compileSmartPlatformSlices(createOversizedSplashEpisode(), "line-webtoon-global");
    expect(plan.auditGrade).toBe("WARN");
    expect(plan.warningsKo.some((w) => w.includes("초대형 스플래시"))).toBe(true);
  });
});

describe("Wave 138 — 플랫폼 바이트 예산 · 품질 계단 자동 조정 · 파일 수 상한", () => {
  it("T26: 표준 복잡도 회차에서는 최고 품질(92)을 유지하며 품질 하향 0건으로 PASS한다", () => {
    const plan = compileSmartPlatformSlices(createRealisticHeroEpisode(), "naver-webtoon-kr");
    expect(plan.budget.qualityStepDownCount).toBe(0);
    expect(plan.budget.lowestSelectedQuality).toBe(92);
    expect(plan.budget.exceedsAnySliceByteLimit).toBe(false);
    expect(plan.budget.exceedsTotalByteLimit).toBe(false);
    expect(plan.auditGrade).toBe("PASS");
  });

  it("T27: 슬라이스당 바이트 예산 초과 시 품질 계단(92→88→84→78)을 자동 하향해 예산을 맞춘다", () => {
    const base = getPlatformSlicePreset("naver-webtoon-kr");
    const tightSlicePreset: PlatformSlicePreset = {
      ...base,
      maxBytesPerSlice: 220_000,
    };
    const ep: VerticalManuscriptInput = {
      ...createRealisticHeroEpisode(),
      averageColorComplexity: 1.5,
    };
    const plan = compileSmartPlatformSlices(ep, tightSlicePreset);
    expect(plan.budget.qualityStepDownCount).toBeGreaterThan(0);
    expect(plan.budget.lowestSelectedQuality).toBeLessThan(92);
    expect(plan.budget.exceedsAnySliceByteLimit).toBe(false);
    expect(plan.auditGrade).toBe("WARN");
  });

  it("T28: 회차 총 용량 예산 초과 시 가장 무거운 슬라이스부터 단계적으로 품질 계단을 하향한다", () => {
    const base = getPlatformSlicePreset("line-webtoon-global");
    const baselinePlan = compileSmartPlatformSlices(createRealisticHeroEpisode(), base);
    // 기준 총 용량의 72%를 상한으로 설정해 부분 품질 하향으로 수렴 유도
    const tightEpisodePreset: PlatformSlicePreset = {
      ...base,
      maxTotalEpisodeBytes: Math.round(baselinePlan.budget.totalEstimatedBytes * 0.72),
    };
    const adjusted = compileSmartPlatformSlices(createRealisticHeroEpisode(), tightEpisodePreset);
    expect(adjusted.budget.qualityStepDownCount).toBeGreaterThan(0);
    expect(adjusted.budget.totalEstimatedBytes).toBeLessThanOrEqual(
      tightEpisodePreset.maxTotalEpisodeBytes,
    );
    expect(adjusted.budget.exceedsTotalByteLimit).toBe(false);
    expect(adjusted.auditGrade).toBe("WARN");
  });

  it("T29: 최저 품질(78)로도 용량 예산을 맞추지 못하면 초과 경보와 함께 FAIL을 반환한다", () => {
    const base = getPlatformSlicePreset("piccoma-jp");
    const impossibleBudget: PlatformSlicePreset = {
      ...base,
      maxBytesPerSlice: 25_000,
      maxTotalEpisodeBytes: 120_000,
    };
    const plan = compileSmartPlatformSlices(createRealisticHeroEpisode(), impossibleBudget);
    expect(plan.budget.lowestSelectedQuality).toBe(78);
    expect(plan.budget.exceedsAnySliceByteLimit).toBe(true);
    expect(plan.budget.exceedsTotalByteLimit).toBe(true);
    expect(plan.budget.budgetWarningsKo.length).toBeGreaterThanOrEqual(2);
    expect(plan.auditGrade).toBe("FAIL");
  });

  it("T30: 분할 파일 수가 플랫폼 maxSliceCount를 초과하면 exceedsSliceCountLimit 및 FAIL을 발령한다", () => {
    const base = getPlatformSlicePreset("naver-webtoon-kr");
    const cappedCountPreset: PlatformSlicePreset = {
      ...base,
      maxSliceCount: 4,
    };
    const plan = compileSmartPlatformSlices(createRealisticHeroEpisode(), cappedCountPreset);
    expect(plan.slices.length).toBeGreaterThan(4);
    expect(plan.budget.exceedsSliceCountLimit).toBe(true);
    expect(plan.auditGrade).toBe("FAIL");
  });

  it("T31: 허용 포맷 내 formatOverride(webp vs jpeg)가 반영되고 webp 총 용량이 더 작다", () => {
    const ep = createRealisticHeroEpisode();
    const kakaoJpeg = compileSmartPlatformSlices(ep, "kakao-page-kr", { formatOverride: "jpeg" });
    const kakaoWebp = compileSmartPlatformSlices(ep, "kakao-page-kr", { formatOverride: "webp" });

    expect(kakaoJpeg.slices[0].format).toBe("jpeg");
    expect(kakaoJpeg.slices[0].fileName.endsWith(".jpg")).toBe(true);
    expect(kakaoWebp.slices[0].format).toBe("webp");
    expect(kakaoWebp.slices[0].fileName.endsWith(".webp")).toBe(true);
    expect(kakaoWebp.budget.totalEstimatedBytes).toBeLessThan(kakaoJpeg.budget.totalEstimatedBytes);
  });
});

describe("Wave 138 — 멀티 플랫폼 일괄 번들 및 FIPS 180-4 SHA-256 결정론", () => {
  it("T32: 순수 ES2017 동기 FIPS 180-4 SHA-256이 공식 테스트 벡터와 UTF-8 한글을 정확히 해시한다", () => {
    expect(sha256HexSync("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256HexSync("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256HexSync("툰스튜디오 멀티 플랫폼 스마트 슬라이스")).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalJsonStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("T33: compileMultiPlatformSliceBundle이 5종 플랫폼을 일괄 컴파일하고 집계 지표를 정확히 합산한다", () => {
    const bundle = compileMultiPlatformSliceBundle(createRealisticHeroEpisode(), {
      generatedAtIso: "2026-11-28",
    });
    expect(bundle.platformIds).toEqual(PLATFORM_SLICE_PRESET_IDS);
    expect(bundle.aggregate.totalPlatformCount).toBe(5);
    expect(bundle.aggregate.passCount).toBe(5);
    expect(bundle.aggregate.failCount).toBe(0);
    expect(bundle.aggregate.totalNaiveCriticalCuts).toBeGreaterThanOrEqual(12);
    expect(bundle.aggregate.totalSmartCriticalCuts).toBe(0);
    expect(bundle.aggregate.totalPreventedCriticalCuts).toBe(
      bundle.aggregate.totalNaiveCriticalCuts,
    );
    expect(bundle.aggregate.overallGrade).toBe("PASS");
    expect(bundle.manifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("T34: 동일 원고·옵션으로 2회 컴파일하면 매니페스트 JSON과 SHA-256 지문이 완전히 일치한다", () => {
    const ep = createRealisticHeroEpisode();
    const first = compileMultiPlatformSliceBundle(ep, { generatedAtIso: "2026-11-28" });
    const second = compileMultiPlatformSliceBundle(ep, { generatedAtIso: "2026-11-28" });
    expect(first.manifestCanonicalJson).toBe(second.manifestCanonicalJson);
    expect(first.manifestSha256Hex).toBe(second.manifestSha256Hex);
  });

  it("T35: 보호 영역 미세 변경 또는 플랫폼 부분 집합 변경 시 SHA-256 지문이 즉시 변경된다", () => {
    const baseEp = createRealisticHeroEpisode();
    const modifiedEp: VerticalManuscriptInput = {
      ...baseEp,
      episodeTitleKo: "42화 새벽 검격과 침묵 (수정본)",
    };
    const b1 = compileMultiPlatformSliceBundle(baseEp);
    const b2 = compileMultiPlatformSliceBundle(modifiedEp);
    const bSubset = compileMultiPlatformSliceBundle(baseEp, {
      platformIds: ["naver-webtoon-kr", "line-webtoon-global"],
    });
    expect(b1.manifestSha256Hex).not.toBe(b2.manifestSha256Hex);
    expect(b1.manifestSha256Hex).not.toBe(bSubset.manifestSha256Hex);
    expect(bSubset.platformIds).toEqual(["naver-webtoon-kr", "line-webtoon-global"]);
  });
});

describe("Wave 138 — 순수 OKLCH 검수 지도 SVG · XSS 이스케이프 · 한국어 QA 브리프", () => {
  it("T36: 검수 지도 SVG가 순수 oklch(...) 색상만 사용하고 원시 hex/rgb/hsl이 0건이다", () => {
    const bundle = compileMultiPlatformSliceBundle(createRealisticHeroEpisode(), {
      generatedAtIso: "2026-11-28",
    });
    const lineCmp = bundle.comparisonsByPlatform["line-webtoon-global"];
    expect(lineCmp).toBeDefined();
    if (lineCmp === undefined) return;
    const svg = renderSmartSliceComparisonSvg(lineCmp, { bundle });
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).toContain("단순 고정 높이 분할");
    expect(svg).toContain("DP 스마트 절단 제로 리패킹");
    expect(svg).toContain("위험 절단");
    expect(svg).toContain("네이버웹툰 한국");
    expect(svg).toContain("LINE WEBTOON 글로벌");
    expect(svg).toContain(bundle.manifestSha256Hex.slice(0, 16));
    expect(new RegExp("#[0-9a-fA-F]{3,8}\\b").test(svg)).toBe(false);
    expect(new RegExp("\\brgba?\\s*\\(", "i").test(svg)).toBe(false);
    expect(new RegExp("\\bhsla?\\s*\\(", "i").test(svg)).toBe(false);
  });

  it("T37: 제목·보호 영역 라벨의 XML/XSS 페이로드를 빠짐없이 이스케이프한다", () => {
    const payload = `<script>alert("xss")</script> & 'danger'`;
    expect(escapeSliceSvgXml(payload)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;danger&apos;",
    );
    const ep: VerticalManuscriptInput = {
      episodeId: "xss-check",
      episodeTitleKo: payload,
      masterWidthPx: 800,
      masterHeightPx: 2600,
      protectedSpans: [
        { id: "xss-face", kind: "character-face", startY: 1120, endY: 1440, labelKo: payload },
        { id: "safe-g", kind: "gutter-safe-band", startY: 960, endY: 1080 },
      ],
    };
    const svg = renderSmartSliceComparisonSvg(compareNaiveVsSmartSlices(ep, "line-webtoon-global"));
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  it("T38: 한국어 출고 검수 요약 브리프가 번역투 없이 전 플랫폼 수치와 SHA-256을 보고한다", () => {
    const bundle = compileMultiPlatformSliceBundle(createRealisticHeroEpisode(), {
      generatedAtIso: "2026-11-28",
    });
    const brief = summarizeMultiPlatformSliceAuditKo(bundle, { generatedDateIso: "2026-11-28" });
    expect(brief).toContain("42화 새벽 검격과 침묵");
    expect(brief).toContain("전 플랫폼 출고 적합");
    expect(brief).toContain("네이버웹툰 한국");
    expect(brief).toContain("카카오페이지 · 카카오웹툰");
    expect(brief).toContain("LINE WEBTOON 글로벌");
    expect(brief).toContain("픽코마 일본 스마툰");
    expect(brief).toContain("스튜디오 마스터 HD 아카이브");
    expect(brief).toContain(bundle.manifestSha256Hex);
    expect(brief).not.toContain("하는 것을 가능하게 합니다");
    expect(brief).not.toContain("원활한 워크플로우를 보장합니다");
    expect(brief).not.toContain("직관적인 경험을 제공합니다");
  });
});
