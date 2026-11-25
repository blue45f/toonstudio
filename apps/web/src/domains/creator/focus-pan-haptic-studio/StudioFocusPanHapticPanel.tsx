/**
 * Wave 49F — 집중 몰입 세션 · 포커스 자동 패닝 & 펜촉 햅틱 프로파일러 스튜디오 패널.
 *
 * - 상단 "로컬 입력 패턴 전용 · 의료 진단 아님" 투명 안내 배지 + 로컬 작업 리듬 시뮬레이터
 * - 순수 시맨틱 SVG 2단 프리뷰(좌: 확대 캔버스 데드존·자동 패닝 추종 벡터, 우: 4종 펜촉 햅틱 파형·마찰 주파수 곡선)
 * - 4종 펜촉 프리셋 카드 + 패닝 감쇠·데드존 슬라이더 + 모션 축소 안전 가드 + 비파괴 적용·원복 + 프로파일 JSON 복사
 * - Calm Atelier 토큰 준수(oklch/currentColor 전용, 바이올렛 휴 270~320도 0%, 원시 색·광범위 트랜지션·스토리지·장식 아이콘 0건)
 */

import {
  Check, Code2, Compass, Crosshair, Eye, Feather, Move, RotateCcw,
  ShieldCheck, SlidersHorizontal, Timer, Undo2, Vibrate, Volume2, VolumeX,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  FOCUS_PAN_CURSOR_PRESETS, FOCUS_PAN_MAX_DAMPING, FOCUS_PAN_MAX_DEADZONE,
  FOCUS_PAN_MIN_DAMPING, FOCUS_PAN_MIN_DEADZONE, LOCAL_NON_MEDICAL_NOTICE_EN,
  LOCAL_NON_MEDICAL_NOTICE_KO, NIB_HAPTIC_PROFILES, WORK_RHYTHM_PRESETS,
  applyFocusHapticSession, buildNibFrequencyCurve, computeFocusAutoPanDelta,
  createFocusHapticSession, evaluateWorkRhythmSession, exportFocusHapticProfileJson,
  formatOklch, getNibHapticProfile, getWorkRhythmPreset, previewNibHapticPreset,
  revertFocusHapticSession, simulateFocusAutoPanTrajectory, synthesizeNibHapticResponse,
  triggerSafeNavigatorVibrate, tweakFocusHapticConfig,
  type FocusAutoPanConfig, type FocusAutoPanResult, type FocusAutoPanSample,
  type FocusCursorPresetId, type FocusHapticPresetConfig, type FocusHapticSessionState,
  type NibHapticProfileId, type NibHapticSynthesis, type WorkRhythmInput,
  type WorkRhythmPresetId, type WorkRhythmState,
} from "./focus-pan-haptic-engine";

