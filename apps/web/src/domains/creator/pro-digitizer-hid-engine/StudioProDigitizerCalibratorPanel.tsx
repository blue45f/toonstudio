/**
 * Wave 46B — 클린룸 프로 디지타이저·와콤·애플펜슬 프로·S펜·트랙패드 캘리브레이터 패널.
 *
 * - 7대 기기 프로필 전환 + 공개 표준(W3C Pointer Events L3 · USB HID 0x0D) 지원 매트릭스
 * - 3차 베지어 필압 곡선 SVG 프리뷰 & P1/P2·데드존·지터 억제 슬라이더
 * - 실시간 포인터 테스트 패드(필압·기울기·배럴 회전·예측 지연 ms·HID 0x0D 패킷 디코드 표시)
 * - 익스프레스키·다이얼·스퀴즈·S펜 에어액션·트랙패드 제스처 단축키 매핑 편집 및 JSON 내보내기/불러오기
 * - Calm Atelier 시맨틱 토큰 전용(원시 색·광범위 트랜지션·기본 빈 객체 props·Web Storage·private Map store·BigInt 리터럴·장식 별 아이콘 0건)
 */

import {
  Activity, AlertTriangle, CheckCircle2, Copy, Cpu, Gauge,
  Keyboard, PenTool, Play, RotateCcw, Sliders, Trash2, Upload,
} from "lucide-react";
import {
  useEffect, useId, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent, type ReactElement,
} from "react";

import {
  PRESSURE_CURVE_PRESETS, PRO_DIGITIZER_PROFILES, STUDIO_BINDING_ACTIONS,
  createDefaultShortcutBindings, createPressureCurveFromPreset, createSimulatedTestStroke,
  encodeStandardHidDigitizerReport, evaluatePressureCurve, exportDigitizerConfigJson,
  getProDigitizerProfile, hidReportToRawPointerSample, importDigitizerConfigJson,
  isTriggerSupportedByProfile, normalizePointerSampleBatch, parseStandardHidDigitizerReport,
  samplePressureCurvePoints, updateShortcutBinding,
  type DigitizerCalibrationSnapshot, type NormalizedPointerBatchResult,
  type ParsedHidDigitizerReport, type PressureCurveConfig, type PressureCurvePresetId,
  type ProDigitizerProfileId, type RawPointerSample, type ShortcutBinding,
  type StudioBindingActionId,
} from "./pro-digitizer-engine";

