/**
 * Wave 56C — 전면 WebGPU 2D/2.5D Radiance Cascades 전역 조명(GI) & SDF 실시간 그림자 제어판.
 *
 * - Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건, 바이올렛 휴 270~320° 0%)
 * - 순수 시맨틱 SVG 실시간 2D/2.5D GI·반그림자·림라이트 시각화 + 캐스케이드 피라미드 도해
 * - WGSL 3종 컴퓨트 셰이더 코드 미리보기·복사, WebGPU vs WebGL2 구조 비교, JSON 내보내기
 */

import {
  Code2, Compass, Contrast, Copy, Cpu, Eye, Layers,
  RotateCcw, ShieldAlert, ShieldCheck, SlidersHorizontal, Sun,
} from "lucide-react";
import { useId, type ReactElement } from "react";

import {
  CPU_PARITY_GRID_COLS, CPU_PARITY_GRID_ROWS,
  JFA_SDF_SEED_AND_STEP_WGSL, LIGHT_TEMPERATURE_PRESETS, MAX_BASE_RAY_COUNT, MAX_CASCADE_LEVELS,
  MIN_BASE_RAY_COUNT, MIN_CASCADE_LEVELS, RADIANCE_CASCADE_MERGE_AND_CEL_WGSL, RADIANCE_CASCADE_PROBE_WGSL,
  RADIANCE_LIGHTING_SCENARIOS, formatOklch,
  type RadianceScenarioId,
  type RadianceShaderId, type SceneOccluder, type WebGpuRadianceSceneEvaluation,
} from "./radiance-cascades-engine";

import { useRadianceController } from "./use-radiance-controller";

export interface StudioWebGpuRadiancePanelProps {
  readonly initialScenarioId?: RadianceScenarioId;
  readonly initialCascadeLevels?: number;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onSceneChange?: (evaluation: WebGpuRadianceSceneEvaluation) => void | Promise<void>;
  readonly onExportJson?: (json: string, evaluation: WebGpuRadianceSceneEvaluation) => void | Promise<void>;
}

// 탈-바이올렛 OKLCH 시맨틱 SVG 잉크(58°·202°·156°·78°·34°·218° — 270~320° 완전 배제)
const SVG_INK_AMBER = "oklch(0.78 0.16 58)";
const SVG_INK_CYAN = "oklch(0.74 0.14 202)";
const SVG_INK_EMERALD = "oklch(0.72 0.16 156)";
const SVG_INK_GOLD = "oklch(0.86 0.14 78)";
const SVG_INK_CORAL = "oklch(0.70 0.17 34)";
const SVG_INK_SLATE = "oklch(0.56 0.08 218)";
const CASCADE_BAR_INKS = [SVG_INK_CYAN, SVG_INK_EMERALD, SVG_INK_GOLD, SVG_INK_AMBER, SVG_INK_CORAL, SVG_INK_SLATE] as const;

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const SHADER_SOURCES: Readonly<Record<RadianceShaderId, string>> = {
  "jfa-sdf": JFA_SDF_SEED_AND_STEP_WGSL,
  "cascade-probe": RADIANCE_CASCADE_PROBE_WGSL,
  "merge-cel": RADIANCE_CASCADE_MERGE_AND_CEL_WGSL,
};

function renderOccluderShapeSvg(occ: SceneOccluder, bx: number, by: number, bw: number, bh: number): ReactElement {
  const cx = bx + occ.x * bw;
  const cy = by + occ.y * bh;
  const fill = formatOklch(occ.albedo, occ.kind === "balloon" ? 0.86 : 0.72);
  const stroke = formatOklch(occ.albedo, 0.96);
  if (occ.shape === "circle") {
    const r = occ.radius * bh;
    return (
      <g key={occ.id} data-occluder-kind={occ.kind}>
        <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke={stroke} strokeOpacity={0.34} strokeDasharray="3 3" />
        <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth="1.5" />
      </g>
    );
  }
  if (occ.shape === "capsule") {
    const x2 = bx + (occ.x2 ?? occ.x) * bw;
    const y2 = by + (occ.y2 ?? occ.y) * bh;
    const sw = Math.max(8, occ.radius * bh * 1.9);
    return (
      <g key={occ.id} data-occluder-kind={occ.kind}>
        <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={stroke} strokeOpacity={0.28} strokeWidth={sw + 14} strokeLinecap="round" strokeDasharray="4 4" />
        <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={fill} strokeWidth={sw} strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeOpacity={0.85} />
      </g>
    );
  }
  const w = (occ.halfW ?? occ.radius) * 2 * bw;
  const h = (occ.halfH ?? occ.radius) * 2 * bh;
  const rx = Math.max(4, occ.radius * bh * 0.75);
  return (
    <g key={occ.id} data-occluder-kind={occ.kind}>
      <rect x={cx - w / 2 - 5} y={cy - h / 2 - 5} width={w + 10} height={h + 10} rx={rx + 4} fill="none" stroke={stroke} strokeOpacity={0.3} strokeDasharray="3 3" />
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={rx} fill={fill} stroke={stroke} strokeWidth="1.5" />
    </g>
  );
}

