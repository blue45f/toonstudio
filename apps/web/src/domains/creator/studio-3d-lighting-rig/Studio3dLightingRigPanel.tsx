/**
 * Wave 42A — 3D 배경·캐릭터 통합 스튜디오 조명 릭 · 물리 하늘(서울 태양 궤적) · 그림자 캐처 워크벤치 패널.
 *
 * - 2탭 인터랙티브 워크벤치:
 *   1) 물리 하늘 · 서울 태양 궤적 SVG 돔 (위도 37.57°N 계절·시각 궤적, 6종 프리셋, 대기 산란 조절)
 *   2) 3점·림라이트 스튜디오 릭 · 그림자 캐처 프리뷰 (Key/Fill/Rim/건축 바운스, 바닥 그림자 타원, 2D 리라이트 JSON 브리지)
 * - Calm Atelier 시맨틱 토큰 전용 (원시 hex/rgb/hsl 0건 · Web Storage 0건 · props 기본 객체 대입 미사용).
 */

import { CheckCircle2, Compass, Copy, Download, Layers, Link2, RotateCcw, SlidersHorizontal, Sun, Unlink } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  ARCHITECTURAL_SURFACES, MAX_RIG_KELVIN, MAX_SOLAR_HOUR_KST, MIN_RIG_KELVIN, MIN_SOLAR_HOUR_KST,
  PHYSICAL_SKY_PRESETS, RELIGHT_BRIDGE_SCHEMA_VERSION, SEOUL_LATITUDE_DISPLAY, SEOUL_SEASONS,
  createInitialStudioRigConfig, evaluateStudioLightingRig, export2dCutRelightBridge, formatHourKst,
  getArchitecturalSurfaceById, getPhysicalSkyPresetById, sampleSeoulDailyArc, serialize2dCutRelightBridgeJson,
  type ArchitecturalSurfaceId, type PhysicalSkyPresetId, type RelightBridge2dPayload, type ResolvedRigLight,
  type RigLightChannel, type SkyPhaseId, type StudioRigConfig,
} from "./hdri-sky-rig-engine";

export type Studio3dLightingRigTabId = "sky-dome" | "studio-rig";
type FocusedLightId = ResolvedRigLight["id"];

export interface Studio3dLightingRigPanelProps {
  readonly initialTab?: Studio3dLightingRigTabId;
  readonly initialPresetId?: PhysicalSkyPresetId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPresetChange?: (presetId: PhysicalSkyPresetId) => void;
  readonly onExportRelightBridge?: (payload: RelightBridge2dPayload, jsonText: string) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_SOLID = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING} [word-break:keep-all]`;
const BTN_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;
const TAB_BASE = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

function getSkyPhaseLabel(phase: SkyPhaseId, isEn: boolean): string {
  switch (phase) {
    case "daylight": return isEn ? "Daylight" : "주간 직사광";
    case "golden-hour": return isEn ? "Golden Hour" : "골든아워";
    case "blue-hour": return isEn ? "Blue Hour" : "블루아워";
    case "night": return isEn ? "Night / Lunar" : "야간 · 달빛";
  }
}

function projectSkyDomePoint(azimuthDeg: number, elevationDeg: number, cx: number, cy: number, radius: number): { readonly x: number; readonly y: number } {
  const rad = (azimuthDeg * Math.PI) / 180;
  const r = elevationDeg >= 0 ? radius * (1 - Math.min(90, elevationDeg) / 90) : radius + Math.min(12, Math.abs(elevationDeg) * 0.65);
  return { x: Number((cx + r * Math.sin(rad)).toFixed(2)), y: Number((cy - r * Math.cos(rad)).toFixed(2)) };
}

interface RangeSliderProps {
  readonly id: string; readonly testId: string; readonly label: string; readonly readout: string;
  readonly readoutTestId?: string; readonly swatchCss?: string; readonly toneClass?: string;
  readonly min: number; readonly max: number; readonly step: number; readonly value: number;
  readonly disabled?: boolean; readonly onChange: (next: number) => void;
}

function RangeSlider(p: RangeSliderProps): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={p.id} className="font-semibold text-fg [word-break:keep-all]">{p.label}</label>
        <span data-testid={p.readoutTestId} className={`inline-flex items-center gap-1.5 font-bold tabular-nums ${p.toneClass ?? "text-accent"}`}>
          {p.swatchCss ? <span className="h-3 w-3 rounded-full border border-line" style={{ backgroundColor: p.swatchCss }} /> : null}
          {p.readout}
        </span>
      </div>
      <input
        id={p.id} data-testid={p.testId} type="range" min={p.min} max={p.max} step={p.step} value={p.value}
        disabled={p.disabled} onChange={(e) => p.onChange(Number(e.target.value))}
        className={`h-2 w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
      />
    </div>
  );
}

