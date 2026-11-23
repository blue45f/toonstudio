/**
 * 실시간 SVG 아트보드 미리보기 컴포넌트
 *
 * - 8종 포토 마스크 프레임, 6종 한글 타이포 효과, Excalidraw 손그림 모드, 3mm 인쇄 재단선/도련 렌더링
 * - 원시 hex/rgb 없이 시맨틱 CSS 변수(--des-kit-*)만 사용한다.
 */

import { useId } from "react";

import {
  buildPhotoMaskSvgGeometry,
  getBrandKitPreset,
  getFontPairingPreset,
  type KoreanTypoEffectId,
  type PhotoMaskFrameId,
} from "./brand-kit-templates-catalog";
import { roughifyArrowPath, roughifyRectPath } from "./figma-autolayout-engine";
import {
  computePrintBleedMetrics,
  getMagicResizeFormat,
  type DesignArtboardDocument,
  type DesignArtboardElement,
} from "./magic-resize-engine";

export interface DesignArtboardPreviewProps {
  readonly artboard: DesignArtboardDocument;
  readonly isEnglish: boolean;
  readonly selectedElementId?: string | null;
  readonly onSelectElement?: (elementId: string) => void;
}

function resolveElementText(el: DesignArtboardElement, isEnglish: boolean): string {
  return isEnglish ? (el.textEn ?? el.textKo ?? "") : (el.textKo ?? el.textEn ?? "");
}

