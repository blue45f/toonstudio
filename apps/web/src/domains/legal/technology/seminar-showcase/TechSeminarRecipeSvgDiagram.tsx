/**
 * 실무 재사용 레시피 카드용 고대비 SVG 흐름 도식 컴포넌트.
 *
 * Calm Atelier 시맨틱 CSS 토큰(`--color-card`, `--color-fg`, `--color-accent`, `--color-good`,
 * `--color-warn`, `--color-cool`)만 사용해 라이트·다크·인쇄 모드 모두에서 선명한 대비를 유지한다.
 */

import type {
  SeminarDiagramTone,
  SeminarRecipeDiagramSpec,
} from "./tech-seminar-reusable-recipes";

import { fitSvgPillWidth, wrapSvgText } from "@/shared/lib/svg-text-wrap";

export interface TechSeminarRecipeSvgDiagramProps {
  readonly recipeId: string;
  readonly diagram: SeminarRecipeDiagramSpec;
}

const VIEW_WIDTH = 1040;
const VIEW_HEIGHT = 252;
const NODE_X = [16, 276, 536, 796] as const;
const NODE_WIDTH = 228;
const NODE_Y = 18;
const NODE_HEIGHT = 114;
const ARROW_Y = NODE_Y + NODE_HEIGHT / 2;

function toneStrokeVar(tone: SeminarDiagramTone): string {
  switch (tone) {
    case "accent":
      return "var(--color-accent)";
    case "cool":
      return "var(--color-cool, var(--color-accent-2))";
    case "warn":
      return "var(--color-warn)";
    case "good":
      return "var(--color-good)";
  }
}

function toneFillMix(tone: SeminarDiagramTone): string {
  const token = toneStrokeVar(tone);
  return `color-mix(in oklab, ${token} 11%, var(--color-card))`;
}

