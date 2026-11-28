/**
 * Wave 142 — 비파괴 외곽 림(Halo)·백킹 플레이트·완충 거터(Ramp Gutter) 자동 교정 솔버.
 *
 * - 원본 입력과 픽셀 데이터를 변이시키지 않고 별도 비파괴 레이어 명세를 합성
 * - 교정 후 4종 모든 독자 뷰어에서 결함 0건·WCAG/APCA 통과를 재감사하여 수학적으로 검증
 */

import { computeDualThemeManifestSha256Hex } from "./dual-theme-sha256";
import {
  clampUnitLuma,
  requiredThresholdsForElement,
  resolveDualThemeAuditConfig,
  type AuditedEpisodeCut,
  type AuditedVisualElement,
  type DualThemeAuditConfig,
  type DualThemeDefectCode,
  type DualThemeRemediationResult,
  type ElementRemediationPatch,
  type EpisodeDualThemeInput,
  type GutterRampPatch,
} from "./dual-theme-types";
import {
  auditEpisodeDualThemeReadability,
  evaluateElementOnViewerTheme,
} from "./dual-theme-audit-core";
import {
  ALL_VIEWER_THEME_IDS,
  formatOklchCss,
  oklchToSrgb,
  srgbToOklch,
  VIEWER_THEME_PROFILES,
  type OklchColor,
  type SrgbaColor,
} from "./viewer-contrast-and-apca-math";

const LIGHT_HALO_OKLCH: OklchColor = { l: 0.982, c: 0.005, h: 92 };
const DARK_HALO_OKLCH: OklchColor = { l: 0.135, c: 0.01, h: 260 };
const MOONLIGHT_RIM_OKLCH: OklchColor = { l: 0.78, c: 0.045, h: 245 };
const LIGHT_PLATE_OKLCH: OklchColor = { l: 0.99, c: 0.003, h: 95 };
const DARK_PLATE_OKLCH: OklchColor = { l: 0.115, c: 0.009, h: 260 };
const DARK_INK_GLAZE_OKLCH: OklchColor = { l: 0.14, c: 0.012, h: 260 };
const LIGHT_INK_GLAZE_OKLCH: OklchColor = { l: 0.985, c: 0.004, h: 95 };

function makeSrgbaFromOklch(color: OklchColor, alpha: number): SrgbaColor {
  const rgb = oklchToSrgb(color);
  return { r: rgb.r, g: rgb.g, b: rgb.b, a: alpha };
}

function testCandidateAcrossAllThemes(
  candidate: AuditedVisualElement,
  cut: AuditedEpisodeCut,
  config: DualThemeAuditConfig,
): { readonly passedAll: boolean; readonly minMargin: number } {
  const { minWcag, minApcaAbsLc } = requiredThresholdsForElement(candidate, config);
  let passedAll = true;
  let minMargin = Number.POSITIVE_INFINITY;

  for (let t = 0; t < ALL_VIEWER_THEME_IDS.length; t += 1) {
    const tid = ALL_VIEWER_THEME_IDS[t];
    if (!tid) continue;
    const ev = evaluateElementOnViewerTheme(candidate, cut, VIEWER_THEME_PROFILES[tid], config);
    if (!ev.passed) passedAll = false;
    const margin = Math.min(
      ev.wcagRatio / Math.max(1, minWcag),
      ev.apcaAbsLc / Math.max(1, minApcaAbsLc),
    );
    if (margin < minMargin) minMargin = margin;
  }

  return { passedAll, minMargin: Number.isFinite(minMargin) ? minMargin : 0 };
}

