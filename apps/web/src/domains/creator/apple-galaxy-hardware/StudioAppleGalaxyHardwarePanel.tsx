/**
 * Apple 생태계(Mac·iPad·Vision Pro) · Galaxy 특화(S-Pen·DeX·Z Fold Flex·Quick Share·Watch) ·
 * 3D 간섭 방지·물리 궤적 · Web MIDI 8채널/3-페달 풋 스위치 통합 패널 (Wave 29).
 * Calm Atelier 시맨틱 토큰 전용 · 460줄 이하 · 순수 메모리 상태 · 명시적 transition 속성 · 모든 props 선택형 · KO/EN.
 */

import { Box, CheckCircle2, Footprints, Laptop, Layers, Sliders, Smartphone, Sparkles, Watch } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_APPLE_WORKSPACE_INPUT, DEFAULT_GALAXY_WORKSPACE_INPUT,
  buildAppleWorkspacePlan, buildGalaxyWorkspacePlan,
  type AppleFormFactor, type AppleWorkspacePlan, type GalaxyWatchDialMode, type GalaxyWorkspacePlan, type SPenAirActionGesture,
} from "./apple-galaxy-ecosystem-engine";
import {
  DEFAULT_COLLISION_SCENE_BODIES, DEFAULT_MIDI_CHANNEL_MAP,
  createDefaultMidiMixerState, createInitialFootPedalState, mapMidiCcToStudioControl,
  resolveObjectCollisionAndDropToFloor, routeFootPedalEvent, simulatePhysicalTrajectoryFrame,
  type CollisionResolveResult, type FootPedalRouteResult, type FootPedalRouterState, type FootPedalSlot,
  type MidiCcMappedResult, type MidiMixerValues, type TrajectoryPreset,
} from "./collision-trajectory-midi-pedal";

export type AppleGalaxyHardwareTabId = "apple-ecosystem" | "galaxy-ecosystem" | "physics-midi-pedal";

