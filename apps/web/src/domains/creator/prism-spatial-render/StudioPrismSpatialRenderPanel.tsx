/**
 * Wave 60D — PrismRender 계층적 Hi-Z 차폐 컬링 · 24×24 공간 해시 브러시 동역학 · 2.5D 신경망 깊이 합성 제어판.
 *
 * - Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건, 바이올렛 휴 270~320° 0%)
 * - 순수 시맨틱 SVG 2단 시각화:
 *   좌: AtelierStage 3D 씬 탑다운 프러스텀·Hi-Z 차폐 컬링·LOD 0..3 분포
 *   우: 4층 2.5D 깊이 Z-분리 마스크(0.0~1.0) 및 N×N 공간 해시 브러시 입자 격자
 */

import { Box, CheckCircle2, Copy, Eye, Grid2x2, Layers, RotateCcw, ScanEye, SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import {
  DEFAULT_BRISTLE_PARTICLES, DEFAULT_DEPTH_SEPARATION, DEFAULT_HIZ_ENABLED, DEFAULT_LOD_BIAS,
  DEFAULT_SPATIAL_HASH_GRID_SIZE, MAX_BRISTLE_PARTICLES, MAX_DEPTH_SEPARATION, MAX_LOD_BIAS,
  MAX_SPATIAL_HASH_GRID_SIZE, MIN_BRISTLE_PARTICLES, MIN_DEPTH_SEPARATION, MIN_LOD_BIAS,
  MIN_SPATIAL_HASH_GRID_SIZE, PRISM_SCENE_PRESETS, buildPrismSpatialRenderReport, exportPrismSpatialRenderJson,
  getPrismScenePreset, type NeuralDepth25DResult, type PrismHiZCullingResult, type PrismLodLevel,
  type PrismSceneId, type PrismSpatialRenderInput, type PrismSpatialRenderReport, type SpatialHashBristleResult,
} from "./prism-spatial-render-engine";

export interface StudioPrismSpatialRenderPanelProps {
  readonly initialSceneId?: PrismSceneId;
  readonly initialHiZEnabled?: boolean;
  readonly initialLodBias?: number;
  readonly initialGridSize?: number;
  readonly initialParticleCount?: number;
  readonly initialDepthSeparation?: number;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onReportChange?: (report: PrismSpatialRenderReport) => void;
  readonly onExportJson?: (json: string, report: PrismSpatialRenderReport) => void;
}

// 탈-바이올렛 OKLCH SVG 시맨틱 잉크(휴 196°·154°·76°·220°·34°·156°·62° — 270~320° 완전 배제)
const SVG_INK_LOD0 = "oklch(0.74 0.15 196)";
const SVG_INK_LOD1 = "oklch(0.75 0.15 154)";
const SVG_INK_LOD2 = "oklch(0.80 0.14 76)";
const SVG_INK_LOD3 = "oklch(0.66 0.08 220)";
const SVG_INK_HIZ = "oklch(0.68 0.17 34)";
const SVG_INK_GOOD = "oklch(0.73 0.16 156)";
const SVG_INK_WARN = "oklch(0.79 0.15 62)";

const LOD_INKS: Readonly<Record<PrismLodLevel, string>> = { 0: SVG_INK_LOD0, 1: SVG_INK_LOD1, 2: SVG_INK_LOD2, 3: SVG_INK_LOD3 };
const DEPTH_LAYER_INKS = [SVG_INK_LOD0, SVG_INK_LOD1, SVG_INK_LOD2, SVG_INK_LOD3] as const;

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

function buildInitialInput(props: StudioPrismSpatialRenderPanelProps): PrismSpatialRenderInput {
  return {
    sceneId: getPrismScenePreset(props.initialSceneId).id,
    hiZEnabled: typeof props.initialHiZEnabled === "boolean" ? props.initialHiZEnabled : DEFAULT_HIZ_ENABLED,
    lodBias: typeof props.initialLodBias === "number" ? props.initialLodBias : DEFAULT_LOD_BIAS,
    gridSize: typeof props.initialGridSize === "number" ? props.initialGridSize : DEFAULT_SPATIAL_HASH_GRID_SIZE,
    particleCount: typeof props.initialParticleCount === "number" ? props.initialParticleCount : DEFAULT_BRISTLE_PARTICLES,
    depthSeparationStrength: typeof props.initialDepthSeparation === "number" ? props.initialDepthSeparation : DEFAULT_DEPTH_SEPARATION,
  };
}

function PrismTopDownCullingSvg(props: { readonly report: PrismSpatialRenderReport; readonly isEn: boolean }): ReactElement {
  const { report, isEn } = props;
  const culling: PrismHiZCullingResult = report.culling;
  const scene = report.scene;

  const mapX = 14; const mapY = 46; const mapW = 448; const mapH = 198;
  const camX = mapX + mapW * 0.5; const camY = mapY + mapH - 12;
  const spanX = mapW * 0.44; const spanZ = mapH - 26;
  const halfFovRad = ((report.config.cameraFovDeg * 0.5) * Math.PI) / 180;
  const frustumDx = Math.min(spanX, Math.tan(halfFovRad) * spanZ);
  const frustumTopY = camY - spanZ;

  const toSvgX = (xNorm: number): number => camX + xNorm * spanX;
  const toSvgY = (zNorm: number): number => camY - zNorm * spanZ;
  const baseBarW = 300;
  const frustumBarW = Math.max(8, (culling.frustumOnlyDrawCalls / Math.max(1, culling.baselineDrawCalls)) * baseBarW);
  const finalBarW = Math.max(6, (culling.finalDrawCalls / Math.max(1, culling.baselineDrawCalls)) * baseBarW);

  return (
    <svg
      data-testid="prism-topdown-culling-svg" data-scene-id={culling.sceneId} data-hiz-enabled={String(culling.hiZEnabled)}
      data-total-objects={culling.totalObjects} data-surviving-objects={culling.survivingObjects}
      data-hiz-occluded={culling.hiZOccludedObjects} data-drawcall-reduction-pct={culling.drawCallReductionPct}
      data-model-kind={report.modelKind} viewBox="0 0 476 346" role="img"
      className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn
        ? `PrismRender top-down frustum and Hi-Z occlusion view for ${scene.labelEn}: ${culling.survivingObjects} of ${culling.totalObjects} objects surviving, ${culling.drawCallReductionPct}% draw-call reduction`
        : `PrismRender 탑다운 프러스텀 및 Hi-Z 차폐 뷰(${scene.labelKo}): 전체 ${culling.totalObjects}개 중 ${culling.survivingObjects}개 생존, 드로우콜 ${culling.drawCallReductionPct}% 절감`}
    >
      <text x={14} y={20} fill="currentColor" fontSize="11" fontWeight="700">
        {isEn ? "PRISM RENDER · TOP-DOWN FRUSTUM & HI-Z OCCLUSION" : "PrismRender · 탑다운 프러스텀 & Hi-Z 차폐 컬링"}
      </text>
      <text x={14} y={35} fill="currentColor" fillOpacity={0.68} fontSize="9.2">
        {isEn
          ? `${scene.labelEn} (${culling.totalObjects.toLocaleString("en-US")} obj) · Hi-Z ${culling.hiZEnabled ? `ON (${culling.hiZPyramidMips.length} mips)` : "OFF"} · LOD Bias ${report.config.lodBias.toFixed(2)}`
          : `${scene.labelKo}(${culling.totalObjects.toLocaleString("en-US")}객체) · Hi-Z ${culling.hiZEnabled ? `활성(${culling.hiZPyramidMips.length}밉)` : "비활성"} · LOD 바이어스 ${report.config.lodBias.toFixed(2)}`}
      </text>

      <rect x={mapX} y={mapY} width={mapW} height={mapH} rx={8} fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.16} />

      {[0.24, 0.48, 0.74, 0.96].map((ring, idx) => {
        const r = ring * spanZ;
        const ink = LOD_INKS[idx as PrismLodLevel] ?? SVG_INK_LOD3;
        return (
          <path key={ring} d={`M ${camX - r * 0.72} ${camY - r * 0.69} A ${r} ${r} 0 0 1 ${camX + r * 0.72} ${camY - r * 0.69}`} fill="none" stroke={ink} strokeOpacity={0.34} strokeDasharray="3 3" />
        );
      })}

      <polygon points={`${camX},${camY} ${camX - frustumDx},${frustumTopY} ${camX + frustumDx},${frustumTopY}`} fill={SVG_INK_LOD0} fillOpacity={0.09} stroke={SVG_INK_LOD0} strokeOpacity={0.62} strokeWidth="1.2" />

      {culling.occluderRects.map((rect) => {
        const rx1 = toSvgX(rect.xMin); const rx2 = toSvgX(rect.xMax);
        const ryTop = toSvgY(rect.zMax); const ryBot = toSvgY(rect.zMin);
        const shadowScale = 1 / Math.max(0.18, rect.zMax);
        const farX1 = Math.max(mapX + 6, Math.min(mapX + mapW - 6, toSvgX(rect.xMin * shadowScale)));
        const farX2 = Math.max(mapX + 6, Math.min(mapX + mapW - 6, toSvgX(rect.xMax * shadowScale)));
        return (
          <g key={rect.id} data-occluder-id={rect.id}>
            {culling.hiZEnabled && (
              <polygon points={`${rx1},${ryTop} ${rx2},${ryTop} ${farX2},${frustumTopY} ${farX1},${frustumTopY}`} fill={SVG_INK_HIZ} fillOpacity={0.14} stroke={SVG_INK_HIZ} strokeOpacity={0.32} strokeDasharray="3 2" />
            )}
            <rect x={rx1} y={ryTop} width={Math.max(8, rx2 - rx1)} height={Math.max(6, ryBot - ryTop)} rx={2} fill={SVG_INK_HIZ} fillOpacity={0.78} stroke={SVG_INK_HIZ} strokeWidth="1" />
          </g>
        );
      })}

      {culling.topDownSamples.map((node) => {
        const nx = toSvgX(node.xNorm); const ny = toSvgY(node.zNorm);
        if (node.state === "visible" && node.lod !== null) {
          return <circle key={node.id} cx={nx} cy={ny} r={3.4} fill={LOD_INKS[node.lod]} fillOpacity={0.92} stroke="currentColor" strokeOpacity={0.25} strokeWidth="0.6" />;
        }
        if (node.state === "hiz-culled") {
          return <circle key={node.id} cx={nx} cy={ny} r={3.2} fill="none" stroke={SVG_INK_HIZ} strokeWidth="1.2" strokeDasharray="2 1.5" />;
        }
        return <circle key={node.id} cx={nx} cy={ny} r={2.2} fill="currentColor" fillOpacity={0.22} />;
      })}

      <polygon points={`${camX},${camY - 6} ${camX - 6},${camY + 5} ${camX + 6},${camY + 5}`} fill={SVG_INK_LOD0} />
      <text x={camX + 12} y={camY + 4} fill="currentColor" fillOpacity={0.75} fontSize="8.2" fontWeight="700">{`CAM FOV ${report.config.cameraFovDeg}°`}</text>

      <g transform="translate(22, 58)">
        <circle cx={4} cy={4} r={3} fill={SVG_INK_LOD0} /><text x={11} y={7} fill="currentColor" fillOpacity={0.82} fontSize="7.8">L0</text>
        <circle cx={32} cy={4} r={3} fill={SVG_INK_LOD1} /><text x={39} y={7} fill="currentColor" fillOpacity={0.82} fontSize="7.8">L1</text>
        <circle cx={60} cy={4} r={3} fill={SVG_INK_LOD2} /><text x={67} y={7} fill="currentColor" fillOpacity={0.82} fontSize="7.8">L2</text>
        <circle cx={88} cy={4} r={3} fill={SVG_INK_LOD3} /><text x={95} y={7} fill="currentColor" fillOpacity={0.82} fontSize="7.8">L3</text>
        <circle cx={120} cy={4} r={3} fill="none" stroke={SVG_INK_HIZ} strokeWidth="1.2" strokeDasharray="2 1" />
        <text x={127} y={7} fill={SVG_INK_HIZ} fontSize="7.8" fontWeight="600">{isEn ? "Hi-Z Culled" : "Hi-Z 차폐 제거"}</text>
      </g>

      <g transform="translate(14, 254)">
        <rect x={0} y={0} width={448} height={82} rx={8} fill="currentColor" fillOpacity={0.04} stroke="currentColor" strokeOpacity={0.14} />
        <text x={10} y={16} fill="currentColor" fontSize="8.6" fontWeight="700">
          {isEn
            ? `DRAW-CALL BUDGET · -${culling.drawCallReductionPct}% (${culling.baselineDrawCalls} -> ${culling.finalDrawCalls})`
            : `드로우콜 절감 모델 · -${culling.drawCallReductionPct}% (${culling.baselineDrawCalls} → ${culling.finalDrawCalls})`}
        </text>
        <text x={10} y={32} fill="currentColor" fillOpacity={0.7} fontSize="8">{isEn ? "Baseline" : "기본 전체"}</text>
        <rect x={82} y={24} width={baseBarW} height={8} rx={3} fill="currentColor" fillOpacity={0.22} />
        <text x={390} y={31} fill="currentColor" fillOpacity={0.8} fontSize="8">{culling.baselineDrawCalls}</text>

        <text x={10} y={47} fill={SVG_INK_WARN} fontSize="8">{isEn ? "Frustum" : "프러스텀"}</text>
        <rect x={82} y={39} width={frustumBarW} height={8} rx={3} fill={SVG_INK_WARN} fillOpacity={0.78} />
        <text x={390} y={46} fill={SVG_INK_WARN} fontSize="8">{culling.frustumOnlyDrawCalls}</text>

        <text x={10} y={62} fill={SVG_INK_GOOD} fontSize="8" fontWeight="700">{isEn ? "Hi-Z+LOD" : "Hi-Z+LOD"}</text>
        <rect x={82} y={54} width={finalBarW} height={8} rx={3} fill={SVG_INK_GOOD} fillOpacity={0.9} />
        <text x={390} y={61} fill={SVG_INK_GOOD} fontSize="8" fontWeight="700">{culling.finalDrawCalls}</text>

        <text x={10} y={76} fill="currentColor" fillOpacity={0.74} fontSize="7.9">
          {culling.lodBreakdown.map((tier) => `LOD${tier.lod}: ${tier.objectCount} (${tier.drawCalls}dc)`).join("  ·  ")}
        </text>
      </g>
    </svg>
  );
}

