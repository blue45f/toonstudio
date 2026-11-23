/**
 * 웹툰 작가의 '창작의 고통' 4대 원클릭 작화 자동화 오토파일럿 통합 엔진 API 및 SVG 직렬화.
 *
 * - ① 빈 캔버스 막힘 해소 (`suggestCutCompositionsFromLine`)
 * - ② 배경 군중/엑스트라 1클릭 생성 (`generatePerspectiveCrowdSilhouettes`)
 * - ③ 캐릭터 1클릭 5-톤 웹툰 음영 팔레트 (`deriveWebtoon5ToneShadingRamp`)
 * - ④ 대본 붙여넣기 → 말풍선 자동 분절·호흡 오토파일럿 (`autoLayoutScriptToBalloons`)
 */

import {
  clampNumber,
  roundTo,
  type AutoBalloonLayoutResult,
  type CutCompositionCard,
  type PerspectiveCrowdResult,
  type Webtoon5ToneShadingRamp,
} from "./creator-relief-types";

export {
  BALLOON_STYLE_LABELS,
  CAMERA_ANGLE_LABELS,
  CHARACTER_BASE_COLOR_PRESETS,
  CROWD_SCENE_IDS,
  CROWD_SCENE_LABELS,
  CUT_MOOD_IDS,
  CUT_MOOD_LABELS,
  SHADING_LIGHTING_MOOD_IDS,
  SHADING_LIGHTING_MOOD_LABELS,
  SHOT_SIZE_LABELS,
  pickLocaleText,
  type AutoBalloonLayoutResult,
  type BalloonStyleId,
  type BilingualLabel,
  type CameraAngleId,
  type CharacterBaseColorPreset,
  type CompositionWireframeData,
  type CreatorReliefLocale,
  type CrowdPoseKind,
  type CrowdPropKind,
  type CrowdSceneId,
  type CrowdSilhouetteEntity,
  type CutCompositionCard,
  type CutMoodId,
  type NormalizedPoint,
  type NormalizedRect,
  type OklchColor,
  type PerspectiveCrowdOptions,
  type PerspectiveCrowdResult,
  type RgbColor,
  type ScriptBalloonLayoutItem,
  type ShadingLightingMoodId,
  type ShadingRampStop,
  type ShadingStopRole,
  type ShotSizeId,
  type SvgLineSegment,
  type Webtoon5ToneShadingRamp,
  type WireframeFigure,
} from "./creator-relief-types";

export { suggestCutCompositionsFromLine } from "./creator-relief-composition";
export { generatePerspectiveCrowdSilhouettes } from "./creator-relief-crowd";

export {
  MAX_BALLOON_CHARS,
  autoLayoutScriptToBalloons,
  computeRelativeLuminance,
  deriveWebtoon5ToneShadingRamp,
  formatRgbToHex,
  oklchToSrgb,
  srgbToOklch,
} from "./creator-relief-shading-script";

function escapeSvgXml(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

/** 컷 구도 와이어프레임을 바로 붙여넣기 가능한 독립 SVG 문자열로 직렬화한다. */
export function buildCutCompositionSvg(card: CutCompositionCard): string {
  const wf = card.wireframe;
  const speedSvg = wf.speedLines
    .map(
      (line) =>
        `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="currentColor" stroke-opacity="0.25" stroke-width="0.7" />`,
    )
    .join("");
  const figuresSvg = wf.figures
    .map(
      (fig) =>
        `<g opacity="${fig.role === "primary" ? "0.9" : "0.45"}">` +
        `<path d="${fig.shoulderPath}" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.1" />` +
        `<circle cx="${fig.headCx}" cy="${fig.headCy}" r="${fig.headR}" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-width="1.2" />` +
        `</g>`,
    )
    .join("");
  const bx = roundTo((card.balloonAnchor.x / 100) * wf.viewBoxWidth, 1);
  const by = roundTo((card.balloonAnchor.y / 100) * wf.viewBoxHeight, 1);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wf.viewBoxWidth} ${wf.viewBoxHeight}" role="img" aria-label="${escapeSvgXml(card.title.en)}">` +
    `<rect x="1" y="1" width="${wf.viewBoxWidth - 2}" height="${wf.viewBoxHeight - 2}" rx="4" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="1" />` +
    `<line x1="${wf.ruleOfThirdsX[0]}" y1="0" x2="${wf.ruleOfThirdsX[0]}" y2="${wf.viewBoxHeight}" stroke="currentColor" stroke-opacity="0.18" stroke-dasharray="2 2" />` +
    `<line x1="${wf.ruleOfThirdsX[1]}" y1="0" x2="${wf.ruleOfThirdsX[1]}" y2="${wf.viewBoxHeight}" stroke="currentColor" stroke-opacity="0.18" stroke-dasharray="2 2" />` +
    `<line x1="0" y1="${wf.ruleOfThirdsY[0]}" x2="${wf.viewBoxWidth}" y2="${wf.ruleOfThirdsY[0]}" stroke="currentColor" stroke-opacity="0.18" stroke-dasharray="2 2" />` +
    `<line x1="0" y1="${wf.ruleOfThirdsY[1]}" x2="${wf.viewBoxWidth}" y2="${wf.ruleOfThirdsY[1]}" stroke="currentColor" stroke-opacity="0.18" stroke-dasharray="2 2" />` +
    `<g transform="rotate(${wf.dutchAngleDeg} ${wf.viewBoxWidth / 2} ${wf.viewBoxHeight / 2})">` +
    `<line x1="-10" y1="${wf.horizonY}" x2="${wf.viewBoxWidth + 10}" y2="${wf.horizonY}" stroke="currentColor" stroke-opacity="0.3" stroke-dasharray="4 3" />` +
    `${speedSvg}${figuresSvg}` +
    `</g>` +
    `<ellipse cx="${bx}" cy="${by}" rx="18" ry="10" fill="none" stroke="currentColor" stroke-width="1.2" />` +
    `</svg>`
  );
}

