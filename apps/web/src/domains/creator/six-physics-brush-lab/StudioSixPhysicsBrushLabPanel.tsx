/**
 * Wave 53D — 6대 학술 논문 기반 독립 물리 브러시 개성 엔진 비교 랩 패널.
 *
 * - 6대 독립 물리 엔진(수채 Curtis '97 · 유화 Wetbrush '15 · 먹물 MoXi '05 · 크레용/흑연 Sousa '99 ·
 *   만화 G펜 Loop-Blinn '05 · 알코올 마커/메탈릭 포일 Cook-Torrance PBR) 카드 + A/B 비교 선택기
 * - 필압·기울기·속도·물/용제량·종이 흡수율·겹칠 횟수 공통 입력 스트로크로 두 엔진 실시간 대조
 * - 순수 시맨틱 SVG 2단 물리 단면·에지 거동 비교 프리뷰(oklch/currentColor 전용, 바이올렛 270~320° 0%)
 * - 6축 아키텍처 분화 정량 검증기 + 학술 논문·버퍼·WGSL 패스 카드 + JSON/WGSL 매니페스트 복사
 */

import {
  ArrowLeftRight, BookOpen, Check, Code2, Copy, Cpu,
  FlaskConical, Layers, RotateCcw, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  DEFAULT_COMMON_STROKE_INPUT, SIX_PHYSICS_BRUSH_ENGINES, STROKE_SCENARIO_PRESETS,
  compareBrushPhysicsDivergence, exportBrushPhysicsManifestJson, formatOklch,
  getPhysicsBrushEngineSpec, simulatePhysicsBrushStroke,
  type BrushDivergenceAxis, type BrushPhysicsPipelineManifest, type BrushPhysicsSimulationResult,
  type CommonBrushStrokeInput, type PhysicsBrushEngineId, type PhysicsBrushEngineSpec,
} from "./six-physics-brush-engine";

export interface StudioSixPhysicsBrushLabPanelProps {
  readonly initialPrimaryId?: PhysicsBrushEngineId;
  readonly initialCompareId?: PhysicsBrushEngineId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onExportJson?: (json: string, manifest: BrushPhysicsPipelineManifest) => void;
}

// 탈-바이올렛 OKLCH 시맨틱 SVG 팔레트(종이 92°, 골짜기 82°, 광선 78°, 수막 205°, 짙은 잉크 235°, 광택 88°)
const SVG_PAPER_SURFACE = "oklch(0.96 0.006 92)";
const SVG_PAPER_VALLEY = "oklch(0.84 0.014 82)";
const SVG_PAPER_SUBSTRATE = "oklch(0.92 0.01 86)";
const SVG_LIGHT_RAY = "oklch(0.75 0.14 78)";
const SVG_WATER_HALO = "oklch(0.66 0.095 205 / 0.34)";
const SVG_AXIS_INK = "oklch(0.32 0.016 235)";
const SVG_SPECULAR_GLINT = "oklch(0.97 0.02 88)";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const PAPER_PEAK_OFFSETS: readonly number[] = [
  0.22, 0.78, 0.34, 0.88, 0.18, 0.74, 0.42, 0.92, 0.25, 0.81, 0.3, 0.86, 0.2, 0.76, 0.38, 0.84, 0.24,
];

