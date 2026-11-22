// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dCutStripPanel } from "../StudioBg3dCutStripPanel";
import {
  createStoryboardCutFromSceneCapture,
  type SceneLinkedStoryboardCut,
  type StoryboardSceneDocumentView,
} from "../studio-bg3d-storyboard-cut-link";
import {
  BG3D_EDIT_ACTION_CATALOG,
  BG3D_TEXTURE_DEVICE_PROFILES,
  StudioBg3dCutScopeBanner,
  applyBg3dMultiCutResolution,
  classifyBg3dEditAction,
  computeDownsampledTextureDimensions,
  detachStoryboardCutBackground,
  detectBg3dTextureDeviceProfile,
  downsampleBg3dTexture,
  downsampleRgbaBoxFilter,
  estimateTextureVramBytes,
  evaluateBg3dCutScope,
  extractCutLinksFromStoryboardCuts,
  isCutOnlyBg3dAction,
  isPowerOfTwo,
  isSharedBackgroundBg3dAction,
  planBg3dTextureBatchDownsample,
  planBg3dTextureDownsample,
  type Bg3dCutLinkRef,
  type Bg3dEditActionKind,
  type Bg3dMultiCutResolutionResult,
  type Bg3dTextureSourceMetadata,
} from "./index";

vi.setConfig({ testTimeout: 30000 });

const HERE = dirname(fileURLToPath(import.meta.url));

const BASE_DOC_VIEW: StoryboardSceneDocumentView = {
  camera: { position: [2, 1.8, 5], target: [0, 1.2, 0], fovDegrees: 42 },
  lighting: {
    ambientColor: "#404040",
    ambientIntensity: 0.5,
    key: { color: "#ffffff", direction: [0.5, 1, 0.25], intensity: 1.2, castsShadow: true },
    fill: { color: "#88aaff", direction: [-0.5, 0.4, 0.6], intensity: 0.4, castsShadow: false },
  },
  render: { exposure: 1.0 },
  nodes: [],
  shots: [{ id: "shot-1", name: "카페 정면" }],
  activeShotId: "shot-1",
};

function makeThreeLinkedStoryboardCuts(
  sceneId = "scene-ep12-cafe",
): readonly SceneLinkedStoryboardCut[] {
  return [1, 2, 3].map((cutNumber) =>
    createStoryboardCutFromSceneCapture({
      cutId: `cut-${cutNumber}`,
      cutNumber,
      title: `카페 ${cutNumber}컷`,
      sceneId,
      document: {
        ...BASE_DOC_VIEW,
        camera: {
          ...BASE_DOC_VIEW.camera,
          position: [cutNumber * 1.5, 1.8, 5],
          fovDegrees: 35 + cutNumber * 5,
        },
      },
      image: { ref: `capture-${cutNumber}`, width: 1600, height: 900 },
    }),
  );
}

function makeThreeCutLinks(sceneId = "scene-ep12-cafe"): readonly Bg3dCutLinkRef[] {
  return [
    { cutId: "cut-1", cutNumber: 1, title: "카페 1컷", backgroundSceneId: sceneId },
    { cutId: "cut-2", cutNumber: 2, title: "카페 2컷", backgroundSceneId: sceneId },
    { cutId: "cut-3", cutNumber: 3, title: "카페 3컷", backgroundSceneId: sceneId },
  ];
}

function makeTextureMeta(
  overrides: Partial<Bg3dTextureSourceMetadata> = {},
): Bg3dTextureSourceMetadata {
  return {
    textureId: "tex-brick-wall",
    sourceFormat: "skp",
    sourceFileName: "cafe_exterior_v3.skp",
    materialName: "RedBrick_Facade",
    channel: "baseColor",
    originalWidth: 4096,
    originalHeight: 4096,
    colorSpace: "srgb",
    sourceUri: "local://assets/cafe_exterior_v3.skp#RedBrick_Facade",
    contentSha256: "a".repeat(64),
    rightsTag: "commercial-licensed",
    ...overrides,
  };
}