/** 배경 군중 원근 실루엣을 레이어 가져오기용 독립 SVG 문자열로 직렬화한다. */
export function buildPerspectiveCrowdSvg(result: PerspectiveCrowdResult): string {
  const guidesSvg = result.perspectiveGuides
    .map(
      (g) =>
        `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="currentColor" stroke-opacity="0.18" stroke-dasharray="3 3" stroke-width="0.8" />`,
    )
    .join("");
  const peopleSvg = result.silhouettes
    .map(
      (person) =>
        `<g opacity="${person.opacity}">` +
        `<path d="${person.bodyPath}" fill="currentColor" />` +
        `<circle cx="${person.headCx}" cy="${person.headCy}" r="${person.headR}" fill="currentColor" />` +
        (person.propPath ? `<path d="${person.propPath}" fill="currentColor" fill-opacity="0.72" />` : "") +
        `</g>`,
    )
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${result.viewBoxWidth} ${result.viewBoxHeight}" role="img" aria-label="Perspective crowd ${escapeSvgXml(result.scene)}">` +
    `${guidesSvg}${peopleSvg}</svg>`
  );
}

/** 5-톤 음영 팔레트를 스와치 스트립 SVG 문자열로 직렬화한다(rgb() 함수 기반). */
export function buildShadingRampSvg(ramp: Webtoon5ToneShadingRamp): string {
  const swatchW = 64;
  const totalW = swatchW * ramp.stops.length;
  const rects = ramp.stops
    .map((stop, idx) => {
      const fill = `rgb(${stop.rgb.r} ${stop.rgb.g} ${stop.rgb.b})`;
      return `<rect x="${idx * swatchW}" y="0" width="${swatchW}" height="80" fill="${fill}" />`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} 80" role="img" aria-label="Webtoon 5-tone shading ramp ${escapeSvgXml(ramp.lightingMood)}">${rects}</svg>`;
}

/** 자동 배치된 말풍선 시퀀스를 웹툰 세로 스트립 SVG 문자열로 직렬화한다. */
export function buildScriptBalloonsSvg(layout: AutoBalloonLayoutResult): string {
  const width = 260;
  let cursorY = 18;
  const parts: string[] = [];

  for (const item of layout.items) {
    const cx = roundTo((item.anchor.x / 100) * width, 1);
    const boxW = item.style === "narration" ? 210 : 156;
    const boxH = 26 + item.lines.length * 16;
    const x = roundTo(clampNumber(cx - boxW / 2, 12, width - boxW - 12), 1);
    const y = cursorY;
    const rx = item.style === "narration" ? 4 : item.style === "shout" ? 12 : 22;
    const dash = item.style === "thought" ? ' stroke-dasharray="4 3"' : "";
    const textSvg = item.lines
      .map(
        (line, lineIdx) =>
          `<text x="${roundTo(x + boxW / 2, 1)}" y="${y + 20 + lineIdx * 16}" text-anchor="middle" font-size="11" fill="currentColor">${escapeSvgXml(line)}</text>`,
      )
      .join("");
    parts.push(
      `<g><rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="${rx}" fill="none" stroke="currentColor" stroke-width="${item.style === "shout" ? 2 : 1.2}"${dash} />${textSvg}</g>`,
    );
    cursorY += boxH + Math.round(item.gutterPx * 0.45);
  }

  const height = Math.max(120, cursorY + 12);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Auto balloon script layout">${parts.join("")}</svg>`;
}