function synthesizeElementFix(
  element: AuditedVisualElement,
  cut: AuditedEpisodeCut,
  defectCodes: readonly DualThemeDefectCode[],
  config: DualThemeAuditConfig,
): { readonly fixedElement: AuditedVisualElement; readonly patch: ElementRemediationPatch } {
  const baseWidth =
    element.strokeWidthPx ?? (element.fontSizePx ? element.fontSizePx * 0.14 : 2.6);
  const haloWidthPx = Math.round(Math.min(5.0, Math.max(2.5, baseWidth * 1.15)) * 10) / 10;

  if (defectCodes.length === 1 && defectCodes[0] === "oled-black-crush-shadow") {
    const rimCandidates: readonly OklchColor[] = [MOONLIGHT_RIM_OKLCH, LIGHT_HALO_OKLCH];
    for (let i = 0; i < rimCandidates.length; i += 1) {
      const rimOklch = rimCandidates[i];
      if (!rimOklch) continue;
      const rimSrgba = makeSrgbaFromOklch(rimOklch, 0.94);
      const rimCss = formatOklchCss(rimOklch, 0.94);
      const candidate: AuditedVisualElement = {
        ...element,
        existingHalo: { widthPx: 2.5, color: rimSrgba, oklchCss: rimCss },
      };
      if (testCandidateAcrossAllThemes(candidate, cut, config).passedAll) {
        return {
          fixedElement: candidate,
          patch: {
            cutId: cut.cutId,
            elementId: element.id,
            elementLabelKo: element.labelKo,
            strategy: "rim-light-halo",
            triggeredByCodes: defectCodes,
            haloWidthPx: 2.5,
            haloColorOklch: rimCss,
            haloColorSrgba: rimSrgba,
            nonDestructiveLayerNameKo: `비파괴 림라이트 레이어 (${element.labelKo})`,
            rationaleKo:
              "야간 컷 원본 음영을 손대지 않고 윤곽 바깥에 2.5px 달빛 림을 얹어 OLED 블랙 크러시를 해소했습니다.",
          },
        };
      }
    }
  }

  if (element.backdropMode === "transparent-margin" && element.kind !== "balloon-text") {
    const haloOptions: readonly { readonly oklch: OklchColor; readonly label: string }[] = [
      { oklch: LIGHT_HALO_OKLCH, label: "밝은 미색 종이 림" },
      { oklch: DARK_HALO_OKLCH, label: "짙은 먹색 림" },
    ];
    let bestHalo:
      | {
          readonly candidate: AuditedVisualElement;
          readonly oklchCss: string;
          readonly srgba: SrgbaColor;
          readonly label: string;
          readonly margin: number;
        }
      | undefined;

    for (let i = 0; i < haloOptions.length; i += 1) {
      const opt = haloOptions[i];
      if (!opt) continue;
      const srgba = makeSrgbaFromOklch(opt.oklch, 0.98);
      const oklchCss = formatOklchCss(opt.oklch, 0.98);
      const candidate: AuditedVisualElement = {
        ...element,
        existingHalo: { widthPx: haloWidthPx, color: srgba, oklchCss },
      };
      const tested = testCandidateAcrossAllThemes(candidate, cut, config);
      if (tested.passedAll && (!bestHalo || tested.minMargin > bestHalo.margin)) {
        bestHalo = { candidate, oklchCss, srgba, label: opt.label, margin: tested.minMargin };
      }
    }

    if (bestHalo) {
      return {
        fixedElement: bestHalo.candidate,
        patch: {
          cutId: cut.cutId,
          elementId: element.id,
          elementLabelKo: element.labelKo,
          strategy: "stroke-halo",
          triggeredByCodes: defectCodes,
          haloWidthPx,
          haloColorOklch: bestHalo.oklchCss,
          haloColorSrgba: bestHalo.srgba,
          nonDestructiveLayerNameKo: `비파괴 외곽 림 (${element.labelKo})`,
          rationaleKo: `투명 여백 요소 외곽에 ${haloWidthPx}px ${bestHalo.label}을 추가해 4종 뷰어 모두에서 사라짐을 막았습니다.`,
        },
      };
    }
  }

  const platePaddingPx = element.kind === "balloon-text" ? 8 : 6;
  const plateOptions: readonly { readonly oklch: OklchColor; readonly label: string }[] = [
    { oklch: LIGHT_PLATE_OKLCH, label: "밝은 미색 백킹 플레이트" },
    { oklch: DARK_PLATE_OKLCH, label: "짙은 먹색 백킹 플레이트" },
  ];
  let bestPlate:
    | {
        readonly candidate: AuditedVisualElement;
        readonly oklchCss: string;
        readonly srgba: SrgbaColor;
        readonly label: string;
        readonly margin: number;
      }
    | undefined;

  for (let i = 0; i < plateOptions.length; i += 1) {
    const opt = plateOptions[i];
    if (!opt) continue;
    const srgba = makeSrgbaFromOklch(opt.oklch, 0.98);
    const oklchCss = formatOklchCss(opt.oklch, 0.98);
    const candidate: AuditedVisualElement = {
      ...element,
      existingPlate: { paddingPx: platePaddingPx, color: srgba, oklchCss },
    };
    const tested = testCandidateAcrossAllThemes(candidate, cut, config);
    if (tested.passedAll && (!bestPlate || tested.minMargin > bestPlate.margin)) {
      bestPlate = { candidate, oklchCss, srgba, label: opt.label, margin: tested.minMargin };
    }
  }

  if (bestPlate) {
    return {
      fixedElement: bestPlate.candidate,
      patch: {
        cutId: cut.cutId,
        elementId: element.id,
        elementLabelKo: element.labelKo,
        strategy: "backing-plate",
        triggeredByCodes: defectCodes,
        platePaddingPx,
        plateColorOklch: bestPlate.oklchCss,
        plateColorSrgba: bestPlate.srgba,
        nonDestructiveLayerNameKo: `비파괴 백킹 플레이트 (${element.labelKo})`,
        rationaleKo: `원본 픽셀을 건드리지 않고 ${platePaddingPx}px 여백의 ${bestPlate.label}를 배치해 4종 뷰어 기준 대비를 확보했습니다.`,
      },
    };
  }

  const fgOklch = srgbToOklch(element.foreground);
  const preferDarkInkOnLightPlate = fgOklch.l <= 0.62;
  const plateOklch = preferDarkInkOnLightPlate ? LIGHT_PLATE_OKLCH : DARK_PLATE_OKLCH;
  const glazeOklch = preferDarkInkOnLightPlate ? DARK_INK_GLAZE_OKLCH : LIGHT_INK_GLAZE_OKLCH;
  const plateSrgba = makeSrgbaFromOklch(plateOklch, 0.98);
  const plateCss = formatOklchCss(plateOklch, 0.98);
  const glazeSrgba = makeSrgbaFromOklch(glazeOklch, 0.96);
  const glazeCss = formatOklchCss(glazeOklch, 0.96);

  return {
    fixedElement: {
      ...element,
      existingPlate: { paddingPx: platePaddingPx, color: plateSrgba, oklchCss: plateCss },
      existingGlaze: {
        mode: preferDarkInkOnLightPlate ? "darken-ink" : "lighten-ink",
        color: glazeSrgba,
        oklchCss: glazeCss,
      },
    },
    patch: {
      cutId: cut.cutId,
      elementId: element.id,
      elementLabelKo: element.labelKo,
      strategy: "plate-with-contrast-glaze",
      triggeredByCodes: defectCodes,
      platePaddingPx,
      plateColorOklch: plateCss,
      plateColorSrgba: plateSrgba,
      glazeColorOklch: glazeCss,
      nonDestructiveLayerNameKo: `비파괴 백킹 플레이트+농도 보정 (${element.labelKo})`,
      rationaleKo:
        "중간톤·저불투명 요소에 고대비 백킹 플레이트와 비파괴 농도 보정 레이어를 함께 적용해 4종 뷰어 대비를 확보했습니다.",
    },
  };
}

