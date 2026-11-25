/**
 * Wave 61B — AtelierCast 해부학 연동 3D 캐릭터 커스텀 & PrismLight WebGPU 기본 3D 룩뎁 제어판.
 *
 * - 모든 props 선택적(`= {}` 기본 props 미사용), 순수 결정론적 엔진 연동
 * - 순수 시맨틱 SVG 2단 시각화 (좌: 실시간 해부학 등신 비율·Face-SDF 음영·3층 안구·케이지 클리핑 0 프리뷰,
 *   우: ToonCore WebGPU 5패스 기본 3D 파이프라인 & 품질 4축 점수 비교)
 * - OKLCH·currentColor 전용, 원시 hex/rgb/hsl 0건, 바이올렛 휴 0%
 */

import {
  AlertTriangle, CheckCircle2, Code2, Copy, Cpu, Eye, GitMerge, Layers, Palette, RotateCcw, ShieldCheck, SlidersHorizontal, User,
} from "lucide-react";
import { useId, useMemo, useRef, useState, type ReactElement } from "react";

import { copyText } from "@/shared/lib/copy-text";

import {
  ATELIER_CAST_ARCHETYPES, ATELIER_CAST_WEBGPU_LOOKDEV_WGSL, ATELIER_PARAM_BOUNDS, ATELIER_PIGMENT_PALETTES,
  buildAtelierCastSnapshot, exportAtelierCastManifestJson, formatOklch, getAtelierArchetype,
  type AtelierArchetypeId, type AtelierCastSnapshot, type AtelierCharacterParams, type AtelierPigmentId,
  type AtelierSolverMode,
} from "./atelier-cast-engine";

export interface StudioAtelierCastPanelProps {
  readonly initialArchetypeId?: AtelierArchetypeId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onCharacterChange?: (snapshot: AtelierCastSnapshot) => void;
  readonly onExportJson?: (json: string, snapshot: AtelierCastSnapshot) => void | Promise<void>;
}

interface SliderSpec {
  readonly key: keyof AtelierCharacterParams;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly formatValue: (v: number, isEn: boolean) => string;
}

const SLIDER_SPECS: readonly SliderSpec[] = [
  { key: "heightCm", labelKo: "신장 (키)", labelEn: "Height", min: ATELIER_PARAM_BOUNDS.heightCm.min, max: ATELIER_PARAM_BOUNDS.heightCm.max, step: ATELIER_PARAM_BOUNDS.heightCm.step, formatValue: (v) => `${v.toFixed(0)}cm` },
  { key: "headRatio", labelKo: "등신비 (SD 2.8 · 웹툰 6.0~8.5)", labelEn: "Head Ratio (SD 2.8 · 6.0-8.5H)", min: ATELIER_PARAM_BOUNDS.headRatio.min, max: ATELIER_PARAM_BOUNDS.headRatio.max, step: ATELIER_PARAM_BOUNDS.headRatio.step, formatValue: (v, isEn) => (isEn ? `${v.toFixed(1)}H` : `${v.toFixed(1)}등신`) },
  { key: "shoulderWidth", labelKo: "어깨 · 쇄골 폭", labelEn: "Shoulder & Clavicle", min: ATELIER_PARAM_BOUNDS.shoulderWidth.min, max: ATELIER_PARAM_BOUNDS.shoulderWidth.max, step: ATELIER_PARAM_BOUNDS.shoulderWidth.step, formatValue: (v) => `${Math.round(v * 100)}%` },
  { key: "waistRatio", labelKo: "허리 · 갈비뼈 비율", labelEn: "Waist & Ribcage", min: ATELIER_PARAM_BOUNDS.waistRatio.min, max: ATELIER_PARAM_BOUNDS.waistRatio.max, step: ATELIER_PARAM_BOUNDS.waistRatio.step, formatValue: (v) => `${Math.round(v * 100)}%` },
  { key: "jawTaper", labelKo: "턱선 샤프니스", labelEn: "Jawline Taper", min: ATELIER_PARAM_BOUNDS.jawTaper.min, max: ATELIER_PARAM_BOUNDS.jawTaper.max, step: ATELIER_PARAM_BOUNDS.jawTaper.step, formatValue: (v) => `${Math.round(v * 100)}%` },
  { key: "eyeScale", labelKo: "눈 크기 (3층 안구)", labelEn: "Eye Scale (3-Layer)", min: ATELIER_PARAM_BOUNDS.eyeScale.min, max: ATELIER_PARAM_BOUNDS.eyeScale.max, step: ATELIER_PARAM_BOUNDS.eyeScale.step, formatValue: (v) => `${Math.round(v * 100)}%` },
  { key: "eyeSpacing", labelKo: "눈 간격", labelEn: "Eye Spacing", min: ATELIER_PARAM_BOUNDS.eyeSpacing.min, max: ATELIER_PARAM_BOUNDS.eyeSpacing.max, step: ATELIER_PARAM_BOUNDS.eyeSpacing.step, formatValue: (v) => `${Math.round(v * 100)}%` },
  { key: "hairVolume", labelKo: "헤어 볼륨 · 엔젤링", labelEn: "Hair Volume & Ring", min: ATELIER_PARAM_BOUNDS.hairVolume.min, max: ATELIER_PARAM_BOUNDS.hairVolume.max, step: ATELIER_PARAM_BOUNDS.hairVolume.step, formatValue: (v) => `${Math.round(v * 100)}%` },
  { key: "outfitClearanceMm", labelKo: "의상 리핏 여유", labelEn: "Outfit Cage Clearance", min: ATELIER_PARAM_BOUNDS.outfitClearanceMm.min, max: ATELIER_PARAM_BOUNDS.outfitClearanceMm.max, step: ATELIER_PARAM_BOUNDS.outfitClearanceMm.step, formatValue: (v) => `${v.toFixed(1)}mm` },
  { key: "outlineWidthPx", labelKo: "외곽선 굵기 (테이퍼)", labelEn: "Outline Taper Width", min: ATELIER_PARAM_BOUNDS.outlineWidthPx.min, max: ATELIER_PARAM_BOUNDS.outlineWidthPx.max, step: ATELIER_PARAM_BOUNDS.outlineWidthPx.step, formatValue: (v) => `${v.toFixed(2)}px` },
];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