function roundSvg(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildPaperContourPoints(originX: number, width: number, baseY: number, ampPx: number): string {
  return PAPER_PEAK_OFFSETS.map((peak, index) => {
    const x = roundSvg(originX + (index / (PAPER_PEAK_OFFSETS.length - 1)) * width);
    const y = roundSvg(baseY - peak * ampPx);
    return `${x},${y}`;
  }).join(" ");
}

function StrokeSlider(props: {
  readonly id: string; readonly testId: string; readonly label: string; readonly readout: string;
  readonly hint: string; readonly min: number; readonly max: number; readonly step: number;
  readonly value: number; readonly onChange: (value: number) => void;
}): ReactElement {
  return (
    <div className="space-y-0.5">
      <label htmlFor={props.id} className="flex items-center justify-between gap-2 text-xs font-medium text-fg-2 [word-break:keep-all]">
        <span>{props.label}</span>
        <span data-testid={`${props.testId}-readout`} className="font-mono font-bold text-fg tabular-nums">{props.readout}</span>
      </label>
      <input
        id={props.id} data-testid={props.testId} type="range"
        min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="min-h-11 w-full cursor-pointer accent-accent"
      />
      <p className="text-[11px] text-fg-3 [word-break:keep-all]">{props.hint}</p>
    </div>
  );
}

function PhysicsEngineSvgColumn(props: {
  readonly slot: "primary" | "compare";
  readonly offsetX: number;
  readonly spec: PhysicsBrushEngineSpec;
  readonly sim: BrushPhysicsSimulationResult;
  readonly isEn: boolean;
}): ReactElement {
  const { slot, offsetX, spec, sim, isEn } = props;
  const colW = 352;
  const padX = offsetX + 14;
  const innerW = colW - 28;
  const strokeMidY = 104;
  const crossBaseY = 266;
  const pigmentSolid = formatOklch(spec.pigmentOklch, 0.92);
  const pigmentSoft = formatOklch(spec.pigmentOklch, Math.max(0.22, sim.pigmentOpacityRatio * 0.72));
  const pigmentDeep = formatOklch({ l: Math.max(0.12, spec.pigmentOklch.l - 0.16), c: Math.min(0.24, spec.pigmentOklch.c + 0.03), h: spec.pigmentOklch.h }, 0.9);
  const accentCss = formatOklch(spec.accentOklch, 0.94);
  const paperContour = buildPaperContourPoints(padX, innerW, crossBaseY, 18);
  const p = sim.physics;

  return (
    <g data-testid={`svg-column-${slot}`} data-engine-id={spec.id}>
      <rect x={offsetX} y={10} width={colW} height={298} rx={12} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={1.2} />
      <text x={padX} y={30} fontSize={11} fontWeight={700} fill="currentColor">
        {`${slot === "primary" ? "A" : "B"} · ${isEn ? spec.nameEn : spec.nameKo}`}
      </text>
      <text x={offsetX + colW - 14} y={30} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.72}>
        {`${sim.signatureMetricValue} · ${sim.secondaryMetricValue}`}
      </text>

      {/* 상단: 동일 획 입력에 대한 브러시별 에지·질감 탑뷰 */}
      <rect x={padX} y={40} width={innerW} height={122} rx={8} fill={SVG_PAPER_SURFACE} stroke={SVG_PAPER_VALLEY} strokeWidth={1} />
      <text x={padX + 8} y={54} fontSize={9} fontWeight={600} fill={SVG_AXIS_INK} fillOpacity={0.76}>
        {isEn ? `TOP STROKE · ${spec.edgeBehaviorLabelEn}` : `평면 획 · ${spec.edgeBehaviorLabelKo}`}
      </text>

      {p.kind === "watercolor-curtis97" ? (
        <g data-testid={`svg-stroke-${slot}-watercolor-curtis97`}>
          <ellipse cx={padX + innerW * 0.5} cy={strokeMidY + 4} rx={roundSvg(114 + p.bleedRadiusMm * 2.8)} ry={roundSvg(24 + p.bleedRadiusMm * 1.4)} fill={SVG_WATER_HALO} />
          <path
            d={`M ${padX + 26} ${strokeMidY + 8} C ${padX + 100} ${strokeMidY - 22}, ${padX + 220} ${strokeMidY + 28}, ${padX + innerW - 26} ${strokeMidY - 2}`}
            fill="none" stroke={pigmentDeep} strokeWidth={roundSvg(34 + p.bleedRadiusMm * 1.3)} strokeLinecap="round"
            strokeOpacity={roundSvg(Math.min(0.95, 0.35 + (p.edgeDarkeningRatio - 1) * 0.45))}
          />
          <path
            d={`M ${padX + 26} ${strokeMidY + 8} C ${padX + 100} ${strokeMidY - 22}, ${padX + 220} ${strokeMidY + 28}, ${padX + innerW - 26} ${strokeMidY - 2}`}
            fill="none" stroke={formatOklch({ l: Math.min(0.92, spec.pigmentOklch.l + 0.24), c: spec.pigmentOklch.c * 0.65, h: spec.pigmentOklch.h }, 0.85)}
            strokeWidth={roundSvg(24 + p.bleedRadiusMm * 0.8)} strokeLinecap="round"
          />
          {[0.24, 0.38, 0.52, 0.66, 0.78].map((t, idx) => (
            <circle key={idx} cx={roundSvg(padX + innerW * t)} cy={roundSvg(strokeMidY + (idx % 2 === 0 ? -4 : 9))} r={roundSvg(2 + p.granulationSettling * 2.4)} fill={pigmentDeep} fillOpacity={0.55} />
          ))}
        </g>
      ) : null}

      {p.kind === "oil-wetbrush15" ? (
        <g data-testid={`svg-stroke-${slot}-oil-wetbrush15`}>
          <path
            d={`M ${padX + 28} ${strokeMidY + 11} C ${padX + 104} ${strokeMidY - 14}, ${padX + 216} ${strokeMidY + 24}, ${padX + innerW - 28} ${strokeMidY + 2}`}
            fill="none" stroke={pigmentDeep} strokeWidth={roundSvg(28 + p.paintThicknessMm * 4.5)} strokeLinecap="round" strokeOpacity={0.55}
          />
          <path
            d={`M ${padX + 24} ${strokeMidY + 7} C ${padX + 100} ${strokeMidY - 18}, ${padX + 212} ${strokeMidY + 20}, ${padX + innerW - 32} ${strokeMidY - 2}`}
            fill="none" stroke={pigmentSolid} strokeWidth={roundSvg(26 + p.paintThicknessMm * 4.2)} strokeLinecap="round"
          />
          {[-8, -2, 4, 10].map((dy, idx) => (
            <path
              key={idx}
              d={`M ${padX + 30} ${strokeMidY + 7 + dy} C ${padX + 104} ${strokeMidY - 18 + dy}, ${padX + 212} ${strokeMidY + 20 + dy}, ${padX + innerW - 36} ${strokeMidY - 2 + dy}`}
              fill="none" stroke={idx === 0 ? SVG_SPECULAR_GLINT : accentCss}
              strokeWidth={idx === 0 ? roundSvg(2.2 + p.highlight45Specular * 2.8) : 1.4}
              strokeOpacity={idx === 0 ? roundSvg(0.45 + p.highlight45Specular * 0.5) : 0.6} strokeLinecap="round"
            />
          ))}
        </g>
      ) : null}

      {p.kind === "sumi-moxi05" ? (
        <g data-testid={`svg-stroke-${slot}-sumi-moxi05`}>
          <path
            d={`M ${padX + 24} ${strokeMidY + 6} C ${padX + 110} ${strokeMidY - 16}, ${padX + 215} ${strokeMidY + 22}, ${padX + innerW - 24} ${strokeMidY - 2}`}
            fill="none" stroke={formatOklch(spec.accentOklch, 0.22)} strokeWidth={roundSvg(24 + p.fiberFeatheringMm * 4.5)} strokeLinecap="round"
          />
          {Array.from({ length: p.activeFilaments }, (_, idx) => {
            const frac = p.activeFilaments > 1 ? idx / (p.activeFilaments - 1) - 0.5 : 0;
            const dy = roundSvg(frac * 28);
            const dash = p.flyingWhiteGapRatio > 0.35 ? `${roundSvg(44 - p.flyingWhiteGapRatio * 24)} ${roundSvg(5 + p.flyingWhiteGapRatio * 14)}` : undefined;
            return (
              <path
                key={idx}
                d={`M ${padX + 26} ${strokeMidY + 6 + dy} C ${padX + 108} ${strokeMidY - 14 + dy}, ${padX + 216} ${strokeMidY + 20 + dy}, ${padX + innerW - 26} ${strokeMidY - 2 + dy}`}
                fill="none" stroke={pigmentSolid} strokeWidth={roundSvg(Math.max(1.2, 3.1 - p.flyingWhiteGapRatio * 1.6))}
                strokeDasharray={dash} strokeLinecap="round"
              />
            );
          })}
        </g>
      ) : null}

      {p.kind === "drymedia-sousa99" ? (
        <g data-testid={`svg-stroke-${slot}-drymedia-sousa99`}>
          {Array.from({ length: 14 }, (_, idx) => {
            const x = roundSvg(padX + 28 + idx * 19.5);
            const bandH = roundSvg(14 + p.sideShadingWidthMultiplier * 10);
            const dash = `${roundSvg(3 + p.valleyFill * 7)} ${roundSvg(Math.max(1.5, p.peakClippingRatio * 6.5))}`;
            return (
              <line
                key={idx} x1={x - 6} y1={roundSvg(strokeMidY + bandH * 0.5)} x2={x + 8} y2={roundSvg(strokeMidY - bandH * 0.5)}
                stroke={pigmentSolid} strokeWidth={roundSvg(4 + p.valleyFill * 3)} strokeDasharray={dash} strokeOpacity={roundSvg(0.45 + p.valleyFill * 0.5)}
              />
            );
          })}
          {Array.from({ length: Math.max(4, Math.round(p.crumbleParticleDensity * 12)) }, (_, idx) => (
            <circle
              key={idx}
              cx={roundSvg(padX + 36 + ((idx * 47) % 248))}
              cy={roundSvg(strokeMidY + ((idx % 2 === 0 ? -1 : 1) * (15 + (idx % 4) * 5)))}
              r={roundSvg(1.2 + (idx % 3) * 0.6)} fill={pigmentDeep} fillOpacity={0.78}
            />
          ))}
        </g>
      ) : null}

      {p.kind === "gpen-loopblinn05" ? (
        <g data-testid={`svg-stroke-${slot}-gpen-loopblinn05`}>
          {(() => {
            const halfW = roundSvg(3.5 + p.nibSplitMm * 10.5);
            const x0 = padX + 24;
            const xMid = padX + innerW * 0.5;
            const x1 = padX + innerW - 24;
            return (
              <>
                <path
                  d={`M ${x0} ${strokeMidY + 8} Q ${xMid} ${strokeMidY - 22 - halfW} ${x1} ${strokeMidY - 4} Q ${xMid} ${strokeMidY - 22 + halfW} ${x0} ${strokeMidY + 8} Z`}
                  fill={pigmentSolid}
                />
                <path
                  d={`M ${x0} ${strokeMidY + 8} L ${xMid} ${strokeMidY - 22 - halfW} L ${x1} ${strokeMidY - 4}`}
                  fill="none" stroke={accentCss} strokeWidth={1.1} strokeDasharray="4 3"
                />
                <circle cx={xMid} cy={strokeMidY - 22 - halfW} r={3} fill={accentCss} />
              </>
            );
          })()}
        </g>
      ) : null}

      {p.kind === "marker-foil-pbr" ? (
        <g data-testid={`svg-stroke-${slot}-marker-foil-pbr`}>
          <rect x={padX + 26} y={strokeMidY - 20} width={186} height={30} rx={4} fill={formatOklch(spec.pigmentOklch, roundSvg(0.45 + p.achievedSaturation * 0.4))} transform={`rotate(-4 ${padX + 120} ${strokeMidY})`} />
          <rect x={padX + 102} y={strokeMidY - 12} width={186} height={30} rx={4} fill={formatOklch(spec.pigmentOklch, roundSvg(0.48 + p.achievedSaturation * 0.42))} transform={`rotate(3 ${padX + 190} ${strokeMidY})`} />
          {[0, 1, 2].map((idx) => (
            <line
              key={idx}
              x1={roundSvg(padX + 54 + idx * 78)} y1={strokeMidY - 17}
              x2={roundSvg(padX + 94 + idx * 78)} y2={strokeMidY + 19}
              stroke={formatOklch(p.specularTint, roundSvg(0.4 + p.ggxSpecularReflectance * 0.55))}
              strokeWidth={roundSvg(Math.max(2, 11 - p.metallicRoughness * 14))} strokeLinecap="round"
            />
          ))}
        </g>
      ) : null}

      {/* 하단: 종이-안료 물리 단면 (Cross-Section) */}
      <rect x={padX} y={172} width={innerW} height={124} rx={8} fill={SVG_PAPER_SURFACE} stroke={SVG_PAPER_VALLEY} strokeWidth={1} />
      <text x={padX + 8} y={187} fontSize={9} fontWeight={600} fill={SVG_AXIS_INK} fillOpacity={0.76}>
        {isEn ? `CROSS-SECTION · ${spec.heightModelLabelEn}` : `물리 단면 · ${spec.heightModelLabelKo}`}
      </text>

      <polygon points={`${padX},${crossBaseY + 24} ${paperContour} ${padX + innerW},${crossBaseY + 24}`} fill={SVG_PAPER_SUBSTRATE} />

      {p.kind === "watercolor-curtis97" ? (
        <g data-testid={`svg-cross-${slot}-watercolor-curtis97`}>
          <path d={`M ${padX + 34} ${crossBaseY - 12} Q ${padX + innerW * 0.5} ${crossBaseY - 26 - p.bleedRadiusMm * 1.4} ${padX + innerW - 34} ${crossBaseY - 12}`} fill={SVG_WATER_HALO} stroke={formatOklch(spec.accentOklch, 0.7)} strokeWidth={1.4} />
          <ellipse cx={padX + 42} cy={crossBaseY - 10} rx={12} ry={roundSvg(4 + (p.edgeDarkeningRatio - 1) * 5)} fill={pigmentDeep} fillOpacity={0.88} />
          <ellipse cx={padX + innerW - 42} cy={crossBaseY - 10} rx={12} ry={roundSvg(4 + (p.edgeDarkeningRatio - 1) * 5)} fill={pigmentDeep} fillOpacity={0.88} />
          <rect x={padX + 60} y={crossBaseY - 11} width={innerW - 120} height={6} rx={3} fill={pigmentSoft} />
        </g>
      ) : null}

      {p.kind === "oil-wetbrush15" ? (
        <g data-testid={`svg-cross-${slot}-oil-wetbrush15`}>
          {(() => {
            const hPx = roundSvg(14 + p.paintThicknessMm * 15);
            return (
              <>
                <path
                  d={`M ${padX + 36} ${crossBaseY - 8} C ${padX + 52} ${crossBaseY - 14 - hPx}, ${padX + 94} ${crossBaseY - 6 - hPx}, ${padX + innerW * 0.5} ${crossBaseY - 4 - hPx * 0.75} C ${padX + innerW - 94} ${crossBaseY - 6 - hPx}, ${padX + innerW - 52} ${crossBaseY - 14 - hPx}, ${padX + innerW - 36} ${crossBaseY - 8} Z`}
                  fill={pigmentSolid} stroke={pigmentDeep} strokeWidth={1.3}
                />
                <line x1={padX + 38} y1={196} x2={padX + 76} y2={roundSvg(crossBaseY - 14 - hPx * 0.8)} stroke={SVG_LIGHT_RAY} strokeWidth={1.8} strokeDasharray="3 2" />
                <circle cx={padX + 78} cy={roundSvg(crossBaseY - 12 - hPx * 0.8)} r={3.5} fill={SVG_SPECULAR_GLINT} stroke={SVG_LIGHT_RAY} strokeWidth={1} />
              </>
            );
          })()}
        </g>
      ) : null}

      {p.kind === "sumi-moxi05" ? (
        <g data-testid={`svg-cross-${slot}-sumi-moxi05`}>
          <rect x={padX + 26} y={crossBaseY - 6} width={innerW - 52} height={roundSvg(12 + p.carbonSeepageRatio * 14)} rx={4} fill={SVG_WATER_HALO} />
          {Array.from({ length: Math.min(8, p.activeFilaments) }, (_, idx) => {
            const segW = roundSvg((innerW - 96) / Math.max(2, Math.min(8, p.activeFilaments)) * (1 - p.flyingWhiteGapRatio * 0.45));
            const x = roundSvg(padX + 48 + idx * ((innerW - 96) / Math.max(2, Math.min(8, p.activeFilaments))));
            return <rect key={idx} x={x} y={crossBaseY - 8} width={Math.max(5, segW)} height={14} rx={2} fill={pigmentSolid} fillOpacity={0.86} />;
          })}
        </g>
      ) : null}

      {p.kind === "drymedia-sousa99" ? (
        <g data-testid={`svg-cross-${slot}-drymedia-sousa99`}>
          {PAPER_PEAK_OFFSETS.map((peak, idx) => {
            const x = roundSvg(padX + (idx / (PAPER_PEAK_OFFSETS.length - 1)) * innerW);
            const y = roundSvg(crossBaseY - peak * 18);
            const caught = peak >= p.peakClippingRatio * 0.62 || p.valleyFill > 0.65;
            return caught ? (
              <rect key={idx} x={roundSvg(x - 6)} y={roundSvg(y - 4 - p.valleyFill * 4)} width={12} height={roundSvg(4 + p.valleyFill * 6)} rx={1.5} fill={pigmentSolid} />
            ) : null;
          })}
        </g>
      ) : null}

      {p.kind === "gpen-loopblinn05" ? (
        <g data-testid={`svg-cross-${slot}-gpen-loopblinn05`}>
          {(() => {
            const inkW = roundSvg(34 + p.nibSplitMm * 96);
            const startX = roundSvg(padX + (innerW - inkW) * 0.5);
            return (
              <>
                <rect x={startX} y={crossBaseY - 15} width={inkW} height={5} fill={pigmentSolid} />
                <line x1={startX} y1={202} x2={startX} y2={crossBaseY - 15} stroke={accentCss} strokeWidth={1.3} strokeDasharray="3 2" />
                <line x1={roundSvg(startX + inkW)} y1={202} x2={roundSvg(startX + inkW)} y2={crossBaseY - 15} stroke={accentCss} strokeWidth={1.3} strokeDasharray="3 2" />
                <text x={padX + innerW * 0.5} y={208} textAnchor="middle" fontSize={9} fontWeight={700} fill={SVG_AXIS_INK}>
                  {`${p.sdfEdgeSharpnessDpi} DPI SDF · ${p.nibSplitMm.toFixed(2)}mm`}
                </text>
              </>
            );
          })()}
        </g>
      ) : null}

      {p.kind === "marker-foil-pbr" ? (
        <g data-testid={`svg-cross-${slot}-marker-foil-pbr`}>
          <rect x={padX + 38} y={crossBaseY - 11} width={innerW - 76} height={14} rx={2} fill={formatOklch(spec.pigmentOklch, roundSvg(0.45 + p.achievedSaturation * 0.45))} />
          <rect x={padX + 42} y={crossBaseY - 16} width={innerW - 84} height={5} rx={2} fill={formatOklch(p.specularTint, 0.94)} stroke={pigmentDeep} strokeWidth={0.8} />
          <line x1={padX + 94} y1={198} x2={padX + innerW * 0.5} y2={crossBaseY - 16} stroke={SVG_LIGHT_RAY} strokeWidth={1.6} />
          <polygon
            points={`${padX + innerW * 0.5},${crossBaseY - 16} ${roundSvg(padX + innerW * 0.5 + 42 - p.metallicRoughness * 26)},198 ${roundSvg(padX + innerW * 0.5 + 68 + p.metallicRoughness * 34)},198`}
            fill={formatOklch(p.specularTint, 0.46)}
          />
        </g>
      ) : null}

      <polyline points={paperContour} fill="none" stroke={SVG_AXIS_INK} strokeOpacity={0.58} strokeWidth={1.2} />
      <text x={padX + 8} y={291} fontSize={9} fill={SVG_AXIS_INK} fillOpacity={0.76}>
        {isEn ? `Thickness ${sim.paintThicknessMm.toFixed(2)}mm · Foley ${spec.foleyProfile.bandLowHz}-${spec.foleyProfile.bandHighHz}Hz` : `두께 ${sim.paintThicknessMm.toFixed(2)}mm · Foley ${spec.foleyProfile.bandLowHz}~${spec.foleyProfile.bandHighHz}Hz`}
      </text>
    </g>
  );
}

