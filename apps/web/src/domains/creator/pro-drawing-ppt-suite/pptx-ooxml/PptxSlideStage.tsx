/**
 * 실시간 16:9 / 4:3 / A4 슬라이드 미리보기 스테이지 컴포넌트.
 * 텍스트·글머리·벡터 도형·SmartArt 6종·네이티브 차트 4종·스타일 표·빌드 애니메이션 재생을 렌더링한다.
 */

import type { CSSProperties } from "react";

import type {
  BuildAnimationTarget,
  PptxChartBlock,
  PptxSlideInput,
  PptxSmartArtBlock,
  PptxVectorShape,
} from "./ooxml-pptx-types";
import {
  PPTX_SLIDE_SIZES,
  type OoxmlThemeId,
  type PptxSlideSizePreset,
} from "./ooxml-theme-spec";
import {
  TRANSITION_OPTIONS,
  buildNativeChartSvgModel,
  buildSmartArtSvgModel,
  computeAnimationPlaybackFrame,
  type AnimationFrameState,
} from "./ppt-smartart-chart-table";
import "./pptx-slide-stage.css";

export interface PptxSlideStageProps {
  readonly slide: PptxSlideInput;
  readonly slideIndex: number;
  readonly totalSlides: number;
  readonly themeId: OoxmlThemeId;
  readonly slideSize: PptxSlideSizePreset;
  readonly playbackElapsedMs: number | null;
  readonly transitionPulseKey: number;
}

function toMotionStyle(frame: AnimationFrameState): CSSProperties {
  const style: CSSProperties = {
    opacity: frame.opacity,
    transform: `translate3d(${frame.translateX}px, ${frame.translateY}px, 0) scale(${frame.scale})`,
  };
  if (frame.clipRightPercent > 0) {
    style.clipPath = `inset(0 ${frame.clipRightPercent}% 0 0)`;
  }
  return style;
}

