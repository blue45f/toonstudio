/**
 * Wave 41C — 웹툰 시네마토그래피 3D 카메라 연출 · 180도 법칙 · 구도 점수 · 세로 시선 유도 2탭 스튜디오 패널.
 *
 * - Tab 1: 35mm 풀프레임 시네마 렌즈 광학 · 180도 법칙 평면도 SVG · 삼분할/황금나선/헤드룸 구도 점수
 * - Tab 2: 세로 스크롤 웹툰 Z·S커브 시선 흐름 SVG · 역주행/핑퐁/시선 막힘 탐지 · 말풍선/여백 자동 처방
 * - Calm Atelier 시맨틱 토큰 전용 (원시 색상 표기 0건 · Web Storage 0건 · 기본 객체 대입 미사용)
 */

import {
  AlertTriangle, Camera, CheckCircle2, Compass, Eye, Focus,
  Grid3x3, MoveVertical, RotateCcw, ShieldAlert, SlidersHorizontal, Wrench,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  applySafe180CameraFixes, audit180DegreeRule, CINEMA_FOCAL_LENGTHS, CINEMA_LENS_PRESETS,
  reflectCameraAcrossAxis, computePinholeOptics, DEMO_CINEMATOGRAPHY_SCENES, evaluateCompositionHarmony, generateGoldenSpiralPathPoints,
  type CameraShotSpec, type CinemaFocalLengthMm, type CompositionFrameInput,
  type DemoCinematographyScene, type GazeDirection, type Rule180AuditReport, type ShotScaleId,
} from "./cinematography-camera-engine";
import {
  analyzeVerticalEyeFlow, applyEyeFlowPrescriptions, buildEyeFlowSvgPath, DEMO_VERTICAL_STRIPS,
  GUTTER_PACING_RULES, type EyeFlowCurvePattern, type EyeFlowDefectKind,
  type VerticalEyeFlowReport, type VerticalStripInput,
} from "./vertical-eyeflow-verifier";

import { nodeKey } from "./cinematography-input-contract";
import { useExampleNotification } from "./use-example-notification";

export type CinematographyDirectorTabId = "camera-180" | "vertical-eyeflow";

export interface StudioCinematographyDirectorPanelProps {
  readonly initialTab?: CinematographyDirectorTabId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  /** 메모리 예제 결과 알림이며 실제 원고·기기·설정 적용이나 저장 완료 응답이 아니다. */
  readonly onCameraAuditChange?: (report: Rule180AuditReport) => void | Promise<void>;
  readonly onEyeFlowAuditChange?: (report: VerticalEyeFlowReport) => void | Promise<void>;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BTN = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const PILL_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const ACTIVE_TONE = "border-accent bg-accent-soft text-accent";
const SOLID_ACTIVE = "border-accent bg-accent text-on-accent";
const IDLE_TONE = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

const FALLBACK_SCENE: DemoCinematographyScene = DEMO_CINEMATOGRAPHY_SCENES[0] ?? {
  sceneId: "fallback-scene", titleKo: "기본 씬", titleEn: "Default Scene", descriptionKo: "", descriptionEn: "",
  actorA: { id: "a", nameKo: "인물 A", nameEn: "Actor A", position: { x: -2, z: 0 } },
  actorB: { id: "b", nameKo: "인물 B", nameEn: "Actor B", position: { x: 2, z: 0 } },
  shots: [{ shotId: "s1", labelKo: "컷 1", labelEn: "Cut 1", cameraPosition: { x: 0, z: 4 }, focalLengthMm: 50 }],
  defaultApertureFStop: 2.8, defaultFocusDistanceM: 3.0, defaultBackgroundDistanceM: 10.0,
  defaultComposition: { subjectFocalPoint: { x: 0.33, y: 0.33 }, headTopY: 0.12, gazeDirection: "right", shotScale: "medium" },
};

const FALLBACK_STRIP: VerticalStripInput = DEMO_VERTICAL_STRIPS[0] ?? {
  stripId: "fallback-strip", titleKo: "기본 콘티", titleEn: "Default Strip",
  descriptionKo: "", descriptionEn: "", stripWidthPx: 800, panels: [],
};

function scoreBadgeTone(score: number): string {
  if (score >= 85) return "border-good bg-good-soft text-good";
  return score >= 65 ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";
}

function defectLabel(kind: EyeFlowDefectKind, isEn: boolean): string {
  if (kind === "reverse-backtrack") return isEn ? "Reverse Jump" : "시선 역주행";
  return kind === "ping-pong-fatigue" ? (isEn ? "Ping-Pong" : "좌우 핑퐁") : (isEn ? "Dead Trap" : "시선 막힘");
}

function curvePatternLabel(pattern: EyeFlowCurvePattern, isEn: boolean): string {
  switch (pattern) {
    case "smooth-s-curve": return isEn ? "Smooth S-Curve" : "안정 S-커브";
    case "classic-z-curve": return isEn ? "Classic Z-Curve" : "정석 Z-커브";
    case "vertical-spine": return isEn ? "Vertical Spine" : "수직 직선축";
    case "chaotic-zigzag": return isEn ? "Chaotic Zigzag" : "과도한 지그재그";
    case "stalled-backtrack": return isEn ? "Stalled Backtrack" : "역주행 끊김";
  }
}

function stageToSvg(x: number, z: number): { readonly sx: number; readonly sy: number } {
  return { sx: Math.round((180 + x * 30) * 10) / 10, sy: Math.round((120 + z * 20) * 10) / 10 };
}

function buildFrustumPolygon(camX: number, camZ: number, targetX: number, targetZ: number, hFovDeg: number): string {
  const origin = stageToSvg(camX, camZ);
  const tgt = stageToSvg(targetX, targetZ);
  const baseAngle = Math.atan2(tgt.sy - origin.sy, tgt.sx - origin.sx);
  const halfRad = ((Math.min(100, hFovDeg) * Math.PI) / 180) * 0.5;
  const reach = 42;
  const x1 = Math.round((origin.sx + Math.cos(baseAngle - halfRad) * reach) * 10) / 10;
  const y1 = Math.round((origin.sy + Math.sin(baseAngle - halfRad) * reach) * 10) / 10;
  const x2 = Math.round((origin.sx + Math.cos(baseAngle + halfRad) * reach) * 10) / 10;
  const y2 = Math.round((origin.sy + Math.sin(baseAngle + halfRad) * reach) * 10) / 10;
  return `${origin.sx},${origin.sy} ${x1},${y1} ${x2},${y2}`;
}

interface RangeSliderProps {
  readonly id: string; readonly testId: string; readonly label: string; readonly readout: string;
  readonly readoutTestId?: string; readonly min: number; readonly max: number; readonly step: number;
  readonly value: number; readonly onChange: (next: number) => void;
}

function RangeSlider(p: RangeSliderProps): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={p.id} className="font-semibold text-fg">{p.label}</label>
        <span data-testid={p.readoutTestId} className="font-bold text-accent tabular-nums">{p.readout}</span>
      </div>
      <input
        id={p.id} data-testid={p.testId} type="range" min={p.min} max={p.max} step={p.step} value={p.value}
        onChange={(e) => p.onChange(Number(e.target.value))}
        className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
      />
    </div>
  );
}

