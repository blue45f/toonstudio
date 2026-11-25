/**
 * AtelierSolid Pro — 실측 수밀 B-Rep 직접 모델링·어셈블리·KilnExport(STL/STEP/GD&T)·
 * AtelierStage 웹툰 3D→2D LT 선화 원클릭 브리지 스튜디오 제어판.
 * 모든 Props 선택적(빈 객체 기본값 금지) · Calm Atelier 시맨틱 토큰 + OKLCH 전용
 * (원시 색·바이올렛 270~320°·전역 전환·Web Storage 0건) · min-h-11 · tabular-nums · keep-all.
 */

import {
  AlertTriangle, Box, CheckCircle2, Copy, Download, Eye, FileCode2, Layers,
  PenTool, RotateCcw, Ruler, Scissors, ShieldAlert, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { copyText } from "@/shared/lib/copy-text";

import {
  ATELIER_SOLID_PRESETS, createDefaultAtelierSolidParams, evaluateAtelierSolidModel,
  exportBinaryStlBuffer, exportEngineeringDrawingSvgSpec, exportStepAp214Ascii,
  exportWebtoonLtLineartPayload, formatOklch,
  type AssemblyMateMode, type AtelierSolidEvaluation, type AtelierSolidParams,
  type AtelierSolidPresetId, type EngineeringDrawingSpec, type PatternMode,
  type PerspectiveMode, type SolidFeatureKind, type SolidFeatureStatus,
  type Vec2, type WebtoonLtLineartPayload,
} from "./atelier-solid-kernel";

export type AtelierSolidViewMode = "isometric" | "front" | "side" | "top" | "lt-lineart" | "drawing";

export interface StudioAtelierSolidCadProPanelProps {
  readonly initialPresetId?: AtelierSolidPresetId;
  readonly initialViewMode?: AtelierSolidViewMode;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onSolidChange?: (evaluation: AtelierSolidEvaluation) => void;
  readonly onExportStl?: (buffer: Uint8Array, evaluation: AtelierSolidEvaluation) => void | Promise<void>;
  readonly onExportStep?: (stepAscii: string, evaluation: AtelierSolidEvaluation) => void | Promise<void>;
  readonly onSendToWebtoonLt?: (payload: WebtoonLtLineartPayload, evaluation: AtelierSolidEvaluation) => void | Promise<void>;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} border-accent bg-accent text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border-line bg-card text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border-accent bg-accent-soft text-accent`;

const SVG_PAPER = formatOklch({ l: 0.985, c: 0.005, h: 90 });
const SVG_TONE_MID = formatOklch({ l: 0.84, c: 0.01, h: 230 });
const SVG_GRID = formatOklch({ l: 0.78, c: 0.014, h: 222 }, 0.42);
const SVG_INK = formatOklch({ l: 0.21, c: 0.018, h: 236 });
const SVG_CREASE = formatOklch({ l: 0.34, c: 0.032, h: 230 });
const SVG_CONTOUR = formatOklch({ l: 0.56, c: 0.025, h: 224 }, 0.65);
const SVG_GUIDE = formatOklch({ l: 0.50, c: 0.135, h: 214 }, 0.52);
const SVG_DIM = formatOklch({ l: 0.45, c: 0.145, h: 220 });
const SVG_CUT = formatOklch({ l: 0.55, c: 0.165, h: 30 });
const SVG_GROUND = formatOklch({ l: 0.52, c: 0.125, h: 158 }, 0.75);
const SVG_HUD_BG = formatOklch({ l: 0.18, c: 0.015, h: 236 }, 0.88);
const SVG_HUD_FG = formatOklch({ l: 0.97, c: 0.005, h: 90 });

const VIEW_TABS: readonly { readonly id: AtelierSolidViewMode; readonly ko: string; readonly en: string; readonly yaw: number; readonly pitch: number }[] = [
  { id: "isometric", ko: "등각 3D", en: "Isometric", yaw: 34, pitch: 22 },
  { id: "front", ko: "정면", en: "Front", yaw: 0, pitch: 0 },
  { id: "side", ko: "측면", en: "Side", yaw: 90, pitch: 0 },
  { id: "top", ko: "평면", en: "Top", yaw: 0, pitch: 74 },
  { id: "lt-lineart", ko: "웹툰 LT 선화", en: "Webtoon LT", yaw: 38, pitch: 18 },
  { id: "drawing", ko: "GD&T 3면도", en: "GD&T Drawing", yaw: 34, pitch: 22 },
];

type SliderParamKey = "pushPullMm" | "filletRadiusMm" | "chamferSizeMm" | "draftAngleDeg" | "wallThicknessMm" | "loftScaleRatio" | "mateOffsetMm";
interface NumericSliderSpec {
  readonly key: SliderParamKey; readonly ko: string; readonly en: string;
  readonly min: number; readonly max: number; readonly step: number; readonly fmt: (v: number) => string;
}

const MODEL_SLIDERS: readonly NumericSliderSpec[] = [
  { key: "pushPullMm", ko: "직접 면 밀기/당기기", en: "Direct Push-Pull", min: -30, max: 120, step: 2, fmt: (v) => `${v >= 0 ? "+" : ""}${v}mm` },
  { key: "filletRadiusMm", ko: "필렛 반경 (R)", en: "Fillet Radius", min: 0, max: 28, step: 0.5, fmt: (v) => `R${v.toFixed(1)}mm` },
  { key: "chamferSizeMm", ko: "모따기 (C)", en: "Chamfer Size", min: 0, max: 26, step: 0.5, fmt: (v) => `C${v.toFixed(1)}mm` },
  { key: "draftAngleDeg", ko: "금형 구배 각도", en: "Mold Draft", min: 0, max: 18, step: 0.5, fmt: (v) => `${v.toFixed(1)}°` },
  { key: "wallThicknessMm", ko: "쉘 벽두께", en: "Shell Wall", min: 2, max: 40, step: 0.5, fmt: (v) => `${v.toFixed(1)}mm` },
  { key: "loftScaleRatio", ko: "로프트 상단 배율", en: "Loft Top Scale", min: 0.55, max: 1.25, step: 0.02, fmt: (v) => `×${v.toFixed(2)}` },
  { key: "mateOffsetMm", ko: "어셈블리 메이트 오프셋", en: "Assembly Mate Offset", min: -12, max: 30, step: 0.5, fmt: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}mm` },
];