function PrismDepthSpatialHashSvg(props: {
  readonly depth: NeuralDepth25DResult;
  readonly hash: SpatialHashBristleResult;
  readonly isEn: boolean;
}): ReactElement {
  const { depth, hash, isEn } = props;
  const gridX = 252; const gridY = 52; const gridPx = 204;
  const cellPx = gridPx / hash.gridSize;
  const polylinePoints = hash.vectorBoundaryPolyline.map((pt) => `${(gridX + pt.x * gridPx).toFixed(1)},${(gridY + pt.y * gridPx).toFixed(1)}`).join(" ");
  const depthBarX = 22; const depthBarW = 192;
  const focalLineX = depthBarX + depth.focalDepth * depthBarW;

  return (
    <svg
      data-testid="prism-depth-spatial-hash-svg" data-grid-size={hash.gridSize} data-total-cells={hash.totalCellCount}
      data-particle-count={hash.particleCount} data-bruteforce-pairs={hash.bruteForcePairs}
      data-checked-pairs={hash.spatialHashCheckedPairs} data-pair-reduction-factor={hash.pairReductionFactor}
      data-depth-layers={depth.layerCount} data-depth-separation={depth.depthSeparationStrength}
      viewBox="0 0 476 346" role="img" className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn
        ? `4-layer 2.5D depth Z-separation mask (0.0 to 1.0) and ${hash.gridSize}x${hash.gridSize} spatial hash bristle grid (${hash.pairReductionFactor}x pair reduction)`
        : `4층 2.5D 신경망 깊이 Z-분리 마스크(0.0~1.0) 및 ${hash.gridSize}×${hash.gridSize} 공간 해시 브러시 격자(탐색 쌍 ${hash.pairReductionFactor}배 절감)`}
    >
      <text x={14} y={20} fill="currentColor" fontSize="11" fontWeight="700">
        {isEn ? "2.5D 4-LAYER DEPTH Z-MASK · SPATIAL HASH BRISTLE GRID" : "2.5D 4층 깊이 Z-분리 마스크 · 공간 해시 브러시 격자"}
      </text>
      <text x={14} y={35} fill="currentColor" fillOpacity={0.68} fontSize="9.2">
        {isEn
          ? `Depth 0.0~1.0 (Sep ${Math.round(depth.depthSeparationStrength * 100)}%) · Grid ${hash.gridSize}×${hash.gridSize} (${hash.totalCellCount} cells) · ${hash.particleCount} bristles`
          : `깊이 0.0~1.0(분리 ${Math.round(depth.depthSeparationStrength * 100)}%) · 격자 ${hash.gridSize}×${hash.gridSize}(${hash.totalCellCount}셀) · 입자 ${hash.particleCount}개`}
      </text>

      <rect x={14} y={46} width={220} height={226} rx={8} fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.16} />
      <text x={22} y={62} fill="currentColor" fontSize="8.8" fontWeight="700">
        {isEn ? "4-LAYER Z-DEPTH MAP (0.00 -> 1.00)" : "4층 깊이 맵 · Z-분리 마스크 (0.00~1.00)"}
      </text>

      {depth.layers.map((layer, idx) => {
        const ly = 74 + idx * 38;
        const ink = DEPTH_LAYER_INKS[idx] ?? SVG_INK_LOD3;
        const segX = depthBarX + layer.depthMin * depthBarW;
        const segW = Math.max(12, (layer.depthMax - layer.depthMin) * depthBarW);
        return (
          <g key={layer.id} data-depth-layer-id={layer.id}>
            <text x={depthBarX} y={ly + 8} fill="currentColor" fontSize="8.2" fontWeight="700">{`L${layer.order} · ${isEn ? layer.labelEn : layer.labelKo}`}</text>
            <text x={depthBarX + depthBarW} y={ly + 8} textAnchor="end" fill={ink} fontSize="7.8" fontWeight="700">{`${layer.depthMin.toFixed(2)}–${layer.depthMax.toFixed(2)} · ±${layer.parallaxShiftPx}px`}</text>
            <rect x={depthBarX} y={ly + 13} width={depthBarW} height={12} rx={3} fill="currentColor" fillOpacity={0.08} />
            <rect x={segX} y={ly + 13} width={segW} height={12} rx={3} fill={ink} fillOpacity={0.78} />
            <text x={segX + 4} y={ly + 22} fill="currentColor" fontSize="7.2" fontWeight="700">{`${layer.zMaskCoveragePct}%`}</text>
          </g>
        );
      })}

      <line x1={focalLineX} y1={72} x2={focalLineX} y2={224} stroke={SVG_INK_GOOD} strokeWidth="1.2" strokeDasharray="3 2" />

      <g transform="translate(22, 234)">
        <text x={0} y={8} fill="currentColor" fillOpacity={0.7} fontSize="7.6">{isEn ? "12-Col Depth Profile" : "12칼럼 깊이 프로파일"}</text>
        {depth.depthProfileColumns.map((col) => {
          const barH = Math.max(4, Math.round((1 - col.depthValue) * 20));
          const layerIdx = col.layerId === "foreground-character" ? 0 : col.layerId === "midground-props" ? 1 : col.layerId === "background-architecture" ? 2 : 3;
          return <rect key={col.index} x={col.index * 16} y={32 - barH} width={12} height={barH} rx={2} fill={DEPTH_LAYER_INKS[layerIdx]} fillOpacity={0.85} />;
        })}
      </g>

      <rect x={gridX - 6} y={46} width={gridPx + 12} height={226} rx={8} fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.16} />
      {[0, 1, 2, 3, 4, 5, 6].map((step) => {
        const offset = (step / 6) * gridPx;
        return (
          <g key={step}>
            <line x1={gridX + offset} y1={gridY} x2={gridX + offset} y2={gridY + gridPx} stroke="currentColor" strokeOpacity={0.12} />
            <line x1={gridX} y1={gridY + offset} x2={gridX + gridPx} y2={gridY + offset} stroke="currentColor" strokeOpacity={0.12} />
          </g>
        );
      })}

      {hash.hotCells.map((cell) => (
        <rect
          key={`${cell.cx}-${cell.cy}`} x={gridX + cell.cx * cellPx} y={gridY + cell.cy * cellPx}
          width={Math.max(2, cellPx - 0.6)} height={Math.max(2, cellPx - 0.6)}
          fill={cell.hasBoundaryHit ? SVG_INK_HIZ : SVG_INK_WARN} fillOpacity={0.18 + cell.pigmentDensity * 0.5}
          stroke={cell.hasBoundaryHit ? SVG_INK_HIZ : SVG_INK_LOD1} strokeOpacity={cell.hasBoundaryHit ? 0.7 : 0.25} strokeWidth="0.6"
        />
      ))}

      <polyline points={polylinePoints} fill="none" stroke={SVG_INK_HIZ} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {hash.sampleParticles.map((p) => (
        <circle key={p.id} cx={gridX + p.x * gridPx} cy={gridY + p.y * gridPx} r={p.boundaryHit ? 2.6 : 1.9} fill={p.boundaryHit ? SVG_INK_HIZ : p.clumpDensity > 0.3 ? SVG_INK_WARN : SVG_INK_LOD0} fillOpacity={0.92} />
      ))}

      <text x={gridX} y={266} fill="currentColor" fillOpacity={0.74} fontSize="7.6">
        {isEn
          ? `Occupied ${hash.occupiedCellCount}/${hash.totalCellCount} · Repel ${hash.repulsionInteractions} · Clump ${hash.pigmentClumpPairs} · Hit ${hash.vectorBoundaryCollisions}`
          : `점유 ${hash.occupiedCellCount}/${hash.totalCellCount}셀 · 반발 ${hash.repulsionInteractions} · 뭉침 ${hash.pigmentClumpPairs} · 충돌 ${hash.vectorBoundaryCollisions}`}
      </text>

      <g transform="translate(14, 282)">
        <rect x={0} y={0} width={448} height={54} rx={8} fill="currentColor" fillOpacity={0.04} stroke="currentColor" strokeOpacity={0.14} />
        <text x={10} y={18} fill={SVG_INK_GOOD} fontSize="9" fontWeight="700">
          {isEn
            ? `MEASURED O(1) SPATIAL HASH · ${hash.pairReductionFactor}x FEWER PAIRS (-${hash.pairReductionPct}%)`
            : `실측 O(1) 공간 해시 근접 탐색 · 브루트포스 대비 ${hash.pairReductionFactor}배 절감 (-${hash.pairReductionPct}%)`}
        </text>
        <text x={10} y={34} fill="currentColor" fillOpacity={0.78} fontSize="8.2">
          {isEn
            ? `O(N²) Brute-Force: ${hash.bruteForcePairs.toLocaleString("en-US")} pairs  vs  ${hash.gridSize}×${hash.gridSize} Hash 3×3 Lookup: ${hash.spatialHashCheckedPairs.toLocaleString("en-US")} pairs`
            : `O(N²) 브루트포스: ${hash.bruteForcePairs.toLocaleString("en-US")}쌍  vs  ${hash.gridSize}×${hash.gridSize} 공간 해시 3×3 탐색: ${hash.spatialHashCheckedPairs.toLocaleString("en-US")}쌍`}
        </text>
        <text x={10} y={47} fill="currentColor" fillOpacity={0.68} fontSize="7.8">
          {isEn
            ? `2.5D Parallax Span ${depth.effectiveParallaxSpanPx}px · Z-Seam Conflict ${depth.zMaskOverlapConflictPct}% · Clump Index ${hash.meanPigmentClumpingIndex}`
            : `2.5D 시차 스팬 ${depth.effectiveParallaxSpanPx}px · Z-마스크 경계 충돌 ${depth.zMaskOverlapConflictPct}% · 안료 뭉침 지수 ${hash.meanPigmentClumpingIndex}`}
        </text>
      </g>
    </svg>
  );
}

