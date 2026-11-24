/**
 * Wave 39E — Tab 2: CSP 벡터 교차점 지우개 · 3D LT 3층 추출 · QuickShape · ColorDrop · 기울기 중력 수채화 드라이어.
 */

import { Droplets, Layers, RotateCcw, Scissors, Wind } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import {
  blowDry,
  createDemoColorDropCanvas,
  createDemoLtArchitectureMesh,
  createDemoOverhangingVectorStrokes,
  createDemoQuickShapeStroke,
  createWetPaintGrid,
  depositWetWatercolor,
  eraseVectorTailToIntersection,
  extractThreeLayerLtFromMesh,
  recognizeAndSnapQuickShape,
  simulateColorDropFill,
  stepGravityWatercolor,
  summarizeWetPaintGrid,
  type VectorStroke,
  type WetPaintGrid,
} from "./vector-quickshape-wetpaint-engine";

export interface CharlabCspSurpassDrawingTabProps {
  readonly uid: string;
  readonly isEn: boolean;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const BTN_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

type DemoQuickShapePresetId = "line" | "circle" | "ellipse" | "triangle" | "rectangle";

const QUICKSHAPE_PRESETS: readonly {
  readonly id: DemoQuickShapePresetId;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "line", labelKo: "직선", labelEn: "Line" },
  { id: "circle", labelKo: "원", labelEn: "Circle" },
  { id: "ellipse", labelKo: "타원", labelEn: "Ellipse" },
  { id: "triangle", labelKo: "삼각형", labelEn: "Triangle" },
  { id: "rectangle", labelKo: "사각형", labelEn: "Rectangle" },
];

function createSeededWetGrid(): WetPaintGrid {
  return depositWetWatercolor(createWetPaintGrid(16, 12), 5, 4, 3.2, 0.9, 0.95);
}