describe("bg3d-cut-scope-policy — 범위 분류, 1컷 즉시 통과, 3컷 분리", () => {
  it("카메라·벽 컷어웨이·컷별 조명 등 cut-only 액션은 3컷 공유 배경에서도 확인 없이 즉시 통과한다", () => {
    const cutOnlyActions: readonly Bg3dEditActionKind[] = [
      "camera-orbit",
      "camera-fov",
      "camera-projection",
      "wall-cutaway",
      "cut-lighting",
      "cut-hidden-tags",
    ];
    const links = makeThreeCutLinks();

    for (const actionKind of cutOnlyActions) {
      expect(isCutOnlyBg3dAction(actionKind)).toBe(true);
      expect(isSharedBackgroundBg3dAction(actionKind)).toBe(false);
      expect(classifyBg3dEditAction(actionKind).scope).toBe("cut-only");

      const decision = evaluateBg3dCutScope({
        actionKind,
        activeCutId: "cut-1",
        activeCutNumber: 1,
        backgroundSceneId: "scene-ep12-cafe",
        linkedCuts: links,
      });

      expect(decision.scope).toBe("cut-only");
      expect(decision.linkedCutCount).toBe(3);
      expect(decision.requiresConfirmation).toBe(false);
      expect(decision.immediatePassReason).toBe("cut-only-action");
      expect(decision.availableResolutions).toEqual([]);
      expect(decision.defaultResolution).toBeNull();
      expect(decision.badgeMode).toBe("cut-only");
      expect(decision.badgeLabelKo).toBe("현재 컷 #1 카메라만");
      expect(decision.confirmationMessageKo).toBeNull();
    }
  });

  it("1컷 단독 편집 시에는 가구 이동·재질 교체·모델 삭제도 잠금·팝업 없이 즉시 통과한다", () => {
    const sharedActions: readonly Bg3dEditActionKind[] = [
      "move-furniture",
      "rotate-scale-prop",
      "replace-material",
      "delete-model",
      "insert-model",
      "edit-architecture",
      "replace-shared-hdri",
    ];
    const singleLink: readonly Bg3dCutLinkRef[] = [
      { cutId: "cut-solo", cutNumber: 1, title: "단독 컷", backgroundSceneId: "scene-solo" },
    ];

    for (const actionKind of sharedActions) {
      expect(isSharedBackgroundBg3dAction(actionKind)).toBe(true);
      expect(BG3D_EDIT_ACTION_CATALOG[actionKind].scope).toBe("shared-background");

      const decision = evaluateBg3dCutScope({
        actionKind,
        activeCutId: "cut-solo",
        activeCutNumber: 1,
        backgroundSceneId: "scene-solo",
        linkedCuts: singleLink,
      });

      expect(decision.scope).toBe("shared-background");
      expect(decision.linkedCutCount).toBe(1);
      expect(decision.requiresConfirmation).toBe(false);
      expect(decision.immediatePassReason).toBe("single-cut-standalone");
      expect(decision.availableResolutions).toEqual([]);
      expect(decision.badgeMode).toBe("cut-only");
      expect(decision.confirmationMessageKo).toBeNull();
    }
  });

  it("공유 배경 3컷에서 가구 이동 시 확인 정책을 산출하고 1컷 분리 후 2·3컷은 원본 연동을 유지한다", () => {
    const initialLinks = makeThreeCutLinks("scene-ep12-cafe");
    const decision = evaluateBg3dCutScope({
      actionKind: "move-furniture",
      activeCutId: "cut-1",
      activeCutNumber: 1,
      backgroundSceneId: "scene-ep12-cafe",
      linkedCuts: initialLinks,
      targetLabelKo: "원목 테이블",
    });

    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.immediatePassReason).toBeNull();
    expect(decision.linkedCutCount).toBe(3);
    expect(decision.otherAffectedCutIds).toEqual(["cut-2", "cut-3"]);
    expect(decision.otherAffectedCutNumbers).toEqual([2, 3]);
    expect(decision.availableResolutions).toEqual(["detach-cut-only", "apply-all-linked"]);
    expect(decision.defaultResolution).toBe("detach-cut-only");
    expect(decision.badgeMode).toBe("shared-linked");
    expect(decision.badgeLabelKo).toBe("공유 배경 · 3컷 연동");
    expect(decision.confirmationMessageKo).toContain("원목 테이블");
    expect(decision.confirmationMessageKo).toContain("3컷");

    // 1) 1컷만 분리 적용
    const detached = applyBg3dMultiCutResolution({
      decision,
      resolution: "detach-cut-only",
      linkedCuts: initialLinks,
    });

    expect(detached.resolution).toBe("detach-cut-only");
    expect(detached.sourceSceneId).toBe("scene-ep12-cafe");
    expect(detached.targetSceneId).not.toBe("scene-ep12-cafe");
    expect(detached.affectedCutIds).toEqual(["cut-1"]);
    expect(detached.unaffectedCutIds).toEqual(["cut-2", "cut-3"]);
    expect(detached.remainingSharedLinkCount).toBe(2);

    const cut1Link = detached.updatedCutLinks.find((link) => link.cutId === "cut-1");
    const cut2Link = detached.updatedCutLinks.find((link) => link.cutId === "cut-2");
    const cut3Link = detached.updatedCutLinks.find((link) => link.cutId === "cut-3");
    expect(cut1Link?.backgroundSceneId).toBe(detached.targetSceneId);
    expect(cut1Link?.detachedFromSceneId).toBe("scene-ep12-cafe");
    expect(cut2Link?.backgroundSceneId).toBe("scene-ep12-cafe");
    expect(cut3Link?.backgroundSceneId).toBe("scene-ep12-cafe");

    // 2) 분리된 1컷에서 재질 교체를 이어서 실행하면 단독 편집으로 즉시 통과
    const afterDetachCut1 = evaluateBg3dCutScope({
      actionKind: "replace-material",
      activeCutId: "cut-1",
      activeCutNumber: 1,
      backgroundSceneId: detached.targetSceneId,
      linkedCuts: detached.updatedCutLinks,
    });
    expect(afterDetachCut1.linkedCutCount).toBe(1);
    expect(afterDetachCut1.requiresConfirmation).toBe(false);
    expect(afterDetachCut1.immediatePassReason).toBe("single-cut-standalone");

    // 3) 남아 있는 2·3컷에서 모델 삭제 시 2컷 연동 확인 후 전체 반영
    const cut2DeleteDecision = evaluateBg3dCutScope({
      actionKind: "delete-model",
      activeCutId: "cut-2",
      activeCutNumber: 2,
      backgroundSceneId: "scene-ep12-cafe",
      linkedCuts: detached.updatedCutLinks,
    });
    expect(cut2DeleteDecision.linkedCutCount).toBe(2);
    expect(cut2DeleteDecision.otherAffectedCutIds).toEqual(["cut-3"]);
    expect(cut2DeleteDecision.requiresConfirmation).toBe(true);
    expect(cut2DeleteDecision.badgeLabelKo).toBe("공유 배경 · 2컷 연동");

    const appliedAll = applyBg3dMultiCutResolution({
      decision: cut2DeleteDecision,
      resolution: "apply-all-linked",
      linkedCuts: detached.updatedCutLinks,
    });
    expect(appliedAll.affectedCutIds).toEqual(["cut-2", "cut-3"]);
    expect(appliedAll.unaffectedCutIds).toEqual([]);
    expect(appliedAll.targetSceneId).toBe("scene-ep12-cafe");
    expect(appliedAll.remainingSharedLinkCount).toBe(2);
  });

  it("detachStoryboardCutBackground는 대상 컷의 sceneId만 불변 분리하고 나머지 2컷의 참조·카메라를 그대로 보존한다", () => {
    const cuts = makeThreeLinkedStoryboardCuts("scene-ep12-cafe");
    const links = extractCutLinksFromStoryboardCuts(cuts);
    expect(links.map((item) => item.backgroundSceneId)).toEqual([
      "scene-ep12-cafe",
      "scene-ep12-cafe",
      "scene-ep12-cafe",
    ]);

    const nextCuts = detachStoryboardCutBackground(cuts, "cut-2", "scene-ep12-cafe__cut-2");
    expect(nextCuts[0]).toBe(cuts[0]);
    expect(nextCuts[2]).toBe(cuts[2]);
    expect(nextCuts[1]?.sceneMeta?.sceneId).toBe("scene-ep12-cafe__cut-2");
    expect(nextCuts[1]?.sceneMeta?.camera).toEqual(cuts[1]?.sceneMeta?.camera);
    expect(nextCuts[0]?.sceneMeta?.sceneId).toBe("scene-ep12-cafe");
    expect(nextCuts[2]?.sceneMeta?.sceneId).toBe("scene-ep12-cafe");
  });
});