export interface StudioProDigitizerCalibratorPanelProps {
  readonly initialProfileId?: ProDigitizerProfileId;
  readonly initialSmoothingStrength?: number;
  readonly initialEnablePrediction?: boolean;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onConfigChange?: (snapshot: DigitizerCalibrationSnapshot) => void;
  readonly onExportJson?: (json: string, snapshot: DigitizerCalibrationSnapshot) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

function readNativePointerList(
  nativeEvent: PointerEvent,
  methodName: "getCoalescedEvents" | "getPredictedEvents",
): readonly PointerEvent[] {
  const candidate = nativeEvent[methodName];
  if (typeof candidate !== "function") return [];
  try {
    const result = candidate.call(nativeEvent);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

function pointerEventToRawSample(
  ev: PointerEvent,
  rect: DOMRect,
  isPredicted: boolean,
): RawPointerSample {
  const safeW = Math.max(1, rect.width);
  const safeH = Math.max(1, rect.height);
  const x = ((ev.clientX - rect.left) / safeW) * 320;
  const y = ((ev.clientY - rect.top) / safeH) * 160;
  const pointerType = ev.pointerType === "touch" || ev.pointerType === "mouse" ? ev.pointerType : "pen";
  const ext = ev as PointerEvent & { readonly altitudeAngle?: number; readonly azimuthAngle?: number };
  return {
    x, y,
    timestampMs: Number.isFinite(ev.timeStamp) && ev.timeStamp > 0 ? ev.timeStamp : Date.now(),
    pressure: ev.pressure > 0 ? ev.pressure : ev.buttons > 0 ? 0.5 : 0,
    tiltX: Number.isFinite(ev.tiltX) ? ev.tiltX : 0,
    tiltY: Number.isFinite(ev.tiltY) ? ev.tiltY : 0,
    altitudeAngle: typeof ext.altitudeAngle === "number" ? ext.altitudeAngle : undefined,
    azimuthAngle: typeof ext.azimuthAngle === "number" ? ext.azimuthAngle : undefined,
    twist: Number.isFinite(ev.twist) ? ev.twist : 0,
    tangentialPressure: Number.isFinite(ev.tangentialPressure) ? ev.tangentialPressure : 0,
    isPredicted,
    pointerType,
  };
}

function TelemetryMetricCard(props: {
  readonly label: string; readonly value: string; readonly subtext: string;
  readonly testId: string; readonly valueTone?: string;
}): ReactElement {
  const { label, value, subtext, testId, valueTone = "text-fg" } = props;
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2.5">
      <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{label}</div>
      <div data-testid={testId} className={`mt-0.5 text-base font-bold tabular-nums ${valueTone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">{subtext}</div>
    </div>
  );
}

function PressureCurveSvgPreview(props: {
  readonly curve: PressureCurveConfig;
  readonly liveRawPressure: number | null;
  readonly isEn: boolean;
}): ReactElement {
  const { curve, liveRawPressure, isEn } = props;
  const pad = 20;
  const size = 180;
  const toX = (v: number): number => Math.round((pad + v * size) * 10) / 10;
  const toY = (v: number): number => Math.round((pad + (1 - v) * size) * 10) / 10;

  const sampled = useMemo(() => samplePressureCurvePoints(curve, 36), [curve]);
  const polylinePoints = sampled.map((pt) => `${toX(pt.x)},${toY(pt.y)}`).join(" ");
  const liveCalibrated = liveRawPressure !== null ? evaluatePressureCurve(liveRawPressure, curve) : null;

  return (
    <svg
      data-testid="digitizer-bezier-svg"
      data-preset={curve.presetId}
      viewBox="0 0 220 220"
      className="mx-auto w-full max-w-[232px] text-fg"
      role="img"
      aria-label={isEn ? "Cubic Bézier pressure response curve" : "3차 베지어 필압 응답 곡선"}
    >
      <rect x={pad} y={pad} width={size} height={size} rx="6" className="text-canvas" fill="currentColor" />
      <rect x={pad} y={pad} width={size} height={size} rx="6" className="text-line-strong" fill="none" stroke="currentColor" strokeWidth="1" />
      {[0.25, 0.5, 0.75].map((step) => (
        <g key={step}>
          <line x1={toX(step)} y1={pad} x2={toX(step)} y2={pad + size} className="text-line" stroke="currentColor" strokeWidth="0.7" />
          <line x1={pad} y1={toY(step)} x2={pad + size} y2={toY(step)} className="text-line" stroke="currentColor" strokeWidth="0.7" />
        </g>
      ))}
      <line x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(1)} className="text-fg-3" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" strokeOpacity={0.5} />
      <line x1={toX(0)} y1={toY(0)} x2={toX(curve.p1.x)} y2={toY(curve.p1.y)} className="text-cool" stroke="currentColor" strokeWidth="1" strokeOpacity={0.65} />
      <line x1={toX(1)} y1={toY(1)} x2={toX(curve.p2.x)} y2={toY(curve.p2.y)} className="text-cool" stroke="currentColor" strokeWidth="1" strokeOpacity={0.65} />
      <polyline data-testid="digitizer-bezier-polyline" points={polylinePoints} fill="none" className="text-accent" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={toX(curve.p1.x)} cy={toY(curve.p1.y)} r="4.5" className="text-cool" fill="currentColor" />
      <circle cx={toX(curve.p2.x)} cy={toY(curve.p2.y)} r="4.5" className="text-cool" fill="currentColor" />
      {liveRawPressure !== null && liveCalibrated !== null ? (
        <g data-testid="digitizer-bezier-live-dot">
          <line x1={toX(liveRawPressure)} y1={toY(0)} x2={toX(liveRawPressure)} y2={toY(liveCalibrated)} className="text-good" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          <line x1={toX(0)} y1={toY(liveCalibrated)} x2={toX(liveRawPressure)} y2={toY(liveCalibrated)} className="text-good" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          <circle cx={toX(liveRawPressure)} cy={toY(liveCalibrated)} r="5" className="text-good" fill="currentColor" />
        </g>
      ) : null}
      <text x={pad} y="214" className="text-fg-3" fill="currentColor" fontSize="8.5" fontWeight="600">
        {isEn ? "Raw Pressure (0 -> 100%)" : "입력 필압 (0 → 100%)"}
      </text>
      <text x={pad + 2} y="14" className="text-fg-3" fill="currentColor" fontSize="8.5" fontWeight="600">
        {isEn ? "Output" : "출력 보정"}
      </text>
    </svg>
  );
}

/** 클린룸 프로 디지타이저·와콤·애플펜슬 프로·S펜·트랙패드 범용 입력 캘리브레이터 패널. */
export function StudioProDigitizerCalibratorPanel(
  props: StudioProDigitizerCalibratorPanelProps,
): ReactElement {
  const {
    initialProfileId = "wacom-pro-pen-3",
    initialSmoothingStrength = 0.35,
    initialEnablePrediction = true,
    locale = "ko",
    className,
    onConfigChange,
    onExportJson,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [profileId, setProfileId] = useState<ProDigitizerProfileId>(initialProfileId);
  const [curve, setCurve] = useState<PressureCurveConfig>(
    () => createPressureCurveFromPreset(getProDigitizerProfile(initialProfileId).recommendedCurvePreset),
  );
  const [smoothingStrength, setSmoothingStrength] = useState<number>(initialSmoothingStrength);
  const [enablePrediction, setEnablePrediction] = useState<boolean>(initialEnablePrediction);
  const [bindings, setBindings] = useState<readonly ShortcutBinding[]>(
    () => createDefaultShortcutBindings(initialProfileId),
  );
  const [rawSamples, setRawSamples] = useState<readonly RawPointerSample[]>(
    () => createSimulatedTestStroke(initialProfileId),
  );
  const [lastHidReport, setLastHidReport] = useState<ParsedHidDigitizerReport | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [importDraft, setImportDraft] = useState<string>("");
  const [jsonPanelOpen, setJsonPanelOpen] = useState<boolean>(false);
  const activePointerIdRef = useRef<number | null>(null);

  const profile = useMemo(() => getProDigitizerProfile(profileId), [profileId]);
  const batchResult = useMemo<NormalizedPointerBatchResult>(
    () => normalizePointerSampleBatch(rawSamples, { profileId, curve, smoothingStrength, enablePrediction }),
    [rawSamples, profileId, curve, smoothingStrength, enablePrediction],
  );
  const snapshot = useMemo<DigitizerCalibrationSnapshot>(
    () => ({ profileId, curve, smoothingStrength, enablePrediction, bindings }),
    [profileId, curve, smoothingStrength, enablePrediction, bindings],
  );
  const configJson = useMemo<string>(() => exportDigitizerConfigJson(snapshot), [snapshot]);

  useEffect(() => { onConfigChange?.(snapshot); }, [snapshot, onConfigChange]);

  const lastSample = batchResult.samples[batchResult.samples.length - 1] ?? null;
  const liveTiltDeg = lastSample ? Math.round(90 - (lastSample.altitudeRad * 180) / Math.PI) : 0;

  const handleSelectProfile = (nextId: ProDigitizerProfileId): void => {
    const nextProfile = getProDigitizerProfile(nextId);
    setProfileId(nextId);
    setCurve(createPressureCurveFromPreset(nextProfile.recommendedCurvePreset));
    setBindings(createDefaultShortcutBindings(nextId));
    setRawSamples(createSimulatedTestStroke(nextId));
    setLastHidReport(null);
    setErrorMessage("");
    setStatusMessage(pick(`${nextProfile.shortLabelKo} 프로필과 권장 필압 곡선을 적용했습니다.`, `Applied ${nextProfile.shortLabelEn} profile and recommended pressure curve.`));
  };

  const handleSelectCurvePreset = (presetId: PressureCurvePresetId): void => {
    setCurve(createPressureCurveFromPreset(presetId));
    setErrorMessage("");
  };

  const handleUpdateBezier = (
    point: "p1" | "p2",
    axis: "x" | "y",
    value: number,
  ): void => {
    setCurve((prev) => ({
      ...prev,
      presetId: "custom-bezier",
      [point]: { ...prev[point], [axis]: Math.round(value * 100) / 100 },
    }));
  };

  const handleRunSimulatedStroke = (): void => {
    setRawSamples(createSimulatedTestStroke(profileId));
    setErrorMessage("");
    setStatusMessage(pick(`${profile.nominalReportRateHz}Hz 기준 시뮬레이션 스트로크(예측 샘플 포함)를 재생했습니다.`, `Replayed ${profile.nominalReportRateHz} Hz simulated coalesced + predicted stroke.`));
  };

  const handleDecodeSampleHid = (): void => {
    const packet = encodeStandardHidDigitizerReport({
      tipSwitch: true, barrelSwitch: profile.capabilities.expressKeys, inRange: true,
      x: 19200, y: 12800,
      tipPressure: Math.round((profile.pressureLevels - 1) * 0.68),
      logicalPressureMax: profile.pressureLevels - 1,
      tiltXDeg: profile.maxTiltDeg > 0 ? 32 : 0,
      tiltYDeg: profile.maxTiltDeg > 0 ? -18 : 0,
      twistDeg: profile.capabilities.barrelRoll ? 142 : 0,
      dialDelta: profile.capabilities.dial ? 2 : 0,
      expressKeyMask: profile.capabilities.expressKeys ? 0b0000_0101 : 0,
    });
    const decoded = parseStandardHidDigitizerReport(packet);
    if (!decoded.ok) {
      setErrorMessage(isEn ? decoded.messageEn : decoded.messageKo);
      return;
    }
    setLastHidReport(decoded.report);
    const converted = hidReportToRawPointerSample(decoded.report, 320, 160, Date.now());
    setRawSamples((prev) => [...prev.slice(-24), converted]);
    setErrorMessage("");
    setStatusMessage(pick(`USB HID 0x0D 16B 패킷 디코드 완료 (필압 ${Math.round(decoded.report.pressureNorm * 100)}%, 회전 ${decoded.report.twistDeg}°).`, `Decoded USB HID 0x0D 16B packet (${Math.round(decoded.report.pressureNorm * 100)}% pressure, ${decoded.report.twistDeg}° twist).`));
  };

  const handlePadPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    activePointerIdRef.current = e.pointerId;
    const sample = pointerEventToRawSample(e.nativeEvent, rect, false);
    setRawSamples([sample]);
  };

  const handlePadPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (activePointerIdRef.current !== e.pointerId && e.buttons === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const coalesced = readNativePointerList(e.nativeEvent, "getCoalescedEvents");
    const predicted = readNativePointerList(e.nativeEvent, "getPredictedEvents");
    const realEvents = coalesced.length > 0 ? coalesced : [e.nativeEvent];
    const nextReal = realEvents.map((ev) => pointerEventToRawSample(ev, rect, false));
    const nextPred = predicted.map((ev) => pointerEventToRawSample(ev, rect, true));
    setRawSamples((prev) => [...prev.filter((item) => !item.isPredicted).slice(-48), ...nextReal, ...nextPred]);
  };

  const handlePadPointerEnd = (): void => { activePointerIdRef.current = null; };

  const handleChangeBindingAction = (bindingId: string, actionId: StudioBindingActionId): void => {
    setBindings((prev) => updateShortcutBinding(prev, bindingId, { actionId }));
  };

  const handleToggleBinding = (bindingId: string, enabled: boolean): void => {
    setBindings((prev) => updateShortcutBinding(prev, bindingId, { enabled }));
  };

  const handleCopyJson = (): void => {
    onExportJson?.(configJson, snapshot);
    setJsonPanelOpen(true);
    setImportDraft(configJson);
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(configJson).catch(() => undefined);
    }
    setErrorMessage("");
    setStatusMessage(pick("디지타이저 캘리브레이션 JSON을 클립보드와 미리보기에 반영했습니다.", "Copied digitizer calibration JSON snapshot."));
  };

  const handleImportJson = (): void => {
    const result = importDigitizerConfigJson(importDraft);
    if (!result.ok) {
      setErrorMessage(isEn ? result.messageEn : result.messageKo);
      return;
    }
    setProfileId(result.config.profileId);
    setCurve(result.config.curve);
    setSmoothingStrength(result.config.smoothingStrength);
    setEnablePrediction(result.config.enablePrediction);
    setBindings(result.config.bindings);
    setErrorMessage("");
    setStatusMessage(pick("JSON 설정을 검증해 패널에 불러왔습니다.", "Validated and imported calibration JSON."));
  };

  const handleResetAll = (): void => {
    const initialProf = getProDigitizerProfile(initialProfileId);
    setProfileId(initialProfileId);
    setCurve(createPressureCurveFromPreset(initialProf.recommendedCurvePreset));
    setSmoothingStrength(initialSmoothingStrength);
    setEnablePrediction(initialEnablePrediction);
    setBindings(createDefaultShortcutBindings(initialProfileId));
    setRawSamples(createSimulatedTestStroke(initialProfileId));
    setLastHidReport(null);
    setErrorMessage("");
    setStatusMessage(pick("디지타이저 캘리브레이션과 단축키를 기본값으로 복원했습니다.", "Restored default digitizer calibration and bindings."));
  };

  const capBadges: readonly { readonly id: string; readonly label: string; readonly supported: boolean }[] = [
    { id: "tilt", label: pick(`기울기 ±${profile.maxTiltDeg}°`, `Tilt ±${profile.maxTiltDeg}°`), supported: profile.capabilities.altitudeAzimuth },
    { id: "barrel", label: pick("배럴 회전 360°", "Barrel Roll 360°"), supported: profile.capabilities.barrelRoll },
    { id: "wheel", label: pick("에어브러시 휠", "Tangential Wheel"), supported: profile.capabilities.tangentialPressure },
    { id: "hover", label: pick(`호버 ${profile.hoverHeightMm}mm`, `Hover ${profile.hoverHeightMm}mm`), supported: profile.capabilities.hover },
    { id: "squeeze", label: pick("스퀴즈", "Squeeze"), supported: profile.capabilities.squeeze },
    { id: "air", label: pick("S펜 에어액션", "Air Action"), supported: profile.capabilities.airAction },
    { id: "ek", label: pick("익스프레스키", "ExpressKeys"), supported: profile.capabilities.expressKeys },
    { id: "dial", label: pick("다이얼", "Dial"), supported: profile.capabilities.dial },
    { id: "trackpad", label: pick("트랙패드 멀티터치", "Trackpad Multi-Touch"), supported: profile.capabilities.trackpadGestures },
  ];

  return (
    <section
      data-testid="pro-digitizer-calibrator-panel"
      aria-label={pick("프로 디지타이저 범용 입력 캘리브레이터", "Pro Digitizer Input Calibrator")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <PenTool className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("클린룸 표준 HID 0x0D · Pointer L3", "Clean-Room HID 0x0D · Pointer L3")}
            </span>
            <span data-testid="digitizer-active-profile-badge" className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2 tabular-nums">
              {`${profile.pressureLevels.toLocaleString("en-US")} LV · ${profile.nominalReportRateHz}Hz`}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("프로 디지타이저 · 필압 · 제스처 범용 입력 캘리브레이터", "Pro Digitizer, Pressure & Gesture Calibrator")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {isEn ? profile.summaryEn : profile.summaryKo}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="digitizer-copy-json-btn" onClick={handleCopyJson} className={BTN_SOLID}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="digitizer-toggle-json-btn" aria-pressed={jsonPanelOpen} onClick={() => { setJsonPanelOpen((v) => !v); if (!importDraft) setImportDraft(configJson); }} className={jsonPanelOpen ? BTN_ACTIVE : BTN_OUTLINE}>
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("JSON 가져오기", "Import JSON")}
          </button>
          <button type="button" data-testid="digitizer-reset-btn" onClick={handleResetAll} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div data-testid="digitizer-status-banner" role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      ) : null}

      {errorMessage ? (
        <div data-testid="digitizer-error-banner" role="alert" className="flex items-center gap-2 rounded-lg border border-bad bg-bad-soft px-3.5 py-2 text-xs font-medium text-bad [word-break:keep-all]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {/* 1. 7대 하드웨어 프로필 전환 및 지원 매트릭스 */}
      <div className="space-y-3 rounded-xl border border-line bg-canvas p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("7대 입력 하드웨어 프로필", "7 Input Hardware Profiles")}
          </h3>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">
            {profile.openStandards.join(" · ")}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRO_DIGITIZER_PROFILES.map((item) => {
            const active = item.id === profileId;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`digitizer-profile-${item.id}`}
                aria-pressed={active}
                onClick={() => handleSelectProfile(item.id)}
                className={active ? BTN_ACTIVE : BTN_OUTLINE}
              >
                {isEn ? item.shortLabelEn : item.shortLabelKo}
              </button>
            );
          })}
        </div>
        <div data-testid="digitizer-capability-matrix" className="flex flex-wrap gap-1.5 pt-1">
          {capBadges.map((cap) => (
            <span
              key={cap.id}
              data-testid={`digitizer-cap-${cap.id}`}
              data-supported={String(cap.supported)}
              className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold tabular-nums [word-break:keep-all] ${
                cap.supported ? "border-good bg-good-soft text-good" : "border-line bg-raised text-fg-3"
              }`}
            >
              {`${cap.supported ? "✓" : "–"} ${cap.label}`}
            </span>
          ))}
        </div>
      </div>

