/**
 * 슬라이드 인스펙터 5탭 편집기: 텍스트·전환 / SmartArt 6종 / 네이티브 차트 4종 / 스타일 표 / 빌드 애니메이션.
 */

import { ArrowDown, ArrowUp, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useId } from "react";

import type {
  BuildAnimationKind,
  NativeChartVariant,
  PptxShapeKind,
  PptxSlideInput,
  PptxTransitionKind,
  SmartArtVariant,
} from "./ooxml-pptx-types";
import {
  BUILD_ANIMATION_OPTIONS,
  NATIVE_CHART_VARIANT_OPTIONS,
  SMARTART_VARIANT_OPTIONS,
  TRANSITION_OPTIONS,
  addTableColumn,
  addTableRow,
  createDefaultChartBlock,
  createDefaultSmartArtBlock,
  createDefaultTableModel,
  normalizeAnimationTimeline,
  removeTableColumn,
  removeTableRow,
  reorderAnimationEntry,
  toggleTableBandedRows,
  toggleTableHeaderRow,
  updateTableCell,
  updateTableHeader,
} from "./ppt-smartart-chart-table";

export type PptxInspectorTabId = "text" | "smartart" | "chart" | "table" | "animation";

const INSPECTOR_TABS: readonly { readonly id: PptxInspectorTabId; readonly label: string }[] = [
  { id: "text", label: "텍스트·전환" },
  { id: "smartart", label: "SmartArt" },
  { id: "chart", label: "차트" },
  { id: "table", label: "표" },
  { id: "animation", label: "애니메이션" },
];

const VECTOR_SHAPE_BUTTONS: readonly { readonly kind: PptxShapeKind; readonly label: string }[] = [
  { kind: "rect", label: "사각형" },
  { kind: "roundRect", label: "둥근 카드" },
  { kind: "ellipse", label: "타원" },
  { kind: "arrow", label: "화살표" },
];

export interface PptxSlideInspectorProps {
  readonly slide: PptxSlideInput;
  readonly activeTab: PptxInspectorTabId;
  readonly onTabChange: (tab: PptxInspectorTabId) => void;
  readonly onUpdateSlide: (updater: (prev: PptxSlideInput) => PptxSlideInput) => void;
  readonly onPlayAnimations: () => void;
  readonly onResetAnimations: () => void;
  readonly isPlayingAnimations: boolean;
}

