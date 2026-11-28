import { describe, expect, it } from "vitest";
import {
  BLEND_MODE_LABEL_KO,
  CANONICAL_BLEND_MODES,
  compositeLayerPixelSrgb,
  computeSrgbOklabDeltaE,
  DCC_CAPABILITY_MATRIX,
  DCC_FORMAT_IDS,
  DCC_LAYER_KINDS,
  escapeDccAuditXml,
  evaluateBlendModeOklabFidelity,
  evaluateBlendModeRgb,
  findClosestSupportedBlendMode,
  formatOklchCss,
  getDccCapabilityProfile,
  isBlendModeSupportedInDcc,
  LAYER_KIND_LABEL_KO,
  renderDccCompatibilityAuditSvg,
  sha256CrossDccHex,
  srgbToOklab,
  srgbToOklch,
  STANDARD_64_RGB_PROBE_GRID,
  summarizeDccTranslationAuditKo,
  translateDccLayerTree,
  type CanonicalBlendMode,
  type DccLayerNode,
  type RgbTuple,
} from "./index";

function createCspWebtoonMasterLayers(): readonly DccLayerNode[] {
  return [
    {
      layerId: "grp-fx", nameKo: "광원·효과 폴더", layerKind: "group-folder", blendMode: "pass-through",
      opacity: 1, clippingMask: false, bitDepth: 8,
      children: [
        { layerId: "fx-eye-glow", nameKo: "눈동자 발광 하이라이트", layerKind: "raster", blendMode: "add-glow", opacity: 0.72, clippingMask: false, bitDepth: 8 },
        { layerId: "fx-rim-dodge", nameKo: "역광 림라이트", layerKind: "raster", blendMode: "glow-dodge", opacity: 0.8, clippingMask: true, bitDepth: 8 },
      ],
    },
    { layerId: "ink-hero", nameKo: "주인공 펜선 먹선", layerKind: "vector-ink", blendMode: "normal", opacity: 1, clippingMask: false, bitDepth: 8 },
    { layerId: "tone-bg", nameKo: "배경 60선 망점 톤", layerKind: "screentone-live", blendMode: "multiply", opacity: 0.85, clippingMask: false, bitDepth: 8 },
    { layerId: "dlg-main", nameKo: "대사 말풍선 식자", layerKind: "text-editable", blendMode: "normal", opacity: 1, clippingMask: false, bitDepth: 8 },
  ];
}