function DivergenceAxisCard(props: { readonly axis: BrushDivergenceAxis; readonly isEn: boolean }): ReactElement {
  const { axis, isEn } = props;
  return (
    <div data-testid={`divergence-axis-${axis.id}`} className="space-y-2 rounded-xl border border-line bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg [word-break:keep-all]">{isEn ? axis.labelEn : axis.labelKo}</span>
        <span data-testid={`divergence-score-${axis.id}`} className="font-mono text-xs font-bold text-accent tabular-nums">{`${axis.divergenceScore} / 100`}</span>
      </div>
      <div role="meter" aria-label={isEn ? axis.labelEn : axis.labelKo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={axis.divergenceScore} className="h-2 w-full overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${axis.divergenceScore}%` }} />
      </div>
      <div className="grid grid-cols-1 gap-1.5 text-[11px] sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-raised px-2.5 py-1.5 text-fg-2 [word-break:keep-all]">
          <span className="mr-1 font-mono text-[10px] font-bold text-accent">A</span>
          {isEn ? axis.primarySummaryEn : axis.primarySummaryKo}
        </div>
        <div className="rounded-lg border border-line bg-raised px-2.5 py-1.5 text-fg-2 [word-break:keep-all]">
          <span className="mr-1 font-mono text-[10px] font-bold text-fg">B</span>
          {isEn ? axis.compareSummaryEn : axis.compareSummaryKo}
        </div>
      </div>
      <p className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? axis.architecturalReasonEn : axis.architecturalReasonKo}</p>
    </div>
  );
}