/** PrismRender 계층적 Hi-Z 차폐 컬링 · 공간 해시 브러시 동역학 · 2.5D 신경망 깊이 합성 제어판. */
export function StudioPrismSpatialRenderPanel(props: StudioPrismSpatialRenderPanelProps): ReactElement {
  const { locale = "ko", className, onReportChange, onExportJson } = props;
  const headingId = useId();
  const lodSliderId = useId();
  const gridSliderId = useId();
  const particleSliderId = useId();
  const depthSliderId = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [inputState, setInputState] = useState<PrismSpatialRenderInput>(() => buildInitialInput(props));
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const report = useMemo(() => buildPrismSpatialRenderReport(inputState), [inputState]);
  const manifestJson = useMemo(() => exportPrismSpatialRenderJson(report), [report]);

  function applyInputUpdate(patch: Partial<PrismSpatialRenderInput>, koMessage: string, enMessage: string): void {
    const nextInput: PrismSpatialRenderInput = { ...inputState, ...patch };
    const nextReport = buildPrismSpatialRenderReport(nextInput);
    setInputState(nextInput);
    onReportChange?.(nextReport);
    setStatusMessage(pick(koMessage, enMessage));
  }

  function handleSelectScene(sceneId: PrismSceneId): void {
    const preset = getPrismScenePreset(sceneId);
    applyInputUpdate(
      { sceneId: preset.id },
      `AtelierStage ${preset.labelKo}(${preset.totalObjects.toLocaleString("en-US")}객체) 씬으로 전환했습니다.`,
      `Switched to AtelierStage ${preset.labelEn} (${preset.totalObjects.toLocaleString("en-US")} objects).`,
    );
  }

  function handleToggleHiZ(): void {
    const nextEnabled = !report.config.hiZEnabled;
    applyInputUpdate(
      { hiZEnabled: nextEnabled },
      nextEnabled ? "Hi-Z 공격적 차폐 컬링을 활성화했습니다." : "Hi-Z 차폐 컬링을 끄고 프러스텀 기준선으로 전환했습니다.",
      nextEnabled ? "Enabled Hi-Z aggressive occlusion culling." : "Disabled Hi-Z culling to compare frustum baseline.",
    );
  }

  function handleCopyJson(): void {
    if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
      void navigator.clipboard.writeText(manifestJson)
        .then(() => {
          if (mountedRef.current) setStatusMessage(pick("PrismRender JSON 매니페스트를 클립보드에 복사했습니다.", "Copied PrismRender JSON manifest to clipboard."));
        })
        .catch(() => {
          if (mountedRef.current) setStatusMessage(pick("클립보드 쓰기에 실패했습니다. 아래 JSON 미리보기를 이용해 주세요.", "Clipboard write failed. Use the JSON preview below."));
        });
      return;
    }
    setShowJsonPreview(true);
    setStatusMessage(pick("클립보드 API가 없어 JSON 미리보기를 열었습니다.", "Clipboard unavailable; opened JSON preview."));
  }

  function handleExportJson(): void {
    setShowJsonPreview(true);
    onExportJson?.(manifestJson, report);
    setStatusMessage(pick("PrismRender JSON 매니페스트를 생성해 미리보기에 표시했습니다.", "Generated PrismRender JSON manifest preview."));
  }

  function handleReset(): void {
    const defaults = buildInitialInput(props);
    const nextReport = buildPrismSpatialRenderReport(defaults);
    setInputState(defaults);
    onReportChange?.(nextReport);
    setStatusMessage(pick("PrismRender 제어 값을 초기값으로 복원했습니다.", "Restored default PrismRender parameters."));
  }

  const { culling, spatialHash, depthSynthesis, config } = report;

  return (
    <section aria-labelledby={headingId} data-testid="studio-prism-spatial-render-panel" className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg ${className ?? ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-accent bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-bold text-accent">
              <ScanEye className="h-3.5 w-3.5" aria-hidden="true" /><span>PrismRender · WAVE 60D</span>
            </span>
            <span data-testid="prism-model-kind" className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[10px] text-fg-3">{report.modelKind}</span>
          </div>
          <h2 id={headingId} className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("PrismRender · Hi-Z 차폐 컬링 · 공간 해시 브러시 · 2.5D 깊이 합성", "PrismRender · Hi-Z Culling, Spatial-Hash Bristle & 2.5D Neural Depth")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "AtelierStage 4종 3D 웹툰 씬의 프러스텀·Hi-Z 차폐 컬링과 LOD 0..3 절감률, 24×24 공간 해시 브러시 근접 탐색 실측, 4층 2.5D 깊이 Z-분리 마스크를 통합 제어합니다.",
              "Inspects AtelierStage 4-scene frustum/Hi-Z occlusion culling and LOD 0..3 draw-call reduction, measured 24×24 spatial-hash bristle pairs, and 4-layer 2.5D depth Z-masks.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="hiz-toggle-btn" aria-pressed={config.hiZEnabled} onClick={handleToggleHiZ} className={config.hiZEnabled ? BTN_ACTIVE : BTN_OUTLINE}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{config.hiZEnabled ? pick("Hi-Z 공격적 차폐: 활성", "Hi-Z Occlusion: ON") : pick("Hi-Z 공격적 차폐: 꺼짐", "Hi-Z Occlusion: OFF")}</span>
          </button>
          <button type="button" data-testid="reset-prism-panel-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("초기값 복원", "Reset")}</span>
          </button>
        </div>
      </div>

      {/* 2단 순수 시맨틱 SVG 시각화 */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <PrismTopDownCullingSvg report={report} isEn={isEn} />
        <PrismDepthSpatialHashSvg depth={depthSynthesis} hash={spatialHash} isEn={isEn} />
      </div>

      {/* AtelierStage 4종 3D 웹툰 씬 선택기 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Box className="h-3.5 w-3.5 text-accent" aria-hidden="true" /><span>{pick("AtelierStage 3D 웹툰 씬 프리셋 (4종)", "AtelierStage 3D Webtoon Scene Presets (4)")}</span>
          </div>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${report.scene.totalObjects.toLocaleString("en-US")} obj · ${report.scene.worldExtentMeters}m`}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label={pick("3D 웹툰 씬 선택", "Select 3D webtoon scene")}>
          {PRISM_SCENE_PRESETS.map((preset) => (
            <button
              key={preset.id} type="button" data-testid={`scene-btn-${preset.id}`} aria-pressed={preset.id === config.sceneId}
              onClick={() => handleSelectScene(preset.id)}
              className={`${preset.id === config.sceneId ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start justify-start px-3 py-2.5 text-left`}
            >
              <span className="text-xs font-bold">{isEn ? preset.labelEn : preset.labelKo}</span>
              <span className="font-mono text-[11px] font-semibold tabular-nums">{`${preset.totalObjects.toLocaleString("en-US")} ${pick("객체", "objects")}`}</span>
              <span className="text-[10px] font-normal text-fg-2 [word-break:keep-all]">{isEn ? preset.summaryEn : preset.summaryKo}</span>
            </button>
          ))}
        </div>
      </div>

      {/* LOD · 공간 해시 셀 · 입자 · 깊이 4종 슬라이더 */}
      <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
          <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick("LOD · 공간 해시 셀 · 브러시 모 입자 · 2.5D 깊이 제어", "LOD, Spatial Hash Cells, Bristle Particles & 2.5D Depth Controls")}</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor={lodSliderId} className="font-semibold text-fg-2 [word-break:keep-all]">{pick("LOD 거리 바이어스", "LOD Distance Bias")}</label>
              <span data-testid="lod-bias-readout" className="font-mono font-bold text-fg tabular-nums">{config.lodBias >= 0 ? `+${config.lodBias.toFixed(2)}` : config.lodBias.toFixed(2)}</span>
            </div>
            <input id={lodSliderId} data-testid="lod-bias-slider" type="range" min={MIN_LOD_BIAS} max={MAX_LOD_BIAS} step={0.25} value={config.lodBias} onChange={(e) => applyInputUpdate({ lodBias: Number(e.target.value) }, `LOD 바이어스를 ${Number(e.target.value).toFixed(2)}로 조정했습니다.`, `Adjusted LOD bias to ${Number(e.target.value).toFixed(2)}.`)} className={`h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor={gridSliderId} className="font-semibold text-fg-2 [word-break:keep-all]">{pick("공간 해시 셀 격자", "Spatial Hash Grid")}</label>
              <span data-testid="grid-size-readout" className="font-mono font-bold text-fg tabular-nums">{`${config.gridSize}×${config.gridSize}`}</span>
            </div>
            <input id={gridSliderId} data-testid="grid-size-slider" type="range" min={MIN_SPATIAL_HASH_GRID_SIZE} max={MAX_SPATIAL_HASH_GRID_SIZE} step={4} value={config.gridSize} onChange={(e) => applyInputUpdate({ gridSize: Number(e.target.value) }, `공간 해시 격자를 ${e.target.value}×${e.target.value} 셀로 재구성했습니다.`, `Rebuilt spatial hash grid to ${e.target.value}×${e.target.value} cells.`)} className={`h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor={particleSliderId} className="font-semibold text-fg-2 [word-break:keep-all]">{pick("브러시 모 입자 수", "Bristle Particles")}</label>
              <span data-testid="particle-count-readout" className="font-mono font-bold text-fg tabular-nums">{`${config.particleCount}`}</span>
            </div>
            <input id={particleSliderId} data-testid="particle-count-slider" type="range" min={MIN_BRISTLE_PARTICLES} max={MAX_BRISTLE_PARTICLES} step={12} value={config.particleCount} onChange={(e) => applyInputUpdate({ particleCount: Number(e.target.value) }, `브러시 모 입자를 ${e.target.value}개로 재계산했습니다.`, `Recalculated bristle dynamics for ${e.target.value} particles.`)} className={`h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor={depthSliderId} className="font-semibold text-fg-2 [word-break:keep-all]">{pick("2.5D Z-분리 강도", "2.5D Z-Separation")}</label>
              <span data-testid="depth-separation-readout" className="font-mono font-bold text-fg tabular-nums">{`${Math.round(config.depthSeparationStrength * 100)}%`}</span>
            </div>
            <input id={depthSliderId} data-testid="depth-separation-slider" type="range" min={MIN_DEPTH_SEPARATION} max={MAX_DEPTH_SEPARATION} step={0.05} value={config.depthSeparationStrength} onChange={(e) => applyInputUpdate({ depthSeparationStrength: Number(e.target.value) }, `2.5D 깊이 분리 강도를 ${Math.round(Number(e.target.value) * 100)}%로 조정했습니다.`, `Adjusted 2.5D depth separation to ${Math.round(Number(e.target.value) * 100)}%.`)} className={`h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
          </div>
        </div>
      </div>

      {/* 4종 KPI 요약 카드 */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-semibold text-fg-3">{pick("드로우콜 절감률", "Draw-Call Reduction")}</div>
          <div data-testid="kpi-drawcall-reduction" className="mt-1 font-mono text-sm font-bold text-good tabular-nums">{`-${culling.drawCallReductionPct}% (${culling.finalDrawCalls}/${culling.baselineDrawCalls})`}</div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">{pick(`생존 ${culling.survivingObjects.toLocaleString("en-US")}개 · 삼각형 -${culling.triangleReductionPct}%`, `${culling.survivingObjects.toLocaleString("en-US")} surviving · -${culling.triangleReductionPct}% tris`)}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-semibold text-fg-3">{pick("Hi-Z 차폐 제거", "Hi-Z Occlusion Cull")}</div>
          <div data-testid="kpi-hiz-culling" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{`${culling.hiZOccludedObjects.toLocaleString("en-US")} (${culling.hiZCullRatioPct}%)`}</div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">{pick(`Hi-Z 추가 절감 ${culling.hiZAdditionalDrawCallSaved} dc · ${culling.hiZPyramidMips.length}단계 밉`, `+${culling.hiZAdditionalDrawCallSaved} dc saved · ${culling.hiZPyramidMips.length} mips`)}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-semibold text-fg-3">{pick("공간 해시 탐색 절감 (실측)", "Spatial Hash Speedup (Measured)")}</div>
          <div data-testid="kpi-spatial-hash" className="mt-1 font-mono text-sm font-bold text-accent tabular-nums">{`${spatialHash.pairReductionFactor}× (-${spatialHash.pairReductionPct}%)`}</div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">{`${spatialHash.spatialHashCheckedPairs} / ${spatialHash.bruteForcePairs} ${pick("쌍", "pairs")} · ${spatialHash.occupiedCellCount}/${spatialHash.totalCellCount} ${pick("셀", "cells")}`}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-semibold text-fg-3">{pick("2.5D 4층 Z-분리 마스크", "2.5D 4-Layer Z-Mask")}</div>
          <div data-testid="kpi-depth-synthesis" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{`${depthSynthesis.effectiveParallaxSpanPx}px · ${depthSynthesis.zMaskOverlapConflictPct}%`}</div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">{pick(`0.0~1.0 4층 분리 · 대기 감쇠 ${Math.round(depthSynthesis.atmosphericHazeAmount * 100)}%`, `0.0~1.0 4 layers · haze ${Math.round(depthSynthesis.atmosphericHazeAmount * 100)}%`)}</div>
        </div>
      </div>

      {/* 4층 2.5D 깊이 맵 테이블 & 정직한 범위 안내 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" /><span>{pick("2.5D 4층 깊이 맵 (0.0~1.0) · Z-분리 마스크 요약", "2.5D 4-Layer Depth Map (0.0~1.0) & Z-Mask Summary")}</span>
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-fg-3">
            <Grid2x2 className="h-3 w-3" aria-hidden="true" /><span>{`${report.engineBrand} · ${report.stageBrand} · ${report.runtimeBrand}`}</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table data-testid="prism-depth-layer-table" className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[11px] text-fg-3">
                <th scope="col" className="px-2 py-1.5 font-semibold">{pick("층", "Layer")}</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">{pick("깊이 구간", "Depth Band")}</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">{pick("Z-마스크 면적", "Z-Mask Share")}</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">{pick("경계 신뢰도", "Edge Integrity")}</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">{pick("2.5D 시차", "Parallax")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {depthSynthesis.layers.map((layer) => (
                <tr key={layer.id} data-testid={`depth-row-${layer.id}`}>
                  <td className="px-2 py-1.5 font-semibold text-fg [word-break:keep-all]">
                    <div>{`L${layer.order} · ${isEn ? layer.labelEn : layer.labelKo}`}</div>
                    <div className="text-[10px] font-normal text-fg-3">{isEn ? layer.roleEn : layer.roleKo}</div>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[11px] text-fg-2 tabular-nums">{`${layer.depthMin.toFixed(2)}–${layer.depthMax.toFixed(2)} (${layer.normalizedDepth.toFixed(2)})`}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px] text-fg tabular-nums">{`${layer.zMaskCoveragePct}%`}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px] text-good tabular-nums">{`${layer.maskEdgeIntegrityPct}%`}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px] text-fg tabular-nums">{`±${layer.parallaxShiftPx}px`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-2 text-[11px] text-fg-2 md:grid-cols-2 [word-break:keep-all]">
          <p className="rounded-lg border border-line bg-canvas px-3 py-2">{isEn ? report.honestScopeDisclosure.currentImplementationEn : report.honestScopeDisclosure.currentImplementationKo}</p>
          <p className="rounded-lg border border-line bg-canvas px-3 py-2">{isEn ? report.honestScopeDisclosure.targetRuntimeEn : report.honestScopeDisclosure.targetRuntimeKo}</p>
        </div>
      </div>

      {/* JSON 매니페스트 복사 · 내보내기 · 미리보기 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("PrismRender 공간 컬링 · 브러시 · 깊이 매니페스트 JSON", "PrismRender Spatial Culling, Bristle & Depth Manifest JSON")}</div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" data-testid="copy-prism-json-btn" onClick={handleCopyJson} className={BTN_OUTLINE}><Copy className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("JSON 복사", "Copy JSON")}</span></button>
            <button type="button" data-testid="export-prism-json-btn" onClick={handleExportJson} className={BTN_SOLID}><Eye className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("JSON 내보내기", "Export JSON")}</span></button>
            <button type="button" data-testid="toggle-prism-json-btn" aria-pressed={showJsonPreview} onClick={() => setShowJsonPreview((prev) => !prev)} className={BTN_OUTLINE}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" /><span>{showJsonPreview ? pick("미리보기 닫기", "Hide JSON") : pick("JSON 미리보기", "Preview JSON")}</span>
            </button>
          </div>
        </div>
        {showJsonPreview && (
          <pre data-testid="prism-json-preview" className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">{manifestJson}</pre>
        )}
      </div>

      {statusMessage && (
        <div role="status" aria-live="polite" data-testid="prism-spatial-status" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">{statusMessage}</div>
      )}
    </section>
  );
}
