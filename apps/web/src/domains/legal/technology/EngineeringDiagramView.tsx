import { useId, type ReactNode } from "react";

import {
  FONT,
  LAYER_METRICS,
  layoutGraph,
  layoutLayers,
  layoutSequence,
  type GraphLayout,
  type LayersLayout,
  type Point,
  type Rect,
  type SequenceLayout,
} from "./engineering-diagram-layout";
import type {
  EngineeringDiagram,
  EngineeringDiagramShape,
  EngineeringDiagramTone,
} from "./engineering-diagram-types";
import type { LocalizedText } from "./engineering-story-content";
import "./engineering-surfaces.css";

import { cx } from "@/shared/lib/cx";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringDiagramView", ko, en);

export interface EngineeringDiagramViewProps {
  readonly diagram: EngineeringDiagram;
  readonly className?: string;
  /** 슬라이드 썸네일·인쇄처럼 폭이 좁아도 SVG를 유지해야 할 때 사용한다. */
  readonly fixed?: boolean;
  /** `contain`이면 부모 높이에 맞춰 축소한다(발표 슬라이드). */
  readonly fit?: "width" | "contain";
  readonly showCaption?: boolean;
}

const BASELINE = 0.34;

interface LinesProps {
  readonly lines: readonly string[];
  readonly x: number;
  readonly top: number;
  readonly lineHeight: number;
  readonly fontSize: number;
  readonly className: string;
  readonly anchor?: "start" | "middle" | "end";
}

