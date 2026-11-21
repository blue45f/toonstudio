import {
  Compass,
  Eraser,
  Grid2x2,
  PaintBucket,
  Repeat2,
  RotateCcw,
  Shapes,
} from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  createLineArtTestGrid,
  eraseVectorUpToIntersection,
  generateRadialSpeedlines,
  generateRepeatGrid,
  generateSymmetryStrokes,
  pointsToSvgPath,
  recognizeQuickShape,
  simulateColorDropFill,
  snapStrokeToPerspectiveRuler,
  wrapStrokeAcrossTorus,
  type PerspectiveMode,
  type QuickShapeKind,
  type SymmetryAxisCount,
  type SymmetryMode,
  type VectorStroke,
} from "./competitor-special-drawing-engine";
import type { Point2D } from "./ppt-precision-layout-engine";

type QuickShapePresetId = "circle" | "line" | "rectangle" | "triangle" | "arc" | "hexagon";

const QUICKSHAPE_KIND_KO: Record<QuickShapeKind, string> = {
  line: "직선",
  arc: "호 (Arc)",
  circle: "정원",
  ellipse: "타원",
  triangle: "삼각형",
  rectangle: "사각형",
  polygon: "다각형",
  freehand: "자유 곡선",
};

function buildQuickShapeSample(preset: QuickShapePresetId): readonly Point2D[] {
  if (preset === "line") {
    return Array.from({ length: 14 }, (_, i) => ({
      x: 42 + i * 16,
      y: 96 + Math.sin(i * 1.4) * 2.2 + i * 0.4,
    }));
  }
  if (preset === "circle") {
    return Array.from({ length: 36 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 35;
      const r = 56 + Math.sin(i * 3) * 2.1;
      return { x: 140 + Math.cos(a) * r, y: 100 + Math.sin(a) * r };
    });
  }
  if (preset === "arc") {
    return Array.from({ length: 24 }, (_, i) => {
      const a = -Math.PI * 0.85 + (Math.PI * 0.9 * i) / 23;
      const r = 64 + Math.cos(i * 2) * 1.6;
      return { x: 140 + Math.cos(a) * r, y: 122 + Math.sin(a) * r };
    });
  }
  if (preset === "triangle") {
    const verts: readonly Point2D[] = [
      { x: 140, y: 34 },
      { x: 212, y: 158 },
      { x: 68, y: 156 },
      { x: 140, y: 34 },
    ];
    const pts: Point2D[] = [];
    for (let s = 0; s < 3; s += 1) {
      for (let k = 0; k < 8; k += 1) {
        const t = k / 8;
        pts.push({
          x: verts[s].x + (verts[s + 1].x - verts[s].x) * t + Math.sin(k * 2) * 1.4,
          y: verts[s].y + (verts[s + 1].y - verts[s].y) * t + Math.cos(k * 2) * 1.4,
        });
      }
    }
    return pts;
  }
  if (preset === "hexagon") {
    const pts: Point2D[] = [];
    for (let s = 0; s < 6; s += 1) {
      const a1 = (Math.PI * 2 * s) / 6;
      const a2 = (Math.PI * 2 * ((s + 1) % 6)) / 6;
      const p1 = { x: 140 + Math.cos(a1) * 60, y: 100 + Math.sin(a1) * 60 };
      const p2 = { x: 140 + Math.cos(a2) * 60, y: 100 + Math.sin(a2) * 60 };
      for (let k = 0; k < 6; k += 1) {
        const t = k / 6;
        pts.push({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t });
      }
    }
    pts.push(pts[0]);
    return pts;
  }
  const rectVerts: readonly Point2D[] = [
    { x: 66, y: 46 },
    { x: 214, y: 48 },
    { x: 212, y: 154 },
    { x: 68, y: 152 },
    { x: 66, y: 46 },
  ];
  const pts: Point2D[] = [];
  for (let s = 0; s < 4; s += 1) {
    for (let k = 0; k < 8; k += 1) {
      const t = k / 8;
      pts.push({
        x: rectVerts[s].x + (rectVerts[s + 1].x - rectVerts[s].x) * t + Math.sin(k) * 1.1,
        y: rectVerts[s].y + (rectVerts[s + 1].y - rectVerts[s].y) * t + Math.cos(k) * 1.1,
      });
    }
  }
  return pts;
}