function RadianceScenePreviewSvg(props: { readonly evaluation: WebGpuRadianceSceneEvaluation; readonly isEn: boolean }): ReactElement {
  const { evaluation, isEn } = props;
  const { config, scenario, gridSamples, gridMetrics } = evaluation;
  const boxX = 24; const boxY = 48; const boxW = 412; const boxH = 248;
  const cellW = boxW / CPU_PARITY_GRID_COLS;
  const cellH = boxH / CPU_PARITY_GRID_ROWS;
  const keyX = boxX + config.keyLightX * boxW; const keyY = boxY + config.keyLightY * boxH;
  const fillX = boxX + scenario.fillLightX * boxW; const fillY = boxY + scenario.fillLightY * boxH;
  const keyInk = formatOklch(config.activeKeyLightColor);
  const fillInk = formatOklch(scenario.fillLightColor);
  const rimInk = formatOklch(scenario.rimLightColor);
  const rayCount = Math.min(12, Math.max(6, config.baseRayCount));
  const rayLines = Array.from({ length: rayCount }, (_, idx) => {
    const angle = (idx / rayCount) * Math.PI * 2;
    const len = 46 + config.cascadeLevels * 14;
    return {
      idx,
      x2: Math.min(boxX + boxW - 4, Math.max(boxX + 4, keyX + Math.cos(angle) * len)),
      y2: Math.min(boxY + boxH - 4, Math.max(boxY + 4, keyY + Math.sin(angle) * len)),
    };
  });

  return (
    <svg
      data-testid="radiance-scene-svg" data-scenario={scenario.id} data-cascade-levels={config.cascadeLevels}
      data-base-rays={config.baseRayCount} data-penumbra-cells={gridMetrics.penumbraCellCount}
      data-rim-cells={gridMetrics.rimActiveCellCount} data-model-kind={evaluation.modelKind}
      viewBox="0 0 460 328" role="img" className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn
        ? `WebGPU 2D/2.5D Radiance Cascades GI and SDF shadow preview for ${scenario.titleEn}: ${gridMetrics.penumbraCellCount} penumbra cells, ${gridMetrics.rimActiveCellCount} rim cells`
        : `${scenario.titleKo} 시나리오 WebGPU 2D·2.5D Radiance Cascades GI 및 SDF 그림자 시각화(반그림자 ${gridMetrics.penumbraCellCount}셀, 림라이트 ${gridMetrics.rimActiveCellCount}셀)`}
    >
      <rect x="8" y="8" width="444" height="312" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="24" y="27" fill="currentColor" fillOpacity={0.86} fontSize="11" fontWeight="700">
        {isEn ? "RADIANCE CASCADES GI · SDF PENUMBRA · CEL RIM" : "RADIANCE CASCADES GI · SDF 반그림자 · 셀 림라이트"}
      </text>
      <text x="436" y="27" textAnchor="end" fill={keyInk} fontSize="9.5" fontWeight="700">
        {isEn ? `${scenario.titleEn} · ${config.cascadeLevels}C` : `${scenario.titleKo} · ${config.cascadeLevels}캐스케이드`}
      </text>
      <text x="24" y="41" fill="currentColor" fillOpacity={0.62} fontSize="8.8">
        {isEn
          ? `Grid 20×12 CPU Parity · Penumbra ${gridMetrics.penumbraCellCount} · Umbra ${gridMetrics.umbraCellCount} · Bounce ${gridMetrics.meanBounceGiEnergy.toFixed(2)}`
          : `20×12 CPU 참조 실측 · 반그림자 ${gridMetrics.penumbraCellCount} · 본그림자 ${gridMetrics.umbraCellCount} · 바운스 ${gridMetrics.meanBounceGiEnergy.toFixed(2)}`}
      </text>

      <g data-testid="radiance-grid-cells">
        {gridSamples.map((cell) => (
          <rect
            key={`${cell.col}-${cell.row}`}
            x={Math.round((boxX + cell.col * cellW) * 10) / 10} y={Math.round((boxY + cell.row * cellH) * 10) / 10}
            width={Math.ceil(cellW + 0.4)} height={Math.ceil(cellH + 0.4)}
            fill={cell.displayOklch} fillOpacity={cell.insideOccluder ? 0.68 : 0.92}
          />
        ))}
      </g>
      <g opacity={0.48}>
        {rayLines.map((ray) => (
          <line key={ray.idx} x1={keyX} y1={keyY} x2={ray.x2} y2={ray.y2} stroke={keyInk} strokeWidth="1" strokeDasharray="3 3" />
        ))}
      </g>
      <g>{scenario.occluders.map((occ) => renderOccluderShapeSvg(occ, boxX, boxY, boxW, boxH))}</g>
      <g data-testid="radiance-rim-markers">
        {gridSamples.filter((cell) => cell.rimIntensity > 0.05).map((cell) => (
          <circle
            key={`rim-${cell.col}-${cell.row}`}
            cx={Math.round((boxX + cell.u * boxW) * 10) / 10} cy={Math.round((boxY + cell.v * boxH) * 10) / 10}
            r={2.4 + cell.rimIntensity * 2.4} fill={rimInk} fillOpacity={0.85}
          />
        ))}
      </g>

      <circle cx={fillX} cy={fillY} r={14} fill={fillInk} fillOpacity={0.22} stroke={fillInk} strokeWidth="1.2" strokeDasharray="3 2" />
      <circle cx={fillX} cy={fillY} r={5} fill={fillInk} />
      <circle cx={keyX} cy={keyY} r={18 + config.penumbraSoftness * 12} fill={keyInk} fillOpacity={0.18} stroke={keyInk} strokeWidth="1.3" strokeDasharray="4 2" />
      <circle cx={keyX} cy={keyY} r={6.5} fill={keyInk} stroke="currentColor" strokeWidth="1.2" />
      <rect x={boxX} y={boxY} width={boxW} height={boxH} rx="6" fill="none" stroke="currentColor" strokeOpacity={0.25} />

      <g fontSize="8.5" fill="currentColor" fillOpacity={0.78}>
        <circle cx="30" cy="309" r="4" fill={keyInk} />
        <text x="39" y="312">{isEn ? `Key (${config.keyLightX.toFixed(2)}, ${config.keyLightY.toFixed(2)})` : `주광원 (${config.keyLightX.toFixed(2)}, ${config.keyLightY.toFixed(2)})`}</text>
        <circle cx="158" cy="309" r="4" fill={fillInk} />
        <text x="167" y="312">{isEn ? "Bounce GI Fill" : "바운스 GI 보조광"}</text>
        <circle cx="272" cy="309" r="4" fill={rimInk} />
        <text x="281" y="312">{isEn ? `Cel Rim (${gridMetrics.rimActiveCellCount})` : `셀 림라이트 (${gridMetrics.rimActiveCellCount}셀)`}</text>
      </g>
    </svg>
  );
}

