import { describe, expect, it } from "vitest";

import {
  computeSafeSliceYs,
  isLicenseBlockedForCommercial,
  runCommercialPreflightGate,
} from "./studio-commercial-preflight-gate";

describe("studio-commercial-preflight-gate (AC-008)", () => {
  it("상업 출고 시 NC/GPL 라이선스 소재를 blocker로 차단하고, 비상업 미리보기는 허용한다", () => {
    expect(isLicenseBlockedForCommercial("CC-BY-NC-4.0")).toBe(true);
    expect(isLicenseBlockedForCommercial("GPL-3.0")).toBe(true);
    expect(isLicenseBlockedForCommercial("CC0-1.0")).toBe(false);

    const commercial = runCommercialPreflightGate({
      documentWidthPx: 800,
      documentHeightPx: 3000,
      targetSliceHeightPx: 1280,
      exportMode: "commercial",
      bubbles: [],
      assets: [
        { assetId: "a1", name: "학교 복도 3D", licenseCode: "CC-BY-NC-SA" },
        { assetId: "a2", name: "무료 톤", licenseCode: "CC0" },
      ],
    });
    expect(commercial.passed).toBe(false);
    expect(commercial.blockerCount).toBe(1);
    expect(commercial.issues[0]?.category).toBe("rights-bom");

    const preview = runCommercialPreflightGate({
      documentWidthPx: 800,
      documentHeightPx: 3000,
      targetSliceHeightPx: 1280,
      exportMode: "personal-preview",
      bubbles: [],
      assets: [{ assetId: "a1", name: "학교 복도 3D", licenseCode: "CC-BY-NC-SA" }],
    });
    expect(preview.passed).toBe(true);
  });

  it("375px 모바일 가독성 미달 말풍선을 경고하고, 말풍선을 가로지르지 않게 슬라이스 Y를 조정한다", () => {
    const bubbles = [
      { id: "b1", text: "작은 대사", fontSizePx: 18, topY: 1220, bottomY: 1340 },
    ];
    const { sliceYs, adjustedCount } = computeSafeSliceYs(3000, 1280, bubbles);
    expect(adjustedCount).toBe(1);
    expect(sliceYs[0]).toBe(1208); // 1220 - 12px padding (말풍선 중간 절단 회피)

    const report = runCommercialPreflightGate({
      documentWidthPx: 800,
      documentHeightPx: 3000,
      targetSliceHeightPx: 1280,
      exportMode: "commercial",
      bubbles,
      assets: [{ assetId: "a2", name: "무료 톤", licenseCode: "CC0" }],
    });
    expect(report.passed).toBe(true);
    expect(report.warningCount).toBe(2); // mobile-legibility + slice-safety
  });
});
