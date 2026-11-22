import { describe, expect, it } from "vitest";

import {
  DELIVERY_PLATFORM_IDS,
  DELIVERY_PLATFORM_SPECS,
  formatEpisodeSliceFileName,
  getDeliveryPlatformSpec,
  isDeliveryPlatformId,
} from "./platform-delivery-specs";
import { planBatchEpisodeDelivery, planEpisodeSlices } from "./safe-slice-planner";

describe("웹툰 플랫폼별 공식 납품 규격 레지스트리 및 파일명 생성기", () => {
  it("네이버·카카오·레진·글로벌 4대 플랫폼 공식 규격 프리셋을 정확히 제공한다", () => {
    expect(DELIVERY_PLATFORM_IDS).toEqual([
      "naver_webtoon",
      "kakao_page",
      "lezhin",
      "global_webtoon",
    ]);

    const naver = getDeliveryPlatformSpec("naver_webtoon");
    expect(naver.targetWidthPx).toBe(690);
    expect(naver.maxSliceHeightPx).toBe(1600);
    expect(naver.maxSliceBytes).toBe(2 * 1024 * 1024);
    expect(naver.maxEpisodeBytes).toBe(20 * 1024 * 1024);
    expect(naver.fileNamePattern).toBe("EP01_001.jpg");

    const kakao = getDeliveryPlatformSpec("kakao_page");
    expect(kakao.targetWidthPx).toBe(720);
    expect(kakao.maxSliceHeightPx).toBe(1280);
    expect(kakao.fileNamePattern).toBe("EP01_001.jpg");

    const lezhin = getDeliveryPlatformSpec("lezhin");
    expect(lezhin.targetWidthPx).toBe(800);
    expect(lezhin.maxSliceHeightPx).toBe(1600);

    const globalWebtoon = getDeliveryPlatformSpec("global_webtoon");
    expect(globalWebtoon.targetWidthPx).toBe(800);
    expect(globalWebtoon.maxSliceHeightPx).toBe(1280);

    expect(isDeliveryPlatformId("naver_webtoon")).toBe(true);
    expect(isDeliveryPlatformId("unknown_portal")).toBe(false);
    expect(Object.keys(DELIVERY_PLATFORM_SPECS)).toHaveLength(4);
  });

  it("화수 및 슬라이스 번호를 EP01_001.jpg 표준 형식으로 생성하고 잘못된 번호는 거부한다", () => {
    expect(formatEpisodeSliceFileName(1, 1, "jpg")).toBe("EP01_001.jpg");
    expect(formatEpisodeSliceFileName(9, 12, "jpg")).toBe("EP09_012.jpg");
    expect(formatEpisodeSliceFileName(105, 100, "png")).toBe("EP105_100.png");
    expect(() => formatEpisodeSliceFileName(0, 1, "jpg")).toThrow();
    expect(() => formatEpisodeSliceFileName(1, 0, "jpg")).toThrow();
  });
});