const INITIAL_VECTOR_STROKES: readonly VectorStroke[] = [
  { id: "stroke-h", points: [{ x: 30, y: 95 }, { x: 245, y: 95 }], widthPx: 3 },
  { id: "stroke-v1", points: [{ x: 96, y: 30 }, { x: 96, y: 170 }], widthPx: 3 },
  { id: "stroke-v2", points: [{ x: 184, y: 30 }, { x: 184, y: 170 }], widthPx: 3 },
];

export function CompetitorShapeFillEraserTab() {
  const gapInputId = useId();
  const thresholdInputId = useId();
  const [quickPreset, setQuickPreset] = useState<QuickShapePresetId>("circle");
  const [gapClosePx, setGapClosePx] = useState(6);
  const [thresholdPercent, setThresholdPercent] = useState(42);
  const [vectorStrokes, setVectorStrokes] = useState<readonly VectorStroke[]>(INITIAL_VECTOR_STROKES);
  const [lastCutInfo, setLastCutInfo] = useState("교차선 끝단 지우기 대기 중");

  const rawQuickStroke = useMemo(() => buildQuickShapeSample(quickPreset), [quickPreset]);
  const quickResult = useMemo(() => recognizeQuickShape(rawQuickStroke), [rawQuickStroke]);

  const colorDropGrid = useMemo(() => createLineArtTestGrid(32, 32, 4), []);
  const colorDropResult = useMemo(
    () =>
      simulateColorDropFill(colorDropGrid, {
        seedX: 16,
        seedY: 16,
        fillColor: { r: 72, g: 168, b: 142, a: 255 },
        thresholdPercent,
        gapClosePx,
      }),
    [colorDropGrid, thresholdPercent, gapClosePx],
  );

  const handleTrimOverhang = (targetPoint: Point2D, label: string) => {
    const res = eraseVectorUpToIntersection(vectorStrokes, targetPoint, 14);
    setVectorStrokes(res.strokes);
    setLastCutInfo(
      res.erasedStrokeId
        ? `${label} 절단 완료 — 제거 길이 ${res.removedLengthPx}px · 교점 ${res.cutPoints.length}곳`
        : "해당 위치에 닿은 벡터 선분이 없습니다.",
    );
  };

  return (
    <div className="ppt-pro-grid" data-testid="competitor-shape-fill-eraser-tab">
      <div className="ppt-pro-card">
        <h4 className="ppt-pro-card-title">
          <Shapes size={16} aria-hidden="true" /> QuickShape 기하 자동 보정 (Procreate 클린룸)
        </h4>
        <p className="ppt-pro-card-desc">
          손떨림이 섞인 점열 스트로크를 직선·호·정원·타원·삼각형·사각형·다각형으로 자동 보정합니다.
        </p>

        <div className="ppt-pro-btn-row">
          {(
            [
              ["circle", "손그림 원"],
              ["line", "손그림 직선"],
              ["rectangle", "손그림 사각형"],
              ["triangle", "손그림 삼각형"],
              ["arc", "손그림 호"],
              ["hexagon", "손그림 육각형"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="ppt-pro-btn"
              aria-pressed={quickPreset === id}
              onClick={() => setQuickPreset(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ppt-pro-stage">
          <svg viewBox="0 0 280 200" className="ppt-pro-svg" role="img" aria-label="QuickShape 보정 비교">
            <path
              d={pointsToSvgPath(rawQuickStroke, false)}
              fill="none"
              stroke="var(--ppt-fg-2)"
              strokeWidth={2}
              strokeDasharray="4 3"
              opacity={0.7}
            />
            <path
              d={quickResult.svgPath}
              fill="none"
              stroke="var(--ppt-accent-shape)"
              strokeWidth={3}
              data-testid="quickshape-corrected-path"
            />
          </svg>
        </div>

        <div className="ppt-pro-metrics">
          <div className="ppt-pro-metric">
            <span className="ppt-pro-metric-label">인식 도형</span>
            <span className="ppt-pro-metric-value" data-testid="quickshape-kind">
              {QUICKSHAPE_KIND_KO[quickResult.kind]}
            </span>
          </div>
          <div className="ppt-pro-metric">
            <span className="ppt-pro-metric-label">신뢰도</span>
            <span className="ppt-pro-metric-value">{Math.round(quickResult.confidence * 100)}%</span>
          </div>
          <div className="ppt-pro-metric">
            <span className="ppt-pro-metric-label">보정 정점</span>
            <span className="ppt-pro-metric-value">{quickResult.metrics.vertexCount}개</span>
          </div>
        </div>
      </div>

      <div className="ppt-pro-card">
        <h4 className="ppt-pro-card-title">
          <PaintBucket size={16} aria-hidden="true" /> ColorDrop 틈새 닫기 &amp; Vector Eraser 교차 절단
        </h4>

        <div className="ppt-pro-field">
          <label htmlFor={gapInputId} className="ppt-pro-field-label">
            <span>선화 틈새 닫기 (Gap Close)</span>
            <strong data-testid="colordrop-gap-value">{gapClosePx}px</strong>
          </label>
          <input
            id={gapInputId}
            type="range"
            min={0}
            max={16}
            step={1}
            value={gapClosePx}
            onChange={(event) => setGapClosePx(Number(event.target.value))}
            className="ppt-pro-range"
            data-testid="colordrop-gap-slider"
          />
        </div>

        <div className="ppt-pro-field">
          <label htmlFor={thresholdInputId} className="ppt-pro-field-label">
            <span>색 허용 임계치 (Threshold)</span>
            <strong>{thresholdPercent}%</strong>
          </label>
          <input
            id={thresholdInputId}
            type="range"
            min={5}
            max={95}
            step={1}
            value={thresholdPercent}
            onChange={(event) => setThresholdPercent(Number(event.target.value))}
            className="ppt-pro-range"
            data-testid="colordrop-threshold-slider"
          />
        </div>

        <p
          className={`ppt-pro-status ${colorDropResult.leakedToBorder ? "ppt-pro-status--warn" : "ppt-pro-status--good"}`}
          role="status"
          data-testid="colordrop-status"
        >
          {colorDropResult.leakedToBorder
            ? `틈새 누수 감지 (채움 ${colorDropResult.filledPixelCount}px) — 틈새 닫기 값을 4px 이상 올리면 누수가 차단됩니다.`
            : `틈새 봉합 성공 (봉합 ${colorDropResult.sealedGapPixels}px · 채움 ${colorDropResult.filledPixelCount}px · 점유율 ${Math.round(colorDropResult.fillCoverageRatio * 100)}%)`}
        </p>

        <div className="ppt-pro-stage">
          <svg viewBox="0 0 280 190" className="ppt-pro-svg" role="img" aria-label="Vector Eraser 교차점 절단 캔버스">
            {vectorStrokes.map((stroke) => (
              <path
                key={stroke.id}
                d={pointsToSvgPath(stroke.points, false)}
                fill="none"
                stroke="var(--ppt-fg)"
                strokeWidth={stroke.widthPx}
                strokeLinecap="round"
                data-testid={`vector-stroke-${stroke.id}`}
              />
            ))}
          </svg>
        </div>

        <div className="ppt-pro-btn-row">
          <button
            type="button"
            className="ppt-pro-btn"
            onClick={() => handleTrimOverhang({ x: 52, y: 95 }, "좌측 튀어나온 선")}
          >
            <Eraser size={15} aria-hidden="true" /> 좌측 끝단 교차 절단
          </button>
          <button
            type="button"
            className="ppt-pro-btn"
            onClick={() => handleTrimOverhang({ x: 140, y: 95 }, "중앙 교차 구간")}
          >
            <Eraser size={15} aria-hidden="true" /> 중앙 교차 구간 제거
          </button>
          <button
            type="button"
            className="ppt-pro-btn"
            onClick={() => {
              setVectorStrokes(INITIAL_VECTOR_STROKES);
              setLastCutInfo("벡터 선화를 초기 상태로 복원했습니다.");
            }}
          >
            <RotateCcw size={15} aria-hidden="true" /> 선화 복원
          </button>
        </div>

        <p className="ppt-pro-status" role="status" data-testid="vector-eraser-status">
          {lastCutInfo}
        </p>
      </div>
    </div>
  );
}

export function CompetitorTileSymmetryRulerTab() {
  const colsInputId = useId();
  const [gridRows, setGridRows] = useState(3);
  const [gridCols, setGridCols] = useState(4);
  const [gridGap, setGridGap] = useState(12);
  const [symmetryAxes, setSymmetryAxes] = useState<SymmetryAxisCount>(8);
  const [symmetryMode, setSymmetryMode] = useState<SymmetryMode>("kaleidoscope");
  const [perspectiveMode, setPerspectiveMode] = useState<PerspectiveMode>("3-point");
  const [dragTarget, setDragTarget] = useState<Point2D>({ x: 256, y: 118 });

  const torusWrap = useMemo(
    () =>
      wrapStrokeAcrossTorus(
        [
          { x: 64, y: 24 },
          { x: 96, y: 52 },
          { x: 118, y: 88 },
          { x: 88, y: 112 },
        ],
        96,
        96,
      ),
    [],
  );

  const repeatGrid = useMemo(
    () =>
      generateRepeatGrid({
        baseId: "pattern-cut",
        baseLabel: "로판 문양 타일",
        originX: 16,
        originY: 16,
        itemWidth: 42,
        itemHeight: 28,
        rows: gridRows,
        cols: gridCols,
        gapX: gridGap,
        gapY: gridGap,
        staggerOffsetX: 10,
      }),
    [gridRows, gridCols, gridGap],
  );

  const symmetryBranches = useMemo(
    () =>
      generateSymmetryStrokes(
        [
          { x: 154, y: 74 },
          { x: 184, y: 52 },
          { x: 204, y: 84 },
        ],
        { center: { x: 140, y: 100 }, axes: symmetryAxes, mode: symmetryMode },
      ),
    [symmetryAxes, symmetryMode],
  );

  const speedlines = useMemo(
    () =>
      generateRadialSpeedlines({
        center: { x: 140, y: 100 },
        innerRadius: 48,
        outerRadius: 96,
        lineCount: 24,
        seed: 7,
      }),
    [],
  );

  const perspectiveSnap = useMemo(
    () =>
      snapStrokeToPerspectiveRuler(
        { x: 140, y: 138 },
        dragTarget,
        {
          mode: perspectiveMode,
          horizonY: 72,
          vanishingPoints: [
            { x: 24, y: 72 },
            { x: 256, y: 72 },
            { x: 140, y: 8 },
          ],
        },
      ),
    [dragTarget, perspectiveMode],
  );

  return (
    <div className="ppt-pro-grid" data-testid="competitor-tile-symmetry-ruler-tab">
      <div className="ppt-pro-card">
        <h4 className="ppt-pro-card-title">
          <Repeat2 size={16} aria-hidden="true" /> Wrap-Around 9-타일 토러스 &amp; Repeat Grid
        </h4>
        <p className="ppt-pro-card-desc">
          경계를 넘는 붓질을 3×3 토러스 타일로 무봉합 연결하고, 반복 그리드로 패턴·컷을 1클릭 배치합니다.
        </p>

        <div className="ppt-pro-stage">
          <svg viewBox="-96 -96 288 288" className="ppt-pro-svg" role="img" aria-label="Wrap-Around 9-타일 토러스 패턴">
            {torusWrap.tiles.map((tile) => (
              <g key={`tile-${tile.offsetX}-${tile.offsetY}`}>
                <rect
                  x={tile.offsetX * torusWrap.tileWidth}
                  y={tile.offsetY * torusWrap.tileHeight}
                  width={torusWrap.tileWidth}
                  height={torusWrap.tileHeight}
                  fill={tile.offsetX === 0 && tile.offsetY === 0 ? "var(--ppt-card)" : "var(--ppt-surface)"}
                  stroke="var(--ppt-line)"
                  strokeWidth={1}
                />
                <path
                  d={tile.svgPath}
                  fill="none"
                  stroke={tile.offsetX === 0 && tile.offsetY === 0 ? "var(--ppt-accent-shape)" : "var(--ppt-fg-2)"}
                  strokeWidth={2.4}
                />
              </g>
            ))}
          </svg>
        </div>

        <div className="ppt-pro-metrics">
          <div className="ppt-pro-metric">
            <span className="ppt-pro-metric-label">토러스 타일 수</span>
            <span className="ppt-pro-metric-value" data-testid="torus-tile-count">
              {torusWrap.tiles.length}타일
            </span>
          </div>
          <div className="ppt-pro-metric">
            <span className="ppt-pro-metric-label">경계 래핑 교차</span>
            <span className="ppt-pro-metric-value">{torusWrap.wrappedCrossingCount}회</span>
          </div>
          <div className="ppt-pro-metric">
            <span className="ppt-pro-metric-label">Repeat Grid 셀</span>
            <span className="ppt-pro-metric-value" data-testid="repeat-grid-count">
              {repeatGrid.totalCount}개
            </span>
          </div>
        </div>

        <div className="ppt-pro-field">
          <label htmlFor={colsInputId} className="ppt-pro-field-label">
            <span><Grid2x2 size={14} aria-hidden="true" /> 반복 그리드 행 × 열 ({gridRows} × {gridCols})</span>
            <strong>간격 {gridGap}px</strong>
          </label>
          <input
            id={colsInputId}
            type="range"
            min={2}
            max={6}
            step={1}
            value={gridCols}
            onChange={(event) => setGridCols(Number(event.target.value))}
            className="ppt-pro-range"
            data-testid="repeat-grid-cols-slider"
          />
        </div>

        <div className="ppt-pro-btn-row">
          <button type="button" className="ppt-pro-btn" onClick={() => setGridRows((r) => (r >= 5 ? 2 : r + 1))}>
            행 수 변경 ({gridRows}행)
          </button>
          <button type="button" className="ppt-pro-btn" onClick={() => setGridGap((g) => (g >= 24 ? 8 : g + 4))}>
            간격 순환 ({gridGap}px)
          </button>
        </div>
      </div>

      <div className="ppt-pro-card">
        <h4 className="ppt-pro-card-title">
          <Compass size={16} aria-hidden="true" /> 만화경 다축 대칭 · 집중선 · 3점 투시 자석 자
        </h4>

        <div className="ppt-pro-btn-row">
          {([2, 4, 6, 8, 12] as const).map((axes) => (
            <button
              key={axes}
              type="button"
              className="ppt-pro-btn"
              aria-pressed={symmetryAxes === axes}
              onClick={() => setSymmetryAxes(axes)}
            >
              {axes}축
            </button>
          ))}
          <button
            type="button"
            className="ppt-pro-btn"
            onClick={() =>
              setSymmetryMode((prev) =>
                prev === "kaleidoscope" ? "rotational" : prev === "rotational" ? "mirror" : "kaleidoscope",
              )
            }
          >
            모드: {symmetryMode === "kaleidoscope" ? "만화경" : symmetryMode === "rotational" ? "회전" : "좌우 대칭"}
          </button>
        </div>

        <div className="ppt-pro-btn-row">
          {(["1-point", "2-point", "3-point"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className="ppt-pro-btn"
              aria-pressed={perspectiveMode === mode}
              onClick={() => setPerspectiveMode(mode)}
            >
              {mode === "1-point" ? "1점 투시" : mode === "2-point" ? "2점 투시" : "3점 투시"}
            </button>
          ))}
          <button
            type="button"
            className="ppt-pro-btn"
            onClick={() => setDragTarget((prev) => (prev.y < 60 ? { x: 256, y: 118 } : { x: 146, y: 42 }))}
          >
            투시 드래그 방향 전환
          </button>
        </div>

        <div className="ppt-pro-stage">
          <svg viewBox="0 0 280 200" className="ppt-pro-svg" role="img" aria-label="만화경 및 투시 자석 자 미리보기">
            {speedlines.map((line) => (
              <line
                key={line.id}
                x1={line.innerPoint.x}
                y1={line.innerPoint.y}
                x2={line.outerPoint.x}
                y2={line.outerPoint.y}
                stroke="var(--ppt-line)"
                strokeWidth={line.strokeWidthPx}
                opacity={0.45}
              />
            ))}
            {symmetryBranches.map((branch) => (
              <path
                key={branch.index}
                d={branch.svgPath}
                fill="none"
                stroke="var(--ppt-accent-ruler)"
                strokeWidth={2}
              />
            ))}
            <line
              x1={perspectiveSnap.guideRayStart.x}
              y1={perspectiveSnap.guideRayStart.y}
              x2={perspectiveSnap.guideRayEnd.x}
              y2={perspectiveSnap.guideRayEnd.y}
              stroke="var(--ppt-guide-snap)"
              strokeWidth={1.2}
              strokeDasharray="4 3"
            />
            <line
              x1={perspectiveSnap.start.x}
              y1={perspectiveSnap.start.y}
              x2={perspectiveSnap.snappedEnd.x}
              y2={perspectiveSnap.snappedEnd.y}
              stroke="var(--ppt-accent-present)"
              strokeWidth={3}
            />
          </svg>
        </div>

        <div className="ppt-pro-metrics">
          <div className="ppt-pro-metric">
            <span className="ppt-pro-metric-label">대칭 분기</span>
            <span className="ppt-pro-metric-value" data-testid="symmetry-branch-count">
              {symmetryBranches.length}축
            </span>
          </div>
          <div className="ppt-pro-metric">
            <span className="ppt-pro-metric-label">투시 잠금 축</span>
            <span className="ppt-pro-metric-value" data-testid="perspective-active-axis">
              {perspectiveSnap.activeAxisLabel}
            </span>
          </div>
          <div className="ppt-pro-metric">
            <span className="ppt-pro-metric-label">각도 보정</span>
            <span className="ppt-pro-metric-value">{perspectiveSnap.angularErrorDeg}°</span>
          </div>
        </div>
      </div>
    </div>
  );
}