export function StudioSixPhysicsBrushLabPanel(props: StudioSixPhysicsBrushLabPanelProps): ReactElement {
  const isEn = (props.locale ?? "ko") === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();

  const [primaryId, setPrimaryId] = useState<PhysicsBrushEngineId>(props.initialPrimaryId ?? "watercolor-curtis97");
  const [compareId, setCompareId] = useState<PhysicsBrushEngineId>(props.initialCompareId ?? "oil-wetbrush15");
  const [strokeInput, setStrokeInput] = useState<CommonBrushStrokeInput>(DEFAULT_COMMON_STROKE_INPUT);
  const [showManifestJson, setShowManifestJson] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);

  const primarySpec = useMemo(() => getPhysicsBrushEngineSpec(primaryId), [primaryId]);
  const compareSpec = useMemo(() => getPhysicsBrushEngineSpec(compareId), [compareId]);
  const divergence = useMemo(
    () => compareBrushPhysicsDivergence(primaryId, compareId, strokeInput),
    [primaryId, compareId, strokeInput],
  );
  const allSims = useMemo(
    () => SIX_PHYSICS_BRUSH_ENGINES.map((spec) => ({ spec, sim: simulatePhysicsBrushStroke(spec.id, strokeInput) })),
    [strokeInput],
  );
  const manifestBundle = useMemo(
    () => exportBrushPhysicsManifestJson({ primaryId, compareId, input: strokeInput }),
    [primaryId, compareId, strokeInput],
  );

  const handleUpdateStroke = <K extends keyof CommonBrushStrokeInput>(key: K, value: CommonBrushStrokeInput[K]): void => {
    setStrokeInput((prev) => ({ ...prev, [key]: value }));
  };
  const handleSwapEngines = (): void => {
    setPrimaryId(compareId);
    setCompareId(primaryId);
  };
  const handleResetStroke = (): void => {
    setStrokeInput(DEFAULT_COMMON_STROKE_INPUT);
  };
  const handleExportManifest = (): void => {
    props.onExportJson?.(manifestBundle.json, manifestBundle.manifest);
    setShowManifestJson(true);
    setCopiedNotice(true);
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(manifestBundle.json).catch(() => undefined);
    }
  };

  const activeCitations = primarySpec.id === compareSpec.id ? [primarySpec] : [primarySpec, compareSpec];

  return (
    <section
      data-testid="studio-six-physics-brush-lab"
      aria-label={pick("6대 학술 논문 기반 독립 물리 브러시 개성 엔진 비교 랩", "6-Paper Independent Physics Brush Lab")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${props.className ?? ""}`.trim()}
    >
      {/* 헤더 및 주요 동작 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-[11px] font-semibold text-accent [word-break:keep-all]">
            <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("Wave 53D · 슬라이더 조절이 아닌 6대 독립 물리 파이프라인", "Wave 53D · 6 Independent Physics Pipelines (Not Slider Tweaks)")}
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("6대 학술 논문 기반 독립 물리 브러시 개성 엔진 비교 랩", "6-Paper Independent Physics Brush Personality Lab")}
          </h2>
          <p className="max-w-3xl text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "수채·유화·먹물·건식·G펜·알코올 포일에 똑같은 펜 획을 넣어 상태 버퍼, 지배 방정식, WGSL 패스, 물리 단면이 왜 근본적으로 갈라지는지 즉시 비교한다.",
              "Feed the exact same pen stroke into 6 paper-backed physics solvers to inspect distinct GPU buffers, equations, WGSL passes, and physical cross-sections.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="swap-engines-btn" onClick={handleSwapEngines} className={BTN_OUTLINE}>
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("A ↔ B 맞바꾸기", "Swap A ↔ B")}
          </button>
          <button type="button" data-testid="reset-stroke-btn" onClick={handleResetStroke} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("입력 초기화", "Reset Stroke")}
          </button>
          <button type="button" data-testid="export-physics-manifest-btn" onClick={handleExportManifest} className={BTN_SOLID}>
            {copiedNotice ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {copiedNotice ? pick("JSON·WGSL 복사됨", "Copied JSON/WGSL") : pick("JSON·WGSL 내보내기", "Export JSON/WGSL")}
          </button>
        </div>
      </div>

      {/* 6대 독립 물리 엔진 카드 + A/B 비교 선택기 */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("6대 독립 물리 엔진 선택 (기준 A · 비교 B)", "Select Two Independent Physics Engines (Primary A · Compare B)")}
          </h3>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">
            {`A: ${primarySpec.paperCitation.shortLabel}  vs  B: ${compareSpec.paperCitation.shortLabel}`}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {allSims.map(({ spec, sim }) => {
            const isPrimary = primaryId === spec.id;
            const isCompare = compareId === spec.id;
            return (
              <article
                key={spec.id}
                data-testid={`engine-card-${spec.id}`}
                className={`flex flex-col justify-between space-y-2.5 rounded-xl border p-3.5 ${isPrimary || isCompare ? "border-accent bg-raised" : "border-line bg-card"}`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: formatOklch(spec.pigmentOklch) }} aria-hidden="true" />
                      {isEn ? spec.nameEn : spec.nameKo}
                    </span>
                    <span className="rounded-full border border-line bg-card px-2 py-0.5 font-mono text-[10px] text-fg-2">
                      {isEn ? spec.familyTagEn : spec.familyTagKo}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-accent">{`${spec.paperCitation.shortLabel} · ${spec.wgslPipeline.pipelineId}`}</p>
                  <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? spec.thesisEn : spec.thesisKo}</p>
                  <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px] tabular-nums">
                    <div className="rounded-lg border border-line bg-card px-2 py-1">
                      <div className="text-[10px] text-fg-3 [word-break:keep-all]">{isEn ? sim.signatureMetricLabelEn : sim.signatureMetricLabelKo}</div>
                      <div data-testid={`card-metric-${spec.id}`} className="font-mono font-bold text-fg">{sim.signatureMetricValue}</div>
                    </div>
                    <div className="rounded-lg border border-line bg-card px-2 py-1">
                      <div className="text-[10px] text-fg-3 [word-break:keep-all]">{isEn ? sim.secondaryMetricLabelEn : sim.secondaryMetricLabelKo}</div>
                      <div className="font-mono font-bold text-fg">{sim.secondaryMetricValue}</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button type="button" data-testid={`select-primary-${spec.id}`} aria-pressed={isPrimary} onClick={() => setPrimaryId(spec.id)} className={isPrimary ? BTN_ACTIVE : BTN_OUTLINE}>
                    {isPrimary ? pick("기준 A 선택됨", "Primary A On") : pick("기준 A 지정", "Set Primary A")}
                  </button>
                  <button type="button" data-testid={`select-compare-${spec.id}`} aria-pressed={isCompare} onClick={() => setCompareId(spec.id)} className={isCompare ? BTN_ACTIVE : BTN_OUTLINE}>
                    {isCompare ? pick("비교 B 선택됨", "Compare B On") : pick("비교 B 지정", "Set Compare B")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* 공통 펜 입력 스트로크 시뮬레이터 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("공통 입력 펜 획 (두 엔진에 동일 스트로크 동시 주입)", "Common Stroke Input (Identical Pen Input to Both Engines)")}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {STROKE_SCENARIO_PRESETS.map((preset) => (
              <button
                key={preset.id} type="button" data-testid={`stroke-preset-${preset.id}`}
                onClick={() => setStrokeInput(preset.input)} title={isEn ? preset.hintEn : preset.hintKo} className={BTN_OUTLINE}
              >
                {isEn ? preset.labelEn : preset.labelKo}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StrokeSlider id={`${uid}-pressure`} testId="slider-pressure" label={pick("필압 (Pressure)", "Pressure")} readout={`${Math.round(strokeInput.pressure * 100)}%`} hint={pick("유화 두께·G펜 촉 벌어짐·건식 골짜기 압착 제어", "Drives oil thickness, G-pen nib split, dry burnish")} min={0.05} max={1} step={0.05} value={strokeInput.pressure} onChange={(v) => handleUpdateStroke("pressure", v)} />
          <StrokeSlider id={`${uid}-tilt`} testId="slider-tilt" label={pick("펜 기울기 (Tilt)", "Stylus Tilt")} readout={`${strokeInput.tiltDeg}°`} hint={pick("크레용 옆면 섀이딩 폭·유화 브리슬 퍼짐·포일 틴트 변화", "Broadens dry side-shading, bristle splay & foil tilt")} min={0} max={75} step={1} value={strokeInput.tiltDeg} onChange={(v) => handleUpdateStroke("tiltDeg", v)} />
          <StrokeSlider id={`${uid}-velocity`} testId="slider-velocity" label={pick("획 속도 (Velocity)", "Stroke Velocity")} readout={`${strokeInput.velocityPxPerSec} px/s`} hint={pick("고속에서 먹물 갈필 모발 급감 · G펜 끝단 테이퍼 강화", "Fast sweep drops sumi filaments & sharpens G-pen taper")} min={60} max={2800} step={40} value={strokeInput.velocityPxPerSec} onChange={(v) => handleUpdateStroke("velocityPxPerSec", v)} />
          <StrokeSlider id={`${uid}-water`} testId="slider-water" label={pick("물 · 용제 함량", "Water / Solvent Load")} readout={`${Math.round(strokeInput.waterSolventLoad * 100)}%`} hint={pick("수채 백런 농축 비선형 응답 · 유화 희석 · 마커 포화 조절", "Nonlinear watercolor backrun, oil thinning & dye load")} min={0} max={1} step={0.02} value={strokeInput.waterSolventLoad} onChange={(v) => handleUpdateStroke("waterSolventLoad", v)} />
          <StrokeSlider id={`${uid}-absorb`} testId="slider-absorb" label={pick("종이 흡수율", "Paper Absorbency")} readout={`${Math.round(strokeInput.paperAbsorbency * 100)}%`} hint={pick("수채 모세관 당김 · 먹물 LBM 이방성 확산 · 포일 거칠기 변화", "Controls capillary pull, LBM fiber diffusion & foil α")} min={0.1} max={1} step={0.02} value={strokeInput.paperAbsorbency} onChange={(v) => handleUpdateStroke("paperAbsorbency", v)} />
          <StrokeSlider id={`${uid}-passes`} testId="slider-passes" label={pick("겹칠 횟수", "Repeat Passes")} readout={pick(`${strokeInput.repeatPasses}회`, `${strokeInput.repeatPasses} passes`)} hint={pick("크레용 버니싱 누적 · 마커 비혼탁 포화 상한 수렴 확인", "Verifies crayon valley burnishing vs clean marker cap")} min={1} max={5} step={1} value={strokeInput.repeatPasses} onChange={(v) => handleUpdateStroke("repeatPasses", v)} />
        </div>
      </div>

      {/* 순수 시맨틱 SVG 2단 물리 단면·에지 거동 비교 프리뷰 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">
            {pick("동일 펜 획 2단 물리 단면 · 에지 거동 비교 프리뷰 (순수 OKLCH SVG)", "Side-by-Side Physical Cross-Section & Edge Behavior Preview (Pure OKLCH SVG)")}
          </h3>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">
            {`P=${Math.round(strokeInput.pressure * 100)}% · T=${strokeInput.tiltDeg}° · V=${strokeInput.velocityPxPerSec}px/s · W=${Math.round(strokeInput.waterSolventLoad * 100)}%`}
          </span>
        </div>
        <svg
          data-testid="six-physics-comparison-svg"
          data-primary-engine={primaryId}
          data-compare-engine={compareId}
          viewBox="0 0 744 318"
          role="img"
          aria-label={pick(`${primarySpec.nameKo}와 ${compareSpec.nameKo}의 동일 획 물리 단면·에지 비교 도해`, `Physical cross-section and edge behavior comparison between ${primarySpec.nameEn} and ${compareSpec.nameEn}`)}
          className="h-auto w-full rounded-xl border border-line bg-card text-fg"
        >
          <PhysicsEngineSvgColumn slot="primary" offsetX={12} spec={primarySpec} sim={divergence.primarySim} isEn={isEn} />
          <line x1={372} y1={16} x2={372} y2={302} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="4 4" />
          <PhysicsEngineSvgColumn slot="compare" offsetX={380} spec={compareSpec} sim={divergence.compareSim} isEn={isEn} />
        </svg>
      </div>

      {/* 6축 아키텍처 개성 분화 정량 검증기 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("6축 아키텍처 개성 분화 정량 검증 (compareBrushPhysicsDivergence)", "6-Axis Architectural Divergence Quantifier")}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="divergence-overall-badge" className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${divergence.isDistinctArchitecture ? "border-good bg-good-soft text-good" : "border-warn bg-warning-soft text-warn"}`}>
              {pick(`분화도 ${divergence.overallDivergenceScore} / 100`, `Divergence ${divergence.overallDivergenceScore} / 100`)}
            </span>
            <span data-testid="shared-buffer-overlap-badge" className="rounded-full border border-line bg-card px-2.5 py-0.5 font-mono text-[11px] text-fg-2 tabular-nums">
              {pick(`공유 버퍼 ${divergence.sharedBufferOverlapPct}%`, `Shared Buffers ${divergence.sharedBufferOverlapPct}%`)}
            </span>
          </div>
        </div>
        <p data-testid="divergence-verdict-banner" className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
          {isEn ? divergence.verdictEn : divergence.verdictKo}
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {divergence.axes.map((axis) => <DivergenceAxisCard key={axis.id} axis={axis} isEn={isEn} />)}
        </div>
      </div>

      {/* 학술 논문 출처 + GPU 상태 버퍼 + WGSL 파이프라인 카드 */}
      <div className="space-y-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
          <BookOpen className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          {pick("선택 엔진 학술 논문 출처 · GPU 상태 버퍼 · 전용 WGSL 패스", "Active Academic Citations · GPU State Buffers · Dedicated WGSL Passes")}
        </h3>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {activeCitations.map((spec) => (
            <div key={spec.id} data-testid={`citation-card-${spec.id}`} className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? spec.nameEn : spec.nameKo}</span>
                <span className="rounded-md border border-line bg-card px-2 py-0.5 font-mono text-[10px] text-accent">{spec.paperCitation.venueYear}</span>
              </div>
              <p className="text-xs font-semibold text-fg [word-break:keep-all]">{spec.paperCitation.paperTitle}</p>
              <p className="text-[11px] text-fg-3">{spec.paperCitation.authors}</p>
              <p className="rounded-lg border border-line bg-card px-2.5 py-1.5 font-mono text-[10px] text-fg-2 [word-break:keep-all]">
                {isEn ? spec.paperCitation.equationSummaryEn : spec.paperCitation.equationSummaryKo}
              </p>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-fg-2">
                  <Cpu className="h-3 w-3 text-accent" aria-hidden="true" />
                  {`${spec.wgslPipeline.pipelineId} (${spec.wgslPipeline.passNames.join(" → ")})`}
                </div>
                <ul className="space-y-1 text-[11px] text-fg-3">
                  {spec.stateBuffers.map((buf) => (
                    <li key={buf.id} className="flex flex-wrap items-center justify-between gap-1 rounded border border-line bg-card px-2 py-1 font-mono text-[10px]">
                      <span className="text-fg">{buf.id}</span>
                      <span className="tabular-nums">{`${buf.format} · ${buf.bytesPerTexel}B`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* JSON/WGSL 매니페스트 미리보기 및 정직성 고지 */}
      <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg [word-break:keep-all]">
            {pick("전용 JSON / WGSL 파이프라인 매니페스트", "Dedicated JSON / WGSL Pipeline Manifest")}
          </span>
          <button type="button" data-testid="toggle-manifest-json-btn" onClick={() => setShowManifestJson((prev) => !prev)} className={BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {showManifestJson ? pick("매니페스트 숨기기", "Hide Manifest") : pick("매니페스트 보기", "Show Manifest")}
          </button>
        </div>
        <p data-testid="physics-honesty-note" className="text-[11px] text-fg-3 [word-break:keep-all]">
          {isEn ? manifestBundle.manifest.honestyNoteEn : manifestBundle.manifest.honestyNoteKo}
        </p>
        {showManifestJson ? (
          <pre data-testid="physics-manifest-json-preview" className="max-h-64 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
            {manifestBundle.json}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
