/**
 * 컷별 자동 효과음(SFX) 타이포그래피 & 3D 원근 왜곡 벡터 스탬프 엔진.
 *
 * 100% 브라우저 로컬(₩0) 순수 TypeScript 모듈로, 의성어/의태어 텍스트를
 * 4종 스타일(붓글씨·메탈·충격파·공포), 2중 외곽 테두리, 아치·원근 테이퍼 왜곡
 * 벡터 SVG 스탬프로 생성하고 번역 텍스트 교체 시 스타일·배치를 자동 보존한다.
 */

import {
  DEFAULT_SFX_PLACEMENT,
  SFX_DISTORTION_LABELS,
  SFX_LOCALE_LABELS,
  SFX_PRESET_PHRASES,
  SFX_STYLE_PRESETS,
  getSfxStylePreset,
  type SfxCutPlacement,
  type SfxDecorationElement,
  type SfxDistortionMode,
  type SfxDistortionSpec,
  type SfxDoubleStrokeSpec,
  type SfxGlyphTransform,
  type SfxLocaleCode,
  type SfxPresetPhrase,
  type SfxStyleId,
  type SfxStylePreset,
  type SfxVectorStampModel,
  type SfxVectorStampSpec,
} from "./sfx-typo-presets";

export {
  DEFAULT_SFX_PLACEMENT,
  SFX_DISTORTION_LABELS,
  SFX_LOCALE_LABELS,
  SFX_PRESET_PHRASES,
  SFX_STYLE_PRESETS,
  getSfxStylePreset,
  type SfxCutPlacement,
  type SfxDecorationElement,
  type SfxDistortionMode,
  type SfxDistortionSpec,
  type SfxDoubleStrokeSpec,
  type SfxGlyphTransform,
  type SfxLocaleCode,
  type SfxPresetPhrase,
  type SfxStyleId,
  type SfxStylePreset,
  type SfxVectorStampModel,
  type SfxVectorStampSpec,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 결정적 의사난수 생성기(동일 seed/index면 매번 같은 붓 번짐·지터 산출). */
function seededUnit(seed: number, salt: number): number {
  let state = (Math.imul(seed ^ 0x9e3779b9, 2654435761) ^ Math.imul(salt + 17, 2246822519)) >>> 0;
  state ^= state >>> 16;
  state = Math.imul(state, 0x85ebca6b) >>> 0;
  state ^= state >>> 13;
  state = Math.imul(state, 0xc2b2ae35) >>> 0;
  state ^= state >>> 16;
  return (state >>> 0) / 4294967295;
}

/** 문자별 대략적 전각/반각 시각 폭 계수를 추정한다(한글·한자·가나는 1.0, 영문·기호는 0.62~0.76). */
export function estimateSfxVisualWidthUnits(text: string): number {
  const chars = Array.from(text.trim());
  if (chars.length === 0) return 1;
  let total = 0;
  for (const ch of chars) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === " ") total += 0.36;
    else if (/[!?,.:;'"`~-]/u.test(ch)) total += 0.45;
    else if (
      (code >= 0xac00 && code <= 0xd7af)
      || (code >= 0x3040 && code <= 0x30ff)
      || (code >= 0x4e00 && code <= 0x9fff)
    ) {
      total += 1.0;
    } else if (/[A-Z]/u.test(ch)) {
      total += 0.74;
    } else {
      total += 0.64;
    }
  }
  return Math.max(0.6, round2(total));
}

export function escapeSfxXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

let sfxStampSequence = 0;

export function nextSfxStampId(prefix: string): string {
  sfxStampSequence += 1;
  return `sfx-${prefix}-${sfxStampSequence}`;
}

export function createSfxStampSpec(input: {
  readonly id?: string;
  readonly text: string;
  readonly locale?: SfxLocaleCode;
  readonly styleId?: SfxStyleId;
  readonly distortion?: Partial<SfxDistortionSpec>;
  readonly doubleStroke?: Partial<SfxDoubleStrokeSpec>;
  readonly placement?: Partial<SfxCutPlacement>;
  readonly seed?: number;
}): SfxVectorStampSpec {
  const cleanText = input.text.trim() || "쾅!";
  const style = getSfxStylePreset(input.styleId ?? "shockwave");
  const mode = input.distortion?.mode ?? "perspective-burst";
  const distortion: SfxDistortionSpec = Object.freeze({
    mode,
    archStrength: clamp(input.distortion?.archStrength ?? 0.38, -1, 1),
    taperRatio: clamp(input.distortion?.taperRatio ?? 1.48, 0.35, 1.85),
    skewDeg: clamp(input.distortion?.skewDeg ?? style.defaultSkewDeg, -30, 30),
    perspectiveDepth: clamp(input.distortion?.perspectiveDepth ?? 0.45, 0, 1),
  });
  const innerWidth = clamp(
    input.doubleStroke?.innerWidth ?? style.defaultDoubleStroke.innerWidth,
    1,
    24,
  );
  const outerWidth = clamp(
    Math.max(
      innerWidth + 2,
      input.doubleStroke?.outerWidth ?? style.defaultDoubleStroke.outerWidth,
    ),
    3,
    36,
  );
  const doubleStroke: SfxDoubleStrokeSpec = Object.freeze({
    innerColor: input.doubleStroke?.innerColor ?? style.defaultDoubleStroke.innerColor,
    innerWidth,
    outerColor: input.doubleStroke?.outerColor ?? style.defaultDoubleStroke.outerColor,
    outerWidth,
  });
  const placement: SfxCutPlacement = Object.freeze({
    cutId: input.placement?.cutId ?? DEFAULT_SFX_PLACEMENT.cutId,
    x: round2(input.placement?.x ?? DEFAULT_SFX_PLACEMENT.x),
    y: round2(input.placement?.y ?? DEFAULT_SFX_PLACEMENT.y),
    width: clamp(input.placement?.width ?? DEFAULT_SFX_PLACEMENT.width, 80, 1600),
    height: clamp(input.placement?.height ?? DEFAULT_SFX_PLACEMENT.height, 60, 1200),
    rotationDeg: clamp(input.placement?.rotationDeg ?? DEFAULT_SFX_PLACEMENT.rotationDeg, -180, 180),
    anchor: input.placement?.anchor ?? DEFAULT_SFX_PLACEMENT.anchor,
    zIndex: Math.round(clamp(input.placement?.zIndex ?? DEFAULT_SFX_PLACEMENT.zIndex, 0, 999)),
  });
  const seed = Number.isInteger(input.seed) ? (input.seed as number) : 20261122;

  return Object.freeze({
    id: input.id?.trim() || `sfx-${seed}-${style.id}`,
    text: cleanText,
    originalText: cleanText,
    locale: input.locale ?? "ko",
    styleId: style.id,
    distortion,
    doubleStroke,
    placement,
    seed,
    localizedFitScale: 1,
  });
}

/**
 * 번역 텍스트 교체 시 기존 SFX 스타일·2중 테두리·원근 왜곡·컷 배치 좌표를 100% 보존하고
 * 번역 문자열의 시각적 폭 변화에 맞춰 폰트 보정 배율만 자동 계산한다.
 */
export function swapSfxLocalizedText(
  stamp: SfxVectorStampSpec,
  nextText: string,
  nextLocale: SfxLocaleCode,
): SfxVectorStampSpec {
  const cleanNext = nextText.trim();
  if (cleanNext.length === 0) return stamp;
  const originalUnits = estimateSfxVisualWidthUnits(stamp.originalText);
  const nextUnits = estimateSfxVisualWidthUnits(cleanNext);
  const rawRatio = originalUnits / Math.max(0.6, nextUnits);
  const localizedFitScale = round2(clamp(rawRatio, 0.48, 1.2));

  return Object.freeze({
    ...stamp,
    text: cleanNext,
    locale: nextLocale,
    // originalText, styleId, distortion, doubleStroke, placement, seed 모두 그대로 보존
    localizedFitScale,
  });
}

export function findLocalizedPresetSuggestion(
  sourceText: string,
  targetLocale: SfxLocaleCode,
): string | null {
  const trimmed = sourceText.trim();
  const match = SFX_PRESET_PHRASES.find(
    (phrase) =>
      phrase.textKo === trimmed
      || Object.values(phrase.translations).some((candidate) => candidate === trimmed),
  );
  return match ? match.translations[targetLocale] : null;
}

function buildDecorations(
  style: SfxStylePreset,
  width: number,
  height: number,
  seed: number,
): readonly SfxDecorationElement[] {
  const cx = width / 2;
  const cy = height / 2;
  const items: SfxDecorationElement[] = [];

  if (style.decorationKind === "shock-rays") {
    const rayCount = 12;
    for (let i = 0; i < rayCount; i += 1) {
      const angle = (i / rayCount) * Math.PI * 2 + (seededUnit(seed, i) - 0.5) * 0.14;
      const innerR = Math.min(width, height) * (0.28 + seededUnit(seed, i + 40) * 0.08);
      const outerR = Math.max(width, height) * (0.44 + seededUnit(seed, i + 80) * 0.08);
      items.push({
        kind: "line",
        x1: round2(cx + Math.cos(angle) * innerR),
        y1: round2(cy + Math.sin(angle) * innerR * 0.65),
        x2: round2(cx + Math.cos(angle) * outerR),
        y2: round2(cy + Math.sin(angle) * outerR * 0.65),
        stroke: style.decorationColor,
        strokeWidth: round2(2.4 + seededUnit(seed, i + 120) * 2.2),
        opacity: 0.72,
      });
    }
  } else if (style.decorationKind === "splatter") {
    for (let i = 0; i < 9; i += 1) {
      const rx = 24 + seededUnit(seed, i + 10) * (width - 48);
      const ry = 20 + seededUnit(seed, i + 25) * (height - 40);
      const radius = 2.2 + seededUnit(seed, i + 55) * 4.6;
      items.push({
        kind: "circle",
        cx: round2(rx),
        cy: round2(ry),
        r: round2(radius),
        fill: style.decorationColor,
        opacity: round2(0.38 + seededUnit(seed, i + 70) * 0.35),
      });
    }
  } else if (style.decorationKind === "metallic-slash") {
    const slashOffsets = [-0.26, 0, 0.24];
    slashOffsets.forEach((offset, i) => {
      const startX = round2(cx + offset * width - 48);
      const endX = round2(cx + offset * width + 64);
      items.push({
        kind: "line",
        x1: startX,
        y1: round2(cy + 36),
        x2: endX,
        y2: round2(cy - 40),
        stroke: style.decorationColor,
        strokeWidth: i === 1 ? 3.2 : 1.8,
        opacity: i === 1 ? 0.85 : 0.45,
      });
    });
  } else if (style.decorationKind === "horror-drip") {
    for (let i = 0; i < 6; i += 1) {
      const dx = round2(width * (0.16 + i * 0.135));
      const topY = round2(cy + 16 + seededUnit(seed, i + 9) * 14);
      const dripLen = round2(18 + seededUnit(seed, i + 33) * 28);
      items.push({
        kind: "path",
        d: `M ${dx} ${topY} Q ${dx + 2.5} ${topY + dripLen * 0.55} ${dx} ${topY + dripLen}`,
        stroke: style.decorationColor,
        strokeWidth: round2(2.6 + seededUnit(seed, i + 61) * 1.8),
        fill: "none",
        opacity: 0.78,
      });
    }
  }

  return Object.freeze(items);
}

/**
 * 스탬프 사양을 받아 글자별 아치·원근 테이퍼 변환 좌표와 2중 외곽선 벡터 SVG 마크업을 생성한다.
 */
export function buildSfxVectorStamp(spec: SfxVectorStampSpec): SfxVectorStampModel {
  const style = getSfxStylePreset(spec.styleId);
  const chars = Array.from(spec.text);
  const glyphCount = Math.max(1, chars.length);
  const baseFontSize = round2(style.baseFontSize * spec.localizedFitScale);
  const strokePad = Math.ceil(spec.doubleStroke.outerWidth * 1.8 + 26);

  // 글자별 상대 간격과 원근 배율을 선계산하여 전체 뷰박스 폭을 정확히 산정
  const taper = spec.distortion.taperRatio;
  const depth = spec.distortion.perspectiveDepth;
  const archStrength = spec.distortion.archStrength;
  const mode = spec.distortion.mode;

  const perCharMetrics = chars.map((char, index) => {
    const t = glyphCount === 1 ? 0.5 : index / (glyphCount - 1);
    const centered = (t - 0.5) * 2; // -1 .. +1
    let scaleY = 1;
    let scaleX = 1;
    let archOffsetY = 0;
    let rotateDeg = 0;
    let skewYDeg = 0;

    if (mode === "arch-up") {
      archOffsetY = -Math.cos(centered * (Math.PI / 2)) * archStrength * baseFontSize * 0.62;
      rotateDeg = centered * archStrength * 26;
    } else if (mode === "arch-down") {
      archOffsetY = Math.cos(centered * (Math.PI / 2)) * archStrength * baseFontSize * 0.62;
      rotateDeg = -centered * archStrength * 26;
    } else if (mode === "perspective-left") {
      // 좌측 크게 → 우측 소실점 방향으로 점진 축소
      const factor = taper + (1 / taper - taper) * t;
      scaleY = clamp(factor, 0.42, 1.85);
      scaleX = clamp(0.84 + (factor - 1) * 0.45, 0.55, 1.55);
      skewYDeg = -depth * 14 * (0.4 + t * 0.6);
      rotateDeg = -depth * 6 * centered;
    } else if (mode === "perspective-right") {
      // 우측 크게 → 좌측 소실점 방향으로 점진 축소
      const factor = 1 / taper + (taper - 1 / taper) * t;
      scaleY = clamp(factor, 0.42, 1.85);
      scaleX = clamp(0.84 + (factor - 1) * 0.45, 0.55, 1.55);
      skewYDeg = depth * 14 * (0.4 + (1 - t) * 0.6);
      rotateDeg = depth * 6 * centered;
    } else if (mode === "perspective-burst") {
      const centerWeight = 1 - Math.abs(centered);
      const factor = 0.72 + centerWeight * (taper - 0.58);
      scaleY = clamp(factor, 0.52, 1.85);
      scaleX = clamp(0.78 + centerWeight * (taper - 0.68) * 0.75, 0.62, 1.6);
      archOffsetY = -centerWeight * archStrength * baseFontSize * 0.34;
      rotateDeg = centered * (8 + depth * 12);
      skewYDeg = -centered * depth * 10;
    }

    const jitterX = (seededUnit(spec.seed, index * 3 + 1) - 0.5) * 2 * style.jitterAmplitude;
    const jitterY = (seededUnit(spec.seed, index * 3 + 2) - 0.5) * 2 * style.jitterAmplitude;
    const widthUnit = estimateSfxVisualWidthUnits(char);
    const advance = Math.max(24, baseFontSize * widthUnit * scaleX + style.letterSpacing);

    return {
      index,
      char,
      scaleX: round2(scaleX),
      scaleY: round2(scaleY),
      archOffsetY: round2(archOffsetY),
      rotateDeg: round2(rotateDeg),
      skewXDeg: round2(spec.distortion.skewDeg),
      skewYDeg: round2(skewYDeg),
      jitterX: round2(jitterX),
      jitterY: round2(jitterY),
      advance: round2(advance),
    };
  });

  const totalAdvance = perCharMetrics.reduce((sum, item) => sum + item.advance, 0);
  const maxScaleY = perCharMetrics.reduce((max, item) => Math.max(max, item.scaleY), 1);
  const viewBoxWidth = Math.max(260, Math.ceil(totalAdvance + strokePad * 2));
  const viewBoxHeight = Math.max(
    180,
    Math.ceil(baseFontSize * maxScaleY * 1.45 + Math.abs(archStrength) * baseFontSize + strokePad * 2),
  );

  const startX = (viewBoxWidth - totalAdvance) / 2;
  const baselineY = viewBoxHeight * 0.56;
  let cursorX = startX;

  const glyphs: SfxGlyphTransform[] = perCharMetrics.map((metric) => {
    const x = round2(cursorX + metric.advance / 2 + metric.jitterX);
    const y = round2(baselineY + metric.archOffsetY + metric.jitterY);
    cursorX += metric.advance;
    return Object.freeze({
      index: metric.index,
      char: metric.char,
      x,
      y,
      fontSize: baseFontSize,
      scaleX: metric.scaleX,
      scaleY: metric.scaleY,
      rotateDeg: metric.rotateDeg,
      skewXDeg: metric.skewXDeg,
      skewYDeg: metric.skewYDeg,
      jitterX: metric.jitterX,
      jitterY: metric.jitterY,
      opacity: 1,
    });
  });

  const safeId = spec.id.replace(/[^a-zA-Z0-9_-]/gu, "");
  const gradientId = `sfx-grad-${safeId || "stamp"}-${style.id}`;
  const decorations = buildDecorations(style, viewBoxWidth, viewBoxHeight, spec.seed);
  const svgMarkup = serializeSfxStampSvg({
    spec,
    style,
    viewBoxWidth,
    viewBoxHeight,
    gradientId,
    glyphs,
    decorations,
  });

  return Object.freeze({
    spec,
    style,
    viewBoxWidth,
    viewBoxHeight,
    gradientId,
    glyphs: Object.freeze(glyphs),
    decorations,
    svgMarkup,
  });
}

function glyphTransformAttr(glyph: SfxGlyphTransform): string {
  return [
    `translate(${glyph.x} ${glyph.y})`,
    `rotate(${glyph.rotateDeg})`,
    `skewX(${glyph.skewXDeg})`,
    `skewY(${glyph.skewYDeg})`,
    `scale(${glyph.scaleX} ${glyph.scaleY})`,
  ].join(" ");
}

function serializeDecoration(el: SfxDecorationElement): string {
  if (el.kind === "line") {
    return `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="${escapeSfxXml(el.stroke ?? "currentColor")}" stroke-width="${el.strokeWidth ?? 2}" stroke-linecap="round" opacity="${el.opacity}" />`;
  }
  if (el.kind === "circle") {
    return `<circle cx="${el.cx}" cy="${el.cy}" r="${el.r}" fill="${escapeSfxXml(el.fill ?? "currentColor")}" opacity="${el.opacity}" />`;
  }
  return `<path d="${escapeSfxXml(el.d ?? "")}" stroke="${escapeSfxXml(el.stroke ?? "currentColor")}" stroke-width="${el.strokeWidth ?? 2}" fill="${escapeSfxXml(el.fill ?? "none")}" stroke-linecap="round" opacity="${el.opacity}" />`;
}

function serializeSfxStampSvg(input: Omit<SfxVectorStampModel, "svgMarkup">): string {
  const { spec, style, viewBoxWidth, viewBoxHeight, gradientId, glyphs, decorations } = input;
  const stopsXml = style.fillGradientStops
    .map((stop) => `<stop offset="${escapeSfxXml(stop.offset)}" stop-color="${escapeSfxXml(stop.color)}" />`)
    .join("");
  const decoXml = decorations.map(serializeDecoration).join("");

  const commonTextAttrs = `text-anchor="middle" dominant-baseline="central" font-family="${escapeSfxXml(style.fontFamily)}" font-weight="${style.fontWeight}"`;

  const glyphsXml = glyphs
    .map((glyph) => {
      const escapedChar = escapeSfxXml(glyph.char);
      const transform = glyphTransformAttr(glyph);
      return [
        `<g transform="${transform}" data-sfx-glyph-index="${glyph.index}">`,
        `  <text x="${style.shadowOffsetX}" y="${style.shadowOffsetY}" font-size="${glyph.fontSize}" ${commonTextAttrs} fill="${escapeSfxXml(style.shadowColor)}" opacity="0.34">${escapedChar}</text>`,
        `  <text x="0" y="0" font-size="${glyph.fontSize}" ${commonTextAttrs} fill="none" stroke="${escapeSfxXml(spec.doubleStroke.outerColor)}" stroke-width="${spec.doubleStroke.outerWidth}" stroke-linejoin="round" paint-order="stroke" data-sfx-layer="outer-stroke">${escapedChar}</text>`,
        `  <text x="0" y="0" font-size="${glyph.fontSize}" ${commonTextAttrs} fill="none" stroke="${escapeSfxXml(spec.doubleStroke.innerColor)}" stroke-width="${spec.doubleStroke.innerWidth}" stroke-linejoin="round" paint-order="stroke" data-sfx-layer="inner-stroke">${escapedChar}</text>`,
        `  <text x="0" y="0" font-size="${glyph.fontSize}" ${commonTextAttrs} fill="url(#${escapeSfxXml(gradientId)})" data-sfx-layer="fill">${escapedChar}</text>`,
        "</g>",
      ].join("\n");
    })
    .join("\n");

  const metaAttrs = [
    `data-sfx-style="${escapeSfxXml(spec.styleId)}"`,
    `data-sfx-distortion="${escapeSfxXml(spec.distortion.mode)}"`,
    `data-sfx-locale="${escapeSfxXml(spec.locale)}"`,
    `data-sfx-original="${escapeSfxXml(spec.originalText)}"`,
    `data-sfx-cut="${escapeSfxXml(spec.placement.cutId)}"`,
  ].join(" ");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" width="${spec.placement.width}" height="${spec.placement.height}" role="img" aria-label="${escapeSfxXml(spec.text)}" ${metaAttrs}>`,
    `<defs><linearGradient id="${escapeSfxXml(gradientId)}" gradientTransform="rotate(${style.gradientAngleDeg} 0.5 0.5)">${stopsXml}</linearGradient></defs>`,
    `<g data-sfx-decorations="true">${decoXml}</g>`,
    `<g data-sfx-glyphs="true">\n${glyphsXml}\n</g>`,
    "</svg>",
  ].join("\n");
}

const SFX_LIBRARY_STORAGE_PREFIX = "toonstudio.sfx-typo-pro.stamps.v1:";

export function loadSavedSfxStamps(projectId: string): readonly SfxVectorStampSpec[] {
  if (typeof globalThis.localStorage === "undefined") return [];
  try {
    const raw = globalThis.localStorage.getItem(`${SFX_LIBRARY_STORAGE_PREFIX}${projectId}`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is SfxVectorStampSpec =>
          typeof entry === "object"
          && entry !== null
          && typeof (entry as { text?: unknown }).text === "string"
          && typeof (entry as { styleId?: unknown }).styleId === "string",
      )
      .slice(0, 48);
  } catch {
    return [];
  }
}

export function saveSavedSfxStamps(
  projectId: string,
  stamps: readonly SfxVectorStampSpec[],
): boolean {
  if (typeof globalThis.localStorage === "undefined") return false;
  try {
    globalThis.localStorage.setItem(
      `${SFX_LIBRARY_STORAGE_PREFIX}${projectId}`,
      JSON.stringify(stamps.slice(0, 48)),
    );
    return true;
  } catch {
    return false;
  }
}