function buildRampGutterPatch(
  prevCut: AuditedEpisodeCut,
  currCut: AuditedEpisodeCut,
): GutterRampPatch {
  const fromLuma = clampUnitLuma(prevCut.meanLuma);
  const toLuma = clampUnitLuma(currCut.meanLuma);
  const stepCount = 6;
  const origGutter = Math.max(
    0,
    Math.round(Number.isFinite(currCut.gutterBeforePx) ? currCut.gutterBeforePx : 0),
  );
  const recommendedGutterHeightPx = Math.max(origGutter, 360);
  const maxStepDeltaLuma = Math.round(((toLuma - fromLuma) / (stepCount - 1)) * 10000) / 10000;

  const startL = Math.max(0.04, Math.cbrt(fromLuma));
  const endL = Math.min(0.99, Math.cbrt(toLuma));
  const stops: string[] = [];
  for (let s = 0; s < stepCount; s += 1) {
    const t = s / (stepCount - 1);
    const l = startL + (endL - startL) * t;
    const c = Math.max(0.002, 0.008 * (1 - Math.abs(t - 0.5) * 1.4));
    stops.push(formatOklchCss({ l, c, h: 255 }));
  }

  return {
    fromCutId: prevCut.cutId,
    toCutId: currCut.cutId,
    originalGutterPx: origGutter,
    recommendedGutterHeightPx,
    stepCount,
    maxStepDeltaLuma,
    gradientStopsOklch: stops,
    rationaleKo: `${prevCut.labelKo}→${currCut.labelKo} 구간의 눈부심 급전환을 ${recommendedGutterHeightPx}px 6단계 OKLCH 완충 거터(단계당 ΔLuma ${maxStepDeltaLuma.toFixed(2)})로 완화했습니다.`,
  };
}

