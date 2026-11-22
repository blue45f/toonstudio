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

export interface TechSeminarRecipeSvgDiagramProps {
  readonly recipeId: string;
  readonly diagram: SeminarRecipeDiagramSpec;
}

const NODE_X = [16, 246, 476, 706] as const;
const NODE_WIDTH = 198;
const NODE_Y = 22;
const NODE_HEIGHT = 96;
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

  return (
    <figure className="m-0 grid gap-2.5 rounded-2xl border border-line/80 bg-raised/70 p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-xs font-extrabold tracking-tight text-fg-2">
          흐름 도식 · {diagram.caption}
        </figcaption>
        <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-[0.68rem] font-bold text-fg-3">
          SVG 4단계
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-labelledby={titleId}
          viewBox="0 0 920 198"
          className="block h-auto w-full min-w-[640px]"
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

          {/* 3개 연결 화살표 + 전달 데이터 라벨 */}
          {[0, 1, 2].map((edgeIndex) => {
            const x1 = NODE_X[edgeIndex] + NODE_WIDTH + 3;
            const x2 = NODE_X[edgeIndex + 1] - 4;
            const midX = (x1 + x2) / 2;
            const label = diagram.edgeLabels[edgeIndex] ?? "";
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
                <text
                  x={midX}
                  y={NODE_Y + NODE_HEIGHT + 22}
                  textAnchor="middle"
                  fill="var(--color-fg-3)"
                  fontSize="11"
                  fontWeight="700"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* 4개 아키텍처 노드 카드 */}
          {diagram.nodes.map((node, index) => {
            const x = NODE_X[index];
            const stroke = toneStrokeVar(node.tone);
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
                  y={NODE_Y + 12}
                  width="32"
                  height="20"
                  rx="999"
                  fill={stroke}
                />
                <text
                  x={x + 28}
                  y={NODE_Y + 25.5}
                  textAnchor="middle"
                  fill="var(--color-on-accent)"
                  fontSize="10.5"
                  fontWeight="800"
                >
                  0{index + 1}
                </text>
                <text
                  x={x + 52}
                  y={NODE_Y + 26}
                  fill="var(--color-fg)"
                  fontSize="13"
                  fontWeight="800"
                >
                  {node.title.replace(/^\d+\.\s*/u, "")}
                </text>
                <text
                  x={x + 14}
                  y={NODE_Y + 62}
                  fill="var(--color-fg-2)"
                  fontSize="11.5"
                  fontWeight="600"
                >
                  {node.detail}
                </text>
              </g>
            );
          })}

          {/* 하단 불변식·경계 요약 띠 */}
          <rect
            x="16"
            y="152"
            width="888"
            height="34"
            rx="10"
            fill="var(--color-panel)"
            stroke="var(--color-line-strong)"
            strokeWidth="1.2"
          />
          <text
            x="30"
            y="173"
            fill="var(--color-fg-2)"
            fontSize="11.5"
            fontWeight="700"
          >
            {diagram.guardNote.length > 96
              ? `${diagram.guardNote.slice(0, 95)}…`
              : diagram.guardNote}
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
