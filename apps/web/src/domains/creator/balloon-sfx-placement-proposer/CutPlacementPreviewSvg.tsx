import type { ReactElement } from "react";
import { buildBalloonOutlinePath, type ProtectedZone, type DialogueItem, type PlacedBalloon, type PlacedSfx, type NegativeSpaceGrid, type SfxAccentStyle } from "./balloon-sfx-placement-engine";

const SFX_INK_OKLCH: Readonly<Record<SfxAccentStyle, string>> = {
  impact: "oklch(0.54 0.19 26)",
  pulse: "oklch(0.58 0.17 16)",
  whisper: "oklch(0.46 0.11 224)",
  tension: "oklch(0.28 0.03 55)",
};

function wrapBalloonLines(text: string, maxChars: number): readonly string[] {
  const graphemes = Array.from(new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(text.trim() || "…"), (item) => item.segment);
  const lines: string[] = [];
  let line = "";
  for (const grapheme of graphemes) {
    if (line.length > 0 && line.length + grapheme.length > maxChars) {
      if (lines.length === 2) { lines.push(`${line}…`); return lines; }
      lines.push(line);
      line = "";
    }
    line += grapheme;
  }
  if (line) lines.push(line);
  return lines;
}

export function CutPlacementPreviewSvg(props: {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly safeMargin: number;
  readonly protectedZones: readonly ProtectedZone[];
  readonly dialogues: readonly DialogueItem[];
  readonly balloons: readonly PlacedBalloon[];
  readonly sfx: PlacedSfx | null;
  readonly grid: NegativeSpaceGrid;
  readonly showProtectedZones: boolean;
  readonly showNegativeGrid: boolean;
  readonly displayMode: "suggested" | "previewing" | "applied" | "reverted";
  readonly isEn: boolean;
}): ReactElement {
  const {
    canvasWidth, canvasHeight, safeMargin, protectedZones, dialogues,
    balloons, sfx, grid, showProtectedZones, showNegativeGrid, displayMode, isEn,
  } = props;
  const flowPoints = balloons
    .map((b) => `${Math.round(b.box.x + b.box.width / 2)},${Math.round(b.box.y + b.box.height / 2)}`)
    .join(" ");

  return (
    <svg
      data-testid="proposer-cut-preview-svg"
      data-display-mode={displayMode}
      data-balloon-count={balloons.length}
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      className="mx-auto block aspect-[2/3] w-full max-w-[340px] rounded-xl border border-line bg-canvas text-fg shadow-sm"
      role="img"
      aria-label={isEn ? "Webtoon 800 by 1200 cut balloon and SFX placement preview" : "800×1200 웹툰 컷 말풍선·효과음 배치 프리뷰"}
    >
      <rect x={0} y={0} width={canvasWidth} height={canvasHeight} fill="var(--color-canvas)" />

      {showNegativeGrid ? (
        <g data-testid="proposer-negative-grid-layer" aria-hidden="true">
          {grid.cells.map((cell) => {
            const fill = cell.faceOcclusionRatio > 0
              ? "oklch(0.58 0.15 28 / 0.16)"
              : cell.occlusionRatio > 0
                ? "oklch(0.68 0.12 72 / 0.12)"
                : cell.score >= 70
                  ? "oklch(0.56 0.13 158 / 0.14)"
                  : "oklch(0.55 0.08 224 / 0.05)";
            return (
              <rect
                key={`${cell.row}-${cell.col}`}
                x={cell.box.x} y={cell.box.y} width={cell.box.width} height={cell.box.height}
                fill={fill} stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.8}
              />
            );
          })}
        </g>
      ) : null}

      {/* 여백 안전선 가이드 */}
      <g className="text-fg-3">
        <rect
          x={safeMargin} y={safeMargin} width={canvasWidth - safeMargin * 2} height={canvasHeight - safeMargin * 2}
          fill="none" stroke="currentColor" strokeOpacity={0.5} strokeDasharray="10 8" strokeWidth={2.2}
        />
        <text x={safeMargin + 10} y={safeMargin + 22} fill="currentColor" fontSize={14} fontWeight={600}>
          {isEn ? `Safe Margin ${safeMargin}px` : `여백 안전선 ${safeMargin}px`}
        </text>
      </g>

      {/* 인물 러프 실루엣 가이드 및 화자 입 기준점 */}
      <g aria-hidden="true" className="text-fg-2">
        {protectedZones.filter((z) => z.kind === "face").map((face) => {
          const cx = face.box.x + face.box.width / 2;
          const cy = face.box.y + face.box.height / 2;
          return (
            <g key={`guide-${face.id}`}>
              <ellipse cx={cx} cy={cy} rx={face.box.width * 0.44} ry={face.box.height * 0.46} fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeOpacity={0.45} strokeWidth={2.2} />
              <path
                d={`M ${Math.round(face.box.x - 36)} ${Math.round(face.box.y + face.box.height + 120)} Q ${Math.round(cx)} ${Math.round(face.box.y + face.box.height - 6)} ${Math.round(face.box.x + face.box.width + 36)} ${Math.round(face.box.y + face.box.height + 120)}`}
                fill="currentColor" fillOpacity={0.06} stroke="currentColor" strokeOpacity={0.35} strokeWidth={2}
              />
            </g>
          );
        })}
        {dialogues.map((d) => (
          <circle key={`mouth-${d.id}`} cx={d.mouthX} cy={d.mouthY} r={6.5} className="text-bad" fill="currentColor" fillOpacity={0.85} stroke="var(--color-canvas)" strokeWidth={2} />
        ))}
      </g>

      {/* 보호 영역 점선 박스 */}
      {showProtectedZones ? (
        <g data-testid="proposer-protected-zones-layer">
          {protectedZones.map((zone) => {
            const isFace = zone.kind === "face" || zone.kind === "eyes";
            const stroke = isFace ? "oklch(0.58 0.17 28)" : zone.kind === "hand" ? "oklch(0.64 0.14 72)" : "oklch(0.52 0.12 224)";
            const fill = isFace ? "oklch(0.58 0.17 28 / 0.08)" : zone.kind === "hand" ? "oklch(0.64 0.14 72 / 0.08)" : "oklch(0.52 0.12 224 / 0.08)";
            return (
              <g key={zone.id} data-testid={`proposer-zone-${zone.id}`}>
                <rect x={zone.box.x} y={zone.box.y} width={zone.box.width} height={zone.box.height} rx={10} fill={fill} stroke={stroke} strokeDasharray="9 6" strokeWidth={2.4} />
                <text x={zone.box.x + 8} y={zone.box.y + 20} fill={stroke} fontSize={14} fontWeight={700}>
                  {isEn ? zone.labelEn : zone.labelKo}
                </text>
              </g>
            );
          })}
        </g>
      ) : null}

      {/* 시선 순서 흐름선 1→2→3 */}
      {balloons.length >= 2 ? (
        <polyline
          data-testid="proposer-reading-flow-line"
          points={flowPoints} fill="none" className="text-accent" stroke="currentColor" strokeOpacity={0.6}
          strokeDasharray="8 8" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
        />
      ) : null}

      {/* 말풍선 + 꼬리 + 시선 번호 */}
      {balloons.map((b) => {
        const lines = wrapBalloonLines(b.text, Math.max(8, Math.floor((b.box.width - 36) / 16)));
        const cx = Math.round(b.box.x + b.box.width / 2);
        const startY = Math.round(b.box.y + b.box.height / 2 - ((lines.length - 1) * 22) / 2 + 6);
        return (
          <g key={`${b.dialogueId}-${b.order}`} data-testid={`proposer-svg-balloon-${b.order}`} data-style={b.style} className="text-fg">
            {b.tailStyle === "thought-dots" ? (
              <g>
                <circle cx={Math.round((b.tailOriginX * 2 + b.tailTipX) / 3)} cy={Math.round((b.tailOriginY * 2 + b.tailTipY) / 3)} r={8.5} fill="var(--color-card)" stroke="currentColor" strokeWidth={2.4} />
                <circle cx={Math.round((b.tailOriginX + b.tailTipX * 2) / 3)} cy={Math.round((b.tailOriginY + b.tailTipY * 2) / 3)} r={5.2} fill="var(--color-card)" stroke="currentColor" strokeWidth={2.2} />
              </g>
            ) : (
              <polygon
                points={`${b.tailBaseLeftX},${b.tailBaseLeftY} ${b.tailTipX},${b.tailTipY} ${b.tailBaseRightX},${b.tailBaseRightY}`}
                fill="var(--color-card)" stroke="currentColor" strokeWidth={2.6} strokeLinejoin="round"
              />
            )}
            <path
              d={buildBalloonOutlinePath(b.box, b.style)} fill="var(--color-card)"
              stroke="currentColor" strokeWidth={b.style === "shout-burst" ? 3.2 : 2.6}
              strokeDasharray={b.style === "whisper-dashed" ? "8 6" : undefined}
            />
            <circle cx={b.box.x + 18} cy={b.box.y + 18} r={14} className="text-accent" fill="currentColor" />
            <text x={b.box.x + 18} y={b.box.y + 23} textAnchor="middle" className="text-on-accent" fill="currentColor" fontSize={14} fontWeight={700}>
              {b.order}
            </text>
            <text x={cx} y={startY} textAnchor="middle" fill="currentColor" fontSize={17} fontWeight={600}>
              {lines.map((line, idx) => (
                <tspan key={`${b.order}-l-${idx}`} x={cx} dy={idx === 0 ? 0 : 22}>{line}</tspan>
              ))}
            </text>
          </g>
        );
      })}

      {/* 회전된 한글 SFX */}
      {sfx ? (
        <g
          data-testid="proposer-svg-sfx"
          data-sfx-text={sfx.text}
          data-sfx-rotation={sfx.rotationDeg}
          transform={`translate(${sfx.centerX}, ${sfx.centerY}) rotate(${sfx.rotationDeg})`}
        >
          <text
            x={0} y={0} textAnchor="middle" dominantBaseline="central"
            fill={SFX_INK_OKLCH[sfx.accentStyle]} stroke="var(--color-canvas)"
            strokeWidth={7} paintOrder="stroke" fontSize={sfx.fontSize} fontWeight={900}
          >
            {sfx.text}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

/** 얼굴 회피 네거티브 스페이스 기반 말풍선 꼬리·효과음(SFX) 자리 자동 추천 패널. */