function CascadePyramidSvg(props: { readonly evaluation: WebGpuRadianceSceneEvaluation; readonly isEn: boolean }): ReactElement {
  const { evaluation, isEn } = props;
  const { cascades, config } = evaluation;
  const maxRays = cascades[cascades.length - 1]?.angularRayCount ?? config.baseRayCount;
  const rowH = 38; const startY = 52;

  return (
    <svg
      data-testid="cascade-pyramid-svg" data-levels={cascades.length} data-max-rays={maxRays}
      viewBox="0 0 380 328" role="img" className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn
        ? `Radiance Cascades ${cascades.length}-level spatial and angular hierarchy pyramid up to ${maxRays} rays`
        : `Radiance Cascades ${cascades.length}단계 공간 2배·각도 4배 계층 피라미드 도해(최대 ${maxRays}광선)`}
    >
      <rect x="8" y="8" width="364" height="312" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="22" y="27" fill="currentColor" fillOpacity={0.86} fontSize="11" fontWeight="700">
        {isEn ? "CASCADE PYRAMID (2× SPACE · 4× RAYS)" : "캐스케이드 피라미드 (공간 2× · 광선 4×)"}
      </text>
      <text x="22" y="42" fill="currentColor" fillOpacity={0.62} fontSize="8.8">
        {isEn
          ? `Upper→Lower Bilinear Merge · ${evaluation.gridMetrics.totalCascadeStorageKb.toLocaleString("en-US")} KB Storage Tex`
          : `상위→하위 이중선형 병합 · Storage Texture ${evaluation.gridMetrics.totalCascadeStorageKb.toLocaleString("en-US")} KB`}
      </text>

      {cascades.map((c, idx) => {
        const y = startY + idx * rowH;
        const barW = Math.round(92 + ((idx + 1) / cascades.length) * 164);
        const ink = CASCADE_BAR_INKS[idx % CASCADE_BAR_INKS.length] ?? SVG_INK_CYAN;
        return (
          <g key={c.level} data-cascade-level={c.level}>
            <rect x="20" y={y} width="340" height="30" rx="6" fill="currentColor" fillOpacity={idx % 2 === 0 ? 0.045 : 0.02} />
            <text x="28" y={y + 18} fill="currentColor" fontSize="10" fontWeight="700">C{c.level}</text>
            <rect x="54" y={y + 6} width={barW} height="18" rx="4" fill={ink} fillOpacity={0.78} stroke={ink} strokeWidth="1" />
            <text x={60} y={y + 18} fill="currentColor" fontSize="8.8" fontWeight="700">{`${c.probeSpacingPx}px · ${c.angularRayCount}r`}</text>
            <text x="352" y={y + 18} textAnchor="end" fill="currentColor" fillOpacity={0.72} fontSize="8.5">{`[${c.intervalStartPx}..${c.intervalEndPx}px]`}</text>
            {idx < cascades.length - 1 && (
              <line x1="38" y1={y + 30} x2="38" y2={y + rowH} stroke={SVG_INK_GOLD} strokeWidth="1.5" strokeDasharray="2 2" />
            )}
          </g>
        );
      })}

      <rect x="20" y="286" width="340" height="24" rx="6" fill={SVG_INK_EMERALD} fillOpacity={0.14} stroke={SVG_INK_EMERALD} strokeOpacity={0.5} />
      <text x="190" y="301" textAnchor="middle" fill="currentColor" fontSize="9" fontWeight="700">
        {isEn
          ? `C${cascades.length - 1} → ... → C0 Merge + SDF Cel Rim (JFA ${evaluation.gridMetrics.jfaPassCount} passes)`
          : `C${cascades.length - 1} → … → C0 이중선형 병합 + 셀 림 합성 (JFA ${evaluation.gridMetrics.jfaPassCount}패스)`}
      </text>
    </svg>
  );
}