export interface StudioFocusPanHapticPanelProps {
  readonly initialNibId?: NibHapticProfileId;
  readonly initialWorkMinutes?: number;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApply?: (config: FocusHapticPresetConfig, session: FocusHapticSessionState) => void;
  readonly onExportJson?: (json: string, session: FocusHapticSessionState) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

// 탈-바이올렛 OKLCH 시맨틱 SVG 전용 잉크 (블루프린트 225°, 에메랄드 155°, 주의 55°, 경고 28°)
const SVG_INK_PAN = formatOklch({ l: 0.56, c: 0.14, h: 155 });
const SVG_INK_VEL = formatOklch({ l: 0.56, c: 0.13, h: 225 });
const SVG_INK_DEADZONE = formatOklch({ l: 0.62, c: 0.15, h: 55 }, 0.16);
const SVG_INK_DEADZONE_STROKE = formatOklch({ l: 0.6, c: 0.15, h: 55 });
const SVG_INK_GUARD = formatOklch({ l: 0.56, c: 0.18, h: 28 });
const SVG_HUD_BG = formatOklch({ l: 0.16, c: 0.01, h: 230 }, 0.78);
const SVG_HUD_TEXT = formatOklch({ l: 0.97, c: 0.005, h: 90 });

function detectReducedMotionPreference(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function rhythmBadgeClass(state: WorkRhythmState): string {
  if (state === "flow") return "border-good bg-good-soft text-good";
  return state === "drift-check" ? "border-warn bg-warning-soft text-warn" : "border-accent bg-accent-soft text-accent";
}

function panReasonLabel(reason: FocusAutoPanResult["reason"], isEn: boolean): string {
  switch (reason) {
    case "active-edge-pan": return isEn ? "Edge Pan Active" : "외곽 자동 패닝 작동";
    case "reduced-motion-guard": return isEn ? "Reduced-Motion Guard" : "모션 축소 안전 가드";
    case "disabled": return isEn ? "Auto-Pan Paused" : "자동 패닝 꺼짐";
    case "below-zoom-threshold": return isEn ? "Below 200% Zoom" : "200% 미만 대기";
    case "inside-safe-zone": return isEn ? "Inside Safe Zone" : "중앙 안전 구역";
  }
}

function RangeSliderRow(props: {
  readonly id: string; readonly testId: string; readonly label: string; readonly readout: string;
  readonly min: number; readonly max: number; readonly step: number; readonly value: number;
  readonly onChange: (value: number) => void;
}): ReactElement {
  const { id, testId, label, readout, min, max, step, value, onChange } = props;
  return (
    <div className="space-y-0.5">
      <label htmlFor={id} className="flex items-center justify-between gap-2 text-xs font-medium text-fg-2 [word-break:keep-all]">
        <span>{label}</span>
        <span data-testid={`${testId}-readout`} className="font-mono font-bold text-fg tabular-nums">{readout}</span>
      </label>
      <input
        id={id} data-testid={testId} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 w-full cursor-pointer accent-accent"
      />
    </div>
  );
}

function FocusAutoPanDiagramSvg(props: {
  readonly sample: FocusAutoPanSample; readonly config: FocusAutoPanConfig;
  readonly result: FocusAutoPanResult; readonly isEn: boolean;
}): ReactElement {
  const { sample, config, result, isEn } = props;
  const vpX = 16;
  const vpY = 26;
  const vpW = 288;
  const vpH = 162;

  const dz = result.effectiveDeadzoneRatio;
  const safeX = vpX + vpW * dz;
  const safeY = vpY + vpH * dz;
  const safeW = vpW * (1 - dz * 2);
  const safeH = vpH * (1 - dz * 2);

  const curX = Math.round((vpX + sample.cursorNormX * vpW) * 10) / 10;
  const curY = Math.round((vpY + sample.cursorNormY * vpH) * 10) / 10;
  const velEndX = Math.round(Math.min(vpX + vpW - 4, Math.max(vpX + 4, curX + sample.velocityX * 1.4)) * 10) / 10;
  const velEndY = Math.round(Math.min(vpY + vpH - 4, Math.max(vpY + 4, curY + sample.velocityY * 1.4)) * 10) / 10;

  const trajectory = simulateFocusAutoPanTrajectory(sample, config, 6);
  const center = { x: vpX + vpW / 2, y: vpY + vpH / 2 };
  const trajPoints = [
    `${center.x},${center.y}`,
    ...trajectory.map((pt) => {
      const tx = Math.min(vpX + vpW - 8, Math.max(vpX + 8, center.x + pt.cumulativeX * 0.65));
      const ty = Math.min(vpY + vpH - 8, Math.max(vpY + 8, center.y + pt.cumulativeY * 0.65));
      return `${Math.round(tx * 10) / 10},${Math.round(ty * 10) / 10}`;
    }),
  ].join(" ");

  const panEndX = Math.round(Math.min(vpX + vpW - 8, Math.max(vpX + 8, center.x + result.panDeltaX * 3.1)) * 10) / 10;
  const panEndY = Math.round(Math.min(vpY + vpH - 8, Math.max(vpY + 8, center.y + result.panDeltaY * 3.1)) * 10) / 10;

  return (
    <svg
      data-testid="focus-autopan-svg" data-pan-active={String(result.active)}
      data-pan-reason={result.reason} data-deadzone-pct={Math.round(dz * 100)}
      data-damping={result.effectiveDamping.toFixed(2)} data-zoom-level={sample.zoomLevel}
      data-violet-free="true" viewBox="0 0 320 220" role="img"
      className="h-56 w-full rounded-xl border border-line bg-canvas text-fg"
      aria-label={isEn ? "Zoomed canvas deadzone and focus auto-pan vector diagram" : "확대 캔버스 외곽 데드존 및 포커스 자동 패닝 추종 벡터 도해"}
    >
      <text x="16" y="17" fill="currentColor" fillOpacity={0.78} fontSize="9.5" fontWeight="700">
        {isEn ? "ZOOM FOCUS AUTO-PAN & EDGE DEADZONE" : "확대 포커스 자동 패닝 · 외곽 데드존"}
      </text>
      <text x="304" y="17" textAnchor="end" fill="currentColor" fillOpacity={0.72} fontSize="9" fontFamily="monospace">
        {`${sample.zoomLevel}% · DZ ${Math.round(dz * 100)}%`}
      </text>

      <rect x={vpX} y={vpY} width={vpW} height={vpH} rx="8" fill={SVG_INK_DEADZONE} stroke="currentColor" strokeOpacity={0.28} />
      <rect
        x={safeX} y={safeY} width={safeW} height={safeH} rx="5"
        fill="currentColor" fillOpacity={0.04} stroke={SVG_INK_DEADZONE_STROKE} strokeWidth="1.3" strokeDasharray="4 3"
      />
      <line x1={center.x} y1={vpY} x2={center.x} y2={vpY + vpH} stroke="currentColor" strokeOpacity={0.1} />
      <line x1={vpX} y1={center.y} x2={vpX + vpW} y2={center.y} stroke="currentColor" strokeOpacity={0.1} />

      {result.active ? (
        <g>
          <polyline points={trajPoints} fill="none" stroke={SVG_INK_PAN} strokeOpacity={0.45} strokeWidth="2" strokeDasharray="3 2" />
          <line x1={center.x} y1={center.y} x2={panEndX} y2={panEndY} stroke={SVG_INK_PAN} strokeWidth="2.6" strokeLinecap="round" />
          <circle cx={panEndX} cy={panEndY} r="4.5" fill={SVG_INK_PAN} />
        </g>
      ) : null}

      <circle cx={center.x} cy={center.y} r="4" fill="none" stroke="currentColor" strokeOpacity={0.55} strokeWidth="1.4" />
      <line x1={curX} y1={curY} x2={velEndX} y2={velEndY} stroke={SVG_INK_VEL} strokeWidth="2" strokeLinecap="round" />
      <circle cx={curX} cy={curY} r="5.5" fill={SVG_INK_VEL} stroke="currentColor" strokeWidth="1.3" />
      <text
        x={Math.min(vpX + vpW - 38, Math.max(vpX + 8, curX - 10))}
        y={curY > vpY + vpH - 22 ? curY - 10 : curY + 15}
        fill={SVG_INK_VEL} fontSize="8.5" fontWeight="700" fontFamily="monospace"
      >
        PEN
      </text>

      {result.reason === "reduced-motion-guard" ? (
        <g>
          <rect x="34" y="88" width="252" height="36" rx="7" fill={SVG_HUD_BG} stroke={SVG_INK_GUARD} strokeWidth="1.4" />
          <text x="160" y="109" textAnchor="middle" fill={SVG_HUD_TEXT} fontSize="9.5" fontWeight="700">
            {isEn ? "prefers-reduced-motion active — Auto-pan locked (0, 0)" : "모션 축소 가드 활성 — 자동 패닝 안전 정지 (0, 0)"}
          </text>
        </g>
      ) : null}

      <rect x="16" y="194" width="288" height="20" rx="5" fill={SVG_HUD_BG} />
      <text x="24" y="207" fill={SVG_HUD_TEXT} fontSize="8.5" fontFamily="monospace">
        {`DELTA (${result.panDeltaX.toFixed(1)}, ${result.panDeltaY.toFixed(1)})px · DAMP ${result.effectiveDamping.toFixed(2)} · ${panReasonLabel(result.reason, isEn)}`}
      </text>
    </svg>
  );
}

function NibHapticWaveformSvg(props: {
  readonly synthesis: NibHapticSynthesis; readonly strokePressure: number;
  readonly strokeSpeed: number; readonly isEn: boolean;
}): ReactElement {
  const { synthesis, strokePressure, strokeSpeed, isEn } = props;
  const activeSpec = getNibHapticProfile(synthesis.profileId);
  const activeColor = formatOklch(activeSpec.accentOklch);
  const activeFill = formatOklch(activeSpec.accentOklch, 0.22);

  const waveX0 = 16;
  const waveW = 288;
  const waveMidY = 58;
  const wavePolyline = synthesis.waveformSamples
    .map((sample, idx) => {
      const x = waveX0 + (idx / Math.max(1, synthesis.waveformSamples.length - 1)) * waveW;
      return `${Math.round(x * 10) / 10},${Math.round((waveMidY - sample * 23) * 10) / 10}`;
    })
    .join(" ");

  const pulseRects: Array<{ readonly x: number; readonly w: number; readonly key: number }> = [];
  let cursorMs = 0;
  const maxTrackMs = Math.max(120, synthesis.totalPulseDurationMs);
  synthesis.vibratePatternMs.forEach((ms, idx) => {
    if (idx % 2 === 0) {
      pulseRects.push({
        x: Math.round((waveX0 + (cursorMs / maxTrackMs) * waveW) * 10) / 10,
        w: Math.round(Math.max(4, (ms / maxTrackMs) * waveW) * 10) / 10,
        key: idx,
      });
    }
    cursorMs += ms;
  });

  const mapHzToY = (hz: number): number =>
    Math.round((184 - Math.min(1, Math.max(0, (hz - 400) / 4200)) * 64) * 10) / 10;
  const mapPressureToX = (p: number): number =>
    Math.round((waveX0 + Math.min(1, Math.max(0, p)) * waveW) * 10) / 10;

  const currentDotX = mapPressureToX(strokePressure);
  const currentDotY = mapHzToY(synthesis.audioBandpassHz);

  return (
    <svg
      data-testid="nib-haptic-waveform-svg" data-nib-id={synthesis.profileId}
      data-vibration-hz={synthesis.vibrationFrequencyHz} data-bandpass-hz={synthesis.audioBandpassHz}
      data-amplitude={synthesis.amplitude.toFixed(2)} data-reduced-motion={String(synthesis.suppressedByReducedMotion)}
      data-violet-free="true" viewBox="0 0 320 220" role="img"
      className="h-56 w-full rounded-xl border border-line bg-canvas text-fg"
      aria-label={isEn ? "Four nib haptic waveform and friction bandpass frequency curves" : "4종 펜촉 햅틱 파형 및 마찰 대역통과 주파수 곡선"}
    >
      <text x="16" y="17" fill="currentColor" fillOpacity={0.78} fontSize="9.5" fontWeight="700">
        {isEn ? "NIB HAPTIC WAVEFORM & FRICTION CURVE" : "4종 펜촉 햅틱 파형 · 마찰 주파수 곡선"}
      </text>
      <text x="304" y="17" textAnchor="end" fill={activeColor} fontSize="9" fontWeight="700" fontFamily="monospace">
        {`${synthesis.vibrationFrequencyHz}Hz · BP ${synthesis.audioBandpassHz}Hz`}
      </text>

      <rect x="16" y="26" width="288" height="72" rx="7" fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.15} />
      <line x1="16" y1={waveMidY} x2="304" y2={waveMidY} stroke="currentColor" strokeOpacity={0.14} strokeDasharray="3 3" />
      <polyline points={wavePolyline} fill="none" stroke={activeColor} strokeWidth="2.2" strokeLinejoin="round" />

      {pulseRects.map((rect) => (
        <rect key={rect.key} x={rect.x} y="88" width={rect.w} height="6" rx="2" fill={activeColor} fillOpacity={0.75} />
      ))}

      <rect x="16" y="110" width="288" height="78" rx="7" fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.15} />
      <text x="22" y="121" fill="currentColor" fillOpacity={0.55} fontSize="7.5" fontFamily="monospace">4.6kHz</text>
      <text x="22" y="184" fill="currentColor" fillOpacity={0.55} fontSize="7.5" fontFamily="monospace">0.4kHz</text>

      {NIB_HAPTIC_PROFILES.map((profile) => {
        const isCurrent = profile.id === synthesis.profileId;
        const pts = buildNibFrequencyCurve(profile.id, strokeSpeed)
          .map((pt) => `${mapPressureToX(pt.pressureNorm)},${mapHzToY(pt.audioBandpassHz)}`)
          .join(" ");
        return (
          <polyline
            key={profile.id} points={pts} fill="none"
            stroke={formatOklch(profile.accentOklch, isCurrent ? 1 : 0.34)}
            strokeWidth={isCurrent ? 2.4 : 1.2} strokeDasharray={isCurrent ? undefined : "3 3"}
          />
        );
      })}

      <circle cx={currentDotX} cy={currentDotY} r="7" fill={activeFill} />
      <circle cx={currentDotX} cy={currentDotY} r="3.6" fill={activeColor} stroke="currentColor" strokeWidth="1" />

      <rect x="16" y="194" width="288" height="20" rx="5" fill={SVG_HUD_BG} />
      <text x="24" y="207" fill={SVG_HUD_TEXT} fontSize="8.5" fontFamily="monospace">
        {`AMP ${Math.round(synthesis.amplitude * 100)}% · Q ${synthesis.audioBandpassQ} · PULSE [${synthesis.vibratePatternMs.join(",") || "OFF"}]ms`}
      </text>
    </svg>
  );
}

