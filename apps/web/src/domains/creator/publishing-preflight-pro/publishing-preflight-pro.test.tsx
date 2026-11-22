// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionSurfaceHeader } from "../production-hub/ProductionSurfaceHeader";
import { createProductionDemoProject } from "../production-hub/production-demo";

import {
  applyPreflightAutoFix,
  createDefaultPreflightEpisode,
  getPlatformPublishingSpec,
  PLATFORM_PUBLISHING_SPECS,
  runMultiFormatReflow,
  runPlatformPreflightPackage,
  type EpisodeCutInput,
  type PublishingPlatformId,
} from "./platform-preflight-reflow-engine";
import {
  analyzeReaderRetentionHeatmap,
  computeOklchDeltaE,
  createDefaultOutsourceSubmission,
  evaluateCrashGuardState,
  evaluateOutsourceSampleSubmission,
  issueOutsourceSampleTest,
} from "./reader-oom-sample-guard-engine";
import { StudioPublishingPreflightPanel } from "./StudioPublishingPreflightPanel";

afterEach(cleanup);

function buildCustomCut(overrides: Partial<EpisodeCutInput> = {}): EpisodeCutInput {
  return {
    cutId: "cut-test-01",
    order: 1,
    widthPx: 800,
    heightPx: 1200,
    estimatedBytes: 260_000,
    format: "jpg",
    colorProfile: "sRGB",
    dpi: 72,
    balloons: [
      {
        id: "b-1",
        text: "오늘 밤 마지막 편지가 도착했다.",
        x: 90,
        y: 120,
        width: 280,
        height: 96,
      },
    ],
    emotionIntensity: 68,
    actionIntensity: 55,
    blankGapBelowPx: 120,
    ...overrides,
  };
}