function SmartArtStageSvg({ smartArt }: { readonly smartArt: PptxSmartArtBlock }) {
  const model = buildSmartArtSvgModel(smartArt.variant, smartArt.items, 520, 236);
  const arrowMarkerId = `sa-arrow-${smartArt.id}`;

  return (
    <div className="pptx-visual-card" data-testid={`smartart-preview-${smartArt.variant}`}>
      {smartArt.title ? <div className="pptx-visual-caption">{smartArt.title}</div> : null}
      <svg
        viewBox={`0 0 ${model.width} ${model.height}`}
        className="pptx-stage-svg"
        role="img"
        aria-label={smartArt.title ?? `SmartArt ${smartArt.variant}`}
      >
        <defs>
          <marker
            id={arrowMarkerId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" className="pptx-svg-connector-head" />
          </marker>
        </defs>

        {model.connectors.map((conn) => (
          <path
            key={conn.id}
            d={conn.path}
            className="pptx-svg-connector"
            markerEnd={conn.hasArrow ? `url(#${arrowMarkerId})` : undefined}
          />
        ))}

        {model.centerLabel ? (
          <g>
            <circle
              cx={model.width / 2}
              cy={model.height / 2}
              r={26}
              className="pptx-svg-hub"
            />
            <text
              x={model.width / 2}
              y={model.height / 2 + 4}
              textAnchor="middle"
              className="pptx-svg-hub-label"
            >
              {model.centerLabel}
            </text>
          </g>
        ) : null}

        {model.nodes.map((node) => (
          <g key={node.id}>
            <path d={node.path} fill={node.fillToken} className="pptx-svg-smartart-node" />
            <text
              x={node.labelX}
              y={node.labelY}
              textAnchor={node.textAnchor}
              className="pptx-svg-node-title"
            >
              {node.label}
            </text>
            {node.detail ? (
              <text
                x={node.detailX}
                y={node.detailY}
                textAnchor={node.textAnchor}
                className="pptx-svg-node-detail"
              >
                {node.detail}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

function NativeChartStageSvg({ chart }: { readonly chart: PptxChartBlock }) {
  const model = buildNativeChartSvgModel(chart.variant, chart.points, 480, 224, chart.unit ?? "");

  return (
    <div className="pptx-visual-card" data-testid={`chart-preview-${chart.variant}`}>
      <div className="pptx-visual-caption">{chart.title}</div>
      <svg
        viewBox={`0 0 ${model.width} ${model.height}`}
        className="pptx-stage-svg"
        role="img"
        aria-label={chart.title}
      >
        {(model.variant === "bar" || model.variant === "line") &&
          model.gridLines.map((line) => (
            <g key={line.label}>
              <line
                x1={44}
                x2={model.width - 20}
                y1={line.y}
                y2={line.y}
                className="pptx-svg-gridline"
              />
              <text x={38} y={line.y + 4} textAnchor="end" className="pptx-svg-axis-label">
                {line.label}
              </text>
            </g>
          ))}

        {model.variant === "bar" &&
          model.bars.map((bar) => (
            <g key={bar.id}>
              <rect
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={6}
                fill={bar.fillToken}
              />
              <text x={bar.labelX} y={bar.valueY} textAnchor="middle" className="pptx-svg-value-label">
                {bar.value}
                {model.unit}
              </text>
              <text
                x={bar.labelX}
                y={model.height - 12}
                textAnchor="middle"
                className="pptx-svg-axis-label"
              >
                {bar.label}
              </text>
            </g>
          ))}

        {model.variant === "line" && (
          <g>
            {model.areaPath ? <path d={model.areaPath} className="pptx-svg-line-area" /> : null}
            {model.linePath ? <path d={model.linePath} className="pptx-svg-line-stroke" /> : null}
            {model.linePoints.map((pt) => (
              <g key={pt.id}>
                <circle cx={pt.cx} cy={pt.cy} r={5} className="pptx-svg-line-dot" />
                <text x={pt.cx} y={Math.max(14, pt.cy - 10)} textAnchor="middle" className="pptx-svg-value-label">
                  {pt.value}
                  {model.unit}
                </text>
                <text x={pt.cx} y={model.height - 12} textAnchor="middle" className="pptx-svg-axis-label">
                  {pt.label}
                </text>
              </g>
            ))}
          </g>
        )}

        {model.variant === "donut" && (
          <g>
            {model.donutSlices.map((slice) => (
              <path key={slice.id} d={slice.path} fill={slice.fillToken} className="pptx-svg-donut-slice" />
            ))}
            <text
              x={model.width * 0.34}
              y={model.height / 2 - 4}
              textAnchor="middle"
              className="pptx-svg-donut-total"
            >
              {model.totalValue}
              {model.unit}
            </text>
            <text
              x={model.width * 0.34}
              y={model.height / 2 + 14}
              textAnchor="middle"
              className="pptx-svg-axis-label"
            >
              합계
            </text>
            {model.donutSlices.map((slice, idx) => {
              const ly = 38 + idx * 34;
              const lx = model.width * 0.64;
              return (
                <g key={`legend-${slice.id}`}>
                  <rect x={lx} y={ly - 9} width={12} height={12} rx={3} fill={slice.fillToken} />
                  <text x={lx + 18} y={ly + 1} className="pptx-svg-legend-label">
                    {slice.label} ({slice.percentage}%)
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {model.variant === "radar" && (
          <g>
            {model.radarRings.map((ring, idx) => (
              <path key={`ring-${idx}`} d={ring} className="pptx-svg-radar-ring" />
            ))}
            {model.radarVertices.map((vertex) => (
              <path key={`axis-${vertex.id}`} d={vertex.axisPath} className="pptx-svg-radar-axis" />
            ))}
            {model.radarDataPath ? <path d={model.radarDataPath} className="pptx-svg-radar-data" /> : null}
            {model.radarVertices.map((vertex) => (
              <g key={`vertex-${vertex.id}`}>
                <circle cx={vertex.x} cy={vertex.y} r={4.5} className="pptx-svg-line-dot" />
                <text x={vertex.labelX} y={vertex.labelY} textAnchor="middle" className="pptx-svg-axis-label">
                  {vertex.label}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}

function VectorShapeChip({ shape }: { readonly shape: PptxVectorShape }) {
  return (
    <div
      className={`pptx-vector-shape pptx-vector-shape--${shape.kind} pptx-vector-shape--tone-${shape.tone}`}
      style={{
        left: `${shape.xPct}%`,
        top: `${shape.yPct}%`,
        width: `${shape.wPct}%`,
        height: `${shape.hPct}%`,
      }}
    >
      <span>{shape.label}</span>
    </div>
  );
}

export function PptxSlideStage({
  slide,
  slideIndex,
  totalSlides,
  themeId,
  slideSize,
  playbackElapsedMs,
  transitionPulseKey,
}: PptxSlideStageProps) {
  const dims = PPTX_SLIDE_SIZES[slideSize] ?? PPTX_SLIDE_SIZES["16:9"];
  const frames = computeAnimationPlaybackFrame(slide.animations ?? [], playbackElapsedMs);
  const bullets = (slide.bullets ?? []).filter((item) => item.trim().length > 0);
  const hasBullets = bullets.length > 0;
  const hasVisual = Boolean(slide.smartArt || slide.chart);
  const hasTable = Boolean(slide.table);
  const transitionLabel =
    TRANSITION_OPTIONS.find((opt) => opt.id === (slide.transition ?? "none"))?.label ?? "없음";

  const motionOf = (target: BuildAnimationTarget): CSSProperties => toMotionStyle(frames[target]);
  const splitLayout = (hasBullets && (hasVisual || hasTable)) || (hasVisual && hasTable);

  return (
    <div className="pptx-stage-shell">
      <div
        key={`${slide.id}-${transitionPulseKey}`}
        className={`pptx-slide-canvas pptx-slide-transition--${slide.transition ?? "none"}`}
        data-slide-theme={themeId}
        data-testid="pptx-live-slide-stage"
        style={{ aspectRatio: dims.aspectRatio }}
      >
        <div className="pptx-slide-header" style={motionOf("title")}>
          <h4 className="pptx-slide-title">{slide.title}</h4>
          {slide.subtitle ? <p className="pptx-slide-subtitle">{slide.subtitle}</p> : null}
        </div>

        <div className={splitLayout ? "pptx-slide-body pptx-slide-body--split" : "pptx-slide-body"}>
          {hasBullets ? (
            <ul className="pptx-slide-bullets" style={motionOf("bullets")}>
              {bullets.map((bullet, idx) => (
                <li key={`${slide.id}-b-${idx}`}>{bullet}</li>
              ))}
            </ul>
          ) : null}

          {hasVisual || hasTable ? (
            <div className="pptx-slide-visual-column">
              {slide.smartArt ? (
                <div style={motionOf("visual")}>
                  <SmartArtStageSvg smartArt={slide.smartArt} />
                </div>
              ) : slide.chart ? (
                <div style={motionOf("visual")}>
                  <NativeChartStageSvg chart={slide.chart} />
                </div>
              ) : null}

              {slide.table ? (
                <div className="pptx-table-wrap" style={motionOf("table")}>
                  {slide.table.title ? <div className="pptx-visual-caption">{slide.table.title}</div> : null}
                  <table
                    className={
                      slide.table.bandedRows ? "pptx-slide-table pptx-slide-table--banded" : "pptx-slide-table"
                    }
                    data-testid="pptx-stage-table"
                  >
                    {slide.table.showHeaderRow && slide.table.headers.length > 0 ? (
                      <thead>
                        <tr>
                          {slide.table.headers.map((header, idx) => (
                            <th key={`th-${idx}`}>{header}</th>
                          ))}
                        </tr>
                      </thead>
                    ) : null}
                    <tbody>
                      {!slide.table.showHeaderRow && slide.table.headers.length > 0 ? (
                        <tr>
                          {slide.table.headers.map((header, idx) => (
                            <td key={`hd-${idx}`}>{header}</td>
                          ))}
                        </tr>
                      ) : null}
                      {slide.table.rows.map((row, rIdx) => (
                        <tr key={`tr-${rIdx}`}>
                          {row.map((cell, cIdx) => (
                            <td key={`td-${rIdx}-${cIdx}`}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {(slide.shapes ?? []).length > 0 ? (
          <div className="pptx-shapes-overlay" style={motionOf("shapes")}>
            {(slide.shapes ?? []).map((shape) => (
              <VectorShapeChip key={shape.id} shape={shape} />
            ))}
          </div>
        ) : null}

        <footer className="pptx-slide-footer">
          <span>전환: {transitionLabel}</span>
          <span>
            {slideIndex + 1} / {totalSlides}
          </span>
        </footer>
      </div>
    </div>
  );
}
