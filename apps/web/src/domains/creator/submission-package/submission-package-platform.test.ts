import { describe, expect, it } from "vitest";

import { EXPORT_PRESETS } from "../export/studio-export-presets";

import { submissionPlatformLimits } from "./submission-package-platform";

function preset(id: string) {
  return EXPORT_PRESETS.find((entry) => entry.id === id);
}

describe("폭 기준별 플랫폼 용량 기준", () => {
  it("네이버는 앱에 이미 기록된 도전만화 프리셋의 이미지당·회차 합계 용량을 그대로 읽는다", () => {
    const naver = preset("naver-challenge");
    const limits = submissionPlatformLimits("naver");
    expect(naver).toBeDefined();
    expect(limits).toEqual({ label: naver?.label, maxFileBytes: naver?.maxFileBytes, maxEpisodeBytes: naver?.maxEpisodeBytes });
    expect(limits?.maxFileBytes).toBeGreaterThan(0);
    expect(limits?.maxEpisodeBytes).toBeGreaterThanOrEqual(limits?.maxFileBytes ?? 0);
  });

  it.each([
    ["kakao", "kakaopage"],
    ["canvas", "webtoon-canvas"],
  ] as const)("%s 는 프리셋 %s 에 기록된 용량 기준이 없으면 null 이다 — 없는 규정을 만들지 않는다", (widthId, presetId) => {
    const found = preset(presetId);
    expect(found).toBeDefined();
    const hasRecordedLimit = found?.maxFileBytes !== undefined || found?.maxEpisodeBytes !== undefined;
    expect(submissionPlatformLimits(widthId) === null).toBe(!hasRecordedLimit);
  });

  it("프리셋과 이어지지 않는 기준 폭과 ‘점검하지 않음’은 null 이다", () => {
    expect(submissionPlatformLimits("hires")).toBeNull();
    expect(submissionPlatformLimits("any")).toBeNull();
  });
});
