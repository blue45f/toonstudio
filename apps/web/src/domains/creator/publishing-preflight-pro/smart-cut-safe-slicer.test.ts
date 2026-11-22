import { describe, expect, it } from "vitest";

import {
  applyCc0AssetSubstitutions,
  CC0_REPLACEMENT_CATALOG,
  createDefaultPreflightEpisode,
  createDefaultPreflightRightsBom,
  evaluateRightsBomForPreflight,
  FIVE_PLATFORM_PREFLIGHT_PRESETS,
  getUnifiedPlatformPreflightPreset,
  planSmartCutSafeSlices,
  recommendCc0Replacement,
  runPlatformPreflightPackage,
  runUnifiedFivePlatformPreflight,
  SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX,
  type EpisodeCutInput,
  type PreflightRightsBomAsset,
} from "./platform-preflight-reflow-engine";
import { findSmartCutSafeSeam } from "./smart-cut-safe-slicer";

function makeCut(overrides: Partial<EpisodeCutInput> = {}): EpisodeCutInput {
  return {
    cutId: "cut-s1",
    order: 1,
    widthPx: 800,
    heightPx: 2600,
    estimatedBytes: 420_000,
    format: "jpg",
    colorProfile: "sRGB",
    dpi: 72,
    balloons: [],
    emotionIntensity: 60,
    actionIntensity: 55,
    blankGapBelowPx: 140,
    ...overrides,
  };
}

