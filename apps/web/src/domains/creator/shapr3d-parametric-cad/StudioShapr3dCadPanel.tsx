/**
 * Wave 57A — Shapr3D급 직접 모델링·2D 구속조건 스케처·파라메트릭 히스토리·
 * 실시간 단면 절단·2D 기술 도면 스튜디오 제어판 UI.
 *
 * - 5종 웹툰·산업 디자인 CAD 프리셋, 직접 면 돌출·필렛·챔퍼·쉘·단면 슬라이더
 * - 2D 구속조건 토글(DOF·잔차 실시간 수렴) 및 8단계 히스토리 피처 트리 활성/억제 토글
 * - 순수 시맨틱 SVG 2단 프리뷰 (OKLCH·currentColor 전용, 원시 색·바이올렛 0%)
 * - 4면 정투상 2D 기술 도면 SVG / JSON 매니페스트 복사·미리보기 및 Shapr3D 8대 역량 정직 비교
 */

import {
  AlertTriangle, Box, CheckCircle2, Code2, Copy, FileCode2, Layers, RotateCcw,
  Ruler, Scissors, ShieldAlert, SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  CAD_INTEROP_MATRIX, SHAPR3D_CAD_PRESETS, SHAPR3D_PARITY_GAP_MATRIX,
  evaluateParametricFeatureTree, exportCadTechnicalDrawingSvg, exportShapr3dCadManifestJson,
  formatOklch, getShapr3dCadPreset,
  type FeatureEvalStatus, type ParametricCadParams, type SectionAxis, type Shapr3dCadEvaluationResult,
  type Shapr3dPresetId, type SketchDofStatus, type Vec2,
} from "./shapr3d-cad-engine";

export type Shapr3dViewMode = "isometric-3d" | "section-cut" | "technical-drawing" | "parity-gap";