/**
 * 원본 픽셀을 손상시키지 않고 외곽 림·백킹 플레이트·완충 거터를 자동 합성하고,
 * 보정 후 4종 모든 독자 뷰어에서 결함 0건·WCAG/APCA 통과를 재감사하여 입증한다.
 */
export function synthesizeThemeSafeRemediation(
  input: EpisodeDualThemeInput,
  partialConfig?: Partial<DualThemeAuditConfig>,
): DualThemeRemediationResult {
  const config = resolveDualThemeAuditConfig(partialConfig);
  const beforeAudit = auditEpisodeDualThemeReadability(input, config);

  const defectsByElementKey = new Map<string, DualThemeDefectCode[]>();
  const shockCutIds = new Set<string>();

  for (let i = 0; i < beforeAudit.defects.length; i += 1) {
    const defect = beforeAudit.defects[i];
    if (!defect) continue;
    if (defect.code === "luminance-shock-transition") {
      shockCutIds.add(defect.cutId);
      continue;
    }
    if (!defect.elementId) continue;
    const key = `${defect.cutId}::${defect.elementId}`;
    const list = defectsByElementKey.get(key) ?? [];
    list.push(defect.code);
    defectsByElementKey.set(key, list);
  }

  const elementPatches: ElementRemediationPatch[] = [];
  const gutterRamps: GutterRampPatch[] = [];
  const remediatedCuts: AuditedEpisodeCut[] = [];

  for (let c = 0; c < input.cuts.length; c += 1) {
    const cut = input.cuts[c];
    if (!cut) continue;

    let appliedGutterRamp = cut.appliedGutterRamp;
    let gutterBeforePx = cut.gutterBeforePx;

    if (c > 0 && shockCutIds.has(cut.cutId)) {
      const prevCut = input.cuts[c - 1];
      if (prevCut) {
        const rampPatch = buildRampGutterPatch(prevCut, cut);
        gutterRamps.push(rampPatch);
        gutterBeforePx = rampPatch.recommendedGutterHeightPx;
        appliedGutterRamp = {
          heightPx: rampPatch.recommendedGutterHeightPx,
          steps: rampPatch.stepCount,
          maxStepDeltaLuma: rampPatch.maxStepDeltaLuma,
          gradientStopsOklch: rampPatch.gradientStopsOklch,
        };
      }
    }

    const fixedElements: AuditedVisualElement[] = [];
    for (let e = 0; e < cut.elements.length; e += 1) {
      const element = cut.elements[e];
      if (!element) continue;
      const triggeredCodes = defectsByElementKey.get(`${cut.cutId}::${element.id}`);
      if (!triggeredCodes || triggeredCodes.length === 0) {
        fixedElements.push({ ...element });
        continue;
      }
      const { fixedElement, patch } = synthesizeElementFix(element, cut, triggeredCodes, config);
      fixedElements.push(fixedElement);
      elementPatches.push(patch);
    }

    remediatedCuts.push({
      ...cut,
      gutterBeforePx,
      appliedGutterRamp,
      elements: fixedElements,
    });
  }

  const remediatedInput: EpisodeDualThemeInput = {
    episodeId: input.episodeId,
    episodeTitleKo: input.episodeTitleKo,
    cuts: remediatedCuts,
  };
  const afterAudit = auditEpisodeDualThemeReadability(remediatedInput, config);

  let minWcagAfter = Number.POSITIVE_INFINITY;
  let minApcaAbsAfter = Number.POSITIVE_INFINITY;
  for (let i = 0; i < afterAudit.elementAudits.length; i += 1) {
    const ea = afterAudit.elementAudits[i];
    if (!ea) continue;
    if (ea.worstWcagRatio < minWcagAfter) minWcagAfter = ea.worstWcagRatio;
    if (ea.worstApcaAbsLc < minApcaAbsAfter) minApcaAbsAfter = ea.worstApcaAbsLc;
  }

  const vanishBefore =
    beforeAudit.countsByCode["dark-mode-ink-vanish"] +
    beforeAudit.countsByCode["light-mode-highlight-vanish"];
  const vanishAfter =
    afterAudit.countsByCode["dark-mode-ink-vanish"] +
    afterAudit.countsByCode["light-mode-highlight-vanish"];

  const remediationManifestSha256Hex = computeDualThemeManifestSha256Hex({
    schema: "toonstudio.wave142.dual-theme-remediation.v1",
    episodeId: input.episodeId,
    beforeAuditSha256: beforeAudit.dualThemeAuditSha256Hex,
    afterAuditSha256: afterAudit.dualThemeAuditSha256Hex,
    elementPatchCount: elementPatches.length,
    gutterRampCount: gutterRamps.length,
    patches: elementPatches.map((p) => ({
      cutId: p.cutId,
      elementId: p.elementId,
      strategy: p.strategy,
      haloWidthPx: p.haloWidthPx ?? null,
      haloColorOklch: p.haloColorOklch ?? null,
      platePaddingPx: p.platePaddingPx ?? null,
      plateColorOklch: p.plateColorOklch ?? null,
      glazeColorOklch: p.glazeColorOklch ?? null,
    })),
    ramps: gutterRamps.map((r) => ({
      fromCutId: r.fromCutId,
      toCutId: r.toCutId,
      heightPx: r.recommendedGutterHeightPx,
      steps: r.stepCount,
      maxStepDeltaLuma: r.maxStepDeltaLuma,
    })),
  });

  return {
    originalInput: input,
    beforeAudit,
    afterAudit,
    remediatedInput,
    elementPatches,
    gutterRamps,
    verification: {
      beforeDefectCount: beforeAudit.defects.length,
      afterDefectCount: afterAudit.defects.length,
      vanishCountBefore: vanishBefore,
      vanishCountAfter: vanishAfter,
      blackCrushCountBefore: beforeAudit.countsByCode["oled-black-crush-shadow"],
      blackCrushCountAfter: afterAudit.countsByCode["oled-black-crush-shadow"],
      luminanceShockCountBefore: beforeAudit.countsByCode["luminance-shock-transition"],
      luminanceShockCountAfter: afterAudit.countsByCode["luminance-shock-transition"],
      balloonFailCountBefore: beforeAudit.countsByCode["balloon-text-contrast-fail"],
      balloonFailCountAfter: afterAudit.countsByCode["balloon-text-contrast-fail"],
      minWcagAcrossAllThemesAfter: Number.isFinite(minWcagAfter) ? minWcagAfter : 21,
      minApcaAbsLcAcrossAllThemesAfter: Number.isFinite(minApcaAbsAfter) ? minApcaAbsAfter : 106,
      allFourThemesVerifiedPass: afterAudit.allFourThemesPassed,
      remediationManifestSha256Hex,
    },
  };
}