function MetricCell(p: { readonly label: string; readonly value: string; readonly testId?: string; readonly toneClass?: string }): ReactElement {
  return (
    <div className="rounded-lg border border-line bg-canvas p-2">
      <div className="text-[10px] text-fg-3">{p.label}</div>
      <div data-testid={p.testId} className={`font-bold ${p.toneClass ?? "text-fg"}`}>{p.value}</div>
    </div>
  );
}

/** Wave 42A 3D 배경·캐릭터 통합 스튜디오 조명 릭 · 서울 물리 하늘 · 그림자 캐처 2탭 워크벤치. */
export function Studio3dLightingRigPanel(props: Studio3dLightingRigPanelProps): ReactElement {
  const { initialTab = "sky-dome", initialPresetId = "noon-clear", locale = "ko", className, onPresetChange, onExportRelightBridge } = props;
  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activeTab, setActiveTab] = useState<Studio3dLightingRigTabId>(initialTab);
  const [config, setConfig] = useState<StudioRigConfig>(() => createInitialStudioRigConfig(initialPresetId));
  const [focusedLightId, setFocusedLightId] = useState<FocusedLightId>("key");
  const [exportStatus, setExportStatus] = useState<string>("");

  const evaluation = useMemo(() => evaluateStudioLightingRig(config), [config]);
  const dailyArc = useMemo(() => sampleSeoulDailyArc(config.season, 30), [config.season]);
  const activePreset = useMemo(() => getPhysicalSkyPresetById(config.presetId), [config.presetId]);
  const bridgePayload = useMemo(() => export2dCutRelightBridge(config), [config]);
  const bridgeJson = useMemo(() => serialize2dCutRelightBridgeJson(config), [config]);

  const domeCx = 180;
  const domeCy = 110;
  const domeR = 86;
  const sunDomePt = projectSkyDomePoint(evaluation.sun.azimuthDeg, evaluation.sun.elevationDeg, domeCx, domeCy, domeR);

  const { aboveArcPath, belowArcPath } = useMemo(() => {
    const abovePts: string[] = [];
    const belowPts: string[] = [];
    for (const pt of dailyArc.points) {
      const projected = projectSkyDomePoint(pt.azimuthDeg, pt.elevationDeg, domeCx, domeCy, domeR);
      const cmd = `${projected.x} ${projected.y}`;
      if (pt.isAboveHorizon) abovePts.push(abovePts.length === 0 ? `M ${cmd}` : `L ${cmd}`);
      else belowPts.push(belowPts.length === 0 ? `M ${cmd}` : `L ${cmd}`);
    }
    return { aboveArcPath: abovePts.join(" "), belowArcPath: belowPts.join(" ") };
  }, [dailyArc.points]);

  const handleSelectPreset = (presetId: PhysicalSkyPresetId): void => {
    setConfig(createInitialStudioRigConfig(presetId));
    setExportStatus("");
    onPresetChange?.(presetId);
  };

  const handleResetPreset = (): void => {
    setConfig(createInitialStudioRigConfig(config.presetId));
    setExportStatus("");
  };

  const updateChannel = (channel: "key" | "fill" | "rim", patch: Partial<RigLightChannel>): void => {
    setConfig((prev) => ({ ...prev, [channel]: { ...prev[channel], ...patch } }));
  };

  const toggleLightById = (lightId: FocusedLightId): void => {
    if (lightId === "architectural-bounce") {
      setConfig((prev) => ({ ...prev, bounce: { ...prev.bounce, enabled: !prev.bounce.enabled } }));
      return;
    }
    setConfig((prev) => ({ ...prev, [lightId]: { ...prev[lightId], enabled: !prev[lightId].enabled } }));
  };

  const handleSelectSurface = (surfaceId: ArchitecturalSurfaceId): void => {
    const spec = getArchitecturalSurfaceById(surfaceId);
    setConfig((prev) => ({ ...prev, bounce: { ...prev.bounce, surfaceMaterial: surfaceId, reflectance: spec.defaultReflectance, kelvin: spec.defaultKelvin } }));
  };

  const handleExportBridge = (): void => {
    onExportRelightBridge?.(bridgePayload, bridgeJson);
    setExportStatus(
      pick(
        `2D 컷 리라이트 브리지(${RELIGHT_BRIDGE_SCHEMA_VERSION}) 생성 완료 · 추천 2D 프리셋: ${bridgePayload.threeLayer2dRelight.suggestedPresetId}`,
        `Exported 2D cut relight bridge (${RELIGHT_BRIDGE_SCHEMA_VERSION}) · 2D preset: ${bridgePayload.threeLayer2dRelight.suggestedPresetId}`,
      ),
    );
  };

  const handleCopyBridge = (): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(bridgeJson).catch(() => undefined);
    }
    setExportStatus(pick("조명 브리지 JSON을 클립보드 복사 준비 상태로 전환했습니다.", "Lighting bridge JSON ready in clipboard."));
  };

  const stageCx = 180;
  const stageCy = 110;
  const stagePxPerM = 28;
  const shadow = evaluation.shadowCatcher;
  const shadowCenterX = Number((stageCx + shadow.centerOffsetX_m * stagePxPerM).toFixed(2));
  const shadowCenterY = Number((stageCy + shadow.centerOffsetZ_m * stagePxPerM).toFixed(2));
  const shadowRx = Number(Math.max(4, shadow.semiMinorAxisM * stagePxPerM).toFixed(2));
  const shadowRy = Number(Math.max(4, shadow.semiMajorAxisM * stagePxPerM).toFixed(2));
  const contactR = Number(Math.max(4, shadow.contactAoRadiusM * stagePxPerM).toFixed(2));

  const matchBadgeTone = evaluation.metrics.characterBackgroundMatchScore >= 85
    ? "border-good/40 bg-good-soft text-good"
    : evaluation.metrics.characterBackgroundMatchScore >= 65
      ? "border-warn/40 bg-warning-soft text-warn"
      : "border-bad/40 bg-bad-soft text-bad";
  const phaseBadgeTone = evaluation.sun.skyPhase === "daylight"
    ? "border-good/40 bg-good-soft text-good"
    : evaluation.sun.skyPhase === "golden-hour"
      ? "border-warn/40 bg-warning-soft text-warn"
      : "border-line-strong bg-panel text-cool";

  const activeFocusedChannel = focusedLightId === "architectural-bounce" ? null : config[focusedLightId];
  const keyLockedBySun = focusedLightId === "key" && config.syncKeyWithSun;

  return (
    <section
      data-testid="studio-3d-lighting-rig-panel"
      aria-label={pick("3D 통합 물리 하늘·스튜디오 조명 릭·그림자 캐처 워크벤치", "3D Physical Sky, Studio Lighting Rig and Shadow Catcher Workbench")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("3D 통합 조명 릭", "3D Lighting Rig")}</span>
            </span>
            <span className="text-[11px] font-semibold text-fg-2 tabular-nums">
              {pick(`서울 ${SEOUL_LATITUDE_DISPLAY}°N · ${evaluation.sun.formattedHourKst} KST`, `Seoul ${SEOUL_LATITUDE_DISPLAY}°N · ${evaluation.sun.formattedHourKst} KST`)}
            </span>
          </div>
          <h2 className="text-sm font-bold text-fg">
            {pick("물리 하늘(서울 태양 궤적) · 3점 스튜디오 릭 · 그림자 캐처", "Physical Sky (Seoul Sun Path) · 3-Point Rig · Shadow Catcher")}
          </h2>
          <p className="text-xs text-fg-2">{isEn ? activePreset.moodEn : activePreset.moodKo}</p>
        </div>

        <div className="flex items-center gap-2">
          <span data-testid="lighting-match-score-badge" className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold tabular-nums ${matchBadgeTone}`}>
            {pick(`배경·캐릭터 정합 ${evaluation.metrics.characterBackgroundMatchScore}점`, `Match ${evaluation.metrics.characterBackgroundMatchScore}/100`)}
          </span>
          <button type="button" data-testid="rig-reset-preset-btn" onClick={handleResetPreset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("프리셋 초기화", "Reset")}</span>
          </button>
        </div>
      </header>

      <div role="tablist" aria-label={pick("3D 조명 워크벤치 탭", "3D Lighting Workbench Tabs")} className="flex flex-wrap gap-2">
        <button
          id={`${uid}-tab-sky-dome`} data-testid="rig-tab-sky-dome" type="button" role="tab"
          aria-selected={activeTab === "sky-dome"} aria-controls={`${uid}-panel-sky-dome`}
          onClick={() => setActiveTab("sky-dome")}
          className={`${TAB_BASE} ${activeTab === "sky-dome" ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"}`}
        >
          <Compass className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("물리 하늘 · 서울 태양 궤적 SVG 돔", "Physical Sky · Seoul Sun Dome")}</span>
        </button>
        <button
          id={`${uid}-tab-studio-rig`} data-testid="rig-tab-studio-rig" type="button" role="tab"
          aria-selected={activeTab === "studio-rig"} aria-controls={`${uid}-panel-studio-rig`}
          onClick={() => setActiveTab("studio-rig")}
          className={`${TAB_BASE} ${activeTab === "studio-rig" ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"}`}
        >
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("3점·림라이트 스튜디오 릭 · 그림자 캐처", "3-Point Rig · Shadow Catcher")}</span>
        </button>
      </div>

      {activeTab === "sky-dome" && (
        <div id={`${uid}-panel-sky-dome`} role="tabpanel" aria-labelledby={`${uid}-tab-sky-dome`} className="space-y-4">
          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">{pick("서울 물리 하늘 · 대기 산란 프리셋 (6종)", "Seoul Physical Sky Presets (6)")}</h3>
              <span data-testid="sky-phase-badge" className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${phaseBadgeTone}`}>
                {getSkyPhaseLabel(evaluation.sun.skyPhase, isEn)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {PHYSICAL_SKY_PRESETS.map((preset) => (
                <button
                  key={preset.id} data-testid={`sky-preset-${preset.id}`} type="button" aria-pressed={preset.id === config.presetId}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={preset.id === config.presetId ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  <span className="truncate">{isEn ? preset.nameEn : preset.nameKo}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-fg">{pick("서울(37.57°N) 태양 궤적 SVG 돔", "Seoul (37.57°N) Sun Trajectory Dome")}</h3>
                <span data-testid="seoul-sun-readout" className="text-[11px] font-bold text-accent tabular-nums">
                  {pick(`고도 ${evaluation.sun.elevationDeg.toFixed(1)}° · 방위 ${evaluation.sun.azimuthDeg.toFixed(1)}° (${evaluation.sun.compassDirectionKo})`, `El ${evaluation.sun.elevationDeg.toFixed(1)}° · Az ${evaluation.sun.azimuthDeg.toFixed(1)}° (${evaluation.sun.compassDirectionEn})`)}
                </span>
              </div>

              <svg
                data-testid="seoul-sky-dome-svg" viewBox="0 0 360 220" role="img"
                aria-label={pick("서울 계절·시간대 태양 궤적 및 물리 하늘 돔 시각화", "Seoul seasonal solar trajectory and physical sky dome visualization")}
                className="h-56 w-full rounded-xl border border-line bg-canvas"
              >
                <defs>
                  <linearGradient id={`${uid}-sky-grad`} x1="0" y1="0" x2="0" y2="1">
                    {evaluation.sky.gradientStopsOklch.map((stop) => (
                      <stop key={stop.offsetPct} offset={`${stop.offsetPct}%`} stopColor={stop.oklchCss} />
                    ))}
                  </linearGradient>
                </defs>
                <rect x="0" y="0" width="360" height="220" fill={`url(#${uid}-sky-grad)`} opacity="0.24" />
                <circle cx={domeCx} cy={domeCy} r={domeR} fill={`url(#${uid}-sky-grad)`} stroke="var(--color-line-strong)" strokeWidth="1.5" />
                <circle cx={domeCx} cy={domeCy} r={domeR * 0.67} fill="none" stroke="var(--color-line)" strokeDasharray="3 3" strokeWidth="1" />
                <circle cx={domeCx} cy={domeCy} r={domeR * 0.33} fill="none" stroke="var(--color-line)" strokeDasharray="3 3" strokeWidth="1" />
                <line x1={domeCx - domeR} y1={domeCy} x2={domeCx + domeR} y2={domeCy} stroke="var(--color-line)" strokeWidth="1" />
                <line x1={domeCx} y1={domeCy - domeR} x2={domeCx} y2={domeCy + domeR} stroke="var(--color-line)" strokeWidth="1" />
                {belowArcPath ? <path d={belowArcPath} fill="none" stroke="var(--color-fg-3)" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.6" /> : null}
                {aboveArcPath ? <path data-testid="seoul-sun-arc-path" d={aboveArcPath} fill="none" stroke="var(--color-accent)" strokeWidth="2.2" strokeLinecap="round" /> : null}
                <line x1={domeCx} y1={domeCy} x2={sunDomePt.x} y2={sunDomePt.y} stroke={evaluation.sky.sunDisk.oklchCss} strokeWidth="1.6" strokeDasharray="2 2" opacity="0.85" />
                <circle cx={sunDomePt.x} cy={sunDomePt.y} r="13" fill={evaluation.sky.sunDisk.oklchCss} opacity={evaluation.sun.isAboveHorizon ? 0.28 : 0.14} />
                <circle data-testid="seoul-sun-marker" cx={sunDomePt.x} cy={sunDomePt.y} r="6.5" fill={evaluation.sky.sunDisk.oklchCss} stroke="var(--color-fg)" strokeWidth="1.5" />
                <circle cx={domeCx} cy={domeCy} r="3.5" fill="var(--color-fg)" />
                <text x={domeCx} y={domeCy - domeR - 7} textAnchor="middle" fill="var(--color-fg-2)" fontSize="10" fontWeight="700">{pick("북 N", "N")}</text>
                <text x={domeCx + domeR + 12} y={domeCy + 3} textAnchor="start" fill="var(--color-fg-2)" fontSize="10" fontWeight="700">{pick("동 E", "E")}</text>
                <text x={domeCx} y={domeCy + domeR + 14} textAnchor="middle" fill="var(--color-fg-2)" fontSize="10" fontWeight="700">{pick("남 S", "S")}</text>
                <text x={domeCx - domeR - 12} y={domeCy + 3} textAnchor="end" fill="var(--color-fg-2)" fontSize="10" fontWeight="700">{pick("서 W", "W")}</text>
                <text x={domeCx + 4} y={domeCy - domeR * 0.67 + 10} fill="var(--color-fg-3)" fontSize="9">30°</text>
                <text x={domeCx + 4} y={domeCy - domeR * 0.33 + 10} fill="var(--color-fg-3)" fontSize="9">60°</text>
              </svg>

              <div data-testid="sky-telemetry-grid" className="grid grid-cols-2 gap-2 text-[11px] tabular-nums sm:grid-cols-4">
                <MetricCell label={pick("추정 색온도", "Est. Kelvin")} value={`${evaluation.sky.dominantSkyKelvin}K`} />
                <MetricCell label={pick("대기질량 / 조도", "Air Mass / Lux")} value={`AM ${evaluation.sun.airMass.toFixed(1)} · ${(evaluation.sky.hemisphereIrradianceLux / 1000).toFixed(1)}k`} />
                <MetricCell label={pick("남중 최고 고도", "Solar Noon Peak")} value={`${dailyArc.maxElevationDeg.toFixed(1)}°`} toneClass="text-accent" />
                <MetricCell label={pick("일조 시간", "Daylight Span")} value={`${dailyArc.daylightHours.toFixed(1)}h`} toneClass="text-cool" />
              </div>
            </div>

            <div className="space-y-3.5 rounded-xl border border-line bg-card p-3.5">
              <div className="space-y-2">
                <span className="text-xs font-bold text-fg">{pick("서울 계절 선택 (37.57°N 절기)", "Seoul Season (37.57°N)")}</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SEOUL_SEASONS.map((s) => (
                    <button
                      key={s.id} data-testid={`season-btn-${s.id}`} type="button" aria-pressed={config.season === s.id}
                      onClick={() => setConfig((prev) => ({ ...prev, season: s.id }))}
                      className={config.season === s.id ? BTN_ACTIVE : BTN_OUTLINE}
                    >
                      <span className="truncate">{isEn ? s.labelEn : s.labelKo}</span>
                    </button>
                  ))}
                </div>
              </div>

              <RangeSlider
                id={`${uid}-hour-kst`} testId="seoul-hour-slider" readoutTestId="seoul-hour-readout"
                label={pick("서울 시각 (05:00~22:00 KST)", "Seoul Time (05:00-22:00 KST)")}
                readout={`${formatHourKst(config.hourKst)} KST`} swatchCss={evaluation.sky.sunDisk.oklchCss}
                min={MIN_SOLAR_HOUR_KST} max={MAX_SOLAR_HOUR_KST} step={0.25} value={config.hourKst}
                onChange={(hourKst) => setConfig((prev) => ({ ...prev, hourKst }))}
              />

              <div className="space-y-2.5 border-t border-line pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-fg">{pick("대기 산란 · 구름 파라미터", "Atmospheric Scattering Controls")}</span>
                  <span className="text-[11px] text-fg-2 tabular-nums">
                    {pick(`하늘 확산비 ${(evaluation.sky.skyToSunRatio * 100).toFixed(0)}%`, `Sky Diff ${(evaluation.sky.skyToSunRatio * 100).toFixed(0)}%`)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <RangeSlider id={`${uid}-turbidity`} testId="sky-turbidity-slider" label={pick("대기 탁도 (Mie)", "Turbidity (Mie)")} readout={config.atmosphere.turbidity.toFixed(1)} min={1} max={10} step={0.1} value={config.atmosphere.turbidity} onChange={(turbidity) => setConfig((prev) => ({ ...prev, atmosphere: { ...prev.atmosphere, turbidity } }))} />
                  <RangeSlider id={`${uid}-cloud`} testId="sky-cloud-slider" label={pick("구름량 (Cloud)", "Cloud Coverage")} readout={`${Math.round(config.atmosphere.cloudCoverage * 100)}%`} toneClass="text-cool" min={0} max={1} step={0.05} value={config.atmosphere.cloudCoverage} onChange={(cloudCoverage) => setConfig((prev) => ({ ...prev, atmosphere: { ...prev.atmosphere, cloudCoverage } }))} />
                  <RangeSlider id={`${uid}-rayleigh`} testId="sky-rayleigh-slider" label={pick("레일리 산란", "Rayleigh Scatter")} readout={config.atmosphere.rayleighCoeff.toFixed(2)} toneClass="text-fg" min={0.3} max={2.0} step={0.05} value={config.atmosphere.rayleighCoeff} onChange={(rayleighCoeff) => setConfig((prev) => ({ ...prev, atmosphere: { ...prev.atmosphere, rayleighCoeff } }))} />
                  <RangeSlider id={`${uid}-ozone`} testId="sky-ozone-slider" label={pick("오존 청색 흡수", "Ozone Chappuis")} readout={config.atmosphere.ozoneStrength.toFixed(2)} toneClass="text-cool" min={0} max={1.5} step={0.05} value={config.atmosphere.ozoneStrength} onChange={(ozoneStrength) => setConfig((prev) => ({ ...prev, atmosphere: { ...prev.atmosphere, ozoneStrength } }))} />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 border-t border-line pt-3 text-center text-[10px]">
                {([
                  [pick("천정", "Zenith"), evaluation.sky.zenith.oklchCss],
                  [pick("중천", "Mid Sky"), evaluation.sky.midSky.oklchCss],
                  [pick("지평선", "Horizon"), evaluation.sky.horizon.oklchCss],
                  [pick("지면 반사", "Ground"), evaluation.sky.groundBounce.oklchCss],
                ] as const).map(([label, css]) => (
                  <div key={label} className="space-y-1">
                    <div className="h-7 rounded-md border border-line" style={{ backgroundColor: css }} />
                    <div className="font-semibold text-fg-2">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "studio-rig" && (
        <div id={`${uid}-panel-studio-rig`} role="tabpanel" aria-labelledby={`${uid}-tab-studio-rig`} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-fg">{pick("3점 조명 릭 · 바닥 그림자 캐처 평면 프리뷰", "3-Point Rig & Floor Shadow Catcher Preview")}</h3>
                <span data-testid="rig-contrast-readout" className="rounded-md border border-line bg-canvas px-2 py-0.5 text-[11px] font-bold text-accent tabular-nums">
                  {pick(`키:필 ${evaluation.metrics.keyToFillRatio.toFixed(2)}:1`, `Key:Fill ${evaluation.metrics.keyToFillRatio.toFixed(2)}:1`)}
                </span>
              </div>

              <svg
                data-testid="studio-rig-preview-svg" viewBox="0 0 360 220" role="img"
                aria-label={pick("3점 조명 방향과 캐릭터 바닥 그림자 캐처 투영 프리뷰", "3-point studio lighting direction and character floor shadow catcher preview")}
                className="h-56 w-full rounded-xl border border-line bg-canvas"
              >
                <defs>
                  <filter id={`${uid}-shadow-blur`} x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation={Math.max(0.8, shadow.penumbraBlurPx * 0.25)} />
                  </filter>
                </defs>
                <circle cx={stageCx} cy={stageCy} r="88" fill={evaluation.sky.groundBounce.oklchCss} opacity="0.22" stroke="var(--color-line-strong)" strokeWidth="1.2" />
                <circle cx={stageCx} cy={stageCy} r={stagePxPerM * 2} fill="none" stroke="var(--color-line)" strokeDasharray="3 3" strokeWidth="1" />
                <circle cx={stageCx} cy={stageCy} r={stagePxPerM} fill="none" stroke="var(--color-line)" strokeDasharray="2 3" strokeWidth="1" />
                {shadow.enabled ? (
                  <g>
                    <ellipse
                      data-testid="shadow-catcher-cast-ellipse" cx={shadowCenterX} cy={shadowCenterY} rx={shadowRx} ry={shadowRy}
                      transform={`rotate(${shadow.rotationDeg} ${shadowCenterX} ${shadowCenterY})`}
                      fill={shadow.shadowTint.oklchCss} opacity={shadow.castOpacity} filter={`url(#${uid}-shadow-blur)`}
                    />
                    <ellipse data-testid="shadow-catcher-contact-ellipse" cx={stageCx} cy={stageCy} rx={contactR} ry={contactR * 0.88} fill={shadow.shadowTint.oklchCss} opacity={shadow.contactAoOpacity} />
                  </g>
                ) : null}
                {evaluation.lights.map((light) => {
                  const rad = (light.azimuthDeg * Math.PI) / 180;
                  const ringR = light.id === "architectural-bounce" ? 72 : 84;
                  const lx = Number((stageCx + ringR * Math.sin(rad)).toFixed(2));
                  const ly = Number((stageCy - ringR * Math.cos(rad)).toFixed(2));
                  const isFocused = light.id === focusedLightId;
                  return (
                    <g key={light.id} opacity={light.enabled ? 1 : 0.28}>
                      <line x1={lx} y1={ly} x2={stageCx} y2={stageCy} stroke={light.color.oklchCss} strokeWidth={isFocused ? 2 : 1.1} strokeDasharray={light.id === "architectural-bounce" ? "3 3" : undefined} />
                      <circle cx={lx} cy={ly} r={isFocused ? 8 : 6} fill={light.color.oklchCss} stroke={isFocused ? "var(--color-accent)" : "var(--color-fg)"} strokeWidth={isFocused ? 2.2 : 1.2} />
                    </g>
                  );
                })}
                <circle cx={stageCx} cy={stageCy} r="10" fill="var(--color-raised)" stroke="var(--color-fg)" strokeWidth="1.6" />
                <circle cx={stageCx} cy={stageCy} r="3.5" fill={evaluation.key.enabled ? evaluation.key.color.oklchCss : "var(--color-fg-3)"} />
              </svg>

              <div data-testid="shadow-catcher-metrics" className="grid grid-cols-2 gap-2 text-[11px] tabular-nums sm:grid-cols-4">
                <MetricCell label={pick("그림자 길이", "Cast Length")} value={`${shadow.castLengthM.toFixed(2)} m`} testId="shadow-length-readout" />
                <MetricCell label={pick("투영 방위", "Shadow Azimuth")} value={shadow.isAmbientOnly ? pick("접지 전용", "Ambient") : `${shadow.shadowAzimuthDeg.toFixed(0)}°`} />
                <MetricCell label={pick("캐처 오파시티", "Catcher Opacity")} value={`${Math.round(shadow.castOpacity * 100)}%`} testId="shadow-opacity-readout" toneClass="text-accent" />
                <MetricCell label={pick("림 분리도", "Rim Separation")} value={`${Math.round(evaluation.metrics.rimSeparationIndex * 100)}%`} testId="rim-separation-readout" toneClass="text-cool" />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-fg">{pick("4채널 스튜디오 광원 슬롯", "4-Channel Studio Light Slots")}</span>
                <button
                  type="button" data-testid="toggle-sun-sync-btn" aria-pressed={config.syncKeyWithSun}
                  onClick={() => setConfig((prev) => ({ ...prev, syncKeyWithSun: !prev.syncKeyWithSun }))}
                  className={config.syncKeyWithSun ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {config.syncKeyWithSun ? <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Unlink className="h-3.5 w-3.5" aria-hidden="true" />}
                  <span>{config.syncKeyWithSun ? pick("키라이트·서울 태양 연동", "Key Synced to Sun") : pick("키라이트 수동 조작", "Manual Key Mode")}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {evaluation.lights.map((light) => {
                  const focused = light.id === focusedLightId;
                  return (
                    <div key={light.id} className={`flex items-center justify-between gap-1.5 rounded-lg border p-2 ${focused ? "border-accent bg-accent-soft" : "border-line bg-canvas"}`}>
                      <button
                        type="button" data-testid={`rig-select-${light.id}`} onClick={() => setFocusedLightId(light.id)}
                        className={`flex min-h-11 flex-1 cursor-pointer items-center gap-2 text-left text-xs font-semibold text-fg ${FOCUS_RING}`}
                      >
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-line" style={{ backgroundColor: light.color.oklchCss }} />
                        <span className="min-w-0 truncate">
                          <span className="block truncate">{isEn ? light.labelEn : light.labelKo}</span>
                          <span className="block text-[10px] font-normal text-fg-3 tabular-nums">{light.kelvin}K · {light.intensity.toFixed(2)}</span>
                        </span>
                      </button>
                      <button
                        type="button" data-testid={`rig-toggle-${light.id}`} aria-pressed={light.enabled}
                        onClick={() => toggleLightById(light.id)}
                        className={`min-h-11 min-w-11 cursor-pointer rounded-md border px-2 text-[11px] font-bold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                          light.enabled ? "border-good/40 bg-good-soft text-good" : "border-line bg-panel text-fg-3"
                        }`}
                      >
                        {light.enabled ? "ON" : "OFF"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {activeFocusedChannel && focusedLightId !== "architectural-bounce" ? (
                <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
                  <RangeSlider id={`${uid}-light-intensity`} testId="rig-light-intensity-slider" label={pick("광원 세기", "Intensity")} readout={activeFocusedChannel.intensity.toFixed(2)} min={0} max={2.5} step={0.05} value={activeFocusedChannel.intensity} onChange={(intensity) => updateChannel(focusedLightId, { intensity })} />
                  <RangeSlider id={`${uid}-light-kelvin`} testId="rig-light-kelvin-slider" label={pick("색온도 (K)", "Kelvin (K)")} readout={`${focusedLightId === "key" ? evaluation.key.kelvin : activeFocusedChannel.kelvin}K`} min={MIN_RIG_KELVIN} max={MAX_RIG_KELVIN} step={100} disabled={keyLockedBySun} value={focusedLightId === "key" ? evaluation.key.kelvin : activeFocusedChannel.kelvin} onChange={(kelvin) => updateChannel(focusedLightId, { kelvin })} />
                  <RangeSlider id={`${uid}-light-az`} testId="rig-light-azimuth-slider" label={pick("방위각", "Azimuth")} readout={`${Math.round(focusedLightId === "key" ? evaluation.key.azimuthDeg : activeFocusedChannel.azimuthDeg)}°`} toneClass="text-fg" min={0} max={355} step={5} disabled={keyLockedBySun} value={Math.round(focusedLightId === "key" ? evaluation.key.azimuthDeg : activeFocusedChannel.azimuthDeg)} onChange={(azimuthDeg) => updateChannel(focusedLightId, { azimuthDeg })} />
                  <RangeSlider id={`${uid}-light-el`} testId="rig-light-elevation-slider" label={pick("고도각", "Elevation")} readout={`${Math.round(focusedLightId === "key" ? evaluation.key.elevationDeg : activeFocusedChannel.elevationDeg)}°`} toneClass="text-cool" min={5} max={85} step={1} disabled={keyLockedBySun} value={Math.max(5, Math.round(focusedLightId === "key" ? evaluation.key.elevationDeg : activeFocusedChannel.elevationDeg))} onChange={(elevationDeg) => updateChannel(focusedLightId, { elevationDeg })} />
                </div>
              ) : (
                <div className="space-y-2.5 border-t border-line pt-3">
                  <div className="text-xs font-bold text-fg">{pick("건축 반사면 재질 (바운스 라이트)", "Architectural Bounce Surface")}</div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {ARCHITECTURAL_SURFACES.map((surface) => (
                      <button
                        key={surface.id} type="button" data-testid={`bounce-surface-${surface.id}`}
                        aria-pressed={config.bounce.surfaceMaterial === surface.id}
                        onClick={() => handleSelectSurface(surface.id)}
                        className={config.bounce.surfaceMaterial === surface.id ? BTN_ACTIVE : BTN_OUTLINE}
                      >
                        <span className="h-3 w-3 shrink-0 rounded-full border border-line" style={{ backgroundColor: surface.swatchOklchCss }} />
                        <span className="truncate">{isEn ? surface.labelEn : surface.labelKo}</span>
                      </button>
                    ))}
                  </div>
                  <RangeSlider id={`${uid}-bounce-intensity`} testId="rig-bounce-intensity-slider" label={pick("건축 바운스 세기", "Bounce Intensity")} readout={config.bounce.intensity.toFixed(2)} min={0} max={1.5} step={0.05} value={config.bounce.intensity} onChange={(intensity) => setConfig((prev) => ({ ...prev, bounce: { ...prev.bounce, intensity } }))} />
                </div>
              )}

              <div className="space-y-2.5 border-t border-line pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-fg">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    <span>{pick("바닥 그림자 캐처 설정", "Shadow Catcher Controls")}</span>
                  </span>
                  <button
                    type="button" data-testid="toggle-shadow-catcher-btn" aria-pressed={config.shadowCatcher.enabled}
                    onClick={() => setConfig((prev) => ({ ...prev, shadowCatcher: { ...prev.shadowCatcher, enabled: !prev.shadowCatcher.enabled } }))}
                    className={config.shadowCatcher.enabled ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {config.shadowCatcher.enabled ? pick("캐처 ON", "Catcher ON") : pick("캐처 OFF", "Catcher OFF")}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <RangeSlider id={`${uid}-subject-height`} testId="shadow-height-slider" label={pick("캐릭터 신장", "Subject Height")} readout={`${config.shadowCatcher.subjectHeightM.toFixed(2)} m`} toneClass="text-fg" min={0.8} max={2.4} step={0.04} value={config.shadowCatcher.subjectHeightM} onChange={(subjectHeightM) => setConfig((prev) => ({ ...prev, shadowCatcher: { ...prev.shadowCatcher, subjectHeightM } }))} />
                  <RangeSlider id={`${uid}-ground-roughness`} testId="shadow-roughness-slider" label={pick("바닥 거칠기", "Floor Roughness")} readout={`${Math.round(config.shadowCatcher.groundRoughness * 100)}%`} toneClass="text-cool" min={0.05} max={0.95} step={0.05} value={config.shadowCatcher.groundRoughness} onChange={(groundRoughness) => setConfig((prev) => ({ ...prev, shadowCatcher: { ...prev.shadowCatcher, groundRoughness } }))} />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h3 className="text-xs font-bold text-fg">{pick("2D 컷 리라이트 엔진용 JSON 조명 브리지", "2D Cut Relight Engine JSON Bridge")}</h3>
                <p className="text-[11px] text-fg-2 tabular-nums">
                  {pick(
                    `스키마 ${RELIGHT_BRIDGE_SCHEMA_VERSION} · 활성 광원 ${evaluation.metrics.activeLightCount}/4 · 추천 2D 프리셋 ${bridgePayload.threeLayer2dRelight.suggestedPresetId}`,
                    `Schema ${RELIGHT_BRIDGE_SCHEMA_VERSION} · Active ${evaluation.metrics.activeLightCount}/4 · Suggested 2D preset ${bridgePayload.threeLayer2dRelight.suggestedPresetId}`,
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" data-testid="copy-relight-bridge-btn" onClick={handleCopyBridge} className={BTN_OUTLINE}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("JSON 복사", "Copy JSON")}</span>
                </button>
                <button type="button" data-testid="export-relight-bridge-btn" onClick={handleExportBridge} className={BTN_SOLID}>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("2D 컷 리라이트 브리지 내보내기", "Export 2D Relight Bridge")}</span>
                </button>
              </div>
            </div>

            {exportStatus ? (
              <p data-testid="export-status-message" role="status" className="flex items-center gap-1.5 rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs font-semibold text-good">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{exportStatus}</span>
              </p>
            ) : null}

            <details className="rounded-lg border border-line bg-canvas p-2.5">
              <summary className="cursor-pointer text-xs font-semibold text-fg">
                {pick("브리지 JSON 페이로드 미리보기", "Preview Bridge JSON Payload")}
              </summary>
              <pre data-testid="relight-bridge-json-preview" className="mt-2 max-h-44 overflow-auto rounded-md border border-line bg-panel p-2 text-[10px] text-fg-2 tabular-nums">
                {bridgeJson}
              </pre>
            </details>
          </div>
        </div>
      )}
    </section>
  );
}