describe("1. 6대 연재 플랫폼 프리플라이트 & 자동 규격 패키저", () => {
  it("6대 플랫폼 단일 정본 규격이 모두 정의되어 있다", () => {
    const ids = PLATFORM_PUBLISHING_SPECS.map((s) => s.id);
    expect(ids).toEqual([
      "naver-webtoon",
      "kakaopage",
      "lezhin",
      "ridi",
      "piccoma",
      "webtoon-global",
    ]);
    expect(getPlatformPublishingSpec("naver-webtoon").allowedWidthsPx).toEqual([690, 800]);
    expect(getPlatformPublishingSpec("naver-webtoon").maxFileSizeMb).toBe(2);
    expect(getPlatformPublishingSpec("naver-webtoon").maxEpisodeTotalMb).toBe(20);
    expect(getPlatformPublishingSpec("kakaopage").allowedWidthsPx).toEqual([720]);
    expect(getPlatformPublishingSpec("kakaopage").maxFileSizeMb).toBe(3);
    expect(getPlatformPublishingSpec("lezhin").requiredColorProfile).toBe("sRGB");
    expect(getPlatformPublishingSpec("ridi").allowedWidthsPx).toEqual([720, 800]);
    expect(getPlatformPublishingSpec("piccoma").writingDirection).toBe("vertical-jp");
    expect(getPlatformPublishingSpec("webtoon-global").maxSliceHeightPx).toBe(1280);
  });

  it("네이버 2000px 및 웹툰 글로벌 1280px 초과 높이를 자동 분할한다", () => {
    const tallCut = buildCustomCut({ heightPx: 3000 });
    const naver = runPlatformPreflightPackage({
      episodeId: "ep-1",
      seriesTitle: "테스트작",
      episodeNumber: 1,
      platformId: "naver-webtoon",
      cuts: [tallCut],
    });
    const global = runPlatformPreflightPackage({
      episodeId: "ep-1",
      seriesTitle: "테스트작",
      episodeNumber: 1,
      platformId: "webtoon-global",
      cuts: [tallCut],
    });
    expect(naver.slicePlan.length).toBe(2);
    expect(naver.slicePlan.every((s) => s.sliceHeightPx <= 2000)).toBe(true);
    expect(global.slicePlan.length).toBe(3);
    expect(global.slicePlan.every((s) => s.sliceHeightPx <= 1280)).toBe(true);
  });

  it("분할 경계가 말풍선을 가로지를 때 말풍선 위 안전 여백으로 분할선을 이동한다", () => {
    const cut = buildCustomCut({
      heightPx: 2600,
      balloons: [{ id: "b-seam", text: "경계선 위 대사", x: 120, y: 1940, width: 240, height: 140 }],
    });
    const result = runPlatformPreflightPackage({
      episodeId: "ep-seam",
      seriesTitle: "테스트작",
      episodeNumber: 2,
      platformId: "naver-webtoon",
      cuts: [cut],
    });
    expect(result.slicePlan[0]!.seamAvoidedBalloon).toBe(true);
    expect(result.slicePlan[0]!.endY).toBeLessThan(1940);
  });

  it("파일당 2MB 초과 및 회차 총 20MB 초과 시 압축 품질·용량 절감 목표를 산출한다", () => {
    const heavyCuts = Array.from({ length: 12 }, (_, idx) =>
      buildCustomCut({
        cutId: `heavy-${idx + 1}`,
        order: idx + 1,
        estimatedBytes: 2_600_000,
        dpi: 300,
      }),
    );
    const result = runPlatformPreflightPackage({
      episodeId: "ep-heavy",
      seriesTitle: "대용량작",
      episodeNumber: 3,
      platformId: "naver-webtoon",
      cuts: heavyCuts,
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.compressionPlan.oversizedSliceCount).toBe(12);
    expect(result.compressionPlan.requiresTotalSizeReduction).toBe(true);
    expect(result.compressionPlan.targetJpegQuality).toBeLessThan(86);
    expect(result.compressionPlan.projectedTotalBytes).toBeLessThan(result.compressionPlan.originalTotalBytes);
  });

  it("레진코믹스에서 Display-P3/CMYK 색공간과 미지원 포맷(webp)을 차단한다", () => {
    const cut = buildCustomCut({
      widthPx: 720,
      format: "webp",
      colorProfile: "CMYK",
    });
    const result = runPlatformPreflightPackage({
      episodeId: "ep-lezhin",
      seriesTitle: "컬러작",
      episodeNumber: 4,
      platformId: "lezhin",
      cuts: [cut],
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.compressionPlan.requiresSrgbConversion).toBe(true);
    expect(result.issues.some((i) => i.code === "COLOR_PROFILE_NON_SRGB" && i.severity === "error")).toBe(true);
    expect(result.issues.some((i) => i.code === "FORMAT_UNSUPPORTED")).toBe(true);
  });

  it("말풍선 좌우 32px 안전 여백 침범과 픽코마 일본 세로쓰기 상하 48px 여백 침범을 검출한다", () => {
    const cut = buildCustomCut({
      widthPx: 690,
      heightPx: 1000,
      balloons: [
        { id: "b-left", text: "좌측 침범", x: 12, y: 200, width: 200, height: 80 },
        { id: "b-right", text: "우측 침범", x: 480, y: 200, width: 200, height: 80 },
        { id: "b-top-jp", text: "세로 상단 침범", x: 200, y: 18, width: 120, height: 220, isVerticalText: true },
      ],
    });
    const piccoma = runPlatformPreflightPackage({
      episodeId: "ep-jp",
      seriesTitle: "도쿄작",
      episodeNumber: 5,
      platformId: "piccoma",
      cuts: [cut],
    });
    const edges = piccoma.marginViolations.map((v) => v.edge);
    expect(edges).toContain("left");
    expect(edges).toContain("right");
    expect(edges).toContain("top-vertical-jp");
  });

  it("임시대사·금지어·한글 오타 및 사용자 정의 금지어를 검출한다", () => {
    const cut = buildCustomCut({
      balloons: [
        { id: "b-t1", text: "임시대사 몇일 뒤에 어떻해 될지 스포금지어", x: 80, y: 120, width: 300, height: 100 },
      ],
    });
    const result = runPlatformPreflightPackage({
      episodeId: "ep-text",
      seriesTitle: "대사검수작",
      episodeNumber: 6,
      platformId: "ridi",
      cuts: [cut],
      customForbiddenWords: ["스포금지어"],
    });
    const terms = result.textFlags.map((f) => f.matchedTerm);
    expect(terms).toContain("임시대사");
    expect(terms).toContain("몇일");
    expect(terms).toContain("어떻해");
    expect(terms).toContain("스포금지어");
  });

  it("납품 매니페스트 JSON과 결정론적 fingerprint를 생성한다", () => {
    const cuts = [buildCustomCut()];
    const first = runPlatformPreflightPackage({
      episodeId: "ep-det",
      seriesTitle: "결정론작",
      episodeNumber: 7,
      platformId: "naver-webtoon",
      cuts,
    });
    const second = runPlatformPreflightPackage({
      episodeId: "ep-det",
      seriesTitle: "결정론작",
      episodeNumber: 7,
      platformId: "naver-webtoon",
      cuts,
    });
    expect(first.manifest.schemaVersion).toBe("toonstudio.delivery-manifest.v1");
    expect(first.manifest.fingerprint).toBe(second.manifest.fingerprint);
    expect(JSON.parse(first.manifestJson).platformId).toBe("naver-webtoon");
  });

  it("자동 교정(applyPreflightAutoFix)을 적용하면 6대 플랫폼 모두 READY 상태가 된다", () => {
    const rawEpisode = createDefaultPreflightEpisode(60);
    const allPlatforms: readonly PublishingPlatformId[] = [
      "naver-webtoon",
      "kakaopage",
      "lezhin",
      "ridi",
      "piccoma",
      "webtoon-global",
    ];
    for (const platformId of allPlatforms) {
      const fixedCuts = applyPreflightAutoFix(rawEpisode, platformId);
      const checked = runPlatformPreflightPackage({
        episodeId: `ep-fix-${platformId}`,
        seriesTitle: "교정작",
        episodeNumber: 12,
        platformId,
        cuts: fixedCuts,
      });
      expect(checked.status).toBe("READY");
      expect(checked.marginViolations).toHaveLength(0);
      expect(checked.textFlags).toHaveLength(0);
    }
  });
});

describe("2. 원소스 멀티포맷 자동 리플로우 엔진", () => {
  it("세로 60컷을 일본 단행본 B6 가로 페이지(4~6컷/페이지, 제본 18mm)로 100% 컷 보존 변환한다", () => {
    const cuts = createDefaultPreflightEpisode(60);
    const reflow = runMultiFormatReflow("ep-60", cuts);

    expect(reflow.bookB6.preservedCutCount).toBe(60);
    expect(reflow.bookB6.sourceCutCount).toBe(60);
    expect(reflow.bookB6.readingDirection).toBe("RTL");
    expect(reflow.bookB6.minCutsPerPage).toBeGreaterThanOrEqual(4);
    expect(reflow.bookB6.maxCutsPerPage).toBeLessThanOrEqual(6);
    expect(reflow.bookB6.pages[0]!.innerBindingMarginMm).toBe(18);

    const flatCutIds = reflow.bookB6.pages.flatMap((p) => p.panels.map((panel) => panel.cutId));
    expect(new Set(flatCutIds).size).toBe(60);
    expect(flatCutIds).toEqual(cuts.map((c) => c.cutId));
  });

  it("쇼츠·릴스·틱톡 9:16 30초 모션 예고편에 핵심 8컷 × 3.75초와 줌/팬 키프레임을 생성한다", () => {
    const cuts = createDefaultPreflightEpisode(60);
    const reflow = runMultiFormatReflow("ep-60", cuts);

    expect(reflow.shortsTrailer.aspectRatio).toBe("9:16");
    expect(reflow.shortsTrailer.totalDurationSec).toBe(30);
    expect(reflow.shortsTrailer.clipCount).toBe(8);
    expect(reflow.shortsTrailer.clips[0]!.durationSec).toBe(3.75);
    expect(reflow.shortsTrailer.clips[7]!.endTimeSec).toBe(30);
    // 선택된 8컷은 서사 시간순으로 정렬된다.
    for (let i = 1; i < reflow.shortsTrailer.clips.length; i += 1) {
      expect(reflow.shortsTrailer.clips[i]!.sourceCutOrder).toBeGreaterThan(
        reflow.shortsTrailer.clips[i - 1]!.sourceCutOrder,
      );
    }
    expect(reflow.shortsTrailer.clips.every((clip) => clip.endScale >= clip.startScale)).toBe(true);
  });

  it("SNS 홍보 1:1 카드뉴스 5장 하이라이트를 스토리 아크별로 생성한다", () => {
    const cuts = createDefaultPreflightEpisode(60);
    const reflow = runMultiFormatReflow("ep-60", cuts);

    expect(reflow.snsCardNews.aspectRatio).toBe("1:1");
    expect(reflow.snsCardNews.cardCount).toBe(5);
    expect(reflow.snsCardNews.cards[0]!.roleKo).toContain("후킹");
    expect(reflow.snsCardNews.cards[4]!.roleKo).toContain("CTA");
    expect(new Set(reflow.snsCardNews.cards.map((c) => c.sourceCutId)).size).toBe(5);
  });

  it("소규모 원고(3컷)에서도 리플로우가 컷 손실 없이 결정론적으로 동작한다", () => {
    const cuts = createDefaultPreflightEpisode(3);
    const a = runMultiFormatReflow("ep-3", cuts);
    const b = runMultiFormatReflow("ep-3", cuts);

    expect(a.bookB6.preservedCutCount).toBe(3);
    expect(a.shortsTrailer.clipCount).toBe(3);
    expect(a.shortsTrailer.totalDurationSec).toBe(30);
    expect(a.snsCardNews.cardCount).toBe(3);
    expect(a).toEqual(b);
  });
});

describe("3. 독자 시선·이탈 예측 히트맵 & 모바일 스크롤 호흡 시뮬레이터", () => {
  it("말풍선 글자 밀도가 높은 텍스트 벽 구간을 정확히 경고한다", () => {
    const textWallCut = buildCustomCut({
      balloons: [
        {
          id: "b-wall",
          text: "이 문장은 독자가 모바일 화면에서 한 번에 읽기 부담스러운 수준의 장문 설명 대사로 구성되어 있어서 시선 피로와 스크롤 이탈 확률을 급격하게 높이는 텍스트 벽 테스트 케이스입니다.",
          x: 80,
          y: 120,
          width: 320,
          height: 220,
        },
      ],
    });
    const analysis = analyzeReaderRetentionHeatmap([textWallCut], "right");
    expect(analysis.textWallCount).toBe(1);
    expect(analysis.heatmapSegments[0]!.isTextWall).toBe(true);
    expect(analysis.recommendations.some((r) => r.category === "text-wall")).toBe(true);
  });

  it("연속 빈 여백(지루함 구간)을 감지하고 스크롤 템포를 dragging으로 판정한다", () => {
    const boringCuts = [
      buildCustomCut({ cutId: "b1", order: 1, balloons: [], actionIntensity: 20, blankGapBelowPx: 720 }),
      buildCustomCut({ cutId: "b2", order: 2, balloons: [], actionIntensity: 25, blankGapBelowPx: 760 }),
    ];
    const analysis = analyzeReaderRetentionHeatmap(boringCuts, "right");
    expect(analysis.boredomGapCount).toBe(2);
    expect(analysis.scrollTempo).toBe("dragging");
    expect(analysis.recommendations.some((r) => r.category === "blank-gap")).toBe(true);
  });

  it("모바일 390×844 하단 우측·좌측 엄지 가림 영역 침범률을 구분해 계산한다", () => {
    const rightOccluded = buildCustomCut({
      cutId: "thumb-r",
      order: 1,
      widthPx: 800,
      heightPx: 1000,
      balloons: [{ id: "br", text: "오른손 엄지 영역 대사", x: 470, y: 740, width: 260, height: 150 }],
    });
    const leftOccluded = buildCustomCut({
      cutId: "thumb-l",
      order: 2,
      widthPx: 800,
      heightPx: 1000,
      balloons: [{ id: "bl", text: "왼손 엄지 영역 대사", x: 40, y: 740, width: 260, height: 150 }],
    });
    const rightMode = analyzeReaderRetentionHeatmap([rightOccluded, leftOccluded], "right");
    const leftMode = analyzeReaderRetentionHeatmap([rightOccluded, leftOccluded], "left");
    const bothMode = analyzeReaderRetentionHeatmap([rightOccluded, leftOccluded], "both");

    expect(rightMode.heatmapSegments[0]!.rightThumbOcclusionPct).toBeGreaterThan(40);
    expect(rightMode.heatmapSegments[0]!.leftThumbOcclusionPct).toBe(0);
    expect(leftMode.heatmapSegments[1]!.leftThumbOcclusionPct).toBeGreaterThan(40);
    expect(bothMode.thumbOccludedCutCount).toBe(2);
  });

  it("텍스트 벽·과도한 여백·엄지 가림이 없는 쾌적한 원고는 90점 이상 완독 점수를 받는다", () => {
    const cleanCuts = Array.from({ length: 10 }, (_, idx) =>
      buildCustomCut({ cutId: `clean-${idx + 1}`, order: idx + 1, isKeyBeat: idx % 3 === 0 }),
    );
    const analysis = analyzeReaderRetentionHeatmap(cleanCuts, "right");
    expect(analysis.completionScore).toBeGreaterThanOrEqual(90);
    expect(analysis.recommendations).toHaveLength(0);
  });
});

describe("4. 저사양 노트북·아이패드 OOM / WebGPU 컨텍스트 손실 크래시 가드", () => {
  it("메모리 사용률 78% 이하이고 GPU 정상이면 HEALTHY 상태를 유지한다", () => {
    const evalHealthy = evaluateCrashGuardState({
      episodeId: "ep-1",
      deviceClass: "ipad",
      usedHeapMb: 900,
      heapLimitMb: 1536,
      textureResolutionPx: 4096,
      activeCacheMb: 200,
      idleLayerCacheMb: 180,
      undoStackFrames: 25,
      activeCutCount: 60,
      webglContextLost: false,
      webgpuDeviceLost: false,
    });
    expect(evalHealthy.level).toBe("HEALTHY");
    expect(evalHealthy.emergencyCheckpoint).toBeNull();
    expect(evalHealthy.textureDownscale.applied).toBe(false);
    expect(evalHealthy.cacheReleasePlan).toHaveLength(0);
  });

  it("메모리 사용률 > 78%(경고)일 때 체크포인트 생성과 4K→2K 텍스처 다운스케일을 실행한다", () => {
    const evalWarn = evaluateCrashGuardState({
      episodeId: "ep-warn",
      deviceClass: "low-spec-laptop",
      usedHeapMb: 1680,
      heapLimitMb: 2048,
      textureResolutionPx: 4096,
      activeCacheMb: 300,
      idleLayerCacheMb: 260,
      undoStackFrames: 38,
      activeCutCount: 60,
      webglContextLost: false,
      webgpuDeviceLost: false,
    });
    expect(evalWarn.level).toBe("WARNING");
    expect(evalWarn.emergencyCheckpoint).not.toBeNull();
    expect(evalWarn.textureDownscale.fromPx).toBe(4096);
    expect(evalWarn.textureDownscale.toPx).toBe(2048);
    expect(evalWarn.estimatedFreedMb).toBeGreaterThan(200);
    expect(evalWarn.projectedUsagePercent).toBeLessThan(evalWarn.memoryUsagePercent);
  });

  it("메모리 사용률 > 88%(비상)일 때 즉시 체크포인트, 4K→1K 다운스케일, 캐시 해제 플랜을 가동한다", () => {
    const evalEmergency = evaluateCrashGuardState({
      episodeId: "ep-oom",
      deviceClass: "ipad",
      usedHeapMb: 1410,
      heapLimitMb: 1536,
      textureResolutionPx: 4096,
      activeCacheMb: 340,
      idleLayerCacheMb: 300,
      undoStackFrames: 45,
      activeCutCount: 60,
      webglContextLost: false,
      webgpuDeviceLost: false,
    });
    expect(evalEmergency.level).toBe("EMERGENCY");
    expect(evalEmergency.emergencyCheckpoint?.recoveryPriority).toBe("immediate");
    expect(evalEmergency.textureDownscale.toPx).toBe(1024);
    expect(evalEmergency.cacheReleasePlan.some((s) => s.stepId === "purge-idle-layers")).toBe(true);
    expect(evalEmergency.cacheReleasePlan.some((s) => s.stepId === "trim-undo-history")).toBe(true);
  });

  it("webglcontextlost 또는 WebGPU device.lost 발생 시 메모리 여유가 있어도 비상 보호를 가동한다", () => {
    const webglLost = evaluateCrashGuardState({
      episodeId: "ep-gl",
      deviceClass: "desktop",
      usedHeapMb: 1200,
      heapLimitMb: 4096,
      textureResolutionPx: 2048,
      activeCacheMb: 220,
      idleLayerCacheMb: 120,
      undoStackFrames: 30,
      activeCutCount: 40,
      webglContextLost: true,
      webgpuDeviceLost: false,
    });
    const webgpuLost = evaluateCrashGuardState({
      episodeId: "ep-gpu",
      deviceClass: "ipad",
      usedHeapMb: 600,
      heapLimitMb: 1536,
      textureResolutionPx: 2048,
      activeCacheMb: 180,
      idleLayerCacheMb: 90,
      undoStackFrames: 18,
      activeCutCount: 40,
      webglContextLost: false,
      webgpuDeviceLost: true,
    });
    expect(webglLost.level).toBe("EMERGENCY");
    expect(webglLost.textureDownscale.toPx).toBe(1024);
    expect(webglLost.cacheReleasePlan.some((s) => s.stepId === "recreate-gpu-pipeline")).toBe(true);
    expect(webgpuLost.level).toBe("EMERGENCY");
    expect(webgpuLost.gpuContextLost).toBe(true);
  });
});

describe("5. 신규 외주 10분 자동 3컷 샘플 테스트 검증기", () => {
  it("본편 유출 차단 정책과 워터마크가 적용된 10분 3컷 표준 샘플 패킷을 발급한다", () => {
    const packet = issueOutsourceSampleTest({ applicantName: "응우옌 프리랜서", region: "SEA" });
    expect(packet.mainEpisodeLeakProtected).toBe(true);
    expect(packet.expiresInMinutes).toBe(10);
    expect(packet.cuts).toHaveLength(3);
    expect(packet.watermarkToken).toMatch(/^WM-SAMPLE-/u);
  });

  it("OKLCH 색차(ΔE) 계산이 동일 색 0, 근접 색 소폭, 이질 색 고수치를 반환한다", () => {
    const base = { l: 0.72, c: 0.12, h: 240 };
    expect(computeOklchDeltaE(base, base)).toBe(0);
    expect(computeOklchDeltaE(base, { l: 0.73, c: 0.122, h: 242 })).toBeLessThan(2.5);
    expect(computeOklchDeltaE(base, { l: 0.52, c: 0.22, h: 300 })).toBeGreaterThan(15);
  });

  it("선폭·OKLCH 색차·10분 납기를 모두 충족하면 PASS(즉시 본편 투입)를 판정한다", () => {
    const packet = issueOutsourceSampleTest({ applicantName: "합격 지원자", region: "KR" });
    const submission = createDefaultOutsourceSubmission(packet, "pass");
    const result = evaluateOutsourceSampleSubmission(packet, submission);

    expect(result.verdict).toBe("PASS");
    expect(result.verdictLabelKo).toContain("즉시 본편 투입");
    expect(result.avgColorDeltaE).toBeLessThanOrEqual(3.5);
    expect(result.totalTurnaroundMinutes).toBeLessThanOrEqual(10);
  });

  it("소폭의 선폭/색차/납기 편차가 있으면 REVISE를 판정한다", () => {
    const packet = issueOutsourceSampleTest({ applicantName: "보완 지원자", region: "SEA" });
    const submission = createDefaultOutsourceSubmission(packet, "revise");
    const result = evaluateOutsourceSampleSubmission(packet, submission);

    expect(result.verdict).toBe("REVISE");
    expect(result.feedbackKo.length).toBeGreaterThan(0);
  });

  it("선폭·색차·납기가 크게 벗어나면 HOLD를 판정한다", () => {
    const packet = issueOutsourceSampleTest({ applicantName: "보류 지원자", region: "GLOBAL" });
    const submission = createDefaultOutsourceSubmission(packet, "hold");
    const result = evaluateOutsourceSampleSubmission(packet, submission);

    expect(result.verdict).toBe("HOLD");
    expect(result.totalScore).toBeLessThan(65);
  });
});

describe("6. StudioPublishingPreflightPanel UI 및 ProductionSurfaceHeader 지연 연결", () => {
  it("6대 플랫폼 전환, 자동 교정, 매니페스트 JSON 토글이 정상 동작한다", () => {
    render(<StudioPublishingPreflightPanel projectId="proj-1" seriesTitle="밤의 우편배달부" episodeNumber={12} />);

    expect(screen.getByTestId("ppf-panel-preflight")).toBeTruthy();
    const initialSlices = Number(screen.getByTestId("ppf-slice-count").textContent?.replace(/[^0-9]/gu, ""));

    fireEvent.click(screen.getByTestId("ppf-platform-webtoon-global"));
    const globalSlices = Number(screen.getByTestId("ppf-slice-count").textContent?.replace(/[^0-9]/gu, ""));
    expect(globalSlices).toBeGreaterThan(initialSlices);

    fireEvent.click(screen.getByTestId("ppf-toggle-autofix"));
    expect(screen.getByTestId("ppf-violation-summary").textContent).toContain("여백 0건 · 대사 0건");

    fireEvent.click(screen.getByTestId("ppf-toggle-manifest"));
    expect(screen.getByTestId("ppf-manifest-json").textContent).toContain("toonstudio.delivery-manifest.v1");
  });

  it("멀티포맷 리플로우 탭에서 B6·쇼츠 30초·카드뉴스 5장을 모두 표시한다", () => {
    render(<StudioPublishingPreflightPanel />);
    fireEvent.click(screen.getByTestId("ppf-tab-reflow"));

    expect(screen.getByTestId("ppf-reflow-b6").textContent).toContain("60/60컷 (100%)");
    expect(screen.getByTestId("ppf-reflow-shorts").textContent).toContain("8컷 · 30초");
    expect(screen.getByTestId("ppf-reflow-cardnews").textContent).toContain("5장 패키지");
  });

  it("독자 이탈 탭에서 엄지 기준 전환과 히트맵 세그먼트를 렌더링한다", () => {
    render(<StudioPublishingPreflightPanel />);
    fireEvent.click(screen.getByTestId("ppf-tab-reader"));

    expect(screen.getByTestId("ppf-heatmap-strip").children.length).toBe(60);
    expect(screen.getByTestId("ppf-text-wall-count").textContent).toContain("1개 컷");

    fireEvent.click(screen.getByTestId("ppf-hand-both"));
    expect(screen.getByTestId("ppf-hand-both").getAttribute("aria-pressed")).toBe("true");
  });

  it("OOM·GPU 크래시 가드 탭에서 메모리 프리셋과 컨텍스트 손실 시뮬레이션이 즉시 반영된다", () => {
    render(<StudioPublishingPreflightPanel />);
    fireEvent.click(screen.getByTestId("ppf-tab-crash-guard"));

    expect(screen.getByTestId("ppf-crash-level").textContent).toContain("메모리 경고");
    fireEvent.click(screen.getByTestId("ppf-mem-emergency"));
    expect(screen.getByTestId("ppf-crash-level").textContent).toContain("비상 보호 가동");
    expect(screen.getByTestId("ppf-texture-downscale").textContent).toContain("4K → 1K");

    fireEvent.click(screen.getByTestId("ppf-mem-healthy"));
    expect(screen.getByTestId("ppf-crash-level").textContent).toContain("안정 운용 중");

    fireEvent.click(screen.getByTestId("ppf-toggle-webgpu-lost"));
    expect(screen.getByTestId("ppf-crash-level").textContent).toContain("비상 보호 가동");
  });

  it("10분 외주 샘플 검증 탭에서 프리셋 전환(PASS/REVISE/HOLD)과 본편 격리 재발급이 동작한다", () => {
    render(<StudioPublishingPreflightPanel />);
    fireEvent.click(screen.getByTestId("ppf-tab-outsource"));

    expect(screen.getByTestId("ppf-outsource-verdict").textContent).toContain("PASS");
    expect(screen.getByTestId("ppf-leak-protection-note").textContent).toContain("본편 원고");

    const beforeToken = screen.getByTestId("ppf-issue-sample").textContent;
    fireEvent.click(screen.getByTestId("ppf-issue-sample"));
    expect(screen.getByTestId("ppf-issue-sample").textContent).not.toBe(beforeToken);

    fireEvent.click(screen.getByTestId("ppf-outsource-preset-revise"));
    expect(screen.getByTestId("ppf-outsource-verdict").textContent).toContain("REVISE");

    fireEvent.click(screen.getByTestId("ppf-outsource-preset-hold"));
    expect(screen.getByTestId("ppf-outsource-verdict").textContent).toContain("HOLD");
  });

  it("ProductionSurfaceHeader 접이식 disclosure를 열면 지연 로드된 출판 프리플라이트 패널이 마운트된다", async () => {
    const aggregate = createProductionDemoProject();
    render(
      <MemoryRouter>
        <ProductionSurfaceHeader aggregate={aggregate} surface="episodes" />
      </MemoryRouter>,
    );

    const disclosure = screen.getByTestId("studio-publishing-preflight-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-publishing-preflight-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-publishing-preflight-panel")).toBeTruthy();
    });
  });

  it("5대 통합 출판 프리셋 전환, Rights BOM CC0 일괄 대체, 1,280px 스마트 컷-세이프 슬라이서 UI가 정상 연동된다", () => {
    render(<StudioPublishingPreflightPanel projectId="proj-smart" seriesTitle="밤의 우편배달부" episodeNumber={12} />);

    expect(screen.getByTestId("ppf-smart-slice-rights-section")).toBeTruthy();
    expect(screen.getByTestId("ppf-rights-bom-status").textContent).toContain("차단 2건");
    expect(screen.getByTestId("ppf-five-preset-status").textContent).toContain("Rights BOM 차단");

    // 인쇄 PDF (CMYK) 및 SNS 9:16 숏폼 프리셋 전환 확인
    fireEvent.click(screen.getByTestId("ppf-five-preset-print-pdf-cmyk"));
    expect(screen.getByTestId("ppf-five-preset-summary").textContent).toContain("CMYK");
    expect(screen.getByTestId("ppf-five-preset-summary").textContent).toContain("300DPI");

    fireEvent.click(screen.getByTestId("ppf-five-preset-sns-shortform-9-16"));
    expect(screen.getByTestId("ppf-five-preset-summary").textContent).toContain("9:16");

    // Rights BOM CC0 일괄 대체 클릭 시 차단 해제 확인
    fireEvent.click(screen.getByTestId("ppf-rights-apply-cc0"));
    expect(screen.getByTestId("ppf-rights-bom-status").textContent).toContain("전체 통과");
    expect(screen.getByTestId("ppf-rights-substitution-log").textContent).toContain("CC0 치환 완료");

    // 1,280px 스마트 컷-세이프 슬라이서 요약 카드 확인
    expect(screen.getByTestId("ppf-smart-slicer-count").textContent).toContain("장 분할");
    expect(Number(screen.getByTestId("ppf-smart-gutter-snap").textContent?.replace(/[^0-9]/gu, ""))).toBeGreaterThan(0);
  });
});
