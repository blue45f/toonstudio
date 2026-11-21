import {
  Compass,
  FlipHorizontal2,
  Grid2x2,
  Palette,
  PaintBucket,
  PenTool,
  Scissors,
  Share2,
} from "lucide-react";
import { useId, useMemo, useState } from "react";

import { ProAtelierDrawing8Preview } from "./ProAtelierDrawing8Preview";
import {
  DEFAULT_MASTER_CUT_DNA,
  computeOklchDeltaE,
} from "./cross-cut-style-harmonizer-engine";
import {
  PRO_DRAWING_8_TOOLS_META,
  computeValueFlipSubView,
  decodeTeamBrushShareCode,
  encodeTeamBrushShareCode,
  evaluatePuppetAndMeshWarp,
  fillFromReferenceLayerWithExpand,
  mixPigmentsAndAdjustTone,
  sculptVectorStrokeWidth,
  sliceFrameAndTrackSpeechTail,
  snapPointToSpecialtyRuler,
  type PaperGrainPattern,
  type Point2D,
  type ProDrawingToolId,
  type RgbColor,
  type SpecialtyRulerMode,
  type TeamBrushSharePreset,
  type VectorStrokePoint,
  type VectorStrokeSculptMode,
} from "./pro-drawing-8-tools-engine";

function createDemoReferenceMask(): Uint8Array {
  const size = 12;
  const alpha = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const onOuterInk =
        ((x === 2 || x === 9) && y >= 2 && y <= 9) ||
        ((y === 2 || y === 9) && x >= 2 && x <= 9);
      const onInnerFringe =
        !onOuterInk &&
        x >= 3 &&
        x <= 8 &&
        y >= 3 &&
        y <= 8 &&
        (x === 3 || x === 8 || y === 3 || y === 8);
      if (onOuterInk) alpha[idx] = 240;
      else if (onInnerFringe) alpha[idx] = 72;
      else alpha[idx] = 0;
    }
  }
  return alpha;
}

const DEMO_REFERENCE_MASK = createDemoReferenceMask();

const DEMO_VECTOR_STROKE: readonly VectorStrokePoint[] = [
  { x: 18, y: 88, width: 2.0 },
  { x: 42, y: 74, width: 2.2 },
  { x: 68, y: 63, width: 2.4 },
  { x: 96, y: 55, width: 2.6 },
  { x: 124, y: 52, width: 2.7 },
  { x: 152, y: 54, width: 2.6 },
  { x: 180, y: 62, width: 2.4 },
  { x: 208, y: 72, width: 2.2 },
  { x: 236, y: 84, width: 2.0 },
];

const DEMO_PIGMENT_PAIRS: readonly {
  readonly id: string;
  readonly labelKo: string;
  readonly primary: RgbColor;
  readonly secondary: RgbColor;
}[] = [
  {
    id: "yellow-blue",
    labelKo: "카드뮴 옐로 + 울트라마린 블루",
    primary: { r: 245, g: 215, b: 30 },
    secondary: { r: 25, g: 95, b: 225 },
  },
  {
    id: "crimson-yellow",
    labelKo: "크림슨 레드 + 레몬 옐로",
    primary: { r: 218, g: 38, b: 64 },
    secondary: { r: 248, g: 225, b: 42 },
  },
  {
    id: "magenta-cyan",
    labelKo: "마젠타 + 프탈로 시안",
    primary: { r: 205, g: 45, b: 145 },
    secondary: { r: 18, g: 158, b: 210 },
  },
];

const DEMO_SUBVIEW_PIXELS: readonly RgbColor[] = [
  { r: 24, g: 28, b: 42 },
  { r: 44, g: 52, b: 74 },
  { r: 78, g: 84, b: 102 },
  { r: 118, g: 122, b: 136 },
  { r: 154, g: 142, b: 134 },
  { r: 192, g: 176, b: 164 },
  { r: 228, g: 216, b: 204 },
  { r: 246, g: 240, b: 232 },
  { r: 34, g: 40, b: 56 },
  { r: 108, g: 96, b: 112 },
  { r: 164, g: 158, b: 170 },
  { r: 210, g: 202, b: 196 },
];