function clampTextForBox(text: string, boxWidth: number, fontSize: number): string {
  if (!text) return "";
  const avgCharW = Math.max(6, fontSize * 0.62);
  const maxChars = Math.max(6, Math.floor((boxWidth * 0.94) / avgCharW));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(3, maxChars - 1))}…`;
}

function buildRibbonPath(x: number, y: number, w: number, h: number): string {
  const notch = Math.min(24, w * 0.05);
  return `M ${x} ${y} H ${x + w} L ${x + w - notch} ${y + h / 2} L ${x + w} ${y + h} H ${x} L ${x + notch} ${y + h / 2} Z`;
}

function buildArchTextPath(x: number, y: number, w: number, h: number): string {
  const baseY = y + h * 0.78;
  const ctrlY = y + h * 0.18;
  return `M ${x + w * 0.04} ${baseY} Q ${x + w / 2} ${ctrlY} ${x + w * 0.96} ${baseY}`;
}

export function DesignArtboardPreview({
  artboard,
  isEnglish,
  selectedElementId = null,
  onSelectElement,
}: DesignArtboardPreviewProps) {
  const uid = useId().replaceAll(":", "");
  const brandKit = getBrandKitPreset(artboard.brandKitId);
  const fontPairing = getFontPairingPreset(artboard.fontPairingId);
  const format = getMagicResizeFormat(artboard.formatId);
  const bleed = computePrintBleedMetrics(artboard.width, artboard.height, {
    isPrint: format.isPrint,
    forceShowGuides: artboard.showBleedGuides,
    dpi: format.dpi,
    bleedMm: 3,
  });

  const frameId = artboard.photoFrameId as PhotoMaskFrameId;
  const typoEffectId = artboard.typoEffectId as KoreanTypoEffectId;
  const heroElements = artboard.elements.filter((el) => el.role === "hero-image");
  const headlineEl = artboard.elements.find((el) => el.role === "headline");

  const glowFilterId = `des-glow-${uid}`;
  const inkGradId = `des-ink-grad-${uid}`;
  const gridPatternId = `des-grid-${uid}`;
  const archPathId = `des-arch-${uid}`;
  const minDim = Math.min(artboard.width, artboard.height);

  return (
    <div
      className={`des-artboard-stage ${brandKit.themeClass}`}
      data-brand-kit={brandKit.id}
      data-sketch-mode={artboard.sketchMode ? "on" : "off"}
      data-testid="des-artboard-stage"
    >
      <svg
        className="des-artboard-svg"
        viewBox={`0 0 ${artboard.width} ${artboard.height}`}
        role="img"
        aria-label={
          isEnglish
            ? `${artboard.titleEn} artboard preview (${artboard.width} by ${artboard.height} px)`
            : `${artboard.titleKo} 아트보드 미리보기 (${artboard.width} × ${artboard.height} px)`
        }
        data-testid="des-artboard-svg"
      >
        <defs>
          <linearGradient id={inkGradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--des-kit-accent)" />
            <stop offset="100%" stopColor="var(--des-kit-accent-2)" />
          </linearGradient>

          <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={Math.max(3, Math.round(minDim * 0.008))} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <pattern
            id={gridPatternId}
            width={Math.max(24, Math.round(minDim * 0.045))}
            height={Math.max(24, Math.round(minDim * 0.045))}
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="var(--des-kit-border)"
              strokeOpacity={artboard.sketchMode ? 0.42 : 0.16}
              strokeWidth={1}
            />
          </pattern>

          {headlineEl && (
            <path
              id={archPathId}
              d={buildArchTextPath(headlineEl.x, headlineEl.y, headlineEl.width, headlineEl.height)}
            />
          )}

          {heroElements.map((hero) => {
            const geom = buildPhotoMaskSvgGeometry(frameId, hero.x, hero.y, hero.width, hero.height);
            return (
              <clipPath key={`clip-${hero.id}`} id={`des-clip-${uid}-${hero.id}`}>
                <path d={geom.clipPathD} />
              </clipPath>
            );
          })}
        </defs>

        <rect x={0} y={0} width={artboard.width} height={artboard.height} fill="var(--des-kit-bg)" />
        <rect x={0} y={0} width={artboard.width} height={artboard.height} fill={`url(#${gridPatternId})`} />

        {artboard.sketchMode &&
          heroElements.length > 1 &&
          heroElements.slice(0, -1).map((hero, idx) => {
            const next = heroElements[idx + 1];
            const arrowD = roughifyArrowPath(
              { x: hero.x + hero.width, y: hero.y + hero.height / 2 },
              { x: next.x, y: next.y + next.height / 2 },
              200 + idx * 17,
            );
            return (
              <path
                key={`arrow-${hero.id}`}
                d={arrowD}
                fill="none"
                stroke="var(--des-kit-accent)"
                strokeWidth={Math.max(2, Math.round(minDim * 0.004))}
                strokeLinecap="round"
              />
            );
          })}

        {artboard.elements.map((el, index) => {
          const text = resolveElementText(el, isEnglish);
          const fontSize = el.fontSize ?? 24;
          const isSelected = selectedElementId === el.id;
          const strokeBase = Math.max(1.5, Math.round(minDim * 0.003));

          if (el.role === "hero-image") {
            const geom = buildPhotoMaskSvgGeometry(frameId, el.x, el.y, el.width, el.height);
            const inner = geom.innerImageRect;
            const roughOutline = artboard.sketchMode
              ? roughifyRectPath(el.x, el.y, el.width, el.height, 41 + index * 19, { roughness: 2.2 })
              : null;

            return (
              <g key={el.id} data-element-id={el.id} data-role={el.role} onClick={() => onSelectElement?.(el.id)}>
                <path
                  d={geom.borderPathD}
                  fill="var(--des-kit-surface)"
                  stroke={artboard.sketchMode ? "none" : "var(--des-kit-border)"}
                  strokeWidth={strokeBase}
                />
                <g clipPath={`url(#des-clip-${uid}-${el.id})`}>
                  <rect x={inner.x} y={inner.y} width={inner.width} height={inner.height} fill="var(--des-kit-surface)" />
                  <circle
                    cx={inner.x + inner.width * 0.72}
                    cy={inner.y + inner.height * 0.3}
                    r={Math.min(inner.width, inner.height) * 0.16}
                    fill="var(--des-kit-accent-2)"
                    fillOpacity={0.78}
                  />
                  <path
                    d={`M ${inner.x} ${inner.y + inner.height} L ${inner.x + inner.width * 0.36} ${inner.y + inner.height * 0.44} L ${inner.x + inner.width * 0.64} ${inner.y + inner.height * 0.72} L ${inner.x + inner.width * 0.84} ${inner.y + inner.height * 0.52} L ${inner.x + inner.width} ${inner.y + inner.height} Z`}
                    fill="var(--des-kit-accent)"
                    fillOpacity={0.68}
                  />
                  <text
                    x={inner.x + inner.width / 2}
                    y={inner.y + inner.height * 0.86}
                    textAnchor="middle"
                    fill="var(--des-kit-on-accent)"
                    fontSize={Math.max(10, Math.min(fontSize, Math.round(inner.height * 0.14)))}
                    fontWeight={700}
                    fontFamily={fontPairing.bodyFamily}
                  >
                    {clampTextForBox(text, inner.width, fontSize)}
                  </text>
                </g>

                {geom.decorPaths.map((decorD, dIdx) => (
                  <path
                    key={`${el.id}-decor-${dIdx}`}
                    d={decorD}
                    fill="none"
                    stroke="var(--des-kit-border)"
                    strokeWidth={Math.max(1, strokeBase * 0.85)}
                  />
                ))}

                {roughOutline && (
                  <path
                    d={roughOutline}
                    fill="none"
                    stroke="var(--des-kit-ink)"
                    strokeWidth={strokeBase * 1.15}
                    strokeLinecap="round"
                    data-testid={`des-rough-path-${el.id}`}
                  />
                )}
              </g>
            );
          }

          if (el.role === "badge" || el.role === "cta") {
            const isCta = el.role === "cta";
            const radius = el.borderRadius ?? (isCta ? 12 : el.height / 2);
            const roughPath = artboard.sketchMode
              ? roughifyRectPath(el.x, el.y, el.width, el.height, (isCta ? 131 : 83) + index * 11, { roughness: 1.75 })
              : null;

            return (
              <g key={el.id} data-element-id={el.id} data-role={el.role} onClick={() => onSelectElement?.(el.id)}>
                <rect
                  x={el.x}
                  y={el.y}
                  width={el.width}
                  height={el.height}
                  rx={radius}
                  fill={isCta ? "var(--des-kit-accent)" : "var(--des-kit-surface)"}
                  stroke={isCta || artboard.sketchMode ? "none" : "var(--des-kit-accent)"}
                  strokeWidth={strokeBase}
                />
                {roughPath && (
                  <path
                    d={roughPath}
                    fill="none"
                    stroke={isCta ? "var(--des-kit-ink)" : "var(--des-kit-accent)"}
                    strokeWidth={strokeBase}
                    strokeLinecap="round"
                  />
                )}
                <text
                  x={el.x + el.width / 2}
                  y={el.y + el.height / 2}
                  dominantBaseline="central"
                  textAnchor="middle"
                  fill={isCta ? "var(--des-kit-on-accent)" : "var(--des-kit-accent)"}
                  fontSize={fontSize}
                  fontWeight={700}
                  fontFamily={isCta ? fontPairing.headingFamily : fontPairing.accentFamily}
                >
                  {clampTextForBox(text, el.width, fontSize)}
                </text>
              </g>
            );
          }

          if (el.role === "headline") {
            const fittedTitle = clampTextForBox(text, el.width, fontSize);
            const extrudeStep = Math.max(2, Math.round(fontSize * 0.065));
            const baseTextX = el.x + el.width / 2;
            const baseTextY = el.y + el.height / 2;

            return (
              <g
                key={el.id}
                data-element-id={el.id}
                data-role={el.role}
                data-typo-effect={typoEffectId}
                onClick={() => onSelectElement?.(el.id)}
              >
                {typoEffectId === "ribbon-badge" && (
                  <path
                    d={buildRibbonPath(el.x, el.y + el.height * 0.1, el.width, el.height * 0.8)}
                    fill="var(--des-kit-accent)"
                  />
                )}

                {typoEffectId === "extrude-3d" && (
                  <>
                    <text
                      x={baseTextX + extrudeStep * 3}
                      y={baseTextY + extrudeStep * 3}
                      dominantBaseline="central"
                      textAnchor="middle"
                      fill="var(--des-kit-accent-2)"
                      fillOpacity={0.48}
                      fontSize={fontSize}
                      fontWeight={fontPairing.headingWeight}
                      fontFamily={fontPairing.headingFamily}
                    >
                      {fittedTitle}
                    </text>
                    <text
                      x={baseTextX + extrudeStep * 1.5}
                      y={baseTextY + extrudeStep * 1.5}
                      dominantBaseline="central"
                      textAnchor="middle"
                      fill="var(--des-kit-accent)"
                      fillOpacity={0.74}
                      fontSize={fontSize}
                      fontWeight={fontPairing.headingWeight}
                      fontFamily={fontPairing.headingFamily}
                    >
                      {fittedTitle}
                    </text>
                  </>
                )}

                {typoEffectId === "curved-arch" ? (
                  <text
                    fill="var(--des-kit-ink)"
                    fontSize={fontSize}
                    fontWeight={fontPairing.headingWeight}
                    fontFamily={fontPairing.headingFamily}
                    letterSpacing={fontPairing.letterSpacingHeading}
                  >
                    <textPath href={`#${archPathId}`} startOffset="50%" textAnchor="middle">
                      {fittedTitle}
                    </textPath>
                  </text>
                ) : (
                  <text
                    x={baseTextX}
                    y={baseTextY}
                    dominantBaseline="central"
                    textAnchor="middle"
                    fill={
                      typoEffectId === "ribbon-badge"
                        ? "var(--des-kit-on-accent)"
                        : typoEffectId === "gradient-ink"
                          ? `url(#${inkGradId})`
                          : "var(--des-kit-ink)"
                    }
                    stroke={typoEffectId === "sticker-outline" ? "var(--des-kit-bg)" : undefined}
                    strokeWidth={typoEffectId === "sticker-outline" ? Math.max(4, Math.round(fontSize * 0.16)) : undefined}
                    paintOrder={typoEffectId === "sticker-outline" ? "stroke fill" : undefined}
                    filter={typoEffectId === "neon-glow" ? `url(#${glowFilterId})` : undefined}
                    fontSize={fontSize}
                    fontWeight={fontPairing.headingWeight}
                    fontFamily={fontPairing.headingFamily}
                    letterSpacing={fontPairing.letterSpacingHeading}
                  >
                    {fittedTitle}
                  </text>
                )}

                {isSelected && (
                  <rect
                    x={el.x}
                    y={el.y}
                    width={el.width}
                    height={el.height}
                    fill="none"
                    stroke="var(--des-kit-accent)"
                    strokeDasharray="6 4"
                    strokeWidth={strokeBase}
                  />
                )}
              </g>
            );
          }

          const isLogo = el.role === "logo";
          return (
            <g key={el.id} data-element-id={el.id} data-role={el.role} onClick={() => onSelectElement?.(el.id)}>
              <text
                x={isLogo ? el.x : el.x + el.width / 2}
                y={el.y + el.height / 2}
                dominantBaseline="central"
                textAnchor={isLogo ? "start" : "middle"}
                fill={isLogo ? "var(--des-kit-ink)" : "var(--des-kit-muted)"}
                fontSize={fontSize}
                fontWeight={isLogo ? 800 : fontPairing.bodyWeight}
                fontFamily={isLogo ? fontPairing.accentFamily : fontPairing.bodyFamily}
              >
                {clampTextForBox(text, el.width, fontSize)}
              </text>
            </g>
          );
        })}

        {bleed.enabled && (
          <g data-testid="des-bleed-guides-overlay">
            <rect
              x={bleed.trimRect.x}
              y={bleed.trimRect.y}
              width={bleed.trimRect.width}
              height={bleed.trimRect.height}
              fill="none"
              stroke="var(--des-guide-trim)"
              strokeWidth={Math.max(1.5, Math.round(minDim * 0.0028))}
              strokeDasharray="10 6"
            />
            <rect
              x={bleed.safeRect.x}
              y={bleed.safeRect.y}
              width={bleed.safeRect.width}
              height={bleed.safeRect.height}
              fill="none"
              stroke="var(--des-guide-safe)"
              strokeWidth={Math.max(1.2, Math.round(minDim * 0.0022))}
              strokeDasharray="6 6"
            />
            {[
              [bleed.trimRect.x, bleed.trimRect.y, -1, -1],
              [bleed.trimRect.x + bleed.trimRect.width, bleed.trimRect.y, 1, -1],
              [bleed.trimRect.x, bleed.trimRect.y + bleed.trimRect.height, -1, 1],
              [bleed.trimRect.x + bleed.trimRect.width, bleed.trimRect.y + bleed.trimRect.height, 1, 1],
            ].map(([cx, cy, dx, dy], idx) => (
              <g key={`crop-${idx}`} stroke="var(--des-guide-trim)" strokeWidth={2}>
                <line x1={cx} y1={cy} x2={cx + dx * bleed.cropMarkLengthPx} y2={cy} />
                <line x1={cx} y1={cy} x2={cx} y2={cy + dy * bleed.cropMarkLengthPx} />
              </g>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