describe("bg3d-texture-device-downsampler — 4K~8K 기기별 다운샘플링·박스필터·VRAM 절감률·출처 메타 보존", () => {
  it("기기 프로필 상한(mobile 1024 / desktop 2048 / workstation 4096)과 자동 감지가 정확하다", () => {
    expect(BG3D_TEXTURE_DEVICE_PROFILES.mobile.maxTextureEdgePx).toBe(1024);
    expect(BG3D_TEXTURE_DEVICE_PROFILES.desktop.maxTextureEdgePx).toBe(2048);
    expect(BG3D_TEXTURE_DEVICE_PROFILES.workstation.maxTextureEdgePx).toBe(4096);

    expect(detectBg3dTextureDeviceProfile({ coarsePointer: true, viewportWidthPx: 1280 })).toBe("mobile");
    expect(detectBg3dTextureDeviceProfile({ viewportWidthPx: 768, deviceMemoryGb: 8 })).toBe("mobile");
    expect(detectBg3dTextureDeviceProfile({ viewportWidthPx: 1440, deviceMemoryGb: 8, maxTextureSizeGpu: 4096 })).toBe("desktop");
    expect(detectBg3dTextureDeviceProfile({ viewportWidthPx: 2560, deviceMemoryGb: 32, maxTextureSizeGpu: 16384 })).toBe("workstation");
  });

  it("4K(4096×4096) 텍스처의 mobile(1K)/desktop(2K) 다운샘플링 VRAM 절감률이 40% 이상(75%·93.75%)이며 PoT·종횡비를 지킨다", () => {
    const skp4k = makeTextureMeta({ originalWidth: 4096, originalHeight: 4096 });

    const mobilePlan = planBg3dTextureDownsample(skp4k, "mobile");
    expect(mobilePlan.targetWidth).toBe(1024);
    expect(mobilePlan.targetHeight).toBe(1024);
    expect(mobilePlan.isTargetPowerOfTwo).toBe(true);
    expect(mobilePlan.isLongestEdgePowerOfTwo).toBe(true);
    expect(mobilePlan.aspectRatioDelta).toBe(0);
    expect(mobilePlan.vramSavingsPercent).toBeGreaterThanOrEqual(40);
    expect(mobilePlan.vramSavingsPercent).toBeCloseTo(93.75, 1);

    const desktopPlan = planBg3dTextureDownsample(skp4k, "desktop");
    expect(desktopPlan.targetWidth).toBe(2048);
    expect(desktopPlan.targetHeight).toBe(2048);
    expect(desktopPlan.isTargetPowerOfTwo).toBe(true);
    expect(desktopPlan.aspectRatioDelta).toBe(0);
    expect(desktopPlan.vramSavingsPercent).toBeGreaterThanOrEqual(40);
    expect(desktopPlan.vramSavingsPercent).toBeCloseTo(75.0, 1);

    const workstationPlan = planBg3dTextureDownsample(skp4k, "workstation");
    expect(workstationPlan.needsDownsample).toBe(false);
    expect(workstationPlan.targetWidth).toBe(4096);
    expect(workstationPlan.targetHeight).toBe(4096);
    expect(workstationPlan.vramSavingsPercent).toBe(0);
  });

  it("8K(8192×4096) 비정방 GLB 텍스처와 NPOT SKP(4000×3000) 텍스처에서 종횡비·2의 거듭제곱 경계·원본 출처 메타를 보존한다", () => {
    const glb8kPanorama = makeTextureMeta({
      textureId: "tex-skyline-8k",
      sourceFormat: "glb",
      sourceFileName: "seoul_rooftop.glb",
      materialName: "SkylineFacade",
      originalWidth: 8192,
      originalHeight: 4096,
      rightsTag: "cc-by-4.0",
    });

    const desktop8k = planBg3dTextureDownsample(glb8kPanorama, "desktop");
    expect(desktop8k.targetWidth).toBe(2048);
    expect(desktop8k.targetHeight).toBe(1024);
    expect(desktop8k.isTargetPowerOfTwo).toBe(true);
    expect(desktop8k.aspectRatioDelta).toBe(0);
    expect(desktop8k.vramSavingsPercent).toBeCloseTo(93.75, 1);
    expect(desktop8k.sourceMeta).toEqual(glb8kPanorama);

    const workstation8k = planBg3dTextureDownsample(glb8kPanorama, "workstation");
    expect(workstation8k.targetWidth).toBe(4096);
    expect(workstation8k.targetHeight).toBe(2048);
    expect(workstation8k.isTargetPowerOfTwo).toBe(true);
    expect(workstation8k.vramSavingsPercent).toBeCloseTo(75.0, 1);

    // SKP 비정방 NPOT 4:3(4000×3000): 긴 변은 PoT 상한(2048/1024), 종횡비 유지
    const skpNpot = computeDownsampledTextureDimensions(4000, 3000, 2048);
    expect(skpNpot.targetWidth).toBe(2048);
    expect(skpNpot.targetHeight).toBe(1536);
    expect(skpNpot.isLongestEdgePowerOfTwo).toBe(true);
    expect(skpNpot.aspectRatioDelta).toBe(0);

    // 엄격한 양변 PoT 모드
    const strictPot = computeDownsampledTextureDimensions(4000, 3000, 2048, {
      powerOfTwoMode: "both-edges",
    });
    expect(isPowerOfTwo(strictPot.targetWidth)).toBe(true);
    expect(isPowerOfTwo(strictPot.targetHeight)).toBe(true);
    expect(strictPot.targetWidth).toBeLessThanOrEqual(2048);
    expect(strictPot.targetHeight).toBeLessThanOrEqual(2048);
  });

  it("실제 픽셀 박스필터 리사이저가 정수 배율·비정수 배율·노멀맵 정규화·출처 메타 보존을 정확히 수행한다", () => {
    // 1) 4×4 4사분면 단색 → 2×2 정확 평균
    const src4x4 = new Uint8ClampedArray(4 * 4 * 4);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const idx = (y * 4 + x) * 4;
        if (x < 2 && y < 2) {
          src4x4.set([200, 40, 20, 255], idx);
        } else if (x >= 2 && y < 2) {
          src4x4.set([20, 180, 60, 255], idx);
        } else if (x < 2 && y >= 2) {
          src4x4.set([40, 80, 240, 200], idx);
        } else {
          // 우하단 2×2 블록은 (0,0,0,100)과 (200,100,50,200) 반반 섞임 → 평균 (100,50,25,150)
          const odd = (x + y) % 2 === 0;
          src4x4.set(odd ? [0, 0, 0, 100] : [200, 100, 50, 200], idx);
        }
      }
    }

    const dst2x2 = downsampleRgbaBoxFilter({
      pixels: src4x4,
      sourceWidth: 4,
      sourceHeight: 4,
      targetWidth: 2,
      targetHeight: 2,
    });
    expect(Array.from(dst2x2.slice(0, 4))).toEqual([200, 40, 20, 255]);
    expect(Array.from(dst2x2.slice(4, 8))).toEqual([20, 180, 60, 255]);
    expect(Array.from(dst2x2.slice(8, 12))).toEqual([40, 80, 240, 200]);
    expect(Array.from(dst2x2.slice(12, 16))).toEqual([100, 50, 25, 150]);

    // 2) 비정수 비율(120×90 → 64×48) 단색 무왜곡 검증
    const npotPixels = new Uint8ClampedArray(120 * 90 * 4);
    for (let i = 0; i < npotPixels.length; i += 4) {
      npotPixels[i] = 135;
      npotPixels[i + 1] = 92;
      npotPixels[i + 2] = 210;
      npotPixels[i + 3] = 240;
    }
    const npotResized = downsampleRgbaBoxFilter({
      pixels: npotPixels,
      sourceWidth: 120,
      sourceHeight: 90,
      targetWidth: 64,
      targetHeight: 48,
    });
    expect(npotResized.length).toBe(64 * 48 * 4);
    expect(Array.from(npotResized.slice(0, 4))).toEqual([135, 92, 210, 240]);
    expect(Array.from(npotResized.slice(-4))).toEqual([135, 92, 210, 240]);

    // 3) 노멀맵 다운샘플링 시 단위 법선 벡터 길이 ≈ 1.0 유지
    const normalSrc = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i += 1) {
      // 좌우로 기울어진 두 법선을 섞으면 단순 평균은 짧아지므로 재정규화가 필요
      const tilt = i % 2 === 0 ? [240, 128, 180, 255] : [16, 128, 180, 255];
      normalSrc.set(tilt, i * 4);
    }
    const normalDst = downsampleRgbaBoxFilter({
      pixels: normalSrc,
      sourceWidth: 4,
      sourceHeight: 4,
      targetWidth: 2,
      targetHeight: 2,
      renormalizeNormals: true,
    });
    const nx = ((normalDst[0] ?? 0) / 255) * 2 - 1;
    const ny = ((normalDst[1] ?? 0) / 255) * 2 - 1;
    const nz = ((normalDst[2] ?? 0) / 255) * 2 - 1;
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1.0, 2);

    // 4) 실제 2048×2048 → mobile 1024×1024 엔드투엔드 + 출처 메타 불변 보존
    const tex2kMeta = makeTextureMeta({
      textureId: "tex-wood-2k",
      sourceFormat: "glb",
      sourceFileName: "cafe_interior.glb",
      materialName: "OakFloor",
      originalWidth: 2048,
      originalHeight: 2048,
    });
    const pixels2k = new Uint8ClampedArray(2048 * 2048 * 4);
    pixels2k.fill(180);
    const downsampled = downsampleBg3dTexture({
      sourceMeta: tex2kMeta,
      pixels: pixels2k,
      profileId: "mobile",
    });

    expect(downsampled.downsampledFromOriginal).toBe(true);
    expect(downsampled.width).toBe(1024);
    expect(downsampled.height).toBe(1024);
    expect(downsampled.pixels.length).toBe(1024 * 1024 * 4);
    expect(downsampled.pixels[0]).toBe(180);
    expect(downsampled.plan.vramSavingsPercent).toBeCloseTo(75.0, 1);
    expect(downsampled.sourceMeta.originalWidth).toBe(2048);
    expect(downsampled.sourceMeta.sourceFormat).toBe("glb");
    expect(downsampled.sourceMeta.sourceFileName).toBe("cafe_interior.glb");
    expect(downsampled.sourceMeta.contentSha256).toBe(tex2kMeta.contentSha256);
    expect(downsampled.sourceMeta.rightsTag).toBe("commercial-licensed");
  });

  it("다중 4K/8K 텍스처 배치 계획과 VRAM 예산·오류 가드를 검증한다", () => {
    const batch = planBg3dTextureBatchDownsample(
      [
        makeTextureMeta({ textureId: "t1", originalWidth: 4096, originalHeight: 4096 }),
        makeTextureMeta({ textureId: "t2", originalWidth: 8192, originalHeight: 4096, sourceFormat: "glb" }),
        makeTextureMeta({ textureId: "t3", originalWidth: 1024, originalHeight: 1024 }),
      ],
      "desktop",
    );

    expect(batch.downsampledCount).toBe(2);
    expect(batch.unchangedCount).toBe(1);
    expect(batch.overallVramSavingsPercent).toBeGreaterThanOrEqual(40);
    expect(batch.withinVramBudget).toBe(true);
    expect(estimateTextureVramBytes(4096, 4096, { includeMipmaps: false })).toBe(4096 * 4096 * 4);

    expect(() =>
      downsampleRgbaBoxFilter({
        pixels: new Uint8ClampedArray(16),
        sourceWidth: 4,
        sourceHeight: 4,
        targetWidth: 2,
        targetHeight: 2,
      }),
    ).toThrow(/길이가 일치하지 않습니다/);

    expect(() =>
      downsampleRgbaBoxFilter({
        pixels: new Uint8ClampedArray(4 * 4 * 4),
        sourceWidth: 4,
        sourceHeight: 4,
        targetWidth: 8,
        targetHeight: 8,
      }),
    ).toThrow(/업스케일할 수 없습니다/);
  });

  it("cut-scope 소스 모듈 전체에 browser-KV(localStorage/indexedDB/sessionStorage) 직접 호출이 0건이다", () => {
    const sourceFiles = [
      "bg3d-cut-scope-policy.ts",
      "bg3d-texture-device-downsampler.ts",
      "StudioBg3dCutScopeBanner.tsx",
      "index.ts",
    ];
    const forbiddenPattern =
      /\b(?:localStorage|sessionStorage|indexedDB|IDBDatabase|IDBFactory|IDBObjectStore|Dexie|openDB)\b/u;

    for (const fileName of sourceFiles) {
      const content = readFileSync(resolve(HERE, fileName), "utf8");
      // 주석 안의 안내 문구가 아닌 실행 코드 토큰 검사
      const stripped = content
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .replace(/\/\/.*$/gmu, "");
      expect(stripped, `${fileName}에 금지된 browser-KV 참조가 포함됨`).not.toMatch(forbiddenPattern);
    }
  });
});

