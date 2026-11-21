import { describe, expect, it } from "vitest";
import {
  AI_STAGING_DEFAULT_ONION_SKIN_ALPHA,
  AI_STAGING_MAX_CANDIDATES,
  acceptCandidateToNewLayer,
  compileRegionalConditioningPayload,
  createIdleStagingArea,
  discardStagingArea,
  normalizeControlNetStackItem,
  retryStagingWithInvertedMask,
  selectStagingCandidate,
  setStagingOnionSkinAlpha,
  snapBoundingBoxTo64,
  stageCandidates,
  type ControlNetStackItem,
  type RegionalGuidanceLayer,
} from "./studio-regional-control-stack";

describe("studio-regional-control-stack", () => {
  it("경계 상자(BBox)를 64px 배수로 스냅하고 캔버스 내부로 안전하게 클램프한다", () => {
    const snapped = snapBoundingBoxTo64(
      { x: 50, y: 100, width: 200, height: 30 },
      512,
      512,
    );
    expect(snapped.wasSnapped).toBe(true);
    expect(snapped.box.x % 64).toBe(0);
    expect(snapped.box.y % 64).toBe(0);
    expect(snapped.box.width % 64).toBe(0);
    expect(snapped.box.height).toBe(64);

    const clamped = snapBoundingBoxTo64(
      { x: 480, y: 490, width: 256, height: 256 },
      512,
      512,
    );
    expect(clamped.wasClamped).toBe(true);
    expect(clamped.box.x + clamped.box.width).toBeLessThanOrEqual(512);
    expect(clamped.box.y + clamped.box.height).toBeLessThanOrEqual(512);
  });

  it("ControlNet 강도(0~2)와 시작/종료 스텝 불변식(start <= end)을 강제한다", () => {
    const normalized = normalizeControlNetStackItem({
      id: "cn-1",
      label: "3D 뎁스",
      channel: "bg3d-depth",
      sourceLayerId: "depth-pass",
      enabled: true,
      strength: 3.7,
      startStep01: 0.85,
      endStep01: 0.2,
    });
    expect(normalized.strength).toBe(2);
    expect(normalized.startStep01).toBe(0.2);
    expect(normalized.endStep01).toBe(0.85);
  });

  it("BYOK 동의·Rights BOM 차단·다중 캐릭터 프롬프트 번짐 경고를 검증한다", () => {
    const regions: readonly RegionalGuidanceLayer[] = [
      {
        id: "reg-a",
        label: "캐릭터 A",
        enabled: true,
        maskLayerId: "mask-a",
        regionBoundsPx: { x: 0, y: 0, width: 256, height: 256 },
        positivePrompt: "검은 코트 주인공",
        negativePrompt: "흐림",
        characterAnchorId: "anchor-hero",
        invert: false,
        featherPx: 12,
        weight01: 1,
      },
      {
        id: "reg-b",
        label: "캐릭터 B",
        enabled: true,
        maskLayerId: "mask-b",
        regionBoundsPx: { x: 64, y: 0, width: 256, height: 256 },
        positivePrompt: "흰 셔츠 라이벌",
        negativePrompt: "흐림",
        characterAnchorId: "anchor-rival",
        invert: false,
        featherPx: 12,
        weight01: 0.9,
      },
    ];
    const controls: readonly ControlNetStackItem[] = [
      {
        id: "cn-line",
        label: "선화 가이드",
        channel: "lineart",
        sourceLayerId: "lt-main-line",
        enabled: true,
        strength: 1.1,
        startStep01: 0,
        endStep01: 0.9,
      },
    ];

    const noConsent = compileRegionalConditioningPayload({
      canvasWidthPx: 1024,
      canvasHeightPx: 1024,
      generationBoundsPx: { x: 0, y: 0, width: 512, height: 512 },
      regions,
      controlStack: controls,
      rightsGuard: {
        byokProviderConsentConfirmed: false,
        commercialExportIntended: false,
        sourceAssetLicenses: ["creator-original"],
      },
    });
    expect(noConsent.ok).toBe(false);
    if (!noConsent.ok) expect(noConsent.code).toBe("BYOK_CONSENT_REQUIRED");

    const blockedRights = compileRegionalConditioningPayload({
      canvasWidthPx: 1024,
      canvasHeightPx: 1024,
      generationBoundsPx: { x: 0, y: 0, width: 512, height: 512 },
      regions,
      controlStack: controls,
      rightsGuard: {
        byokProviderConsentConfirmed: true,
        commercialExportIntended: true,
        sourceAssetLicenses: ["creator-original", "reference-only"],
      },
    });
    expect(blockedRights.ok).toBe(false);
    if (!blockedRights.ok) expect(blockedRights.code).toBe("RIGHTS_BOM_BLOCKED");

    const compiled = compileRegionalConditioningPayload({
      canvasWidthPx: 1024,
      canvasHeightPx: 1024,
      generationBoundsPx: { x: 0, y: 0, width: 512, height: 512 },
      regions,
      controlStack: controls,
      rightsGuard: {
        byokProviderConsentConfirmed: true,
        commercialExportIntended: true,
        sourceAssetLicenses: ["creator-original", "commercial-cleared"],
      },
    });
    expect(compiled.ok).toBe(true);
    if (compiled.ok) {
      expect(compiled.isolatedAnchorCount).toBe(2);
      expect(compiled.warnings.some((w) => w.includes("프롬프트 번짐"))).toBe(true);
    }
  });

  it("비파괴 Staging Area가 최대 4후보·어니언스킨 0.65·신규 레이어 확정·반전 재시도를 처리한다", () => {
    let state = createIdleStagingArea({ x: 0, y: 0, width: 256, height: 256 }, "mask-a");
    expect(state.onionSkinAlpha01).toBe(AI_STAGING_DEFAULT_ONION_SKIN_ALPHA);

    const fiveCandidates = Array.from({ length: 5 }, (_, i) => ({
      id: `cand-${i + 1}`,
      seed: 1000 + i,
      previewRef: `blob://cand-${i + 1}`,
      generatedAtIso: "2026-11-20T09:00:00Z",
      invertedMaskRetry: false,
    }));

    state = stageCandidates(state, fiveCandidates);
    expect(state.candidates).toHaveLength(AI_STAGING_MAX_CANDIDATES);
    expect(state.selectedCandidateId).toBe("cand-1");

    state = selectStagingCandidate(state, "cand-3");
    state = setStagingOnionSkinAlpha(state, 0.8);
    expect(state.onionSkinAlpha01).toBe(0.8);

    const accepted = acceptCandidateToNewLayer(state, "layer-ai-01", "AI 배경 보정");
    expect(accepted).not.toBeNull();
    expect(accepted?.commitRecord.preservesUnderlyingLayers).toBe(true);
    expect(accepted?.commitRecord.sourceCandidateId).toBe("cand-3");
    expect(accepted?.nextState.status).toBe("committed");

    const retried = retryStagingWithInvertedMask(state);
    expect(retried.invertedMask).toBe(true);
    expect(retried.candidates).toHaveLength(0);

    const discarded = discardStagingArea(state);
    expect(discarded.status).toBe("discarded");
  });
});