/** Wave 41C 웹툰 시네마토그래피 3D 카메라 연출 · 180도 법칙 · 구도 점수 · 세로 시선 유도 2탭 워크벤치. */
export function StudioCinematographyDirectorPanel(props: StudioCinematographyDirectorPanelProps): ReactElement {
  const { initialTab = "camera-180", locale = "ko", className, onCameraAuditChange, onEyeFlowAuditChange } = props;
  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const cameraNotification = useExampleNotification(onCameraAuditChange);
  const eyeFlowNotification = useExampleNotification(onEyeFlowAuditChange);
  const notifications = [cameraNotification, eyeFlowNotification];
  const isPending = (): boolean => notifications.some((n) => n.isPending());
  const [activeTab, setActiveTab] = useState<CinematographyDirectorTabId>(initialTab);
  const [sceneIdx, setSceneIdx] = useState<number>(0);
  const activeScene = DEMO_CINEMATOGRAPHY_SCENES[sceneIdx] ?? FALLBACK_SCENE;
  const [shots, setShots] = useState<readonly CameraShotSpec[]>(() => activeScene.shots);
  const [selectedShotId, setSelectedShotId] = useState<string>(() => activeScene.shots[0]?.shotId ?? "cut-01-master");
  const [focalLengthMm, setFocalLengthMm] = useState<CinemaFocalLengthMm>(() => activeScene.shots[0]?.focalLengthMm ?? 35);
  const [apertureFStop, setApertureFStop] = useState<number>(() => activeScene.defaultApertureFStop);
  const [focusDistanceM, setFocusDistanceM] = useState<number>(() => activeScene.defaultFocusDistanceM);
  const [backgroundDistanceM, setBackgroundDistanceM] = useState<number>(() => activeScene.defaultBackgroundDistanceM);
  const [composition, setComposition] = useState<CompositionFrameInput>(() => activeScene.defaultComposition);
  const [showThirds, setShowThirds] = useState<boolean>(true);
  const [showSpiral, setShowSpiral] = useState<boolean>(true);

  const [stripIdx, setStripIdx] = useState<number>(0);
  const baseStrip = DEMO_VERTICAL_STRIPS[stripIdx] ?? FALLBACK_STRIP;
  const [workingStrip, setWorkingStrip] = useState<VerticalStripInput>(() => baseStrip);
  const [selectedPanelId, setSelectedPanelId] = useState<string>(() => baseStrip.panels[0]?.panelId ?? "");

  const optics = useMemo(
    () => computePinholeOptics({ focalLengthMm, apertureFStop, focusDistanceM, backgroundDistanceM }),
    [focalLengthMm, apertureFStop, focusDistanceM, backgroundDistanceM],
  );
  const rule180Report = useMemo(
    () => audit180DegreeRule({ actorA: activeScene.actorA, actorB: activeScene.actorB, shots }),
    [activeScene.actorA, activeScene.actorB, shots],
  );
  const compositionResult = useMemo(() => evaluateCompositionHarmony(composition), [composition]);
  const spiralPolylinePoints = useMemo(
    () => generateGoldenSpiralPathPoints(compositionResult.resolvedSpiralCorner, 300, 200, 64).map((p) => `${p.x},${p.y}`).join(" "),
    [compositionResult.resolvedSpiralCorner],
  );
  const eyeFlowReport = useMemo(() => analyzeVerticalEyeFlow(workingStrip), [workingStrip]);

  const floorplanGeometry = useMemo(() => {
    const a = activeScene.actorA.position;
    const b = activeScene.actorB.position;
    const lx = b.x - a.x;
    const lz = b.z - a.z;
    const len = Math.max(0.001, Math.hypot(lx, lz));
    const ux = lx / len;
    const uz = lz / len;
    const nx = -uz;
    const nz = ux;
    const safeSign = rule180Report.establishedSide === "negative" ? -1 : 1;
    const midX = (a.x + b.x) * 0.5;
    const midZ = (a.z + b.z) * 0.5;
    const pStart = stageToSvg(midX - ux * 12, midZ - uz * 12);
    const pEnd = stageToSvg(midX + ux * 12, midZ + uz * 12);
    const pEndSafe = stageToSvg(midX + ux * 12 + nx * safeSign * 12, midZ + uz * 12 + nz * safeSign * 12);
    const pStartSafe = stageToSvg(midX - ux * 12 + nx * safeSign * 12, midZ - uz * 12 + nz * safeSign * 12);
    const pEndDanger = stageToSvg(midX + ux * 12 - nx * safeSign * 12, midZ + uz * 12 - nz * safeSign * 12);
    const pStartDanger = stageToSvg(midX - ux * 12 - nx * safeSign * 12, midZ - uz * 12 - nz * safeSign * 12);
    return {
      actorA: stageToSvg(a.x, a.z), actorB: stageToSvg(b.x, b.z),
      axisLine: { x1: pStart.sx, y1: pStart.sy, x2: pEnd.sx, y2: pEnd.sy },
      safePoly: `${pStart.sx},${pStart.sy} ${pEnd.sx},${pEnd.sy} ${pEndSafe.sx},${pEndSafe.sy} ${pStartSafe.sx},${pStartSafe.sy}`,
      dangerPoly: `${pStart.sx},${pStart.sy} ${pEnd.sx},${pEnd.sy} ${pEndDanger.sx},${pEndDanger.sy} ${pStartDanger.sx},${pStartDanger.sy}`,
    };
  }, [activeScene.actorA.position, activeScene.actorB.position, rule180Report.establishedSide]);

  const stripSvgLayout = useMemo(() => {
    const padX = 20;
    const padY = 16;
    const drawW = 280;
    const scaleX = drawW / Math.max(1, eyeFlowReport.stripWidthPx);
    const scaleY = 528 / Math.max(1, eyeFlowReport.totalHeightPx);
    const scaledPoints = eyeFlowReport.pathPoints.map((pt) => ({
      ...pt,
      globalX: Math.round((padX + pt.globalX * scaleX) * 10) / 10,
      globalY: Math.round((padY + pt.globalY * scaleY) * 10) / 10,
    }));
    return { padX, padY, drawW, scaleX, scaleY, scaledPoints, svgPathD: buildEyeFlowSvgPath(scaledPoints) };
  }, [eyeFlowReport]);

  const handleSelectScene = (nextIdx: number): void => {
    if (isPending()) return;
    const target = DEMO_CINEMATOGRAPHY_SCENES[nextIdx] ?? FALLBACK_SCENE;
    setSceneIdx(nextIdx);
    setShots(target.shots);
    setSelectedShotId(target.shots[0]?.shotId ?? "");
    setFocalLengthMm(target.shots[0]?.focalLengthMm ?? 35);
    setApertureFStop(target.defaultApertureFStop);
    setFocusDistanceM(target.defaultFocusDistanceM);
    setBackgroundDistanceM(target.defaultBackgroundDistanceM);
    setComposition(target.defaultComposition);
    cameraNotification.notify(audit180DegreeRule({ actorA: target.actorA, actorB: target.actorB, shots: target.shots }));
  };

  const handleSelectShot = (shot: CameraShotSpec): void => {
    if (isPending()) return;
    setSelectedShotId(shot.shotId);
    setFocalLengthMm(shot.focalLengthMm);
  };

  const handleFocalSelect = (nextMm: CinemaFocalLengthMm): void => {
    if (isPending()) return;
    setFocalLengthMm(nextMm);
    const nextShots = shots.map((s) => (s.shotId === selectedShotId ? { ...s, focalLengthMm: nextMm } : s));
    setShots(nextShots);
    cameraNotification.notify(audit180DegreeRule({ actorA: activeScene.actorA, actorB: activeScene.actorB, shots: nextShots }));
  };

  const handleFix180Crossing = (): void => {
    if (isPending()) return;
    const fixedShots = applySafe180CameraFixes(shots, rule180Report);
    setShots(fixedShots);
    cameraNotification.notify(audit180DegreeRule({ actorA: activeScene.actorA, actorB: activeScene.actorB, shots: fixedShots }));
  };

  const handleFlipSelectedShotSide = (): void => {
    if (isPending()) return;
    const nextShots = shots.map((s) =>
      s.shotId === selectedShotId ? { ...s, cameraPosition: reflectCameraAcrossAxis(activeScene.actorA.position, activeScene.actorB.position, s.cameraPosition) } : s,
    );
    setShots(nextShots);
    cameraNotification.notify(audit180DegreeRule({ actorA: activeScene.actorA, actorB: activeScene.actorB, shots: nextShots }));
  };

  const handleAutoReframeComposition = (): void => {
    if (isPending()) return;
    setComposition((prev) => ({ ...prev, subjectFocalPoint: compositionResult.suggestedFocalPoint, headTopY: compositionResult.suggestedHeadTopY }));
  };

  const handleSelectStrip = (nextIdx: number): void => {
    if (isPending()) return;
    const target = DEMO_VERTICAL_STRIPS[nextIdx] ?? FALLBACK_STRIP;
    setStripIdx(nextIdx);
    setWorkingStrip(target);
    setSelectedPanelId(target.panels[0]?.panelId ?? "");
    eyeFlowNotification.notify(analyzeVerticalEyeFlow(target));
  };

  const handleApplyEyeFlowFix = (): void => {
    if (isPending()) return;
    const healed = applyEyeFlowPrescriptions(workingStrip, eyeFlowReport);
    setWorkingStrip(healed);
    eyeFlowNotification.notify(analyzeVerticalEyeFlow(healed));
  };

  const handleResetEyeFlow = (): void => {
    if (isPending()) return;
    setWorkingStrip(baseStrip);
    eyeFlowNotification.notify(analyzeVerticalEyeFlow(baseStrip));
  };

  const handleUpdatePanelGutter = (panelId: string, nextGutterPx: number): void => {
    if (isPending()) return;
    const updated: VerticalStripInput = {
      ...workingStrip,
      panels: workingStrip.panels.map((p) => (p.panelId === panelId ? { ...p, gutterAfterPx: nextGutterPx } : p)),
    };
    setWorkingStrip(updated);
    eyeFlowNotification.notify(analyzeVerticalEyeFlow(updated));
  };

  const activeGutterPanel = workingStrip.panels.find((p) => p.panelId === selectedPanelId) ?? workingStrip.panels[0];

  const tabs: readonly { readonly id: CinematographyDirectorTabId; readonly label: string; readonly shortLabel: string; readonly icon: ReactElement }[] = [
    { id: "camera-180", label: pick("3D 시네마 렌즈 · 180도 법칙 · 구도", "3D Cinema Lens · 180° Rule · Framing"), shortLabel: pick("카메라", "Camera"), icon: <Camera className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" /> },
    { id: "vertical-eyeflow", label: pick("세로 스크롤 Z·S커브 시선 흐름 검증기", "Vertical Scroll Z/S Eye-Flow Verifier"), shortLabel: pick("시선 경로", "Eye flow"), icon: <MoveVertical className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" /> },
  ];
  const shotScales: readonly { readonly id: ShotScaleId; readonly labelKo: string; readonly labelEn: string }[] = [
    { id: "closeup", labelKo: "클로즈업", labelEn: "Close-Up" },
    { id: "medium", labelKo: "미디엄", labelEn: "Medium" },
    { id: "wide", labelKo: "와이드", labelEn: "Wide" },
  ];
  const gazeOptions: readonly { readonly id: GazeDirection; readonly labelKo: string; readonly labelEn: string }[] = [
    { id: "left", labelKo: "시선 ← 좌측", labelEn: "Gaze Left" },
    { id: "center", labelKo: "정면 응시", labelEn: "Center" },
    { id: "right", labelKo: "시선 우측 →", labelEn: "Gaze Right" },
  ];

  return (
    <section
      data-testid="cinematography-director-panel"
      aria-busy={notifications.some((n) => n.status === "pending")}
      aria-label={pick("웹툰 시네마토그래피 3D 카메라 연출 · 180도 법칙 · 세로 시선 흐름 감독 워크벤치", "Webtoon Cinematography 3D Camera, 180-Degree Rule & Eye-Flow Director")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("웹툰 시네마토그래피 감독 · 180도 시선축 · 구도 · 세로 아이플로우", "Webtoon Cinematography Director · 180° Axis · Framing · Eye-Flow")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick("고정 합성 샷·콘티의 핀홀 광학, 시선 축, 구도·앵커 규칙을 CPU로 계산합니다.", "CPU calculations use fixed synthetic shots and strips for pinhole optics, axis, framing and anchor rules.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            data-testid="header-180-status-badge"
            className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${
              rule180Report.compliant ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad"
            }`}
          >
            {rule180Report.compliant ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
            {rule180Report.compliant ? pick("180° 축 준수", "180° Compliant") : pick(`180° 축 넘침 ${rule180Report.violations.length}건`, `${rule180Report.violations.length} Axis Crossing`)}
          </span>
          <span
            data-testid="header-eyeflow-score-badge"
            className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${scoreBadgeTone(eyeFlowReport.flowScore)}`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            {pick(`시선 흐름 ${eyeFlowReport.flowScore}점`, `Eye-Flow ${eyeFlowReport.flowScore}`)}
          </span>
        </div>
      </header>
      <p data-testid="cinematography-scope-notice" className="text-xs text-fg-2">{pick("합성 데이터와 SVG 계산 예제입니다. 점수·읽기 시간은 고정 규칙의 추정이며 독자 시선·기기 성능 실측이 아닙니다. 실제 3D 씬 카메라·원고·저장에는 반영하지 않으며 패널을 닫으면 예제 상태가 사라집니다.", "Synthetic data and SVG calculation examples. Scores and read times are rule estimates, not measured reader gaze or device performance. No real 3D camera, manuscript or storage changes; state ends when this panel closes.")}</p>
      {notifications.map((n, i) => n.status !== "idle" ? <div key={i} data-testid={`cinema-notification-${i}`} role={n.status === "failed" ? "alert" : "status"} className="text-xs text-fg-2">
        {n.status === "failed" ? pick("예제 알림 실패", "Example notification failed") : n.status === "pending" ? pick("예제 알림 대기 중", "Example notification pending") : n.status === "local-only" ? pick("메모리 예제만 변경됨 · 수신자 미연결", "Memory example changed; no receiver") : pick("예제 알림 완료", "Example notification delivered")} · {pick("실제 적용·저장 완료 아님", "No real apply or save confirmed")}
        {n.status === "failed" ? <button type="button" onClick={n.retry} className={PILL_BTN}>{pick("예제 알림 다시 시도", "Retry example notification")}</button> : null}
      </div> : null)}
      <fieldset disabled={notifications.some((n) => n.status === "pending")} className="m-0 min-w-0 space-y-4 border-0 p-0">

      <div role="tablist" aria-label={pick("시네마토그래피 감독 작업 탭", "Cinematography Director Tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id} type="button" role="tab" id={`${uid}-tab-${tab.id}`}
            aria-selected={activeTab === tab.id} aria-label={`${tab.shortLabel}: ${tab.label}`} title={tab.label} aria-controls={`${uid}-panel-${tab.id}`}
            data-testid={`tab-${tab.id}`} onClick={() => setActiveTab(tab.id)}
            className={`${TAB_BTN} ${activeTab === tab.id ? SOLID_ACTIVE : IDLE_TONE}`}
          >
            {tab.icon}<span>{tab.shortLabel}</span>
          </button>
        ))}
      </div>

      {activeTab === "camera-180" && (
        <div role="tabpanel" id={`${uid}-panel-camera-180`} aria-labelledby={`${uid}-tab-camera-180`} data-testid="panel-camera-180" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap gap-1.5">
              {DEMO_CINEMATOGRAPHY_SCENES.map((scene, idx) => (
                <button key={scene.sceneId} type="button" data-testid={`camera-scene-btn-${scene.sceneId}`} onClick={() => handleSelectScene(idx)} className={`${PILL_BTN} ${sceneIdx === idx ? ACTIVE_TONE : IDLE_TONE}`}>
                  {isEn ? scene.titleEn : scene.titleKo}
                </button>
              ))}
            </div>
            <button type="button" data-testid="btn-reset-camera-scene" onClick={() => handleSelectScene(sceneIdx)} className={`${PILL_BTN} ${IDLE_TONE}`}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("씬 초기화", "Reset Scene")}</span>
            </button>
          </div>

          <div className="space-y-3 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Focus className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("35mm 풀프레임 핀홀 광학 · 피사계 심도(DoF) · CoC 블러", "35mm Full-Frame Pinhole Optics · DoF · CoC Blur")}</span>
              </div>
              <span className="text-[11px] text-fg-3">{isEn ? CINEMA_LENS_PRESETS[focalLengthMm].roleEn : CINEMA_LENS_PRESETS[focalLengthMm].roleKo}</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CINEMA_FOCAL_LENGTHS.map((mm) => (
                <button key={mm} type="button" data-testid={`focal-btn-${mm}`} onClick={() => handleFocalSelect(mm)} className={`${PILL_BTN} tabular-nums ${focalLengthMm === mm ? ACTIVE_TONE : IDLE_TONE}`}>
                  {mm}mm
                </button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <RangeSlider id={`${uid}-aperture`} testId="slider-aperture" readoutTestId="readout-aperture" label={pick("조리개 (f-stop)", "Aperture (f-stop)")} readout={`f/${apertureFStop.toFixed(1)}`} min={1.4} max={16} step={0.2} value={apertureFStop} onChange={setApertureFStop} />
              <RangeSlider id={`${uid}-focus-dist`} testId="slider-focus-distance" readoutTestId="readout-focus-distance" label={pick("초점 거리 (피사체)", "Focus Distance")} readout={`${focusDistanceM.toFixed(1)}m`} min={0.8} max={12} step={0.2} value={focusDistanceM} onChange={setFocusDistanceM} />
              <RangeSlider id={`${uid}-bg-dist`} testId="slider-bg-distance" readoutTestId="readout-bg-distance" label={pick("배경 거리 (CoC 계산)", "Background Distance")} readout={`${backgroundDistanceM.toFixed(1)}m`} min={2} max={30} step={0.5} value={backgroundDistanceM} onChange={setBackgroundDistanceM} />
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-lg border border-line bg-raised p-2.5">
                <div className="text-[11px] text-fg-3">{pick("수평 · 수직 화각 (FOV)", "H · V Field of View")}</div>
                <div data-testid="optics-fov-readout" className="mt-1 text-sm font-bold text-fg tabular-nums">{optics.horizontalFovDeg.toFixed(1)}° × {optics.verticalFovDeg.toFixed(1)}°</div>
              </div>
              <div className="rounded-lg border border-line bg-raised p-2.5">
                <div className="text-[11px] text-fg-3">{pick("원근 왜곡률 · 압축비", "Distortion · Compression")}</div>
                <div data-testid="optics-distortion-readout" className="mt-1 text-sm font-bold text-fg tabular-nums">{optics.perspectiveDistortionPercent.toFixed(1)}% · ×{optics.telephotoCompressionFactor.toFixed(2)}</div>
              </div>
              <div className="rounded-lg border border-line bg-raised p-2.5">
                <div className="text-[11px] text-fg-3">{pick("피사계 심도 (Near ~ Far)", "Depth of Field")}</div>
                <div data-testid="optics-dof-readout" className="mt-1 text-sm font-bold text-fg tabular-nums">{optics.nearFocusLimitM.toFixed(2)}m ~ {optics.farFocusLimitM === null ? "∞" : `${optics.farFocusLimitM.toFixed(2)}m`}</div>
              </div>
              <div className="rounded-lg border border-line bg-raised p-2.5">
                <div className="text-[11px] text-fg-3">{pick("배경 CoC 블러", "Background CoC Blur")}</div>
                <div data-testid="optics-coc-readout" className="mt-1 text-sm font-bold text-accent tabular-nums">{optics.backgroundCocMm.toFixed(3)}mm ({optics.estimatedBlurRadiusPx.toFixed(1)}px)</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-12">
            <div className="space-y-3 rounded-lg border border-line bg-card p-3 lg:col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-fg">{pick("180도 법칙(Line-of-Action) 평면도 · 축 넘침 감시", "180° Line-of-Action Floorplan Audit")}</h3>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" data-testid="btn-flip-selected-shot" onClick={handleFlipSelectedShotSide} className={`${PILL_BTN} ${IDLE_TONE}`}>
                    <span>{pick("선택 컷 축 반전 테스트", "Toggle Shot Side")}</span>
                  </button>
                  {!rule180Report.compliant && (
                    <button type="button" data-testid="btn-fix-180-crossing" onClick={handleFix180Crossing} className={`${PILL_BTN} ${SOLID_ACTIVE}`}>
                      <Wrench className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("180도 안전 위치 자동 보정", "Auto-Fix 180° Crossing")}</span>
                    </button>
                  )}
                </div>
              </div>

              <svg data-testid="line-of-action-svg" viewBox="0 0 360 240" role="img" aria-label={pick("180도 법칙 카메라 배치 평면도", "180-degree Line-of-Action camera floorplan")} className="w-full rounded-lg border border-line bg-canvas">
                <defs><clipPath id={`${uid}-stage-clip`}><rect x={8} y={8} width={344} height={224} rx={6} /></clipPath></defs>
                <g clipPath={`url(#${uid}-stage-clip)`}>
                  <polygon points={floorplanGeometry.safePoly} className="fill-good-soft" />
                  <polygon points={floorplanGeometry.dangerPoly} className="fill-bad-soft" />
                  <line x1={floorplanGeometry.axisLine.x1} y1={floorplanGeometry.axisLine.y1} x2={floorplanGeometry.axisLine.x2} y2={floorplanGeometry.axisLine.y2} strokeDasharray="6 4" strokeWidth={1.6} className="stroke-accent" />
                </g>
                <circle cx={floorplanGeometry.actorA.sx} cy={floorplanGeometry.actorA.sy} r={9} className="fill-info-soft stroke-cool" strokeWidth={2} />
                <text x={floorplanGeometry.actorA.sx} y={floorplanGeometry.actorA.sy - 13} textAnchor="middle" className="fill-fg text-[10px] font-semibold">{isEn ? activeScene.actorA.nameEn : activeScene.actorA.nameKo}</text>
                <circle cx={floorplanGeometry.actorB.sx} cy={floorplanGeometry.actorB.sy} r={9} className="fill-info-soft stroke-cool" strokeWidth={2} />
                <text x={floorplanGeometry.actorB.sx} y={floorplanGeometry.actorB.sy - 13} textAnchor="middle" className="fill-fg text-[10px] font-semibold">{isEn ? activeScene.actorB.nameEn : activeScene.actorB.nameKo}</text>

                {rule180Report.shotAudits.map((item) => {
                  const pos = stageToSvg(item.cameraPosition.x, item.cameraPosition.z);
                  const midX = (activeScene.actorA.position.x + activeScene.actorB.position.x) * 0.5;
                  const midZ = (activeScene.actorA.position.z + activeScene.actorB.position.z) * 0.5;
                  const shotFov = computePinholeOptics({ focalLengthMm: item.focalLengthMm, apertureFStop, focusDistanceM }).horizontalFovDeg;
                  const frustum = buildFrustumPolygon(item.cameraPosition.x, item.cameraPosition.z, midX, midZ, shotFov);
                  const isSelected = item.shotId === selectedShotId;
                  const safeTarget = item.suggestedSafePosition ? stageToSvg(item.suggestedSafePosition.x, item.suggestedSafePosition.z) : null;
                  return (
                    <g key={item.shotId}>
                      <polygon points={frustum} className={item.crossedAxis ? "fill-bad-soft stroke-bad" : isSelected ? "fill-accent-soft stroke-accent" : "fill-good-soft stroke-good"} strokeWidth={1} />
                      {safeTarget && (
                        <>
                          <line x1={pos.sx} y1={pos.sy} x2={safeTarget.sx} y2={safeTarget.sy} strokeDasharray="3 3" strokeWidth={1.4} className="stroke-warn" />
                          <circle cx={safeTarget.sx} cy={safeTarget.sy} r={7} strokeDasharray="2 2" strokeWidth={1.5} className="fill-good-soft stroke-good" />
                          <text x={safeTarget.sx} y={safeTarget.sy + 3} textAnchor="middle" className="fill-good text-[9px] font-bold">S{item.shotIndex + 1}</text>
                        </>
                      )}
                      <circle cx={pos.sx} cy={pos.sy} r={isSelected ? 10 : 8} strokeWidth={isSelected ? 2.2 : 1.5} className={item.crossedAxis ? "fill-bad-soft stroke-bad" : isSelected ? "fill-accent-soft stroke-accent" : "fill-card stroke-good"} />
                      <text x={pos.sx} y={pos.sy + 3.5} textAnchor="middle" className="fill-fg text-[9px] font-bold">C{item.shotIndex + 1}</text>
                    </g>
                  );
                })}
              </svg>

              <p data-testid="rule-180-summary" className="text-xs text-fg-2">{isEn ? rule180Report.summaryEn : rule180Report.summaryKo}</p>

              <ul data-testid="shot-audit-list" className="space-y-1.5">
                {rule180Report.shotAudits.map((item) => {
                  const matchedShot = shots.find((s) => s.shotId === item.shotId);
                  return (
                    <li key={item.shotId}>
                      <button
                        type="button" data-testid={`shot-item-${item.shotId}`}
                        onClick={() => { if (matchedShot) handleSelectShot(matchedShot); }}
                        className={`flex min-h-11 w-full cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                          item.crossedAxis ? "border-bad bg-bad-soft text-bad" : item.shotId === selectedShotId ? ACTIVE_TONE : "border-line bg-raised text-fg"
                        }`}
                      >
                        <span className="font-semibold">C{item.shotIndex + 1} · {isEn ? item.labelEn : item.labelKo} ({item.focalLengthMm}mm)</span>
                        <span className="text-[11px] tabular-nums">L×V={item.crossProduct.toFixed(1)} · {item.crossedAxis ? pick("축 넘침", "Crossed") : item.screenOrder}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="space-y-3 rounded-lg border border-line bg-card p-3 lg:col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                  <Grid3x3 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>{pick("삼분할 · 황금나선 · 헤드룸 · 시선 여백 구도 점수", "Rule of Thirds · Golden Spiral · Headroom · Lookroom")}</span>
                </div>
                <span data-testid="composition-overall-score" className={`rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums ${scoreBadgeTone(compositionResult.overallScore)}`}>
                  {compositionResult.overallScore} / 100
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button type="button" data-testid="toggle-thirds-overlay" aria-pressed={showThirds} onClick={() => setShowThirds((v) => !v)} className={`${PILL_BTN} ${showThirds ? ACTIVE_TONE : IDLE_TONE}`}>{pick("삼분할 격자", "Rule of Thirds")}</button>
                <button type="button" data-testid="toggle-spiral-overlay" aria-pressed={showSpiral} onClick={() => setShowSpiral((v) => !v)} className={`${PILL_BTN} ${showSpiral ? ACTIVE_TONE : IDLE_TONE}`}>{pick("황금나선 (φ)", "Golden Spiral")}</button>
                <button type="button" data-testid="btn-auto-reframe" onClick={handleAutoReframeComposition} className={`${PILL_BTN} ${SOLID_ACTIVE}`}>
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("구도 자동 정렬", "Auto-Reframe")}</span>
                </button>
              </div>

              <svg data-testid="composition-overlay-svg" viewBox="0 0 300 200" role="img" aria-label={pick("삼분할 및 황금나선 구도 프레임 프리뷰", "Rule of Thirds and Golden Spiral framing preview")} className="w-full rounded-lg border border-line bg-canvas">
                {showThirds && (
                  <g data-testid="svg-thirds-group" className="stroke-line-strong" strokeWidth={1} strokeDasharray="4 4">
                    <line x1={100} y1={0} x2={100} y2={200} /><line x1={200} y1={0} x2={200} y2={200} />
                    <line x1={0} y1={66.7} x2={300} y2={66.7} /><line x1={0} y1={133.3} x2={300} y2={133.3} />
                  </g>
                )}
                {showSpiral && (
                  <g data-testid="svg-spiral-group">
                    <polyline points={spiralPolylinePoints} fill="none" strokeWidth={1.6} className="stroke-cool" />
                    <circle cx={compositionResult.goldenSpiralPole.x * 300} cy={compositionResult.goldenSpiralPole.y * 200} r={4} className="fill-info-soft stroke-cool" strokeWidth={1.4} />
                  </g>
                )}
                <line x1={0} y1={composition.headTopY * 200} x2={300} y2={composition.headTopY * 200} strokeDasharray="3 3" strokeWidth={1.2} className={compositionResult.headroomStatus === "optimal" ? "stroke-good" : "stroke-warn"} />
                <circle cx={composition.subjectFocalPoint.x * 300} cy={composition.subjectFocalPoint.y * 200} r={18} strokeWidth={1.5} className="fill-accent-soft stroke-accent" />
                <circle cx={composition.subjectFocalPoint.x * 300} cy={composition.subjectFocalPoint.y * 200} r={4} className="fill-accent" />
                {composition.gazeDirection !== "center" && (
                  <line x1={composition.subjectFocalPoint.x * 300} y1={composition.subjectFocalPoint.y * 200} x2={composition.subjectFocalPoint.x * 300 + (composition.gazeDirection === "right" ? 56 : -56)} y2={composition.subjectFocalPoint.y * 200} strokeWidth={2} className={compositionResult.lookroomStatus === "optimal" ? "stroke-good" : "stroke-bad"} />
                )}
              </svg>

              <div className="flex flex-wrap gap-1.5">
                {gazeOptions.map((g) => (
                  <button key={g.id} type="button" data-testid={`gaze-btn-${g.id}`} onClick={() => setComposition((prev) => ({ ...prev, gazeDirection: g.id }))} className={`${PILL_BTN} ${composition.gazeDirection === g.id ? ACTIVE_TONE : IDLE_TONE}`}>
                    {isEn ? g.labelEn : g.labelKo}
                  </button>
                ))}
                {shotScales.map((sc) => (
                  <button key={sc.id} type="button" data-testid={`scale-btn-${sc.id}`} onClick={() => setComposition((prev) => ({ ...prev, shotScale: sc.id }))} className={`${PILL_BTN} ${composition.shotScale === sc.id ? ACTIVE_TONE : IDLE_TONE}`}>
                    {isEn ? sc.labelEn : sc.labelKo}
                  </button>
                ))}
              </div>

              <div className="grid gap-2.5 sm:grid-cols-3">
                <RangeSlider id={`${uid}-focal-x`} testId="slider-focal-x" label={pick("인물 초점 X", "Subject X")} readout={`${Math.round(composition.subjectFocalPoint.x * 100)}%`} min={0.1} max={0.9} step={0.01} value={composition.subjectFocalPoint.x} onChange={(x) => setComposition((prev) => ({ ...prev, subjectFocalPoint: { ...prev.subjectFocalPoint, x } }))} />
                <RangeSlider id={`${uid}-focal-y`} testId="slider-focal-y" label={pick("인물 초점 Y", "Subject Y")} readout={`${Math.round(composition.subjectFocalPoint.y * 100)}%`} min={0.15} max={0.85} step={0.01} value={composition.subjectFocalPoint.y} onChange={(y) => setComposition((prev) => ({ ...prev, subjectFocalPoint: { ...prev.subjectFocalPoint, y } }))} />
                <RangeSlider id={`${uid}-headroom`} testId="slider-headroom" label={pick("헤드룸 상단", "Headroom")} readout={`${Math.round(composition.headTopY * 100)}%`} min={0.02} max={0.35} step={0.01} value={composition.headTopY} onChange={(headTopY) => setComposition((prev) => ({ ...prev, headTopY }))} />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-md border border-line bg-raised p-2 text-xs"><div className="text-[11px] text-fg-3">{pick("삼분할", "Thirds")}</div><div className="font-bold text-fg tabular-nums">{compositionResult.ruleOfThirdsScore}</div></div>
                <div className="rounded-md border border-line bg-raised p-2 text-xs"><div className="text-[11px] text-fg-3">{pick("황금나선", "Golden φ")}</div><div className="font-bold text-fg tabular-nums">{compositionResult.goldenSpiralScore}</div></div>
                <div className="rounded-md border border-line bg-raised p-2 text-xs"><div className="text-[11px] text-fg-3">{pick("헤드룸", "Headroom")}</div><div className="font-bold text-fg tabular-nums">{compositionResult.headroomScore}</div></div>
                <div className="rounded-md border border-line bg-raised p-2 text-xs"><div className="text-[11px] text-fg-3">{pick("시선 여백", "Lookroom")}</div><div className="font-bold text-fg tabular-nums">{compositionResult.lookroomScore}</div></div>
              </div>

              <ul data-testid="composition-advice-list" className="space-y-1 text-xs text-fg-2">
                {(isEn ? compositionResult.recommendationsEn : compositionResult.recommendationsKo).map((msg, idx) => (
                  <li key={`${idx}-${msg.slice(0, 12)}`} className="rounded-md border border-line bg-raised px-2.5 py-1.5">{msg}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === "vertical-eyeflow" && (
        <div role="tabpanel" id={`${uid}-panel-vertical-eyeflow`} aria-labelledby={`${uid}-tab-vertical-eyeflow`} data-testid="panel-vertical-eyeflow" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap gap-1.5">
              {DEMO_VERTICAL_STRIPS.map((strip, idx) => (
                <button key={strip.stripId} type="button" data-testid={`strip-preset-btn-${strip.stripId}`} onClick={() => handleSelectStrip(idx)} className={`${PILL_BTN} ${stripIdx === idx ? ACTIVE_TONE : IDLE_TONE}`}>
                  {isEn ? strip.titleEn : strip.titleKo}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="btn-apply-eyeflow-fix" onClick={handleApplyEyeFlowFix} className={`${PILL_BTN} ${SOLID_ACTIVE}`}>
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("말풍선·여백 자동 처방 적용", "Apply Eye-Flow & Gutter Fix")}</span>
              </button>
              <button type="button" data-testid="btn-reset-eyeflow" onClick={handleResetEyeFlow} className={`${PILL_BTN} ${IDLE_TONE}`}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("원본 복원", "Reset Strip")}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("시선 흐름 점수 · 패턴", "Eye-Flow Score · Pattern")}</div>
              <div data-testid="eyeflow-score-readout" className="mt-1 text-sm font-bold text-fg tabular-nums">{eyeFlowReport.flowScore} / 100 · {curvePatternLabel(eyeFlowReport.curvePattern, isEn)}</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("시선 역주행 (위쪽 점프)", "Reverse Backtracks")}</div>
              <div data-testid="eyeflow-reverse-count" className={`mt-1 text-sm font-bold tabular-nums ${eyeFlowReport.reverseJumpCount > 0 ? "text-bad" : "text-good"}`}>{eyeFlowReport.reverseJumpCount} {pick("건", "hit(s)")}</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("좌우 핑퐁 · 시선 막힘", "Ping-Pong · Dead Traps")}</div>
              <div data-testid="eyeflow-fatigue-count" className={`mt-1 text-sm font-bold tabular-nums ${eyeFlowReport.pingPongCount + eyeFlowReport.deadTrapCount > 0 ? "text-warn" : "text-good"}`}>{eyeFlowReport.pingPongCount} · {eyeFlowReport.deadTrapCount} {pick("건", "issue(s)")}</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("여백 처방 · 예상 읽기", "Gutter Fixes · Read Time")}</div>
              <div data-testid="eyeflow-gutter-count" className="mt-1 text-sm font-bold text-fg tabular-nums">{eyeFlowReport.gutterIssueCount}{pick("건", " fix")} · {eyeFlowReport.estimatedReadSeconds.toFixed(1)}s</div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-12">
            <div className="space-y-2 rounded-lg border border-line bg-card p-3 lg:col-span-5">
              <h3 className="text-xs font-semibold text-fg">{pick("세로 스크롤 Z·S커브 시선 궤적 및 처방 미리보기", "Vertical Scroll Z/S Eye-Flow Trajectory")}</h3>
              <svg data-testid="vertical-eyeflow-svg" viewBox="0 0 320 560" role="img" aria-label={pick("세로 스크롤 웹툰 컷 시선 흐름 경로도", "Vertical scroll webtoon eye-flow diagram")} className="mx-auto max-h-[460px] w-full rounded-lg border border-line bg-canvas">
                {eyeFlowReport.panels.map((p, idx) => {
                  const y = stripSvgLayout.padY + p.topY * stripSvgLayout.scaleY;
                  const h = p.height * stripSvgLayout.scaleY;
                  const isSel = p.panelId === activeGutterPanel?.panelId;
                  return (
                    <g key={p.panelId}>
                      <rect x={stripSvgLayout.padX} y={y} width={stripSvgLayout.drawW} height={h} rx={4} strokeWidth={isSel ? 1.8 : 1} className={isSel ? "fill-panel stroke-accent" : "fill-panel stroke-line"} />
                      <text x={stripSvgLayout.padX + 6} y={y + 13} className="fill-fg-3 text-[9px] font-semibold">{isEn ? p.titleEn : p.titleKo}</text>
                      {idx < eyeFlowReport.panels.length - 1 && (
                        <text x={stripSvgLayout.padX + stripSvgLayout.drawW - 6} y={y + h + Math.max(10, p.gutterAfterPx * stripSvgLayout.scaleY * 0.6)} textAnchor="end" className="fill-fg-3 text-[9px] tabular-nums">gutter {p.gutterAfterPx}px</text>
                      )}
                    </g>
                  );
                })}
                {stripSvgLayout.svgPathD && <path d={stripSvgLayout.svgPathD} fill="none" strokeWidth={2.2} className="stroke-accent" />}
                {eyeFlowReport.segments.map((seg) => {
                  if (!seg.isReverseBacktrack && !seg.isPingPongRisk && !seg.isDeadTrapLink) return null;
                  const fromPt = stripSvgLayout.scaledPoints.find((pt) => pt.panelId === seg.fromPanelId && pt.nodeId === seg.fromNodeId);
                  const toPt = stripSvgLayout.scaledPoints.find((pt) => pt.panelId === seg.toPanelId && pt.nodeId === seg.toNodeId);
                  if (!fromPt || !toPt) return null;
                  return <line key={JSON.stringify([seg.fromPanelId, seg.fromNodeId, seg.toPanelId, seg.toNodeId])} x1={fromPt.globalX} y1={fromPt.globalY} x2={toPt.globalX} y2={toPt.globalY} strokeDasharray="5 3" strokeWidth={2.4} className={seg.isReverseBacktrack ? "stroke-bad" : "stroke-warn"} />;
                })}
                {stripSvgLayout.scaledPoints.map((pt) => {
                  const hasDefect = eyeFlowReport.defects.some((d) => d.panelId === pt.panelId && d.nodeId === pt.nodeId);
                  return (
                    <g key={nodeKey(pt.panelId, pt.nodeId)}>
                      {pt.gazeVector && <line x1={pt.globalX} y1={pt.globalY} x2={pt.globalX + pt.gazeVector.dx * 28} y2={pt.globalY + pt.gazeVector.dy * 28} strokeWidth={1.8} className={hasDefect ? "stroke-bad" : "stroke-cool"} />}
                      <circle cx={pt.globalX} cy={pt.globalY} r={10} strokeWidth={1.8} className={hasDefect ? "fill-bad-soft stroke-bad" : "fill-good-soft stroke-good"} />
                      <text x={pt.globalX} y={pt.globalY + 3.5} textAnchor="middle" className="fill-fg text-[9px] font-bold">{pt.stepIndex + 1}</text>
                    </g>
                  );
                })}
              </svg>
              <p data-testid="eyeflow-summary-text" className="text-xs text-fg-2">{isEn ? eyeFlowReport.summaryEn : eyeFlowReport.summaryKo}</p>
            </div>

            <div className="space-y-3 rounded-lg border border-line bg-card p-3 lg:col-span-7">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-fg">{pick("시선 결함 진단 및 말풍선 앵커 이동(dx, dy) 처방", "Eye-Flow Defects & Balloon Anchor (dx, dy) Prescriptions")}</h3>
                {eyeFlowReport.defects.length === 0 ? (
                  <div data-testid="eyeflow-clean-banner" className="flex items-center gap-2 rounded-md border border-good bg-good-soft px-3 py-2 text-xs font-semibold text-good">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{pick("역주행·좌우 핑퐁·시선 막힘 0건 — 독자 스크롤 몰입도가 최적화되었습니다.", "Zero backtrack, ping-pong, or dead-trap defects — vertical flow is clean.")}</span>
                  </div>
                ) : (
                  <ul data-testid="eyeflow-defects-list" className="space-y-1.5">
                    {eyeFlowReport.defects.map((defect) => (
                      <li key={defect.defectId} className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs ${defect.severity === "critical" ? "border-bad bg-bad-soft text-bad" : "border-warn bg-warning-soft text-warn"}`}>
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <div><span className="font-bold">[{defectLabel(defect.kind, isEn)}]</span> <span>{isEn ? defect.messageEn : defect.messageKo}</span></div>
                      </li>
                    ))}
                  </ul>
                )}
                {eyeFlowReport.anchorPrescriptions.length > 0 && (
                  <ul data-testid="anchor-prescriptions-list" className="space-y-1.5">
                    {eyeFlowReport.anchorPrescriptions.map((rx) => (
                      <li key={nodeKey(rx.panelId, rx.nodeId)} className="rounded-md border border-line bg-raised px-2.5 py-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-fg">{isEn ? rx.labelEn : rx.labelKo}</span>
                          <span className="font-bold text-accent tabular-nums">dx {rx.dx >= 0 ? `+${rx.dx}` : rx.dx}px · dy {rx.dy >= 0 ? `+${rx.dy}` : rx.dy}px</span>
                        </div>
                        <p className="mt-1 text-[11px] text-fg-2">{isEn ? rx.reasonEn : rx.reasonKo}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2 border-t border-line pt-3">
                <h3 className="text-xs font-semibold text-fg">{pick("컷 간 세로 여백(Gutter) 연출 리듬 처방", "Panel Gutter Pacing Prescriptions")}</h3>
                <ul data-testid="gutter-prescriptions-list" className="space-y-1.5">
                  {eyeFlowReport.gutterPrescriptions.map((g) => (
                    <li key={g.panelId}>
                      <button
                        type="button" data-testid={`gutter-panel-btn-${g.panelId}`} onClick={() => setSelectedPanelId(g.panelId)}
                        className={`flex min-h-11 w-full cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors motion-reduce:transition-none ${FOCUS_RING} ${g.panelId === activeGutterPanel?.panelId ? ACTIVE_TONE : "border-line bg-raised text-fg"}`}
                      >
                        <div>
                          <div className="font-semibold">{isEn ? g.titleEn : g.titleKo} · {isEn ? GUTTER_PACING_RULES[g.pacingIntent].labelEn : GUTTER_PACING_RULES[g.pacingIntent].labelKo}</div>
                          <div className="text-[11px] text-fg-2">{isEn ? g.reasonEn : g.reasonKo}</div>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${g.status === "optimal" ? "border-good bg-good-soft text-good" : "border-warn bg-warning-soft text-warn"}`}>{g.currentGutterPx}px → {g.recommendedGutterPx}px</span>
                      </button>
                    </li>
                  ))}
                </ul>

                {activeGutterPanel && (
                  <div className="rounded-md border border-line bg-raised p-2.5">
                    <RangeSlider id={`${uid}-gutter-slider`} testId="slider-panel-gutter" readoutTestId="readout-panel-gutter" label={pick(`선택 컷 여백 조정 (${activeGutterPanel.titleKo})`, `Adjust Gutter (${activeGutterPanel.titleEn})`)} readout={`${activeGutterPanel.gutterAfterPx}px`} min={20} max={360} step={4} value={activeGutterPanel.gutterAfterPx} onChange={(val) => handleUpdatePanelGutter(activeGutterPanel.panelId, val)} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </fieldset>
    </section>
  );
}