export function PptxSlideInspector({
  slide,
  activeTab,
  onTabChange,
  onUpdateSlide,
  onPlayAnimations,
  onResetAnimations,
  isPlayingAnimations,
}: PptxSlideInspectorProps) {
  const uid = useId();
  const orderedAnimations = normalizeAnimationTimeline(slide.animations ?? []);

  const addVectorShape = (kind: PptxShapeKind) => {
    const labelMap: Record<PptxShapeKind, string> = {
      rect: "핵심 박스",
      roundRect: "강조 배지",
      ellipse: "포인트 원",
      arrow: "다음 단계",
    };
    onUpdateSlide((prev) => {
      const existing = prev.shapes ?? [];
      const idx = existing.length;
      return {
        ...prev,
        shapes: [
          ...existing,
          {
            id: `shape-${prev.id}-${idx + 1}`,
            kind,
            label: labelMap[kind],
            xPct: Math.min(72, 10 + idx * 14),
            yPct: 74,
            wPct: 22,
            hPct: 11,
            tone: idx % 2 === 0 ? "accent" : "highlight",
          },
        ],
      };
    });
  };

  return (
    <aside className="pptx-inspector-card" aria-label="슬라이드 요소 인스펙터">
      <div className="pptx-inspector-tabs" role="tablist" aria-label="슬라이드 편집 패널 선택">
        {INSPECTOR_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className="pptx-subtab-btn"
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "text" ? (
        <div className="pptx-inspector-body">
          <div className="pptx-field">
            <label htmlFor={`${uid}-title`} className="pptx-label">
              슬라이드 제목
            </label>
            <input
              id={`${uid}-title`}
              type="text"
              className="pptx-input"
              value={slide.title}
              onChange={(event) =>
                onUpdateSlide((prev) => ({ ...prev, title: event.target.value }))
              }
            />
          </div>

          <div className="pptx-field">
            <label htmlFor={`${uid}-subtitle`} className="pptx-label">
              부제목
            </label>
            <input
              id={`${uid}-subtitle`}
              type="text"
              className="pptx-input"
              value={slide.subtitle ?? ""}
              onChange={(event) =>
                onUpdateSlide((prev) => ({ ...prev, subtitle: event.target.value }))
              }
            />
          </div>

          <div className="pptx-field">
            <label htmlFor={`${uid}-bullets`} className="pptx-label">
              글머리 본문 (줄바꿈으로 구분)
            </label>
            <textarea
              id={`${uid}-bullets`}
              className="pptx-textarea"
              value={(slide.bullets ?? []).join("\n")}
              onChange={(event) =>
                onUpdateSlide((prev) => ({
                  ...prev,
                  bullets: event.target.value.split("\n"),
                }))
              }
            />
          </div>

          <div className="pptx-field">
            <label htmlFor={`${uid}-transition`} className="pptx-label">
              슬라이드 전환 효과 (OOXML &lt;p:transition&gt;)
            </label>
            <select
              id={`${uid}-transition`}
              className="pptx-select"
              value={slide.transition ?? "none"}
              onChange={(event) =>
                onUpdateSlide((prev) => ({
                  ...prev,
                  transition: event.target.value as PptxTransitionKind,
                }))
              }
            >
              {TRANSITION_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="pptx-field">
            <span className="pptx-label">벡터 도형 추가</span>
            <div className="pptx-btn-row">
              {VECTOR_SHAPE_BUTTONS.map((btn) => (
                <button
                  key={btn.kind}
                  type="button"
                  className="pptx-btn"
                  onClick={() => addVectorShape(btn.kind)}
                >
                  <Plus size={14} aria-hidden="true" />
                  <span>{btn.label}</span>
                </button>
              ))}
              {(slide.shapes ?? []).length > 0 ? (
                <button
                  type="button"
                  className="pptx-btn"
                  onClick={() => onUpdateSlide((prev) => ({ ...prev, shapes: [] }))}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  <span>도형 비우기</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "smartart" ? (
        <div className="pptx-inspector-body">
          <div className="pptx-btn-row">
            <button
              type="button"
              className={slide.smartArt ? "pptx-btn pptx-btn--active" : "pptx-btn"}
              onClick={() =>
                onUpdateSlide((prev) => ({
                  ...prev,
                  smartArt: prev.smartArt ? null : createDefaultSmartArtBlock("process-chevron"),
                  chart: prev.smartArt ? prev.chart : null,
                }))
              }
            >
              {slide.smartArt ? "SmartArt 제거" : "SmartArt 삽입"}
            </button>
          </div>

          {slide.smartArt ? (
            <>
              <div className="pptx-field">
                <label htmlFor={`${uid}-sa-variant`} className="pptx-label">
                  SmartArt 레이아웃 (6종)
                </label>
                <select
                  id={`${uid}-sa-variant`}
                  className="pptx-select"
                  value={slide.smartArt.variant}
                  onChange={(event) => {
                    const nextVariant = event.target.value as SmartArtVariant;
                    onUpdateSlide((prev) => ({
                      ...prev,
                      smartArt: createDefaultSmartArtBlock(nextVariant),
                    }));
                  }}
                >
                  {SMARTART_VARIANT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pptx-item-list">
                {slide.smartArt.items.map((item, idx) => (
                  <div key={item.id} className="pptx-inline-row">
                    <input
                      type="text"
                      aria-label={`SmartArt 항목 ${idx + 1} 제목`}
                      className="pptx-input"
                      value={item.label}
                      onChange={(event) =>
                        onUpdateSlide((prev) =>
                          prev.smartArt
                            ? {
                                ...prev,
                                smartArt: {
                                  ...prev.smartArt,
                                  items: prev.smartArt.items.map((entry, i) =>
                                    i === idx ? { ...entry, label: event.target.value } : entry,
                                  ),
                                },
                              }
                            : prev,
                        )
                      }
                    />
                    <input
                      type="text"
                      aria-label={`SmartArt 항목 ${idx + 1} 설명`}
                      className="pptx-input"
                      value={item.detail ?? ""}
                      onChange={(event) =>
                        onUpdateSlide((prev) =>
                          prev.smartArt
                            ? {
                                ...prev,
                                smartArt: {
                                  ...prev.smartArt,
                                  items: prev.smartArt.items.map((entry, i) =>
                                    i === idx ? { ...entry, detail: event.target.value } : entry,
                                  ),
                                },
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="pptx-helper-text">
              프로세스·타임라인·피라미드·조직도·SWOT·순환 6종 SmartArt를 삽입해 슬라이드에 바로 렌더링하고 .pptx 도형으로 내보냅니다.
            </p>
          )}
        </div>
      ) : null}

      {activeTab === "chart" ? (
        <div className="pptx-inspector-body">
          <div className="pptx-btn-row">
            <button
              type="button"
              className={slide.chart ? "pptx-btn pptx-btn--active" : "pptx-btn"}
              onClick={() =>
                onUpdateSlide((prev) => ({
                  ...prev,
                  chart: prev.chart ? null : createDefaultChartBlock("bar"),
                  smartArt: prev.chart ? prev.smartArt : null,
                }))
              }
            >
              {slide.chart ? "차트 제거" : "네이티브 차트 삽입"}
            </button>
          </div>

          {slide.chart ? (
            <>
              <div className="pptx-field">
                <label htmlFor={`${uid}-chart-variant`} className="pptx-label">
                  차트 유형 (4종)
                </label>
                <select
                  id={`${uid}-chart-variant`}
                  className="pptx-select"
                  value={slide.chart.variant}
                  onChange={(event) => {
                    const nextVariant = event.target.value as NativeChartVariant;
                    onUpdateSlide((prev) => ({
                      ...prev,
                      chart: prev.chart
                        ? { ...prev.chart, variant: nextVariant }
                        : createDefaultChartBlock(nextVariant),
                    }));
                  }}
                >
                  {NATIVE_CHART_VARIANT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pptx-item-list">
                {slide.chart.points.map((pt, idx) => (
                  <div key={pt.id} className="pptx-inline-row">
                    <input
                      type="text"
                      aria-label={`차트 항목 ${idx + 1} 이름`}
                      className="pptx-input"
                      value={pt.label}
                      onChange={(event) =>
                        onUpdateSlide((prev) =>
                          prev.chart
                            ? {
                                ...prev,
                                chart: {
                                  ...prev.chart,
                                  points: prev.chart.points.map((item, i) =>
                                    i === idx ? { ...item, label: event.target.value } : item,
                                  ),
                                },
                              }
                            : prev,
                        )
                      }
                    />
                    <input
                      type="number"
                      aria-label={`차트 항목 ${idx + 1} 값`}
                      className="pptx-input pptx-input--num"
                      value={pt.value}
                      min={0}
                      onChange={(event) => {
                        const nextVal = Number(event.target.value);
                        onUpdateSlide((prev) =>
                          prev.chart
                            ? {
                                ...prev,
                                chart: {
                                  ...prev.chart,
                                  points: prev.chart.points.map((item, i) =>
                                    i === idx
                                      ? { ...item, value: Number.isFinite(nextVal) ? nextVal : 0 }
                                      : item,
                                  ),
                                },
                              }
                            : prev,
                        );
                      }}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="pptx-helper-text">
              막대·꺾은선·도넛·레이더 4종 차트를 삽입하고 수치를 즉시 수정할 수 있습니다.
            </p>
          )}
        </div>
      ) : null}

      {activeTab === "table" ? (
        <div className="pptx-inspector-body">
          <div className="pptx-btn-row">
            <button
              type="button"
              className={slide.table ? "pptx-btn pptx-btn--active" : "pptx-btn"}
              onClick={() =>
                onUpdateSlide((prev) => ({
                  ...prev,
                  table: prev.table ? null : createDefaultTableModel(),
                }))
              }
            >
              {slide.table ? "표 제거" : "스타일 표 삽입"}
            </button>
            {slide.table ? (
              <>
                <button
                  type="button"
                  className="pptx-btn"
                  onClick={() =>
                    onUpdateSlide((prev) =>
                      prev.table ? { ...prev, table: addTableRow(prev.table) } : prev,
                    )
                  }
                >
                  <Plus size={14} aria-hidden="true" />
                  <span>행 추가</span>
                </button>
                <button
                  type="button"
                  className="pptx-btn"
                  onClick={() =>
                    onUpdateSlide((prev) =>
                      prev.table ? { ...prev, table: addTableColumn(prev.table) } : prev,
                    )
                  }
                >
                  <Plus size={14} aria-hidden="true" />
                  <span>열 추가</span>
                </button>
                <button
                  type="button"
                  className="pptx-btn"
                  disabled={slide.table.rows.length <= 1}
                  onClick={() =>
                    onUpdateSlide((prev) =>
                      prev.table
                        ? { ...prev, table: removeTableRow(prev.table, prev.table.rows.length - 1) }
                        : prev,
                    )
                  }
                >
                  <span>마지막 행 삭제</span>
                </button>
                <button
                  type="button"
                  className="pptx-btn"
                  disabled={slide.table.headers.length <= 1}
                  onClick={() =>
                    onUpdateSlide((prev) =>
                      prev.table
                        ? {
                            ...prev,
                            table: removeTableColumn(prev.table, prev.table.headers.length - 1),
                          }
                        : prev,
                    )
                  }
                >
                  <span>마지막 열 삭제</span>
                </button>
                <button
                  type="button"
                  className="pptx-btn"
                  aria-pressed={slide.table.showHeaderRow}
                  onClick={() =>
                    onUpdateSlide((prev) =>
                      prev.table ? { ...prev, table: toggleTableHeaderRow(prev.table) } : prev,
                    )
                  }
                >
                  헤더 행
                </button>
                <button
                  type="button"
                  className="pptx-btn"
                  aria-pressed={slide.table.bandedRows}
                  onClick={() =>
                    onUpdateSlide((prev) =>
                      prev.table ? { ...prev, table: toggleTableBandedRows(prev.table) } : prev,
                    )
                  }
                >
                  줄무늬 행
                </button>
              </>
            ) : null}
          </div>

          {slide.table ? (
            <div className="pptx-table-editor">
              <div className="pptx-table-editor-row">
                {slide.table.headers.map((header, cIdx) => (
                  <input
                    key={`hdr-${cIdx}`}
                    type="text"
                    aria-label={`표 헤더 ${cIdx + 1}`}
                    className="pptx-input pptx-input--header"
                    value={header}
                    onChange={(event) =>
                      onUpdateSlide((prev) =>
                        prev.table
                          ? { ...prev, table: updateTableHeader(prev.table, cIdx, event.target.value) }
                          : prev,
                      )
                    }
                  />
                ))}
              </div>
              {slide.table.rows.map((row, rIdx) => (
                <div key={`row-${rIdx}`} className="pptx-table-editor-row">
                  {row.map((cell, cIdx) => (
                    <input
                      key={`cell-${rIdx}-${cIdx}`}
                      type="text"
                      aria-label={`표 ${rIdx + 1}행 ${cIdx + 1}열`}
                      className="pptx-input"
                      value={cell}
                      onChange={(event) =>
                        onUpdateSlide((prev) =>
                          prev.table
                            ? {
                                ...prev,
                                table: updateTableCell(prev.table, rIdx, cIdx, event.target.value),
                              }
                            : prev,
                        )
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="pptx-helper-text">
              편집 가능한 표는 PowerPoint 네이티브 &lt;a:tbl&gt; 요소로 직접 변환됩니다.
            </p>
          )}
        </div>
      ) : null}

      {activeTab === "animation" ? (
        <div className="pptx-inspector-body">
          <div className="pptx-btn-row">
            <button type="button" className="pptx-btn pptx-btn--primary" onClick={onPlayAnimations}>
              <Play size={14} aria-hidden="true" />
              <span>{isPlayingAnimations ? "재생 중…" : "빌드 애니메이션 재생"}</span>
            </button>
            <button type="button" className="pptx-btn" onClick={onResetAnimations}>
              <RotateCcw size={14} aria-hidden="true" />
              <span>정지·원복</span>
            </button>
          </div>

          <div className="pptx-item-list">
            {orderedAnimations.map((entry, idx) => (
              <div key={entry.id} className="pptx-anim-row">
                <span className="pptx-anim-order">#{entry.order}</span>
                <span className="pptx-anim-target">{entry.label}</span>
                <select
                  aria-label={`${entry.label} 애니메이션 종류`}
                  className="pptx-select pptx-select--compact"
                  value={entry.kind}
                  onChange={(event) => {
                    const nextKind = event.target.value as BuildAnimationKind;
                    onUpdateSlide((prev) => ({
                      ...prev,
                      animations: normalizeAnimationTimeline(prev.animations ?? []).map((item) =>
                        item.id === entry.id ? { ...item, kind: nextKind } : item,
                      ),
                    }));
                  }}
                >
                  {BUILD_ANIMATION_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="pptx-anim-actions">
                  <button
                    type="button"
                    className="pptx-icon-btn"
                    aria-label={`${entry.label} 순서 위로`}
                    disabled={idx === 0}
                    onClick={() =>
                      onUpdateSlide((prev) => ({
                        ...prev,
                        animations: reorderAnimationEntry(prev.animations ?? [], entry.id, "up"),
                      }))
                    }
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="pptx-icon-btn"
                    aria-label={`${entry.label} 순서 아래로`}
                    disabled={idx === orderedAnimations.length - 1}
                    onClick={() =>
                      onUpdateSlide((prev) => ({
                        ...prev,
                        animations: reorderAnimationEntry(prev.animations ?? [], entry.id, "down"),
                      }))
                    }
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