const PATTERN_MODES: readonly { readonly id: PatternMode; readonly ko: string; readonly en: string }[] = [
  { id: "none", ko: "단일", en: "Single" }, { id: "linear", ko: "선형 배열", en: "Linear" }, { id: "circular", ko: "원형 배열", en: "Circular" },
];
const MATE_MODES: readonly { readonly id: AssemblyMateMode; readonly ko: string; readonly en: string }[] = [
  { id: "concentric", ko: "동심", en: "Concentric" }, { id: "coincident", ko: "접촉", en: "Coincident" }, { id: "distance", ko: "거리", en: "Distance" },
];

const toPolyPoints = (pts: readonly Vec2[]): string => pts.map((p) => `${p.x},${p.y}`).join(" ");
const featureBadgeTone = (status: SolidFeatureStatus): string =>
  status === "ok" ? "border-good bg-good-soft text-good" : status === "failed-guard" ? "border-bad bg-bad-soft text-bad" : "border-line bg-raised text-fg-3";

function Solid3dViewportSvg(vp: {
  readonly evaluation: AtelierSolidEvaluation; readonly ltPayload: WebtoonLtLineartPayload; readonly viewMode: AtelierSolidViewMode;
  readonly yawDeg: number; readonly pitchDeg: number; readonly showWireframe: boolean; readonly showGdtDims: boolean;
  readonly showPerspectiveGuides: boolean; readonly sectionCutActive: boolean; readonly sectionCutPercent: number; readonly isEn: boolean;
}): ReactElement {
  const gridId = `${useId()}-solid-grid`;
  const { evaluation, ltPayload, viewMode, yawDeg, pitchDeg, showWireframe, showGdtDims, showPerspectiveGuides, sectionCutActive, sectionCutPercent, isEn } = vp;
  const isLtOnly = viewMode === "lt-lineart";
  const cutX = 48 + (384 * sectionCutPercent) / 100;

  return (
    <svg
      data-testid="atelier-solid-viewport-svg" data-preset-id={evaluation.preset.id} data-view-mode={viewMode}
      data-watertight={String(evaluation.topology.watertight)} data-section-active={String(sectionCutActive)} data-violet-free="true"
      viewBox="0 0 480 320" role="img"
      aria-label={isEn ? `${evaluation.preset.nameEn} 3D viewport (${viewMode}), watertight=${evaluation.topology.watertight}` : `${evaluation.preset.nameKo} 3D 뷰포트 (${viewMode}), 수밀=${evaluation.topology.watertight}`}
      className="h-80 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <defs>
        <pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke={SVG_GRID} strokeWidth="0.7" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="480" height="320" fill={SVG_PAPER} />
      <rect x="0" y="0" width="480" height="320" fill={`url(#${gridId})`} />
      <line x1="20" y1="274" x2="460" y2="274" stroke={SVG_GROUND} strokeWidth="1" strokeDasharray="5 4" />
      <text x="26" y="269" fontSize="9" fontFamily="monospace" fill={SVG_GROUND}>DATUM [A] Y=0.000m</text>

      {(showPerspectiveGuides || isLtOnly) ? (
        <g data-testid="atelier-solid-vp-guides">
          {ltPayload.perspectiveGuides.map((g, idx) => (
            <line key={idx} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={SVG_GUIDE} strokeWidth="0.75" strokeDasharray="3 4" />
          ))}
        </g>
      ) : null}

      <g data-testid="atelier-solid-shaded-faces">
        {ltPayload.shadedFaces.map((face, idx) => (
          <polygon key={idx} points={toPolyPoints(face.points)} fill={isLtOnly ? (face.shade01 < 0.45 ? SVG_TONE_MID : SVG_PAPER) : face.fillOklch} stroke={showWireframe ? SVG_CONTOUR : "none"} strokeWidth={showWireframe ? "0.45" : "0"} />
        ))}
      </g>

      {showWireframe ? (
        <g>{ltPayload.contourEdges.map((e, idx) => <line key={idx} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={SVG_CONTOUR} strokeWidth="0.6" />)}</g>
      ) : null}
      <g data-testid="atelier-solid-crease-edges">
        {ltPayload.creaseEdges.map((e, idx) => <line key={idx} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={SVG_CREASE} strokeWidth={isLtOnly ? "1.45" : "1.1"} strokeLinecap="round" />)}
      </g>
      <g data-testid="atelier-solid-silhouette-edges">
        {ltPayload.silhouetteEdges.map((e, idx) => <line key={idx} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={SVG_INK} strokeWidth={isLtOnly ? "2.2" : "1.75"} strokeLinecap="round" />)}
      </g>

      {sectionCutActive ? (
        <g data-testid="atelier-solid-section-plane">
          <line x1={cutX} y1="22" x2={cutX} y2="296" stroke={SVG_CUT} strokeWidth="1.6" strokeDasharray="6 3" />
          <text x={Math.min(390, cutX + 6)} y="36" fontSize="9.5" fontFamily="monospace" fill={SVG_CUT}>SEC {sectionCutPercent}%</text>
        </g>
      ) : null}

      {showGdtDims ? (
        <g data-testid="atelier-solid-gdt-overlay">
          <line x1="88" y1="294" x2="392" y2="294" stroke={SVG_DIM} strokeWidth="1" />
          <text x="240" y="309" textAnchor="middle" fontSize="9.5" fontFamily="monospace" fill={SVG_DIM}>
            W {evaluation.dimensionsMm.width} × H {evaluation.dimensionsMm.height} × D {evaluation.dimensionsMm.depth} mm (±0.05)
          </text>
        </g>
      ) : null}

      <rect x="12" y="10" width="456" height="22" rx="5" fill={SVG_HUD_BG} />
      <text x="20" y="24" fontSize="9.5" fontFamily="monospace" fill={SVG_HUD_FG}>
        {`AtelierSolid Pro | Yaw ${yawDeg}° Pitch ${pitchDeg}° | V=${evaluation.topology.vertexCount} F=${evaluation.topology.faceCount} | Vol=${evaluation.topology.signedVolumeCm3}cm³ | ${evaluation.regenHash}`}
      </text>
    </svg>
  );
}