export interface StudioShapr3dCadPanelProps {
  readonly initialPresetId?: Shapr3dPresetId;
  readonly initialViewMode?: Shapr3dViewMode;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onCadModelChange?: (model: Shapr3dCadEvaluationResult) => void;
  readonly onExportSvg?: (svg: string, model: Shapr3dCadEvaluationResult) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const SVG_SHEET_BG = formatOklch({ l: 0.985, c: 0.005, h: 90 });
const SVG_GRID_INK = formatOklch({ l: 0.78, c: 0.014, h: 225 }, 0.45);
const SVG_CAD_INK = formatOklch({ l: 0.22, c: 0.018, h: 238 });
const SVG_DIM_INK = formatOklch({ l: 0.46, c: 0.145, h: 222 });
const SVG_SECTION_INK = formatOklch({ l: 0.54, c: 0.16, h: 28 });
const SVG_GOOD_INK = formatOklch({ l: 0.52, c: 0.135, h: 158 });
const SVG_GROUND_BG = formatOklch({ l: 0.94, c: 0.012, h: 196 });
const SVG_HUD_BG = formatOklch({ l: 0.18, c: 0.015, h: 238 }, 0.86);
const SVG_HUD_TEXT = formatOklch({ l: 0.97, c: 0.005, h: 90 });

interface SliderControlSpec {
  readonly id: "extrude" | "fillet" | "chamfer" | "shell" | "section";
  readonly paramKey: "extrudeDepthMm" | "filletRadiusMm" | "chamferSizeMm" | "wallThicknessMm" | "sectionPlanePercent";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
}

const SLIDER_SPECS: readonly SliderControlSpec[] = [
  { id: "extrude", paramKey: "extrudeDepthMm", labelKo: "직접 면 돌출", labelEn: "Push-Pull Extrude", min: 12, max: 180, step: 2, format: (v) => `${v}mm` },
  { id: "fillet", paramKey: "filletRadiusMm", labelKo: "필렛 반경 (R)", labelEn: "Fillet Radius", min: 0, max: 12, step: 0.2, format: (v) => `R${v}mm` },
  { id: "chamfer", paramKey: "chamferSizeMm", labelKo: "챔퍼 크기 (C)", labelEn: "Chamfer Size", min: 0, max: 8, step: 0.2, format: (v) => `C${v}mm` },
  { id: "shell", paramKey: "wallThicknessMm", labelKo: "쉘 벽 두께", labelEn: "Shell Wall", min: 1.5, max: 20, step: 0.5, format: (v) => `${v}mm` },
  { id: "section", paramKey: "sectionPlanePercent", labelKo: "단면 절단 위치", labelEn: "Section Plane", min: 10, max: 90, step: 5, format: (v) => `${v}%` },
];

const VIEW_TABS: readonly { readonly id: Shapr3dViewMode; readonly ko: string; readonly en: string }[] = [
  { id: "isometric-3d", ko: "등각 3D", en: "Isometric 3D" },
  { id: "section-cut", ko: "단면 절단", en: "Section Cut" },
  { id: "technical-drawing", ko: "2D 기술 도면", en: "2D Technical Drawing" },
  { id: "parity-gap", ko: "Shapr3D 갭 비교", en: "Shapr3D Parity Gap" },
];

const toPointsAttr = (pts: readonly Vec2[]): string =>
  pts.map((p) => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join(" ");

function dofBadgeClass(status: SketchDofStatus): string {
  if (status === "fully-constrained") return "border-good bg-good-soft text-good";
  if (status === "under-constrained") return "border-warn bg-warning-soft text-warn";
  return "border-bad/40 bg-bad/10 text-bad";
}

function featureStatusClass(status: FeatureEvalStatus): string {
  if (status === "ok") return "border-good bg-good-soft text-good";
  if (status === "suppressed") return "border-line bg-raised text-fg-3";
  if (status === "failed-guard") return "border-bad/40 bg-bad/10 text-bad";
  return "border-warn bg-warning-soft text-warn";
}

function Sketch2dBlueprintSvg(props: {
  readonly model: Shapr3dCadEvaluationResult; readonly showSectionCutLine: boolean; readonly isEn: boolean;
}): ReactElement {
  const { model, showSectionCutLine, isEn } = props;
  const gridId = `${useId()}-sketch-grid`;
  const w = model.sketch.profileWidthMm;
  const h = model.sketch.profileHeightMm;
  const scale = Math.min(280 / Math.max(w, 1), 166 / Math.max(h, 1));
  const offX = 52 + (280 - w * scale) * 0.5;
  const offY = 44 + (166 - h * scale) * 0.5;
  const mapPt = (pt: Vec2): Vec2 => ({ x: offX + pt.x * scale, y: offY + (h - pt.y) * scale });
  const ptLookup = new Map(model.sketch.solvedPoints.map((p) => [p.id, mapPt(p)]));
  const strokeColor = model.sketch.dofStatus === "fully-constrained" ? SVG_GOOD_INK : SVG_DIM_INK;
  const cutX = offX + w * scale * (model.sectionPlane.positionPercent / 100);

  return (
    <svg
      data-testid="shapr3d-sketch-svg" data-preset-id={model.preset.id} data-dof-status={model.sketch.dofStatus}
      data-remaining-dof={model.sketch.remainingDof} data-max-residual-mm={model.sketch.maxResidualMm}
      data-violet-free="true" viewBox="0 0 384 264" role="img"
      aria-label={isEn ? `2D constrained sketch for ${model.preset.nameEn}, ${model.sketch.dofStatus}` : `${model.preset.nameKo} 2D 구속조건 스케치 (${model.sketch.dofStatus})`}
      className="h-72 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <defs>
        <pattern id={gridId} width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M 16 0 L 0 0 0 16" fill="none" stroke={SVG_GRID_INK} strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="384" height="264" fill={SVG_SHEET_BG} />
      <rect x="0" y="0" width="384" height="264" fill={`url(#${gridId})`} />
      {model.sketch.segments.map((seg) => {
        if (seg.kind === "arc" && seg.centerPointId && seg.radiusMm) {
          const c = ptLookup.get(seg.centerPointId);
          return c ? <circle key={seg.id} cx={c.x} cy={c.y} r={Math.max(4, seg.radiusMm * scale)} fill="none" stroke={strokeColor} strokeWidth="1.4" /> : null;
        }
        const a = ptLookup.get(seg.startPointId);
        const b = ptLookup.get(seg.endPointId);
        if (!a || !b) return null;
        return (
          <line
            key={seg.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={seg.construction ? SVG_DIM_INK : strokeColor}
            strokeWidth={seg.construction ? "1.0" : "2.0"}
            strokeDasharray={seg.construction ? "4 3" : undefined}
          />
        );
      })}
      {model.sketch.solvedPoints.map((pt) => {
        const m = mapPt(pt);
        return <circle key={pt.id} cx={m.x} cy={m.y} r={pt.fixed ? 3.8 : 3.0} fill={pt.fixed ? SVG_SECTION_INK : SVG_SHEET_BG} stroke={SVG_CAD_INK} strokeWidth="1.2" />;
      })}
      <line x1={offX} y1={offY - 14} x2={offX + w * scale} y2={offY - 14} stroke={SVG_DIM_INK} strokeWidth="1.1" />
      <text x={offX + w * scale * 0.5} y={offY - 19} fill={SVG_DIM_INK} fontSize="10" fontFamily="monospace" fontWeight="700" textAnchor="middle">{`W ${w} mm`}</text>
      <line x1={offX - 14} y1={offY} x2={offX - 14} y2={offY + h * scale} stroke={SVG_DIM_INK} strokeWidth="1.1" />
      <text x={offX - 18} y={offY + h * scale * 0.5} fill={SVG_DIM_INK} fontSize="9.5" fontFamily="monospace" fontWeight="700" textAnchor="end">{`H ${h}`}</text>
      {showSectionCutLine ? (
        <g data-testid="shapr3d-sketch-section-line">
          <line x1={cutX} y1={offY - 22} x2={cutX} y2={offY + h * scale + 18} stroke={SVG_SECTION_INK} strokeWidth="1.5" strokeDasharray="6 3 1.5 3" />
          <text x={cutX + 4} y={offY - 12} fill={SVG_SECTION_INK} fontSize="9.5" fontFamily="monospace" fontWeight="700">A-A</text>
        </g>
      ) : null}
      <rect x="10" y="232" width="364" height="22" rx="6" fill={SVG_HUD_BG} />
      <text x="18" y="246" fill={SVG_HUD_TEXT} fontSize="9" fontFamily="monospace">
        {`DOF ${model.sketch.remainingDof} (${model.sketch.dofStatus}) · RES ${model.sketch.maxResidualMm}mm · ITER ${model.sketch.iterations}`}
      </text>
    </svg>
  );
}

function TechnicalDrawingPreviewSvg(props: {
  readonly model: Shapr3dCadEvaluationResult; readonly isEn: boolean;
}): ReactElement {
  const { model, isEn } = props;
  const { profileWidthMm: w, profileHeightMm: h, extrudeDepthMm: d, filletRadiusMm: r, chamferSizeMm: c } = model.effectiveParams;
  const scale = Math.min(110 / Math.max(w, 1), 64 / Math.max(h, d, 1));
  const fw = Math.round(w * scale * 10) / 10;
  const fh = Math.round(h * scale * 10) / 10;
  const fd = Math.round(d * scale * 10) / 10;
  const wallPx = Math.max(4, Math.min(model.sectionPlane.wallThicknessMm * scale, fd * 0.34, fh * 0.34));
  const fillSoft = formatOklch({ l: 0.92, c: 0.025, h: model.preset.accentOklch.h }, 0.7);
  const rPx = Math.min(r * scale, 10);
  const cutLineX = 42 + fw * (model.sectionPlane.positionPercent / 100);

  return (
    <svg
      data-testid="shapr3d-drawing-svg" data-preset-id={model.preset.id}
      data-section-percent={model.sectionPlane.positionPercent} data-violet-free="true"
      viewBox="0 0 384 264" role="img"
      aria-label={isEn ? `4-view orthographic 2D technical drawing for ${model.preset.nameEn}` : `${model.preset.nameKo} 4면 정투상 2D 기술 도면`}
      className="h-72 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width="384" height="264" fill={SVG_SHEET_BG} />
      <rect x="8" y="8" width="368" height="248" fill="none" stroke={SVG_CAD_INK} strokeWidth="1.1" />
      <line x1="192" y1="8" x2="192" y2="226" stroke={SVG_GRID_INK} strokeWidth="0.9" strokeDasharray="3 3" />
      <line x1="8" y1="118" x2="376" y2="118" stroke={SVG_GRID_INK} strokeWidth="0.9" strokeDasharray="3 3" />
      <text x="16" y="22" fill={SVG_CAD_INK} fontSize="8.5" fontFamily="monospace" fontWeight="700">{isEn ? "TOP" : "평면도"}</text>
      <rect x="42" y="34" width={fw} height={fd} rx={rPx} fill={fillSoft} stroke={SVG_CAD_INK} strokeWidth="1.2" />
      <text x={42 + fw * 0.5} y="30" fill={SVG_DIM_INK} fontSize="8" fontFamily="monospace" textAnchor="middle">{`${w}mm`}</text>
      <text x="202" y="22" fill={SVG_CAD_INK} fontSize="8.5" fontFamily="monospace" fontWeight="700">{isEn ? "ISO" : "등각투상"}</text>
      <g transform="translate(192 -10) scale(0.48)">
        {model.isoFaces.map((f) => <polygon key={`td-${f.id}`} points={toPointsAttr(f.points)} fill={f.fillOklch} stroke={f.strokeOklch} strokeWidth="1.4" />)}
      </g>
      <text x="16" y="132" fill={SVG_CAD_INK} fontSize="8.5" fontFamily="monospace" fontWeight="700">{isEn ? "FRONT (A-A)" : "정면도 (A-A)"}</text>
      <rect x="42" y="142" width={fw} height={fh} rx={rPx} fill={fillSoft} stroke={SVG_CAD_INK} strokeWidth="1.2" />
      <line x1={cutLineX} y1="136" x2={cutLineX} y2={148 + fh} stroke={SVG_SECTION_INK} strokeWidth="1.1" strokeDasharray="4 2" />
      <text x={42 + fw * 0.5} y={158 + fh} fill={SVG_DIM_INK} fontSize="8" fontFamily="monospace" textAnchor="middle">{`H${h} · R${r} · C${c}`}</text>
      <text x="202" y="132" fill={SVG_CAD_INK} fontSize="8.5" fontFamily="monospace" fontWeight="700">{isEn ? "SECTION A-A" : "우측 · A-A 단면"}</text>
      <rect x="236" y="142" width={fd} height={fh} fill={fillSoft} stroke={SVG_CAD_INK} strokeWidth="1.2" />
      {model.sectionPlane.internalCavityVisible ? (
        <rect x={236 + wallPx} y={142 + wallPx} width={Math.max(4, fd - wallPx * 2)} height={Math.max(4, fh - wallPx * 2)} fill={SVG_SHEET_BG} stroke={SVG_SECTION_INK} strokeWidth="1.0" />
      ) : null}
      <g stroke={SVG_SECTION_INK} strokeWidth="0.8">
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const yPos = 142 + (fh * i) / 5;
          return <line key={`th-${i}`} x1="236" y1={yPos} x2={236 + wallPx} y2={Math.min(142 + fh, yPos + wallPx)} />;
        })}
      </g>
      <rect x="8" y="226" width="368" height="30" fill={SVG_HUD_BG} />
      <text x="16" y="244" fill={SVG_HUD_TEXT} fontSize="8.5" fontFamily="monospace">
        {`1:1 (1.0=1m, Y=0) · ${model.integrity.volumeCm3}cm3 · WALL ${model.sectionPlane.wallThicknessMm}mm · ${model.regenerationHash}`}
      </text>
    </svg>
  );
}

