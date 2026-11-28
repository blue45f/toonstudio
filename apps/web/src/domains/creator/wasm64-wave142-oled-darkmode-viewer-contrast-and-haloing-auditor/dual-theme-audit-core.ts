/**
 * Wave 142 — 웹툰 연속 컷 양면 뷰어(라이트/세피아/다크/OLED) 5종 치명 결함 핵심 감사 엔진.
 *
 * - `dark-mode-ink-vanish`, `light-mode-highlight-vanish`, `oled-black-crush-shadow`,
 *   `luminance-shock-transition`, `balloon-text-contrast-fail` 정밀 판정
 * - 순수 ES2017 동기 FIPS 180-4 SHA-256 양면 뷰어 인증 매니페스트 지문 생성
 */

import { computeDualThemeManifestSha256Hex } from "./dual-theme-sha256";
import {
  clampUnitLuma,
  requiredThresholdsForElement,
  resolveDualThemeAuditConfig,
  type AuditedEpisodeCut,
  type AuditedVisualElement,
  type CutLuminanceTransition,
  type DualThemeAuditConfig,
  type DualThemeAuditReport,
  type DualThemeDefect,
  type DualThemeDefectCode,
  type ElementAuditSummary,
  type ElementThemeEvaluation,
  type EpisodeDualThemeInput,
  type ThemeReadinessSummary,
} from "./dual-theme-types";
import {
  ALL_VIEWER_THEME_IDS,
  compositeSrgbOverBackground,
  evaluateColorPairContrast,
  VIEWER_THEME_PROFILES,
  type SrgbColor,
  type SrgbaColor,
  type ThemeContrastMeasurement,
  type ViewerThemeId,
  type ViewerThemeProfile,
} from "./viewer-contrast-and-apca-math";

function getEffectiveForegroundSrgba(element: AuditedVisualElement): SrgbaColor {
  if (!element.existingGlaze) return element.foreground;
  const glaze = element.existingGlaze.color;
  const blended = compositeSrgbOverBackground(glaze, element.foreground);
  return {
    r: blended.r,
    g: blended.g,
    b: blended.b,
    a: Math.max(element.foreground.a, glaze.a),
  };
}

function resolveBackdropForTheme(
  element: AuditedVisualElement,
  cut: AuditedEpisodeCut,
  themeProfile: ViewerThemeProfile,
): SrgbColor {
  if (element.backdropMode === "transparent-margin") return themeProfile.backgroundSrgb;
  if (element.localBackdrop) return element.localBackdrop;
  if (cut.cutBaseColor) return cut.cutBaseColor;
  return themeProfile.backgroundSrgb;
}