export interface StudioAppleGalaxyHardwarePanelProps {
  readonly initialTab?: AppleGalaxyHardwareTabId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApplePlanChanged?: (plan: AppleWorkspacePlan) => void;
  readonly onGalaxyPlanChanged?: (plan: GalaxyWorkspacePlan) => void;
  readonly onCollisionResolved?: (result: CollisionResolveResult) => void;
  readonly onMidiControlMapped?: (result: MidiCcMappedResult) => void;
  readonly onFootPedalRouted?: (result: FootPedalRouteResult) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const BTN_PILL = `min-h-11 cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_ACTIVE = "border-accent bg-accent-soft text-accent";
const BTN_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

const APPLE_FORM_FACTORS: readonly { readonly id: AppleFormFactor; readonly ko: string; readonly en: string }[] = [
  { id: "mac-universal-control", ko: "Mac Universal Control", en: "Mac Universal Control" },
  { id: "ipad-stage-manager", ko: "iPad Stage Manager", en: "iPad Stage Manager" },
  { id: "mac-ipad-sidecar", ko: "Mac+iPad Sidecar", en: "Mac+iPad Sidecar" },
  { id: "vision-pro-spatial", ko: "Vision Pro 3-창 공간", en: "Vision Pro 3-Window" },
];

const SPEN_GESTURES: readonly { readonly id: SPenAirActionGesture; readonly ko: string; readonly en: string }[] = [
  { id: "single-press", ko: "단일 클릭", en: "Single Press" },
  { id: "double-press", ko: "더블 클릭", en: "Double Press" },
  { id: "hold-flick-left", ko: "좌 플릭(Undo)", en: "Flick Left" },
  { id: "hold-flick-right", ko: "우 플릭(Redo)", en: "Flick Right" },
  { id: "circle-cw", ko: "시계 원형", en: "Circle CW" },
];

const WATCH_MODES: readonly { readonly id: GalaxyWatchDialMode; readonly ko: string; readonly en: string }[] = [
  { id: "brush-size", ko: "브러시 크기", en: "Brush Size" },
  { id: "canvas-rotate", ko: "캔버스 회전", en: "Canvas Rotate" },
  { id: "opacity", ko: "불투명도", en: "Opacity" },
  { id: "zoom", ko: "확대/축소", en: "Zoom" },
];

const TRAJECTORY_MODES: readonly { readonly id: TrajectoryPreset; readonly ko: string; readonly en: string }[] = [
  { id: "ballistic", ko: "포물선 탄도", en: "Ballistic Arc" },
  { id: "glass-shatter", ko: "유리파편 폭발", en: "Glass Shatter" },
  { id: "petal-drift", ko: "꽃잎 흩날림", en: "Petal Drift" },
];

/** Apple·Galaxy 하드웨어 생태계 및 3D 간섭·물리 궤적·MIDI/3-페달 통합 스튜디오 패널. */
export function StudioAppleGalaxyHardwarePanel({
  initialTab = "apple-ecosystem", locale, className,
  onApplePlanChanged, onGalaxyPlanChanged, onCollisionResolved, onMidiControlMapped, onFootPedalRouted,
}: StudioAppleGalaxyHardwarePanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<AppleGalaxyHardwareTabId>(initialTab);
  const [notice, setNotice] = useState<string>("");

  // Tab 1: Apple 생태계 상태
  const [appleFormFactor, setAppleFormFactor] = useState<AppleFormFactor>("mac-universal-control");
  const [forceTouchLevel, setForceTouchLevel] = useState<number>(2.2);
  const [forceFingers, setForceFingers] = useState<1 | 2 | 3>(1);
  const [deepLinkText, setDeepLinkText] = useState<string>(DEFAULT_APPLE_WORKSPACE_INPUT.handoffDeepLink ?? "");

  // Tab 2: Galaxy 생태계 상태
  const [hingeAngleDeg, setHingeAngleDeg] = useState<number>(112);
  const [dexConnected, setDexConnected] = useState<boolean>(false);
  const [sPenGesture, setSPenGesture] = useState<SPenAirActionGesture>("hold-flick-left");
  const [watchMode, setWatchMode] = useState<GalaxyWatchDialMode>("brush-size");
  const [watchBaseValue, setWatchBaseValue] = useState<number>(22);
  const [watchLastTicks, setWatchLastTicks] = useState<number>(0);

  // Tab 3: 3D 충돌·궤적·Web MIDI·3-페달 상태
  const [clearanceMm, setClearanceMm] = useState<number>(0);
  const [trajectoryPreset, setTrajectoryPreset] = useState<TrajectoryPreset>("ballistic");
  const [trajectoryTimeSec, setTrajectoryTimeSec] = useState<number>(0.85);
  const [midiValues, setMidiValues] = useState<MidiMixerValues>(createDefaultMidiMixerState);
  const [midiCcRaw, setMidiCcRaw] = useState<Readonly<Record<number, number>>>({ 1: 70, 2: 114, 3: 44, 4: 53, 5: 36, 6: 64, 7: 70, 8: 86 });
  const [lastMidiFeedback, setLastMidiFeedback] = useState<string>("0xB0 · CC1 · 70");
  const [pedalState, setPedalState] = useState<FootPedalRouterState>(() => createInitialFootPedalState("brush"));
  const [pedalClockMs, setPedalClockMs] = useState<number>(1000);
  const [pedalLog, setPedalLog] = useState<string>("");

  const applePlan = useMemo(
    () =>
      buildAppleWorkspacePlan({
        ...DEFAULT_APPLE_WORKSPACE_INPUT,
        formFactor: appleFormFactor,
        forceTouchInput: { webkitForce: forceTouchLevel, fingerCount: forceFingers, modifier: "none" },
        handoffDeepLink: deepLinkText,
      }),
    [appleFormFactor, deepLinkText, forceFingers, forceTouchLevel],
  );

  const galaxyPlan = useMemo(
    () =>
      buildGalaxyWorkspacePlan({
        ...DEFAULT_GALAXY_WORKSPACE_INPUT,
        foldable: {
          ...DEFAULT_GALAXY_WORKSPACE_INPUT.foldable,
          posture: hingeAngleDeg <= 145 ? "folded" : "continuous",
          hingeAngleDeg,
        },
        dexMonitor: { connected: dexConnected, widthPx: 2560, heightPx: 1440, scaleFactor: 1 },
        sPenInput: { gesture: sPenGesture, hoverDistanceMm: 5, tiltDeg: 32, batteryPct: 86 },
        watchBezelInput: { deltaTicks: watchLastTicks, intervalMs: 85, mode: watchMode, currentValue: watchBaseValue },
      }),
    [dexConnected, hingeAngleDeg, sPenGesture, watchBaseValue, watchLastTicks, watchMode],
  );

  const collisionResult = useMemo(
    () => resolveObjectCollisionAndDropToFloor(DEFAULT_COLLISION_SCENE_BODIES, { floorY: 0, minClearanceMm: clearanceMm }),
    [clearanceMm],
  );

  const trajectoryFrame = useMemo(
    () => simulatePhysicalTrajectoryFrame({ preset: trajectoryPreset, timeSec: trajectoryTimeSec, fps: 24, trailSteps: 10 }),
    [trajectoryPreset, trajectoryTimeSec],
  );

  const handleSelectAppleFormFactor = (next: AppleFormFactor): void => {
    setAppleFormFactor(next);
    const plan = buildAppleWorkspacePlan({ ...DEFAULT_APPLE_WORKSPACE_INPUT, formFactor: next, handoffDeepLink: deepLinkText });
    onApplePlanChanged?.(plan);
    setNotice(pick(`Apple 프로파일 전환: ${plan.summaryKo}`, `Switched Apple profile: ${plan.summaryEn}`));
  };

  const handleWatchStep = (deltaTicks: number): void => {
    const currentLive = galaxyPlan.watchDial.nextValue;
    setWatchBaseValue(currentLive);
    setWatchLastTicks(deltaTicks);
    const nextPlan = buildGalaxyWorkspacePlan({
      ...DEFAULT_GALAXY_WORKSPACE_INPUT,
      foldable: { ...DEFAULT_GALAXY_WORKSPACE_INPUT.foldable, posture: hingeAngleDeg <= 145 ? "folded" : "continuous", hingeAngleDeg },
      dexMonitor: { connected: dexConnected, widthPx: 2560, heightPx: 1440, scaleFactor: 1 },
      sPenInput: { gesture: sPenGesture, hoverDistanceMm: 5, tiltDeg: 32, batteryPct: 86 },
      watchBezelInput: { deltaTicks, intervalMs: 85, mode: watchMode, currentValue: currentLive },
    });
    onGalaxyPlanChanged?.(nextPlan);
  };

  const handleWatchModeChange = (nextMode: GalaxyWatchDialMode): void => {
    const defaults: Readonly<Record<GalaxyWatchDialMode, number>> = { "brush-size": 22, "canvas-rotate": 0, opacity: 90, "timeline-frame": 1, zoom: 100 };
    setWatchMode(nextMode);
    setWatchBaseValue(defaults[nextMode]);
    setWatchLastTicks(0);
  };

  const handleMidiSlider = (cc: number, rawVal: number): void => {
    const mapped = mapMidiCcToStudioControl({ status: 0xb0, cc, value: rawVal, currentValues: midiValues });
    setMidiCcRaw((prev) => ({ ...prev, [cc]: rawVal }));
    if (mapped.matched && mapped.controlId) {
      const controlId = mapped.controlId;
      setMidiValues((prev) => ({ ...prev, [controlId]: mapped.mappedValue }));
      setLastMidiFeedback(`0x${mapped.ledFeedbackBytes[0].toString(16).toUpperCase()} · CC${cc} · ${mapped.ledFeedbackBytes[2]}`);
      onMidiControlMapped?.(mapped);
    }
  };

  const handlePedalTap = (pedal: FootPedalSlot, momentaryHold = false): void => {
    const tDown = pedalClockMs + 120;
    const isPressed = pedalState.pressedPedals.includes(pedal);
    if (momentaryHold) {
      const phase: "down" | "up" = isPressed ? "up" : "down";
      const res = routeFootPedalEvent(pedalState, { pedal, phase, timestampMs: tDown, transport: "ble-midi" });
      setPedalClockMs(tDown);
      setPedalState(res.nextState);
      setPedalLog(pick(res.summaryKo, res.summaryEn));
      onFootPedalRouted?.(res);
      return;
    }
    const downRes = routeFootPedalEvent(pedalState, { pedal, phase: "down", timestampMs: tDown, transport: "usb-hid" });
    const upRes = routeFootPedalEvent(downRes.nextState, { pedal, phase: "up", timestampMs: tDown + 50, transport: "usb-hid" });
    setPedalClockMs(tDown + 50);
    setPedalState(upRes.nextState);
    setPedalLog(pick(downRes.summaryKo, downRes.summaryEn));
    onFootPedalRouted?.(downRes);
  };

  const tabs: readonly { readonly id: AppleGalaxyHardwareTabId; readonly label: string }[] = [
    { id: "apple-ecosystem", label: pick("Apple 생태계(Mac·iPad·Vision Pro)", "Apple Ecosystem (Mac · iPad · Vision Pro)") },
    { id: "galaxy-ecosystem", label: pick("Galaxy 특화(S-Pen·DeX·Z Fold Flex)", "Galaxy Special (S-Pen · DeX · Z Fold Flex)") },
    { id: "physics-midi-pedal", label: pick("3D 충돌·궤적 물리 · MIDI/풋 페달", "3D Collision · Trajectory · MIDI/Pedal") },
  ];

  return (
    <section
      aria-label={pick("Apple·Galaxy 생태계 및 3D 물리·MIDI/풋 페달 스튜디오 패널", "Apple, Galaxy, 3D Physics, Web MIDI & Foot Pedal Panel")}
      className={`flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("Apple · Galaxy · 3D 물리 · Web MIDI · 3-페달", "Apple · Galaxy · 3D Physics · Web MIDI · 3-Pedal")}</span>
          </div>
          <h2 className="text-base font-bold text-fg">{pick("디바이스 생태계 · 3D 간섭 물리 · 핸즈프리 컨트롤 허브", "Device Ecosystem, 3D Collision Physics & Hands-Free Hub")}</h2>
          <p className="text-xs text-fg-2">{pick("Display-P3·ProMotion 120Hz·Vision Pro 3-창, S-Pen·DeX·Z Fold Flex, OBB 0mm 충돌 해소·물리 궤적·MIDI 8채널·풋 페달을 통합 제어합니다.", "Orchestrate Display-P3, ProMotion 120Hz, Vision Pro 3-window, S-Pen/DeX/Z Fold Flex, 0mm OBB collision, physical trajectories, 8-ch MIDI, and 3-pedal routing.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span data-testid="apple-gamut-badge" className="rounded-full bg-accent-soft px-3 py-1 font-semibold text-accent">{applePlan.colorSurface.colorSpace.toUpperCase()} · {applePlan.proMotion.targetHz}Hz</span>
          <span data-testid="collision-zero-badge" className="rounded-full bg-good-soft px-3 py-1 font-semibold text-good">{pick(`3D 간섭 ${collisionResult.finalMaxPenetrationMm}mm`, `3D Overlap ${collisionResult.finalMaxPenetrationMm}mm`)}</span>
        </div>
      </header>

      <div role="tablist" aria-label={pick("하드웨어 생태계 탭", "Hardware ecosystem tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? BTN_PRIMARY : BTN_OUTLINE}>
            {tab.label}
          </button>
        ))}
      </div>

      {notice ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-good bg-good-soft px-3 py-2 text-xs font-semibold text-good">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{notice}</span>
        </div>
      ) : null}

      {activeTab === "apple-ecosystem" ? (
        <div id={`${uid}-panel-apple-ecosystem`} role="tabpanel" aria-labelledby={`${uid}-tab-apple-ecosystem`} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-card p-3">
            {APPLE_FORM_FACTORS.map((item) => (
              <button key={item.id} type="button" aria-pressed={appleFormFactor === item.id} onClick={() => handleSelectAppleFormFactor(item.id)} className={`${BTN_PILL} ${appleFormFactor === item.id ? BTN_ACTIVE : BTN_IDLE}`}>
                {pick(item.ko, item.en)}
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 font-bold text-fg"><Laptop className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("Display-P3 · ProMotion · Force Touch", "Display-P3 · ProMotion · Force Touch")}</span></h3>
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent">{pick(`캔버스 ${applePlan.canvasViewportRatioPct}%`, `Canvas ${applePlan.canvasViewportRatioPct}%`)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-line bg-canvas p-2.5"><div className="text-[10px] text-fg-3">Color Space</div><div className="mt-0.5 font-bold text-fg">{applePlan.colorSurface.colorSpace}</div></div>
                <div className="rounded-lg border border-line bg-canvas p-2.5"><div className="text-[10px] text-fg-3">ProMotion</div><div className="mt-0.5 font-bold text-accent">{applePlan.proMotion.targetHz}Hz ({applePlan.proMotion.frameBudgetMs}ms)</div></div>
                <div className="rounded-lg border border-line bg-canvas p-2.5"><div className="text-[10px] text-fg-3">Universal Ctrl</div><div className="mt-0.5 font-bold text-good">{applePlan.universalControlBridge.enabled ? pick("활성", "ON") : pick("대기", "IDLE")}</div></div>
              </div>
              <label htmlFor={`${uid}-force-slider`} className="flex items-center justify-between font-semibold text-fg-2">
                <span>{pick("macOS Force Touch 트랙패드 압력", "macOS Force Touch Trackpad Force")}</span>
                <span>{forceTouchLevel.toFixed(2)} (Stage {applePlan.forceTouch.stage})</span>
              </label>
              <input id={`${uid}-force-slider`} type="range" min={0} max={3} step={0.1} value={forceTouchLevel} onChange={(e) => setForceTouchLevel(Number(e.target.value))} className="w-full accent-accent" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1.5">
                  {([1, 2, 3] as const).map((cnt) => (
                    <button key={cnt} type="button" aria-pressed={forceFingers === cnt} onClick={() => setForceFingers(cnt)} className={`${BTN_PILL} ${forceFingers === cnt ? BTN_ACTIVE : BTN_IDLE}`}>{cnt}F</button>
                  ))}
                </div>
                <span data-testid="force-touch-summary" className="font-semibold text-fg">{pick(applePlan.forceTouch.summaryKo, applePlan.forceTouch.summaryEn)}</span>
              </div>
            </article>

            <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs tabular-nums">
              <h3 className="flex items-center gap-1.5 font-bold text-fg"><Layers className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("toonstudio:// 단축어·Handoff & Vision Pro 3-창", "toonstudio:// Shortcuts/Handoff & Vision Pro 3-Window")}</span></h3>
              <label htmlFor={`${uid}-deeplink-input`} className="text-[11px] font-semibold text-fg-2">{pick("Handoff / 단축어 딥링크 검증", "Handoff / Shortcuts Deep-Link Parser")}</label>
              <input id={`${uid}-deeplink-input`} type="text" value={deepLinkText} onChange={(e) => setDeepLinkText(e.target.value)} className={`min-h-11 rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-[11px] text-fg ${FOCUS_RING}`} />
              <div data-testid="deeplink-status" className={`rounded-lg border p-2.5 ${applePlan.handoffSession?.valid ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad"}`}>
                {applePlan.handoffSession?.valid
                  ? pick(applePlan.handoffSession.restorePlan?.summaryKo ?? "", applePlan.handoffSession.restorePlan?.summaryEn ?? "")
                  : pick(`차단됨 (${applePlan.handoffSession?.errorCode ?? "invalid"})`, `Blocked (${applePlan.handoffSession?.errorCode ?? "invalid"})`)}
              </div>
              {applePlan.visionProLayout ? (
                <div data-testid="vision-pro-layout-grid" className="grid grid-cols-3 gap-2">
                  {applePlan.visionProLayout.windows.map((win) => (
                    <div key={win.windowId} className="rounded-lg border border-accent bg-accent-soft p-2 text-fg">
                      <div className="font-bold text-accent">{pick(win.titleKo, win.titleEn)}</div>
                      <div className="mt-0.5 text-[10px] text-fg-2">{win.widthMeters}m × {win.heightMeters}m · Yaw {win.yawDeg}°</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {applePlan.windows.map((win) => (
                    <div key={win.windowId} className="rounded-lg border border-line bg-canvas p-2">
                      <div className="font-bold text-fg">{win.windowId}</div>
                      <div className="text-[10px] text-fg-2">{win.displayTarget} · {win.widthPx}×{win.heightPx}px</div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>
        </div>
      ) : null}

      {activeTab === "galaxy-ecosystem" ? (
        <div id={`${uid}-panel-galaxy-ecosystem`} role="tabpanel" aria-labelledby={`${uid}-tab-galaxy-ecosystem`} className="grid gap-4 lg:grid-cols-2">
          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs tabular-nums">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-bold text-fg"><Smartphone className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("Z Fold DevicePosture Flex Mode · Samsung DeX", "Z Fold DevicePosture Flex Mode · Samsung DeX")}</span></h3>
              <button type="button" aria-pressed={dexConnected} onClick={() => setDexConnected((v) => !v)} className={`${BTN_PILL} ${dexConnected ? BTN_ACTIVE : BTN_IDLE}`}>
                {dexConnected ? pick("DeX 외부 모니터 연결됨", "DeX Monitor Connected") : pick("DeX 외부 모니터 연결", "Connect DeX Monitor")}
              </button>
            </div>
            <label htmlFor={`${uid}-hinge-slider`} className="flex items-center justify-between font-semibold text-fg-2">
              <span>{pick("힌지 각도 (Flex 구간 25°~145°)", "Hinge Angle (Flex 25deg-145deg)")}</span>
              <span>{hingeAngleDeg}° · {galaxyPlan.flexPosture.mode}</span>
            </label>
            <input id={`${uid}-hinge-slider`} type="range" min={0} max={180} step={2} value={hingeAngleDeg} onChange={(e) => setHingeAngleDeg(Number(e.target.value))} className="w-full accent-accent" />
            <div data-testid="galaxy-flex-summary" className="rounded-lg border border-line bg-canvas p-2.5 text-fg-2">
              <div className="font-bold text-fg">{pick(galaxyPlan.flexPosture.summaryKo, galaxyPlan.flexPosture.summaryEn)}</div>
              <div className="mt-1">{pick(galaxyPlan.dexLayout.summaryKo, galaxyPlan.dexLayout.summaryEn)}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SPEN_GESTURES.map((g) => (
                <button key={g.id} type="button" aria-pressed={sPenGesture === g.id} onClick={() => setSPenGesture(g.id)} className={`${BTN_PILL} ${sPenGesture === g.id ? BTN_ACTIVE : BTN_IDLE}`}>
                  {pick(g.ko, g.en)}
                </button>
              ))}
            </div>
            <div data-testid="spen-action-readout" className="rounded-lg border border-accent bg-accent-soft p-2.5 font-semibold text-accent">
              {pick(galaxyPlan.sPenAction.summaryKo, galaxyPlan.sPenAction.summaryEn)}
            </div>
          </article>

          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs tabular-nums">
            <h3 className="flex items-center gap-1.5 font-bold text-fg"><Watch className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("Galaxy Watch 회전 베젤 · Quick Share 수신 정규화", "Galaxy Watch Bezel Dial · Quick Share Intake")}</span></h3>
            <div className="flex flex-wrap gap-1.5">
              {WATCH_MODES.map((m) => (
                <button key={m.id} type="button" aria-pressed={watchMode === m.id} onClick={() => handleWatchModeChange(m.id)} className={`${BTN_PILL} ${watchMode === m.id ? BTN_ACTIVE : BTN_IDLE}`}>
                  {pick(m.ko, m.en)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas p-2.5">
              <div data-testid="watch-bezel-readout" className="font-bold text-fg">{watchMode} · {galaxyPlan.watchDial.formattedReadout}</div>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => handleWatchStep(-1)} className={BTN_OUTLINE}>-1 Tick</button>
                <button type="button" onClick={() => handleWatchStep(1)} className={BTN_PRIMARY}>+1 Tick</button>
              </div>
            </div>
            {galaxyPlan.shareIntake ? (
              <div data-testid="quick-share-summary" className="space-y-1.5 rounded-lg border border-line bg-canvas p-2.5">
                <div className="font-bold text-fg">{pick(galaxyPlan.shareIntake.summaryKo, galaxyPlan.shareIntake.summaryEn)}</div>
                {galaxyPlan.shareIntake.acceptedFiles.map((f) => (
                  <div key={f.safeName} className="flex items-center justify-between text-[11px] text-fg-2">
                    <span>{f.safeName}</span><span className="rounded-full bg-good-soft px-2 py-0.5 font-semibold text-good">{f.targetRoute}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        </div>
      ) : null}

      {activeTab === "physics-midi-pedal" ? (
        <div id={`${uid}-panel-physics-midi-pedal`} role="tabpanel" aria-labelledby={`${uid}-tab-physics-midi-pedal`} className="grid gap-4 lg:grid-cols-2">
          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs tabular-nums">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-bold text-fg"><Box className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("3D OBB/AABB 간섭 해소 & 물리 궤적 프레임", "3D OBB/AABB Collision & Physical Trajectory")}</span></h3>
              <button
                type="button"
                onClick={() => { const next = clearanceMm === 0 ? 5 : 0; setClearanceMm(next); onCollisionResolved?.(resolveObjectCollisionAndDropToFloor(DEFAULT_COLLISION_SCENE_BODIES, { floorY: 0, minClearanceMm: next })); }}
                className={`${BTN_PILL} ${clearanceMm > 0 ? BTN_ACTIVE : BTN_IDLE}`}
              >
                {pick(`여유 간격 ${clearanceMm}mm`, `Clearance ${clearanceMm}mm`)}
              </button>
            </div>
            <div data-testid="collision-summary" className="rounded-lg border border-good bg-good-soft p-2.5 font-semibold text-good">
              {pick(collisionResult.summaryKo, collisionResult.summaryEn)}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TRAJECTORY_MODES.map((m) => (
                <button key={m.id} type="button" aria-pressed={trajectoryPreset === m.id} onClick={() => setTrajectoryPreset(m.id)} className={`${BTN_PILL} ${trajectoryPreset === m.id ? BTN_ACTIVE : BTN_IDLE}`}>
                  {pick(m.ko, m.en)}
                </button>
              ))}
            </div>
            <label htmlFor={`${uid}-traj-time`} className="flex items-center justify-between font-semibold text-fg-2">
              <span>{pick("물리 궤적 추출 시각", "Trajectory Sample Time")}</span>
              <span>{trajectoryTimeSec.toFixed(2)}s (F{trajectoryFrame.frameIndex})</span>
            </label>
            <input id={`${uid}-traj-time`} type="range" min={0} max={2.4} step={0.05} value={trajectoryTimeSec} onChange={(e) => setTrajectoryTimeSec(Number(e.target.value))} className="w-full accent-accent" />
            <div className="rounded-lg border border-line bg-canvas p-2">
              <svg viewBox="0 0 360 110" className="h-24 w-full" role="img" aria-label={pick("물리 궤적 프레임 미리보기", "Physical trajectory frame preview")}>
                <rect x="4" y="4" width="352" height="102" rx="8" fill="var(--color-panel)" stroke="var(--color-line)" strokeWidth="1.5" />
                <line x1="12" y1="96" x2="348" y2="96" stroke="var(--color-line)" strokeWidth="1.5" />
                {trajectoryFrame.particles.slice(0, 10).map((p) => (
                  <g key={p.id}>
                    <polyline fill="none" stroke="var(--color-accent)" strokeWidth="1.5" points={p.trail.map((pt) => `${Math.max(12, Math.min(348, 36 + pt.x * 24))},${Math.max(12, Math.min(96, 96 - pt.y * 18))}`).join(" ")} />
                    <circle cx={Math.max(12, Math.min(348, 36 + p.position.x * 24))} cy={Math.max(12, Math.min(96, 96 - p.position.y * 18))} r={Math.max(2.5, p.scale * 3.5)} fill="var(--color-good)" />
                  </g>
                ))}
              </svg>
            </div>
          </article>

          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs tabular-nums">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-bold text-fg"><Sliders className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("Web MIDI 8채널 믹서 & 3-페달 풋 스위치", "Web MIDI 8-Ch Mixer & 3-Pedal Switch")}</span></h3>
              <span data-testid="midi-feedback-bytes" className="font-mono text-[10px] text-fg-3">{lastMidiFeedback}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEFAULT_MIDI_CHANNEL_MAP.map((ch) => (
                <label key={ch.controlId} className="flex flex-col gap-1 rounded-lg border border-line bg-canvas p-2">
                  <span className="flex items-center justify-between text-[11px] font-semibold text-fg">
                    <span>CC{ch.cc} {pick(ch.labelKo, ch.labelEn)}</span>
                    <span className="text-accent">{midiValues[ch.controlId]}{ch.unit}</span>
                  </span>
                  <input aria-label={`MIDI CC${ch.cc} ${ch.controlId}`} type="range" min={0} max={127} step={1} value={midiCcRaw[ch.cc] ?? 64} onChange={(e) => handleMidiSlider(ch.cc, Number(e.target.value))} className="w-full accent-accent" />
                </label>
              ))}
            </div>
            <div className="space-y-2 rounded-lg border border-line bg-canvas p-2.5">
              <div className="flex items-center justify-between font-bold text-fg">
                <span className="flex items-center gap-1.5"><Footprints className="h-4 w-4 text-accent" aria-hidden="true" />{pick("USB/BLE 3-페달 핸즈프리", "USB/BLE 3-Pedal Hands-Free")}</span>
                <span data-testid="pedal-state-badge" className="text-[11px] text-accent">
                  {pedalState.activeTool} · Undo {pedalState.undoCount} · {pedalState.canvasFlippedH ? "FLIP" : "NORM"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => handlePedalTap("left")} className={BTN_OUTLINE}>{pick("좌: Undo", "L: Undo")}</button>
                <button type="button" onClick={() => handlePedalTap("center", true)} className={pedalState.activeTool === "eraser" ? BTN_PRIMARY : BTN_OUTLINE}>
                  {pedalState.activeTool === "eraser" ? pick("중: 지우개 해제", "C: Release") : pick("중: 임시 지우개", "C: Hold Eraser")}
                </button>
                <button type="button" onClick={() => handlePedalTap("right")} className={pedalState.canvasFlippedH ? BTN_PRIMARY : BTN_OUTLINE}>{pick("우: 좌우 반전", "R: Flip H")}</button>
              </div>
              {pedalLog ? <div data-testid="pedal-route-log" className="text-[11px] text-fg-2">{pedalLog}</div> : null}
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
