// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATELIER_STYLE_MODEL_KIND,
  ATELIER_STYLE_ONDEVICE_SCHEMA_VERSION,
  ATELIER_STYLE_PROPRIETARY_BRANDS,
  ATELIER_WEBTOON_STYLES,
  DEFAULT_RAW_VECTOR_STROKES,
  ON_DEVICE_AI_CREATOR_TASKS,
  StudioAtelierStyleOndevicePanel,
  TOON_SILICON_PROFILES,
  VIOLET_HUE_MAX,
  VIOLET_HUE_MIN,
  auditAllSiliconOndeviceMatrix,
  auditStylePaletteVioletZero,
  buildAtelierStyleOndeviceSnapshot,
  buildStyleTransferWgslKernel,
  computeRawStrokeDigest,
  evaluateBidirectionalStyleTransform,
  exportAtelierStyleOndeviceJson,
  formatOklch,
  getAtelierWebtoonStyle,
  getToonSiliconProfile,
  isForbiddenVioletHue,
  normalizeHue,
  resolveOndeviceAiDispatchMatrix,
  sanitizeNonVioletHue,
  type AtelierWebtoonStyleId,
  type RawVectorStrokeSample,
  type ToonSiliconProfileId,
} from "./index";

afterEach(cleanup);

const EXTERNAL_BRAND_REGEX = new RegExp(
  `\\b(${[
    ["vel", "lo"], ["hoku", "sai"], ["sk", "ia"], ["thor", "vg"],
    ["c", "sp"], ["clip", "studio"], ["shapr", "3d"], ["pro", "create"],
    ["photo", "shop"], ["mag", "ma"], ["re", "belle"], ["blen", "der"],
    ["kri", "ta"], ["ibis", "paint"], ["medi", "bang"], ["mid", "journey"],
  ].map((parts) => parts.join("")).join("|")})\\b`,
  "iu",
);