describe("1. 스마트 컷-세이프 슬라이서 (#095 — 1,280px · 말풍선/눈높이 보호 · 거터 에너지 최소선)", () => {
  it("1,280px 경계가 말풍선을 관통할 때 말풍선 위 안전 여백으로 이동한다", () => {
    const seam = findSmartCutSafeSeam({
      totalHeightPx: 2600,
      sliceStartY: 0,
      targetSliceHeightPx: 1280,
      maxSliceHeightPx: 1280,
      balloons: [{ id: "b-mid", topY: 1210, bottomY: 1360 }],
      eyeLevelBands: [],
    });

    expect(seam.avoidedBalloon).toBe(true);
    expect(seam.forcedCompromise).toBe(false);
    expect(seam.endY).toBeLessThanOrEqual(1210 - 16);
    expect(seam.endY).toBeLessThanOrEqual(1280);
  });

  it("1,280px 경계가 인물 눈높이 보호 밴드를 관통할 때 눈높이 밴드를 피해 분할한다", () => {
    const seam = findSmartCutSafeSeam({
      totalHeightPx: 2600,
      sliceStartY: 0,
      targetSliceHeightPx: 1280,
      maxSliceHeightPx: 1280,
      balloons: [],
      eyeLevelBands: [
        { id: "eye-lead", topY: 1200, bottomY: 1330, characterName: "주인공", priority: "lead" },
      ],
    });

    expect(seam.avoidedEyeLevel).toBe(true);
    expect(seam.forcedCompromise).toBe(false);
    expect(seam.reason).toBe("avoided-eye-level");
    expect(seam.endY).toBeLessThanOrEqual(1200 - 20);
  });

  it("말풍선과 눈높이 밴드가 모두 근처에 있어도 탐색 창 안의 여백(거터) 에너지 최소선으로 스냅한다", () => {
    // 0..2600 프로파일: 960..1040 구간에 깨끗한 흰 거터(에너지 0.01), 나머지는 작화 밀도 0.72
    const profile = Array.from({ length: 260 }, (_, idx) => {
      const y = idx * 10;
      return y >= 960 && y <= 1040 ? 0.01 : 0.72;
    });

    const seam = findSmartCutSafeSeam({
      totalHeightPx: 2600,
      sliceStartY: 0,
      targetSliceHeightPx: 1280,
      maxSliceHeightPx: 1280,
      balloons: [{ id: "b-1", topY: 1190, bottomY: 1310 }],
      eyeLevelBands: [{ id: "eye-1", topY: 1090, bottomY: 1170, characterName: "수연" }],
      rowEnergyProfile: profile,
    });

    expect(seam.snappedToGutter).toBe(true);
    expect(seam.forcedCompromise).toBe(false);
    expect(seam.endY).toBeGreaterThanOrEqual(960);
    expect(seam.endY).toBeLessThanOrEqual(1050);
    expect(seam.seamEnergy).toBeLessThan(0.1);
  });

  it("다중 컷 세로 스트립에서 컷 사이 거터(blankGapBelowPx) 최소선을 자동 탐색하며 100% 결정론적으로 분할한다", () => {
    const cuts: readonly EpisodeCutInput[] = [
      makeCut({
        cutId: "cut-001",
        order: 1,
        heightPx: 1020,
        blankGapBelowPx: 140,
        balloons: [{ id: "b1", text: "첫 컷 대사", x: 80, y: 160, width: 280, height: 96 }],
      }),
      makeCut({
        cutId: "cut-002",
        order: 2,
        heightPx: 1180,
        blankGapBelowPx: 160,
        eyeLevelBands: [{ id: "eye-2", topY: 60, bottomY: 220, characterName: "도윤", priority: "lead" }],
      }),
      makeCut({
        cutId: "cut-003",
        order: 3,
        heightPx: 980,
        blankGapBelowPx: 0,
      }),
    ];

    const first = planSmartCutSafeSlices(cuts, {
      targetSliceHeightPx: SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX,
    });
    const second = planSmartCutSafeSlices(cuts, {
      targetSliceHeightPx: SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX,
    });

    expect(first).toEqual(second);
    expect(first.slices.every((s) => s.heightPx <= 1280)).toBe(true);
    expect(first.gutterSnappedCount).toBeGreaterThanOrEqual(1);
    expect(first.compromisedSeamCount).toBe(0);
    // 첫 번째 분할선은 cut-001 아래 거터(1020..1160) 중앙 부근에 안착해 cut-002의 눈높이 밴드를 보호한다
    expect(first.slices[0]!.endY).toBeGreaterThanOrEqual(1020);
    expect(first.slices[0]!.endY).toBeLessThanOrEqual(1160);
    expect(first.slices[0]!.snappedToGutter).toBe(true);
  });

  it("runPlatformPreflightPackage 내부 슬라이서도 눈높이 보호 밴드 회피를 반영한다", () => {
    const cut = makeCut({
      heightPx: 2500,
      eyeLevelBands: [{ id: "eye-seam", topY: 1220, bottomY: 1350, characterName: "주인공" }],
    });
    const result = runPlatformPreflightPackage({
      episodeId: "ep-eye",
      seriesTitle: "테스트작",
      episodeNumber: 1,
      platformId: "webtoon-global",
      cuts: [cut],
    });

    expect(result.slicePlan[0]!.seamAvoidedEyeLevel).toBe(true);
    expect(result.slicePlan[0]!.endY).toBeLessThanOrEqual(1200);
  });
});

