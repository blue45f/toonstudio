/**
 * Wave 95 — 2D 웹툰 → WebXR·공간 디스플레이 입체 컷 극장:
 * 인쇄 호환 고대비 평면 광학 단면도 SVG 렌더러(OKLCH 전용, 원시 hex/rgb 금지) 및
 * 자연스러운 한국어 시각 피로·여백·렌더 예산 요약 리포터.
 */

import type {
  CompiledSpatialLayerNode,
  CompiledSpatialTheaterSceneGraph,
} from "./disocclusion-guard-and-xr-scene-compiler";

/** 인쇄·고대비 Calm Atelier OKLCH 팔레트 (원시 hex/rgb 사용 금지). */
const SVG_PALETTE = {
  paperBg: "oklch(0.985 0.008 90)",
  frameBorder: "oklch(0.84 0.015 90)",
  inkPrimary: "oklch(0.20 0.02 240)",
  inkSecondary: "oklch(0.42 0.02 240)",
  axisLine: "oklch(0.38 0.02 240)",
  gridLine: "oklch(0.88 0.01 90)",
  vacFill: "oklch(0.86 0.06 158)",
  vacStroke: "oklch(0.38 0.09 158)",
  dialogueFill: "oklch(0.90 0.05 238)",
  dialogueStroke: "oklch(0.44 0.10 238)",
  convergenceLine: "oklch(0.30 0.09 158)",
  leftEye: "oklch(0.44 0.14 252)",
  rightEye: "oklch(0.48 0.15 28)",
  sceneLayer: "oklch(0.34 0.06 232)",
  dialogueLayer: "oklch(0.42 0.13 268)",
  popoutLayer: "oklch(0.50 0.16 42)",
  tearRisk: "oklch(0.50 0.19 25)",
} as const;

/** 광학 단면도 SVG 렌더링 옵션. */
export interface SpatialSvgRenderOptions {
  /** 시각화할 컷 인덱스(기본값 `0`). */
  readonly panelIndex?: number;
  readonly widthPx?: number;
  readonly heightPx?: number;
}

/** 자연스러운 한국어 공간 시청 편안함 요약 보고서. */
export interface SpatialTheaterComfortSummary {
  readonly verdict: "ready" | "needs-overscan" | "reduced-motion-flat";
  readonly headlineKo: string;
  readonly bulletsKo: readonly string[];
  readonly reportTextKo: string;
  readonly presetLabelKo: string;
  readonly comfortTierLabelKo: string;
  readonly maxCrossedArcmin: number;
  readonly maxUncrossedArcmin: number;
  readonly vacComfortPassed: boolean;
  readonly dialogueLayerCount: number;
  readonly maxDialogueAbsArcmin: number;
  readonly dialogueDiplopiaSafe: boolean;
  readonly disocclusionReady: boolean;
  readonly atRiskLayerCount: number;
  readonly maxRequiredOverscanPx: number;
  readonly reducedMotionActive: boolean;
  readonly estimatedDrawCalls: number;
  readonly sceneHashShort: string;
}

/** XML 특수문자를 안전하게 이스케이프한다. */
export function escapeSpatialSvgXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeSvgNum(value: number, fallback: number = 0, digits: number = 2): string {
  const safe = Number.isFinite(value) ? value : fallback;
  const normalized = Object.is(safe, -0) || safe === 0 ? 0 : safe;
  return normalized.toFixed(digits);
}

function formatArcminSigned(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.05) return "0.0'";
  const prefix = safe > 0 ? "+" : "-";
  return `${prefix}${Math.abs(safe).toFixed(1)}'`;
}

function pickRoleLabelKo(layer: CompiledSpatialLayerNode): string {
  if (layer.role === "speech-balloon") return "말풍선";
  if (layer.role === "caption") return "자막";
  if (layer.role === "fx-popout") return "돌출 효과";
  if (layer.role === "foreground-prop") return "전경 소품";
  if (layer.role === "character") return "인물";
  if (layer.role === "midground") return "중경";
  if (layer.role === "far-background") return "원경";
  return "하늘 배경";
}