function SliderControl(props: {
  readonly id: string; readonly testId: string; readonly label: string; readonly valueText: string;
  readonly min: number; readonly max: number; readonly step: number; readonly value: number;
  readonly onChange: (next: number) => void | Promise<void>;
}): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <label htmlFor={props.id} className="font-semibold text-fg-2 [word-break:keep-all]">{props.label}</label>
        <span className="font-mono font-bold text-fg tabular-nums">{props.valueText}</span>
      </div>
      <input
        id={props.id} data-testid={props.testId} type="range" min={props.min} max={props.max} step={props.step}
        value={props.value} onChange={(e) => props.onChange(Number(e.target.value))}
        className={`h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
      />
    </div>
  );
}

/** 전면 WebGPU 2D/2.5D Radiance Cascades 전역 조명(GI) & SDF 그림자 제어판. */
export function StudioWebGpuRadiancePanel(props: StudioWebGpuRadiancePanelProps): ReactElement {
  const { locale = "ko", className } = props;

  const headingId = useId();
  const sliderPrefix = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const { evaluation, manifestJson, currentInput, scenarioId, cascadeLevels, baseRayCount,
    penumbraSoftness, rimCutThreshold, bounceGiStrength, keyLightX, keyLightY, temperaturePresetId,
    activeShaderTab, setActiveShaderTab, showJsonPreview, setShowJsonPreview, statusMessage,
    delivery, copy, busy, commitScene, handleSelectScenario, handleChangeCascades, handleSelectTemp,
    handleReset, handleCopyWgsl, handleExportJson } = useRadianceController(props, SHADER_SOURCES, pick);

  const { cascades, gridMetrics, architectureComparison, wgslContracts } = evaluation;
  const maxRays = cascades[cascades.length - 1]?.angularRayCount ?? baseRayCount;

  return (
    <section aria-labelledby={headingId} data-testid="studio-webgpu-radiance-panel" className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg ${className ?? ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Sun className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 id={headingId} className="text-sm font-bold tracking-tight text-fg [word-break:keep-all]">
              {pick("CPU 조명 예제 · Radiance Cascades GPU 설계 & SDF 그림자", "CPU Lighting Example · Radiance Cascades GPU Design & SDF Shadows")}
            </h2>
            <span className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[10px] font-semibold text-fg-2">Wave 56C</span>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "20×12 CPU analytic SDF·휴리스틱 조명과 미컴파일 WGSL 설계를 비교합니다. 실제 JFA·Radiance Cascade 실행이나 GPU 결과와의 parity 검증은 하지 않았습니다.",
              "Compares a 20×12 analytic CPU SDF/heuristic lighting example with uncompiled WGSL design. No executed JFA/radiance cascade solver or GPU output parity verification.",
            )}
          </p>
        </div>
        <button type="button" data-testid="reset-radiance-btn" disabled={busy} onClick={handleReset} className={BTN_OUTLINE}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("초기값 복원", "Reset")}</span>
        </button>
      </header>
      <p data-testid="radiance-example-scope" className="text-xs text-fg-2 [word-break:keep-all]">{pick("독립 CPU/SVG 예제입니다. 광선 수·계층 수는 조명 계수와 자원 계획에 쓰이며 GPU 할당·컴파일·제출·실측, 실제 원고 적용·영구 저장은 하지 않습니다.", "Independent CPU/SVG example. Ray/level counts drive heuristic coefficients and resource planning, without GPU allocation, compilation, submission, profiling, artwork mutation or persistence.")}</p>
      <div data-testid="radiance-delivery" className="text-xs text-fg-2" aria-live="polite">
        {delivery.status === "pending" ? pick("예제 수신 확인 대기", "Awaiting example recipient") : delivery.status === "failed" ? pick("예제 알림 실패", "Example notification failed") : delivery.status === "notified" ? pick("마지막 예제 수신 확인 · 원고 적용 아님", "Last example acknowledged · no artwork mutation") : pick("실제 원고 미연결 · 로컬 예제", "No artwork connection · local example")}
        {delivery.status === "failed" ? <button type="button" data-testid="radiance-scene-retry" onClick={delivery.retry} className={BTN_OUTLINE}>{pick("같은 예제 알림 재시도", "Retry example notification")}</button> : null}
      </div>
      <div data-testid="radiance-copy-state" data-copy-state={copy.state} className="text-xs text-fg-2" aria-live="polite">
        {copy.state === "pending" ? pick("복사·수신 확인 대기", "Awaiting clipboard/recipient") : copy.state === "error" ? pick("복사 또는 수신 확인 실패", "Clipboard or recipient failed") : copy.state === "copied" ? pick("클립보드 복사 확인", "Clipboard copy confirmed") : pick("복사 대기", "Ready to copy")}
        {` · UTF-8 ${copy.bytes} ${pick("바이트", "bytes")}`}
        {copy.state === "error" ? <button type="button" data-testid="radiance-copy-retry" onClick={copy.retry} className={BTN_OUTLINE}>{pick("같은 출력 복사·알림 재시도", "Retry same output")}</button> : null}
      </div>


      {/* 4종 웹툰 조명 시나리오 카드 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label={pick("웹툰 조명 시나리오", "Webtoon lighting scenarios")}>
        {RADIANCE_LIGHTING_SCENARIOS.map((sc) => {
          const active = sc.id === scenarioId;
          return (
            <button
              key={sc.id} type="button" data-testid={`scenario-card-${sc.id}`} aria-pressed={active}
              onClick={() => handleSelectScenario(sc.id)}
              className={`flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-xs font-bold">{isEn ? sc.titleEn : sc.titleKo}</span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full border border-line-strong" style={{ backgroundColor: formatOklch(sc.keyLightColor) }} />
                  <span className="h-2.5 w-2.5 rounded-full border border-line-strong" style={{ backgroundColor: formatOklch(sc.fillLightColor) }} />
                </span>
              </div>
              <span className="text-[11px] leading-snug text-fg-2">{isEn ? sc.moodEn : sc.moodKo}</span>
            </button>
          );
        })}
      </div>

      {/* 순수 시맨틱 SVG 2D/2.5D GI 프리뷰 + 캐스케이드 피라미드 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-7"><RadianceScenePreviewSvg evaluation={evaluation} isEn={isEn} /></div>
        <div className="lg:col-span-5"><CascadePyramidSvg evaluation={evaluation} isEn={isEn} /></div>
      </div>

      {/* GI·캐스케이드·광원 파라미터 제어판 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="space-y-2.5 rounded-xl border border-line bg-card p-3 lg:col-span-6">
          <div className="flex items-center justify-between text-xs font-bold text-fg [word-break:keep-all]">
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("캐스케이드 · 반그림자 · 림라이트 · 바운스 GI", "Cascades · Penumbra · Rim Cut · Bounce GI")}
            </span>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">{cascadeLevels}C · {maxRays}r</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("캐스케이드 단계 선택", "Cascade levels")}>
            {[3, 4, 5, 6].map((lv) => (
              <button key={lv} type="button" data-testid={`cascade-level-${lv}`} aria-pressed={cascadeLevels === lv} onClick={() => handleChangeCascades(lv)} className={`${cascadeLevels === lv ? BTN_ACTIVE : BTN_OUTLINE} tabular-nums`}>
                {isEn ? `${lv} Levels` : `${lv}단계`}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            <SliderControl id={`${sliderPrefix}-cascades`} testId="slider-cascade-levels" label={pick("캐스케이드 깊이", "Cascade Depth")} valueText={`${cascadeLevels}`} min={MIN_CASCADE_LEVELS} max={MAX_CASCADE_LEVELS} step={1} value={cascadeLevels} onChange={handleChangeCascades} />
            <SliderControl id={`${sliderPrefix}-rays`} testId="slider-base-rays" label={pick("C0 기본 광선 밀도", "C0 Base Rays")} valueText={`${baseRayCount}r`} min={MIN_BASE_RAY_COUNT} max={MAX_BASE_RAY_COUNT} step={2} value={baseRayCount} onChange={(v) => { commitScene({ ...currentInput, baseRayCount: v }, `기본 광선 밀도를 ${v}광선으로 변경했습니다.`, `Updated base ray count to ${v}.`); }} />
            <SliderControl id={`${sliderPrefix}-penumbra`} testId="slider-penumbra-softness" label={pick("반그림자 부드러움", "Penumbra Softness")} valueText={penumbraSoftness.toFixed(2)} min={0.1} max={1.0} step={0.05} value={penumbraSoftness} onChange={(v) => { commitScene({ ...currentInput, penumbraSoftness: v }, `반그림자 부드러움을 ${v.toFixed(2)}로 조정했습니다.`, `Set penumbra softness to ${v.toFixed(2)}.`); }} />
            <SliderControl id={`${sliderPrefix}-rim`} testId="slider-rim-cut" label={pick("셀 림라이트 컷", "Cel Rim Cut")} valueText={rimCutThreshold.toFixed(2)} min={0.15} max={0.9} step={0.05} value={rimCutThreshold} onChange={(v) => { commitScene({ ...currentInput, rimCutThreshold: v }, `셀 림라이트 컷 임계값을 ${v.toFixed(2)}로 변경했습니다.`, `Set cel rim cut threshold to ${v.toFixed(2)}.`); }} />
            <SliderControl id={`${sliderPrefix}-bounce`} testId="slider-bounce-gi" label={pick("바운스 GI 강도", "Bounce GI Strength")} valueText={`${Math.round(bounceGiStrength * 100)}%`} min={0} max={1.5} step={0.05} value={bounceGiStrength} onChange={(v) => { commitScene({ ...currentInput, bounceGiStrength: v }, `바운스 색 번짐 강도를 ${Math.round(v * 100)}%로 조정했습니다.`, `Set bounce GI strength to ${Math.round(v * 100)}%.`); }} />
          </div>
        </div>

        <div className="space-y-2.5 rounded-xl border border-line bg-card p-3 lg:col-span-6">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Compass className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("주광원 위치 · 탈-바이올렛 OKLCH 색온도 프리셋", "Key Light Position & Non-Violet OKLCH Temperature")}</span>
          </div>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <SliderControl id={`${sliderPrefix}-lx`} testId="slider-key-light-x" label={pick("주광원 X 좌표", "Key Light X")} valueText={keyLightX.toFixed(2)} min={0.06} max={0.94} step={0.02} value={keyLightX} onChange={(v) => { commitScene({ ...currentInput, keyLightX: v }, `주광원 X 좌표를 ${v.toFixed(2)}로 이동했습니다.`, `Moved key light X to ${v.toFixed(2)}.`); }} />
            <SliderControl id={`${sliderPrefix}-ly`} testId="slider-key-light-y" label={pick("주광원 Y 좌표", "Key Light Y")} valueText={keyLightY.toFixed(2)} min={0.06} max={0.94} step={0.02} value={keyLightY} onChange={(v) => { commitScene({ ...currentInput, keyLightY: v }, `주광원 Y 좌표를 ${v.toFixed(2)}로 이동했습니다.`, `Moved key light Y to ${v.toFixed(2)}.`); }} />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("광원 색온도 프리셋", "Light temperature presets")}>
            {LIGHT_TEMPERATURE_PRESETS.map((preset) => (
              <button key={preset.id} type="button" data-testid={`temp-preset-${preset.id}`} aria-pressed={temperaturePresetId === preset.id} onClick={() => handleSelectTemp(preset.id)} className={temperaturePresetId === preset.id ? BTN_ACTIVE : BTN_OUTLINE}>
                {preset.color && <span className="h-2.5 w-2.5 rounded-full border border-line-strong" style={{ backgroundColor: formatOklch(preset.color) }} />}
                <span>{isEn ? preset.labelEn : preset.labelKo}</span>
                <span className="font-mono text-[10px] text-fg-3 tabular-nums">{preset.kelvinLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4종 실측 KPI 요약 */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3"><Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" /><span>{pick("캐스케이드 · 각도 해상도", "Cascades & Angular Rays")}</span></div>
          <div data-testid="kpi-cascade-summary" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{pick(`${cascadeLevels}단계 · 최대 ${maxRays.toLocaleString("en-US")}광선`, `${cascadeLevels} Levels · ${maxRays.toLocaleString("en-US")} Rays`)}</div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">{pick(`JFA SDF ${gridMetrics.jfaPassCount}패스 · Storage ${gridMetrics.totalCascadeStorageKb.toLocaleString("en-US")}KB`, `JFA SDF ${gridMetrics.jfaPassCount} passes · ${gridMetrics.totalCascadeStorageKb.toLocaleString("en-US")}KB`)}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3"><Contrast className="h-3.5 w-3.5 text-accent" aria-hidden="true" /><span>{pick("CPU 반그림자 · 바운스 예제", "CPU Penumbra & Bounce Example")}</span></div>
          <div data-testid="kpi-penumbra-summary" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{pick(`반그림자 ${gridMetrics.penumbraCellCount} · 림 ${gridMetrics.rimActiveCellCount}`, `Penumbra ${gridMetrics.penumbraCellCount} · Rim ${gridMetrics.rimActiveCellCount}`)}</div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">{pick(`평균 바운스 ${gridMetrics.meanBounceGiEnergy.toFixed(3)} · 최대 림 ${gridMetrics.maxRimLightIntensity.toFixed(2)}`, `Mean Bounce ${gridMetrics.meanBounceGiEnergy.toFixed(3)} · Peak Rim ${gridMetrics.maxRimLightIntensity.toFixed(2)}`)}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3"><Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" /><span>{pick("가정한 GPU/WebGL2 구조 비교", "Planned GPU/WebGL2 Structure")}</span></div>
          <div data-testid="kpi-arch-delta" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{pick(`렌더패스 전환 0 vs ${architectureComparison.legacyWebgl2.renderPassSwitches}회`, `0 vs ${architectureComparison.legacyWebgl2.renderPassSwitches} Render Switches`)}</div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">{pick(`공유메모리 ${architectureComparison.webgpu.workgroupSharedMemoryBytes}B · FBO 0개`, `Shared Mem ${architectureComparison.webgpu.workgroupSharedMemoryBytes}B · 0 FBOs`)}</div>
        </div>
        <div className={`rounded-xl border p-3 ${wgslContracts.valid ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad"}`}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            {wgslContracts.valid ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{pick("WGSL 3종 계약 · Uniform 정렬", "WGSL 3-Pass & Uniform Gate")}</span>
          </div>
          <div data-testid="kpi-wgsl-contract" className="mt-1 font-mono text-sm font-bold tabular-nums">{wgslContracts.valid ? `3/3 PASS · ${wgslContracts.uniformByteSize}B` : "CONTRACT FAIL"}</div>
          <div className="mt-0.5 text-[11px] tabular-nums [word-break:keep-all]">{pick(`바인딩 최대 ${wgslContracts.maxBindingCount}/8 · 예약어 충돌 ${wgslContracts.totalReservedKeywordCollisions}`, `Max ${wgslContracts.maxBindingCount}/8 bindings · ${wgslContracts.totalReservedKeywordCollisions} keyword hits`)}</div>
        </div>
      </div>

      {/* WebGPU Compute vs 레거시 WebGL2 정직한 파이프라인 구조 비교 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("전면 WebGPU Compute vs 레거시 WebGL2 Fragment Ping-Pong 파이프라인 구조 비교", "Full WebGPU Compute vs Legacy WebGL2 Fragment Ping-Pong Architecture")}</div>
          <span data-testid="architecture-model-kind" className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[10px] text-fg-3">{architectureComparison.modelKind}</span>
        </div>
        <div className="overflow-x-auto">
          <table data-testid="architecture-comparison-table" className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[11px] text-fg-3">
                <th scope="col" className="px-2 py-2 font-semibold">{pick("백엔드 파이프라인", "Backend Pipeline")}</th>
                <th scope="col" className="px-2 py-2 font-semibold">{pick("프레임 패스", "Passes/Frame")}</th>
                <th scope="col" className="px-2 py-2 font-semibold">{pick("렌더패스 전환", "Pass Switches")}</th>
                <th scope="col" className="px-2 py-2 font-semibold">Storage Texture</th>
                <th scope="col" className="px-2 py-2 font-semibold">{pick("공유 메모리 · FBO", "Shared Mem / FBO")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[architectureComparison.webgpu, architectureComparison.legacyWebgl2].map((row, idx) => (
                <tr key={row.backendNameEn} data-testid={idx === 0 ? "arch-row-webgpu" : "arch-row-webgl2"} className="align-top">
                  <td className="px-2 py-2 font-semibold text-fg [word-break:keep-all]">
                    <div>{isEn ? row.backendNameEn : row.backendNameKo}</div>
                    <div className="mt-0.5 text-[11px] font-normal text-fg-3">{isEn ? row.summaryEn : row.summaryKo}</div>
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px] font-bold text-fg tabular-nums">{row.totalPassesPerFrame}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-fg-2 tabular-nums">{row.renderPassSwitches}</td>
                  <td className="px-2 py-2 text-[11px]">
                    <span className={`inline-block rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${row.storageTextureWriteSupport ? "border-good bg-good-soft text-good" : "border-warn bg-warning-soft text-warn"}`}>
                      {row.storageTextureWriteSupport ? "SUPPORTED" : "NONE"}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px] text-fg-2 tabular-nums">{`${row.workgroupSharedMemoryBytes}B · ${row.pingPongFboCount} FBO`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-2 text-[11px] text-fg-2 md:grid-cols-2 [word-break:keep-all]">
          <p className="rounded-lg border border-line bg-canvas px-3 py-2">{isEn ? evaluation.honestScopeDisclosure.currentImplementationEn : evaluation.honestScopeDisclosure.currentImplementationKo}</p>
          <p className="rounded-lg border border-line bg-canvas px-3 py-2">{isEn ? evaluation.honestScopeDisclosure.targetRuntimeEn : evaluation.honestScopeDisclosure.targetRuntimeKo}</p>
        </div>
      </div>

      {/* WGSL 3종 코드 미리보기·복사 및 JSON 매니페스트 내보내기 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Code2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("WGSL 3종 컴퓨트 셰이더 미리보기 · 복사 및 JSON 내보내기", "3 WGSL Compute Shaders & JSON Manifest Export")}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" data-testid="copy-wgsl-btn" disabled={busy} onClick={handleCopyWgsl} className={BTN_OUTLINE}><Copy className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("현재 WGSL 복사", "Copy WGSL")}</span></button>
            <button type="button" data-testid="export-radiance-json-btn" disabled={busy} onClick={handleExportJson} className={BTN_SOLID}><Copy className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("JSON 내보내기", "Export JSON")}</span></button>
            <button type="button" data-testid="toggle-json-preview-btn" onClick={() => setShowJsonPreview((prev) => !prev)} className={BTN_OUTLINE}><Eye className="h-3.5 w-3.5" aria-hidden="true" /><span>{showJsonPreview ? pick("JSON 닫기", "Hide JSON") : pick("JSON 미리보기", "Preview JSON")}</span></button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("WGSL 셰이더 패스 선택", "WGSL shader pass selector")}>
          {wgslContracts.shaders.map((shader) => (
            <button key={shader.id} type="button" data-testid={`wgsl-tab-${shader.id}`} aria-pressed={activeShaderTab === shader.id} onClick={() => setActiveShaderTab(shader.id)} className={activeShaderTab === shader.id ? BTN_ACTIVE : BTN_OUTLINE}>
              <span>{isEn ? shader.labelEn : shader.labelKo}</span>
              <span className="font-mono text-[10px] text-fg-3 tabular-nums">{shader.bindingCount}B</span>
            </button>
          ))}
        </div>
        <pre data-testid="wgsl-code-preview" className="max-h-52 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">{SHADER_SOURCES[activeShaderTab]}</pre>
        {showJsonPreview && <pre data-testid="radiance-json-preview" className="max-h-52 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">{manifestJson}</pre>}
      </div>

      {statusMessage && (
        <div role="status" aria-live="polite" data-testid="radiance-panel-status" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">{statusMessage}</div>
      )}
    </section>
  );
}
