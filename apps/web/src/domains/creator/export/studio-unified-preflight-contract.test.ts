import { describe, expect, it } from "vitest";

import {
  STUDIO_EXPORT_TARGETS,
  STUDIO_UNIFIED_PUBLISH_PROFILES,
  defaultExportTargetForPublishProfile,
  embedRightsBomIntoPngBytes,
  evaluateCommercialExportPreflight,
  extractRestrictedAssetsFromNotes,
} from "./studio-unified-preflight-contract";

/** 최소 유효 PNG 바이너리(시그니처 + IEND 청크) 생성 헬퍼 */
function createMinimalPngBytes(): Uint8Array {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, // PNG signature
    0, 0, 0, 0, // IEND length = 0
    73, 69, 78, 68, // "IEND"
    174, 66, 96, 130, // CRC32("IEND")
  ]);
}

describe("studio-unified-preflight-contract (AC-012)", () => {
  it("8개 출고 타깃과 3개 게시 프로필 계약을 단일 모듈에서 제공한다", () => {
    expect(STUDIO_EXPORT_TARGETS).toHaveLength(8);
    expect(STUDIO_UNIFIED_PUBLISH_PROFILES).toHaveLength(3);
    expect(defaultExportTargetForPublishProfile("webtoon")).toBe("webtoon-platform");
    expect(defaultExportTargetForPublishProfile("tapas")).toBe("webtoon-platform");
  });

  it("375px 모바일 말풍선 가독성, 스마트 컷 분할(대사 절단 보호), Rights BOM(NC/GPL) 차단을 실검사한다", () => {
    const report = evaluateCommercialExportPreflight({
      exportTarget: "webtoon-platform",
      publishProfile: "webtoon",
      documentWidthPx: 800,
      documentHeightPx: 26_000,
      bubbles: [
        { id: "b1", text: "작은 각주 대사", fontSizePx: 18, topY: 100, bottomY: 160 },
        { id: "b2", text: "경계 걸친 대사", fontSizePx: 28, topY: 12_760, bottomY: 12_850 },
      ],
      assets: [
        { assetId: "a1", name: "무료 3D 카페", licenseCode: "CC-BY-NC-4.0" },
        { assetId: "a2", name: "오픈소스 필터", licenseCode: "GPL-3.0" },
      ],
    });

    expect(report.passed).toBe(false);
    expect(report.exportMode).toBe("commercial");
    expect(report.rightsBom.status).toBe("blocked");
    expect(report.rightsBom.blockerCount).toBe(2);
    expect(report.mobileLegibility.status).toBe("warning");
    expect(report.mobileLegibility.warningCount).toBe(1);
    expect(report.smartSlice.status).toBe("adjusted");
    expect(report.smartSlice.adjustedCount).toBeGreaterThanOrEqual(1);
    // 대사 박스 b2(12760~12850) 내부를 절대 자르지 않는다
    for (const y of report.smartSlice.safeSliceYs) {
      expect(y <= 12_760 || y >= 12_850).toBe(true);
    }
  });

  it("완전한 백업(archive) 타깃은 비상업 소재를 차단하지 않고 개인 백업 전용으로 안내한다", () => {
    const report = evaluateCommercialExportPreflight({
      exportTarget: "archive",
      publishProfile: "generic",
      documentWidthPx: 1600,
      documentHeightPx: 4000,
      bubbles: [{ id: "b1", text: "충분히 큰 대사", fontSizePx: 60, topY: 100, bottomY: 180 }],
      assets: [{ assetId: "a1", name: "개인 참고 소품", licenseCode: "CC-BY-NC" }],
    });

    expect(report.passed).toBe(true);
    expect(report.exportMode).toBe("personal-preview");
    expect(report.rightsBom.status).toBe("personal-only");
    expect(report.mobileLegibility.status).toBe("pass");
  });

  it("말풍선 데이터가 없을 때 가짜 가독성 통과를 표시하지 않고 unverified 상태를 반환한다", () => {
    const report = evaluateCommercialExportPreflight({
      exportTarget: "webtoon-platform",
      documentWidthPx: 800,
      documentHeightPx: 4000,
      bubbles: [],
      assets: [],
    });

    expect(report.mobileLegibility.status).toBe("unverified");
    expect(report.mobileLegibility.summaryKo).toContain("직접 확인");
  });

  it("제3자 출처 메모의 NC/GPL 표기를 자동 탐지해 상업 출고를 차단한다", () => {
    expect(extractRestrictedAssetsFromNotes("배경 3D 모델 (CC-BY-NC, 비상업)")).toHaveLength(2);
    const report = evaluateCommercialExportPreflight({
      exportTarget: "webtoon-platform",
      documentWidthPx: 800,
      documentHeightPx: 2000,
      thirdPartyAttributionNotes: "외부 브러시 (GPL 라이선스)",
    });
    expect(report.passed).toBe(false);
    expect(report.rightsBom.status).toBe("blocked");
  });

  it("PNG 내보내기 바이트에 Rights BOM tEXt 청크를 삽입하고 무손실 복원한다", () => {
    const receiptPayload = JSON.stringify({ pack: "studio-pack-1", commercial: true });
    const result = embedRightsBomIntoPngBytes(createMinimalPngBytes(), {
      filename: "rights-bom-receipt.json",
      mimeType: "application/json",
      content: receiptPayload,
      pngTextChunk: {
        keyword: "ToonStudioRightsBOM",
        text: receiptPayload,
      },
      receipt: {
        receiptSchemaVersion: 1,
        generatedAtIso: "2026-11-21T00:00:00.000Z",
        packId: "studio-pack-1",
        packName: "표준 연재 팩",
        genre: "판타지",
        platformId: "naver-webtoon",
        clearedForCommercialExport: true,
        blockedLicenses: [],
        assets: [],
        summary: "상업 연재 클린",
        integrityHash: "fnv1a-00000000",
      },
    });

    expect(result.embedded).toBe(true);
    expect(result.keyword).toBe("ToonStudioRightsBOM");
    expect(result.extractedText).toBe(receiptPayload);
  });
});