function getPaletteColors(snapshot: AtelierCastSnapshot) {
  const h = snapshot.harmony;
  return {
    canvas: formatOklch(h.surfaceCanvas), panel: formatOklch(h.surfacePanel), card: formatOklch(h.surfaceCard),
    line: formatOklch(h.surfaceLine), ink: formatOklch(h.surfaceInk), muted: formatOklch(h.surfaceMuted),
    skin: formatOklch(h.skinBase), skinShadow: formatOklch(h.skinSdfShadow),
    hair: formatOklch(h.hairBase), hairRing: formatOklch(h.hairAngelRing),
    iris: formatOklch(h.irisPrimary), sclera: formatOklch(h.scleraShade), cornea: formatOklch(h.corneaCatchlight),
    outfit: formatOklch(h.outfitPrimary), outfitTrim: formatOklch(h.outfitTrim), outline: formatOklch(h.outlineInk),
    rim: formatOklch(h.rimLight), rimSoft: formatOklch(h.rimLight, 0.2),
    good: formatOklch(h.goodColor), goodSoft: formatOklch(h.goodColor, 0.18),
    warn: formatOklch(h.warnColor), warnSoft: formatOklch(h.warnColor, 0.22),
  };
}

function AnatomyLookdevPreviewSvg(props: { readonly snapshot: AtelierCastSnapshot; readonly isEn: boolean }): ReactElement {
  const { snapshot, isEn } = props;
  const { params, anatomy, solverMode } = snapshot;
  const c = getPaletteColors(snapshot);
  const isCoupled = solverMode === "atelier-coupled";

  const figureTopY = 26, figureBottomY = 212, figureH = figureBottomY - figureTopY, cx = 92;
  const headUnitPx = Math.min(48, Math.max(18, figureH / params.headRatio));
  const headCy = figureTopY + headUnitPx * 0.5, headRx = Math.min(20, headUnitPx * 0.42), headRy = headUnitPx * 0.48;
  const neckY = figureTopY + headUnitPx;
  const shoulderY = neckY + (anatomy.regime === "sd-chibi" ? 7 : 11);
  const shoulderHalfW = 14 + params.shoulderWidth * (anatomy.regime === "sd-chibi" ? 18 : 28);
  const waistY = shoulderY + figureH * (anatomy.regime === "sd-chibi" ? 0.24 : 0.3);
  const waistHalfW = shoulderHalfW * (0.52 + params.waistRatio * 0.34);
  const hipY = waistY + figureH * (anatomy.regime === "sd-chibi" ? 0.16 : 0.14);
  const cageGapPx = isCoupled ? Math.max(3, params.outfitClearanceMm * 0.42) : -2.5;
  const strokeW = Math.max(0.9, Math.min(2.8, params.outlineWidthPx));
  const headTickCount = Math.min(8, Math.max(3, Math.round(params.headRatio)));
  const faceCx = 266, faceCy = 112, jawHalfW = 28 - params.jawTaper * 11;
  const eyeOffsetX = 11 + params.eyeSpacing * 10, eyeR = 4.2 + params.eyeScale * 5.0, hairCrownR = 44 + params.hairVolume * 14;

  return (
    <svg
      data-testid="atelier-cast-anatomy-svg" data-archetype-id={snapshot.archetype.id} data-solver-mode={solverMode}
      data-clipping-count={anatomy.meshClippingCount} data-proportion-breaks={anatomy.proportionBreakCount}
      data-head-ratio={params.headRatio.toFixed(1)} data-violet-free="true" viewBox="0 0 360 240" role="img"
      aria-label={isEn
        ? `AtelierCast ${params.headRatio.toFixed(1)}-head anatomy, outfit cage refit (${anatomy.meshClippingCount} clips), and PrismLight Face-SDF preview`
        : `AtelierCast ${params.headRatio.toFixed(1)}등신 해부학 연동·의상 케이지 리핏(관통 ${anatomy.meshClippingCount}건) 및 PrismLight Face-SDF 프리뷰`}
      className="h-64 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width="360" height="240" rx="14" fill={c.panel} />
      <rect x="10" y="10" width="164" height="220" rx="10" fill={c.canvas} stroke={c.line} strokeWidth="0.9" />
      <text x="18" y="23" fill={c.ink} fontSize="7.6" fontWeight="700">{isEn ? `${params.headRatio.toFixed(1)}H Anatomy & Cage` : `${params.headRatio.toFixed(1)}등신 해부학 · 케이지`}</text>
      {Array.from({ length: headTickCount + 1 }, (_, i) => {
        const y = figureTopY + (figureH / headTickCount) * i;
        return (
          <g key={`tick-${i}`}>
            <line x1="18" y1={y} x2="166" y2={y} stroke={c.line} strokeWidth="0.55" strokeDasharray="2 2" strokeOpacity={0.65} />
            {i < headTickCount ? <text x="20" y={y + 8} fill={c.muted} fontSize="5.8" fontFamily="monospace">{`${i + 1}H`}</text> : null}
          </g>
        );
      })}
      <ellipse cx={cx} cy={headCy} rx={headRx} ry={headRy} fill={c.skin} stroke={c.outline} strokeWidth={strokeW * 0.75} />
      <path d={`M ${cx - shoulderHalfW} ${shoulderY} L ${cx + shoulderHalfW} ${shoulderY} L ${cx + waistHalfW} ${waistY} L ${cx + waistHalfW * 1.15} ${hipY} L ${cx - waistHalfW * 1.15} ${hipY} L ${cx - waistHalfW} ${waistY} Z`} fill={c.outfit} stroke={c.outline} strokeWidth={strokeW} />
      <line x1={cx - shoulderHalfW} y1={shoulderY + 2} x2={cx - shoulderHalfW - (isCoupled ? 9 : 16)} y2={hipY + 8} stroke={c.skin} strokeWidth={isCoupled ? 6.5 : 10.5} strokeLinecap="round" />
      <line x1={cx + shoulderHalfW} y1={shoulderY + 2} x2={cx + shoulderHalfW + (isCoupled ? 9 : 16)} y2={hipY + 8} stroke={c.skin} strokeWidth={isCoupled ? 6.5 : 10.5} strokeLinecap="round" />
      <line x1={cx - waistHalfW * 0.55} y1={hipY} x2={cx - waistHalfW * 0.62} y2={figureBottomY} stroke={c.outfit} strokeWidth="7.5" strokeLinecap="round" />
      <line x1={cx + waistHalfW * 0.55} y1={hipY} x2={cx + waistHalfW * 0.62} y2={figureBottomY} stroke={c.outfit} strokeWidth="7.5" strokeLinecap="round" />
      <path d={`M ${cx - shoulderHalfW - cageGapPx} ${shoulderY - 3} Q ${cx} ${neckY + 5} ${cx + shoulderHalfW + cageGapPx} ${shoulderY - 3}`} fill="none" stroke={isCoupled ? c.good : c.warn} strokeWidth="1.5" strokeDasharray="3 2" />
      {!isCoupled ? (
        <g data-testid="atelier-cast-clipping-warning">
          <circle cx={cx - shoulderHalfW} cy={shoulderY} r="5.5" fill={c.warnSoft} stroke={c.warn} strokeWidth="1.2" />
          <circle cx={cx + shoulderHalfW} cy={shoulderY} r="5.5" fill={c.warnSoft} stroke={c.warn} strokeWidth="1.2" />
        </g>
      ) : null}
      <rect x="16" y="206" width="152" height="18" rx="5" fill={isCoupled ? c.goodSoft : c.warnSoft} stroke={isCoupled ? c.good : c.warn} strokeWidth="0.8" />
      <text x="92" y="218" textAnchor="middle" fill={isCoupled ? c.good : c.warn} fontSize="6.9" fontWeight="700" fontFamily="monospace">
        {isCoupled ? `CLIP 0 · BREAK 0 · GAP ${anatomy.collarCageClearanceMm}mm` : `CLIP ${anatomy.meshClippingCount} · BREAK ${anatomy.proportionBreakCount} · PINCH`}
      </text>

      <rect x="182" y="10" width="168" height="220" rx="10" fill={c.canvas} stroke={c.line} strokeWidth="0.9" />
      <text x="190" y="23" fill={c.ink} fontSize="7.6" fontWeight="700">{isCoupled ? (isEn ? "PrismLight Face-SDF & 3-Layer Eye" : "PrismLight Face-SDF · 3층 안구") : (isEn ? "Legacy Phong Triangle Shadow" : "구형 퐁 각진 삼각형 그림자")}</text>
      <ellipse cx={faceCx} cy={faceCy - 12} rx={hairCrownR * 0.88} ry={hairCrownR * 0.92} fill={c.hair} stroke={c.outline} strokeWidth={strokeW * 0.85} />
      {isCoupled ? <path d={`M ${faceCx - 28} ${faceCy - 34} Q ${faceCx} ${faceCy - 46 - params.hairVolume * 6} ${faceCx + 28} ${faceCy - 34}`} fill="none" stroke={c.hairRing} strokeWidth="3.2" strokeLinecap="round" /> : null}
      <path d={`M ${faceCx - 34} ${faceCy - 14} C ${faceCx - 35} ${faceCy + 16}, ${faceCx - jawHalfW} ${faceCy + 34}, ${faceCx} ${faceCy + 42} C ${faceCx + jawHalfW} ${faceCy + 34}, ${faceCx + 35} ${faceCy + 16}, ${faceCx + 34} ${faceCy - 14} C ${faceCx + 32} ${faceCy - 38}, ${faceCx - 32} ${faceCy - 38}, ${faceCx - 34} ${faceCy - 14} Z`} fill={c.skin} stroke={c.outline} strokeWidth={strokeW} />
      {isCoupled
        ? <path data-testid="atelier-cast-face-sdf-curve" d={`M ${faceCx + 8} ${faceCy - 24} C ${faceCx + 24} ${faceCy - 8}, ${faceCx + 24} ${faceCy + 20}, ${faceCx} ${faceCy + 41} C ${faceCx + jawHalfW} ${faceCy + 34}, ${faceCx + 35} ${faceCy + 16}, ${faceCx + 34} ${faceCy - 14} Z`} fill={c.skinShadow} fillOpacity={0.55} />
        : <polygon data-testid="atelier-cast-legacy-phong-tri" points={`${faceCx},${faceCy - 6} ${faceCx + 14},${faceCy + 14} ${faceCx - 2},${faceCy + 16}`} fill={c.skinShadow} fillOpacity={0.78} />}
      {[-1, 1].map((side) => {
        const ex = faceCx + side * eyeOffsetX;
        const ey = faceCy + 2;
        return (
          <g key={`eye-${side}`}>
            <ellipse cx={ex} cy={ey} rx={eyeR * 1.15} ry={eyeR * 0.82} fill={c.sclera} stroke={c.outline} strokeWidth="0.9" />
            <circle cx={ex + (isCoupled ? 0.8 : 0)} cy={ey + 0.5} r={eyeR * 0.62} fill={c.iris} />
            {isCoupled ? <circle cx={ex - eyeR * 0.25} cy={ey - eyeR * 0.24} r={Math.max(1.3, eyeR * 0.24)} fill={c.cornea} /> : null}
          </g>
        );
      })}
      <path d={`M ${faceCx - 35} ${faceCy - 10} C ${faceCx - 36} ${faceCy + 12}, ${faceCx - jawHalfW} ${faceCy + 32}, ${faceCx - 4} ${faceCy + 40}`} fill="none" stroke={c.rim} strokeWidth={isCoupled ? "1.6" : "0.6"} strokeOpacity={isCoupled ? 0.85 : 0.3} />
      <rect x="188" y="182" width="156" height="42" rx="6" fill={c.card} stroke={c.line} strokeWidth="0.8" />
      <text x="196" y="196" fill={c.rim} fontSize="6.9" fontWeight="700" fontFamily="monospace">{`OKLCH · ${isEn ? snapshot.harmony.pigment.labelEn : snapshot.harmony.pigment.labelKo}`}</text>
      <text x="196" y="208" fill={c.ink} fontSize="6.6" fontFamily="monospace">{`SDF ${snapshot.quality.faceSdfSmoothnessPct}% · EYE ${snapshot.quality.eyeParallaxLayers}L · RING ${snapshot.quality.hairAngelRingContrast}`}</text>
      <text x="196" y="219" fill={c.muted} fontSize="6.4" fontFamily="monospace">{`OUTLINE ${params.outlineWidthPx.toFixed(2)}px · VIOLET ${snapshot.harmony.violetViolationCount}`}</text>
    </svg>
  );
}