describe("자동 슬라이스 및 안전 절단선(말풍선·얼굴 보호 구간 회피) 계산기", () => {
  it("네이버 웹툰 규격(690×1600px)으로 원본을 비율 축소해 분할하고 EP01_001.jpg 파일명을 부여한다", () => {
    const plan = planEpisodeSlices(
      {
        episodeNumber: 1,
        episodeTitle: "1화 프롤로그",
        sourceWidthPx: 1380,
        sourceHeightPx: 9600,
      },
      { platformId: "naver_webtoon" },
    );

    expect(plan.valid).toBe(true);
    expect(plan.targetWidthPx).toBe(690);
    expect(plan.scaleRatio).toBe(0.5);
    expect(plan.scaledHeightPx).toBe(4800);
    expect(plan.sliceCount).toBe(3);
    expect(plan.slices.map((s) => s.fileName)).toEqual([
      "EP01_001.jpg",
      "EP01_002.jpg",
      "EP01_003.jpg",
    ]);
    expect(plan.slices.every((s) => s.heightPx <= 1600 && s.widthPx === 690)).toBe(true);
  });

  it("절단 예정선(1600px)에 걸린 말풍선과 캐릭터 얼굴 보호 구간을 회피해 위쪽 안전 여백으로 절단선을 이동한다", () => {
    const plan = planEpisodeSlices(
      {
        episodeNumber: 2,
        sourceWidthPx: 690,
        sourceHeightPx: 4200,
        protectedZones: [
          {
            id: "bubble-1",
            kind: "speech-bubble",
            topY: 1520,
            bottomY: 1660,
            paddingPx: 20,
          },
          {
            id: "face-1",
            kind: "character-face",
            topY: 3040,
            bottomY: 3200,
            paddingPx: 20,
          },
        ],
      },
      { platformId: "naver_webtoon" },
    );

    expect(plan.valid).toBe(true);
    expect(plan.adjustedCutCount).toBe(2);

    // 1번 조각 끝이 1520 - 20 = 1500px로 당겨져 말풍선(1520~1660)을 절단하지 않는다.
    expect(plan.slices[0]?.yEndPx).toBe(1500);
    expect(plan.slices[0]?.adjusted).toBe(true);
    expect(plan.slices[0]?.avoidedZoneIds).toEqual(["bubble-1"]);

    // 2번 조각 최대 끝은 1500 + 1600 = 3100px → 얼굴 보호 구간(3020~3220)과 겹치므로 3020px로 당긴다.
    expect(plan.slices[1]?.yStartPx).toBe(1500);
    expect(plan.slices[1]?.yEndPx).toBe(3020);
    expect(plan.slices[1]?.avoidedZoneIds).toEqual(["face-1"]);
    expect(plan.slices[1]?.avoidedZoneKinds).toEqual(["character-face"]);

    // 모든 조각은 플랫폼 최대 높이 1600px를 단 1px도 초과하지 않는다.
    for (const slice of plan.slices) {
      expect(slice.heightPx).toBeLessThanOrEqual(1600);
    }
    expect(plan.slices.at(-1)?.yEndPx).toBe(4200);
  });

  it("겹치는 말풍선+얼굴 보호 구간을 하나로 병합해 두 영역 모두 안전하게 보존한다", () => {
    const plan = planEpisodeSlices(
      {
        episodeNumber: 1,
        sourceWidthPx: 720,
        sourceHeightPx: 3000,
        protectedZones: [
          { id: "face-hero", kind: "character-face", topY: 1120, bottomY: 1250, paddingPx: 10 },
          { id: "bubble-hero", kind: "speech-bubble", topY: 1230, bottomY: 1360, paddingPx: 10 },
        ],
      },
      { platformId: "kakao_page" },
    );

    expect(plan.valid).toBe(true);
    expect(plan.slices[0]?.yEndPx).toBe(1110);
    expect(plan.slices[0]?.avoidedZoneIds).toEqual(["face-hero", "bubble-hero"]);
    expect(plan.slices[0]?.heightPx).toBeLessThanOrEqual(1280);
  });

  it("단일 보호 구간이 플랫폼 최대 높이보다 커서 회피 불가능해도 최대 높이를 넘지 않고 경고를 남긴다", () => {
    const plan = planEpisodeSlices(
      {
        episodeNumber: 3,
        sourceWidthPx: 800,
        sourceHeightPx: 3000,
        protectedZones: [
          { id: "giant-key-art", kind: "panel-key-art", topY: 40, bottomY: 2200, paddingPx: 0 },
        ],
      },
      { platformId: "global_webtoon" },
    );

    expect(plan.valid).toBe(true);
    expect(plan.forcedCutCount).toBe(1);
    expect(plan.slices[0]?.heightPx).toBe(1280);
    expect(plan.slices[0]?.cutReason).toBe("forced-max-height");
    expect(plan.slices[0]?.splitZoneIds).toEqual(["giant-key-art"]);
    expect(plan.diagnostics.some((d) => d.code === "SLICE_FORCED_THROUGH_PROTECTED_ZONE")).toBe(
      true,
    );
  });

  it("조각당 2MB 초과 또는 화수 총 20MB 초과 시 네이버 규격 위반으로 차단한다", () => {
    const overSlicePlan = planEpisodeSlices(
      {
        episodeNumber: 1,
        sourceWidthPx: 690,
        sourceHeightPx: 3200,
        actualSliceBytes: [2_400_000, 900_000],
      },
      { platformId: "naver_webtoon" },
    );
    expect(overSlicePlan.valid).toBe(false);
    expect(overSlicePlan.withinByteBudget).toBe(false);
    expect(overSlicePlan.slices[0]?.exceedsSliceByteLimit).toBe(true);
    expect(overSlicePlan.diagnostics.some((d) => d.code === "SLICE_BYTE_LIMIT_EXCEEDED")).toBe(
      true,
    );

    const overEpisodePlan = planEpisodeSlices(
      {
        episodeNumber: 1,
        sourceWidthPx: 690,
        sourceHeightPx: 1600 * 12,
        actualSliceBytes: Array.from({ length: 12 }, () => 1_900_000),
      },
      { platformId: "naver_webtoon" },
    );
    expect(overEpisodePlan.valid).toBe(false);
    expect(overEpisodePlan.diagnostics.some((d) => d.code === "EPISODE_BYTE_LIMIT_EXCEEDED")).toBe(
      true,
    );
  });

  it("여러 화수를 일괄 계획하고 중복 화수 번호는 차단한다", () => {
    const batch = planBatchEpisodeDelivery(
      [
        { episodeNumber: 2, episodeTitle: "2화", sourceWidthPx: 800, sourceHeightPx: 3200 },
        { episodeNumber: 1, episodeTitle: "1화", sourceWidthPx: 800, sourceHeightPx: 1600 },
      ],
      { platformId: "lezhin" },
    );
    expect(batch.valid).toBe(true);
    expect(batch.episodeCount).toBe(2);
    expect(batch.episodes.map((ep) => ep.episodeCode)).toEqual(["EP01", "EP02"]);
    expect(batch.totalSliceCount).toBe(3);

    const duplicateBatch = planBatchEpisodeDelivery(
      [
        { episodeNumber: 1, sourceWidthPx: 800, sourceHeightPx: 1600 },
        { episodeNumber: 1, sourceWidthPx: 800, sourceHeightPx: 1600 },
      ],
      { platformId: "lezhin" },
    );
    expect(duplicateBatch.valid).toBe(false);
    expect(duplicateBatch.diagnostics.some((d) => d.code === "DUPLICATE_EPISODE_NUMBER")).toBe(
      true,
    );
  });
});