/** 줄 묶음을 `top`(첫 줄 윗선)부터 그린다. */
function Lines({ lines, x, top, lineHeight, fontSize, className, anchor = "middle" }: LinesProps) {
  if (lines.length === 0) return null;
  return (
    <text className={className} textAnchor={anchor} fontSize={fontSize}>
      {lines.map((line, index) => (
        <tspan key={`${index}-${line}`} x={x} y={top + index * lineHeight + fontSize * (1 - BASELINE) - fontSize * 0.1}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function blockHeight(label: number, sub: number, labelLine = 21, subLine = 17, gap = 5): number {
  return label * labelLine + (sub > 0 ? gap + sub * subLine : 0);
}

function pathOf(points: readonly Point[]): string {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join(" ");
}

function NodeShape({ rect, shape, tone }: { readonly rect: Rect; readonly shape: EngineeringDiagramShape; readonly tone: EngineeringDiagramTone }) {
  const { x, y, w, h } = rect;
  if (shape === "cylinder") {
    const ry = 11;
    return (
      <g className="eng-dia__shape" data-tone={tone}>
        <path d={`M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry} V ${y + h - ry} A ${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry} Z`} />
        <path d={`M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry}`} className="eng-dia__shape-rim" />
      </g>
    );
  }
  if (shape === "diamond") {
    return (
      <polygon
        className="eng-dia__shape"
        data-tone={tone}
        points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`}
      />
    );
  }
  const radius = shape === "pill" ? h / 2 : shape === "cloud" ? 30 : 14;
  return (
    <rect
      className="eng-dia__shape"
      data-tone={tone}
      data-shape={shape}
      x={x}
      y={y}
      width={w}
      height={h}
      rx={radius}
    />
  );
}

function GraphSvg({ layout, markerId, markerStartId, text }: { readonly layout: GraphLayout; readonly markerId: string; readonly markerStartId: string; readonly text: (value: LocalizedText) => string }) {
  return (
    <>
      {layout.groups.map(({ group, rect }) => (
        <g key={group.id} className="eng-dia__group" data-tone={group.tone ?? "neutral"}>
          <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={22} className="eng-dia__group-frame" />
          <text x={rect.x + 18} y={rect.y + 22} className="eng-dia__group-label" fontSize={FONT.group}>
            {text(group.label)}
          </text>
        </g>
      ))}
      {layout.edges.map(({ edge, points }) =>
        points.length > 1 ? (
          <path
            key={`${edge.from}-${edge.to}`}
            d={pathOf(points)}
            className="eng-dia__edge"
            data-style={edge.style ?? "solid"}
            markerEnd={`url(#${markerId})`}
            markerStart={edge.both ? `url(#${markerStartId})` : undefined}
          />
        ) : null,
      )}
      {layout.nodes.map(({ node, rect, labelLines, subLines }) => {
        const tone = node.tone ?? "neutral";
        const total = blockHeight(labelLines.length, subLines.length);
        const top = rect.y + (rect.h - total) / 2 + (node.shape === "cylinder" ? 6 : 0);
        return (
          <g key={node.id} className="eng-dia__node" data-node={node.id}>
            <NodeShape rect={rect} shape={node.shape ?? "box"} tone={tone} />
            <Lines lines={labelLines} x={rect.x + rect.w / 2} top={top} lineHeight={21} fontSize={FONT.nodeLabel} className="eng-dia__node-label" />
            <Lines lines={subLines} x={rect.x + rect.w / 2} top={top + labelLines.length * 21 + 5} lineHeight={17} fontSize={FONT.nodeSub} className="eng-dia__node-sub" />
          </g>
        );
      })}
      {layout.edges.map(({ edge, labelAt, labelLines }) =>
        labelAt && labelLines.length > 0 ? (
          <text
            key={`label-${edge.from}-${edge.to}`}
            x={labelAt[0]}
            y={labelAt[1] - 6}
            textAnchor="middle"
            className="eng-dia__edge-label"
            fontSize={FONT.edgeLabel}
          >
            {labelLines[0]}
          </text>
        ) : null,
      )}
    </>
  );
}

function SequenceSvg({ layout, markerId }: { readonly layout: SequenceLayout; readonly markerId: string }) {
  return (
    <>
      {layout.actors.map(({ actor, lineX, rect }) => (
        <line key={`life-${actor.id}`} x1={lineX} x2={lineX} y1={rect.y + rect.h} y2={layout.lineBottom} className="eng-dia__lifeline" />
      ))}
      {layout.actors.map(({ actor, rect, labelLines, subLines }) => {
        const total = blockHeight(labelLines.length, subLines.length);
        const top = rect.y + (rect.h - total) / 2;
        return (
          <g key={actor.id} className="eng-dia__node">
            <NodeShape rect={rect} shape="box" tone={actor.tone ?? "neutral"} />
            <Lines lines={labelLines} x={rect.x + rect.w / 2} top={top} lineHeight={21} fontSize={FONT.actorLabel} className="eng-dia__node-label" />
            <Lines lines={subLines} x={rect.x + rect.w / 2} top={top + labelLines.length * 21 + 5} lineHeight={17} fontSize={FONT.actorSub} className="eng-dia__node-sub" />
          </g>
        );
      })}
      {layout.messages.map(({ message, y, fromX, toX, self, labelLines, noteLines, index }) => {
        const mid = (fromX + toX) / 2;
        const path = self ? `M ${fromX} ${y} h 40 v 28 h -40` : `M ${fromX} ${y} L ${toX} ${y}`;
        return (
          <g key={`${index}-${message.from}-${message.to}`} className="eng-dia__message">
            <path d={path} className="eng-dia__edge" data-style={message.style ?? "solid"} markerEnd={`url(#${markerId})`} />
            {self ? (
              <>
                <Lines lines={labelLines} x={fromX + 52} top={y - 14} lineHeight={18} fontSize={FONT.message} className="eng-dia__msg-label" anchor="start" />
                <Lines lines={noteLines} x={fromX + 52} top={y - 14 + labelLines.length * 18 + 2} lineHeight={15} fontSize={FONT.note} className="eng-dia__msg-note" anchor="start" />
              </>
            ) : (
              <>
                <Lines lines={labelLines} x={mid} top={y - 10 - labelLines.length * 18} lineHeight={18} fontSize={FONT.message} className="eng-dia__msg-label" />
                <Lines lines={noteLines} x={mid} top={y + 8} lineHeight={15} fontSize={FONT.note} className="eng-dia__msg-note" />
              </>
            )}
          </g>
        );
      })}
    </>
  );
}

function LayersSvg({ layout }: { readonly layout: LayersLayout }) {
  const m = LAYER_METRICS;
  return (
    <>
      {layout.layers.map(({ layer, rect, labelLines, subLines, chips }, index) => {
        const total = blockHeight(labelLines.length, subLines.length, 23, 17, 4);
        const top = rect.y + (rect.h - total) / 2;
        const next = layout.layers[index + 1];
        return (
          <g key={layer.id} className="eng-dia__node">
            <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={16} className="eng-dia__shape" data-tone={layer.tone ?? "neutral"} />
            <Lines lines={labelLines} x={rect.x + 22} top={top} lineHeight={23} fontSize={FONT.layerLabel} className="eng-dia__node-label" anchor="start" />
            <Lines lines={subLines} x={rect.x + 22} top={top + labelLines.length * 23 + 4} lineHeight={17} fontSize={FONT.layerSub} className="eng-dia__node-sub" anchor="start" />
            {chips.map((chip) => (
              <g key={chip.text}>
                <rect x={chip.x} y={chip.y} width={chip.w} height={26} rx={13} className="eng-dia__chip" />
                <text x={chip.x + chip.w / 2} y={chip.y + 17.5} textAnchor="middle" className="eng-dia__chip-text" fontSize={FONT.chip}>
                  {chip.text}
                </text>
              </g>
            ))}
            {next ? (
              <path
                d={`M ${rect.x + 34} ${rect.y + rect.h + 6} v ${m.gap - 14} m -6 -6 l 6 6 l 6 -6`}
                className="eng-dia__flow-arrow"
              />
            ) : null}
          </g>
        );
      })}
      {layout.brackets.map((bracket) => (
        <g key={`${bracket.top}-${bracket.bottom}`} className="eng-dia__bracket">
          <path d={`M ${bracket.x} ${bracket.top + 4} h 9 V ${bracket.bottom - 4} h -9`} />
          <Lines
            lines={bracket.labelLines}
            x={bracket.x + 18}
            top={(bracket.top + bracket.bottom) / 2 - (bracket.labelLines.length * 17) / 2}
            lineHeight={17}
            fontSize={FONT.bracket}
            className="eng-dia__bracket-label"
            anchor="start"
          />
        </g>
      ))}
    </>
  );
}

function TextAlternative({ diagram, text }: { readonly diagram: EngineeringDiagram; readonly text: (value: LocalizedText) => string }): ReactNode {
  if (diagram.kind === "graph") {
    const ordered = [...diagram.nodes].sort((a, b) => a.at[1] - b.at[1] || a.at[0] - b.at[0]);
    const labelOf = new Map(diagram.nodes.map((node) => [node.id, text(node.label)]));
    return (
      <>
        <ol aria-label={bi("구성 요소", "Components")}>
          {ordered.map((node) => (
            <li key={node.id}>
              <strong>{text(node.label)}</strong>
              {node.sub ? <span>{text(node.sub)}</span> : null}
            </li>
          ))}
        </ol>
        <ul aria-label={bi("연결", "Connections")} className="eng-dia__list-edges">
          {diagram.edges.map((edge) => (
            <li key={`${edge.from}-${edge.to}`}>
              {labelOf.get(edge.from)} {edge.both ? "↔" : "→"} {labelOf.get(edge.to)}
              {edge.label ? ` (${text(edge.label)})` : ""}
            </li>
          ))}
        </ul>
      </>
    );
  }
  if (diagram.kind === "sequence") {
    const labelOf = new Map(diagram.actors.map((actor) => [actor.id, text(actor.label)]));
    return (
      <ol aria-label={bi("순서", "Sequence")}>
        {diagram.messages.map((message, index) => (
          <li key={`${index}-${message.from}-${message.to}`}>
            <strong>{labelOf.get(message.from)} → {labelOf.get(message.to)}</strong>
            <span>{text(message.label)}{message.note ? ` · ${text(message.note)}` : ""}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol aria-label={bi("계층(위에서 아래로)", "Layers (top to bottom)")}>
      {diagram.layers.map((layer) => (
        <li key={layer.id}>
          <strong>{text(layer.label)}</strong>
          <span>{[layer.sub ? text(layer.sub) : "", ...(layer.chips ?? [])].filter(Boolean).join(" · ")}</span>
        </li>
      ))}
    </ol>
  );
}

/** 도식 명세를 접근성 SVG로 그린다. 좁은 컨테이너에서는 같은 내용을 목록으로 보여준다. */
export function EngineeringDiagramView({ diagram, className, fixed = false, fit = "width", showCaption = true }: EngineeringDiagramViewProps) {
  useBilingualI18nRevision();
  const uid = useId().replace(/:/gu, "");
  const markerId = `eng-dia-arrow-${uid}`;
  const markerStartId = `eng-dia-arrow-start-${uid}`;
  const text = (value: LocalizedText): string => bi(value.ko, value.en);

  let viewBox: readonly [number, number, number, number];
  let body: ReactNode;
  if (diagram.kind === "graph") {
    const layout = layoutGraph(diagram, text);
    viewBox = layout.viewBox;
    body = <GraphSvg layout={layout} markerId={markerId} markerStartId={markerStartId} text={text} />;
  } else if (diagram.kind === "sequence") {
    const layout = layoutSequence(diagram, text);
    viewBox = layout.viewBox;
    body = <SequenceSvg layout={layout} markerId={markerId} />;
  } else {
    const layout = layoutLayers(diagram, text);
    viewBox = layout.viewBox;
    body = <LayersSvg layout={layout} />;
  }

  return (
    <figure className={cx("eng-dia", className)} data-kind={diagram.kind} data-fixed={fixed ? "true" : undefined} data-fit={fit} data-diagram={diagram.id}>
      <svg
        className="eng-dia__svg"
        style={fit === "width" ? { maxWidth: `${Math.round(viewBox[2] * 1.35)}px`, marginInline: "auto" } : undefined}
        viewBox={viewBox.map((value) => Math.round(value * 10) / 10).join(" ")}
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="eng-dia__arrowhead" />
          </marker>
          <marker id={markerStartId} viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="eng-dia__arrowhead" />
          </marker>
        </defs>
        {body}
      </svg>
      <div className="eng-dia__list">
        <p className="eng-dia__list-alt">{text(diagram.alt)}</p>
        <TextAlternative diagram={diagram} text={text} />
      </div>
      {showCaption ? (
        <figcaption className="eng-dia__caption">
          <strong>{text(diagram.title)}</strong>
          <span>{text(diagram.caption)}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}