function WebGpuPipelineQualitySvg(props: { readonly snapshot: AtelierCastSnapshot; readonly isEn: boolean }): ReactElement {
  const { snapshot, isEn } = props;
  const { backend, quality, renderPasses } = snapshot;
  const c = getPaletteColors(snapshot);
  const isWebGpu = backend.activeBackend === "webgpu";

  return (
    <svg
      data-testid="atelier-cast-webgpu-svg" data-active-backend={backend.activeBackend} data-overall-score={quality.overallScore}
      data-pass-count={backend.activePassCount} data-violet-violations={quality.violetHueViolationCount} data-violet-free="true"
      viewBox="0 0 360 240" role="img"
      aria-label={isEn
        ? `ToonCore WebGPU 5-pass 3D default pipeline (${backend.activeBackend}) and 4-axis lookdev quality scores (${quality.overallScore}/100)`
        : `ToonCore WebGPU 5패스 3D 기본 파이프라인(${backend.activeBackend}) 및 품질 4축 점수(${quality.overallScore}/100)`}
      className="h-64 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width="360" height="240" rx="14" fill={c.panel} />
      <rect x="10" y="10" width="340" height="104" rx="10" fill={c.card} stroke={c.line} strokeWidth="0.9" />
      <text x="20" y="25" fill={c.ink} fontSize="8.2" fontWeight="700">{isEn ? "ToonCore WebGPU 5-Pass Default 3D Pipeline" : "ToonCore WebGPU 5패스 3D 기본 렌더링 파이프라인"}</text>
      <text x="342" y="25" textAnchor="end" fill={isWebGpu ? c.good : c.warn} fontSize="7.4" fontWeight="700" fontFamily="monospace">{`${backend.activeBackend.toUpperCase()} · ${backend.activePassCount}/5 PASS`}</text>
      {renderPasses.map((pass, idx) => {
        const px = 18 + idx * 66;
        const active = idx < backend.activePassCount;
        const shortLabel = pass.order === 1 ? (isEn ? "Skin/Cage" : "스키닝·케이지") : pass.order === 2 ? "Face-SDF" : pass.order === 3 ? (isEn ? "3L Eye" : "3층 안구") : pass.order === 4 ? (isEn ? "Hair Ring" : "엔젤링") : (isEn ? "Taper+OK" : "외곽선·톤");
        return (
          <g key={pass.id} data-pass-id={pass.id} data-pass-active={String(active)}>
            <rect x={px} y="36" width="58" height="48" rx="7" fill={active ? (pass.stage === "compute" ? c.goodSoft : c.rimSoft) : c.canvas} stroke={active ? (pass.stage === "compute" ? c.good : c.rim) : c.line} strokeWidth={active ? "1.2" : "0.8"} />
            <text x={px + 29} y="50" textAnchor="middle" fill={active ? c.ink : c.muted} fontSize="6.4" fontWeight="700" fontFamily="monospace">{`P${pass.order} · ${pass.brandLayer.slice(0, 5)}`}</text>
            <text x={px + 29} y="63" textAnchor="middle" fill={active ? c.ink : c.muted} fontSize="6.1" fontWeight="600">{shortLabel}</text>
            <text x={px + 29} y="76" textAnchor="middle" fill={active ? c.good : c.muted} fontSize="5.7" fontFamily="monospace">{active ? (pass.stage === "compute" ? "COMPUTE" : "GPU PASS") : "BYPASS"}</text>
            {idx < renderPasses.length - 1 ? <line x1={px + 58} y1="60" x2={px + 66} y2="60" stroke={active ? c.rim : c.line} strokeWidth="1.2" /> : null}
          </g>
        );
      })}
      <text x="20" y="102" fill={c.muted} fontSize="6.8" fontFamily="monospace">{`WGSL ${snapshot.wgslValidation.valid ? "VALID" : "INVALID"} · ${snapshot.wgslValidation.bindingCount} BINDINGS · ${snapshot.uniformsByteLength}B (16B ALIGNED)`}</text>

      <rect x="10" y="122" width="340" height="108" rx="10" fill={c.card} stroke={c.line} strokeWidth="0.9" />
      <text x="20" y="138" fill={c.ink} fontSize="8.2" fontWeight="700">{isEn ? "4-Axis Character Custom Quality vs Legacy" : "3D 캐릭터 커스텀 품질 4축 점수 (구형 선형 대비)"}</text>
      <text x="342" y="138" textAnchor="end" fill={quality.improvementPoints >= 0 ? c.good : c.warn} fontSize="7.8" fontWeight="700" fontFamily="monospace">{`${quality.overallScore}/100 (${quality.improvementPoints >= 0 ? "+" : ""}${quality.improvementPoints}pt)`}</text>
      {quality.axes.map((axis, idx) => {
        const y = 148 + idx * 19;
        const activeW = Math.round((axis.score / 100) * 146);
        const legacyW = Math.round((axis.legacyBaselineScore / 100) * 146);
        return (
          <g key={axis.id}>
            <text x="20" y={y + 8} fill={c.ink} fontSize="6.8" fontWeight="600">{(isEn ? axis.labelEn : axis.labelKo).slice(0, 17)}</text>
            <rect x="128" y={y} width="146" height="10" rx="4" fill={c.canvas} stroke={c.line} strokeWidth="0.6" />
            <rect x="128" y={y} width={legacyW} height="10" rx="4" fill={c.muted} fillOpacity={0.35} />
            <rect x="128" y={y} width={activeW} height="10" rx="4" fill={axis.score >= 80 ? c.good : c.warn} fillOpacity={0.88} />
            <text x="342" y={y + 8} textAnchor="end" fill={axis.score >= 80 ? c.good : c.warn} fontSize="6.9" fontWeight="700" fontFamily="monospace">{`${axis.score} (vs ${axis.legacyBaselineScore})`}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** AtelierCast 해부학 연동 3D 캐릭터 커스텀 & PrismLight WebGPU 기본 3D 룩뎁 패널. */
export function StudioAtelierCastPanel(props: StudioAtelierCastPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();
  const initialArchetype = getAtelierArchetype(props.initialArchetypeId);

  const [archetypeId, setArchetypeId] = useState<AtelierArchetypeId>(initialArchetype.id);
  const [pigmentId, setPigmentId] = useState<AtelierPigmentId>(initialArchetype.defaultPigmentId);
  const [solverMode, setSolverMode] = useState<AtelierSolverMode>("atelier-coupled");
  const [simulateWebGl2Fallback, setSimulateWebGl2Fallback] = useState<boolean>(false);
  const [params, setParams] = useState<AtelierCharacterParams>(initialArchetype.params);
  const [drawerTab, setDrawerTab] = useState<"closed" | "json" | "wgsl">("closed");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const copyRequest = useRef(0);

  const snapshot = useMemo(
    () => buildAtelierCastSnapshot({
      archetypeId, pigmentId, solverMode, params,
      webGpuProbe: { hasNavigatorGpu: !simulateWebGl2Fallback && solverMode === "atelier-coupled", forceLegacyMode: solverMode === "legacy-linear" },
    }),
    [archetypeId, pigmentId, solverMode, params, simulateWebGl2Fallback],
  );
  const jsonOutput = useMemo(() => exportAtelierCastManifestJson(snapshot), [snapshot]);

  const emitChange = (next: {
    archetypeId?: AtelierArchetypeId; pigmentId?: AtelierPigmentId; solverMode?: AtelierSolverMode;
    params?: AtelierCharacterParams; simulateWebGl2Fallback?: boolean;
  }): AtelierCastSnapshot => {
    const nextArchId = next.archetypeId ?? archetypeId;
    const nextPigment = next.pigmentId ?? pigmentId;
    const nextMode = next.solverMode ?? solverMode;
    const nextParams = next.params ?? params;
    const nextFallback = next.simulateWebGl2Fallback ?? simulateWebGl2Fallback;
    const nextSnap = buildAtelierCastSnapshot({
      archetypeId: nextArchId, pigmentId: nextPigment, solverMode: nextMode, params: nextParams,
      webGpuProbe: { hasNavigatorGpu: !nextFallback && nextMode === "atelier-coupled", forceLegacyMode: nextMode === "legacy-linear" },
    });
    props.onCharacterChange?.(nextSnap);
    return nextSnap;
  };

  const handleSelectArchetype = (nextId: AtelierArchetypeId): void => {
    const preset = getAtelierArchetype(nextId);
    setArchetypeId(preset.id);
    setPigmentId(preset.defaultPigmentId);
    setParams(preset.params);
    const next = emitChange({ archetypeId: preset.id, pigmentId: preset.defaultPigmentId, params: preset.params });
    setStatusMessage(pick(
      `'${preset.labelKo}' 원형 적용 — 관통 ${next.anatomy.meshClippingCount}건 · 종합 품질 ${next.quality.overallScore}/100`,
      `Applied ${preset.labelEn} — ${next.anatomy.meshClippingCount} clips · quality ${next.quality.overallScore}/100.`,
    ));
  };

  const handleParamChange = (key: keyof AtelierCharacterParams, rawValue: number): void => {
    const nextParams: AtelierCharacterParams = { ...params, [key]: rawValue };
    setParams(nextParams);
    emitChange({ params: nextParams });
  };

  const handleModeToggle = (nextMode: AtelierSolverMode): void => {
    setSolverMode(nextMode);
    const next = emitChange({ solverMode: nextMode });
    setStatusMessage(nextMode === "atelier-coupled"
      ? pick(`AtelierCast 연동·WebGPU 기본 모드 — 관통 0건 · 점수 ${next.quality.overallScore}/100`, `AtelierCast coupled WebGPU default — 0 clips · ${next.quality.overallScore}/100.`)
      : pick(`구형 선형 스케일 비교 모드 — 관통 ${next.anatomy.meshClippingCount}건 · 파탄 ${next.anatomy.proportionBreakCount}건 감지`, `Legacy linear comparison — ${next.anatomy.meshClippingCount} clips, ${next.anatomy.proportionBreakCount} breaks detected.`));
  };

  const handleCopyPayload = async (kind: "json" | "wgsl"): Promise<void> => {
    const req = ++copyRequest.current;
    setDrawerTab(kind);
    const text = kind === "json" ? jsonOutput : ATELIER_CAST_WEBGPU_LOOKDEV_WGSL;
    const copying = copyText(text);
    let notified = true;
    if (kind === "json") {
      try { await props.onExportJson?.(jsonOutput, snapshot); } catch { notified = false; }
    }
    const copied = await copying;
    if (req !== copyRequest.current) return;
    const baseMsg = copied
      ? (kind === "json" ? pick("AtelierCast 매니페스트 JSON을 복사했습니다.", "Copied AtelierCast manifest JSON.") : pick("PrismLight WebGPU WGSL 소스를 복사했습니다.", "Copied PrismLight WebGPU WGSL source."))
      : pick("클립보드 복사 권한이 없어 아래 미리보기에서 직접 복사해 주세요.", "Clipboard unavailable. Copy directly from the preview below.");
    setStatusMessage(notified ? baseMsg : `${baseMsg} ${pick("내보내기 콜백 처리에 실패했습니다.", "Export callback failed.")}`);
  };

  const handleReset = (): void => {
    setArchetypeId(initialArchetype.id);
    setPigmentId(initialArchetype.defaultPigmentId);
    setSolverMode("atelier-coupled");
    setSimulateWebGl2Fallback(false);
    setParams(initialArchetype.params);
    setDrawerTab("closed");
    emitChange({ archetypeId: initialArchetype.id, pigmentId: initialArchetype.defaultPigmentId, solverMode: "atelier-coupled", params: initialArchetype.params, simulateWebGl2Fallback: false });
    setStatusMessage(pick("기본 원형과 ToonCore WebGPU 기본 룩뎁 설정으로 되돌렸습니다.", "Reset archetype and ToonCore WebGPU default lookdev settings."));
  };

  return (
    <section
      data-testid="atelier-cast-panel"
      aria-label={pick("AtelierCast 해부학 3D 캐릭터 커스텀 및 PrismLight WebGPU 기본 룩뎁", "AtelierCast Anatomical 3D Customizer and PrismLight WebGPU Default Lookdev")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="atelier-cast-backend-badge" className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent tabular-nums [word-break:keep-all]">
              <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {isEn ? snapshot.backend.labelEn : snapshot.backend.labelKo}
            </span>
            <span data-testid="atelier-cast-clipping-badge" className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums [word-break:keep-all] ${snapshot.anatomy.meshClippingCount === 0 ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad"}`}>
              {snapshot.anatomy.meshClippingCount === 0
                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                : <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {pick(`관통 ${snapshot.anatomy.meshClippingCount}건 · 비율 파탄 ${snapshot.anatomy.proportionBreakCount}건`, `${snapshot.anatomy.meshClippingCount} Clips · ${snapshot.anatomy.proportionBreakCount} Breaks`)}
            </span>
            <span data-testid="atelier-cast-violet-badge" className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg tabular-nums [word-break:keep-all]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              {pick(`OKLCH 5안료 · 바이올렛 ${snapshot.harmony.violetViolationCount}건`, `OKLCH 5-Pigment · ${snapshot.harmony.violetViolationCount} Violet`)}
            </span>
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("AtelierCast 해부학 연동 3D 캐릭터 커스텀 · PrismLight WebGPU 기본 룩뎁", "AtelierCast Coupled 3D Character Customizer · PrismLight WebGPU Lookdev")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("해부학 연동 블렌드셰이프·의상 케이지 리핏으로 관통과 비율 파탄을 없애고 ToonCore WebGPU 5패스로 얼굴 음영과 안구를 정교하게 조율합니다.", "Eliminates garment clipping and proportion breaks via coupled blendshapes, running PrismLight Face-SDF and 3-layer eye shading on ToonCore WebGPU by default.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="atelier-cast-copy-json-btn" onClick={() => void handleCopyPayload("json")} className={BTN_SOLID}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="atelier-cast-copy-wgsl-btn" onClick={() => void handleCopyPayload("wgsl")} className={BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("WGSL 복사", "Copy WGSL")}
          </button>
          <button type="button" data-testid="atelier-cast-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      <div role="status" aria-live="polite" data-testid="atelier-cast-status-banner" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
        {statusMessage || (isEn ? snapshot.backend.reasonEn : snapshot.backend.reasonKo)}
      </div>

      {/* 5종 한국 웹툰 정밀 원형 프리셋 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <User className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("5종 한국 웹툰 정밀 원형 프리셋", "5 Korean Webtoon Precision Archetypes")}
          </h3>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">
            {`${snapshot.archetype.id} · ${snapshot.params.headRatio.toFixed(1)}H`}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5" role="group" aria-label={pick("웹툰 캐릭터 원형 선택", "Select webtoon character archetype")}>
          {ATELIER_CAST_ARCHETYPES.map((arch) => {
            const active = arch.id === archetypeId;
            const dotColor = formatOklch(ATELIER_PIGMENT_PALETTES.find((p) => p.id === arch.defaultPigmentId)?.darkAnchor ?? { l: 0.79, c: 0.158, h: 72 });
            return (
              <button
                key={arch.id} type="button" data-testid={`atelier-cast-archetype-${arch.id}`} aria-pressed={active}
                onClick={() => handleSelectArchetype(arch.id)}
                className={`flex min-h-11 flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}
              >
                <div className="flex w-full items-center justify-between gap-1.5">
                  <span className="text-xs font-bold">{isEn ? arch.labelEn : arch.labelKo}</span>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden="true" />
                </div>
                <span className="text-[11px] text-fg-2">{isEn ? arch.genreTagEn : arch.genreTagKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 모드 비교 토글 · WebGL2 폴백 체험 · 5안료 OKLCH 조화 선택 */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-raised p-4 lg:grid-cols-12">
        <div className="space-y-2 lg:col-span-6">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("WebGPU 기본 vs 구형 선형 스케일 비교", "WebGPU Default vs Legacy Linear Scale")}
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-label={pick("솔버 비교 모드", "Solver comparison mode")}>
            <button type="button" data-testid="atelier-cast-mode-coupled" aria-pressed={solverMode === "atelier-coupled"} onClick={() => handleModeToggle("atelier-coupled")} className={solverMode === "atelier-coupled" ? BTN_SOLID : BTN_OUTLINE}>
              {pick("AtelierCast 연동 · WebGPU 기본", "AtelierCast Coupled · WebGPU")}
            </button>
            <button type="button" data-testid="atelier-cast-mode-legacy" aria-pressed={solverMode === "legacy-linear"} onClick={() => handleModeToggle("legacy-linear")} className={solverMode === "legacy-linear" ? BTN_ACTIVE : BTN_OUTLINE}>
              {pick("구형 선형 스케일 비교", "Legacy Linear Compare")}
            </button>
            <button
              type="button" data-testid="atelier-cast-fallback-toggle" aria-pressed={simulateWebGl2Fallback}
              onClick={() => {
                const nextFb = !simulateWebGl2Fallback;
                setSimulateWebGl2Fallback(nextFb);
                const next = emitChange({ simulateWebGl2Fallback: nextFb });
                setStatusMessage(isEn ? next.backend.reasonEn : next.backend.reasonKo);
              }}
              className={simulateWebGl2Fallback ? BTN_ACTIVE : BTN_OUTLINE}
            >
              {simulateWebGl2Fallback ? pick("WebGL2 폴백 체험 중", "Simulating WebGL2 Fallback") : pick("WebGL2 폴백 시뮬레이션", "Simulate WebGL2 Fallback")}
            </button>
          </div>
        </div>
        <div className="space-y-2 lg:col-span-6">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Palette className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("단일 탈-바이올렛 OKLCH 5안료 룩뎁 패스", "Unified Non-Violet OKLCH 5-Pigment Pass")}
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("OKLCH 5안료 선택", "Select OKLCH pigment")}>
            {ATELIER_PIGMENT_PALETTES.map((p) => (
              <button
                key={p.id} type="button" data-testid={`atelier-cast-pigment-${p.id}`} aria-pressed={p.id === pigmentId}
                onClick={() => { setPigmentId(p.id); emitChange({ pigmentId: p.id }); setStatusMessage(pick(`'${p.labelKo}' 안료 조화 패스를 적용했습니다.`, `Applied ${p.labelEn} harmony pass.`)); }}
                className={p.id === pigmentId ? BTN_ACTIVE : BTN_OUTLINE}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: formatOklch(p.darkAnchor) }} aria-hidden="true" />
                {isEn ? p.labelEn : p.labelKo}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 순수 시맨틱 SVG 2단 시각화 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Eye className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("해부학 등신비 · Face-SDF 음영 · 3층 안구 · 케이지 프리뷰", "Anatomy Ratio · Face-SDF · 3-Layer Eye · Cage Preview")}
            </h3>
            <span className="font-mono text-[11px] text-accent tabular-nums">
              {`GAP ${snapshot.anatomy.collarCageClearanceMm}mm`}
            </span>
          </div>
          <AnatomyLookdevPreviewSvg snapshot={snapshot} isEn={isEn} />
        </div>
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("ToonCore WebGPU 5패스 기본 파이프라인 & 4축 품질 점수", "ToonCore WebGPU 5-Pass Pipeline & 4-Axis Quality")}
            </h3>
            <span className="font-mono text-[11px] text-good tabular-nums">
              {`${snapshot.quality.overallScore}/100`}
            </span>
          </div>
          <WebGpuPipelineQualitySvg snapshot={snapshot} isEn={isEn} />
        </div>
      </div>

      {/* 정밀 해부학·의상 케이지·룩뎁 슬라이더 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("해부학 연동 · 의상 케이지 리핏 · 외곽선 정밀 조절", "Coupled Anatomy · Outfit Cage Refit · Outline Sliders")}
          </h3>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">
            {pick(`쇄골 ${snapshot.anatomy.clavicleSpanCm}cm · 갈비뼈 ${snapshot.anatomy.ribcageWidthCm}cm · 어깨 보정 ${snapshot.anatomy.shoulderJointTwistDeg}°`, `Clavicle ${snapshot.anatomy.clavicleSpanCm}cm · Rib ${snapshot.anatomy.ribcageWidthCm}cm · Twist ${snapshot.anatomy.shoulderJointTwistDeg}°`)}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SLIDER_SPECS.map((spec) => {
            const val = params[spec.key];
            const inputId = `${uid}-slider-${spec.key}`;
            return (
              <div key={spec.key} className="space-y-1 rounded-lg border border-line bg-card px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={inputId} className="text-xs font-medium text-fg [word-break:keep-all]">
                    {isEn ? spec.labelEn : spec.labelKo}
                  </label>
                  <span data-testid={`atelier-cast-value-${spec.key}`} className="font-mono text-xs font-semibold text-accent tabular-nums">
                    {spec.formatValue(val, isEn)}
                  </span>
                </div>
                <input
                  id={inputId} data-testid={`atelier-cast-slider-${spec.key}`} type="range"
                  min={spec.min} max={spec.max} step={spec.step} value={val}
                  onChange={(e) => handleParamChange(spec.key, Number(e.target.value))}
                  className={`min-h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 핵심 KPI 4종 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("메쉬 관통 · 비율 파탄", "Mesh Clips · Breaks")}</div>
          <div data-testid="atelier-cast-kpi-clipping" className="mt-1 font-mono text-sm font-bold text-good tabular-nums">
            {pick(`${snapshot.anatomy.meshClippingCount}건 / ${snapshot.anatomy.proportionBreakCount}건`, `${snapshot.anatomy.meshClippingCount} / ${snapshot.anatomy.proportionBreakCount}`)}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("4축 룩뎁 품질 점수", "4-Axis Lookdev Score")}</div>
          <div data-testid="atelier-cast-kpi-score" className="mt-1 font-mono text-sm font-bold text-accent tabular-nums">
            {`${snapshot.quality.overallScore}/100 (${snapshot.quality.improvementPoints >= 0 ? "+" : ""}${snapshot.quality.improvementPoints})`}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("기본 3D 런타임 정책", "Default 3D Runtime")}</div>
          <div data-testid="atelier-cast-kpi-backend" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">
            {`${snapshot.backend.activeBackend.toUpperCase()} · ${snapshot.backend.activePassCount}P`}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("Face-SDF · 3층 안구", "Face-SDF · 3-Layer Eye")}</div>
          <div data-testid="atelier-cast-kpi-lookdev" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">
            {`${snapshot.quality.faceSdfSmoothnessPct}% · ${snapshot.quality.eyeParallaxLayers}L`}
          </div>
        </div>
      </div>

      {/* apps/character-lab → AtelierCast 통합 체크리스트 & 라우트 매핑 + WGSL/JSON 미리보기 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <GitMerge className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick(`apps/character-lab → AtelierCast 통합 매핑 (계약 완료 ${snapshot.integration.contractReadyCount}/${snapshot.integration.totalItems})`, `apps/character-lab → AtelierCast Integration (${snapshot.integration.contractReadyCount}/${snapshot.integration.totalItems} Ready)`)}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" data-testid="atelier-cast-preview-json-btn" aria-expanded={drawerTab === "json"} onClick={() => setDrawerTab((prev) => (prev === "json" ? "closed" : "json"))} className={drawerTab === "json" ? BTN_ACTIVE : BTN_OUTLINE}>
              <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {drawerTab === "json" ? pick("JSON 닫기", "Hide JSON") : pick("JSON 미리보기", "Preview JSON")}
            </button>
            <button type="button" data-testid="atelier-cast-preview-wgsl-btn" aria-expanded={drawerTab === "wgsl"} onClick={() => setDrawerTab((prev) => (prev === "wgsl" ? "closed" : "wgsl"))} className={drawerTab === "wgsl" ? BTN_ACTIVE : BTN_OUTLINE}>
              <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {drawerTab === "wgsl" ? pick("WGSL 닫기", "Hide WGSL") : pick("WGSL 미리보기", "Preview WGSL")}
            </button>
          </div>
        </div>
        <div data-testid="atelier-cast-route-mapping-list" className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
          {snapshot.integration.routeMappings.map((m) => (
            <div key={m.id} className="rounded-lg border border-line bg-card px-2.5 py-2 text-[11px] [word-break:keep-all]">
              <div className="font-mono text-[10px] font-bold text-accent">{m.studioRoute}</div>
              <div className="mt-0.5 text-fg">{isEn ? m.roleEn : m.roleKo}</div>
              <div className="mt-1 font-mono text-[10px] text-fg-3">{m.migrationState === "contract-ready" ? pick("계약 완료", "Contract Ready") : pick("단계 이관 예정", "Planned Cutover")}</div>
            </div>
          ))}
        </div>
        {drawerTab !== "closed" ? (
          <pre data-testid="atelier-cast-code-preview" data-preview-kind={drawerTab} className="max-h-60 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums">
            {drawerTab === "json" ? jsonOutput : ATELIER_CAST_WEBGPU_LOOKDEV_WGSL}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
