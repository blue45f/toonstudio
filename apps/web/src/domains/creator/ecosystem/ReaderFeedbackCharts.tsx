import { useId } from "react";

import type { DropOffBin } from "./reader-feedback-summary";

/**
 * 독자 피드백 요약의 그래프 부품. 문구는 모두 호출자가 현재 언어로 만들어 넘기므로 이 파일은 언어를 모른다.
 *
 * 접근성 규칙
 * - 그래프는 색만으로 말하지 않는다: 값이 있는 칸의 윗줄에 개수를 글자로 쓰고, 같은 내용을 표로도 준다.
 * - 칸 색은 의미 토큰(accent)의 투명도로만 세기를 나타내며, 강제 색상 모드처럼 색이 무시되는 환경에서는 표가 대안이다.
 * - SVG 는 role="img" 에 제목·설명을 붙이고, 칸별 설명은 마우스 사용자를 위한 <title> 이다.
 */

const CELL_WIDTH = 34;
const CELL_GAP = 3;
/** 개수 글자는 칸 위의 별도 줄에 둔다. 글자가 칸 색 위에 놓이지 않으므로 칸 색의 농도와 무관하게 본문 글자(fg)와 같은 대비를 따른다. */
const COUNT_ROW_HEIGHT = 18;
const CELL_HEIGHT = 34;
const STRIP_HEIGHT = COUNT_ROW_HEIGHT + CELL_HEIGHT;

export interface HeatStripTable {
  readonly summary: string;
  readonly caption: string;
  readonly rangeHeader: string;
  readonly countHeader: string;
  /** 비율 열 머리글. 비율을 보여 주지 않으면 null. */
  readonly shareHeader: string | null;
}

export interface DropOffHeatStripProps {
  readonly bins: readonly DropOffBin[];
  /** 구간 이름(예: "7~8컷", "40~49%"). */
  readonly rangeLabel: (bin: DropOffBin) => string;
  /** 개수 문구(예: "3명"). */
  readonly countLabel: (count: number) => string;
  readonly title: string;
  readonly description: string;
  readonly startLabel: string;
  readonly endLabel: string;
  readonly table: HeatStripTable;
  /** 이 방식으로 멈춘 곳을 적은 응답 수. 비율의 분모다. */
  readonly total: number;
  /** 비율(%)을 보여 줄 만큼 표본이 큰지. */
  readonly showShare: boolean;
}

export function DropOffHeatStrip({ bins, rangeLabel, countLabel, title, description, startLabel, endLabel, table, total, showShare }: DropOffHeatStripProps) {
  const id = useId();
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  const width = bins.length * (CELL_WIDTH + CELL_GAP) - CELL_GAP;
  return (
    <div className="min-w-0">
      <figure>
        <div className="overflow-x-auto pb-1">
          <svg
            role="img" aria-labelledby={`${id}-title ${id}-desc`} viewBox={`0 0 ${width} ${STRIP_HEIGHT}`}
            width={width} height={STRIP_HEIGHT} className="max-w-none"
          >
            <title id={`${id}-title`}>{title}</title>
            <desc id={`${id}-desc`}>{description}</desc>
            {bins.map((bin, index) => {
              const x = index * (CELL_WIDTH + CELL_GAP);
              const strength = bin.count / max;
              return (
                <g key={bin.from}>
                  <title>{`${rangeLabel(bin)}: ${countLabel(bin.count)}`}</title>
                  <rect x={x} y={COUNT_ROW_HEIGHT} width={CELL_WIDTH} height={CELL_HEIGHT} rx={6} style={{ fill: "var(--color-raised)", stroke: "var(--color-line)", strokeWidth: 1 }} />
                  {bin.count > 0 ? (
                    <>
                      <rect x={x} y={COUNT_ROW_HEIGHT} width={CELL_WIDTH} height={CELL_HEIGHT} rx={6} style={{ fill: "var(--color-accent)", fillOpacity: 0.2 + 0.8 * strength }} />
                      <text
                        x={x + CELL_WIDTH / 2} y={COUNT_ROW_HEIGHT / 2} textAnchor="middle" dominantBaseline="central"
                        fontSize={14} fontWeight={700} style={{ fill: "var(--color-fg)" }}
                      >
                        {bin.count}
                      </text>
                    </>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
        <figcaption className="mt-1 flex justify-between gap-2 text-xs text-fg-3"><span>{startLabel}</span><span>{endLabel}</span></figcaption>
      </figure>
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-fg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{table.summary}</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{table.caption}</caption>
            <thead>
              <tr className="text-xs text-fg-3">
                <th scope="col" className="py-1 pr-3 font-bold">{table.rangeHeader}</th>
                <th scope="col" className="py-1 pr-3 text-right font-bold">{table.countHeader}</th>
                {table.shareHeader && showShare ? <th scope="col" className="py-1 text-right font-bold">{table.shareHeader}</th> : null}
              </tr>
            </thead>
            <tbody>
              {bins.map((bin) => (
                <tr key={bin.from} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-3 font-normal text-fg-2">{rangeLabel(bin)}</th>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-fg">{bin.count}</td>
                  {table.shareHeader && showShare ? <td className="py-1.5 text-right tabular-nums text-fg-2">{total === 0 ? "—" : `${Math.round((bin.count / total) * 100)}%`}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export interface DistributionRow {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

/** 가로 막대 목록. 개수는 글자로 쓰고, 막대는 보조 시각 단서다. 비율은 표본이 클 때만 덧붙인다. */
export function DistributionList({ rows, total, showShare, countLabel }: {
  readonly rows: readonly DistributionRow[];
  readonly total: number;
  readonly showShare: boolean;
  readonly countLabel: (count: number) => string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-2 text-sm">
          <span className="truncate text-fg-2" title={row.label}>{row.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-raised" aria-hidden>
            <span className="block h-full rounded-full bg-accent" style={{ width: `${(row.count / max) * 100}%` }} />
          </span>
          <span className="min-w-14 text-right tabular-nums text-fg">
            {countLabel(row.count)}{showShare && total > 0 ? ` · ${Math.round((row.count / total) * 100)}%` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