describe("StudioBg3dCutScopeBanner & StudioBg3dCutStripPanel UI 상호작용", () => {
  afterEach(cleanup);

  it("cut-only 편집에서는 상시 배지 1개([현재 컷 #N 카메라만])만 표시하고 확인 바는 열지 않는다", () => {
    const decision = evaluateBg3dCutScope({
      actionKind: "camera-orbit",
      activeCutId: "cut-2",
      activeCutNumber: 2,
      backgroundSceneId: "scene-ep12-cafe",
      linkedCuts: makeThreeCutLinks(),
    });

    render(<StudioBg3dCutScopeBanner decision={decision} />);

    const badges = screen.getAllByTestId("bg3d-cut-scope-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]?.textContent).toBe("현재 컷 #2 카메라만");
    expect(badges[0]?.getAttribute("data-scope-mode")).toBe("cut-only");
    expect(screen.queryByTestId("bg3d-cut-scope-confirm-bar")).toBeNull();
  });

  it("다중 컷 공유 배경 변경 시 배지 전환 + 1줄 인라인 확인 바(min-h-11, keep-all, tabular-nums, reduced-motion)와 버튼 콜백이 동작한다", () => {
    const decision = evaluateBg3dCutScope({
      actionKind: "move-furniture",
      activeCutId: "cut-1",
      activeCutNumber: 1,
      backgroundSceneId: "scene-ep12-cafe",
      linkedCuts: makeThreeCutLinks(),
      targetLabelKo: "카페 소파",
    });
    const onResolve = vi.fn();
    const onCancel = vi.fn();

    render(
      <StudioBg3dCutScopeBanner
        decision={decision}
        onResolve={onResolve}
        onCancel={onCancel}
      />,
    );

    const badge = screen.getByTestId("bg3d-cut-scope-badge");
    expect(badge.textContent).toBe("공유 배경 · 3컷 연동");
    expect(badge.getAttribute("data-scope-mode")).toBe("shared-linked");

    const confirmBar = screen.getByTestId("bg3d-cut-scope-confirm-bar");
    expect(confirmBar.textContent).toContain("카페 소파");
    expect(confirmBar.className).toContain("motion-reduce:transition-none");

    const detachBtn = screen.getByTestId("bg3d-cut-scope-detach-btn");
    const applyAllBtn = screen.getByTestId("bg3d-cut-scope-apply-all-btn");
    const cancelBtn = screen.getByTestId("bg3d-cut-scope-cancel-btn");

    for (const button of [detachBtn, applyAllBtn, cancelBtn]) {
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("[word-break:keep-all]");
      expect(button.className).toContain("motion-reduce:transition-none");
    }
    expect(applyAllBtn.className).toContain("tabular-nums");
    expect(applyAllBtn.textContent).toBe("연동 3컷 전체 반영");

    fireEvent.click(detachBtn);
    expect(onResolve).toHaveBeenLastCalledWith("detach-cut-only");

    fireEvent.click(applyAllBtn);
    expect(onResolve).toHaveBeenLastCalledWith("apply-all-linked");

    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("StudioBg3dCutStripPanel 연결 진입점에서 3컷 분리 적용 및 외부 4K 텍스처 최적화 요약이 함께 작동한다", () => {
    const cuts = makeThreeLinkedStoryboardCuts("scene-ep12-cafe");
    const onResolveSharedBackgroundEdit = vi.fn<(result: Bg3dMultiCutResolutionResult) => void>();

    render(
      <StudioBg3dCutStripPanel
        cuts={cuts}
        activeCutId="cut-1"
        activeEditAction="replace-material"
        pendingEditTargetLabelKo="벽돌 외벽"
        onAddCut={vi.fn()}
        onRemoveCut={vi.fn()}
        onMoveCut={vi.fn()}
        onUpdateCutAspect={vi.fn()}
        onResolveSharedBackgroundEdit={onResolveSharedBackgroundEdit}
        externalTextureSources={[makeTextureMeta({ originalWidth: 4096, originalHeight: 4096 })]}
        textureDeviceProfile="desktop"
      />,
    );

    expect(screen.getByTestId("bg3d-cut-scope-badge").textContent).toBe("공유 배경 · 3컷 연동");
    expect(screen.getByTestId("bg3d-cut-scope-texture-summary").textContent).toContain("VRAM 75% 절감");

    fireEvent.click(screen.getByTestId("bg3d-cut-scope-detach-btn"));
    expect(onResolveSharedBackgroundEdit).toHaveBeenCalledOnce();
    const resolved = onResolveSharedBackgroundEdit.mock.calls[0]?.[0];
    expect(resolved?.resolution).toBe("detach-cut-only");
    expect(resolved?.affectedCutIds).toEqual(["cut-1"]);
    expect(resolved?.unaffectedCutIds).toEqual(["cut-2", "cut-3"]);
    expect(resolved?.remainingSharedLinkCount).toBe(2);
  });
});