function pointsToSvgPath(points: readonly { readonly x: number; readonly y: number }[]): string {
  if (points.length === 0) return "";
  return points.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export function CharlabCspSurpassDrawingTab(
  props: CharlabCspSurpassDrawingTabProps,
): ReactElement {
  const { uid, isEn } = props;
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [vectorStrokes, setVectorStrokes] = useState<readonly VectorStroke[]>(() =>
    createDemoOverhangingVectorStrokes(),
  );
  const [lastEraseMsg, setLastEraseMsg] = useState<string>(
    "잉여 꼬리 선분을 눌러 가장 가까운 교차점까지만 절단하세요.",
  );
  const [ltLightAzimuthDeg, setLtLightAzimuthDeg] = useState<number>(38);
  const [ltShowOutline, setLtShowOutline] = useState<boolean>(true);
  const [ltShowShadow, setLtShowShadow] = useState<boolean>(true);
  const [ltShowTone, setLtShowTone] = useState<boolean>(true);

  const [quickShapePreset, setQuickShapePreset] = useState<DemoQuickShapePresetId>("circle");
  const [colorDropThresholdPct, setColorDropThresholdPct] = useState<number>(48);
  const [gapCloseRadiusPx, setGapCloseRadiusPx] = useState<number>(3);
  const [antiHaloExpandPx, setAntiHaloExpandPx] = useState<number>(1);

  const [wetGrid, setWetGrid] = useState<WetPaintGrid>(() => createSeededWetGrid());
  const [tiltGx, setTiltGx] = useState<number>(0.65);
  const [tiltGy, setTiltGy] = useState<number>(0.55);

  const ltMesh = useMemo(() => createDemoLtArchitectureMesh(), []);
  const ltResult = useMemo(() => {
    const rad = (ltLightAzimuthDeg * Math.PI) / 180;
    return extractThreeLayerLtFromMesh(ltMesh, {
      camera: {
        position: { x: 3.6, y: 2.5, z: 4.2 },
        target: { x: -0.1, y: 1.1, z: 0 },
        fovDeg: 45,
        viewportWidth: 240,
        viewportHeight: 160,
      },
      keyLightDir: { x: Math.cos(rad), y: 0.62, z: Math.sin(rad) },
      screentoneLpi: 60,
    });
  }, [ltLightAzimuthDeg, ltMesh]);

  const rawQuickStroke = useMemo(() => createDemoQuickShapeStroke(quickShapePreset), [quickShapePreset]);
  const quickShapeResult = useMemo(() => recognizeAndSnapQuickShape(rawQuickStroke, 0.04), [rawQuickStroke]);
  const colorDropCanvas = useMemo(() => createDemoColorDropCanvas(4), []);
  const colorDropResult = useMemo(
    () =>
      simulateColorDropFill(colorDropCanvas, {
        seed: { x: 21, y: 21 },
        dragThreshold: colorDropThresholdPct / 100,
        gapCloseRadiusPx,
        antiHaloExpandPx,
      }),
    [antiHaloExpandPx, colorDropCanvas, colorDropThresholdPct, gapCloseRadiusPx],
  );
  const wetSummary = useMemo(() => summarizeWetPaintGrid(wetGrid), [wetGrid]);

  const handleEraseTail = (pt: { readonly x: number; readonly y: number }): void => {
    const res = eraseVectorTailToIntersection(vectorStrokes, pt, 18);
    setVectorStrokes(res.strokes);
    setLastEraseMsg(
      res.actionKind === "miss"
        ? "이미 절단되었거나 선택 반경에 선분이 없습니다."
        : `${res.trimmedStrokeId} 교차점 절단 완료 (${res.actionKind} · ${res.removedSegmentLengthPx.toFixed(1)}px 제거)`,
    );
  };

  return (
    <div
      id={`${uid}-panel-drawing-surpass`}
      role="tabpanel"
      aria-labelledby={`${uid}-tab-drawing-surpass`}
      className="space-y-4 [word-break:keep-all]"
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Scissors className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("CSP 돌파 벡터 교차점 지우개", "Vector Intersection Eraser")}</span>
            </h3>
            <button
              data-testid="vector-reset-btn"
              type="button"
              onClick={() => {
                setVectorStrokes(createDemoOverhangingVectorStrokes());
                setLastEraseMsg("초기 잉여 꼬리 선분으로 복원했습니다.");
              }}
              className={BTN_OUTLINE}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("초기화", "Reset")}</span>
            </button>
          </div>
          <svg
            viewBox="0 0 240 200"
            className="h-36 w-full rounded-lg border border-line bg-canvas text-fg"
            role="img"
            aria-label={pick("벡터 교차점 지우개 미리보기", "Vector Intersection Eraser Preview")}
          >
            {vectorStrokes.map((st) => (
              <path
                key={st.id}
                d={pointsToSvgPath(st.points)}
                fill="none"
                stroke="currentColor"
                strokeWidth={st.widthPx}
                strokeLinecap="round"
              />
            ))}
          </svg>
          <div className="flex flex-wrap gap-2">
            <button
              data-testid="erase-top-left-tail-btn"
              type="button"
              onClick={() => handleEraseTail({ x: 36, y: 48 })}
              className={BTN_PRIMARY}
            >
              {pick("좌상단 꼬리 절단", "Trim Top-Left Tail")}
            </button>
            <button
              data-testid="erase-top-right-tail-btn"
              type="button"
              onClick={() => handleEraseTail({ x: 204, y: 48 })}
              className={BTN_OUTLINE}
            >
              {pick("우상단 꼬리 절단", "Trim Top-Right Tail")}
            </button>
          </div>
          <p data-testid="vector-erase-status" className="text-xs text-fg-2 tabular-nums">
            {lastEraseMsg}
          </p>
        </div>

        <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("3D LT 3층 추출 (외곽선 · 그림자 · 스크린톤)", "3D LT 3-Layer Extraction")}</span>
            </h3>
            <span className="text-[11px] font-semibold text-fg-2 tabular-nums">
              {ltResult.outlineLayer.edges.length}선 · {ltResult.shadowLayer.polygons.length}음영 ·{" "}
              {ltResult.screentoneLayer.dots.length}도트
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={ltShowOutline} onClick={() => setLtShowOutline((v) => !v)} className={ltShowOutline ? BTN_ACTIVE : BTN_OUTLINE}>
              {pick("외곽선", "Outline")}
            </button>
            <button type="button" aria-pressed={ltShowShadow} onClick={() => setLtShowShadow((v) => !v)} className={ltShowShadow ? BTN_ACTIVE : BTN_OUTLINE}>
              {pick("그림자", "Shadow")}
            </button>
            <button type="button" aria-pressed={ltShowTone} onClick={() => setLtShowTone((v) => !v)} className={ltShowTone ? BTN_ACTIVE : BTN_OUTLINE}>
              {pick("스크린톤 60LPI", "Screentone")}
            </button>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={`${uid}-lt-light`} className="font-medium text-fg-2">
                {pick("주광원 방위각", "Key Light Azimuth")}
              </label>
              <span className="font-semibold text-fg tabular-nums">{ltLightAzimuthDeg}°</span>
            </div>
            <input
              id={`${uid}-lt-light`}
              type="range"
              min={0}
              max={360}
              step={5}
              value={ltLightAzimuthDeg}
              onChange={(e) => setLtLightAzimuthDeg(Number(e.target.value))}
              className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
            />
          </div>
          <svg
            viewBox="0 0 240 160"
            className="h-28 w-full rounded-lg border border-line bg-canvas text-fg"
            role="img"
            aria-label={pick("3D LT 3층 미리보기", "3D LT 3-Layer Preview")}
          >
            {ltShowShadow &&
              ltResult.shadowLayer.polygons.map((poly, idx) => (
                <polygon
                  key={`sh-${idx}`}
                  points={poly.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                  className="fill-fg-3"
                  opacity={poly.band === "core" ? 0.35 : 0.16}
                />
              ))}
            {ltShowTone &&
              ltResult.screentoneLayer.dots.slice(0, 140).map((dot, idx) => (
                <circle key={`dt-${idx}`} cx={dot.x} cy={dot.y} r={dot.radiusPx} className="fill-accent" opacity={0.45} />
              ))}
            {ltShowOutline &&
              ltResult.outlineLayer.edges.map((edge, idx) => (
                <line key={`ed-${idx}`} x1={edge.from.x} y1={edge.from.y} x2={edge.to.x} y2={edge.to.y} stroke="currentColor" strokeWidth={edge.widthPx * 0.7} />
              ))}
          </svg>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-fg">
              {pick("QuickShape 자석 스냅 + ColorDrop 틈새 닫기", "QuickShape Snap + ColorDrop")}
            </h3>
            <span data-testid="quickshape-badge" className="rounded-md border border-good/40 bg-good-soft px-2 py-0.5 text-[11px] font-bold text-good tabular-nums">
              {quickShapeResult.kind} · RMS {quickShapeResult.rmsError.toFixed(4)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICKSHAPE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                data-testid={`quickshape-preset-${preset.id}`}
                type="button"
                onClick={() => setQuickShapePreset(preset.id)}
                className={quickShapePreset === preset.id ? BTN_ACTIVE : BTN_OUTLINE}
              >
                {isEn ? preset.labelEn : preset.labelKo}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between">
                <label htmlFor={`${uid}-cd-thresh`} className="text-fg-2">{pick("드래그 임계값", "Threshold")}</label>
                <span className="font-semibold tabular-nums">{colorDropThresholdPct}%</span>
              </div>
              <input id={`${uid}-cd-thresh`} type="range" min={15} max={90} step={5} value={colorDropThresholdPct} onChange={(e) => setColorDropThresholdPct(Number(e.target.value))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <label htmlFor={`${uid}-cd-gap`} className="text-fg-2">{pick("틈새 닫기 / 할로", "Gap / Anti-Halo")}</label>
                <span className="font-semibold tabular-nums">{gapCloseRadiusPx}px / {antiHaloExpandPx}px</span>
              </div>
              <input id={`${uid}-cd-gap`} type="range" min={0} max={5} step={1} value={gapCloseRadiusPx} onChange={(e) => setGapCloseRadiusPx(Number(e.target.value))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-xs tabular-nums">
            <span className={colorDropResult.gapSealed ? "font-semibold text-good" : "font-semibold text-bad"}>
              {colorDropResult.gapSealed
                ? pick(`틈새 봉인 성공 (${colorDropResult.filledPixelCount}px 채움)`, "Gap Sealed")
                : pick("틈새 누출 발생 (반경을 높이세요)", "Leaked to Border")}
            </span>
            <button type="button" onClick={() => setAntiHaloExpandPx((prev) => (prev === 0 ? 1 : 0))} className={BTN_OUTLINE}>
              {pick(`할로 제거 ${(colorDropResult.haloEliminationRatio * 100).toFixed(0)}%`, "Anti-Halo")}
            </button>
          </div>
        </div>

        <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Droplets className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("기울기 중력 수채화 + 1클릭 드라이어", "Gravity Watercolor + Blow-Dry")}</span>
            </h3>
            <span
              data-testid="wet-moisture-badge"
              className={`rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                wetSummary.isCompletelyDry ? "border-good/40 bg-good-soft text-good" : "border-accent bg-accent-soft text-accent"
              }`}
            >
              {pick("수분", "Moisture")} {wetSummary.moisturePercent.toFixed(1)}%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between">
                <label htmlFor={`${uid}-tilt-gx`} className="text-fg-2">{pick("기울기 gx", "Tilt gx")}</label>
                <span className="font-semibold tabular-nums">{tiltGx.toFixed(2)}</span>
              </div>
              <input id={`${uid}-tilt-gx`} type="range" min={-1} max={1} step={0.05} value={tiltGx} onChange={(e) => setTiltGx(Number(e.target.value))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <label htmlFor={`${uid}-tilt-gy`} className="text-fg-2">{pick("기울기 gy", "Tilt gy")}</label>
                <span className="font-semibold tabular-nums">{tiltGy.toFixed(2)}</span>
              </div>
              <input id={`${uid}-tilt-gy`} type="range" min={-1} max={1} step={0.05} value={tiltGy} onChange={(e) => setTiltGy(Number(e.target.value))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              data-testid="watercolor-step-btn"
              type="button"
              onClick={() => setWetGrid((prev) => stepGravityWatercolor(prev, { gx: tiltGx, gy: tiltGy, dt: 0.5 }).grid)}
              className={BTN_PRIMARY}
            >
              {pick("중력 이류 1스텝", "Gravity Flow Step")}
            </button>
            <button
              data-testid="watercolor-blowdry-btn"
              type="button"
              onClick={() => setWetGrid((prev) => blowDry(prev).grid)}
              className={BTN_OUTLINE}
            >
              <Wind className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("1클릭 드라이어 (수분 0)", "1-Click Blow-Dry")}</span>
            </button>
            <button data-testid="watercolor-rewet-btn" type="button" onClick={() => setWetGrid(createSeededWetGrid())} className={BTN_OUTLINE}>
              {pick("물감 다시 찍기", "Re-Wet")}
            </button>
          </div>
          <p data-testid="watercolor-com-readout" className="text-xs text-fg-2 tabular-nums">
            {pick(
              `스텝 ${wetGrid.stepCount} · 안료 무게중심 (${wetSummary.centerOfMass.x.toFixed(2)}, ${wetSummary.centerOfMass.y.toFixed(2)}) · 건조 안료 ${wetSummary.totalDriedPigment.toFixed(2)}`,
              `Step ${wetGrid.stepCount} · Center (${wetSummary.centerOfMass.x.toFixed(2)}, ${wetSummary.centerOfMass.y.toFixed(2)})`,
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