/** 단일 시각 요소를 특정 독자 뷰어 테마 위에서 합성·대비·림/플레이트 보조 효과까지 평가한다. */
export function evaluateElementOnViewerTheme(
  element: AuditedVisualElement,
  cut: AuditedEpisodeCut,
  themeProfile: ViewerThemeProfile,
  config: DualThemeAuditConfig,
): ElementThemeEvaluation {
  const baseBg = resolveBackdropForTheme(element, cut, themeProfile);
  const effectiveFg = getEffectiveForegroundSrgba(element);
  const { minWcag, minApcaAbsLc } = requiredThresholdsForElement(element, config);

  let wcagRatio: number;
  let apcaLc: number;
  let apcaAbsLc: number;
  let oklabDeltaE: number;
  let effFgLum: number;
  let effBgLum: number;
  let usedHaloAssist = false;
  let usedPlateAssist = false;

  if (element.existingPlate) {
    const plateBg = compositeSrgbOverBackground(element.existingPlate.color, baseBg);
    const fgOverPlate = compositeSrgbOverBackground(effectiveFg, plateBg);
    const m: ThemeContrastMeasurement = evaluateColorPairContrast(fgOverPlate, plateBg);
    wcagRatio = m.wcagRatio;
    apcaLc = m.apcaLc;
    apcaAbsLc = m.apcaAbsLc;
    oklabDeltaE = m.oklabDeltaE;
    effFgLum = m.foregroundLuminance;
    effBgLum = m.backgroundLuminance;
    usedPlateAssist = true;
  } else {
    const fgOverBase = compositeSrgbOverBackground(effectiveFg, baseBg);
    const direct = evaluateColorPairContrast(fgOverBase, baseBg);
    wcagRatio = direct.wcagRatio;
    apcaLc = direct.apcaLc;
    apcaAbsLc = direct.apcaAbsLc;
    oklabDeltaE = direct.oklabDeltaE;
    effFgLum = direct.foregroundLuminance;
    effBgLum = direct.backgroundLuminance;

    if (element.existingHalo && element.existingHalo.widthPx > 0) {
      const haloComp = compositeSrgbOverBackground(element.existingHalo.color, baseBg);
      const fgOverHalo = compositeSrgbOverBackground(effectiveFg, haloComp);
      const inner = evaluateColorPairContrast(fgOverHalo, haloComp);
      const outer = evaluateColorPairContrast(haloComp, baseBg);
      const widthScale =
        element.existingHalo.widthPx >= 1.5
          ? 1.0
          : Math.max(0.25, element.existingHalo.widthPx / 1.5);

      const rimWcag = Math.min(inner.wcagRatio, outer.wcagRatio) * widthScale;
      const rimApcaAbs = Math.min(inner.apcaAbsLc, outer.apcaAbsLc) * widthScale;
      const rimDeltaE = Math.min(inner.oklabDeltaE, outer.oklabDeltaE) * widthScale;

      if (rimWcag > wcagRatio || rimApcaAbs > apcaAbsLc) {
        usedHaloAssist = true;
        if (rimWcag > wcagRatio) wcagRatio = rimWcag;
        if (rimApcaAbs > apcaAbsLc) {
          apcaAbsLc = rimApcaAbs;
          const governing = inner.apcaAbsLc <= outer.apcaAbsLc ? inner : outer;
          apcaLc = governing.apcaLc >= 0 ? rimApcaAbs : -rimApcaAbs;
        }
        if (rimDeltaE > oklabDeltaE) oklabDeltaE = rimDeltaE;
        if (rimWcag >= minWcag && rimApcaAbs >= minApcaAbsLc) {
          effFgLum = Math.max(effFgLum, outer.foregroundLuminance);
        }
      }
    }
  }

  const meetsBasicContrast = wcagRatio >= minWcag && apcaAbsLc >= minApcaAbsLc;
  const isBlackCrushed =
    themeProfile.isOledTrueBlack &&
    (element.kind === "character-contour" ||
      (element.backdropMode === "opaque-panel" && clampUnitLuma(cut.meanLuma) < 0.14)) &&
    effFgLum < config.oledBlackCrushMaxLuminance &&
    (wcagRatio < config.oledBlackCrushMinWcag ||
      apcaAbsLc < config.oledBlackCrushMinApcaAbsLc);

  let passed: boolean;
  if (element.kind === "balloon-text") {
    passed = meetsBasicContrast;
  } else if (element.backdropMode === "transparent-margin") {
    passed = meetsBasicContrast && !isBlackCrushed;
  } else {
    passed = !isBlackCrushed;
  }

  return {
    themeId: themeProfile.id,
    wcagRatio,
    apcaLc,
    apcaAbsLc,
    oklabDeltaE,
    effectiveForegroundLuminance: effFgLum,
    effectiveBackgroundLuminance: effBgLum,
    passed,
    usedHaloAssist,
    usedPlateAssist,
  };
}

function emptyCountsByCode(): Record<DualThemeDefectCode, number> {
  return {
    "dark-mode-ink-vanish": 0,
    "light-mode-highlight-vanish": 0,
    "oled-black-crush-shadow": 0,
    "luminance-shock-transition": 0,
    "balloon-text-contrast-fail": 0,
  };
}

function collectFailedThemesStats(
  perTheme: Readonly<Record<ViewerThemeId, ElementThemeEvaluation>>,
  themeIds: readonly ViewerThemeId[],
): {
  readonly failedThemes: readonly ViewerThemeId[];
  readonly minWcag: number;
  readonly worstLc: number;
} {
  const failedThemes: ViewerThemeId[] = [];
  let minWcag = Number.POSITIVE_INFINITY;
  let minAbsLc = Number.POSITIVE_INFINITY;
  let worstLc = 0;

  for (let i = 0; i < themeIds.length; i += 1) {
    const tid = themeIds[i];
    if (!tid) continue;
    const ev = perTheme[tid];
    if (ev.passed) continue;
    failedThemes.push(tid);
    if (ev.wcagRatio < minWcag) minWcag = ev.wcagRatio;
    if (ev.apcaAbsLc < minAbsLc) {
      minAbsLc = ev.apcaAbsLc;
      worstLc = ev.apcaLc;
    }
  }
  return { failedThemes, minWcag, worstLc };
}