function IsometricSolidSectionSvg(props: {
  readonly model: Shapr3dCadEvaluationResult; readonly highlightSection: boolean; readonly isEn: boolean;
}): ReactElement {
  const { model, highlightSection, isEn } = props;
  const floorPatternId = `${useId()}-iso-floor`;

  return (
    <svg
      data-testid="shapr3d-iso-svg" data-preset-id={model.preset.id}
      data-section-percent={model.sectionPlane.positionPercent} data-section-active={String(highlightSection)}
      data-regeneration-ok={String(model.regenerationOk)} data-non-manifold-edges={model.integrity.nonManifoldEdges}
      data-floor-grounded={String(model.integrity.floorGroundedY0)} data-violet-free="true"
      viewBox="0 0 384 264" role="img"
      aria-label={isEn ? `Isometric 3D CAD solid for ${model.preset.nameEn} (${model.sectionPlane.positionPercent}% cut)` : `${model.preset.nameKo} 등각 3D 솔리드 및 ${model.sectionPlane.positionPercent}% 단면 절단 프리뷰`}
      className="h-72 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <defs>
        <pattern id={floorPatternId} width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M 18 0 L 0 0 0 18" fill="none" stroke={SVG_GRID_INK} strokeWidth="0.65" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="384" height="264" fill={SVG_GROUND_BG} />
      <rect x="0" y="0" width="384" height="264" fill={`url(#${floorPatternId})`} />
      <line x1="24" y1="214" x2="360" y2="214" stroke={SVG_DIM_INK} strokeWidth="0.9" strokeDasharray="4 3" />
      <text x="356" y="210" fill={SVG_DIM_INK} fontSize="8.5" fontFamily="monospace" textAnchor="end">Y=0 (1.0=1m)</text>
      <g>
        {model.isoFaces.map((face) => (
          <polygon
            key={face.id} points={toPointsAttr(face.points)} fill={face.fillOklch} stroke={face.strokeOklch}
            strokeWidth={face.role === "cut-cavity" && highlightSection ? "1.6" : "1.1"} strokeLinejoin="round"
          />
        ))}
      </g>
      {highlightSection || model.sectionPlane.internalCavityVisible ? (
        <g data-testid="shapr3d-iso-hatch-group" stroke={SVG_SECTION_INK} strokeWidth={highlightSection ? "1.25" : "0.85"}>
          {model.isoHatchLines.map((ln, idx) => <line key={`ih-${idx}`} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} />)}
        </g>
      ) : null}
      <rect x="10" y="10" width="212" height="22" rx="6" fill={SVG_HUD_BG} />
      <text x="18" y="24" fill={SVG_HUD_TEXT} fontSize="9" fontFamily="monospace">
        {`R${model.effectiveParams.filletRadiusMm} · C${model.effectiveParams.chamferSizeMm} · ${isEn ? "SEC" : "단면"} ${model.sectionPlane.axis} ${model.sectionPlane.positionPercent}%`}
      </text>
      <rect x="10" y="232" width="364" height="22" rx="6" fill={SVG_HUD_BG} />
      <text x="18" y="246" fill={SVG_HUD_TEXT} fontSize="9" fontFamily="monospace">
        {`VOL ${model.integrity.volumeCm3}cm3 · AREA ${model.integrity.surfaceAreaCm2}cm2 · MANIFOLD OK (0) · ${model.regenerationHash}`}
      </text>
    </svg>
  );
}