const INITIAL_BRUSH_PRESET: TeamBrushSharePreset = {
  version: 1,
  name: "메인 잉킹 G펜 스튜디오",
  baseSizePx: 14,
  spacing: 0.08,
  pressureCurve: [
    { x: 0, y: 0.05 },
    { x: 0.28, y: 0.22 },
    { x: 0.72, y: 0.84 },
    { x: 1, y: 1 },
  ],
  paperGrain: { pattern: "cold-press", depth: 0.28, scale: 1.25 },
  dualTip: {
    enabled: true,
    shape: "flat-nib",
    blendMode: "multiply",
    scatter: 0.12,
    rotationJitterDeg: 14,
  },
};

const DEMO_MESH_VERTICES: readonly Point2D[] = Array.from({ length: 16 }, (_, idx) => ({
  x: 24 + (idx % 4) * 64,
  y: 20 + Math.floor(idx / 4) * 40,
}));

function renderToolIcon(toolId: ProDrawingToolId) {
  switch (toolId) {
    case "reference-fill":
      return <PaintBucket size={15} aria-hidden="true" />;
    case "vector-width":
      return <PenTool size={15} aria-hidden="true" />;
    case "pigment-mix":
      return <Palette size={15} aria-hidden="true" />;
    case "puppet-mesh":
      return <Grid2x2 size={15} aria-hidden="true" />;
    case "value-flip":
      return <FlipHorizontal2 size={15} aria-hidden="true" />;
    case "frame-slice-tail":
      return <Scissors size={15} aria-hidden="true" />;
    case "brush-share-code":
      return <Share2 size={15} aria-hidden="true" />;
    case "specialty-ruler":
      return <Compass size={15} aria-hidden="true" />;
  }
}