/**
 * 에피소드 전체 컷과 투명 여백·말풍선·야간 윤곽선 요소를 4종 독자 뷰어 기준으로 감사한다.
 */
export function auditEpisodeDualThemeReadability(
  input: EpisodeDualThemeInput,
  partialConfig?: Partial<DualThemeAuditConfig>,
): DualThemeAuditReport {
  const config = resolveDualThemeAuditConfig(partialConfig);
  const auditedThemes: readonly ViewerThemeProfile[] = ALL_VIEWER_THEME_IDS.map(
    (id) => VIEWER_THEME_PROFILES[id],
  );
  const darkThemeIds: readonly ViewerThemeId[] = ["dark-slate", "oled-true-black"];
  const lightThemeIds: readonly ViewerThemeId[] = ["light-paper", "sepia-night"];

  const elementAudits: ElementAuditSummary[] = [];
  const cutTransitions: CutLuminanceTransition[] = [];
  const defects: DualThemeDefect[] = [];
  const counts = emptyCountsByCode();

  for (let c = 0; c < input.cuts.length; c += 1) {
    const cut = input.cuts[c];
    if (!cut) continue;

    if (c > 0) {
      const prevCut = input.cuts[c - 1];
      if (prevCut) {
        const fromLuma = clampUnitLuma(prevCut.meanLuma);
        const toLuma = clampUnitLuma(cut.meanLuma);
        const deltaLuma = toLuma - fromLuma;
        const ramp = cut.appliedGutterRamp;
        const hasSafeRamp = Boolean(
          ramp &&
            ramp.heightPx >= config.safeRampMinHeightPx &&
            ramp.steps >= config.safeRampMinSteps &&
            ramp.maxStepDeltaLuma <= config.safeRampMaxStepDeltaLuma,
        );
        const isShock =
          fromLuma < config.luminanceShockDarkMaxLuma &&
          toLuma > config.luminanceShockBrightMinLuma &&
          deltaLuma > config.luminanceShockMinDeltaLuma &&
          !hasSafeRamp;
        const effDelta = hasSafeRamp && ramp ? ramp.maxStepDeltaLuma : Math.max(0, deltaLuma);
        const shockIndex = Math.round(
          Math.min(100, Math.max(0, (effDelta / config.luminanceShockMinDeltaLuma) * 100)),
        );

        cutTransitions.push({
          fromCutId: prevCut.cutId,
          toCutId: cut.cutId,
          fromMeanLuma: fromLuma,
          toMeanLuma: toLuma,
          deltaLuma,
          gutterBeforePx: Math.max(0, Number.isFinite(cut.gutterBeforePx) ? cut.gutterBeforePx : 0),
          shockIndex,
          isLuminanceShock: isShock,
          hasSafeRampGutter: hasSafeRamp,
        });

        if (isShock) {
          counts["luminance-shock-transition"] += 1;
          defects.push({
            id: `defect-shock-${prevCut.cutId}-${cut.cutId}`,
            code: "luminance-shock-transition",
            severity: "critical",
            cutId: cut.cutId,
            affectedThemes: darkThemeIds,
            measuredDeltaLuma: deltaLuma,
            reasonKo: `${prevCut.labelKo}(평균 휘도 ${fromLuma.toFixed(2)}) 직후 ${cut.labelKo}(${toLuma.toFixed(2)})로 ΔLuma ${deltaLuma.toFixed(2)} 급전환되어 야간 OLED 독자 눈부심이 발생합니다.`,
            recommendationKo:
              "두 컷 사이 거터에 360px 이상의 다단계 OKLCH 완충 거터(Ramp Gutter)를 넣어 단계당 휘도 상승을 0.20 이하로 낮추세요.",
          });
        }
      }
    }

    for (let e = 0; e < cut.elements.length; e += 1) {
      const element = cut.elements[e];
      if (!element) continue;

      const perThemeMutable: Partial<Record<ViewerThemeId, ElementThemeEvaluation>> = {};
      let worstWcag = Number.POSITIVE_INFINITY;
      let worstApcaAbs = Number.POSITIVE_INFINITY;
      let allPassed = true;

      for (let t = 0; t < auditedThemes.length; t += 1) {
        const themeProfile = auditedThemes[t];
        if (!themeProfile) continue;
        const evalRes = evaluateElementOnViewerTheme(element, cut, themeProfile, config);
        perThemeMutable[themeProfile.id] = evalRes;
        if (evalRes.wcagRatio < worstWcag) worstWcag = evalRes.wcagRatio;
        if (evalRes.apcaAbsLc < worstApcaAbs) worstApcaAbs = evalRes.apcaAbsLc;
        if (!evalRes.passed) allPassed = false;
      }

      const perTheme = perThemeMutable as Record<ViewerThemeId, ElementThemeEvaluation>;
      elementAudits.push({
        cutId: cut.cutId,
        elementId: element.id,
        labelKo: element.labelKo,
        kind: element.kind,
        backdropMode: element.backdropMode,
        perTheme,
        worstWcagRatio: Number.isFinite(worstWcag) ? worstWcag : 1,
        worstApcaAbsLc: Number.isFinite(worstApcaAbs) ? worstApcaAbs : 0,
        passedAllThemes: allPassed,
      });

      if (element.kind === "balloon-text") {
        const fail = collectFailedThemesStats(perTheme, ALL_VIEWER_THEME_IDS);
        if (fail.failedThemes.length > 0) {
          counts["balloon-text-contrast-fail"] += 1;
          defects.push({
            id: `defect-balloon-${cut.cutId}-${element.id}`,
            code: "balloon-text-contrast-fail",
            severity: "critical",
            cutId: cut.cutId,
            elementId: element.id,
            affectedThemes: fail.failedThemes,
            measuredWcag: fail.minWcag,
            measuredApcaLc: fail.worstLc,
            reasonKo: `말풍선 대사 "${element.labelKo}"의 대비가 WCAG ${fail.minWcag.toFixed(2)}:1 / APCA Lc ${fail.worstLc.toFixed(1)}로 기준(4.5:1 · |Lc| 60)에 못 미칩니다.`,
            recommendationKo:
              "말풍선 내부에 고대비 불투명 백킹 플레이트를 깔거나 비파괴 대사 농도 보정 레이어를 추가하세요.",
          });
        }
        continue;
      }

      if (element.backdropMode === "transparent-margin") {
        const darkFail = collectFailedThemesStats(perTheme, darkThemeIds);
        if (darkFail.failedThemes.length > 0) {
          counts["dark-mode-ink-vanish"] += 1;
          defects.push({
            id: `defect-dark-vanish-${cut.cutId}-${element.id}`,
            code: "dark-mode-ink-vanish",
            severity: "critical",
            cutId: cut.cutId,
            elementId: element.id,
            affectedThemes: darkFail.failedThemes,
            measuredWcag: darkFail.minWcag,
            measuredApcaLc: darkFail.worstLc,
            reasonKo: `투명 여백 위 "${element.labelKo}" 요소가 다크/OLED 배경에 묻힙니다 (WCAG ${darkFail.minWcag.toFixed(2)}:1 · APCA Lc ${darkFail.worstLc.toFixed(1)}).`,
            recommendationKo:
              "원본 먹선을 그대로 두고 외곽에 밝은 OKLCH 림(Stroke Halo) 또는 반투명 종이 백킹 플레이트를 얹으세요.",
          });
        }

        const lightFail = collectFailedThemesStats(perTheme, lightThemeIds);
        if (lightFail.failedThemes.length > 0) {
          counts["light-mode-highlight-vanish"] += 1;
          defects.push({
            id: `defect-light-vanish-${cut.cutId}-${element.id}`,
            code: "light-mode-highlight-vanish",
            severity: "critical",
            cutId: cut.cutId,
            elementId: element.id,
            affectedThemes: lightFail.failedThemes,
            measuredWcag: lightFail.minWcag,
            measuredApcaLc: lightFail.worstLc,
            reasonKo: `투명 여백 위 밝은 요소 "${element.labelKo}"가 라이트/세피아 배경에서 사라집니다 (WCAG ${lightFail.minWcag.toFixed(2)}:1 · APCA Lc ${lightFail.worstLc.toFixed(1)}).`,
            recommendationKo:
              "밝은 효과음·자막 외곽에 짙은 먹색 OKLCH 림(Stroke Halo)을 둘러 주간·야간 모두 판독성을 확보하세요.",
          });
        }
      }

      const oledEval = perTheme["oled-true-black"];
      const checkBlackCrush =
        element.kind === "character-contour" ||
        (element.backdropMode === "opaque-panel" && clampUnitLuma(cut.meanLuma) < 0.14);
      if (
        checkBlackCrush &&
        element.backdropMode !== "transparent-margin" &&
        oledEval.effectiveForegroundLuminance < config.oledBlackCrushMaxLuminance &&
        (oledEval.wcagRatio < config.oledBlackCrushMinWcag ||
          oledEval.apcaAbsLc < config.oledBlackCrushMinApcaAbsLc)
      ) {
        counts["oled-black-crush-shadow"] += 1;
        defects.push({
          id: `defect-black-crush-${cut.cutId}-${element.id}`,
          code: "oled-black-crush-shadow",
          severity: "warning",
          cutId: cut.cutId,
          elementId: element.id,
          affectedThemes: ["oled-true-black"],
          measuredWcag: oledEval.wcagRatio,
          measuredApcaLc: oledEval.apcaLc,
          reasonKo: `야간 컷 "${cut.labelKo}"의 "${element.labelKo}" 윤곽선 휘도(Y=${oledEval.effectiveForegroundLuminance.toFixed(4)})가 OLED 블랙 크러시 구간(Y < 0.015)에 잠겨 뭉개집니다.`,
          recommendationKo:
            "원본 암부 색조를 유지하면서 윤곽 바깥에 2.5px 달빛 림 라이트(Rim-Light Halo)를 추가하세요.",
        });
      }
    }
  }

  const themeSummaries: ThemeReadinessSummary[] = auditedThemes.map((theme) => {
    let passedCount = 0;
    let failedCount = 0;
    for (let i = 0; i < elementAudits.length; i += 1) {
      const ea = elementAudits[i];
      if (!ea) continue;
      if (ea.perTheme[theme.id].passed) passedCount += 1;
      else failedCount += 1;
    }
    const shockCount = theme.isDark
      ? cutTransitions.filter((tr) => tr.isLuminanceShock).length
      : 0;
    const totalChecks = passedCount + failedCount + (theme.isDark ? cutTransitions.length : 0);
    const totalFails = failedCount + shockCount;
    const score =
      totalChecks === 0
        ? 100
        : Math.max(0, Math.round(((totalChecks - totalFails) / totalChecks) * 100));
    return {
      themeId: theme.id,
      labelKo: theme.labelKo,
      passedElementCount: passedCount,
      failedElementCount: failedCount,
      shockCount,
      readinessScore: score,
    };
  });

  const overallReadinessScore =
    themeSummaries.length === 0
      ? 100
      : Math.round(
          themeSummaries.reduce((acc, item) => acc + item.readinessScore, 0) /
            themeSummaries.length,
        );

  const manifestPayload = {
    schema: "toonstudio.wave142.dual-theme-audit.v1",
    episodeId: input.episodeId,
    cutCount: input.cuts.length,
    elementCount: elementAudits.length,
    countsByCode: counts,
    defectIds: defects.map((d) => ({
      id: d.id,
      code: d.code,
      cutId: d.cutId,
      elementId: d.elementId ?? null,
      affectedThemes: d.affectedThemes,
      measuredWcag: d.measuredWcag ?? null,
      measuredApcaLc: d.measuredApcaLc ?? null,
      measuredDeltaLuma: d.measuredDeltaLuma ?? null,
    })),
    themeReadiness: themeSummaries.map((s) => ({
      themeId: s.themeId,
      score: s.readinessScore,
      failed: s.failedElementCount,
      shocks: s.shockCount,
    })),
    overallReadinessScore,
  };

  return {
    episodeId: input.episodeId,
    episodeTitleKo: input.episodeTitleKo,
    config,
    auditedThemes,
    elementAudits,
    cutTransitions,
    defects,
    countsByCode: counts,
    themeSummaries,
    overallReadinessScore,
    allFourThemesPassed: defects.length === 0,
    dualThemeAuditSha256Hex: computeDualThemeManifestSha256Hex(manifestPayload),
  };
}