function assertZeroRawColorsAndZeroViolet(markup: string): void {
  expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(markup).not.toMatch(/\brgba?\s*\(/iu);
  expect(markup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of markup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isForbiddenVioletHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 7대 웹툰 화풍 통합 프리셋 전수 불변식 & OKLCH 무바이올렛(265~325°)", () => {
  it("ATELIER_WEBTOON_STYLES가 7대 정본 화풍 ID를 순서대로 제공한다", () => {
    expect(ATELIER_WEBTOON_STYLES.map((s) => s.id)).toEqual([
      "korean-sumi-murim",
      "rofan-watercolor-jewel",
      "shonen-action-gpen",
      "slice-pastel-crayon",
      "noir-ink-hatching",
      "painterly-gouache-impasto",
      "cinema-cel-anime",
    ]);
    expect(ATELIER_WEBTOON_STYLES.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("korean-sumi-murim이 한지 요철·24모 갈필·먹 번짐·여백 대비 수치를 충족한다", () => {
    const sumi = getAtelierWebtoonStyle("korean-sumi-murim");
    expect(sumi.lineProfile.bristleSplitCount).toBe(24);
    expect(sumi.paperProfile.fiberRoughness).toBeGreaterThanOrEqual(0.8);
    expect(sumi.paperProfile.capillaryBleed).toBeGreaterThanOrEqual(0.75);
    expect(sumi.shadingProfile.negativeSpaceRatio).toBeGreaterThanOrEqual(0.6);
  });

  it("rofan-watercolor-jewel이 모세관 백런·살구 피부 SDF·할레이션 글로우를 반영한다", () => {
    const rofan = getAtelierWebtoonStyle("rofan-watercolor-jewel");
    expect(rofan.paperProfile.capillaryBleed).toBeGreaterThanOrEqual(0.85);
    expect(rofan.shadingProfile.highlightHalation).toBeGreaterThanOrEqual(0.9);
    expect(rofan.shadingProfile.rimLightBoost).toBeGreaterThanOrEqual(0.8);
    expect(rofan.signatureKo).toContain("살구 피부 SDF");
  });

  it("shonen-action-gpen이 날카로운 테이퍼·블루노이즈 무모아레 스크린톤·속도선을 반영한다", () => {
    const shonen = getAtelierWebtoonStyle("shonen-action-gpen");
    expect(shonen.lineProfile.entryTaper).toBeGreaterThanOrEqual(0.95);
    expect(shonen.lineProfile.exitTaper).toBeGreaterThanOrEqual(0.95);
    expect(shonen.paperProfile.blueNoiseScreentone).toBe(true);
    expect(shonen.signatureKo).toContain("속도선");
  });

  it("slice-pastel-crayon이 종이 능선 요철과 저채도 온기 파라미터를 유지한다", () => {
    const slice = getAtelierWebtoonStyle("slice-pastel-crayon");
    expect(slice.paperProfile.fiberRoughness).toBeGreaterThanOrEqual(0.85);
    expect(slice.lutProfile.saturationScale).toBeLessThan(0.8);
    expect(slice.lutProfile.temperatureShift).toBeGreaterThan(0.2);
  });

  it("noir-ink-hatching이 고대비 크로스해칭·거친 필름 그레인·극단 먹 음영을 반영한다", () => {
    const noir = getAtelierWebtoonStyle("noir-ink-hatching");
    expect(noir.shadingProfile.crossHatchDensity).toBeGreaterThanOrEqual(0.9);
    expect(noir.paperProfile.filmGrainStrength).toBeGreaterThanOrEqual(0.9);
    expect(noir.lutProfile.shadowCrush).toBeGreaterThanOrEqual(0.9);
  });

  it("painterly-gouache-impasto가 45° Sobel 두께 부조와 분광 혼색을 반영한다", () => {
    const impasto = getAtelierWebtoonStyle("painterly-gouache-impasto");
    expect(impasto.paperProfile.sobelImpastoStrength).toBeGreaterThanOrEqual(0.9);
    expect(impasto.shadingProfile.spectralPigmentMix).toBeGreaterThanOrEqual(0.9);
    expect(impasto.scene3dSyncProfile.rimLightAngleDeg).toBe(45);
  });

  it("cinema-cel-anime가 2단 선명 셀 음영·거리 적응형 테이퍼 외곽선·림라이트를 반영한다", () => {
    const cel = getAtelierWebtoonStyle("cinema-cel-anime");
    expect(cel.shadingProfile.celBands).toBe(2);
    expect(cel.lineProfile.depthAdaptiveTaper).toBe(true);
    expect(cel.shadingProfile.rimLightBoost).toBeGreaterThanOrEqual(0.9);
  });

  it("auditStylePaletteVioletZero가 7대 화풍 42개 OKLCH 색상 전수에서 바이올렛(265~325°) 0%를 검증한다", () => {
    const audit = auditStylePaletteVioletZero();
    expect(audit.inspectedStyleCount).toBe(7);
    expect(audit.inspectedColorCount).toBe(42);
    expect(audit.violetColorCount).toBe(0);
    expect(audit.violetPercent).toBe(0);
    expect(audit.passed).toBe(true);
  });

  it("바이올렛 가드 경계(265~325°)·OKLCH 포맷·미등록 화풍 ID 폴백이 안전하게 동작한다", () => {
    expect(VIOLET_HUE_MIN).toBe(265);
    expect(VIOLET_HUE_MAX).toBe(325);
    expect(isForbiddenVioletHue(265)).toBe(true);
    expect(isForbiddenVioletHue(295)).toBe(true);
    expect(isForbiddenVioletHue(325)).toBe(true);
    expect(isForbiddenVioletHue(264.9)).toBe(false);
    expect(isForbiddenVioletHue(325.1)).toBe(false);
    expect(normalizeHue(-40)).toBe(320);
    expect(normalizeHue(Number.NaN)).toBe(0);
    expect(isForbiddenVioletHue(sanitizeNonVioletHue(288))).toBe(false);
    expect(formatOklch({ l: 0.5, c: 0.14, h: 295 }, 0.4)).toBe("oklch(0.5 0.14 212 / 0.40)");
    expect(getAtelierWebtoonStyle("non-existent" as AtelierWebtoonStyleId).id).toBe("korean-sumi-murim");
  });
});

describe("2. 양방향 비파괴 화풍 변환 · 원본 벡터 보존 · 3D 배경 화풍 동기화", () => {
  it("모드 A(live-stroke-to-style)가 원본 벡터를 비파괴 보존하고 해시 일치를 증명한다", () => {
    const res = evaluateBidirectionalStyleTransform({ styleId: "korean-sumi-murim", mode: "live-stroke-to-style" });
    expect(res.originalSourcePreserved).toBe(true);
    expect(res.reversibleToRawVector).toBe(true);
    expect(res.roundTripStyleSwitchLossless).toBe(true);
    expect(res.originalStrokeDigest).toBe(computeRawStrokeDigest(DEFAULT_RAW_VECTOR_STROKES));
    expect(res.preservedOriginalStrokeDigest).toBe(res.originalStrokeDigest);
    expect(res.liveStrokeBindings).toHaveLength(DEFAULT_RAW_VECTOR_STROKES.length);
  });

  it("동결된 사용자 커스텀 스트로크 입력 시 원본 좌표·필압을 전혀 변조하지 않는다", () => {
    const customStrokes: readonly RawVectorStrokeSample[] = Object.freeze([
      Object.freeze({
        strokeId: "user-custom-1",
        role: "contour" as const,
        points: Object.freeze([
          Object.freeze({ x: 10, y: 20, pressure: 0.4, velocity: 0.5 }),
          Object.freeze({ x: 50, y: 80, pressure: 0.9, velocity: 0.3 }),
        ]),
      }),
    ]);
    const beforeDigest = computeRawStrokeDigest(customStrokes);
    const res = evaluateBidirectionalStyleTransform({
      styleId: "rofan-watercolor-jewel",
      mode: "live-stroke-to-style",
      sourceStrokes: customStrokes,
    });
    expect(res.originalStrokeDigest).toBe(beforeDigest);
    expect(res.preservedOriginalStrokes[0]?.points[1]?.pressure).toBe(0.9);
    expect(res.liveStrokeBindings[0]?.preservedPointCount).toBe(2);
  });

  it("화풍별 실시간 스트로크 바인딩이 갈필·선폭·종이결 차이를 정확히 반영한다", () => {
    const sumi = evaluateBidirectionalStyleTransform({ styleId: "korean-sumi-murim", mode: "live-stroke-to-style" });
    const gpen = evaluateBidirectionalStyleTransform({ styleId: "shonen-action-gpen", mode: "live-stroke-to-style" });
    const impasto = evaluateBidirectionalStyleTransform({ styleId: "painterly-gouache-impasto", mode: "live-stroke-to-style" });

    expect(sumi.liveStrokeBindings[0]?.bristleSplitCount).toBe(24);
    expect(gpen.liveStrokeBindings[0]?.bristleSplitCount).toBe(1);
    expect(impasto.liveStrokeBindings[0]?.stylizedMeanWidthPx).toBeGreaterThan(gpen.liveStrokeBindings[0]?.stylizedMeanWidthPx ?? 0);
    expect(sumi.liveStrokeBindings[0]?.paperToothModulation).toBeGreaterThan(gpen.liveStrokeBindings[0]?.paperToothModulation ?? 0);
  });

  it("모드 B(scene-restyle-and-3d-sync)가 7대 화풍 전수에 대해 3D 배경 동기화 계획을 생성한다", () => {
    for (const style of ATELIER_WEBTOON_STYLES) {
      const res = evaluateBidirectionalStyleTransform({ styleId: style.id, mode: "scene-restyle-and-3d-sync" });
      expect(res.scene3dSyncPlan.matchedShadingBands).toBe(style.scene3dSyncProfile.shadowBandSteps);
      expect(res.scene3dSyncPlan.rimLightAngleDeg).toBe(style.scene3dSyncProfile.rimLightAngleDeg);
      expect(res.scene3dSyncPlan.pipelineStages).toHaveLength(4);
      expect(res.scene3dSyncPlan.syncSummaryKo).toContain(style.labelKo);
    }
  });

  it("양방향 왕복 전환(수묵→느와르→셀 애니→수묵)이 비트 단위로 동일한 결과를 반환한다", () => {
    const first = evaluateBidirectionalStyleTransform({ styleId: "korean-sumi-murim", mode: "live-stroke-to-style", styleStrength: 90, paperGrainIntensity: 75, lineContrast: 82 });
    const midNoir = evaluateBidirectionalStyleTransform({ styleId: "noir-ink-hatching", mode: "scene-restyle-and-3d-sync", sourceStrokes: first.preservedOriginalStrokes });
    const midCel = evaluateBidirectionalStyleTransform({ styleId: "cinema-cel-anime", mode: "live-stroke-to-style", sourceStrokes: midNoir.preservedOriginalStrokes });
    const returned = evaluateBidirectionalStyleTransform({ styleId: "korean-sumi-murim", mode: "live-stroke-to-style", styleStrength: 90, paperGrainIntensity: 75, lineContrast: 82, sourceStrokes: midCel.preservedOriginalStrokes });

    expect(returned.originalStrokeDigest).toBe(first.originalStrokeDigest);
    expect(returned.styleDna).toEqual(first.styleDna);
    expect(returned.liveStrokeBindings).toEqual(first.liveStrokeBindings);
  });

  it("비유한·범위 초과 슬라이더 입력(NaN·Infinity·음수·250)을 0~100으로 안전 클램핑한다", () => {
    const res = evaluateBidirectionalStyleTransform({
      styleId: "shonen-action-gpen",
      mode: "live-stroke-to-style",
      styleStrength: Number.NaN,
      paperGrainIntensity: 250,
      lineContrast: -35,
    });
    expect(res.normalizedStrength).toBe(85);
    expect(res.normalizedPaperGrain).toBe(100);
    expect(res.normalizedLineContrast).toBe(0);
  });

  it("화풍 강도 0%일 때 3D 외곽선이 원본 3D 기준선으로 복귀하고 100%일 때 화풍 DNA 선폭과 일치한다", () => {
    const zero = evaluateBidirectionalStyleTransform({ styleId: "painterly-gouache-impasto", mode: "scene-restyle-and-3d-sync", styleStrength: 0 });
    const full = evaluateBidirectionalStyleTransform({ styleId: "painterly-gouache-impasto", mode: "scene-restyle-and-3d-sync", styleStrength: 100 });
    expect(zero.scene3dSyncPlan.matchedLineWidthPx).toBe(2);
    expect(full.scene3dSyncPlan.matchedLineWidthPx).toBe(full.styleDna.effectiveLineWidthPx);
  });

  it("화풍 DNA 지문이 화풍·종이결·대비 변화에 따라 결정론적으로 갱신된다", () => {
    const a = evaluateBidirectionalStyleTransform({ styleId: "korean-sumi-murim", mode: "live-stroke-to-style", paperGrainIntensity: 40 });
    const b = evaluateBidirectionalStyleTransform({ styleId: "korean-sumi-murim", mode: "live-stroke-to-style", paperGrainIntensity: 90 });
    const c = evaluateBidirectionalStyleTransform({ styleId: "noir-ink-hatching", mode: "live-stroke-to-style", paperGrainIntensity: 90 });
    expect(a.styleDna.dnaFingerprint).not.toBe(b.styleDna.dnaFingerprint);
    expect(b.styleDna.dnaFingerprint).not.toBe(c.styleDna.dnaFingerprint);
  });

  it("커스텀 3D 씬 참조(source3dScene)가 3D 동기화 계획에 정확히 반영된다", () => {
    const res = evaluateBidirectionalStyleTransform({
      styleId: "cinema-cel-anime",
      mode: "scene-restyle-and-3d-sync",
      source3dScene: {
        sceneId: "rooftop-sunset-07",
        titleKo: "옥상 석양 3D 컷",
        titleEn: "Rooftop Sunset 3D Cut",
        hasDepthPass: true,
        hasNormalPass: true,
        flatAlbedoChroma: 0.14,
        baseOutlineWidthPx: 1.5,
      },
    });
    expect(res.scene3dSyncPlan.sourceSceneId).toBe("rooftop-sunset-07");
    expect(res.scene3dSyncPlan.syncSummaryKo).toContain("옥상 석양 3D 컷");
  });
});

describe("3. PC·모바일 9종 실리콘 × 7대 온디바이스 AI 태스크 & 0B 프라이버시/정직 아키텍처", () => {
  it("TOON_SILICON_PROFILES가 모바일 5종 + PC 4종 = 정확히 9종 실리콘을 정의한다", () => {
    expect(TOON_SILICON_PROFILES).toHaveLength(9);
    const mobile = TOON_SILICON_PROFILES.filter((s) => s.formFactor === "mobile");
    const pc = TOON_SILICON_PROFILES.filter((s) => s.formFactor === "pc");
    expect(mobile.map((s) => s.nameEn)).toEqual([
      "Google Tensor TPU",
      "Snapdragon Hexagon NPU",
      "Apple ANE (iPhone · iPad)",
      "Dimensity APU",
      "Exynos NPU",
    ]);
    expect(pc.map((s) => s.nameEn)).toEqual([
      "Apple M Series",
      "Intel Core Ultra (NPU + Arc)",
      "AMD Ryzen XDNA2",
      "NVIDIA RTX (Tensor Core)",
    ]);
  });

  it("ON_DEVICE_AI_CREATOR_TASKS가 7대 온디바이스 AI 창작 기능을 순서대로 정의한다", () => {
    expect(ON_DEVICE_AI_CREATOR_TASKS.map((t) => t.id)).toEqual([
      "auto-flatting-lineart",
      "photo-to-webtoon-bg",
      "local-voice-to-balloon",
      "depth-25d-auto-shadow",
      "episode-50cut-qa-audit",
      "creator-dna-3to5-extract",
      "micro-mlp-stroke-stabilizer",
    ]);
  });

  it("auditAllSiliconOndeviceMatrix가 9×7=63 전 조합 0바이트 전송·서버비 0원·오프라인을 증명한다", () => {
    const audit = auditAllSiliconOndeviceMatrix();
    expect(audit.siliconCount).toBe(9);
    expect(audit.mobileSiliconCount).toBe(5);
    expect(audit.pcSiliconCount).toBe(4);
    expect(audit.taskCount).toBe(7);
    expect(audit.totalCombinations).toBe(63);
    expect(audit.totalServerUploadBytes).toBe(0);
    expect(audit.totalCloudServerCostWon).toBe(0);
    expect(audit.allOfflineCapable).toBe(true);
    expect(audit.passed).toBe(true);
  });

  it("모바일 5종 실리콘 전수에서 7대 기능 모두 서버 전송 0B·오프라인·적합 양자화를 반환한다", () => {
    for (const profile of TOON_SILICON_PROFILES.filter((s) => s.formFactor === "mobile")) {
      const matrix = resolveOndeviceAiDispatchMatrix(profile.id);
      expect(matrix.rows).toHaveLength(7);
      expect(matrix.totalServerUploadBytes).toBe(0);
      for (const row of matrix.rows) {
        expect(row.serverUploadBytes).toBe(0);
        expect(row.cloudServerCostWon).toBe(0);
        expect(row.offlineCapable).toBe(true);
        expect(["INT8", "FP16", "4-bit"]).toContain(row.quantization);
        expect(row.webStandardPath.length).toBeGreaterThan(4);
        expect(row.nativeBridgePath.length).toBeGreaterThan(4);
      }
    }
  });

  it("PC 4종 실리콘 전수에서 7대 기능 모두 서버 전송 0B 및 WebNN/LiteRT-Web 표준 경로를 반환한다", () => {
    for (const profile of TOON_SILICON_PROFILES.filter((s) => s.formFactor === "pc")) {
      const matrix = resolveOndeviceAiDispatchMatrix(profile.id);
      expect(matrix.totalServerUploadBytes).toBe(0);
      expect(matrix.webStandardReadyCount).toBe(7);
      for (const row of matrix.rows) {
        expect(row.serverUploadBytes).toBe(0);
        expect(row.webStandardPath).toMatch(/WebNN|LiteRT-Web|WASM/u);
      }
    }
  });

  it("모바일에서는 대용량 50컷 감사·3~5장 스타일 DNA를 네이티브 브리지 권장 경로로 정직 구분한다", () => {
    const tensor = resolveOndeviceAiDispatchMatrix("mobile-google-tensor-tpu");
    const qaRow = tensor.rows.find((r) => r.task.id === "episode-50cut-qa-audit");
    const dnaRow = tensor.rows.find((r) => r.task.id === "creator-dna-3to5-extract");
    expect(qaRow?.routeHonestyTier).toBe("native-bridge-recommended");
    expect(dnaRow?.routeHonestyTier).toBe("native-bridge-recommended");
    expect(qaRow?.quantization).toBe("4-bit");
    expect(tensor.nativeBridgeRecommendedCount).toBe(2);
  });

  it("PC NVIDIA RTX·Apple M은 고부하 태스크에 FP16을, Intel/AMD NPU는 INT8을 적절히 배정한다", () => {
    const rtx = resolveOndeviceAiDispatchMatrix("pc-nvidia-rtx");
    const appleM = resolveOndeviceAiDispatchMatrix("pc-apple-m");
    const ultra = resolveOndeviceAiDispatchMatrix("pc-intel-core-ultra");
    const ryzen = resolveOndeviceAiDispatchMatrix("pc-amd-ryzen-xdna2");

    expect(rtx.rows.find((r) => r.task.id === "depth-25d-auto-shadow")?.quantization).toBe("FP16");
    expect(appleM.rows.find((r) => r.task.id === "creator-dna-3to5-extract")?.quantization).toBe("FP16");
    expect(ultra.rows.find((r) => r.task.id === "episode-50cut-qa-audit")?.quantization).toBe("INT8");
    expect(ryzen.rows.find((r) => r.task.id === "episode-50cut-qa-audit")?.quantization).toBe("INT8");
  });

  it("초저지연 Micro-MLP 손떨림 보정은 9종 전 실리콘에서 INT8 · 브라우저 표준 단독 · ultra-light로 동작한다", () => {
    for (const profile of TOON_SILICON_PROFILES) {
      const row = resolveOndeviceAiDispatchMatrix(profile.id).rows.find((r) => r.task.id === "micro-mlp-stroke-stabilizer");
      expect(row?.quantization).toBe("INT8");
      expect(row?.routeHonestyTier).toBe("web-standard-ready");
      expect(row?.memoryFootprintTier).toBe("ultra-light");
    }
  });

  it("정직 아키텍처 계약(ondevice-style-and-ai-dispatch-architecture)을 준수하고 허위 실측 ms/FPS를 기재하지 않는다", () => {
    expect(ATELIER_STYLE_MODEL_KIND).toBe("ondevice-style-and-ai-dispatch-architecture");
    const matrix = resolveOndeviceAiDispatchMatrix("mobile-snapdragon-hexagon");
    expect(matrix.modelKind).toBe("ondevice-style-and-ai-dispatch-architecture");
    const combinedText = `${matrix.honestyNoticeKo} ${matrix.honestyNoticeEn} ${matrix.rows.map((r) => `${r.executionNoteKo} ${r.executionNoteEn}`).join(" ")}`;
    expect(combinedText).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:ms|fps)\b/iu);
  });

  it("getToonSiliconProfile이 미등록 ID 입력 시 첫 정본 프로필로 안전 폴백한다", () => {
    expect(getToonSiliconProfile("unknown-chip" as ToonSiliconProfileId).id).toBe("mobile-google-tensor-tpu");
  });
});

describe("4. WGSL 화풍 변환 컴퓨트 커널 & JSON 매니페스트 내보내기", () => {
  it("buildStyleTransferWgslKernel이 7대 화풍 전수에 대해 유효한 WGSL 컴퓨트 커널을 생성한다", () => {
    for (const style of ATELIER_WEBTOON_STYLES) {
      const wgsl = buildStyleTransferWgslKernel({ styleId: style.id, mode: "live-stroke-to-style" });
      expect(wgsl).toContain("struct AtelierStyleUniforms");
      expect(wgsl).toContain("@compute @workgroup_size(8, 8, 1)");
      expect(wgsl).toContain("fn main(@builtin(global_invocation_id) gid: vec3<u32>)");
      expect(wgsl).toContain(style.id);
      expect(wgsl).not.toMatch(EXTERNAL_BRAND_REGEX);
    }
  });

  it("7대 화풍별 WGSL 커널이 각 화풍 고유의 수학 분기를 생성한다", () => {
    expect(buildStyleTransferWgslKernel({ styleId: "korean-sumi-murim", mode: "live-stroke-to-style" })).toContain("let bristle");
    expect(buildStyleTransferWgslKernel({ styleId: "rofan-watercolor-jewel", mode: "live-stroke-to-style" })).toContain("let halation");
    expect(buildStyleTransferWgslKernel({ styleId: "shonen-action-gpen", mode: "live-stroke-to-style" })).toContain("let bnoise");
    expect(buildStyleTransferWgslKernel({ styleId: "slice-pastel-crayon", mode: "live-stroke-to-style" })).toContain("let ridge");
    expect(buildStyleTransferWgslKernel({ styleId: "noir-ink-hatching", mode: "live-stroke-to-style" })).toContain("let hatch_a");
    expect(buildStyleTransferWgslKernel({ styleId: "painterly-gouache-impasto", mode: "live-stroke-to-style" })).toContain("let impasto_light");
    expect(buildStyleTransferWgslKernel({ styleId: "cinema-cel-anime", mode: "live-stroke-to-style" })).toContain("let cel_q");
  });

  it("모드 B(scene-restyle-and-3d-sync) WGSL 커널이 3D 깊이·법선 외곽선 동기화 패스를 활성화한다", () => {
    const modeA = buildStyleTransferWgslKernel({ styleId: "cinema-cel-anime", mode: "live-stroke-to-style" });
    const modeB = buildStyleTransferWgslKernel({ styleId: "cinema-cel-anime", mode: "scene-restyle-and-3d-sync" });
    expect(modeA).toContain("sync3d=0");
    expect(modeB).toContain("sync3d=1");
    expect(modeB).toContain("let depth_edge = smoothstep");
  });

  it("buildAtelierStyleOndeviceSnapshot이 브랜드·변환·디스패치·바이올렛 감사·WGSL을 일관 조립한다", () => {
    const snap = buildAtelierStyleOndeviceSnapshot({ styleId: "noir-ink-hatching", mode: "scene-restyle-and-3d-sync", siliconId: "pc-apple-m" });
    expect(snap.schemaVersion).toBe(ATELIER_STYLE_ONDEVICE_SCHEMA_VERSION);
    expect(snap.modelKind).toBe(ATELIER_STYLE_MODEL_KIND);
    expect(snap.proprietaryBrands).toEqual(ATELIER_STYLE_PROPRIETARY_BRANDS);
    expect(snap.violetAudit.passed).toBe(true);
    expect(snap.dispatchMatrix.silicon.id).toBe("pc-apple-m");
    expect(snap.wgslKernel).toContain("noir-ink-hatching");
  });

  it("exportAtelierStyleOndeviceJson이 파싱 가능한 매니페스트와 0B/0% 불변식을 내보낸다", () => {
    const snap = buildAtelierStyleOndeviceSnapshot({ styleId: "korean-sumi-murim", siliconId: "pc-nvidia-rtx" });
    const raw = exportAtelierStyleOndeviceJson(snap);
    const parsed = JSON.parse(raw) as {
      schemaVersion: string;
      modelKind: string;
      bidirectionalTransform: { originalSourcePreserved: boolean; originalStrokeDigest: string; preservedOriginalStrokeDigest: string };
      ondeviceAiDispatch: { totalServerUploadBytes: number; cloudServerCostWon: number; tasks: readonly unknown[] };
      violetAudit: { violetPercent: number };
    };
    expect(parsed.schemaVersion).toBe(ATELIER_STYLE_ONDEVICE_SCHEMA_VERSION);
    expect(parsed.modelKind).toBe("ondevice-style-and-ai-dispatch-architecture");
    expect(parsed.bidirectionalTransform.originalSourcePreserved).toBe(true);
    expect(parsed.bidirectionalTransform.originalStrokeDigest).toBe(parsed.bidirectionalTransform.preservedOriginalStrokeDigest);
    expect(parsed.ondeviceAiDispatch.totalServerUploadBytes).toBe(0);
    expect(parsed.ondeviceAiDispatch.cloudServerCostWon).toBe(0);
    expect(parsed.ondeviceAiDispatch.tasks).toHaveLength(7);
    expect(parsed.ondeviceAiDispatch).toMatchObject({
      inferencePerformed: false,
      hardwareProbePerformed: false,
    });
    expect(parsed.violetAudit.violetPercent).toBe(0);
    expect(raw).not.toMatch(EXTERNAL_BRAND_REGEX);
  });
});

describe("5. StudioAtelierStyleOndevicePanel UI 인터랙션 · 좌우 비교 SVG · WGSL · JSON", () => {
  it("props 없이 기본 렌더링되며 7대 화풍·모드 토글·3슬라이더·9실리콘·7대 AI 표를 모두 표시한다", () => {
    render(<StudioAtelierStyleOndevicePanel />);
    expect(screen.getByTestId("atelier-style-ondevice-panel")).toBeTruthy();
    expect(screen.getByTestId("atelier-style-brand-badge").textContent).toContain("AtelierStyle");
    expect(screen.getByTestId("atelier-style-zero-upload-badge").textContent).toContain("0B");
    for (const style of ATELIER_WEBTOON_STYLES) {
      expect(screen.getByTestId(`atelier-style-preset-${style.id}`)).toBeTruthy();
    }
    for (const silicon of TOON_SILICON_PROFILES) {
      expect(screen.getByTestId(`atelier-silicon-${silicon.id}`)).toBeTruthy();
    }
    for (const task of ON_DEVICE_AI_CREATOR_TASKS) {
      expect(screen.getByTestId(`atelier-ai-row-${task.id}`)).toBeTruthy();
      expect(screen.getByTestId(`atelier-ai-zero-upload-${task.id}`).textContent).toContain("0B");
    }
  });

  it("7대 화풍 원클릭 전수 전환 시 좌우 비교 SVG가 즉시 갱신되고 원시 색상·바이올렛이 0건이다", () => {
    render(<StudioAtelierStyleOndevicePanel />);
    for (const style of ATELIER_WEBTOON_STYLES) {
      fireEvent.click(screen.getByTestId(`atelier-style-preset-${style.id}`));
      const svg = screen.getByTestId("atelier-style-compare-svg");
      expect(svg.getAttribute("data-style-id")).toBe(style.id);
      expect(svg.getAttribute("data-violet-free")).toBe("true");
      assertZeroRawColorsAndZeroViolet(svg.outerHTML);
    }
  });

  it("양방향 모드 A ↔ 모드 B 토글 시 SVG 3D 동기화 속성과 DNA 요약 문구가 갱신된다", () => {
    render(<StudioAtelierStyleOndevicePanel />);
    const svg = screen.getByTestId("atelier-style-compare-svg");
    expect(svg.getAttribute("data-transform-mode")).toBe("live-stroke-to-style");
    expect(svg.getAttribute("data-3d-sync-active")).toBe("false");

    fireEvent.click(screen.getByTestId("atelier-style-mode-scene-restyle-and-3d-sync"));
    expect(svg.getAttribute("data-transform-mode")).toBe("scene-restyle-and-3d-sync");
    expect(svg.getAttribute("data-3d-sync-active")).toBe("true");
    expect(screen.getByTestId("atelier-style-dna-summary").textContent).toContain("3D");
  });

  it("화풍 강도·종이결·선화 대비 3축 슬라이더 조작이 SVG 속성과 onStyleChange 콜백에 반영된다", () => {
    const onStyleChange = vi.fn();
    render(<StudioAtelierStyleOndevicePanel onStyleChange={onStyleChange} />);

    fireEvent.change(screen.getByTestId("atelier-style-strength-slider"), { target: { value: "62" } });
    fireEvent.change(screen.getByTestId("atelier-style-grain-slider"), { target: { value: "95" } });
    fireEvent.change(screen.getByTestId("atelier-style-contrast-slider"), { target: { value: "44" } });

    expect(screen.getByTestId("atelier-style-strength-value").textContent).toBe("62%");
    expect(screen.getByTestId("atelier-style-grain-value").textContent).toBe("95%");
    expect(screen.getByTestId("atelier-style-contrast-value").textContent).toBe("44%");
    const svg = screen.getByTestId("atelier-style-compare-svg");
    expect(svg.getAttribute("data-strength")).toBe("62");
    expect(svg.getAttribute("data-paper-grain")).toBe("95");
    expect(svg.getAttribute("data-line-contrast")).toBe("44");
    expect(onStyleChange).toHaveBeenCalledTimes(3);
  });

  it("모바일·PC 9종 실리콘 전환 시 7대 AI 표 경로가 갱신되고 모든 행의 서버 전송 0B 배지를 유지한다", () => {
    render(<StudioAtelierStyleOndevicePanel />);
    fireEvent.click(screen.getByTestId("atelier-silicon-pc-nvidia-rtx"));
    expect(screen.getByTestId("atelier-ai-row-depth-25d-auto-shadow").textContent).toContain("FP16");
    expect(screen.getByTestId("atelier-ai-row-depth-25d-auto-shadow").textContent).toContain("TensorRT");

    fireEvent.click(screen.getByTestId("atelier-silicon-mobile-snapdragon-hexagon"));
    expect(screen.getByTestId("atelier-ai-row-episode-50cut-qa-audit").textContent).toContain("QNN Hexagon");
    for (const task of ON_DEVICE_AI_CREATOR_TASKS) {
      expect(screen.getByTestId(`atelier-ai-zero-upload-${task.id}`).textContent).toContain("0B");
    }
  });

  it("WGSL 컴퓨트 커널 접기(<details>) 내부 코드가 화풍 전환에 맞춰 실시간 갱신된다", () => {
    render(<StudioAtelierStyleOndevicePanel />);
    const details = screen.getByTestId("atelier-style-wgsl-details");
    expect(details.tagName.toLowerCase()).toBe("details");
    expect(screen.getByTestId("atelier-style-wgsl-code").textContent).toContain("korean-sumi-murim");

    fireEvent.click(screen.getByTestId("atelier-style-preset-painterly-gouache-impasto"));
    expect(screen.getByTestId("atelier-style-wgsl-code").textContent).toContain("painterly-gouache-impasto");
    expect(screen.getByTestId("atelier-style-wgsl-code").textContent).toContain("impasto_light");
  });

  it("JSON 복사 버튼이 onExportJson 콜백을 호출하고 미리보기 열기/닫기 및 초기화가 동작한다", () => {
    const onExportJson = vi.fn();
    render(<StudioAtelierStyleOndevicePanel onExportJson={onExportJson} />);

    expect(screen.queryByTestId("atelier-style-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("atelier-style-copy-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain(ATELIER_STYLE_ONDEVICE_SCHEMA_VERSION);
    expect(screen.getByTestId("atelier-style-json-preview").textContent).toContain("ondevice-style-and-ai-dispatch-architecture");

    fireEvent.click(screen.getByTestId("atelier-style-close-json-btn"));
    expect(screen.queryByTestId("atelier-style-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("atelier-style-preset-noir-ink-hatching"));
    fireEvent.click(screen.getByTestId("atelier-style-reset-btn"));
    expect(screen.getByTestId("atelier-style-compare-svg").getAttribute("data-style-id")).toBe("korean-sumi-murim");
  });

  it("영문 로케일(locale='en')과 initialStyleId·initialMode·initialSiliconId·className props를 반영한다", () => {
    render(
      <StudioAtelierStyleOndevicePanel
        locale="en"
        initialStyleId="cinema-cel-anime"
        initialMode="scene-restyle-and-3d-sync"
        initialSiliconId="pc-apple-m"
        className="custom-atelier-style-shell"
      />,
    );
    const panel = screen.getByTestId("atelier-style-ondevice-panel");
    expect(panel.getAttribute("aria-label")).toContain("AtelierStyle 7 Webtoon Styles");
    expect(panel.className).toContain("custom-atelier-style-shell");
    expect(screen.getByTestId("atelier-style-compare-svg").getAttribute("data-style-id")).toBe("cinema-cel-anime");
    expect(screen.getByTestId("atelier-style-compare-svg").getAttribute("data-3d-sync-active")).toBe("true");
    expect(screen.getByTestId("atelier-silicon-pc-apple-m").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("6. 엄격 디자인 계약 · 줄 수 상한 · 고유 브랜드 청정 자가 검증", () => {
  it("소유 파일 4종 존재 및 줄 수 상한(engine<=740, panel<=680, index<=80, test<=740)을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "atelier-style-ondevice-engine.ts",
      "StudioAtelierStyleOndevicePanel.tsx",
      "index.ts",
      "atelier-style-ondevice.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }
    const tsFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(tsFiles).toHaveLength(4);

    const limits: Readonly<Record<string, number>> = {
      "atelier-style-ondevice-engine.ts": 740,
      "StudioAtelierStyleOndevicePanel.tsx": 680,
      "index.ts": 80,
      "atelier-style-ondevice.test.tsx": 740,
    };
    for (const file of required) {
      const lines = readFileSync(path.join(dir, file), "utf8").split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(limits[file] ?? 740);
    }
  });

  it("엔진·패널·배럴 소스에서 원시 색상·Web Storage·BigInt·번역투·transition-all·Sparkles·= {} 금지 패턴이 0건이다", () => {
    const dir = path.resolve(import.meta.dirname);
    for (const file of ["atelier-style-ondevice-engine.ts", "StudioAtelierStyleOndevicePanel.tsx", "index.ts"]) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(/\blocalStorage\b/u);
      expect(src).not.toMatch(/\bsessionStorage\b/u);
      expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
      expect(src).not.toMatch(/\b\d+n\b/u);
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\brgba?\s*\(/iu);
      expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      expect(src).not.toContain("가능하게 합니다");
      expect(src).not.toContain("직관적인 경험을 제공");
      expect(src).not.toContain("원활한 워크플로우를 보장");
      expect(src).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:ms|fps)\b/iu);
    }
    const panelSrc = readFileSync(path.join(dir, "StudioAtelierStyleOndevicePanel.tsx"), "utf8");
    expect(panelSrc).not.toContain("transition-all");
    expect(panelSrc).not.toContain("Sparkles");
    expect(panelSrc).not.toMatch(/Props\s*=\s*\{\}/u);
    expect(panelSrc).not.toMatch(/\)\s*=\s*\{\}/u);
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("motion-reduce:transition-none");
  });

  it("렌더된 패널의 모든 버튼이 min-h-11 터치 타깃을 충족하고 SVG에 원시 색·바이올렛이 0건이다", () => {
    const { container } = render(<StudioAtelierStyleOndevicePanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(20);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
    for (const svg of svgs) {
      assertZeroRawColorsAndZeroViolet(svg.outerHTML);
    }
  });

  it("고유 브랜드 청정 검사: 4개 소유 파일 전체에서 외부 경쟁사·엔진 브랜드명이 0건이다", () => {
    const dir = path.resolve(import.meta.dirname);
    const allFiles = [
      "atelier-style-ondevice-engine.ts",
      "StudioAtelierStyleOndevicePanel.tsx",
      "index.ts",
      "atelier-style-ondevice.test.tsx",
    ];
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(EXTERNAL_BRAND_REGEX);
    }
    const engineSrc = readFileSync(path.join(dir, "atelier-style-ondevice-engine.ts"), "utf8");
    for (const brand of ATELIER_STYLE_PROPRIETARY_BRANDS) {
      expect(engineSrc).toContain(brand);
    }
  });
});
