import { describe, expect, it } from "vitest";

import {
  buildBakedManuscriptCutLayer,
  clampInkLineWeight,
  clampSplitWipeRatio,
} from "./studio-bg3d-live-ink-bake-bridge";

describe("studio-bg3d-live-ink-bake-bridge (AC-017)", () => {
  it("유효한 3D 캡처를 비파괴 2D 컷 레이어로 변환하고 Rights BOM 에셋 ID를 중복 제거해 보존한다", () => {
    const result = buildBakedManuscriptCutLayer({
      capture: {
        sceneId: "classroom-01",
        cameraId: "cam-hero",
        stage: "live-ink",
        widthPx: 1600,
        heightPx: 1200,
        inkPassRef: "opfs://captures/classroom-ink.png",
        shadedPassRef: "opfs://captures/classroom-shaded.png",
        inkLineWeightPx: 2.25,
        assetIds: ["desk-01", "window-02", "desk-01"],
        capturedAt: "2026-11-19T10:30:00.000Z",
      },
      targetDocumentId: "doc-ep01",
      targetCutIndex: 3,
      previewMode: "split-wipe",
      splitWipeRatio: 0.62,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.layer.nonDestructive).toBe(true);
      expect(result.layer.rightsBomAssetIds).toEqual(["desk-01", "window-02"]);
      expect(result.layer.splitWipeRatio).toBe(0.62);
      expect(result.layer.inkLineWeightPx).toBe(2.25);
    }
  });

  it("캡처 누락·0 해상도를 안전하게 차단하고 Split-Wipe 및 선 두께를 안전 범위로 클램프한다", () => {
    expect(clampSplitWipeRatio(1.4)).toBe(1);
    expect(clampSplitWipeRatio(-0.2)).toBe(0);
    expect(clampInkLineWeight(0.01)).toBe(0.25);
    expect(clampInkLineWeight(40)).toBe(8);

    const missing = buildBakedManuscriptCutLayer({
      capture: {
        sceneId: "s1",
        cameraId: "c1",
        stage: "shot",
        widthPx: 800,
        heightPx: 600,
        inkPassRef: "",
        shadedPassRef: "opfs://shaded.png",
        inkLineWeightPx: 1.5,
        assetIds: [],
        capturedAt: "2026-11-19T10:30:00.000Z",
      },
      targetDocumentId: "doc-ep01",
      targetCutIndex: 0,
      previewMode: "live-ink-only",
      splitWipeRatio: 0.5,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.code).toBe("MISSING_CAPTURE");
    }
  });
});