export function TechSeminarRecipeSvgDiagram({
  recipeId,
  diagram,
}: TechSeminarRecipeSvgDiagramProps) {
  const markerId = `recipe-flow-arrow-${recipeId}`;
  const titleId = `recipe-flow-title-${recipeId}`;
  const guardLines = wrapSvgText(diagram.guardNote, {
    maxWidth: VIEW_WIDTH - 64,
    fontSize: 11,
    maxLines: 2,
    bold: true,
  });

  return (
    <figure className="m-0 grid gap-2.5 rounded-2xl border border-line/80 bg-raised/70 p-3.5 [word-break:keep-all] sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-xs font-extrabold tracking-tight text-fg-2">
          흐름 도식 · {diagram.caption}
        </figcaption>
        <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-[0.68rem] font-bold text-fg-3">
          SVG 4단계
        </span>
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <svg
          role="img"
          aria-labelledby={titleId}
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          className="block h-auto w-full min-w-[680px] max-w-full"
        >
          <title id={titleId}>{diagram.ariaLabel}</title>
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 1.2 L 9 5 L 0 8.8 z" fill="var(--color-fg-2)" />
            </marker>
          </defs>

          {/* 3개 연결 화살표 + 비겹침 전달 데이터 배지 */}
          {[0, 1, 2].map((edgeIndex) => {
            const x1 = NODE_X[edgeIndex] + NODE_WIDTH + 3;
            const x2 = NODE_X[edgeIndex + 1] - 4;
            const midX = (x1 + x2) / 2;
            const label = diagram.edgeLabels[edgeIndex] ?? "";
            const labelLines = wrapSvgText(label, {
              maxWidth: 210,
              fontSize: 10.5,
              maxLines: 2,
              bold: true,
            });
            const longestLine = labelLines.reduce(
              (best, line) => (line.length > best.length ? line : best),
              labelLines[0] ?? "",
            );
            const pillW = fitSvgPillWidth(longestLine, 10.5, 10, 72, 224, true);
            const pillH = labelLines.length > 1 ? 34 : 24;
            const pillY = NODE_Y + NODE_HEIGHT + 16;
            const textCenterY = pillY + pillH / 2;
            const lineH = 13;
            const firstY = textCenterY - ((labelLines.length - 1) * lineH) / 2;

            return (
              <g key={edgeIndex}>
                <line
                  x1={x1}
                  y1={ARROW_Y}
                  x2={x2}
                  y2={ARROW_Y}
                  stroke="var(--color-fg-2)"
                  strokeWidth="2"
                  markerEnd={`url(#${markerId})`}
                />
                <line
                  x1={midX}
                  y1={ARROW_Y + 4}
                  x2={midX}
                  y2={pillY}
                  stroke="var(--color-line-strong)"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />
                <rect
                  x={midX - pillW / 2}
                  y={pillY}
                  width={pillW}
                  height={pillH}
                  rx="8"
                  fill="var(--color-card)"
                  stroke="var(--color-line)"
                  strokeWidth="1"
                />
                <text
                  x={midX}
                  y={firstY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="var(--color-fg-2)"
                  fontSize="10.5"
                  fontWeight="700"
                >
                  {labelLines.map((line, lineIdx) => (
                    <tspan key={`${edgeIndex}-edge-${lineIdx}`} x={midX} dy={lineIdx === 0 ? 0 : lineH}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}

          {/* 4개 아키텍처 노드 카드 */}
          {diagram.nodes.map((node, index) => {
            const x = NODE_X[index];
            const stroke = toneStrokeVar(node.tone);
            const cleanTitle = node.title.replace(/^\d+\.\s*/u, "");
            const titleLines = wrapSvgText(cleanTitle, {
              maxWidth: NODE_WIDTH - 62,
              fontSize: 13,
              maxLines: 2,
              bold: true,
            });
            const detailLines = wrapSvgText(node.detail, {
              maxWidth: NODE_WIDTH - 28,
              fontSize: 11.5,
              maxLines: 2,
              bold: false,
            });
            const titleStartY = titleLines.length > 1 ? NODE_Y + 20 : NODE_Y + 24;
            const detailStartY = titleLines.length > 1 ? NODE_Y + 72 : NODE_Y + 66;

            return (
              <g key={node.title}>
                <rect
                  x={x}
                  y={NODE_Y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx="14"
                  fill={toneFillMix(node.tone)}
                  stroke={stroke}
                  strokeWidth="1.8"
                />
                <rect
                  x={x + 12}
                  y={NODE_Y + 14}
                  width="32"
                  height="20"
                  rx="999"
                  fill={stroke}
                />
                <text
                  x={x + 28}
                  y={NODE_Y + 24}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="var(--color-on-accent)"
                  fontSize="10.5"
                  fontWeight="800"
                >
                  0{index + 1}
                </text>
                <text
                  x={x + 52}
                  y={titleStartY}
                  dominantBaseline="middle"
                  fill="var(--color-fg)"
                  fontSize="13"
                  fontWeight="800"
                >
                  {titleLines.map((line, lineIdx) => (
                    <tspan key={`${node.title}-t-${lineIdx}`} x={x + 52} dy={lineIdx === 0 ? 0 : 16}>
                      {line}
                    </tspan>
                  ))}
                </text>
                <text
                  x={x + 14}
                  y={detailStartY}
                  dominantBaseline="middle"
                  fill="var(--color-fg-2)"
                  fontSize="11.5"
                  fontWeight="600"
                >
                  {detailLines.map((line, lineIdx) => (
                    <tspan key={`${node.title}-d-${lineIdx}`} x={x + 14} dy={lineIdx === 0 ? 0 : 16}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}

          {/* 하단 불변식·경계 요약 띠 (멀티라인 래핑) */}
          <rect
            x="16"
            y="194"
            width={VIEW_WIDTH - 32}
            height="46"
            rx="10"
            fill="var(--color-panel)"
            stroke="var(--color-line-strong)"
            strokeWidth="1.2"
          />
          <text
            x="30"
            y={guardLines.length > 1 ? 209 : 217}
            dominantBaseline="middle"
            fill="var(--color-fg-2)"
            fontSize="11"
            fontWeight="700"
          >
            {guardLines.map((line, lineIdx) => (
              <tspan key={`guard-${lineIdx}`} x="30" dy={lineIdx === 0 ? 0 : 16}>
                {line}
              </tspan>
            ))}
          </text>
        </svg>
      </div>

      {/* 긴 불변식 설명과 좁은 화면 스크린 리더용 전문 */}
      <p className="rounded-xl border border-line/70 bg-card/75 px-3.5 py-2 text-xs leading-6 text-fg-2">
        {diagram.guardNote}
      </p>
    </figure>
  );
}