describe("Wave 155 — 5종 DCC 능력 매트릭스 및 18종 픽셀 블렌드모드 수학 커널", () => {
  it("5종 DCC 포맷과 18종 정본 블렌드모드·7종 레이어 유형 사전을 완전하게 제공한다", () => {
    expect(DCC_FORMAT_IDS).toEqual([
      "toonstudio",
      "clip-studio-paint",
      "photoshop-psd",
      "procreate",
      "krita-kra",
    ]);
    expect(CANONICAL_BLEND_MODES).toHaveLength(18);
    expect(DCC_LAYER_KINDS).toHaveLength(7);
    for (let i = 0; i < CANONICAL_BLEND_MODES.length; i += 1) {
      expect(BLEND_MODE_LABEL_KO[CANONICAL_BLEND_MODES[i]].length).toBeGreaterThan(2);
    }
    for (let i = 0; i < DCC_LAYER_KINDS.length; i += 1) {
      expect(LAYER_KIND_LABEL_KO[DCC_LAYER_KINDS[i]].length).toBeGreaterThan(1);
    }
  });

  it("ToonStudio 네이티브는 18종 블렌드모드·7종 레이어·32-bit 색심도를 전부 지원한다", () => {
    const p = getDccCapabilityProfile("toonstudio");
    expect(p.supportedBlendModes).toHaveLength(18);
    expect(p.supportedLayerKinds).toHaveLength(7);
    expect(p.preservesEditableVectorInk && p.preservesLiveScreentone).toBe(true);
    expect(p.preservesEditableText && p.preservesAdjustmentCurve && p.preserves3dReference).toBe(true);
    expect(p.supportsPassThroughGroup && p.maxBitDepth === 32).toBe(true);
  });

  it("Clip Studio Paint는 add-glow·glow-dodge·벡터·라이브 망점을 지원하지만 8-bit 상한을 가진다", () => {
    const csp = DCC_CAPABILITY_MATRIX["clip-studio-paint"];
    expect(isBlendModeSupportedInDcc("clip-studio-paint", "add-glow")).toBe(true);
    expect(isBlendModeSupportedInDcc("clip-studio-paint", "glow-dodge")).toBe(true);
    expect(csp.preservesEditableVectorInk && csp.preservesLiveScreentone).toBe(true);
    expect(csp.maxBitDepth).toBe(8);
    expect(csp.supportedBitDepths).toEqual([8]);
  });

  it("Photoshop PSD와 Procreate·Krita의 핵심 비호환 제약이 정확히 반영된다", () => {
    const psd = getDccCapabilityProfile("photoshop-psd");
    const procreate = getDccCapabilityProfile("procreate");
    const krita = getDccCapabilityProfile("krita-kra");
    expect(isBlendModeSupportedInDcc("photoshop-psd", "add-glow")).toBe(false);
    expect(isBlendModeSupportedInDcc("photoshop-psd", "glow-dodge")).toBe(false);
    expect(psd.preservesEditableVectorInk || psd.preservesLiveScreentone).toBe(false);
    expect(psd.preservesEditableText && psd.maxBitDepth === 32).toBe(true);
    expect(procreate.supportsPassThroughGroup || procreate.preservesAdjustmentCurve).toBe(false);
    expect(isBlendModeSupportedInDcc("procreate", "vivid-light")).toBe(false);
    expect(procreate.maxBitDepth).toBe(8);
    expect(krita.supportsPassThroughGroup && krita.preservesAdjustmentCurve).toBe(true);
    expect(isBlendModeSupportedInDcc("krita-kra", "add-glow")).toBe(false);
  });

  it("18종 모든 블렌드모드가 경계·비정상 입력에서 유한한 [0, 1]^3 RGB를 반환한다", () => {
    const edgeInputs: readonly RgbTuple[] = [[0, 0, 0], [1, 1, 1], [0.5, 0.25, 0.75], [Number.NaN, -0.5, 1.8]];
    for (let m = 0; m < CANONICAL_BLEND_MODES.length; m += 1) {
      const mode = CANONICAL_BLEND_MODES[m];
      for (let i = 0; i < edgeInputs.length; i += 1) {
        for (let j = 0; j < edgeInputs.length; j += 1) {
          const out = evaluateBlendModeRgb(edgeInputs[i], edgeInputs[j], mode);
          for (let c = 0; c < 3; c += 1) {
            expect(Number.isFinite(out[c])).toBe(true);
            expect(out[c]).toBeGreaterThanOrEqual(0);
            expect(out[c]).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("normal 블렌드모드는 소스 색상을 항등 반환한다", () => {
    for (let i = 0; i < STANDARD_64_RGB_PROBE_GRID.length; i += 1) {
      const b = STANDARD_64_RGB_PROBE_GRID[i];
      const s = STANDARD_64_RGB_PROBE_GRID[(i * 13 + 7) % 64];
      const out = evaluateBlendModeRgb(b, s, "normal");
      expect(out[0]).toBeCloseTo(s[0], 10);
      expect(out[1]).toBeCloseTo(s[1], 10);
      expect(out[2]).toBeCloseTo(s[2], 10);
    }
  });

  it("multiply <= min(backdrop, source) 물리 불변량과 흑백 경계를 만족한다", () => {
    for (let bi = 0; bi < STANDARD_64_RGB_PROBE_GRID.length; bi += 1) {
      const b = STANDARD_64_RGB_PROBE_GRID[bi];
      const s = STANDARD_64_RGB_PROBE_GRID[(bi * 17 + 3) % 64];
      const out = evaluateBlendModeRgb(b, s, "multiply");
      for (let c = 0; c < 3; c += 1) expect(out[c]).toBeLessThanOrEqual(Math.min(b[c], s[c]) + 1e-12);
    }
    expect(evaluateBlendModeRgb([0.8, 0.4, 0.2], [1, 1, 1], "multiply")).toEqual([0.8, 0.4, 0.2]);
    expect(evaluateBlendModeRgb([0.8, 0.4, 0.2], [0, 0, 0], "multiply")).toEqual([0, 0, 0]);
  });

  it("screen >= max(backdrop, source) 물리 불변량과 흑백 경계를 만족한다", () => {
    for (let bi = 0; bi < STANDARD_64_RGB_PROBE_GRID.length; bi += 1) {
      const b = STANDARD_64_RGB_PROBE_GRID[bi];
      const s = STANDARD_64_RGB_PROBE_GRID[(bi * 19 + 5) % 64];
      const out = evaluateBlendModeRgb(b, s, "screen");
      for (let c = 0; c < 3; c += 1) expect(out[c]).toBeGreaterThanOrEqual(Math.max(b[c], s[c]) - 1e-12);
    }
    expect(evaluateBlendModeRgb([0.6, 0.3, 0.2], [0, 0, 0], "screen")).toEqual([0.6, 0.3, 0.2]);
    expect(evaluateBlendModeRgb([0.6, 0.3, 0.2], [1, 1, 1], "screen")).toEqual([1, 1, 1]);
  });

  it("darken과 lighten은 채널별 min/max와 정확히 일치한다", () => {
    expect(evaluateBlendModeRgb([0.2, 0.7, 0.5], [0.6, 0.3, 0.5], "darken")).toEqual([0.2, 0.3, 0.5]);
    expect(evaluateBlendModeRgb([0.2, 0.7, 0.5], [0.6, 0.3, 0.5], "lighten")).toEqual([0.6, 0.7, 0.5]);
  });

  it("difference(x, x) = 0, 교환법칙 성립 및 exclusion 흑백 반전 불변량을 만족한다", () => {
    for (let i = 0; i < STANDARD_64_RGB_PROBE_GRID.length; i += 1) {
      const x = STANDARD_64_RGB_PROBE_GRID[i];
      const y = STANDARD_64_RGB_PROBE_GRID[(i * 7 + 11) % 64];
      expect(evaluateBlendModeRgb(x, x, "difference")).toEqual([0, 0, 0]);
      expect(evaluateBlendModeRgb(x, y, "difference")).toEqual(evaluateBlendModeRgb(y, x, "difference"));
    }
    expect(evaluateBlendModeRgb([0, 0, 0], [0.4, 0.6, 0.8], "exclusion")).toEqual([0.4, 0.6, 0.8]);
    const inv = evaluateBlendModeRgb([1, 1, 1], [0.4, 0.6, 0.8], "exclusion");
    expect(inv[0]).toBeCloseTo(0.6, 8);
    expect(inv[1]).toBeCloseTo(0.4, 8);
    expect(inv[2]).toBeCloseTo(0.2, 8);
  });

  it("add-glow >= linear-dodge 하이라이트 증폭 불변량을 전 격자에서 만족하며 흑색 소스는 항등 유지한다", () => {
    let strictlyBrighterCount = 0;
    for (let bi = 0; bi < STANDARD_64_RGB_PROBE_GRID.length; bi += 1) {
      const b = STANDARD_64_RGB_PROBE_GRID[bi];
      for (let si = 0; si < STANDARD_64_RGB_PROBE_GRID.length; si += 4) {
        const s = STANDARD_64_RGB_PROBE_GRID[si];
        const glow = evaluateBlendModeRgb(b, s, "add-glow");
        const ld = evaluateBlendModeRgb(b, s, "linear-dodge");
        for (let c = 0; c < 3; c += 1) {
          expect(glow[c]).toBeGreaterThanOrEqual(ld[c] - 1e-12);
          if (glow[c] > ld[c] + 1e-6) strictlyBrighterCount += 1;
        }
      }
    }
    expect(strictlyBrighterCount).toBeGreaterThan(100);
    expect(evaluateBlendModeRgb([0.4, 0.5, 0.6], [0, 0, 0], "add-glow")).toEqual([0.4, 0.5, 0.6]);
  });

  it("glow-dodge >= color-dodge 하이라이트 증폭을 만족하고 순흑 먹선(b=0)은 0으로 보존한다", () => {
    let strictlyBrighterCount = 0;
    for (let bi = 0; bi < STANDARD_64_RGB_PROBE_GRID.length; bi += 1) {
      const b = STANDARD_64_RGB_PROBE_GRID[bi];
      for (let si = 0; si < STANDARD_64_RGB_PROBE_GRID.length; si += 2) {
        const s = STANDARD_64_RGB_PROBE_GRID[si];
        const gd = evaluateBlendModeRgb(b, s, "glow-dodge");
        const cd = evaluateBlendModeRgb(b, s, "color-dodge");
        for (let c = 0; c < 3; c += 1) {
          expect(gd[c]).toBeGreaterThanOrEqual(cd[c] - 1e-12);
          if (gd[c] > cd[c] + 1e-6) strictlyBrighterCount += 1;
        }
      }
    }
    expect(strictlyBrighterCount).toBeGreaterThan(100);
    const midGd = evaluateBlendModeRgb([0.25, 0.3, 0.35], [0.25, 0.3, 0.2], "glow-dodge");
    const midCd = evaluateBlendModeRgb([0.25, 0.3, 0.35], [0.25, 0.3, 0.2], "color-dodge");
    expect(midGd[0]).toBeGreaterThan(midCd[0]);
    expect(evaluateBlendModeRgb([0, 0, 0], [0.8, 0.6, 0.4], "glow-dodge")).toEqual([0, 0, 0]);
    expect(evaluateBlendModeRgb([0.5, 0.3, 0.7], [0, 0, 0], "glow-dodge")).toEqual([0.5, 0.3, 0.7]);
  });

  it("overlay와 hard-light 쌍대성 및 vivid-light 경계 안정성을 만족한다", () => {
    const b: RgbTuple = [0.25, 0.7, 0.9];
    const s: RgbTuple = [0.65, 0.3, 0.15];
    const ov = evaluateBlendModeRgb(b, s, "overlay");
    const hl = evaluateBlendModeRgb(s, b, "hard-light");
    expect(ov[0]).toBeCloseTo(hl[0], 10);
    expect(ov[1]).toBeCloseTo(hl[1], 10);
    expect(ov[2]).toBeCloseTo(hl[2], 10);
    expect(evaluateBlendModeRgb([0.5, 1, 0], [0, 0, 0], "vivid-light")).toEqual([0, 1, 0]);
    expect(evaluateBlendModeRgb([0.5, 1, 0], [1, 1, 1], "vivid-light")).toEqual([1, 1, 0]);
  });

  it("compositeLayerPixelSrgb는 W3C Source-Over 알파 결합과 불투명도 경계를 정확히 따른다", () => {
    const b: RgbTuple = [0.2, 0.4, 0.8];
    const s: RgbTuple = [0.9, 0.6, 0.3];
    expect(compositeLayerPixelSrgb(b, 1, s, 1, "multiply", 0).rgb).toEqual(b);
    const overTransparent = compositeLayerPixelSrgb(b, 0, s, 0.6, "add-glow", 0.5);
    expect(overTransparent.rgb[0]).toBeCloseTo(s[0], 8);
    expect(overTransparent.alpha).toBeCloseTo(0.3, 8);
    expect(compositeLayerPixelSrgb(b, 1, s, 1, "screen", 1).rgb).toEqual(evaluateBlendModeRgb(b, s, "screen"));
    expect(compositeLayerPixelSrgb(b, 0, s, 0, "normal", 1)).toEqual({ rgb: [0, 0, 0], alpha: 0 });
  });
});

describe("Wave 155 — 64-색상 OKLab 프로브 측정 및 최적 대체 블렌드 근사 솔버", () => {
  it("STANDARD_64_RGB_PROBE_GRID는 정확히 64개(4×4×4)의 고유 RGB 점을 가진다", () => {
    expect(STANDARD_64_RGB_PROBE_GRID).toHaveLength(64);
    const keys = new Set(
      STANDARD_64_RGB_PROBE_GRID.map((c) => `${c[0].toFixed(3)},${c[1].toFixed(3)},${c[2].toFixed(3)}`),
    );
    expect(keys.size).toBe(64);
  });

  it("Björn Ottosson OKLab 변환은 흑·백·무채색과 OKLCH CSS 포맷 기준을 만족한다", () => {
    expect(srgbToOklab([0, 0, 0]).l).toBeCloseTo(0, 6);
    expect(srgbToOklab([1, 1, 1]).l).toBeCloseTo(1, 5);
    const gray = srgbToOklab([0.5, 0.5, 0.5]);
    expect(Math.abs(gray.a)).toBeLessThan(1e-5);
    expect(Math.abs(gray.b)).toBeLessThan(1e-5);
    expect(computeSrgbOklabDeltaE([0.4, 0.6, 0.8], [0.4, 0.6, 0.8])).toBe(0);
    const css = formatOklchCss(srgbToOklch([0.2, 0.6, 0.9]), 0.85);
    expect(css.startsWith("oklch(") && css.includes("/ 0.850)")).toBe(true);
  });

  it("동일 블렌드모드·동일 불투명도 쌍은 18종 전부 OKLab ΔE = 0을 반환한다", () => {
    for (let i = 0; i < CANONICAL_BLEND_MODES.length; i += 1) {
      const mode: CanonicalBlendMode = CANONICAL_BLEND_MODES[i];
      const f = evaluateBlendModeOklabFidelity(mode, mode, { sourceOpacity: 0.75 });
      expect(f.probeColorCount).toBe(64);
      expect(f.meanDeltaE).toBe(0);
      expect(f.maxDeltaE).toBe(0);
    }
  });

  it("add-glow vs linear-dodge는 양의 OKLab ΔE를 가지며 add-glow vs multiply보다 훨씬 가깝다", () => {
    const vsLd = evaluateBlendModeOklabFidelity("add-glow", "linear-dodge");
    const vsMul = evaluateBlendModeOklabFidelity("add-glow", "multiply");
    expect(vsLd.meanDeltaE).toBeGreaterThan(0.01);
    expect(vsLd.maxDeltaE).toBeGreaterThan(vsLd.meanDeltaE);
    expect(vsLd.meanDeltaE).toBeLessThan(vsMul.meanDeltaE);
  });

  it("glow-dodge는 color-dodge와의 OKLab ΔE가 linear-dodge보다 작다", () => {
    const vsCd = evaluateBlendModeOklabFidelity("glow-dodge", "color-dodge");
    const vsLd = evaluateBlendModeOklabFidelity("glow-dodge", "linear-dodge");
    expect(vsCd.meanDeltaE).toBeGreaterThan(0);
    expect(vsCd.meanDeltaE).toBeLessThan(vsLd.meanDeltaE);
  });

  it("타깃 DCC가 지원하는 모드는 findClosestSupportedBlendMode가 ΔE=0 직매핑을 반환한다", () => {
    const exact = findClosestSupportedBlendMode("multiply", "photoshop-psd", 0.65);
    expect(exact.isExactMatch).toBe(true);
    expect(exact.bestMatch.targetBlendMode).toBe("multiply");
    expect(exact.bestMatch.recommendedOpacity).toBe(0.65);
    expect(exact.bestMatch.meanDeltaE).toBe(0);
  });

  it("CSP add-glow → PSD 자동 탐색은 linear-dodge를 선택하고 부분 불투명도 보정으로 ΔE를 줄인다", () => {
    const approx = findClosestSupportedBlendMode("add-glow", "photoshop-psd", 0.68);
    expect(approx.isExactMatch).toBe(false);
    expect(approx.bestMatch.targetBlendMode).toBe("linear-dodge");
    expect(approx.bestMatch.recommendedOpacity).toBeGreaterThan(0.68);
    expect(approx.bestMatch.meanDeltaE).toBeLessThan(approx.bestMatch.uncompensatedMeanDeltaE);
    expect(approx.bestMatch.opacityImprovementDeltaE).toBeGreaterThan(0);
    expect(approx.alternatives.length).toBeGreaterThan(0);
    for (let i = 0; i < approx.alternatives.length; i += 1) {
      expect(approx.bestMatch.meanDeltaE).toBeLessThanOrEqual(approx.alternatives[i].meanDeltaE);
    }
  });

  it("CSP glow-dodge → PSD 자동 탐색은 color-dodge를 최적 대체 모드로 선택한다", () => {
    const approx = findClosestSupportedBlendMode("glow-dodge", "photoshop-psd", 0.8);
    expect(approx.isExactMatch).toBe(false);
    expect(approx.bestMatch.targetBlendMode).toBe("color-dodge");
    expect(approx.bestMatch.meanDeltaE).toBeGreaterThan(0);
    for (let i = 0; i < approx.alternatives.length; i += 1) {
      expect(approx.bestMatch.meanDeltaE).toBeLessThanOrEqual(approx.alternatives[i].meanDeltaE);
    }
  });

  it("vivid-light → Procreate 자동 탐색은 Procreate 지원 모드 중 최소 ΔE 후보를 반환한다", () => {
    const approx = findClosestSupportedBlendMode("vivid-light", "procreate", 1);
    expect(approx.isExactMatch).toBe(false);
    expect(isBlendModeSupportedInDcc("procreate", approx.bestMatch.targetBlendMode)).toBe(true);
    expect(approx.bestMatch.meanDeltaE).toBeGreaterThan(0);
    for (let i = 0; i < approx.alternatives.length; i += 1) {
      expect(approx.bestMatch.meanDeltaE).toBeLessThanOrEqual(approx.alternatives[i].meanDeltaE);
    }
  });

  it("pass-through → Procreate 탐색은 격리 일반(normal) 폴백을 반환한다", () => {
    const approx = findClosestSupportedBlendMode("pass-through", "procreate", 1);
    expect(approx.isExactMatch).toBe(false);
    expect(approx.bestMatch.targetBlendMode).toBe("normal");
  });
});

describe("Wave 155 — 레이어 트리 크로스-DCC 호환성 번역 및 손실 위험 사전 감사", () => {
  it("동일 DCC → 동일 DCC 전환은 5종 모든 포맷에서 100점 무손실로 판정된다", () => {
    const sampleLayers = createCspWebtoonMasterLayers();
    for (let i = 0; i < DCC_FORMAT_IDS.length; i += 1) {
      const dcc = DCC_FORMAT_IDS[i];
      const audit = translateDccLayerTree({
        documentId: `ep01-self-${dcc}`,
        documentTitleKo: "제1화 동일 포맷 라운드트립",
        sourceDcc: dcc,
        targetDcc: dcc,
        layers: sampleLayers,
      });
      expect(audit.compatibilityScore).toBe(100);
      expect(audit.isStrictLossless).toBe(true);
      expect(audit.auditGrade).toBe("PASS");
      expect(audit.allRisks).toHaveLength(0);
      expect(audit.maxDocumentOklabDeltaE).toBe(0);
    }
  });

  it("Clip Studio Paint 마스터 → ToonStudio 네이티브는 발광 블렌드·벡터 먹선·라이브 망점 모두 100% 무손실이다", () => {
    const audit = translateDccLayerTree({
      documentId: "ep12-csp-to-toonstudio",
      documentTitleKo: "제12화 야경 전투 컷",
      sourceDcc: "clip-studio-paint",
      targetDcc: "toonstudio",
      layers: createCspWebtoonMasterLayers(),
    });
    expect(audit.compatibilityScore).toBe(100);
    expect(audit.isStrictLossless).toBe(true);
    expect(audit.auditGrade).toBe("PASS");
    expect(audit.approximatedBlendLayerCount).toBe(0);
    expect(audit.rasterizationRiskLayerCount).toBe(0);
  });

  it("CSP(add-glow + glow-dodge + vector-ink + screentone-live) → PSD 변환 시 근사 블렌드와 벡터·망점 래스터화 경고를 정확히 포착한다", () => {
    const audit = translateDccLayerTree({
      documentId: "ep12-csp-to-psd",
      documentTitleKo: "제12화 야경 전투 컷",
      sourceDcc: "clip-studio-paint",
      targetDcc: "photoshop-psd",
      layers: createCspWebtoonMasterLayers(),
    });
    expect(audit.isStrictLossless).toBe(false);
    expect(audit.auditGrade).toBe("FAIL");
    expect(audit.compatibilityScore).toBeLessThan(80);
    expect(audit.totalLayerCount).toBe(6);
    expect(audit.approximatedBlendLayerCount).toBe(2);
    expect(audit.riskCountByCode["blend-mode-approximated"]).toBe(2);
    expect(audit.riskCountByCode["vector-rasterization-loss"]).toBe(1);
    expect(audit.riskCountByCode["screentone-rasterization-loss"]).toBe(1);

    const eyeGlow = audit.flattenedLayers.find((l) => l.layerId === "fx-eye-glow");
    expect(eyeGlow?.blendMappingStatus).toBe("approximated-blend");
    expect(eyeGlow?.targetBlendMode).toBe("linear-dodge");
    expect(eyeGlow?.recommendedOpacity).toBeGreaterThan(0.72);
    expect(eyeGlow?.oklabMeanDeltaE).toBeGreaterThan(0);

    expect(audit.flattenedLayers.find((l) => l.layerId === "fx-rim-dodge")?.targetBlendMode).toBe("color-dodge");
    expect(audit.flattenedLayers.find((l) => l.layerId === "ink-hero")?.rasterizationForced).toBe(true);
    expect(audit.flattenedLayers.find((l) => l.layerId === "tone-bg")?.rasterizationForced).toBe(true);
  });

  it("16-bit PSD → 8-bit CSP 변환에서 16-bit 레이어의 bitdepth-banding-risk만 정확히 탐지한다", () => {
    const audit = translateDccLayerTree({
      documentId: "ep04-16bit-sky",
      documentTitleKo: "제4화 노을 배경",
      sourceDcc: "photoshop-psd",
      targetDcc: "clip-studio-paint",
      layers: [
        { layerId: "bg-16", nameKo: "노을 그라데이션", layerKind: "raster", blendMode: "normal", opacity: 1, clippingMask: false, bitDepth: 16 },
        { layerId: "fg-8", nameKo: "캐릭터 채색", layerKind: "raster", blendMode: "normal", opacity: 1, clippingMask: false, bitDepth: 8 },
      ],
    });
    expect(audit.bitDepthBandingLayerCount).toBe(1);
    expect(audit.riskCountByCode["bitdepth-banding-risk"]).toBe(1);
    expect(audit.flattenedLayers[0].targetBitDepth).toBe(8);
    expect(audit.flattenedLayers[1].isLayerLossless).toBe(true);
  });

  it("32-bit Krita → 8-bit Procreate 변환은 심각한 bitdepth-banding-risk 차단 경보를 발생시킨다", () => {
    const audit = translateDccLayerTree({
      documentId: "hdr-32-to-8",
      documentTitleKo: "HDR 광원 컷",
      sourceDcc: "krita-kra",
      targetDcc: "procreate",
      layers: [
        { layerId: "hdr-bloom", nameKo: "32-bit HDR 발광", layerKind: "raster", blendMode: "linear-dodge", opacity: 0.9, clippingMask: false, bitDepth: 32 },
      ],
    });
    expect(audit.blockers.some((r) => r.code === "bitdepth-banding-risk")).toBe(true);
    expect(audit.auditGrade).toBe("FAIL");
  });

  it("pass-through 폴더에 곱하기/스크린 하위 레이어가 있을 때 Procreate 변환은 차단 경보와 실측 ΔE를 산출한다", () => {
    const audit = translateDccLayerTree({
      documentId: "pt-folder-procreate",
      documentTitleKo: "조명 폴더 테스트",
      sourceDcc: "photoshop-psd",
      targetDcc: "procreate",
      layers: [
        {
          layerId: "grp-lighting",
          nameKo: "씬 통합 조명 폴더",
          layerKind: "group-folder",
          blendMode: "pass-through",
          opacity: 1,
          clippingMask: false,
          bitDepth: 8,
          children: [
            { layerId: "shadow-m", nameKo: "그림자 곱하기", layerKind: "raster", blendMode: "multiply", opacity: 0.7, clippingMask: false, bitDepth: 8 },
            { layerId: "light-s", nameKo: "반사광 스크린", layerKind: "raster", blendMode: "screen", opacity: 0.5, clippingMask: false, bitDepth: 8 },
          ],
        },
      ],
    });
    expect(audit.passThroughFlattenLayerCount).toBe(1);
    expect(audit.flattenedLayers[0].targetBlendMode).toBe("normal");
    expect(audit.flattenedLayers[0].oklabMeanDeltaE).toBeGreaterThan(0);
    expect(audit.blockers.some((r) => r.code === "pass-through-group-flatten-risk")).toBe(true);
  });

  it("하위 효과가 없는 pass-through 폴더도 Procreate 변환 시 warning 격리 경고를 기록한다", () => {
    const audit = translateDccLayerTree({
      documentId: "pt-plain-folder",
      documentTitleKo: "단순 정리 폴더",
      sourceDcc: "photoshop-psd",
      targetDcc: "procreate",
      layers: [
        {
          layerId: "grp-plain",
          nameKo: "정리 폴더",
          layerKind: "group-folder",
          blendMode: "pass-through",
          opacity: 1,
          clippingMask: false,
          bitDepth: 8,
          children: [
            { layerId: "base", nameKo: "밑색", layerKind: "raster", blendMode: "normal", opacity: 1, clippingMask: false, bitDepth: 8 },
          ],
        },
      ],
    });
    expect(audit.riskCountByCode["pass-through-group-flatten-risk"]).toBe(1);
    expect(audit.blockers).toHaveLength(0);
    expect(audit.warnings).toHaveLength(1);
    expect(audit.auditGrade).toBe("WARN");
  });

  it("text-editable 및 adjustment-curve 레이어를 Procreate로 보낼 때 식자 손실·보정 병합 위험을 탐지한다", () => {
    const audit = translateDccLayerTree({
      documentId: "text-adj-procreate",
      documentTitleKo: "식자 및 색보정 컷",
      sourceDcc: "toonstudio",
      targetDcc: "procreate",
      layers: [
        { layerId: "txt-sfx", nameKo: "효과음 식자", layerKind: "text-editable", blendMode: "normal", opacity: 1, clippingMask: false, bitDepth: 8 },
        { layerId: "adj-night", nameKo: "야간 톤 커브", layerKind: "adjustment-curve", blendMode: "normal", opacity: 1, clippingMask: false, bitDepth: 8 },
      ],
    });
    expect(audit.riskCountByCode["text-outline-loss"]).toBe(1);
    expect(audit.riskCountByCode["adjustment-layer-flatten-risk"]).toBe(1);
    expect(audit.rasterizationRiskLayerCount).toBe(2);
  });

  it("3d-reference 레이어를 PSD로 내보낼 때 3d-reference-rasterization-loss를 포착한다", () => {
    const audit = translateDccLayerTree({
      documentId: "3d-pose-psd",
      documentTitleKo: "3D 배경 참조 컷",
      sourceDcc: "clip-studio-paint",
      targetDcc: "photoshop-psd",
      layers: [
        { layerId: "ref-3d", nameKo: "교실 3D 배치", layerKind: "3d-reference", blendMode: "normal", opacity: 1, clippingMask: false, bitDepth: 8 },
      ],
    });
    expect(audit.riskCountByCode["3d-reference-rasterization-loss"]).toBe(1);
  });

  it("중첩 트리의 depth·parentLayerId·전위 순회 개수와 비정상 opacity 입력을 안전하게 정규화한다", () => {
    const audit = translateDccLayerTree({
      documentId: "nested-tree-sanitize",
      documentTitleKo: "중첩 폴더 정규화",
      sourceDcc: "toonstudio",
      targetDcc: "toonstudio",
      layers: [
        {
          layerId: "root",
          nameKo: "루트",
          layerKind: "group-folder",
          blendMode: "pass-through",
          opacity: 1.5,
          clippingMask: false,
          bitDepth: 8,
          children: [
            {
              layerId: "sub",
              nameKo: "하위",
              layerKind: "group-folder",
              blendMode: "normal",
              opacity: Number.NaN,
              clippingMask: false,
              bitDepth: 8,
              children: [
                { layerId: "leaf", nameKo: "말단", layerKind: "raster", blendMode: "multiply", opacity: -0.4, clippingMask: true, bitDepth: 8, visible: false },
              ],
            },
          ],
        },
      ],
    });
    expect(audit.flattenedLayers.map((l) => [l.layerId, l.depth, l.parentLayerId])).toEqual([
      ["root", 0, null],
      ["sub", 1, "root"],
      ["leaf", 2, "sub"],
    ]);
    expect(audit.flattenedLayers.map((l) => l.sourceOpacity)).toEqual([1, 1, 0]);
    expect(audit.flattenedLayers[2].visible).toBe(false);
  });
});

describe("Wave 155 — FIPS 180-4 SHA-256 결정론, 순수 OKLCH SVG 및 한국어 TD 브리프", () => {
  it("sha256CrossDccHex는 공식 FIPS 180-4 테스트 벡터 및 UTF-8 한글 해시를 정확히 계산한다", () => {
    expect(sha256CrossDccHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256CrossDccHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const kr = sha256CrossDccHex("웹툰 크로스 DCC 블렌드 감사");
    expect(kr).toMatch(/^[0-9a-f]{64}$/);
    expect(kr).toBe(sha256CrossDccHex("웹툰 크로스 DCC 블렌드 감사"));
  });

  it("동일 입력 재실행 시 translationManifestSha256Hex는 비트-동일하며 입력 변조 시 즉시 달라진다", () => {
    const baseInput = {
      documentId: "det-check-01",
      documentTitleKo: "결정론 검증 문서",
      sourceDcc: "clip-studio-paint" as const,
      targetDcc: "photoshop-psd" as const,
      layers: createCspWebtoonMasterLayers(),
    };
    const run1 = translateDccLayerTree(baseInput);
    const run2 = translateDccLayerTree(baseInput);
    expect(run1.translationManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(run1.translationManifestSha256Hex).toBe(run2.translationManifestSha256Hex);
    const mutated = translateDccLayerTree({ ...baseInput, targetDcc: "procreate" });
    expect(mutated.translationManifestSha256Hex).not.toBe(run1.translationManifestSha256Hex);
  });

  it("renderDccCompatibilityAuditSvg는 순수 oklch(...) 색상만 사용하며 원시 hex/rgb/hsl이 0건이다", () => {
    const audit = translateDccLayerTree({
      documentId: "svg-oklch-test",
      documentTitleKo: "제15화 클라이맥스 컷",
      sourceDcc: "clip-studio-paint",
      targetDcc: "photoshop-psd",
      layers: createCspWebtoonMasterLayers(),
    });
    const svg = renderDccCompatibilityAuditSvg(audit, { artistNoteKo: "선화 확정 뒤 PSD 채색팀 전달" });
    expect(svg.startsWith("<svg ") && svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toMatch(/\bhsla?\s*\(/i);
    expect(svg).toContain("ToonStudio");
    expect(svg).toContain("Procreate");
    expect(svg).toContain("Krita");
    expect(svg).toContain("add-glow → linear-dodge");
    expect(svg).toContain(audit.translationManifestSha256Hex);
  });

  it("SVG 렌더러와 escapeDccAuditXml은 XSS·XML 인젝션 페이로드를 완전히 이스케이프한다", () => {
    expect(escapeDccAuditXml(`<script>alert("x"&'y')</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;&amp;&#39;y&#39;)&lt;/script&gt;",
    );
    const xssAudit = translateDccLayerTree({
      documentId: `doc<img src=x onerror=alert(1)>`,
      documentTitleKo: `컷 <script>alert("xss")</script> & 검수`,
      sourceDcc: "clip-studio-paint",
      targetDcc: "photoshop-psd",
      layers: [
        { layerId: "xss-l", nameKo: `먹선 <svg onload=alert(2)> '테스트'`, layerKind: "vector-ink", blendMode: "add-glow", opacity: 0.8, clippingMask: false, bitDepth: 8 },
      ],
    });
    const svg = renderDccCompatibilityAuditSvg(xssAudit, { artistNoteKo: `메모 "<script>evil()</script>"` });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).not.toContain("<svg onload=");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&lt;svg onload=");
  });

  it("빈 레이어 문서와 레이어 초과 문서(overflow)에서도 유효한 SVG를 안전하게 생성한다", () => {
    const emptyAudit = translateDccLayerTree({
      documentId: "empty-doc",
      documentTitleKo: "빈 문서",
      sourceDcc: "toonstudio",
      targetDcc: "photoshop-psd",
      layers: [],
    });
    expect(renderDccCompatibilityAuditSvg(emptyAudit)).toContain("검사할 레이어가 없습니다.");

    const manyLayers: DccLayerNode[] = [];
    for (let i = 0; i < 14; i += 1) {
      manyLayers.push({ layerId: `l-${i}`, nameKo: `채색 ${i + 1}`, layerKind: "raster", blendMode: "normal", opacity: 1, clippingMask: false, bitDepth: 8 });
    }
    const largeAudit = translateDccLayerTree({
      documentId: "large-doc",
      documentTitleKo: "대형 레이어 문서",
      sourceDcc: "toonstudio",
      targetDcc: "photoshop-psd",
      layers: manyLayers,
    });
    expect(renderDccCompatibilityAuditSvg(largeAudit, { maxVisibleLayers: 6 })).toContain(
      "외 8개 레이어는 전체 감사 매니페스트에 포함되어 있습니다.",
    );
  });

  it("summarizeDccTranslationAuditKo는 무손실/손실 문서 모두 번역투 없는 자연스러운 한국어 TD 브리프를 반환한다", () => {
    const forbidden = ["가능하게 합니다", "직관적인 경험을 제공합니다", "원활한 워크플로우를 보장합니다"];
    const losslessBrief = summarizeDccTranslationAuditKo(
      translateDccLayerTree({
        documentId: "ko-brief-lossless",
        documentTitleKo: "제3화 무손실 검수",
        sourceDcc: "clip-studio-paint",
        targetDcc: "toonstudio",
        layers: createCspWebtoonMasterLayers(),
      }),
    );
    expect(losslessBrief.grade).toBe("PASS");
    expect(losslessBrief.isStrictLossless && losslessBrief.compatibilityScore === 100).toBe(true);

    const lossyBrief = summarizeDccTranslationAuditKo(
      translateDccLayerTree({
        documentId: "ko-brief-lossy",
        documentTitleKo: "제12화 PSD 출고",
        sourceDcc: "clip-studio-paint",
        targetDcc: "photoshop-psd",
        layers: createCspWebtoonMasterLayers(),
      }),
    );
    expect(lossyBrief.grade).toBe("FAIL");
    expect(lossyBrief.actionItemsKo.length).toBeGreaterThanOrEqual(4);
    expect(lossyBrief.riskBreakdownLinesKo.some((line) => line.includes("블렌드 근사"))).toBe(true);
    expect(lossyBrief.riskBreakdownLinesKo.some((line) => line.includes("벡터 래스터화"))).toBe(true);
    expect(lossyBrief.riskBreakdownLinesKo.some((line) => line.includes("망점 래스터화"))).toBe(true);

    const combined = [
      losslessBrief.headlineKo,
      losslessBrief.summaryParagraphKo,
      ...losslessBrief.actionItemsKo,
      lossyBrief.headlineKo,
      lossyBrief.summaryParagraphKo,
      ...lossyBrief.actionItemsKo,
    ].join(" ");
    for (let i = 0; i < forbidden.length; i += 1) {
      expect(combined).not.toContain(forbidden[i]);
    }
  });
});