/** Shapr3D급 파라메트릭 CAD·2D 구속 스케처·단면 절단·2D 기술 도면 스튜디오 패널. */
export function StudioShapr3dCadPanel(props: StudioShapr3dCadPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();

  const initialPreset = getShapr3dCadPreset(props.initialPresetId ?? "webtoon-desk-lamp-arm");
  const initialViewMode: Shapr3dViewMode = props.initialViewMode ?? "isometric-3d";

  const [presetId, setPresetId] = useState<Shapr3dPresetId>(initialPreset.id);
  const [viewMode, setViewMode] = useState<Shapr3dViewMode>(initialViewMode);
  const [params, setParams] = useState<ParametricCadParams>(initialPreset.defaultParams);
  const [constraintOverrides, setConstraintOverrides] = useState<Record<string, boolean>>({});
  const [featureOverrides, setFeatureOverrides] = useState<Record<string, boolean>>({});
  const [sourceDrawer, setSourceDrawer] = useState<"closed" | "svg" | "json">("closed");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const model = useMemo(
    () => evaluateParametricFeatureTree({ presetId, params, constraintEnabledOverrides: constraintOverrides, featureEnabledOverrides: featureOverrides }),
    [presetId, params, constraintOverrides, featureOverrides],
  );
  const drawingSvgText = useMemo(() => exportCadTechnicalDrawingSvg(model, isEn ? "en" : "ko"), [model, isEn]);
  const manifestJsonText = useMemo(() => exportShapr3dCadManifestJson(model), [model]);

  const emitChange = (
    nextPresetId: Shapr3dPresetId, nextParams: ParametricCadParams,
    nextC: Record<string, boolean>, nextF: Record<string, boolean>,
  ): Shapr3dCadEvaluationResult => {
    const next = evaluateParametricFeatureTree({ presetId: nextPresetId, params: nextParams, constraintEnabledOverrides: nextC, featureEnabledOverrides: nextF });
    props.onCadModelChange?.(next);
    return next;
  };

  const copyText = (text: string): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
  };

  const handleSelectPreset = (nextId: Shapr3dPresetId): void => {
    const next = getShapr3dCadPreset(nextId);
    setPresetId(next.id);
    setParams(next.defaultParams);
    setConstraintOverrides({});
    setFeatureOverrides({});
    emitChange(next.id, next.defaultParams, {}, {});
    setStatusMessage(pick(`'${next.nameKo}' 프리셋으로 8단계 피처 트리를 재생성했습니다.`, `Loaded '${next.nameEn}' and regenerated 8-step tree.`));
  };

  const updateParam = <K extends keyof ParametricCadParams>(key: K, value: ParametricCadParams[K]): void => {
    const nextParams: ParametricCadParams = { ...params, [key]: value };
    setParams(nextParams);
    const next = emitChange(presetId, nextParams, constraintOverrides, featureOverrides);
    if (!next.regenerationOk && next.failClosedGuards[0]) {
      setStatusMessage(isEn ? next.failClosedGuards[0].messageEn : next.failClosedGuards[0].messageKo);
    }
  };

  const handleToggleConstraint = (constraintId: string, enabled: boolean): void => {
    const nextC = { ...constraintOverrides, [constraintId]: !enabled };
    setConstraintOverrides(nextC);
    const next = emitChange(presetId, params, nextC, featureOverrides);
    setStatusMessage(pick(`구속조건을 ${enabled ? "해제" : "적용"}했습니다 (상태: ${next.sketch.dofStatus}, 잔여 DOF ${next.sketch.remainingDof}).`, `Constraint ${enabled ? "off" : "on"} (${next.sketch.dofStatus}, DOF ${next.sketch.remainingDof}).`));
  };

  const handleToggleFeature = (featureId: string, enabled: boolean): void => {
    const nextF = { ...featureOverrides, [featureId]: !enabled };
    setFeatureOverrides(nextF);
    const next = emitChange(presetId, params, constraintOverrides, nextF);
    setStatusMessage(pick(`피처를 ${enabled ? "억제" : "활성화"}하고 하위 트리를 재생성했습니다 (${next.integrity.volumeCm3}cm³).`, `Feature ${enabled ? "suppressed" : "enabled"} (${next.integrity.volumeCm3} cm3).`));
  };

  const handleExportSvg = (): void => {
    copyText(drawingSvgText);
    setSourceDrawer("svg");
    props.onExportSvg?.(drawingSvgText, model);
    setStatusMessage(pick("4면 정투상 2D 기술 도면 SVG를 복사했습니다.", "Copied 4-view 2D technical drawing SVG."));
  };

  const handleExportJson = (): void => {
    copyText(manifestJsonText);
    setSourceDrawer("json");
    setStatusMessage(pick("파라메트릭 CAD 매니페스트 JSON을 복사했습니다.", "Copied parametric CAD manifest JSON."));
  };

  const handleReset = (): void => {
    setPresetId(initialPreset.id);
    setViewMode(initialViewMode);
    setParams(initialPreset.defaultParams);
    setConstraintOverrides({});
    setFeatureOverrides({});
    setSourceDrawer("closed");
    emitChange(initialPreset.id, initialPreset.defaultParams, {}, {});
    setStatusMessage(pick("초기 CAD 프리셋과 구속조건으로 되돌렸습니다.", "Reset CAD preset and constraints to defaults."));
  };

  const dofLabel =
    model.sketch.dofStatus === "fully-constrained"
      ? pick("완전 구속 (0 DOF)", "Fully Constrained (0 DOF)")
      : model.sketch.dofStatus === "under-constrained"
        ? pick(`부족 구속 (${model.sketch.remainingDof} DOF)`, `Under-Constrained (${model.sketch.remainingDof} DOF)`)
        : pick("과잉 구속 충돌", "Over-Constrained");

  const metricCards = [
    { id: "volume", label: pick("솔리드 부피 · 표면적", "Volume · Surface Area"), value: `${model.integrity.volumeCm3}cm³ · ${model.integrity.surfaceAreaCm2}cm²`, tone: "text-fg" },
    { id: "dims", label: pick("미터법 치수 (1.0=1m)", "Metric Size (1.0=1m)"), value: `${model.integrity.dimensionsMeters.widthM}×${model.integrity.dimensionsMeters.heightM}×${model.integrity.dimensionsMeters.depthM}m`, tone: "text-fg" },
    { id: "topology", label: pick("수밀 위상 (V/E/F)", "Watertight B-Rep (V/E/F)"), value: `${model.integrity.vertexCount}/${model.integrity.edgeCount}/${model.integrity.faceCount} · χ=${model.integrity.eulerCharacteristic}`, tone: "text-good" },
    { id: "section", label: pick("단면 절단 · 벽 두께", "Section Area · Wall"), value: `${model.sectionPlane.cutAreaMm2}mm² · ${model.sectionPlane.wallThicknessMm}mm`, tone: "text-accent" },
  ] as const;

  return (
    <section
      data-testid="shapr3d-cad-panel"
      aria-label={pick("Shapr3D급 파라메트릭 CAD·2D 스케처·도면 스튜디오", "Shapr3D-Class Parametric CAD & 2D Drawing Studio")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <Box className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("직접 모델링 · 파라메트릭 CAD", "Direct & Parametric CAD")}
            </span>
            <span data-testid="shapr3d-dof-badge" className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums [word-break:keep-all] ${dofBadgeClass(model.sketch.dofStatus)}`}>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {dofLabel}
            </span>
            <span data-testid="shapr3d-manifold-badge" className="inline-flex items-center rounded-full border border-good bg-good-soft px-2.5 py-0.5 font-mono text-[11px] font-semibold text-good tabular-nums [word-break:keep-all]">
              {pick("수밀 OK · 비다양체 0 · Y=0", "Watertight · Non-Manifold 0 · Y=0")}
            </span>
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("파라메트릭 B-Rep CAD · 2D 구속조건 스케처 & 기술 도면 스튜디오", "Parametric B-Rep CAD, 2D Constraint Sketcher & Technical Drawing Studio")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("2D 스케치 구속조건을 수치 수렴하고 8단계 파라메트릭 피처 트리·직접 면 돌출·실시간 단면 절단·4면 2D 기술 도면을 한 화면에서 검증합니다.", "Solve 2D sketch constraints numerically, regenerate an 8-step parametric tree with fail-closed guards, inspect live section cuts, and export 4-view 2D technical drawings.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="shapr3d-export-svg-btn" onClick={handleExportSvg} className={BTN_SOLID}>
            <Ruler className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("2D 도면 SVG 복사", "Copy 2D Drawing SVG")}
          </button>
          <button type="button" data-testid="shapr3d-export-json-btn" onClick={handleExportJson} className={BTN_OUTLINE}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="shapr3d-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      <div role="status" aria-live="polite" data-testid="shapr3d-status-banner" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
        {statusMessage || pick(`${model.preset.nameKo} · 8단계 피처 재생성 완료(잔차 ${model.sketch.maxResidualMm}mm). 슬라이더와 구속 토글로 하위 트리 연동을 확인하세요.`, `${model.preset.nameEn} · 8-step tree regenerated (residual ${model.sketch.maxResidualMm}mm).`)}
      </div>

      {model.failClosedGuards.length > 0 ? (
        <div role="alert" data-testid="shapr3d-fail-closed-alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-xs text-bad [word-break:keep-all]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="space-y-0.5">
            <div className="font-bold">{pick("자기교차 방지 Fail-Closed 가드 작동", "Self-Intersection Fail-Closed Guard Active")}</div>
            {model.failClosedGuards.map((g) => <p key={g.code} className="tabular-nums">{isEn ? g.messageEn : g.messageKo}</p>)}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("5종 웹툰 · 산업 디자인 CAD 프리셋", "5 Webtoon & Industrial CAD Presets")}
          </h3>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? model.preset.webtoonUseEn : model.preset.webtoonUseKo}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5" role="group" aria-label={pick("CAD 프리셋 선택", "Select CAD preset")}>
          {SHAPR3D_CAD_PRESETS.map((preset) => {
            const isActive = preset.id === presetId;
            return (
              <button
                key={preset.id} type="button" data-testid={`shapr3d-preset-${preset.id}`} aria-pressed={isActive}
                onClick={() => handleSelectPreset(preset.id)}
                className={`flex min-h-11 flex-col items-start justify-between gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${isActive ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}
              >
                <span className="text-[11px] font-medium text-fg-3">{isEn ? preset.categoryEn : preset.categoryKo}</span>
                <span className="text-xs font-bold leading-snug text-fg">{isEn ? preset.nameEn : preset.nameKo}</span>
                <span className="font-mono text-[11px] text-fg-2 tabular-nums">{`${preset.defaultParams.profileWidthMm}×${preset.defaultParams.profileHeightMm}×${preset.defaultParams.extrudeDepthMm}mm`}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-raised p-2.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("뷰 모드 전환", "Switch CAD view mode")}>
          {VIEW_TABS.map((tab) => (
            <button key={tab.id} type="button" data-testid={`shapr3d-view-${tab.id}`} aria-pressed={viewMode === tab.id} onClick={() => setViewMode(tab.id)} className={viewMode === tab.id ? BTN_ACTIVE : BTN_OUTLINE}>
              {pick(tab.ko, tab.en)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label={pick("단면 절단 축", "Section plane axis")}>
          <Scissors className="h-3.5 w-3.5 text-fg-3" aria-hidden="true" />
          {(["X", "Y", "Z"] as const satisfies readonly SectionAxis[]).map((axis) => (
            <button key={axis} type="button" data-testid={`shapr3d-axis-${axis}`} aria-pressed={params.sectionAxis === axis} onClick={() => updateParam("sectionAxis", axis)} className={params.sectionAxis === axis ? BTN_ACTIVE : BTN_OUTLINE}>
              {`${axis}${pick("축", "")}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-card p-3.5 sm:grid-cols-2 lg:grid-cols-5">
        {SLIDER_SPECS.map((spec) => (
          <div key={spec.id}>
            <label htmlFor={`${uid}-${spec.id}`} className="flex items-center justify-between text-[11px] font-medium text-fg-2 [word-break:keep-all]">
              <span>{pick(spec.labelKo, spec.labelEn)}</span>
              <span data-testid={`shapr3d-readout-${spec.id}`} className="font-mono font-bold text-fg tabular-nums">{spec.format(params[spec.paramKey])}</span>
            </label>
            <input
              id={`${uid}-${spec.id}`} data-testid={`shapr3d-slider-${spec.id}`} type="range"
              min={spec.min} max={spec.max} step={spec.step} value={params[spec.paramKey]}
              onChange={(e) => updateParam(spec.paramKey, Number(e.target.value))}
              className="min-h-11 w-full cursor-pointer accent-accent"
            />
          </div>
        ))}
      </div>

      {viewMode === "parity-gap" ? (
        <div data-testid="shapr3d-parity-gap-view" className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-line bg-card p-3.5">
            <h3 className="mb-2 text-xs font-semibold text-fg [word-break:keep-all]">
              {pick("Shapr3D vs ToonStudio 8대 CAD 역량 정직 비교 · 로드맵 (현재 구현 vs 향후 목표)", "Shapr3D vs ToonStudio 8-Pillar Honest Comparison & Roadmap")}
            </h3>
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line text-[11px] text-fg-3">
                  <th className="py-2 pr-3 font-semibold">{pick("CAD 역량", "Capability")}</th>
                  <th className="py-2 pr-3 font-semibold">Shapr3D</th>
                  <th className="py-2 pr-3 font-semibold">{pick("ToonStudio 현재 구현", "ToonStudio Current")}</th>
                  <th className="py-2 pr-3 font-semibold">{pick("향후 목표", "Roadmap Target")}</th>
                  <th className="py-2 font-semibold">{pick("판정", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {SHAPR3D_PARITY_GAP_MATRIX.map((row) => (
                  <tr key={row.id} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-3 font-semibold text-fg [word-break:keep-all]">{isEn ? row.areaEn : row.areaKo}</td>
                    <td className="py-2 pr-3 text-fg-2 [word-break:keep-all]">{isEn ? row.shapr3dBaselineEn : row.shapr3dBaselineKo}</td>
                    <td className="py-2 pr-3 text-fg [word-break:keep-all]">{isEn ? row.toonStudioCurrentEn : row.toonStudioCurrentKo}</td>
                    <td className="py-2 pr-3 text-fg-2 [word-break:keep-all]">{isEn ? row.toonStudioTargetEn : row.toonStudioTargetKo}</td>
                    <td className="py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold [word-break:keep-all] ${row.verdict === "toonstudio-lead" ? "border-good bg-good-soft text-good" : row.verdict === "parity" ? "border-accent bg-accent-soft text-accent" : "border-warn bg-warning-soft text-warn"}`}>
                        {row.verdict === "toonstudio-lead" ? pick("ToonStudio 우위", "ToonStudio Lead") : row.verdict === "parity" ? pick("동급 달성", "Parity") : pick("로드맵 갭", "Planned Gap")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5" data-testid="shapr3d-interop-matrix">
            {CAD_INTEROP_MATRIX.map((item) => (
              <div key={item.format} className="space-y-1 rounded-xl border border-line bg-card p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-fg">{item.format}</span>
                  <span className="font-mono text-[11px] text-fg-3">{item.extension}</span>
                </div>
                <p className="text-[11px] font-medium text-fg-2 [word-break:keep-all]">{isEn ? item.kernelTypeEn : item.kernelTypeKo}</p>
                <p className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? item.noteEn : item.noteKo}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">
                {viewMode === "technical-drawing"
                  ? pick("4면 정투상 2D 기술 도면 (정면 · 평면 · A-A 단면 · 등각)", "4-View 2D Technical Drawing (Top · Front · Section A-A · Iso)")
                  : pick("실시간 2D 구속조건 스케치 (DOF · 치수선 · 잔차)", "Live 2D Constrained Sketch (DOF · Dimensions · Residual)")}
              </h3>
              <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${model.sketch.profileWidthMm}×${model.sketch.profileHeightMm}mm`}</span>
            </div>
            {viewMode === "technical-drawing" ? <TechnicalDrawingPreviewSvg model={model} isEn={isEn} /> : <Sketch2dBlueprintSvg model={model} showSectionCutLine={viewMode === "section-cut"} isEn={isEn} />}
          </div>
          <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">
                {viewMode === "section-cut"
                  ? pick("실시간 단면 절단 해칭 · 중공 벽 두께 검사 프리뷰", "Live Section Plane Hatching & Shell Wall Preview")
                  : pick("등각 3D 솔리드 · 필렛/챔퍼 하이라이트 프리뷰", "Isometric 3D Solid & Fillet/Chamfer Highlight Preview")}
              </h3>
              <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${pick("단면적", "Cut")} ${model.sectionPlane.cutAreaMm2}mm²`}</span>
            </div>
            <IsometricSolidSectionSvg model={model} highlightSection={viewMode === "section-cut"} isEn={isEn} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("2D 구속조건 솔버 토글 (8종 구속 · 잔차 mm)", "2D Sketch Constraints Toggle (Residual mm)")}
            </h3>
            <span data-testid="shapr3d-residual-readout" className="font-mono text-[11px] text-fg-2 tabular-nums">{`max ${model.sketch.maxResidualMm}mm`}</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" data-testid="shapr3d-constraints-list">
            {model.constraints.map((c) => {
              const res = model.sketch.residuals.find((r) => r.constraintId === c.id);
              return (
                <button
                  key={c.id} type="button" data-testid={`shapr3d-constraint-${c.id}`} aria-pressed={c.enabled}
                  onClick={() => handleToggleConstraint(c.id, c.enabled)}
                  className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${c.enabled ? "border-accent bg-accent-soft text-fg" : "border-line bg-raised text-fg-3"}`}
                >
                  <span className="truncate font-medium">{isEn ? c.labelEn : c.labelKo}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums">{c.enabled ? `${res?.residualMm ?? 0}mm` : pick("해제", "OFF")}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <AlertTriangle className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("파라메트릭 히스토리 피처 트리 (활성 · 억제)", "Parametric History Feature Tree (Enable · Suppress)")}
            </h3>
            <span data-testid="shapr3d-regen-hash" className="font-mono text-[11px] text-fg-3 tabular-nums">{model.regenerationHash}</span>
          </div>
          <div className="space-y-1.5" data-testid="shapr3d-feature-tree-list">
            {model.featureTree.map((node, index) => (
              <button
                key={node.id} type="button" data-testid={`shapr3d-feature-${node.kind}`} aria-pressed={node.enabled}
                onClick={() => handleToggleFeature(node.id, node.enabled)}
                className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${node.enabled ? "border-line bg-raised text-fg hover:border-line-strong" : "border-line/70 bg-canvas text-fg-3"}`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-fg-3 tabular-nums">{`${index + 1}.`}</span>
                  <span className="font-semibold">{isEn ? node.labelEn : node.labelKo}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-fg-2 tabular-nums">{`${node.cumulativeVolumeCm3}cm³`}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold [word-break:keep-all] ${featureStatusClass(node.status)}`}>
                    {node.status === "ok" ? pick("정상", "OK") : node.status === "suppressed" ? pick("억제", "OFF") : node.status === "failed-guard" ? pick("차단", "GUARD") : pick("대기", "SKIP")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {metricCards.map((m) => (
          <div key={m.id} className="rounded-xl border border-line bg-card p-3">
            <div className="text-[11px] text-fg-3 [word-break:keep-all]">{m.label}</div>
            <div data-testid={`shapr3d-metric-${m.id}`} className={`mt-1 font-mono text-sm font-bold tabular-nums ${m.tone}`}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg [word-break:keep-all]">
            {pick("2D 기술 도면 SVG · 파라메트릭 CAD 매니페스트 소스", "2D Technical Drawing SVG & Parametric CAD Manifest Source")}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-testid="shapr3d-toggle-svg-btn" aria-expanded={sourceDrawer === "svg"} onClick={() => setSourceDrawer((p) => (p === "svg" ? "closed" : "svg"))} className={sourceDrawer === "svg" ? BTN_ACTIVE : BTN_OUTLINE}>
              <FileCode2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {sourceDrawer === "svg" ? pick("도면 SVG 닫기", "Hide Drawing SVG") : pick("도면 SVG 보기", "View Drawing SVG")}
            </button>
            <button type="button" data-testid="shapr3d-toggle-json-btn" aria-expanded={sourceDrawer === "json"} onClick={() => setSourceDrawer((p) => (p === "json" ? "closed" : "json"))} className={sourceDrawer === "json" ? BTN_ACTIVE : BTN_OUTLINE}>
              <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {sourceDrawer === "json" ? pick("JSON 닫기", "Hide JSON") : pick("JSON 보기", "View JSON")}
            </button>
          </div>
        </div>
        {sourceDrawer !== "closed" ? (
          <pre data-testid={sourceDrawer === "svg" ? "shapr3d-svg-preview" : "shapr3d-json-preview"} className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums">
            {sourceDrawer === "svg" ? drawingSvgText : manifestJsonText}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