/** 전문가 드로잉 핵심 8선 실시간 검증 워크벤치 */
export function ProAtelierDrawing8Workbench() {
  const baseId = useId();
  const [activeTool, setActiveTool] = useState<ProDrawingToolId>("reference-fill");
  const [expandPx, setExpandPx] = useState(2);
  const [vectorMode, setVectorMode] = useState<VectorStrokeSculptMode>("thicken");
  const [vectorStrength, setVectorStrength] = useState(1.8);
  const [pigmentPairId, setPigmentPairId] = useState<string>(DEMO_PIGMENT_PAIRS[0].id);
  const [pigmentRatio, setPigmentRatio] = useState(0.5);
  const [tempShift, setTempShift] = useState(0);
  const [lightShift, setLightShift] = useState(0);
  const [pinLiftY, setPinLiftY] = useState(-22);
  const [meshCornerPullX, setMeshCornerPullX] = useState(18);
  const [grayscaleEnabled, setGrayscaleEnabled] = useState(true);
  const [flipHorizontal, setFlipHorizontal] = useState(true);
  const [cutAngleMode, setCutAngleMode] = useState<"diagonal" | "horizontal" | "vertical">("diagonal");
  const [gutterPx, setGutterPx] = useState(14);
  const [bubbleOffsetX, setBubbleOffsetX] = useState(0);
  const [brushName, setBrushName] = useState(INITIAL_BRUSH_PRESET.name);
  const [paperPattern, setPaperPattern] = useState<PaperGrainPattern>(
    INITIAL_BRUSH_PRESET.paperGrain.pattern,
  );
  const [customDecodeInput, setCustomDecodeInput] = useState("");
  const [rulerMode, setRulerMode] = useState<SpecialtyRulerMode>("isometric-30");
  const [pointerX, setPointerX] = useState(134);
  const [pointerY, setPointerY] = useState(92);

  const fillResult = useMemo(
    () =>
      fillFromReferenceLayerWithExpand({
        width: 12,
        height: 12,
        referenceAlpha: DEMO_REFERENCE_MASK,
        seed: { x: 6, y: 6 },
        expandPx,
      }),
    [expandPx],
  );

  const vectorResult = useMemo(
    () =>
      sculptVectorStrokeWidth({
        points: DEMO_VECTOR_STROKE,
        mode: vectorMode,
        brushCenter: { x: 124, y: 54 },
        brushRadius: 96,
        strength: vectorMode === "simplify" ? Math.max(1.2, vectorStrength * 2) : vectorStrength,
      }),
    [vectorMode, vectorStrength],
  );

  const pigmentPair =
    DEMO_PIGMENT_PAIRS.find((pair) => pair.id === pigmentPairId) ?? DEMO_PIGMENT_PAIRS[0];
  const pigmentResult = useMemo(
    () =>
      mixPigmentsAndAdjustTone({
        primary: pigmentPair.primary,
        secondary: pigmentPair.secondary,
        ratio: pigmentRatio,
        temperatureShift: tempShift,
        lightnessShift: lightShift,
      }),
    [pigmentPair, pigmentRatio, tempShift, lightShift],
  );
  const pigmentVsMasterDeltaE = useMemo(
    () => computeOklchDeltaE(DEFAULT_MASTER_CUT_DNA.outfitOklch, pigmentResult.adjustedOklch),
    [pigmentResult.adjustedOklch],
  );

  const warpResult = useMemo(() => {
    const offsets: Point2D[] = Array.from({ length: 16 }, (_, idx) =>
      idx === 3 ? { x: meshCornerPullX, y: -10 } : { x: 0, y: 0 },
    );
    return evaluatePuppetAndMeshWarp({
      vertices: DEMO_MESH_VERTICES,
      bounds: { x: 24, y: 20, width: 192, height: 120 },
      pins: [
        { id: "shoulder", anchor: { x: 24, y: 80 }, target: { x: 24, y: 80 } },
        { id: "wrist", anchor: { x: 216, y: 80 }, target: { x: 216, y: 80 + pinLiftY } },
      ],
      meshOffsets: offsets,
    });
  }, [pinLiftY, meshCornerPullX]);

  const subViewResult = useMemo(
    () =>
      computeValueFlipSubView({
        pixels: DEMO_SUBVIEW_PIXELS,
        width: 240,
        height: 160,
        grayscaleEnabled,
        flipHorizontal,
      }),
    [grayscaleEnabled, flipHorizontal],
  );

  const sliceTailResult = useMemo(() => {
    const cutLine =
      cutAngleMode === "horizontal"
        ? { start: { x: 10, y: 80 }, end: { x: 250, y: 80 } }
        : cutAngleMode === "vertical"
          ? { start: { x: 130, y: 10 }, end: { x: 130, y: 150 } }
          : { start: { x: 10, y: 126 }, end: { x: 250, y: 34 } };
    return sliceFrameAndTrackSpeechTail({
      frame: { x: 20, y: 16, width: 220, height: 128 },
      cutLine,
      gutterPx,
      bubble: { cx: 170 + bubbleOffsetX, cy: 48, rx: 46, ry: 22 },
      speakerMouth: { x: 96, y: 112 },
    });
  }, [cutAngleMode, gutterPx, bubbleOffsetX]);

  const encodedBrushCode = useMemo(
    () =>
      encodeTeamBrushShareCode({
        ...INITIAL_BRUSH_PRESET,
        name: brushName,
        paperGrain: { ...INITIAL_BRUSH_PRESET.paperGrain, pattern: paperPattern },
      }),
    [brushName, paperPattern],
  );
  const decodedBrushResult = useMemo(
    () => decodeTeamBrushShareCode(customDecodeInput.trim() || encodedBrushCode),
    [customDecodeInput, encodedBrushCode],
  );

  const rulerResult = useMemo(
    () =>
      snapPointToSpecialtyRuler({
        point: { x: pointerX, y: pointerY },
        mode: rulerMode,
        origin: { x: 0, y: 0 },
        gridSize: rulerMode === "pixel-grid" ? 16 : 32,
        canvasWidth: 2048,
        canvasHeight: 1024,
        panoramaStepDeg: 15,
      }),
    [pointerX, pointerY, rulerMode],
  );

  const activeToolMeta =
    PRO_DRAWING_8_TOOLS_META.find((meta) => meta.id === activeTool) ?? PRO_DRAWING_8_TOOLS_META[0];

  return (
    <div className="pas-body" style={{ padding: 0 }}>
      <div className="pas-tool-grid" role="group" aria-label="전문가 드로잉 8대 도구 선택">
        {PRO_DRAWING_8_TOOLS_META.map((tool) => (
          <button
            key={tool.id}
            type="button"
            aria-pressed={activeTool === tool.id}
            data-testid={`pas-tool-select-${tool.id}`}
            className="pas-tool-btn"
            onClick={() => setActiveTool(tool.id)}
          >
            <span className="pas-tool-btn-head">
              <span className="pas-tool-index pas-num">0{tool.index}</span>
              <span className="pas-badge">{tool.badgeKo}</span>
            </span>
            <span className="pas-control-row" style={{ gap: "0.35rem" }}>
              {renderToolIcon(tool.id)}
              <span>{tool.titleKo}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="pas-workbench-split">
        <div className="pas-card">
          <h3 className="pas-card-title">
            {renderToolIcon(activeToolMeta.id)}
            <span>
              0{activeToolMeta.index}. {activeToolMeta.titleKo}
            </span>
          </h3>
          <p className="pas-card-desc">{activeToolMeta.summaryKo}</p>

          {activeTool === "reference-fill" ? (
            <>
              <div className="pas-field">
                <label htmlFor={`${baseId}-expand-px`}>
                  선 안쪽 확장 반경: <strong className="pas-num">{expandPx}px</strong>
                </label>
                <input
                  id={`${baseId}-expand-px`}
                  data-testid="pas-fill-expand-range"
                  type="range"
                  min={1}
                  max={3}
                  step={1}
                  value={expandPx}
                  onChange={(e) => setExpandPx(Number(e.currentTarget.value))}
                  className="pas-range"
                />
              </div>
              <div className="pas-metrics-grid">
                <div className="pas-metric-box">
                  <span className="pas-metric-label">확장 전 흰 틈</span>
                  <strong className="pas-metric-value pas-num">{fillResult.initialGapPixels}px</strong>
                </div>
                <div className="pas-metric-box">
                  <span className="pas-metric-label">확장 후 잔여 틈</span>
                  <strong className="pas-metric-value pas-num" data-testid="pas-fill-remaining-gap">
                    {fillResult.remainingGapPixels}px
                  </strong>
                </div>
                <div className="pas-metric-box">
                  <span className="pas-metric-label">선 밖 번짐</span>
                  <strong className="pas-metric-value pas-num">{fillResult.leakedOutsidePixels}px</strong>
                </div>
              </div>
            </>
          ) : null}

          {activeTool === "vector-width" ? (
            <>
              <div className="pas-control-row" role="group" aria-label="벡터 보정 모드">
                {(
                  [
                    ["thicken", "굵게 (Thicken)"],
                    ["thin", "가늘게 (Thin)"],
                    ["simplify", "단순화 (RDP)"],
                  ] as const
                ).map(([modeId, label]) => (
                  <button
                    key={modeId}
                    type="button"
                    aria-pressed={vectorMode === modeId}
                    data-testid={`pas-vector-mode-${modeId}`}
                    className="pas-chip-btn"
                    onClick={() => setVectorMode(modeId)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="pas-field">
                <label htmlFor={`${baseId}-vector-strength`}>
                  보정 강도: <strong className="pas-num">{vectorStrength.toFixed(1)}px</strong>
                </label>
                <input
                  id={`${baseId}-vector-strength`}
                  type="range"
                  min={0.5}
                  max={4}
                  step={0.1}
                  value={vectorStrength}
                  onChange={(e) => setVectorStrength(Number(e.currentTarget.value))}
                  className="pas-range"
                />
              </div>
              <div className="pas-metrics-grid">
                <div className="pas-metric-box">
                  <span className="pas-metric-label">평균 선폭</span>
                  <strong className="pas-metric-value pas-num">
                    {vectorResult.averageWidthBefore} → {vectorResult.averageWidthAfter}px
                  </strong>
                </div>
                <div className="pas-metric-box">
                  <span className="pas-metric-label">제어점 수</span>
                  <strong className="pas-metric-value pas-num">
                    {vectorResult.inputPointCount} → {vectorResult.outputPointCount}
                  </strong>
                </div>
              </div>
            </>
          ) : null}

          {activeTool === "pigment-mix" ? (
            <>
              <div className="pas-field">
                <label htmlFor={`${baseId}-pigment-pair`}>혼색 물감 조합</label>
                <select
                  id={`${baseId}-pigment-pair`}
                  value={pigmentPairId}
                  onChange={(e) => setPigmentPairId(e.currentTarget.value)}
                  className="pas-select"
                >
                  {DEMO_PIGMENT_PAIRS.map((pair) => (
                    <option key={pair.id} value={pair.id}>
                      {pair.labelKo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pas-field">
                <label htmlFor={`${baseId}-pigment-ratio`}>
                  혼색 비율: <strong className="pas-num">{Math.round(pigmentRatio * 100)}%</strong>
                </label>
                <input
                  id={`${baseId}-pigment-ratio`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={pigmentRatio}
                  onChange={(e) => setPigmentRatio(Number(e.currentTarget.value))}
                  className="pas-range"
                />
              </div>
              <div className="pas-field">
                <label htmlFor={`${baseId}-temp-shift`}>
                  색온도(차가움 ↔ 따뜻함):{" "}
                  <strong className="pas-num">
                    {tempShift >= 0 ? `+${tempShift.toFixed(2)}` : tempShift.toFixed(2)}
                  </strong>
                </label>
                <input
                  id={`${baseId}-temp-shift`}
                  type="range"
                  min={-0.6}
                  max={0.6}
                  step={0.05}
                  value={tempShift}
                  onChange={(e) => setTempShift(Number(e.currentTarget.value))}
                  className="pas-range"
                />
              </div>
              <div className="pas-field">
                <label htmlFor={`${baseId}-light-shift`}>
                  명도 보정:{" "}
                  <strong className="pas-num">
                    {lightShift >= 0 ? `+${lightShift.toFixed(2)}` : lightShift.toFixed(2)}
                  </strong>
                </label>
                <input
                  id={`${baseId}-light-shift`}
                  type="range"
                  min={-0.25}
                  max={0.25}
                  step={0.05}
                  value={lightShift}
                  onChange={(e) => setLightShift(Number(e.currentTarget.value))}
                  className="pas-range"
                />
              </div>
            </>
          ) : null}

          {activeTool === "puppet-mesh" ? (
            <>
              <div className="pas-field">
                <label htmlFor={`${baseId}-pin-lift`}>
                  손목 핀 Y 이동량: <strong className="pas-num">{pinLiftY}px</strong>
                </label>
                <input
                  id={`${baseId}-pin-lift`}
                  type="range"
                  min={-40}
                  max={40}
                  step={2}
                  value={pinLiftY}
                  onChange={(e) => setPinLiftY(Number(e.currentTarget.value))}
                  className="pas-range"
                />
              </div>
              <div className="pas-field">
                <label htmlFor={`${baseId}-mesh-pull`}>
                  4×4 우상단 메쉬 핸들 X 변위: <strong className="pas-num">{meshCornerPullX}px</strong>
                </label>
                <input
                  id={`${baseId}-mesh-pull`}
                  type="range"
                  min={-30}
                  max={30}
                  step={2}
                  value={meshCornerPullX}
                  onChange={(e) => setMeshCornerPullX(Number(e.currentTarget.value))}
                  className="pas-range"
                />
              </div>
              <div className="pas-metrics-grid">
                <div className="pas-metric-box">
                  <span className="pas-metric-label">최대 정점 변위</span>
                  <strong className="pas-metric-value pas-num">{warpResult.maxDisplacementPx}px</strong>
                </div>
                <div className="pas-metric-box">
                  <span className="pas-metric-label">활성 핀 · 메쉬</span>
                  <strong className="pas-metric-value pas-num">
                    {warpResult.pinCount}핀 · {warpResult.activeMeshHandles}핸들
                  </strong>
                </div>
              </div>
            </>
          ) : null}

          {activeTool === "value-flip" ? (
            <>
              <div className="pas-control-row">
                <button
                  type="button"
                  aria-pressed={grayscaleEnabled}
                  data-testid="pas-subview-grayscale-toggle"
                  className="pas-chip-btn"
                  onClick={() => setGrayscaleEnabled((prev) => !prev)}
                >
                  흑백 명도(Rec.709) {grayscaleEnabled ? "켜짐" : "꺼짐"}
                </button>
                <button
                  type="button"
                  aria-pressed={flipHorizontal}
                  data-testid="pas-subview-flip-toggle"
                  className="pas-chip-btn"
                  onClick={() => setFlipHorizontal((prev) => !prev)}
                >
                  좌우 반전 {flipHorizontal ? "켜짐" : "꺼짐"}
                </button>
              </div>
              <p className="pas-card-desc">{subViewResult.balanceVerdictKo}</p>
              <div className="pas-metrics-grid">
                <div className="pas-metric-box">
                  <span className="pas-metric-label">암부 / 중간 / 명부</span>
                  <strong className="pas-metric-value pas-num">
                    {Math.round(subViewResult.shadowRatio * 100)}% /{" "}
                    {Math.round(subViewResult.midtoneRatio * 100)}% /{" "}
                    {Math.round(subViewResult.highlightRatio * 100)}%
                  </strong>
                </div>
                <div className="pas-metric-box">
                  <span className="pas-metric-label">대비비 · 평균 휘도</span>
                  <strong className="pas-metric-value pas-num">
                    {subViewResult.contrastRatio}:1 · Y {subViewResult.meanLuminance}
                  </strong>
                </div>
              </div>
            </>
          ) : null}

          {activeTool === "frame-slice-tail" ? (
            <>
              <div className="pas-control-row" role="group" aria-label="칼선 방향 선택">
                {(
                  [
                    ["diagonal", "사선 칼선"],
                    ["horizontal", "가로 분할"],
                    ["vertical", "세로 분할"],
                  ] as const
                ).map(([modeId, label]) => (
                  <button
                    key={modeId}
                    type="button"
                    aria-pressed={cutAngleMode === modeId}
                    className="pas-chip-btn"
                    onClick={() => setCutAngleMode(modeId)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="pas-field">
                <label htmlFor={`${baseId}-gutter-px`}>
                  컷 여백(Gutter): <strong className="pas-num">{gutterPx}px</strong>
                </label>
                <input
                  id={`${baseId}-gutter-px`}
                  type="range"
                  min={4}
                  max={28}
                  step={2}
                  value={gutterPx}
                  onChange={(e) => setGutterPx(Number(e.currentTarget.value))}
                  className="pas-range"
                />
              </div>
              <div className="pas-field">
                <label htmlFor={`${baseId}-bubble-x`}>
                  말풍선 X 이동(꼬리 자동 추적): <strong className="pas-num">{bubbleOffsetX}px</strong>
                </label>
                <input
                  id={`${baseId}-bubble-x`}
                  type="range"
                  min={-80}
                  max={40}
                  step={4}
                  value={bubbleOffsetX}
                  onChange={(e) => setBubbleOffsetX(Number(e.currentTarget.value))}
                  className="pas-range"
                />
              </div>
            </>
          ) : null}

          {activeTool === "brush-share-code" ? (
            <>
              <div className="pas-field">
                <label htmlFor={`${baseId}-brush-name`}>팀 공유 브러시 이름</label>
                <input
                  id={`${baseId}-brush-name`}
                  type="text"
                  value={brushName}
                  onChange={(e) => setBrushName(e.currentTarget.value)}
                  className="pas-input"
                />
              </div>
              <div className="pas-field">
                <label htmlFor={`${baseId}-paper-grain`}>종이 요철 패턴</label>
                <select
                  id={`${baseId}-paper-grain`}
                  value={paperPattern}
                  onChange={(e) => setPaperPattern(e.currentTarget.value as PaperGrainPattern)}
                  className="pas-select"
                >
                  <option value="smooth">매끈한 켄트지 (smooth)</option>
                  <option value="cold-press">중목 수채화지 (cold-press)</option>
                  <option value="rough-cotton">황목 코튼지 (rough-cotton)</option>
                  <option value="screentone-dot">망점 톤 (screentone-dot)</option>
                </select>
              </div>
              <div className="pas-field">
                <label htmlFor={`${baseId}-decode-check`}>외부 코드 검증 입력(비우면 자동 검증)</label>
                <input
                  id={`${baseId}-decode-check`}
                  data-testid="pas-brush-code-input"
                  type="text"
                  value={customDecodeInput}
                  placeholder="TSB1-..."
                  onChange={(e) => setCustomDecodeInput(e.currentTarget.value)}
                  className="pas-input"
                />
              </div>
            </>
          ) : null}

          {activeTool === "specialty-ruler" ? (
            <>
              <div className="pas-control-row" role="group" aria-label="특수 스냅 자 모드">
                {(
                  [
                    ["isometric-30", "등각 30°"],
                    ["panorama-360", "360° 파노라마"],
                    ["pixel-grid", "픽셀 격자 16px"],
                  ] as const
                ).map(([modeId, label]) => (
                  <button
                    key={modeId}
                    type="button"
                    aria-pressed={rulerMode === modeId}
                    data-testid={`pas-ruler-mode-${modeId}`}
                    className="pas-chip-btn"
                    onClick={() => setRulerMode(modeId)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="pas-field">
                <label htmlFor={`${baseId}-ptr-x`}>
                  입력 좌표 X: <strong className="pas-num">{pointerX}px</strong>
                </label>
                <input
                  id={`${baseId}-ptr-x`}
                  type="range"
                  min={0}
                  max={2048}
                  step={8}
                  value={pointerX}
                  onChange={(e) => setPointerX(Number(e.currentTarget.value))}
                  className="pas-range"
                />
              </div>
              <div className="pas-field">
                <label htmlFor={`${baseId}-ptr-y`}>
                  입력 좌표 Y: <strong className="pas-num">{pointerY}px</strong>
                </label>
                <input
                  id={`${baseId}-ptr-y`}
                  type="range"
                  min={0}
                  max={1024}
                  step={8}
                  value={pointerY}
                  onChange={(e) => setPointerY(Number(e.currentTarget.value))}
                  className="pas-range"
                />
              </div>
            </>
          ) : null}
        </div>

        <ProAtelierDrawing8Preview
          activeTool={activeTool}
          demoReferenceMask={DEMO_REFERENCE_MASK}
          fillResult={fillResult}
          vectorResult={vectorResult}
          pigmentResult={pigmentResult}
          pigmentVsMasterDeltaE={pigmentVsMasterDeltaE}
          warpResult={warpResult}
          subViewResult={subViewResult}
          sliceTailResult={sliceTailResult}
          encodedBrushCode={encodedBrushCode}
          decodedBrushResult={decodedBrushResult}
          rulerResult={rulerResult}
        />
      </div>
    </div>
  );
}