describe("2. 5대 플랫폼 통합 출판 프리셋 & Rights BOM 비상업/미확인 차단 + CC0 대체 (#091–#094)", () => {
  it("5대 통합 프리셋(네이버·카카오·글로벌 Webtoon·인쇄 PDF CMYK·SNS 9:16 숏폼)이 모두 정본으로 정의되어 있다", () => {
    expect(FIVE_PLATFORM_PREFLIGHT_PRESETS.map((p) => p.id)).toEqual([
      "naver",
      "kakao",
      "global-webtoon",
      "print-pdf-cmyk",
      "sns-shortform-9-16",
    ]);
    const printPreset = getUnifiedPlatformPreflightPreset("print-pdf-cmyk");
    expect(printPreset.requiredColorSpace).toBe("CMYK");
    expect(printPreset.requiredDpi).toBe(300);
    expect(printPreset.bleedMm).toBe(3);

    const snsPreset = getUnifiedPlatformPreflightPreset("sns-shortform-9-16");
    expect(snsPreset.targetWidthPx).toBe(1080);
    expect(snsPreset.targetHeightPx).toBe(1920);
    expect(snsPreset.safeHudBottomPx).toBe(280);
  });

  it("Rights BOM 비상업(CC-BY-NC)·편집전용(EDITORIAL-ONLY)·미확인(UNKNOWN) 에셋을 출고 차단하고 동일 카테고리 CC0를 추천한다", () => {
    const assets: readonly PreflightRightsBomAsset[] = [
      {
        assetId: "a-nc",
        name: "도심 야경 골목 3D",
        category: "3d-bg",
        licenseCode: "CC-BY-NC",
        commercialAllowed: false,
        verified: true,
        usedInCutIds: ["cut-001"],
        tags: ["alley", "night", "urban"],
      },
      {
        assetId: "a-unknown",
        name: "출처 미상 손글씨 폰트",
        category: "font",
        licenseCode: "UNKNOWN",
        commercialAllowed: false,
        verified: false,
        usedInCutIds: ["cut-002"],
        tags: ["dialogue", "handwriting"],
      },
      {
        assetId: "a-editorial",
        name: "보도 전용 소품 모델",
        category: "prop",
        licenseCode: "EDITORIAL-ONLY",
        commercialAllowed: false,
        verified: true,
        usedInCutIds: ["cut-003"],
        tags: ["clock"],
      },
      {
        assetId: "a-ok",
        name: "검증된 CC0 브러시",
        category: "brush",
        licenseCode: "CC0",
        commercialAllowed: true,
        verified: true,
        usedInCutIds: ["cut-001"],
      },
    ];

    const audit = evaluateRightsBomForPreflight(assets);
    expect(audit.status).toBe("BLOCKED");
    expect(audit.exportBlocked).toBe(true);
    expect(audit.blockedCount).toBe(3);
    expect(audit.allowedCount).toBe(1);
    expect(audit.blockingAssetIds).toEqual(["a-nc", "a-unknown", "a-editorial"]);

    const bgRec = recommendCc0Replacement(assets[0]!);
    expect(bgRec.item.cc0AssetId).toBe("cc0-bg-night-alley");
    expect(bgRec.item.licenseCode).toBe("CC0");
    expect(CC0_REPLACEMENT_CATALOG.some((c) => c.cc0AssetId === bgRec.item.cc0AssetId)).toBe(true);

    // 1클릭 일괄 CC0 대체 적용 후 차단 해제 검증
    const replaced = applyCc0AssetSubstitutions(assets);
    expect(replaced.substitutions).toHaveLength(3);
    expect(replaced.postAudit.status).toBe("READY");
    expect(replaced.postAudit.exportBlocked).toBe(false);
    expect(replaced.postAudit.blockedCount).toBe(0);
  });

  it("Rights BOM 차단 에셋이 포함되면 통합 프리플라이트와 기존 플랫폼 프리플라이트 모두 출고를 차단한다", () => {
    const cuts = createDefaultPreflightEpisode(6);
    const defaultBom = createDefaultPreflightRightsBom();

    const blockedUnified = runUnifiedFivePlatformPreflight({
      presetId: "print-pdf-cmyk",
      cuts,
      rightsBomAssets: defaultBom,
    });
    expect(blockedUnified.status).toBe("BLOCKED");
    expect(blockedUnified.exportBlocked).toBe(true);
    expect(blockedUnified.checkMessagesKo.some((m) => m.includes("Japan Color 2001"))).toBe(true);

    const blockedLegacy = runPlatformPreflightPackage({
      episodeId: "ep-bom",
      seriesTitle: "권리검증작",
      episodeNumber: 1,
      platformId: "naver-webtoon",
      cuts,
      rightsBomAssets: defaultBom,
    });
    expect(blockedLegacy.status).toBe("BLOCKED");
    expect(blockedLegacy.issues.some((i) => i.code === "RIGHTS_BOM_BLOCKED")).toBe(true);

    const substituted = applyCc0AssetSubstitutions(defaultBom);
    const unblockedSns = runUnifiedFivePlatformPreflight({
      presetId: "sns-shortform-9-16",
      cuts: cuts.map((c) => ({ ...c, colorProfile: "sRGB" })),
      rightsBomAssets: substituted.updatedAssets,
    });
    expect(unblockedSns.status).toBe("READY");
    expect(unblockedSns.exportBlocked).toBe(false);
  });
});