function EngineeringDrawingSvgView(props: { readonly spec: EngineeringDrawingSpec; readonly isEn: boolean }): ReactElement {
  const { spec, isEn } = props;
  const offsets: readonly [number, number][] = [[14, 18], [240, 18], [14, 166], [240, 166]];
  return (
    <div data-testid="atelier-solid-drawing-view" className="space-y-3">
      <svg
        data-testid="atelier-solid-drawing-svg" data-preset-id={spec.presetId} data-violet-free="true"
        viewBox="0 0 468 334" role="img"
        aria-label={isEn ? `GD&T 3-view and isometric engineering drawing for ${spec.presetId}` : `${spec.presetId} GD&T 정투상 3면도 및 등각투영 도면`}
        className="h-80 w-full rounded-xl border border-line-strong bg-canvas text-fg"
      >
        <rect x="0" y="0" width="468" height="334" fill={SVG_PAPER} />
        <rect x="6" y="6" width="456" height="322" fill="none" stroke={SVG_INK} strokeWidth="1.2" />
        {spec.views.map((view, idx) => {
          const [ox, oy] = offsets[idx];
          return (
            <g key={view.id}>
              <rect x={ox} y={oy} width="212" height="138" rx="4" fill="none" stroke={SVG_CREASE} strokeWidth="0.9" />
              <text x={ox + 8} y={oy + 15} fontSize="8.5" fontFamily="monospace" fill={SVG_DIM}>
                {isEn ? view.titleEn : view.titleKo} ({view.widthMm}×{view.heightMm}mm)
              </text>
              {view.lines.slice(0, 160).map((ln, lIdx) => (
                <line key={lIdx} x1={ox + ln.x1} y1={oy + ln.y1} x2={ox + ln.x2} y2={oy + ln.y2} stroke={ln.kind === "silhouette" ? SVG_INK : SVG_CREASE} strokeWidth={ln.kind === "silhouette" ? "1.3" : "0.75"} strokeLinecap="round" />
              ))}
            </g>
          );
        })}
        <text x="14" y="321" fontSize="8.5" fontFamily="monospace" fill={SVG_INK}>{`${spec.toleranceClass} | ${spec.presetId} | KilnExport`}</text>
      </svg>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {spec.gdtCallouts.map((c) => (
          <div key={c.id} className="rounded-lg border border-line bg-card px-3 py-2 text-xs">
            <div className="font-semibold text-fg [word-break:keep-all]">{c.symbol} {isEn ? c.labelEn : c.labelKo}</div>
            <div className="mt-0.5 font-mono text-fg-2 tabular-nums">
              {c.nominalMm > 0 ? `${c.nominalMm.toFixed(1)}mm ` : ""}±{c.toleranceMm.toFixed(2)}mm | [{c.datum}]
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** AtelierSolid Pro 실측 수밀 B-Rep CAD·어셈블리·KilnExport·웹툰 LT 선화 스튜디오 패널. */
export function StudioAtelierSolidCadProPanel(props: StudioAtelierSolidCadProPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const initialPreset = props.initialPresetId ?? "rofan-arch-balcony";
  const [params, setParams] = useState<AtelierSolidParams>(() => createDefaultAtelierSolidParams(initialPreset));
  const [viewMode, setViewMode] = useState<AtelierSolidViewMode>(props.initialViewMode ?? "isometric");
  const [yawDeg, setYawDeg] = useState(34);
  const [pitchDeg, setPitchDeg] = useState(22);
  const [creaseAngleDeg, setCreaseAngleDeg] = useState(30);
  const [perspectiveMode, setPerspectiveMode] = useState<PerspectiveMode>("2-point");
  const [showWireframe, setShowWireframe] = useState(false);
  const [showGdtDims, setShowGdtDims] = useState(true);
  const [showPerspectiveGuides, setShowPerspectiveGuides] = useState(true);
  const [sectionCutActive, setSectionCutActive] = useState(false);
  const [sectionCutPercent, setSectionCutPercent] = useState(55);
  const [exportPreview, setExportPreview] = useState<{ readonly kind: string; readonly summary: string; readonly text: string } | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const idPrefix = useId();

  const evaluation = useMemo(() => evaluateAtelierSolidModel(params), [params]);
  const ltPayload = useMemo(
    () => exportWebtoonLtLineartPayload(evaluation, { yawDeg, pitchDeg, creaseAngleDeg, perspectiveMode, sectionCutActive, sectionCutPercent }),
    [evaluation, yawDeg, pitchDeg, creaseAngleDeg, perspectiveMode, sectionCutActive, sectionCutPercent],
  );
  const drawingSpec = useMemo(() => exportEngineeringDrawingSvgSpec(evaluation), [evaluation]);

  const applyParams = (updater: (prev: AtelierSolidParams) => AtelierSolidParams): void => {
    setParams((prev) => {
      const next = updater(prev);
      props.onSolidChange?.(evaluateAtelierSolidModel(next));
      return next;
    });
  };

  const handleSelectPreset = (presetId: AtelierSolidPresetId): void => {
    const next = createDefaultAtelierSolidParams(presetId);
    setParams(next); setExportPreview(null); setStatusNote(null);
    props.onSolidChange?.(evaluateAtelierSolidModel(next));
  };

  const handleSelectView = (tab: (typeof VIEW_TABS)[number]): void => {
    setViewMode(tab.id);
    if (tab.id !== "drawing") { setYawDeg(tab.yaw); setPitchDeg(tab.pitch); }
  };

  const handleToggleFeature = (kind: SolidFeatureKind): void => {
    applyParams((prev) => ({
      ...prev,
      suppressedFeatures: prev.suppressedFeatures.includes(kind)
        ? prev.suppressedFeatures.filter((k) => k !== kind)
        : [...prev.suppressedFeatures, kind],
    }));
  };

  const handleReset = (): void => {
    const next = createDefaultAtelierSolidParams(initialPreset);
    setParams(next); setViewMode(props.initialViewMode ?? "isometric");
    setYawDeg(34); setPitchDeg(22); setCreaseAngleDeg(30); setPerspectiveMode("2-point");
    setSectionCutActive(false); setSectionCutPercent(55); setExportPreview(null); setStatusNote(null);
    props.onSolidChange?.(evaluateAtelierSolidModel(next));
  };

  const handleExportStl = async (): Promise<void> => {
    const buf = exportBinaryStlBuffer(evaluation.mesh, evaluation.preset.id);
    await props.onExportStl?.(buf, evaluation);
    const header = new TextDecoder("utf-8").decode(buf.subarray(0, 64)).replace(/\0+$/u, "");
    const summary = isEn
      ? `Binary STL ready: ${buf.byteLength} bytes (${evaluation.mesh.triangleCount} triangles, 84 + 50×F)`
      : `Binary STL 생성 완료: ${buf.byteLength} bytes (${evaluation.mesh.triangleCount}개 삼각형, 84 + 50×F)`;
    setExportPreview({ kind: "STL", summary, text: `${header}\nTriangles: ${evaluation.mesh.triangleCount}\nByteLength: ${buf.byteLength}\nWatertight: ${evaluation.topology.watertight}` });
    setStatusNote(summary);
  };

  const handleExportStep = async (): Promise<void> => {
    const step = exportStepAp214Ascii(evaluation);
    await props.onExportStep?.(step, evaluation);
    await copyText(step);
    const summary = isEn ? `STEP AP214 ASCII generated (${step.length} chars, ISO-10303-21)` : `STEP AP214 ASCII 생성 완료 (${step.length}자, ISO-10303-21)`;
    setExportPreview({ kind: "STEP", summary, text: step.split("\n").slice(0, 22).join("\n") });
    setStatusNote(summary);
  };

  const handleSendLt = async (): Promise<void> => {
    await props.onSendToWebtoonLt?.(ltPayload, evaluation);
    const json = JSON.stringify({ schema: ltPayload.schema, bridgeTarget: ltPayload.bridgeTarget, presetId: ltPayload.presetId, perspectiveMode: ltPayload.perspectiveMode, creaseAngleDeg: ltPayload.creaseAngleDeg, summary: ltPayload.summary, vanishingPoints: ltPayload.vanishingPoints }, null, 2);
    await copyText(json);
    const summary = isEn
      ? `Sent to AtelierStage 2D LT: ${ltPayload.summary.silhouetteCount} silhouettes · ${ltPayload.summary.creaseCount} creases`
      : `AtelierStage 2D LT 전송 완료: 실루엣 ${ltPayload.summary.silhouetteCount}선 · 주름각 ${ltPayload.summary.creaseCount}선`;
    setExportPreview({ kind: "LT", summary, text: json });
    setStatusNote(summary);
  };

  return (
    <section
      data-testid="atelier-solid-cad-pro-panel"
      aria-label={isEn ? "AtelierSolid Pro Manifold B-Rep CAD Workbench" : "AtelierSolid Pro 실측 수밀 B-Rep CAD 워크벤치"}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-fg [word-break:keep-all]">
              {isEn ? "AtelierSolid Pro — Manifold B-Rep CAD & Webtoon LT" : "AtelierSolid Pro — 실측 수밀 B-Rep CAD · 웹툰 LT 선화"}
            </h2>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {isEn
              ? "Half-Edge watertight solid modeling, assembly clash checks, KilnExport STEP/STL, and 1-click AtelierStage 2D LT extraction."
              : "Half-Edge 수밀 매니폴드 직접 모델링·어셈블리 간섭 검사·KilnExport STEP/STL·AtelierStage 1-클릭 2D LT 선화 브리지."}
          </p>
        </div>
        <button type="button" data-testid="atelier-solid-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>{isEn ? "Reset" : "초기화"}</span>
        </button>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label={isEn ? "CAD Presets" : "실전 CAD 프리셋"}>
        {ATELIER_SOLID_PRESETS.map((preset) => {
          const active = preset.id === evaluation.preset.id;
          return (
            <button key={preset.id} type="button" data-testid={`atelier-solid-preset-${preset.id}`} aria-pressed={active} onClick={() => handleSelectPreset(preset.id)} className={active ? BTN_ACTIVE : BTN_OUTLINE}>
              <span>{isEn ? preset.nameEn : preset.nameKo}</span>
            </button>
          );
        })}
      </div>

      {/* Live Half-Edge Watertightness & Assembly Telemetry */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div data-testid="atelier-solid-watertight-badge" className={`rounded-xl border px-3 py-2 text-xs ${evaluation.topology.watertight ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad"}`}>
          <div className="flex items-center gap-1.5 font-bold">
            {evaluation.topology.watertight ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4" aria-hidden="true" />}
            <span>{evaluation.topology.watertight ? (isEn ? "Half-Edge Watertight PASS" : "Half-Edge 수밀 PASS") : (isEn ? "Topology Check FAIL" : "수밀 위상 FAIL")}</span>
          </div>
          <div className="mt-1 font-mono text-[11px] tabular-nums">
            nonManifold={evaluation.topology.nonManifoldEdges} · loose={evaluation.topology.looseVertices} · degen={evaluation.topology.degenerateFaces}
          </div>
        </div>
        <div data-testid="atelier-solid-floor-badge" className={`rounded-xl border px-3 py-2 text-xs ${evaluation.topology.floorGroundedY0 ? "border-good bg-good-soft text-good" : "border-warn bg-warning-soft text-warn"}`}>
          <div className="font-bold [word-break:keep-all]">{isEn ? "Floor Grounding (1.0=1m)" : "바닥 자동 접지 (1.0=1m)"}</div>
          <div className="mt-1 font-mono text-[11px] tabular-nums">minY={evaluation.topology.minYMeters.toFixed(3)}m · Y0={String(evaluation.topology.floorGroundedY0)}</div>
        </div>
        <div data-testid="atelier-solid-euler-readout" className="rounded-xl border border-line bg-card px-3 py-2 text-xs">
          <div className="font-bold text-fg [word-break:keep-all]">{isEn ? "Euler & Solid Volume" : "오일러 지표 · 실측 체적"}</div>
          <div className="mt-1 font-mono text-[11px] text-fg-2 tabular-nums">χ={evaluation.topology.eulerCharacteristic} (g={evaluation.topology.genus}, C={evaluation.topology.componentCount}) · {evaluation.topology.signedVolumeCm3} cm³</div>
        </div>
        <div data-testid="atelier-solid-assembly-badge" className={`rounded-xl border px-3 py-2 text-xs ${evaluation.assembly.hasInterference ? "border-bad bg-bad-soft text-bad" : "border-good bg-good-soft text-good"}`}>
          <div className="flex items-center gap-1.5 font-bold [word-break:keep-all]">
            {evaluation.assembly.hasInterference ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            <span>{isEn ? evaluation.assembly.matedPartNameEn : evaluation.assembly.matedPartNameKo}</span>
          </div>
          <div className="mt-1 font-mono text-[11px] tabular-nums">
            {evaluation.assembly.hasInterference
              ? (isEn ? `CLASH ${evaluation.assembly.interferenceMm}mm` : `간섭 충돌 ${evaluation.assembly.interferenceMm}mm`)
              : (isEn ? `Clearance +${evaluation.assembly.clearanceMm}mm` : `간섭 없음 · 여유 +${evaluation.assembly.clearanceMm}mm`)}
          </div>
        </div>
      </div>

      {evaluation.guardViolations.length > 0 ? (
        <div data-testid="atelier-solid-guard-banner" role="alert" className="rounded-xl border border-bad bg-bad-soft px-3.5 py-2.5 text-xs text-bad">
          <div className="flex items-center gap-1.5 font-bold [word-break:keep-all]">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            <span>{isEn ? "Fail-Closed Geometry Guard Active" : "자기교차 방지 Fail-Closed 가드 작동"}</span>
          </div>
          <ul className="mt-1 space-y-0.5 [word-break:keep-all]">
            {evaluation.guardViolations.map((v) => <li key={v.kind}>{isEn ? v.guardReasonEn : v.guardReasonKo}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-7">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={isEn ? "Viewport modes" : "뷰포트 모드"}>
            {VIEW_TABS.map((tab) => (
              <button key={tab.id} type="button" role="tab" aria-selected={viewMode === tab.id} data-testid={`atelier-solid-view-${tab.id}`} onClick={() => handleSelectView(tab)} className={viewMode === tab.id ? BTN_ACTIVE : BTN_OUTLINE}>
                <span>{isEn ? tab.en : tab.ko}</span>
              </button>
            ))}
          </div>

          {viewMode === "drawing" ? (
            <EngineeringDrawingSvgView spec={drawingSpec} isEn={isEn} />
          ) : (
            <Solid3dViewportSvg
              evaluation={evaluation} ltPayload={ltPayload} viewMode={viewMode} yawDeg={yawDeg} pitchDeg={pitchDeg}
              showWireframe={showWireframe} showGdtDims={showGdtDims} showPerspectiveGuides={showPerspectiveGuides}
              sectionCutActive={sectionCutActive} sectionCutPercent={sectionCutPercent} isEn={isEn}
            />
          )}

          <div className="space-y-3 rounded-xl border border-line bg-card p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><label htmlFor={`${idPrefix}-yaw`} className="font-medium text-fg [word-break:keep-all]">{isEn ? "Orbit Yaw" : "수평 회전 (Yaw)"}</label><span className="font-mono text-fg-2 tabular-nums">{yawDeg}°</span></div>
                <input id={`${idPrefix}-yaw`} data-testid="atelier-solid-yaw-slider" type="range" min={-180} max={180} step={2} value={yawDeg} onChange={(e) => setYawDeg(Number(e.target.value))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><label htmlFor={`${idPrefix}-pitch`} className="font-medium text-fg [word-break:keep-all]">{isEn ? "Orbit Pitch" : "상하 회전 (Pitch)"}</label><span className="font-mono text-fg-2 tabular-nums">{pitchDeg}°</span></div>
                <input id={`${idPrefix}-pitch`} data-testid="atelier-solid-pitch-slider" type="range" min={-75} max={75} step={2} value={pitchDeg} onChange={(e) => setPitchDeg(Number(e.target.value))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><label htmlFor={`${idPrefix}-crease`} className="font-medium text-fg [word-break:keep-all]">{isEn ? "LT Crease Angle" : "LT 주름각 임계"}</label><span className="font-mono text-fg-2 tabular-nums">{creaseAngleDeg}°</span></div>
                <input id={`${idPrefix}-crease`} data-testid="atelier-solid-crease-slider" type="range" min={15} max={65} step={1} value={creaseAngleDeg} onChange={(e) => setCreaseAngleDeg(Number(e.target.value))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-testid="atelier-solid-section-toggle" aria-pressed={sectionCutActive} onClick={() => setSectionCutActive((v) => !v)} className={sectionCutActive ? BTN_ACTIVE : BTN_OUTLINE}>
                <Scissors className="h-3.5 w-3.5" aria-hidden="true" /><span>{isEn ? "Section Cutaway" : "단면 절단"}</span>
              </button>
              <button type="button" data-testid="atelier-solid-wireframe-toggle" aria-pressed={showWireframe} onClick={() => setShowWireframe((v) => !v)} className={showWireframe ? BTN_ACTIVE : BTN_OUTLINE}>
                <Eye className="h-3.5 w-3.5" aria-hidden="true" /><span>{isEn ? "Wireframe" : "와이어프레임"}</span>
              </button>
              <button type="button" data-testid="atelier-solid-gdt-toggle" aria-pressed={showGdtDims} onClick={() => setShowGdtDims((v) => !v)} className={showGdtDims ? BTN_ACTIVE : BTN_OUTLINE}>
                <Ruler className="h-3.5 w-3.5" aria-hidden="true" /><span>{isEn ? "GD&T Dims" : "GD&T 치수선"}</span>
              </button>
              <button type="button" data-testid="atelier-solid-guides-toggle" aria-pressed={showPerspectiveGuides} onClick={() => setShowPerspectiveGuides((v) => !v)} className={showPerspectiveGuides ? BTN_ACTIVE : BTN_OUTLINE}>
                <PenTool className="h-3.5 w-3.5" aria-hidden="true" /><span>{isEn ? "VP Guides" : "소실점 가이드"}</span>
              </button>
              <button type="button" data-testid="atelier-solid-perspective-toggle" aria-pressed={perspectiveMode === "3-point"} onClick={() => setPerspectiveMode((m) => (m === "2-point" ? "3-point" : "2-point"))} className={BTN_OUTLINE}>
                <span>{perspectiveMode === "2-point" ? (isEn ? "2-Point VP" : "2점 투시") : (isEn ? "3-Point VP" : "3점 투시")}</span>
              </button>
              <span data-testid="atelier-solid-regen-hash" className="ml-auto font-mono text-[11px] text-fg-3 tabular-nums">{evaluation.regenHash}</span>
            </div>

            {sectionCutActive ? (
              <div className="space-y-1 border-t border-line pt-2">
                <div className="flex justify-between text-xs"><label htmlFor={`${idPrefix}-sec`} className="font-medium text-fg [word-break:keep-all]">{isEn ? "Section Plane Position" : "단면 절단 위치"}</label><span className="font-mono text-fg-2 tabular-nums">{sectionCutPercent}%</span></div>
                <input id={`${idPrefix}-sec`} data-testid="atelier-solid-section-slider" type="range" min={15} max={85} step={5} value={sectionCutPercent} onChange={(e) => setSectionCutPercent(Number(e.target.value))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 xl:col-span-5">
          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
              <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
              <span>{isEn ? "Direct Modeling & Assembly Parameters" : "직접 모델링 · 어셈블리 파라미터"}</span>
            </div>
            {MODEL_SLIDERS.map((s) => {
              const value = params[s.key], inputId = `${idPrefix}-${s.key}`;
              return (
                <div key={s.key} className="space-y-1">
                  <div className="flex justify-between gap-2 text-xs">
                    <label htmlFor={inputId} className="font-medium text-fg [word-break:keep-all]">{isEn ? s.en : s.ko}</label>
                    <span className="font-mono font-semibold text-fg-2 tabular-nums">{s.fmt(value)}</span>
                  </div>
                  <input id={inputId} data-testid={`atelier-solid-slider-${s.key}`} type="range" min={s.min} max={s.max} step={s.step} value={value} onChange={(e) => applyParams((prev) => ({ ...prev, [s.key]: Number(e.target.value) }))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
                </div>
              );
            })}

            <div className="grid grid-cols-1 gap-2 border-t border-line pt-2 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{isEn ? "Pattern Mode" : "패턴 배열"}</div>
                <div className="flex flex-wrap gap-1">
                  {PATTERN_MODES.map((m) => (
                    <button key={m.id} type="button" data-testid={`atelier-solid-pattern-${m.id}`} aria-pressed={params.patternMode === m.id} onClick={() => applyParams((p) => ({ ...p, patternMode: m.id, patternCount: m.id === "none" ? 1 : Math.max(2, p.patternCount) }))} className={params.patternMode === m.id ? BTN_ACTIVE : BTN_OUTLINE}>
                      {isEn ? m.en : m.ko}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{isEn ? "Assembly Mate" : "어셈블리 메이트"}</div>
                <div className="flex flex-wrap gap-1">
                  {MATE_MODES.map((m) => (
                    <button key={m.id} type="button" data-testid={`atelier-solid-mate-${m.id}`} aria-pressed={params.mateMode === m.id} onClick={() => applyParams((p) => ({ ...p, mateMode: m.id }))} className={params.mateMode === m.id ? BTN_ACTIVE : BTN_OUTLINE}>
                      {isEn ? m.en : m.ko}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-bold text-fg [word-break:keep-all]">
                <Layers className="h-4 w-4 text-accent" aria-hidden="true" />{isEn ? "10-Op B-Rep Feature Tree" : "10종 B-Rep 피처 연산 트리"}
              </span>
              <span className="font-mono text-[11px] text-fg-3 tabular-nums">{evaluation.features.filter((f) => f.status === "ok").length}/10 OK</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {evaluation.features.map((feat) => (
                <button key={feat.kind} type="button" data-testid={`atelier-solid-feature-${feat.kind}`} aria-pressed={feat.status !== "suppressed"} onClick={() => handleToggleFeature(feat.kind)} className={`${BTN_BASE} justify-between text-left ${featureBadgeTone(feat.status)}`}>
                  <span className="truncate">{isEn ? feat.labelEn : feat.labelKo}</span>
                  <span className="font-mono text-[11px] tabular-nums">{feat.valueSummary}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="space-y-2.5 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="atelier-solid-export-stl-btn" onClick={() => { void handleExportStl(); }} className={BTN_SOLID}>
            <Download className="h-4 w-4" aria-hidden="true" /><span>{isEn ? "Export Binary STL" : "Binary STL 내보내기"}</span>
          </button>
          <button type="button" data-testid="atelier-solid-export-step-btn" onClick={() => { void handleExportStep(); }} className={BTN_OUTLINE}>
            <FileCode2 className="h-4 w-4" aria-hidden="true" /><span>{isEn ? "Export STEP AP214" : "STEP AP214 내보내기"}</span>
          </button>
          <button type="button" data-testid="atelier-solid-export-lt-btn" onClick={() => { void handleSendLt(); }} className={BTN_ACTIVE}>
            <Copy className="h-4 w-4" aria-hidden="true" /><span>{isEn ? "1-Click Webtoon 2D LT Bridge" : "1-클릭 웹툰 2D LT 선화 전송"}</span>
          </button>
          {statusNote ? <span data-testid="atelier-solid-export-status" role="status" className="text-xs font-medium text-fg-2 [word-break:keep-all] tabular-nums">{statusNote}</span> : null}
        </div>
        {exportPreview ? (
          <pre data-testid="atelier-solid-export-preview" data-export-kind={exportPreview.kind} className="max-h-36 overflow-auto rounded-lg border border-line bg-raised p-2.5 font-mono text-[11px] text-fg-2 tabular-nums">
            {exportPreview.text}
          </pre>
        ) : null}
      </footer>
    </section>
  );
}