/** 집중 몰입 세션 · 포커스 자동 패닝 & 펜촉 햅틱 프로파일러 스튜디오 패널. */
export function StudioFocusPanHapticPanel(props: StudioFocusPanHapticPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();
  const initialNib: NibHapticProfileId = props.initialNibId ?? "kent-gpen";
  const initialMinutes = props.initialWorkMinutes ?? 26;

  const [rhythmInput, setRhythmInput] = useState<WorkRhythmInput>({
    continuousMinutes: initialMinutes, undoPerMinute: 1.5, strokeCadencePerMin: 46, zoomLevel: 320,
  });
  const [cursorPresetId, setCursorPresetId] = useState<FocusCursorPresetId>("right-bottom-edge");
  const [strokePressure, setStrokePressure] = useState<number>(0.68);
  const [strokeSpeed, setStrokeSpeed] = useState<number>(620);
  const [session, setSession] = useState<FocusHapticSessionState>(() =>
    createFocusHapticSession({ nibProfileId: initialNib, prefersReducedMotion: detectReducedMotionPreference() }),
  );
  const [showJson, setShowJson] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const working = session.workingConfig;
  const rhythmEval = useMemo(() => evaluateWorkRhythmSession(rhythmInput), [rhythmInput]);
  const activeCursorPreset = useMemo(
    () => FOCUS_PAN_CURSOR_PRESETS.find((preset) => preset.id === cursorPresetId) ?? FOCUS_PAN_CURSOR_PRESETS[0],
    [cursorPresetId],
  );
  const autoPanConfig: FocusAutoPanConfig = useMemo(
    () => ({
      enabled: working.autoPanEnabled, edgeDeadzoneRatio: working.edgeDeadzoneRatio,
      damping: working.panDamping, minZoomPercent: working.minPanZoomPercent,
      maxZoomPercent: working.maxPanZoomPercent, maxPanStepPx: 42, prefersReducedMotion: working.prefersReducedMotion,
    }),
    [working],
  );
  const autoPanSample: FocusAutoPanSample = useMemo(
    () => ({
      cursorNormX: activeCursorPreset.cursorNormX, cursorNormY: activeCursorPreset.cursorNormY,
      velocityX: activeCursorPreset.velocityX, velocityY: activeCursorPreset.velocityY,
      zoomLevel: rhythmEval.clampedInput.zoomLevel,
    }),
    [activeCursorPreset, rhythmEval.clampedInput.zoomLevel],
  );
  const autoPanResult = useMemo(() => computeFocusAutoPanDelta(autoPanSample, autoPanConfig), [autoPanSample, autoPanConfig]);
  const hapticSynthesis = useMemo(
    () =>
      synthesizeNibHapticResponse(
        working.nibProfileId,
        { pressure: strokePressure, speedPxPerSec: strokeSpeed },
        {
          masterIntensity: working.hapticIntensity,
          audioFrictionEnabled: working.audioFrictionEnabled,
          prefersReducedMotion: working.prefersReducedMotion,
        },
      ),
    [working.nibProfileId, working.hapticIntensity, working.audioFrictionEnabled, working.prefersReducedMotion, strokePressure, strokeSpeed],
  );
  const profileJson = useMemo(
    () => exportFocusHapticProfileJson(session, rhythmEval, autoPanResult, hapticSynthesis),
    [session, rhythmEval, autoPanResult, hapticSynthesis],
  );

  const handleSelectRhythmPreset = (presetId: WorkRhythmPresetId): void => {
    const preset = getWorkRhythmPreset(presetId);
    setRhythmInput(preset.input);
    setStatusMessage(pick(`'${preset.labelKo}' 로컬 입력 패턴을 불러왔습니다.`, `Loaded '${preset.labelEn}' local input pattern.`));
  };

  const handleSelectNib = (nibId: NibHapticProfileId): void => {
    const spec = getNibHapticProfile(nibId);
    setSession((prev) => previewNibHapticPreset(prev, nibId));
    setStatusMessage(pick(`'${spec.nameKo}' 펜촉 햅틱을 미리보는 중입니다. 원할 때 적용하세요.`, `Previewing '${spec.nameEn}' nib haptic profile.`));
  };

  const handleTweak = (patch: Partial<FocusHapticPresetConfig>, note?: string): void => {
    setSession((prev) => tweakFocusHapticConfig(prev, patch));
    if (note) setStatusMessage(note);
  };

  const handleApply = (): void => {
    const next = applyFocusHapticSession(session);
    setSession(next);
    props.onApply?.(next.appliedConfig, next);
    const nibSpec = getNibHapticProfile(next.appliedConfig.nibProfileId);
    setStatusMessage(pick(`'${nibSpec.nameKo}' 프로파일과 자동 패닝 설정을 비파괴 적용했습니다.`, `Applied '${nibSpec.nameEn}' profile and auto-pan settings non-destructively.`));
  };

  const handleRevert = (): void => {
    setSession((prev) => revertFocusHapticSession(prev));
    setStatusMessage(pick("원본 기본 프로파일로 되돌렸습니다.", "Reverted to baseline focus & haptic profile."));
  };

  const handleTestVibrate = (): void => {
    const fired = triggerSafeNavigatorVibrate(hapticSynthesis.vibratePatternMs, working.prefersReducedMotion);
    if (working.prefersReducedMotion) {
      setStatusMessage(pick("모션 축소 가드가 켜져 있어 진동 펄스 출력을 생략했습니다.", "Vibration test skipped while reduced-motion guard is active."));
      return;
    }
    const pulseText = hapticSynthesis.vibratePatternMs.join(", ");
    setStatusMessage(
      fired
        ? pick(`진동 펄스 [${pulseText}]ms를 재생했습니다.`, `Triggered tactile pulse [${pulseText}] ms.`)
        : pick(`현재 브라우저가 진동 API를 지원하지 않아 파형 미리보기로 대체 표시합니다 ([${pulseText}]ms).`, `Browser does not expose Vibration API; showing pulse preview [${pulseText}] ms.`),
    );
  };

  const handleCopyJson = (): void => {
    props.onExportJson?.(profileJson, session);
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(profileJson).catch(() => undefined);
    }
    setShowJson(true);
    setStatusMessage(
      pick(
        `집중·자동 패닝·펜촉 햅틱 프로파일 JSON(${profileJson.length.toLocaleString("ko-KR")}B)을 복사했습니다.`,
        `Copied Focus/Pan/Haptic profile JSON (${profileJson.length.toLocaleString("en-US")} B).`,
      ),
    );
  };

  const handleResetAll = (): void => {
    setRhythmInput({ continuousMinutes: initialMinutes, undoPerMinute: 1.5, strokeCadencePerMin: 46, zoomLevel: 320 });
    setCursorPresetId("right-bottom-edge");
    setStrokePressure(0.68);
    setStrokeSpeed(620);
    setSession(createFocusHapticSession({ nibProfileId: initialNib, prefersReducedMotion: false }));
    setShowJson(false);
    setStatusMessage(pick("모든 시뮬레이션 입력과 프로파일을 초기화했습니다.", "Reset all inputs and session state."));
  };

  const sessionStatusLabel =
    session.status === "applied" ? pick("비파괴 적용됨", "Applied")
      : session.status === "previewing" ? pick("미리보기 중", "Previewing")
        : session.status === "tweaked" ? pick("파라미터 조정 중", "Tweaked")
          : session.status === "reverted" ? pick("원본 되돌림 완료", "Reverted")
            : pick("원본 유지 중", "Baseline");

  return (
    <section
      data-testid="studio-focus-pan-haptic-panel"
      aria-label={pick("집중 몰입 세션·포커스 자동 패닝·펜촉 햅틱 프로파일러", "Flow-State Focus & Nib Haptic Studio")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <Feather className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("포커스 · 펜촉 햅틱 스튜디오", "Focus & Nib Haptic Studio")}
            </span>
            <span data-testid="focus-nonmedical-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good [word-break:keep-all]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick(LOCAL_NON_MEDICAL_NOTICE_KO, LOCAL_NON_MEDICAL_NOTICE_EN)}
            </span>
            <span data-testid="focus-session-status-badge" className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2 tabular-nums">
              {sessionStatusLabel}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("집중 몰입 세션 · 확대 자동 패닝 & 4종 펜촉 햅틱 프로파일러", "Flow-State Focus, Zoom Auto-Pan & 4-Nib Haptic Profiler")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "로컬 캔버스 입력 패턴만으로 작업 리듬과 확대 자동 패닝, 종이·펜촉 마찰 햅틱을 비파괴로 조율합니다. 모든 계산은 기기 내부에서만 동작합니다.",
              "Locally tunes work rhythm cues, zoomed edge auto-panning, and paper-nib haptic friction profiles with non-destructive apply and revert.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="focus-apply-btn" onClick={handleApply} className={BTN_SOLID}>
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("프리셋 비파괴 적용", "Apply Preset")}
          </button>
          <button type="button" data-testid="focus-revert-btn" disabled={!session.canRevert} onClick={handleRevert} className={BTN_OUTLINE}>
            <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("원본 되돌리기", "Revert")}
          </button>
          <button type="button" data-testid="focus-copy-json-btn" onClick={handleCopyJson} className={BTN_OUTLINE}>
            <Code2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="focus-reset-btn" onClick={handleResetAll} className={BTN_OUTLINE}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div data-testid="focus-status-banner" role="status" aria-live="polite" className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]">
          {statusMessage}
        </div>
      ) : null}

      {/* 순수 시맨틱 SVG 2단 프리뷰 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <FocusAutoPanDiagramSvg sample={autoPanSample} config={autoPanConfig} result={autoPanResult} isEn={isEn} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
              <Compass className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("포커스 자동 패닝 추종", "Focus Auto-Pan Tracking")}
            </span>
            <span data-testid="focus-pan-vector-readout" className="font-mono tabular-nums">
              {`Δ(${autoPanResult.panDeltaX.toFixed(1)}, ${autoPanResult.panDeltaY.toFixed(1)})px`}
            </span>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <NibHapticWaveformSvg synthesis={hapticSynthesis} strokePressure={strokePressure} strokeSpeed={strokeSpeed} isEn={isEn} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
              <Vibrate className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {isEn ? getNibHapticProfile(working.nibProfileId).nameEn : getNibHapticProfile(working.nibProfileId).nameKo}
            </span>
            <button type="button" data-testid="nib-vibrate-test-btn" onClick={handleTestVibrate} className={BTN_OUTLINE}>
              <Vibrate className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("진동 펄스 테스트", "Test Pulse")}
            </button>
          </div>
        </div>
      </div>

      {/* 본문 2컬럼: 좌(로컬 작업 리듬 코치) / 우(확대 자동 패닝·커서 테스트) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 rounded-xl border border-line bg-raised p-4 xl:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Timer className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("로컬 작업 리듬 시뮬레이터", "Local Work Rhythm Simulator")}
            </span>
            <span data-testid="rhythm-state-badge" data-rhythm-state={rhythmEval.state} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${rhythmBadgeClass(rhythmEval.state)}`}>
              {isEn ? rhythmEval.labelEn : rhythmEval.labelKo}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label={pick("작업 리듬 시나리오 선택", "Select work rhythm scenario")}>
            {WORK_RHYTHM_PRESETS.map((preset) => (
              <button key={preset.id} type="button" data-testid={`rhythm-preset-${preset.id}`} onClick={() => handleSelectRhythmPreset(preset.id)} className={BTN_OUTLINE}>
                {isEn ? preset.labelEn : preset.labelKo}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <RangeSliderRow id={`${uid}-minutes`} testId="rhythm-slider-minutes" label={pick("연속 작업 시간", "Continuous Time")} readout={`${rhythmEval.clampedInput.continuousMinutes}${pick("분", "m")}`} min={0} max={120} step={1} value={rhythmInput.continuousMinutes} onChange={(continuousMinutes) => setRhythmInput((prev) => ({ ...prev, continuousMinutes }))} />
            <RangeSliderRow id={`${uid}-undo`} testId="rhythm-slider-undo" label={pick("분당 되돌리기 (Undo)", "Undos / Min")} readout={`${rhythmEval.clampedInput.undoPerMinute}${pick("회", "/m")}`} min={0} max={20} step={0.5} value={rhythmInput.undoPerMinute} onChange={(undoPerMinute) => setRhythmInput((prev) => ({ ...prev, undoPerMinute }))} />
            <RangeSliderRow id={`${uid}-cadence`} testId="rhythm-slider-cadence" label={pick("분당 스트로크 수", "Strokes / Min")} readout={`${rhythmEval.clampedInput.strokeCadencePerMin}${pick("획", "/m")}`} min={0} max={120} step={2} value={rhythmInput.strokeCadencePerMin} onChange={(strokeCadencePerMin) => setRhythmInput((prev) => ({ ...prev, strokeCadencePerMin }))} />
            <RangeSliderRow id={`${uid}-zoom`} testId="rhythm-slider-zoom" label={pick("캔버스 확대 배율", "Canvas Zoom")} readout={`${rhythmEval.clampedInput.zoomLevel}%`} min={100} max={600} step={10} value={rhythmInput.zoomLevel} onChange={(zoomLevel) => setRhythmInput((prev) => ({ ...prev, zoomLevel }))} />
          </div>

          <div data-testid="rhythm-adjustment-card" className="space-y-2 rounded-lg border border-line bg-card p-3 text-xs">
            <div className="grid grid-cols-3 gap-2 border-b border-line pb-2 text-center">
              <div>
                <div className="text-[11px] text-fg-3">{pick("UI 크롬 투명도", "Chrome Opacity")}</div>
                <div data-testid="rhythm-chrome-opacity" className="font-mono font-bold text-fg tabular-nums">{`${Math.round(rhythmEval.adjustment.uiChromeOpacity * 100)}%`}</div>
              </div>
              <div>
                <div className="text-[11px] text-fg-3">{pick("배경 앰비언스", "Ambience Gain")}</div>
                <div data-testid="rhythm-ambience-db" className="font-mono font-bold text-fg tabular-nums">{`${rhythmEval.adjustment.ambienceGainDb} dB`}</div>
              </div>
              <div>
                <div className="text-[11px] text-fg-3">{pick("휴식 알림", "Break Cue")}</div>
                <div data-testid="rhythm-break-cue" className="font-mono font-bold text-fg tabular-nums">
                  {rhythmEval.adjustment.wristStretchReminderMinutes !== null
                    ? pick(`${rhythmEval.adjustment.wristStretchReminderMinutes}분 스트레칭`, `${rhythmEval.adjustment.wristStretchReminderMinutes}m Stretch`)
                    : pick("몰입 유지", "Hold")}
                </div>
              </div>
            </div>
            <ul className="space-y-1 text-fg-2 [word-break:keep-all]">
              {(isEn ? rhythmEval.adjustment.suggestionsEn : rhythmEval.adjustment.suggestionsKo).map((line, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-line bg-raised p-4 xl:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Move className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("확대 작화 자동 패닝 설정 (200~600%)", "Zoomed Focus Auto-Pan (200–600%)")}
            </span>
            <span data-testid="autopan-reason-badge" className="rounded-full border border-line bg-card px-2.5 py-0.5 font-mono text-[11px] font-semibold text-fg-2">
              {panReasonLabel(autoPanResult.reason, isEn)}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button" data-testid="autopan-toggle-btn" aria-pressed={working.autoPanEnabled}
              onClick={() => handleTweak({ autoPanEnabled: !working.autoPanEnabled }, pick(working.autoPanEnabled ? "자동 패닝을 일시 중지했습니다." : "자동 패닝을 활성화했습니다.", working.autoPanEnabled ? "Auto-pan paused." : "Auto-pan enabled."))}
              className={working.autoPanEnabled ? BTN_ACTIVE : BTN_OUTLINE}
            >
              <Crosshair className="h-4 w-4 shrink-0" aria-hidden="true" />
              {working.autoPanEnabled ? pick("자동 패닝 켜짐", "Auto-Pan ON") : pick("자동 패닝 꺼짐", "Auto-Pan OFF")}
            </button>

            <button
              type="button" data-testid="reduced-motion-guard-btn" aria-pressed={working.prefersReducedMotion}
              onClick={() => handleTweak({ prefersReducedMotion: !working.prefersReducedMotion }, pick(!working.prefersReducedMotion ? "모션 축소 안전 가드를 켰습니다. 자동 패닝과 진동 펄스가 자동 차단됩니다." : "모션 축소 안전 가드를 해제했습니다.", !working.prefersReducedMotion ? "Reduced-motion safety guard enabled. Auto-pan and vibration paused." : "Reduced-motion safety guard disabled."))}
              className={working.prefersReducedMotion ? BTN_ACTIVE : BTN_OUTLINE}
            >
              <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
              {working.prefersReducedMotion ? pick("모션 축소 가드 활성", "Reduced-Motion Guard ON") : pick("모션 축소 가드 꺼짐", "Reduced-Motion Guard OFF")}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <RangeSliderRow id={`${uid}-deadzone`} testId="pan-slider-deadzone" label={pick("외곽 데드존 폭", "Edge Deadzone")} readout={`${Math.round(working.edgeDeadzoneRatio * 100)}%`} min={Math.round(FOCUS_PAN_MIN_DEADZONE * 100)} max={Math.round(FOCUS_PAN_MAX_DEADZONE * 100)} step={1} value={Math.round(working.edgeDeadzoneRatio * 100)} onChange={(pct) => handleTweak({ edgeDeadzoneRatio: pct / 100 })} />
            <RangeSliderRow id={`${uid}-damping`} testId="pan-slider-damping" label={pick("패닝 감쇠 계수 (Damping)", "Pan Damping")} readout={working.panDamping.toFixed(2)} min={FOCUS_PAN_MIN_DAMPING} max={FOCUS_PAN_MAX_DAMPING} step={0.01} value={working.panDamping} onChange={(panDamping) => handleTweak({ panDamping })} />
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-fg-2 [word-break:keep-all]">{pick("펜 커서 진입 위치 테스트", "Test Cursor Edge Entry")}</span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={pick("커서 테스트 위치", "Cursor test positions")}>
              {FOCUS_PAN_CURSOR_PRESETS.map((preset) => (
                <button key={preset.id} type="button" data-testid={`cursor-preset-${preset.id}`} aria-pressed={preset.id === cursorPresetId} onClick={() => setCursorPresetId(preset.id)} className={preset.id === cursorPresetId ? BTN_ACTIVE : BTN_OUTLINE}>
                  {isEn ? preset.labelEn : preset.labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
            <RangeSliderRow id={`${uid}-pressure`} testId="nib-slider-pressure" label={pick("테스트 필압", "Test Pressure")} readout={`${Math.round(strokePressure * 100)}%`} min={0} max={100} step={2} value={Math.round(strokePressure * 100)} onChange={(pct) => setStrokePressure(pct / 100)} />
            <RangeSliderRow id={`${uid}-speed`} testId="nib-slider-speed" label={pick("펜 이동 속도", "Stroke Speed")} readout={`${strokeSpeed} px/s`} min={0} max={1600} step={20} value={strokeSpeed} onChange={setStrokeSpeed} />
          </div>
        </div>
      </div>

      {/* 4종 펜촉 햅틱 · 마찰음 프로파일 카드 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("4종 펜촉 햅틱 · 마찰음 프로파일", "4 Nib Haptic & Paper Friction Profiles")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="audio-friction-toggle-btn" aria-pressed={working.audioFrictionEnabled} onClick={() => handleTweak({ audioFrictionEnabled: !working.audioFrictionEnabled })} className={working.audioFrictionEnabled ? BTN_ACTIVE : BTN_OUTLINE}>
              {working.audioFrictionEnabled ? <Volume2 className="h-4 w-4 shrink-0" aria-hidden="true" /> : <VolumeX className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {working.audioFrictionEnabled ? pick("마찰음 필터 켜짐", "Friction Filter ON") : pick("마찰음 필터 꺼짐", "Friction Filter OFF")}
            </button>
            <button type="button" data-testid="focus-toggle-json-btn" aria-expanded={showJson} onClick={() => setShowJson((prev) => !prev)} className={BTN_OUTLINE}>
              <Code2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              {showJson ? pick("JSON 접기", "Hide JSON") : pick("JSON 미리보기", "Inspect JSON")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label={pick("4종 펜촉 프리셋 선택", "Select nib haptic preset")}>
          {NIB_HAPTIC_PROFILES.map((profile) => {
            const selected = profile.id === working.nibProfileId;
            return (
              <button
                key={profile.id} type="button" data-testid={`nib-preset-card-${profile.id}`} aria-pressed={selected}
                onClick={() => handleSelectNib(profile.id)}
                className={`flex min-h-11 cursor-pointer flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
                  selected ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-bold text-fg">{isEn ? profile.nameEn : profile.nameKo}</span>
                  <span className="font-mono text-[11px] font-semibold text-fg-2 tabular-nums">{`${profile.baseVibrationHz}Hz`}</span>
                </div>
                <span className="text-[11px] text-fg-2">{isEn ? `${profile.paperEn} · ${profile.nibEn}` : `${profile.paperKo} · ${profile.nibKo}`}</span>
                <span className="text-[11px] text-fg-3">{isEn ? profile.summaryEn : profile.summaryKo}</span>
                <div className="mt-1 flex w-full items-center justify-between border-t border-line pt-1.5 font-mono text-[10px] text-fg-2 tabular-nums">
                  <span>{`BP ${profile.bandpassBaseHz}~${profile.bandpassMaxHz}Hz`}</span>
                  <span>{`Q ${profile.bandpassQ}`}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="max-w-md pt-1">
          <RangeSliderRow id={`${uid}-intensity`} testId="nib-slider-intensity" label={pick("마스터 햅틱 강도", "Master Haptic Intensity")} readout={`${Math.round(working.hapticIntensity * 100)}%`} min={0} max={100} step={5} value={Math.round(working.hapticIntensity * 100)} onChange={(pct) => handleTweak({ hapticIntensity: pct / 100 })} />
        </div>
      </div>

      {showJson ? (
        <pre data-testid="focus-json-preview" className="max-h-60 overflow-auto rounded-xl border border-line bg-canvas p-3.5 font-mono text-[11px] text-fg-2 tabular-nums">
          {profileJson}
        </pre>
      ) : null}
    </section>
  );
}