      {/* 2. 베지어 필압 곡선 + 실시간 포인터 테스트 패드 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
              <Sliders className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("3차 베지어 필압 곡선 캘리브레이터", "Cubic Bézier Pressure Calibrator")}
            </h3>
            <span data-testid="digitizer-curve-readout" className="text-[11px] font-semibold text-fg-2 tabular-nums">
              {`P1(${curve.p1.x.toFixed(2)}, ${curve.p1.y.toFixed(2)}) · P2(${curve.p2.x.toFixed(2)}, ${curve.p2.y.toFixed(2)})`}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESSURE_CURVE_PRESETS.map((preset) => {
              const active = curve.presetId === preset.presetId;
              return (
                <button
                  key={preset.presetId}
                  type="button"
                  data-testid={`digitizer-preset-${preset.presetId}`}
                  aria-pressed={active}
                  onClick={() => handleSelectCurvePreset(preset.presetId)}
                  className={active ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {isEn ? preset.labelEn : preset.labelKo}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-[220px_1fr] items-center">
            <div className="rounded-lg border border-line bg-raised p-2">
              <PressureCurveSvgPreview
                curve={curve}
                liveRawPressure={lastSample ? lastSample.rawPressure : null}
                isEn={isEn}
              />
            </div>
            <div className="space-y-2.5">
              {([
                { id: "p1x", label: "P1 X", val: curve.p1.x, onChange: (v: number) => handleUpdateBezier("p1", "x", v) },
                { id: "p1y", label: "P1 Y", val: curve.p1.y, onChange: (v: number) => handleUpdateBezier("p1", "y", v) },
                { id: "p2x", label: "P2 X", val: curve.p2.x, onChange: (v: number) => handleUpdateBezier("p2", "x", v) },
                { id: "p2y", label: "P2 Y", val: curve.p2.y, onChange: (v: number) => handleUpdateBezier("p2", "y", v) },
              ] as const).map((ctrl) => {
                const inputId = `${uid}-${ctrl.id}`;
                return (
                  <div key={ctrl.id} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <label htmlFor={inputId} className="font-medium text-fg-2">{ctrl.label}</label>
                      <span className="font-semibold text-fg tabular-nums">{ctrl.val.toFixed(2)}</span>
                    </div>
                    <input
                      id={inputId}
                      data-testid={`digitizer-slider-${ctrl.id}`}
                      type="range" min={0} max={1} step={0.01} value={ctrl.val}
                      onChange={(e) => ctrl.onChange(Number(e.target.value))}
                      className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
                    />
                  </div>
                );
              })}

              <div className="space-y-0.5 border-t border-line pt-2">
                <div className="flex items-center justify-between text-[11px]">
                  <label htmlFor={`${uid}-smooth`} className="font-medium text-fg-2 [word-break:keep-all]">
                    {pick("지터 억제 강도", "Jitter Smoothing")}
                  </label>
                  <span className="font-semibold text-fg tabular-nums">{`${Math.round(smoothingStrength * 100)}%`}</span>
                </div>
                <input
                  id={`${uid}-smooth`}
                  data-testid="digitizer-slider-smoothing"
                  type="range" min={0} max={1} step={0.05} value={smoothingStrength}
                  onChange={(e) => setSmoothingStrength(Number(e.target.value))}
                  className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] font-medium text-fg-2 [word-break:keep-all]">
                  {pick("예측 포인터(Predicted) 선행 보정", "Predicted Lookahead")}
                </span>
                <button
                  type="button"
                  data-testid="digitizer-toggle-prediction"
                  aria-pressed={enablePrediction}
                  onClick={() => setEnablePrediction((prev) => !prev)}
                  className={enablePrediction ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {enablePrediction ? pick("켜짐", "On") : pick("꺼짐", "Off")}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 실시간 포인터 테스트 패드 & 텔레메트리 */}
        <div className="space-y-3 rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
              <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("실시간 포인터 테스트 패드", "Live Pointer Test Pad")}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" data-testid="digitizer-sim-stroke-btn" onClick={handleRunSimulatedStroke} className={BTN_OUTLINE}>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("시뮬레이션 스트로크", "Simulate Stroke")}
              </button>
              <button type="button" data-testid="digitizer-hid-test-btn" onClick={handleDecodeSampleHid} className={BTN_OUTLINE}>
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("HID 0x0D 디코드", "Decode HID 0x0D")}
              </button>
              <button type="button" data-testid="digitizer-clear-pad-btn" aria-label={pick("패드 비우기", "Clear Pad")} onClick={() => { setRawSamples([]); setLastHidReport(null); }} className={BTN_OUTLINE}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            data-testid="digitizer-pointer-pad"
            onPointerDown={handlePadPointerDown}
            onPointerMove={handlePadPointerMove}
            onPointerUp={handlePadPointerEnd}
            onPointerCancel={handlePadPointerEnd}
            className="relative overflow-hidden rounded-lg border border-line-strong bg-raised touch-none select-none"
          >
            <svg viewBox="0 0 320 160" className="block h-40 w-full text-fg" role="img" aria-label={pick("실시간 포인터 궤적 프리뷰", "Live pointer stroke preview")}>
              <line x1="0" y1="80" x2="320" y2="80" className="text-line" stroke="currentColor" strokeWidth="0.7" strokeDasharray="3 3" />
              <line x1="160" y1="0" x2="160" y2="160" className="text-line" stroke="currentColor" strokeWidth="0.7" strokeDasharray="3 3" />
              {batchResult.samples.map((pt, idx) => {
                if (idx === 0) return null;
                const prev = batchResult.samples[idx - 1];
                if (!prev) return null;
                return (
                  <line
                    key={`${pt.timestampMs}-${idx}`}
                    x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y}
                    className={pt.isPredicted ? "text-cool" : "text-accent"}
                    stroke="currentColor"
                    strokeWidth={Math.max(1.2, pt.calibratedPressure * 8.5)}
                    strokeLinecap="round"
                    strokeOpacity={pt.isPredicted ? 0.6 : 0.92}
                  />
                );
              })}
              {lastSample ? (
                <circle
                  cx={lastSample.x} cy={lastSample.y}
                  r={Math.max(3, lastSample.calibratedPressure * 6)}
                  className={lastSample.isPredicted ? "text-cool" : "text-good"}
                  fill="currentColor"
                />
              ) : null}
            </svg>
            <div className="pointer-events-none absolute bottom-1.5 left-2 rounded bg-card px-2 py-0.5 text-[10px] font-medium text-fg-3 [word-break:keep-all]">
              {pick("펜·트랙패드로 드래그해 실시간 필압·기울기·회전을 측정하세요", "Drag with pen or trackpad to inspect pressure, tilt, and roll")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <TelemetryMetricCard
              testId="digitizer-metric-pressure"
              label={pick("보정 필압", "Calibrated Pressure")}
              value={`${Math.round((lastSample?.calibratedPressure ?? 0) * 100)}%`}
              subtext={pick(`원시 ${Math.round((lastSample?.rawPressure ?? 0) * 100)}%`, `Raw ${Math.round((lastSample?.rawPressure ?? 0) * 100)}%`)}
              valueTone="text-accent"
            />
            <TelemetryMetricCard
              testId="digitizer-metric-tilt"
              label={pick("기울기 · 셰이딩", "Tilt · Shading")}
              value={`${liveTiltDeg}°`}
              subtext={pick(`계수 ${(lastSample?.tiltShadingFactor ?? 0).toFixed(2)}`, `Shade ${(lastSample?.tiltShadingFactor ?? 0).toFixed(2)}`)}
            />
            <TelemetryMetricCard
              testId="digitizer-metric-twist"
              label={pick("배럴 회전", "Barrel Roll")}
              value={`${Math.round(batchResult.metrics.lastBarrelRollDeg)}°`}
              subtext={profile.capabilities.barrelRoll ? pick("네이티브 지원", "Native") : pick("시뮬레이션", "Fallback")}
            />
            <TelemetryMetricCard
              testId="digitizer-metric-latency"
              label={pick("예측 지연 단축", "Predicted Lead")}
              value={`${batchResult.metrics.predictedLatencyGainMs.toFixed(1)}ms`}
              subtext={`${batchResult.metrics.effectiveReportRateHz}Hz · ${pick("지터", "Jitter")} -${batchResult.metrics.jitterReductionPct}%`}
              valueTone={batchResult.metrics.predictedLatencyGainMs > 0 ? "text-good" : "text-fg"}
            />
          </div>

          {lastHidReport ? (
            <div data-testid="digitizer-hid-readout" className="rounded-lg border border-cool bg-info-soft px-3 py-2 text-[11px] font-medium text-cool tabular-nums [word-break:keep-all]">
              {pick(
                `HID Page 0x0D · Report 0x02 · XY(${lastHidReport.x}, ${lastHidReport.y}) · 필압 ${lastHidReport.tipPressure}/${lastHidReport.logicalPressureMax} · 틸트(${lastHidReport.tiltXDeg}°, ${lastHidReport.tiltYDeg}°) · 회전 ${lastHidReport.twistDeg}° · 다이얼 Δ${lastHidReport.dialDelta}`,
                `HID Page 0x0D · Report 0x02 · XY(${lastHidReport.x}, ${lastHidReport.y}) · Pressure ${lastHidReport.tipPressure}/${lastHidReport.logicalPressureMax} · Tilt(${lastHidReport.tiltXDeg}°, ${lastHidReport.tiltYDeg}°) · Twist ${lastHidReport.twistDeg}° · Dial Δ${lastHidReport.dialDelta}`,
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* 3. 익스프레스키 · 다이얼 · 스퀴즈 · 에어액션 · 트랙패드 제스처 매핑 */}
      <div className="space-y-3 rounded-xl border border-line bg-canvas p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Keyboard className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("익스프레스키 · 다이얼 · 스퀴즈 · S펜 · 트랙패드 단축키 매핑", "ExpressKey, Dial, Squeeze, Air Action & Trackpad Bindings")}
          </h3>
          <button
            type="button"
            data-testid="digitizer-reset-bindings-btn"
            onClick={() => {
              setBindings(createDefaultShortcutBindings(profileId));
              setStatusMessage(pick("현재 기기 기준 기본 단축키 매핑을 복원했습니다.", "Restored default bindings for active device."));
            }}
            className={BTN_OUTLINE}
          >
            {pick("기기 기본 매핑 복원", "Restore Device Defaults")}
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {bindings.map((binding) => {
            const supported = isTriggerSupportedByProfile(profileId, binding.triggerKind);
            const selectId = `${uid}-bind-${binding.id}`;
            return (
              <div
                key={binding.id}
                data-testid={`digitizer-binding-row-${binding.id}`}
                data-supported={String(supported)}
                className={`flex flex-col gap-2 rounded-lg border p-2.5 ${supported ? "border-line bg-card" : "border-line bg-raised opacity-75"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <label htmlFor={selectId} className="block truncate text-xs font-semibold text-fg [word-break:keep-all]">
                      {isEn ? binding.triggerLabelEn : binding.triggerLabelKo}
                    </label>
                    <span className="text-[10px] font-medium text-fg-3 tabular-nums">
                      {`${binding.triggerCode} · ${supported ? pick("하드웨어 지원", "Supported") : pick("현재 기기 미지원", "Not on active device")}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid={`digitizer-binding-toggle-${binding.id}`}
                    aria-pressed={binding.enabled}
                    onClick={() => handleToggleBinding(binding.id, !binding.enabled)}
                    className={`min-h-11 shrink-0 cursor-pointer rounded-md border px-2.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                      binding.enabled ? "border-accent bg-accent-soft text-accent" : "border-line bg-canvas text-fg-3"
                    }`}
                  >
                    {binding.enabled ? pick("활성", "On") : pick("끔", "Off")}
                  </button>
                </div>

                <select
                  id={selectId}
                  data-testid={`digitizer-binding-select-${binding.id}`}
                  value={binding.actionId}
                  onChange={(e) => handleChangeBindingAction(binding.id, e.target.value as StudioBindingActionId)}
                  className={`min-h-11 w-full rounded-lg border border-line bg-canvas px-2.5 text-xs font-medium text-fg ${FOCUS_RING}`}
                >
                  {STUDIO_BINDING_ACTIONS.map((action) => (
                    <option key={action.id} value={action.id}>
                      {isEn ? action.labelEn : action.labelKo}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. JSON 내보내기 / 불러오기 패널 */}
      {jsonPanelOpen ? (
        <div data-testid="digitizer-json-panel" className="space-y-2.5 rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`${uid}-json-io`} className="text-xs font-bold text-fg [word-break:keep-all]">
              {pick("캘리브레이션 설정 JSON (내보내기 · 불러오기)", "Calibration Config JSON (Export & Import)")}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-testid="digitizer-apply-json-btn" onClick={handleImportJson} className={BTN_SOLID}>
                {pick("JSON 적용", "Apply JSON")}
              </button>
              <button type="button" data-testid="digitizer-refresh-json-btn" onClick={() => setImportDraft(configJson)} className={BTN_OUTLINE}>
                {pick("현재 설정 다시 채우기", "Load Current JSON")}
              </button>
            </div>
          </div>
          <textarea
            id={`${uid}-json-io`}
            data-testid="digitizer-json-textarea"
            rows={7}
            value={importDraft}
            onChange={(e) => setImportDraft(e.target.value)}
            className={`w-full rounded-lg border border-line bg-raised p-3 font-mono text-[11px] leading-relaxed text-fg ${FOCUS_RING}`}
          />
        </div>
      ) : null}
    </section>
  );
}