/**
 * 좌·우안 관찰자 눈, 수렴 스크린, VAC 편안함 회랑, 대사 복시 안전 대역(±15'),
 * 깊이 정렬 레이어 마커(말풍선 다이아몬드·돌출 FX 삼각 쐐기) 및 각시차 눈금을 담은
 * 인쇄 호환 고대비 평면 광학 단면도 SVG를 렌더링한다.
 */
export function renderSpatialDepthCrossSectionSvg(
  sceneGraph: CompiledSpatialTheaterSceneGraph,
  options?: SpatialSvgRenderOptions,
): string {
  const width = Math.max(640, Math.round(options?.widthPx ?? 880));
  const height = Math.max(380, Math.round(options?.heightPx ?? 460));
  const plotLeft = 172;
  const plotRight = width - 44;
  const plotTop = 76;
  const plotBottom = height - 92;
  const plotWidth = plotRight - plotLeft;
  const plotMidY = (plotTop + plotBottom) * 0.5;

  const selectedIndex = Math.max(
    0,
    Math.min(Math.max(0, sceneGraph.panels.length - 1), Math.floor(options?.panelIndex ?? 0)),
  );
  const panel = sceneGraph.panels[selectedIndex];
  const layers = panel?.layers ?? [];

  const boundMax = Math.max(
    sceneGraph.optics.maxPopOutArcmin,
    sceneGraph.optics.maxDepthArcmin,
    30,
  );
  const axisSpan = boundMax * 1.18;
  const mapDisparityX = (arcmin: number): number => {
    const safe = Number.isFinite(arcmin) ? arcmin : 0;
    const ratio = (safe + axisSpan) / (2 * axisSpan);
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    return plotLeft + clampedRatio * plotWidth;
  };

  const convX = mapDisparityX(0);
  const vacLeftX = mapDisparityX(-sceneGraph.optics.maxPopOutArcmin);
  const vacRightX = mapDisparityX(sceneGraph.optics.maxDepthArcmin);
  const dlgLeftX = mapDisparityX(-sceneGraph.optics.dialogueMaxArcmin);
  const dlgRightX = mapDisparityX(sceneGraph.optics.dialogueMaxArcmin);

  const eyeX = 68;
  const eyeHalfGap = sceneGraph.prefersReducedMotion ? 0 : 28;
  const leftEyeY = plotMidY - eyeHalfGap;
  const rightEyeY = plotMidY + eyeHalfGap;

  const titleText = escapeSpatialSvgXml(
    `${sceneGraph.presetLabelKo} 광학 단면도${panel ? ` — ${panel.titleKo}` : ""}`,
  );
  const subtitleText = escapeSpatialSvgXml(
    sceneGraph.prefersReducedMotion
      ? `모션 저감 평면 모드 · IPD 0.0mm · 수렴 ${sceneGraph.convergenceDepthMeters.toFixed(2)}m`
      : `IPD ${(sceneGraph.effectiveIpdMeters * 1000).toFixed(1)}mm · 수렴 ${sceneGraph.convergenceDepthMeters.toFixed(2)}m · VAC 한계 ±${boundMax.toFixed(0)}'`,
  );

  const ticks =
    boundMax <= 35
      ? [-30, -15, 0, 15, 30]
      : [-60, -30, -15, 0, 15, 30, 60];

  const tickSvgParts: string[] = [];
  for (let i = 0; i < ticks.length; i += 1) {
    const t = ticks[i] ?? 0;
    const tx = mapDisparityX(t);
    const label = t === 0 ? "0'" : t > 0 ? `+${t}'` : `${t}'`;
    tickSvgParts.push(
      `<line x1="${safeSvgNum(tx)}" y1="${safeSvgNum(plotTop)}" x2="${safeSvgNum(tx)}" y2="${safeSvgNum(plotBottom)}" stroke="${SVG_PALETTE.gridLine}" stroke-width="1" />` +
        `<line x1="${safeSvgNum(tx)}" y1="${safeSvgNum(plotBottom)}" x2="${safeSvgNum(tx)}" y2="${safeSvgNum(plotBottom + 6)}" stroke="${SVG_PALETTE.axisLine}" stroke-width="1.2" />` +
        `<text x="${safeSvgNum(tx)}" y="${safeSvgNum(plotBottom + 22)}" text-anchor="middle" font-size="11" fill="${SVG_PALETTE.inkSecondary}">${escapeSpatialSvgXml(label)}</text>`,
    );
  }

  const layerSvgParts: string[] = [];
  const count = layers.length;
  for (let i = 0; i < count; i += 1) {
    const layer = layers[i];
    if (!layer) continue;
    const lx = mapDisparityX(layer.compressedDisparityArcmin);
    const laneSpacing = count <= 1 ? 0 : (plotBottom - plotTop - 72) / (count - 1);
    const ly = count <= 1 ? plotMidY : plotTop + 36 + i * laneSpacing;
    const safeLabel = escapeSpatialSvgXml(
      `${layer.labelKo} (${pickRoleLabelKo(layer)}, ${formatArcminSigned(layer.compressedDisparityArcmin)}, ${layer.compressedDepthMeters.toFixed(2)}m)`,
    );

    const isDialogue = layer.dialogueDiplopiaGuarded;
    const isPopout = layer.role === "fx-popout";
    const strokeColor = layer.disocclusion.disocclusionTearRisk
      ? SVG_PALETTE.tearRisk
      : isDialogue
        ? SVG_PALETTE.dialogueLayer
        : isPopout
          ? SVG_PALETTE.popoutLayer
          : SVG_PALETTE.sceneLayer;

    let markerSvg: string;
    if (isDialogue) {
      markerSvg =
        `<polygon points="${safeSvgNum(lx)},${safeSvgNum(ly - 8)} ${safeSvgNum(lx + 8)},${safeSvgNum(ly)} ${safeSvgNum(lx)},${safeSvgNum(ly + 8)} ${safeSvgNum(lx - 8)},${safeSvgNum(ly)}" ` +
        `fill="${strokeColor}" stroke="${SVG_PALETTE.paperBg}" stroke-width="1.5" />`;
    } else if (isPopout) {
      markerSvg =
        `<polygon points="${safeSvgNum(lx - 8)},${safeSvgNum(ly)} ${safeSvgNum(lx + 7)},${safeSvgNum(ly - 7)} ${safeSvgNum(lx + 7)},${safeSvgNum(ly + 7)}" ` +
        `fill="${strokeColor}" stroke="${SVG_PALETTE.paperBg}" stroke-width="1.5" />`;
    } else {
      markerSvg =
        `<line x1="${safeSvgNum(lx)}" y1="${safeSvgNum(ly - 12)}" x2="${safeSvgNum(lx)}" y2="${safeSvgNum(ly + 12)}" stroke="${strokeColor}" stroke-width="3" stroke-linecap="round" />` +
        `<circle cx="${safeSvgNum(lx)}" cy="${safeSvgNum(ly)}" r="4.5" fill="${strokeColor}" />`;
    }

    const placeLabelLeft = lx > plotRight - 210;
    const textX = placeLabelLeft ? lx - 12 : lx + 12;
    const anchor = placeLabelLeft ? "end" : "start";

    layerSvgParts.push(
      `<g data-layer-id="${escapeSpatialSvgXml(layer.layerId)}" data-role="${escapeSpatialSvgXml(layer.role)}">` +
        markerSvg +
        `<text x="${safeSvgNum(textX)}" y="${safeSvgNum(ly + 4)}" text-anchor="${anchor}" font-size="11" fill="${SVG_PALETTE.inkPrimary}">${safeLabel}</text>` +
        `</g>`,
    );
  }

  const emptyNoticeSvg =
    count === 0
      ? `<text x="${safeSvgNum((plotLeft + plotRight) * 0.5)}" y="${safeSvgNum(plotMidY)}" text-anchor="middle" font-size="13" fill="${SVG_PALETTE.inkSecondary}">표시할 레이어가 없습니다.</text>`
      : "";

  const eyesSvg = sceneGraph.prefersReducedMotion
    ? `<circle cx="${safeSvgNum(eyeX)}" cy="${safeSvgNum(plotMidY)}" r="10" fill="${SVG_PALETTE.inkPrimary}" />` +
      `<text x="${safeSvgNum(eyeX)}" y="${safeSvgNum(plotMidY + 4)}" text-anchor="middle" font-size="10" font-weight="700" fill="${SVG_PALETTE.paperBg}">단안</text>` +
      `<line x1="${safeSvgNum(eyeX + 10)}" y1="${safeSvgNum(plotMidY)}" x2="${safeSvgNum(convX)}" y2="${safeSvgNum(plotMidY)}" stroke="${SVG_PALETTE.axisLine}" stroke-width="1.4" stroke-dasharray="4 4" />`
    : `<line x1="${safeSvgNum(eyeX)}" y1="${safeSvgNum(leftEyeY)}" x2="${safeSvgNum(eyeX)}" y2="${safeSvgNum(rightEyeY)}" stroke="${SVG_PALETTE.inkSecondary}" stroke-width="2" />` +
      `<line x1="${safeSvgNum(eyeX + 9)}" y1="${safeSvgNum(leftEyeY)}" x2="${safeSvgNum(convX)}" y2="${safeSvgNum(plotMidY)}" stroke="${SVG_PALETTE.leftEye}" stroke-width="1.3" stroke-dasharray="4 4" />` +
      `<line x1="${safeSvgNum(eyeX + 9)}" y1="${safeSvgNum(rightEyeY)}" x2="${safeSvgNum(convX)}" y2="${safeSvgNum(plotMidY)}" stroke="${SVG_PALETTE.rightEye}" stroke-width="1.3" stroke-dasharray="4 4" />` +
      `<circle cx="${safeSvgNum(eyeX)}" cy="${safeSvgNum(leftEyeY)}" r="9" fill="${SVG_PALETTE.leftEye}" />` +
      `<text x="${safeSvgNum(eyeX)}" y="${safeSvgNum(leftEyeY + 3.5)}" text-anchor="middle" font-size="10" font-weight="700" fill="${SVG_PALETTE.paperBg}">L</text>` +
      `<circle cx="${safeSvgNum(eyeX)}" cy="${safeSvgNum(rightEyeY)}" r="9" fill="${SVG_PALETTE.rightEye}" />` +
      `<text x="${safeSvgNum(eyeX)}" y="${safeSvgNum(rightEyeY + 3.5)}" text-anchor="middle" font-size="10" font-weight="700" fill="${SVG_PALETTE.paperBg}">R</text>` +
      `<text x="${safeSvgNum(eyeX)}" y="${safeSvgNum(rightEyeY + 26)}" text-anchor="middle" font-size="10" fill="${SVG_PALETTE.inkSecondary}">관찰자 양안</text>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${titleText}">`,
    `<title>${titleText}</title>`,
    `<desc>${subtitleText}</desc>`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="${SVG_PALETTE.paperBg}" stroke="${SVG_PALETTE.frameBorder}" stroke-width="1.5" />`,
    `<text x="28" y="34" font-size="16" font-weight="700" fill="${SVG_PALETTE.inkPrimary}">${titleText}</text>`,
    `<text x="28" y="54" font-size="12" fill="${SVG_PALETTE.inkSecondary}">${subtitleText}</text>`,
    `<rect x="${safeSvgNum(vacLeftX)}" y="${safeSvgNum(plotTop)}" width="${safeSvgNum(vacRightX - vacLeftX)}" height="${safeSvgNum(plotBottom - plotTop)}" fill="${SVG_PALETTE.vacFill}" fill-opacity="0.32" stroke="${SVG_PALETTE.vacStroke}" stroke-width="1.2" stroke-dasharray="6 4" />`,
    `<rect x="${safeSvgNum(dlgLeftX)}" y="${safeSvgNum(plotTop)}" width="${safeSvgNum(dlgRightX - dlgLeftX)}" height="${safeSvgNum(plotBottom - plotTop)}" fill="${SVG_PALETTE.dialogueFill}" fill-opacity="0.40" stroke="${SVG_PALETTE.dialogueStroke}" stroke-width="1" stroke-dasharray="3 3" />`,
    ...tickSvgParts,
    `<line x1="${safeSvgNum(convX)}" y1="${safeSvgNum(plotTop - 10)}" x2="${safeSvgNum(convX)}" y2="${safeSvgNum(plotBottom + 6)}" stroke="${SVG_PALETTE.convergenceLine}" stroke-width="2.2" />`,
    `<text x="${safeSvgNum(convX)}" y="${safeSvgNum(plotTop - 14)}" text-anchor="middle" font-size="11" font-weight="700" fill="${SVG_PALETTE.convergenceLine}">수렴 스크린 (0', ${sceneGraph.convergenceDepthMeters.toFixed(2)}m)</text>`,
    `<line x1="${safeSvgNum(plotLeft)}" y1="${safeSvgNum(plotBottom)}" x2="${safeSvgNum(plotRight)}" y2="${safeSvgNum(plotBottom)}" stroke="${SVG_PALETTE.axisLine}" stroke-width="1.5" />`,
    eyesSvg,
    ...layerSvgParts,
    emptyNoticeSvg,
    `<text x="${safeSvgNum(plotLeft)}" y="${safeSvgNum(plotBottom + 44)}" font-size="11" fill="${SVG_PALETTE.inkSecondary}">← 화면 앞 돌출 (교차 시차 -)</text>`,
    `<text x="${safeSvgNum(plotRight)}" y="${safeSvgNum(plotBottom + 44)}" text-anchor="end" font-size="11" fill="${SVG_PALETTE.inkSecondary}">화면 뒤 원경 (비교차 시차 +) →</text>`,
    `<text x="28" y="${safeSvgNum(height - 18)}" font-size="11" fill="${SVG_PALETTE.inkSecondary}">범례: 막대=일반 레이어 · 마름모=말풍선/자막(±15' 고정) · 삼각 쐐기=돌출 FX · 해시 ${escapeSpatialSvgXml(sceneGraph.sceneHashSha256.slice(0, 12))}</text>`,
    `</svg>`,
  ].join("\n");
}

/**
 * 컴파일된 입체 극장 장면 그래프를 자연스러운 한국어 점검 요약으로 정리한다.
 */
export function summarizeSpatialTheaterComfortKo(
  sceneGraph: CompiledSpatialTheaterSceneGraph,
): SpatialTheaterComfortSummary {
  const comfortTierLabelKo =
    sceneGraph.comfortTier === "calm-strict" ? "편안함 우선 (±30')" : "표준 극장 (±60')";

  let dialogueLayerCount = 0;
  for (let p = 0; p < sceneGraph.panels.length; p += 1) {
    const panel = sceneGraph.panels[p];
    if (!panel) continue;
    for (let l = 0; l < panel.layers.length; l += 1) {
      if (panel.layers[l]?.dialogueDiplopiaGuarded) dialogueLayerCount += 1;
    }
  }

  const sceneHashShort = sceneGraph.sceneHashSha256.slice(0, 12);
  const verdict: SpatialTheaterComfortSummary["verdict"] = sceneGraph.prefersReducedMotion
    ? "reduced-motion-flat"
    : sceneGraph.overallDisocclusionTearRisk
      ? "needs-overscan"
      : "ready";

  const headlineKo =
    verdict === "reduced-motion-flat"
      ? `${sceneGraph.presetLabelKo} 모션 저감 평면 모드 적용 완료 — 모든 레이어를 수렴면(시차 0')에 고정했습니다.`
      : verdict === "needs-overscan"
        ? `${sceneGraph.presetLabelKo} 점검 결과 — 시차는 안전하지만 가려짐 여백 보완 대상 ${sceneGraph.atRiskLayerRefs.length}건이 있습니다.`
        : `${sceneGraph.presetLabelKo} 입체 극장 점검 완료 — 모든 레이어가 시각 피로 안전 구간 안에 들어왔습니다.`;

  const presetBullet = `시청 프리셋: ${sceneGraph.presetLabelKo} · 동공간거리 ${(sceneGraph.effectiveIpdMeters * 1000).toFixed(1)}mm · 수렴 거리 ${sceneGraph.convergenceDepthMeters.toFixed(2)}m (${comfortTierLabelKo})`;

  const disparityBullet = sceneGraph.prefersReducedMotion
    ? "양안 시차 범위: 돌출 0.0' / 배경 0.0' · 초점-폭주 편차 0.00D (평면 고정)"
    : `양안 시차 범위: 돌출 최대 -${sceneGraph.maxCrossedDisparityArcmin.toFixed(1)}' / 배경 최대 +${sceneGraph.maxUncrossedDisparityArcmin.toFixed(1)}' · 초점-폭주 편차 ${sceneGraph.maxVacConflictDiopters.toFixed(2)}D (${sceneGraph.allPanelsWithinVacComfort ? "VAC 안전 기준 충족" : "한계 재확인 필요"})`;

  const dialogueBullet =
    dialogueLayerCount === 0
      ? "대사 복시 방지: 이 장면에는 말풍선·자막 레이어가 없습니다."
      : `대사 복시 방지: 말풍선·자막 ${dialogueLayerCount}개 레이어를 수렴면 ±${sceneGraph.optics.dialogueMaxArcmin.toFixed(0)}' 안쪽(최대 ${sceneGraph.maxDialogueAbsDisparityArcmin.toFixed(1)}')에 고정했습니다.`;

  const disocclusionBullet = sceneGraph.overallDisocclusionTearRisk
    ? `가려짐 여백 점검: ${sceneGraph.atRiskLayerRefs.length}개 레이어(${sceneGraph.atRiskLayerRefs.slice(0, 3).join(", ")}) 여백 부족 — 최소 ${sceneGraph.maxRequiredOverscanPx}px까지 배경을 채워야 검은 틈을 막을 수 있습니다.`
    : `가려짐 여백 점검: 모든 레이어 여백 충분 — 시선 이동 시 검은 틈이 생기지 않습니다(최대 필요 여백 ${sceneGraph.maxRequiredOverscanPx}px).`;

  const reducedMotionBullet = sceneGraph.prefersReducedMotion
    ? "모션 저감 모드: 켜짐 — 양안 분리 0mm·머리 추적 시차 0px로 어지럼 요인을 완전히 차단했습니다."
    : "모션 저감 모드: 꺼짐 (켜면 양안 시차와 머리 시차를 즉시 0으로 고정해 평면으로 전환합니다.)";

  const drawCallModeLabel = sceneGraph.drawCallBudget.singlePassMultiview
    ? "싱글패스 멀티뷰"
    : "좌우 분할 패스";
  const drawCallBullet = `렌더 예산: ${sceneGraph.drawCallBudget.totalPanels}개 컷 · ${sceneGraph.drawCallBudget.totalLayers}개 레이어 · 프레임당 드로우콜 ${sceneGraph.drawCallBudget.estimatedDrawCalls}회 (${drawCallModeLabel}) · 장면 해시 ${sceneHashShort}`;

  const bulletsKo = [
    presetBullet,
    disparityBullet,
    dialogueBullet,
    disocclusionBullet,
    reducedMotionBullet,
    drawCallBullet,
  ] as const;

  return {
    verdict,
    headlineKo,
    bulletsKo,
    reportTextKo: `${headlineKo}\n${bulletsKo.map((line) => `- ${line}`).join("\n")}`,
    presetLabelKo: sceneGraph.presetLabelKo,
    comfortTierLabelKo,
    maxCrossedArcmin: sceneGraph.maxCrossedDisparityArcmin,
    maxUncrossedArcmin: sceneGraph.maxUncrossedDisparityArcmin,
    vacComfortPassed: sceneGraph.allPanelsWithinVacComfort,
    dialogueLayerCount,
    maxDialogueAbsArcmin: sceneGraph.maxDialogueAbsDisparityArcmin,
    dialogueDiplopiaSafe: sceneGraph.allDialogueDiplopiaSafe,
    disocclusionReady: !sceneGraph.overallDisocclusionTearRisk,
    atRiskLayerCount: sceneGraph.atRiskLayerRefs.length,
    maxRequiredOverscanPx: sceneGraph.maxRequiredOverscanPx,
    reducedMotionActive: sceneGraph.prefersReducedMotion,
    estimatedDrawCalls: sceneGraph.drawCallBudget.estimatedDrawCalls,
    sceneHashShort,
  };
}
