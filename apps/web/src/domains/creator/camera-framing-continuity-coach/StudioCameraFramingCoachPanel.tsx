/**
 * Wave 48B — 시선 동선·카메라 앵글 리프레이밍 어드바이저 스튜디오 패널.
 *
 * - 순수 시맨틱 SVG 2단 프리뷰: (좌) 180° 법칙 탑뷰 액션 축선·카메라 반구 다이어그램, (우) 9:16 세로 컷 고스트 프레임
 * - 5종 빠른 상황 프리셋(대화 맞대응·충격 반전·추격 코너·고백 클로즈업·군중 원경) + 180° 월선 시뮬레이션 토글
 * - 비파괴 Top-3 구도 고스트 가이드 카드(미리보기·적용·원복) + 초점거리(24~135mm)·틸트·롤 미세 조정 + JSON 내보내기
 * - Calm Atelier 시맨틱 토큰 및 비바이올렛 OKLCH/currentColor 전용(원시 색·광범위 트랜지션·브라우저 스토리지·장식 아이콘 미사용)
 */

import {
  AlertTriangle, Camera, Check, CheckCircle2, Code2, Compass, Copy,
  Eye, FlipHorizontal2, RotateCcw, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Undo2, User, Users,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  CAMERA_COACH_SCENE_PRESETS, DIALOGUE_TENSION_OPTIONS,
  FOCAL_LENGTH_MAX_MM, FOCAL_LENGTH_MIN_MM, GAZE_DIRECTION_OPTIONS,
  PITCH_MAX_DEG, PITCH_MIN_DEG, ROLL_MAX_DEG, ROLL_MIN_DEG,
  SHOT_SCALE_OPTIONS, SUBJECT_SIDE_OPTIONS,
  applyCameraProposal, createCameraCoachSession, exportCameraRigJson,
  getCameraCoachScenePreset, previewCameraProposal, proposeCameraFramingsTop3,
  resetCameraRigFineTune, resolveEffectiveCameraView, revertCameraProposal,
  toggleAxisCrossSimulation, updateCameraRigFineTune,
  type CameraCoachScenePresetId, type CameraCoachSessionState,
  type CameraFramingCoachInput, type CameraFramingProposal,
  type ContinuityStatus, type DialogueTension,
  type ResolvedCameraCoachView, type SpeakerCount,
} from "./camera-framing-coach-engine";

export interface StudioCameraFramingCoachPanelProps {
  readonly initialSceneId?: CameraCoachScenePresetId;
  readonly initialTension?: DialogueTension;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApply?: (proposal: CameraFramingProposal, session: CameraCoachSessionState) => void;
  readonly onRevert?: (session: CameraCoachSessionState) => void;
  readonly onExportJson?: (json: string, session: CameraCoachSessionState) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const BTN_DANGER = `${BTN_BASE} border border-bad bg-bad-soft px-3 py-2 text-bad`;

/** 모든 휴(Hue)가 바이올렛 대역(270~320°) 밖인 순수 OKLCH SVG 팔레트. */
const SVG_OKLCH = {
  paper: "oklch(0.97 0.008 85)",
  surface: "oklch(0.93 0.012 82)",
  safeFill: "oklch(0.66 0.13 158 / 0.16)",
  safeStroke: "oklch(0.50 0.14 158)",
  badFill: "oklch(0.58 0.18 26 / 0.16)",
  badStroke: "oklch(0.52 0.19 26)",
  warnFill: "oklch(0.72 0.14 72 / 0.18)",
  warnStroke: "oklch(0.62 0.15 72)",
  cameraBlue: "oklch(0.50 0.14 232)",
  cameraBlueSoft: "oklch(0.56 0.13 232 / 0.18)",
  axisAmber: "oklch(0.58 0.16 36)",
  goldenGuide: "oklch(0.64 0.12 68 / 0.55)",
  prevMuted: "oklch(0.54 0.03 240)",
} as const;

const signedDeg = (value: number): string => `${Math.round(value) > 0 ? "+" : ""}${Math.round(value)}°`;
const statusBadgeClass = (status: ContinuityStatus): string =>
  status === "axis-crossed" ? "border-bad bg-bad-soft text-bad"
    : status === "warning" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
const statusStrokeOklch = (status: ContinuityStatus): string =>
  status === "axis-crossed" ? SVG_OKLCH.badStroke : status === "warning" ? SVG_OKLCH.warnStroke : SVG_OKLCH.safeStroke;
const statusFillOklch = (status: ContinuityStatus): string =>
  status === "axis-crossed" ? SVG_OKLCH.badFill : status === "warning" ? SVG_OKLCH.warnFill : SVG_OKLCH.safeFill;

function OptionButtonGroup<T extends string>(props: {
  readonly options: readonly { readonly id: T; readonly labelKo: string; readonly labelEn: string }[];
  readonly activeId: T;
  readonly testIdPrefix: string;
  readonly isEn: boolean;
  readonly onSelect: (id: T) => void;
}): ReactElement {
  const { options, activeId, testIdPrefix, isEn, onSelect } = props;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = activeId === opt.id;
        return (
          <button
            key={opt.id} type="button" data-testid={`${testIdPrefix}-${opt.id}`}
            aria-pressed={active} onClick={() => onSelect(opt.id)}
            className={active ? BTN_ACTIVE : BTN_OUTLINE}
          >
            {isEn ? opt.labelEn : opt.labelKo}
          </button>
        );
      })}
    </div>
  );
}

function SliderControlRow(props: {
  readonly id: string; readonly testId: string; readonly readoutTestId: string;
  readonly label: string; readonly readout: string;
  readonly min: number; readonly max: number; readonly value: number;
  readonly onChange: (value: number) => void;
}): ReactElement {
  const { id, testId, readoutTestId, label, readout, min, max, value, onChange } = props;
  return (
    <div className="space-y-0.5">
      <label htmlFor={id} className="flex items-center justify-between text-xs font-medium text-fg-2 [word-break:keep-all]">
        <span>{label}</span>
        <span data-testid={readoutTestId} className="font-mono font-bold text-fg tabular-nums">{readout}</span>
      </label>
      <input
        id={id} data-testid={testId} type="range" min={min} max={max} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 w-full cursor-pointer accent-accent"
      />
    </div>
  );
}

function TopView180AxisSvg(props: {
  readonly view: ResolvedCameraCoachView; readonly speakerCount: SpeakerCount; readonly isEn: boolean;
}): ReactElement {
  const { view, speakerCount, isEn } = props;
  const audit = view.continuityAudit;
  const cx = 130, cy = 112, r = 74, camR = 64;
  const safeIsFront = audit.prevHemisphere !== "back";
  const prevRad = (audit.prevYawDeg * Math.PI) / 180;
  const nextRad = (audit.nextYawDeg * Math.PI) / 180;
  const prevX = Math.round((cx + camR * Math.cos(prevRad)) * 10) / 10;
  const prevY = Math.round((cy + camR * Math.sin(prevRad)) * 10) / 10;
  const nextX = Math.round((cx + camR * Math.cos(nextRad)) * 10) / 10;
  const nextY = Math.round((cy + camR * Math.sin(nextRad)) * 10) / 10;

  // 화각(FOV) 콘 폭은 초점거리(24~135mm)에 반비례
  const fovHalfRad = (((36 - ((view.rig.focalLengthMm - FOCAL_LENGTH_MIN_MM) / (FOCAL_LENGTH_MAX_MM - FOCAL_LENGTH_MIN_MM)) * 24) * Math.PI) / 180);
  const coneLen = 44;
  const toCenter = Math.atan2(cy - nextY, cx - nextX);
  const c1x = Math.round((nextX + coneLen * Math.cos(toCenter - fovHalfRad)) * 10) / 10;
  const c1y = Math.round((nextY + coneLen * Math.sin(toCenter - fovHalfRad)) * 10) / 10;
  const c2x = Math.round((nextX + coneLen * Math.cos(toCenter + fovHalfRad)) * 10) / 10;
  const c2y = Math.round((nextY + coneLen * Math.sin(toCenter + fovHalfRad)) * 10) / 10;

  const activeStroke = statusStrokeOklch(audit.status);
  const activeFill = statusFillOklch(audit.status);
  const statusTag = audit.status === "axis-crossed"
    ? (isEn ? "180° CROSSED" : "180° 월선")
    : audit.status === "warning" ? (isEn ? "AXIS CAUTION" : "축선 주의") : (isEn ? "180° SAFE" : "180° 유지");

  return (
    <svg
      data-testid="camera-topview-svg" data-continuity-status={audit.status}
      data-prev-yaw={audit.prevYawDeg} data-next-yaw={audit.nextYawDeg} data-axis-crossed={String(audit.hemisphereCrossed)}
      viewBox="0 0 260 228" className="h-auto w-full rounded-xl border border-line bg-canvas text-fg" role="img"
      aria-label={isEn ? "180-degree action axis top-view camera hemisphere diagram" : "180도 법칙 탑뷰 액션 축선 및 카메라 반구 다이어그램"}
    >
      <rect x="0" y="0" width="260" height="228" rx="10" fill={SVG_OKLCH.paper} />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z`} fill={safeIsFront ? SVG_OKLCH.badFill : SVG_OKLCH.safeFill} />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy} Z`} fill={safeIsFront ? SVG_OKLCH.safeFill : SVG_OKLCH.badFill} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity={0.28} strokeWidth="1.2" />

      <line x1="22" y1={cy} x2="238" y2={cy} stroke={SVG_OKLCH.axisAmber} strokeWidth="2" strokeDasharray="6 4" />
      <text x="26" y={cy - 6} fill={SVG_OKLCH.axisAmber} fontSize="8.5" fontWeight="700" fontFamily="monospace">180° AXIS</text>
      <text x="234" y={cy - 6} textAnchor="end" fill={SVG_OKLCH.axisAmber} fontSize="8.5" fontWeight="700" fontFamily="monospace">0°</text>

      <text x={cx} y="24" textAnchor="middle" fill={safeIsFront ? SVG_OKLCH.badStroke : SVG_OKLCH.safeStroke} fontSize="9.5" fontWeight="700">
        {safeIsFront ? (isEn ? "CROSSED ZONE (180° VIOLATION)" : "월선 금지 반구") : (isEn ? "ACTIVE 180° SAFE ZONE" : "180° 안전 반구")}
      </text>
      <text x={cx} y="200" textAnchor="middle" fill={safeIsFront ? SVG_OKLCH.safeStroke : SVG_OKLCH.badStroke} fontSize="9.5" fontWeight="700">
        {safeIsFront ? (isEn ? "ACTIVE 180° SAFE ZONE" : "180° 안전 반구") : (isEn ? "CROSSED ZONE (180° VIOLATION)" : "월선 금지 반구")}
      </text>

      {speakerCount === 2 ? (
        <g>
          <circle cx="94" cy={cy} r="9" fill={SVG_OKLCH.surface} stroke="currentColor" strokeWidth="1.8" />
          <text x="94" y={cy + 3} textAnchor="middle" fill="currentColor" fontSize="8.5" fontWeight="700">A</text>
          <circle cx="166" cy={cy} r="9" fill={SVG_OKLCH.surface} stroke="currentColor" strokeWidth="1.8" />
          <text x="166" y={cy + 3} textAnchor="middle" fill="currentColor" fontSize="8.5" fontWeight="700">B</text>
        </g>
      ) : (
        <g>
          <circle cx={cx} cy={cy} r="10" fill={SVG_OKLCH.surface} stroke="currentColor" strokeWidth="1.8" />
          <text x={cx} y={cy + 3} textAnchor="middle" fill="currentColor" fontSize="8.5" fontWeight="700">S</text>
        </g>
      )}

      <line x1={prevX} y1={prevY} x2={cx} y2={cy} stroke={SVG_OKLCH.prevMuted} strokeWidth="1.2" strokeDasharray="3 3" />
      <circle cx={prevX} cy={prevY} r="6.5" fill={SVG_OKLCH.surface} stroke={SVG_OKLCH.prevMuted} strokeWidth="1.8" />
      <text x={prevX} y={prevY - 10} textAnchor="middle" fill={SVG_OKLCH.prevMuted} fontSize="8" fontWeight="700" fontFamily="monospace">
        {`PREV ${signedDeg(audit.prevYawDeg)}`}
      </text>

      <polygon points={`${nextX},${nextY} ${c1x},${c1y} ${c2x},${c2y}`} fill={activeFill} stroke={activeStroke} strokeWidth="1.2" />
      <circle cx={nextX} cy={nextY} r="7.5" fill={activeStroke} />
      <circle cx={nextX} cy={nextY} r="2.6" fill={SVG_OKLCH.paper} />
      <text x={nextX} y={nextY + 17} textAnchor="middle" fill={activeStroke} fontSize="8.5" fontWeight="800" fontFamily="monospace">
        {`NOW ${signedDeg(audit.nextYawDeg)}`}
      </text>

      <rect x="10" y="206" width="240" height="16" rx="4" fill={SVG_OKLCH.surface} />
      <text x="16" y="217" fill="currentColor" fontSize="8.5" fontWeight="700" fontFamily="monospace">
        {`Δ${signedDeg(audit.yawDeltaDeg)} · ${view.rig.focalLengthMm}mm`}
      </text>
      <text x="244" y="217" textAnchor="end" fill={activeStroke} fontSize="8.5" fontWeight="800">{statusTag}</text>
    </svg>
  );
}

function VerticalCutGhostFrameSvg(props: {
  readonly view: ResolvedCameraCoachView; readonly clipId: string; readonly isEn: boolean;
}): ReactElement {
  const { view, clipId, isEn } = props;
  const fx = 14, fy = 12, fw = 152, fh = 270;
  const mapX = (nx: number): number => Math.round((fx + nx * fw) * 10) / 10;
  const mapY = (ny: number): number => Math.round((fy + ny * fh) * 10) / 10;

  const horizonY = mapY(Math.min(0.8, Math.max(0.2, 0.5 - view.rig.pitchDeg / 90)));
  const centerX = fx + fw / 2;
  const tx = mapX(view.thirdsIntersection.x), ty = mapY(view.thirdsIntersection.y);
  const gx1 = mapX(view.gazeVector.fromX), gy1 = mapY(view.gazeVector.fromY);
  const gx2 = mapX(view.gazeVector.toX), gy2 = mapY(view.gazeVector.toY);
  const gAngle = Math.atan2(gy2 - gy1, gx2 - gx1);
  const ah1x = Math.round((gx2 - 9 * Math.cos(gAngle - 0.45)) * 10) / 10;
  const ah1y = Math.round((gy2 - 9 * Math.sin(gAngle - 0.45)) * 10) / 10;
  const ah2x = Math.round((gx2 - 9 * Math.cos(gAngle + 0.45)) * 10) / 10;
  const ah2y = Math.round((gy2 - 9 * Math.sin(gAngle + 0.45)) * 10) / 10;
  const gazeStroke = view.continuityAudit.status === "axis-crossed" ? SVG_OKLCH.badStroke : SVG_OKLCH.cameraBlue;

  return (
    <svg
      data-testid="camera-frame-ghost-svg" data-framing-type={view.framingType}
      data-focal-mm={view.rig.focalLengthMm} data-pitch-deg={view.rig.pitchDeg}
      data-roll-deg={view.rig.rollDeg} data-subject-side={view.subjectSide}
      viewBox="0 0 180 318" className="mx-auto h-auto w-full max-w-[196px] rounded-xl border border-line bg-canvas text-fg" role="img"
      aria-label={isEn ? "9:16 vertical cut ghost framing guide" : "9:16 세로 컷 고스트 프레임 가이드"}
    >
      <defs>
        <clipPath id={clipId}><rect x={fx} y={fy} width={fw} height={fh} rx="8" /></clipPath>
      </defs>
      <rect x="0" y="0" width="180" height="318" rx="10" fill={SVG_OKLCH.paper} />
      <rect x={fx} y={fy} width={fw} height={fh} rx="8" fill={SVG_OKLCH.surface} stroke="currentColor" strokeOpacity={0.35} strokeWidth="1.5" />

      <g clipPath={`url(#${clipId})`}>
        {[1 / 3, 2 / 3].map((ratio) => (
          <g key={`thirds-${ratio}`}>
            <line x1={mapX(ratio)} y1={fy} x2={mapX(ratio)} y2={fy + fh} stroke="currentColor" strokeOpacity={0.22} strokeWidth="1" strokeDasharray="4 4" />
            <line x1={fx} y1={mapY(ratio)} x2={fx + fw} y2={mapY(ratio)} stroke="currentColor" strokeOpacity={0.22} strokeWidth="1" strokeDasharray="4 4" />
          </g>
        ))}
        {[0.382, 0.618].map((ratio) => (
          <g key={`gold-${ratio}`}>
            <line x1={mapX(ratio)} y1={fy} x2={mapX(ratio)} y2={fy + fh} stroke={SVG_OKLCH.goldenGuide} strokeWidth="0.9" strokeDasharray="2 5" />
            <line x1={fx} y1={mapY(ratio)} x2={fx + fw} y2={mapY(ratio)} stroke={SVG_OKLCH.goldenGuide} strokeWidth="0.9" strokeDasharray="2 5" />
          </g>
        ))}

        <g transform={`rotate(${view.rig.rollDeg} ${centerX} ${horizonY})`}>
          <line
            x1={fx - 36} y1={horizonY} x2={fx + fw + 36} y2={horizonY}
            stroke={view.rig.rollDeg !== 0 ? SVG_OKLCH.warnStroke : SVG_OKLCH.axisAmber}
            strokeWidth={view.rig.rollDeg !== 0 ? "1.8" : "1.2"}
            strokeDasharray={view.rig.rollDeg !== 0 ? "7 3" : "5 5"}
          />
          <text x={fx + 8} y={horizonY - 4} fill={SVG_OKLCH.axisAmber} fontSize="7.5" fontWeight="700" fontFamily="monospace">
            {view.rig.rollDeg !== 0 ? `DUTCH ${signedDeg(view.rig.rollDeg)}` : "HORIZON"}
          </text>
        </g>

        <g transform={`rotate(${Math.round(view.rig.rollDeg * 0.45)} ${centerX} ${fy + fh / 2})`}>
          {view.subjectAnchors.map((anchor) => {
            const ax = mapX(anchor.x), ay = mapY(anchor.y);
            const headR = Math.round(anchor.headRadiusNorm * fw * 10) / 10;
            const shoulderW = Math.round(headR * 2.55 * 10) / 10;
            const torsoH = Math.round(headR * 3.8 * 10) / 10;
            const isPrimary = anchor.role === "primary";
            const isShoulder = anchor.role === "foreground-shoulder";
            return (
              <g key={anchor.id} data-anchor-role={anchor.role}>
                <path
                  d={`M ${ax - shoulderW} ${ay + headR + torsoH} Q ${ax - shoulderW} ${ay + headR * 1.25} ${ax} ${ay + headR * 1.1} Q ${ax + shoulderW} ${ay + headR * 1.25} ${ax + shoulderW} ${ay + headR + torsoH} Z`}
                  fill={isPrimary ? SVG_OKLCH.cameraBlueSoft : "currentColor"} fillOpacity={isShoulder ? 0.24 : isPrimary ? 0.9 : 0.14}
                  stroke={isPrimary ? gazeStroke : "currentColor"} strokeOpacity={isPrimary ? 0.9 : 0.4} strokeWidth={isPrimary ? "1.6" : "1.2"}
                />
                <circle
                  cx={ax} cy={ay} r={headR}
                  fill={isPrimary ? SVG_OKLCH.paper : SVG_OKLCH.surface} fillOpacity={isShoulder ? 0.72 : 0.95}
                  stroke={isPrimary ? gazeStroke : "currentColor"} strokeOpacity={isPrimary ? 0.95 : 0.45} strokeWidth={isPrimary ? "1.8" : "1.2"}
                />
                <text x={ax} y={ay + 3} textAnchor="middle" fill={isPrimary ? gazeStroke : "currentColor"} fontSize="7.5" fontWeight="700">
                  {isPrimary ? "A" : isShoulder ? "OTS" : "B"}
                </text>
              </g>
            );
          })}
        </g>

        <circle cx={tx} cy={ty} r="6" fill="none" stroke={SVG_OKLCH.axisAmber} strokeWidth="1.4" />
        <circle cx={tx} cy={ty} r="2" fill={SVG_OKLCH.axisAmber} />
        <line x1={gx1} y1={gy1} x2={gx2} y2={gy2} stroke={gazeStroke} strokeWidth="2.2" strokeLinecap="round" />
        <polygon points={`${gx2},${gy2} ${ah1x},${ah1y} ${ah2x},${ah2y}`} fill={gazeStroke} />
      </g>

      <rect x={fx} y="290" width={fw} height="20" rx="5" fill={SVG_OKLCH.surface} stroke="currentColor" strokeOpacity={0.18} strokeWidth="1" />
      <text x={fx + 6} y="303" fill="currentColor" fontSize="8" fontWeight="700" fontFamily="monospace">
        {`${view.rig.focalLengthMm}mm · P${signedDeg(view.rig.pitchDeg)} · R${signedDeg(view.rig.rollDeg)}`}
      </text>
      <text x={fx + fw - 6} y="303" textAnchor="end" fill={gazeStroke} fontSize="8" fontWeight="800">9:16</text>
    </svg>
  );
}

/** 시선 동선·180° 법칙·카메라 앵글 리프레이밍 어드바이저 스튜디오 패널. */
export function StudioCameraFramingCoachPanel(props: StudioCameraFramingCoachPanelProps): ReactElement {
  const { initialSceneId, initialTension, locale = "ko", className, onApply, onRevert, onExportJson } = props;
  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const initialPreset = getCameraCoachScenePreset(initialSceneId);
  const [sceneId, setSceneId] = useState<CameraCoachScenePresetId>(initialPreset.id);
  const [input, setInput] = useState<CameraFramingCoachInput>(() => ({
    ...initialPreset.input, ...(initialTension ? { dialogueTension: initialTension } : {}),
  }));
  const [session, setSession] = useState<CameraCoachSessionState>(() =>
    createCameraCoachSession({
      shotScale: initialPreset.input.prevShotScale, subjectSide: initialPreset.input.prevSubjectSide,
      gazeDirection: initialPreset.input.prevGazeDirection,
      rig: { focalLengthMm: 50, yawDeg: initialPreset.input.prevCameraYawDeg, pitchDeg: 0, rollDeg: 0 },
    }),
  );
  const [showJson, setShowJson] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const top3 = useMemo(() => proposeCameraFramingsTop3(input), [input]);
  const activeView = useMemo(() => resolveEffectiveCameraView(input, top3, session), [input, top3, session]);
  const jsonText = useMemo(() => exportCameraRigJson({ sceneId, input, session, activeView, top3 }), [sceneId, input, session, activeView, top3]);

  const handleSelectPreset = (nextId: CameraCoachScenePresetId): void => {
    const preset = getCameraCoachScenePreset(nextId);
    setSceneId(preset.id);
    setInput(preset.input);
    setSession(createCameraCoachSession({
      shotScale: preset.input.prevShotScale, subjectSide: preset.input.prevSubjectSide,
      gazeDirection: preset.input.prevGazeDirection,
      rig: { focalLengthMm: 50, yawDeg: preset.input.prevCameraYawDeg, pitchDeg: 0, rollDeg: 0 },
    }));
    setStatusMessage(pick(`'${preset.labelKo}' 상황 프리셋을 불러왔습니다.`, `Loaded '${preset.labelEn}' scene preset.`));
  };

  const handleTogglePreview = (proposal: CameraFramingProposal): void => {
    const next = previewCameraProposal(session, proposal.id);
    setSession(next);
    setStatusMessage(
      next.previewingProposalId
        ? pick(`'${proposal.titleKo}' 고스트 가이드를 미리보기 중입니다(원본 미변경).`, `Previewing '${proposal.titleEn}' guide (uncommitted).`)
        : pick("미리보기를 해제했습니다.", "Cleared preview."),
    );
  };

  const handleApplyProposal = (proposal: CameraFramingProposal): void => {
    const next = applyCameraProposal(session, proposal);
    setSession(next);
    onApply?.(proposal, next);
    setStatusMessage(pick(`'${proposal.titleKo}' 구도를 현재 컷에 적용했습니다. 언제든 원복할 수 있습니다.`, `Applied '${proposal.titleEn}' to current cut.`));
  };

  const handleRevert = (): void => {
    const next = revertCameraProposal(session);
    setSession(next);
    onRevert?.(next);
    setStatusMessage(pick("적용한 카메라 구도를 원본 컷으로 되돌렸습니다.", "Reverted camera framing to original cut."));
  };

  const handleToggleAxisCross = (): void => {
    const next = toggleAxisCrossSimulation(session);
    setSession(next);
    setStatusMessage(
      next.simulateAxisCross
        ? pick("180° 월선 시뮬레이션을 켰습니다. 반대 반구 경고와 좌우 반전을 확인하세요.", "Enabled 180° axis-crossing simulation.")
        : pick("180° 월선 시뮬레이션을 끄고 안전 반구로 복귀했습니다.", "Disabled 180° axis-crossing simulation."),
    );
  };

  const handleAutoFixAxis = (): void => {
    const safeYaw = activeView.continuityAudit.recommendedSafeYawDeg;
    setSession(updateCameraRigFineTune(toggleAxisCrossSimulation(session, false), { yawDeg: safeYaw }));
    setStatusMessage(pick(`방위각을 ${signedDeg(safeYaw)} 안전 반구로 보정했습니다.`, `Corrected yaw to safe hemisphere (${signedDeg(safeYaw)}).`));
  };

  const handleExportJson = (): void => {
    setShowJson(true);
    onExportJson?.(jsonText, session);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(jsonText).catch(() => undefined);
    }
    setStatusMessage(pick("카메라 릭 JSON을 생성했습니다.", "Exported camera rig JSON."));
  };

  const hasActivePreview = Boolean(session.previewingProposalId && top3.some((p) => p.id === session.previewingProposalId));
  const effectiveSessionStatus =
    session.status === "previewing" && !hasActivePreview
      ? (session.appliedProposalId ? "applied" : session.historyCount > 0 ? "reverted" : "idle")
      : session.status;
  const sessionStatusLabel =
    effectiveSessionStatus === "previewing" ? pick("미리보기 중", "Previewing")
      : effectiveSessionStatus === "applied" ? pick("적용됨", "Applied")
        : effectiveSessionStatus === "reverted" ? pick("원복됨", "Reverted") : pick("대기(원본 유지)", "Idle (Original)");

  const audit = activeView.continuityAudit;
  const auditLabel =
    audit.status === "axis-crossed" ? pick("180° 월선 감지", "180° Axis Crossed")
      : audit.status === "warning" ? pick("축선 경계 주의", "Axis Warning") : pick("180° 법칙 안전", "180° Safe");

  return (
    <section
      data-testid="studio-camera-framing-coach-panel"
      className={`rounded-2xl border border-line bg-card p-5 text-fg shadow-sm ${className ?? ""}`.trim()}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Camera className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
              {pick("시선 동선·카메라 앵글 리프레이밍 어드바이저", "Camera Framing & 180° Continuity Coach")}
            </h2>
            <span data-testid="camera-approval-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good [word-break:keep-all]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("작가 승인 후 적용", "Author Approval Required")}
            </span>
            <span data-testid="camera-session-status-badge" className="inline-flex items-center rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2 [word-break:keep-all]">
              {sessionStatusLabel}
            </span>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "직전 컷 시선 축과 180° 법칙을 기준으로 월선 위험을 감지하고, 대사 긴장도에 맞는 Top-3 비파괴 구도 가이드를 제안합니다.",
              "Detects 180° action-axis violations from the prior cut and proposes Top-3 non-destructive camera framing guides.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="camera-revert-btn" disabled={!session.appliedProposalId} onClick={handleRevert} className={BTN_OUTLINE}>
            <Undo2 className="h-4 w-4" aria-hidden="true" />{pick("원본 되돌리기", "Revert Cut")}
          </button>
          <button type="button" data-testid="camera-copy-json-btn" onClick={handleExportJson} className={BTN_SOLID}>
            <Copy className="h-4 w-4" aria-hidden="true" />{pick("JSON 내보내기", "Export JSON")}
          </button>
          <button type="button" data-testid="camera-toggle-json-btn" aria-expanded={showJson} onClick={() => setShowJson((prev) => !prev)} className={BTN_OUTLINE}>
            <Code2 className="h-4 w-4" aria-hidden="true" />{showJson ? pick("JSON 닫기", "Hide JSON") : pick("JSON 보기", "View JSON")}
          </button>
        </div>
      </header>

      <div className="mt-4 space-y-2">
        <div className="text-xs font-semibold text-fg-2 [word-break:keep-all]">{pick("상황 프리셋 5종", "5 Quick Scene Presets")}</div>
        <OptionButtonGroup options={CAMERA_COACH_SCENE_PRESETS} activeId={sceneId} testIdPrefix="camera-preset" isEn={isEn} onSelect={handleSelectPreset} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-raised p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                <Compass className="h-4 w-4 text-accent" aria-hidden="true" />
                <span data-testid="camera-active-view-label">{isEn ? activeView.labelEn : activeView.labelKo}</span>
              </div>
              <button type="button" data-testid="camera-simulate-cross-btn" aria-pressed={session.simulateAxisCross} onClick={handleToggleAxisCross} className={session.simulateAxisCross ? BTN_DANGER : BTN_OUTLINE}>
                <FlipHorizontal2 className="h-4 w-4" aria-hidden="true" />
                {session.simulateAxisCross ? pick("월선 시뮬레이션 해제", "Stop 180° Cross Sim") : pick("180° 월선 시뮬레이션", "Simulate 180° Cross")}
              </button>
            </div>

            <div className="grid items-center gap-4 sm:grid-cols-[1.25fr_0.9fr]">
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("탑뷰 · 180° 액션 축선 & 카메라 반구", "Top View · 180° Action Axis & Hemispheres")}</div>
                <TopView180AxisSvg view={activeView} speakerCount={input.speakerCount} isEn={isEn} />
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("9:16 세로 컷 · 고스트 프레임 가이드", "9:16 Vertical Cut · Ghost Frame Guide")}</div>
                <VerticalCutGhostFrameSvg view={activeView} clipId={`${uid}-frame-clip`} isEn={isEn} />
              </div>
            </div>
          </div>

          <div data-testid="camera-continuity-banner" data-status={audit.status} className={`rounded-xl border p-3.5 ${statusBadgeClass(audit.status)}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold [word-break:keep-all]">
                {audit.status === "axis-crossed" ? <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  : audit.status === "warning" ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                <span data-testid="camera-continuity-status-text">{auditLabel}</span>
                <span className="font-mono text-[11px] tabular-nums">{`PREV ${signedDeg(audit.prevYawDeg)} → NOW ${signedDeg(audit.nextYawDeg)} (Δ${audit.absYawDeltaDeg}°)`}</span>
              </div>
              {audit.status !== "safe" ? (
                <button type="button" data-testid="camera-auto-fix-axis-btn" onClick={handleAutoFixAxis} className={BTN_SOLID}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {pick(`안전 반구(${signedDeg(audit.recommendedSafeYawDeg)})로 보정`, `Fix to Safe (${signedDeg(audit.recommendedSafeYawDeg)})`)}
                </button>
              ) : null}
            </div>
            <p data-testid="camera-continuity-reason" className="mt-1.5 text-xs leading-relaxed [word-break:keep-all]">{isEn ? audit.reasonEn : audit.reasonKo}</p>
            <p className="mt-1 text-[11px] opacity-90 [word-break:keep-all]">{isEn ? audit.correctionHintEn : audit.correctionHintKo}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
            <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("직전 컷 기준 상태", "Previous Cut Reference")}</div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-fg-2">{pick("직전 피사체 위치", "Prev Subject Side")}</div>
                <OptionButtonGroup options={SUBJECT_SIDE_OPTIONS} activeId={input.prevSubjectSide} testIdPrefix="camera-prev-side" isEn={isEn} onSelect={(id) => setInput((prev) => ({ ...prev, prevSubjectSide: id }))} />
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-fg-2">{pick("직전 시선 방향", "Prev Gaze Direction")}</div>
                <OptionButtonGroup options={GAZE_DIRECTION_OPTIONS} activeId={input.prevGazeDirection} testIdPrefix="camera-prev-gaze" isEn={isEn} onSelect={(id) => setInput((prev) => ({ ...prev, prevGazeDirection: id }))} />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-fg-2">{pick("직전 샷 스케일", "Prev Shot Scale")}</div>
              <OptionButtonGroup options={SHOT_SCALE_OPTIONS} activeId={input.prevShotScale} testIdPrefix="camera-prev-scale" isEn={isEn} onSelect={(id) => setInput((prev) => ({ ...prev, prevShotScale: id }))} />
            </div>
            <SliderControlRow
              id={`${uid}-prev-yaw`} testId="camera-prev-yaw-slider" readoutTestId="camera-prev-yaw-readout"
              label={pick("직전 카메라 방위각 (Yaw)", "Prev Camera Yaw")} readout={signedDeg(input.prevCameraYawDeg)}
              min={-165} max={165} value={input.prevCameraYawDeg}
              onChange={(val) => setInput((prev) => ({ ...prev, prevCameraYawDeg: val }))}
            />
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-fg [word-break:keep-all]">{pick("현재 컷 연출 의도", "Current Cut Intent")}</span>
              <div className="flex items-center gap-1.5">
                <button type="button" data-testid="camera-speaker-1" aria-pressed={input.speakerCount === 1} onClick={() => setInput((prev) => ({ ...prev, speakerCount: 1 }))} className={input.speakerCount === 1 ? BTN_ACTIVE : BTN_OUTLINE}>
                  <User className="h-3.5 w-3.5" aria-hidden="true" />{pick("1인 컷", "Solo")}
                </button>
                <button type="button" data-testid="camera-speaker-2" aria-pressed={input.speakerCount === 2} onClick={() => setInput((prev) => ({ ...prev, speakerCount: 2 }))} className={input.speakerCount === 2 ? BTN_ACTIVE : BTN_OUTLINE}>
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />{pick("2인 대화", "2 Speakers")}
                </button>
              </div>
            </div>
            <OptionButtonGroup options={DIALOGUE_TENSION_OPTIONS} activeId={input.dialogueTension} testIdPrefix="camera-tension" isEn={isEn} onSelect={(id) => setInput((prev) => ({ ...prev, dialogueTension: id }))} />
            <div className="space-y-1">
              <label htmlFor={`${uid}-dialogue`} className="block text-[11px] font-medium text-fg-2 [word-break:keep-all]">{pick("현재 컷 대사", "Current Cut Dialogue")}</label>
              <input
                id={`${uid}-dialogue`} data-testid="camera-dialogue-input" type="text" value={input.dialogueText}
                onChange={(e) => setInput((prev) => ({ ...prev, dialogueText: e.target.value }))}
                placeholder={pick("대사를 입력하면 구도 적합도가 즉시 갱신됩니다.", "Enter dialogue to score framing guides...")}
                className={`min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg ${FOCUS_RING}`}
              />
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border border-line bg-raised p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("렌즈·앵글 미세 조정", "Lens & Angle Fine-Tune")}
              </div>
              <button type="button" data-testid="camera-reset-finetune-btn" onClick={() => setSession((prev) => resetCameraRigFineTune(prev))} className={BTN_OUTLINE}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{pick("조정 초기화", "Reset")}
              </button>
            </div>
            <SliderControlRow
              id={`${uid}-focal`} testId="camera-focal-slider" readoutTestId="camera-focal-readout"
              label={pick("초점거리 (24~135mm)", "Focal Length (24–135mm)")} readout={`${activeView.rig.focalLengthMm}mm`}
              min={FOCAL_LENGTH_MIN_MM} max={FOCAL_LENGTH_MAX_MM} value={activeView.rig.focalLengthMm}
              onChange={(val) => setSession((prev) => updateCameraRigFineTune(prev, { focalLengthMm: val }))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <SliderControlRow
                id={`${uid}-pitch`} testId="camera-pitch-slider" readoutTestId="camera-pitch-readout"
                label={pick("틸트 · 피치", "Tilt (Pitch)")} readout={signedDeg(activeView.rig.pitchDeg)}
                min={PITCH_MIN_DEG} max={PITCH_MAX_DEG} value={activeView.rig.pitchDeg}
                onChange={(val) => setSession((prev) => updateCameraRigFineTune(prev, { pitchDeg: val }))}
              />
              <SliderControlRow
                id={`${uid}-roll`} testId="camera-roll-slider" readoutTestId="camera-roll-readout"
                label={pick("롤 · 더치 기울기", "Roll (Dutch)")} readout={signedDeg(activeView.rig.rollDeg)}
                min={ROLL_MIN_DEG} max={ROLL_MAX_DEG} value={activeView.rig.rollDeg}
                onChange={(val) => setSession((prev) => updateCameraRigFineTune(prev, { rollDeg: val }))}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick("비파괴 Top-3 구도 고스트 가이드", "Top-3 Non-Destructive Framing Guides")}</h3>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("모든 제안안은 180° 안전 반구를 유지합니다.", "Every proposal preserves the active 180° safe hemisphere.")}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {top3.map((proposal) => {
            const isPreviewing = session.previewingProposalId === proposal.id;
            const isApplied = session.appliedProposalId === proposal.id;
            return (
              <article
                key={proposal.id} data-testid={`camera-proposal-card-${proposal.rank}`} data-framing-type={proposal.framingType}
                className={`flex flex-col justify-between rounded-xl border p-4 transition-colors motion-reduce:transition-none ${
                  isApplied ? "border-accent bg-accent-soft/40" : isPreviewing ? "border-cool bg-info-soft/40" : "border-line bg-raised"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-card px-2 py-0.5 font-mono text-[11px] font-bold text-accent tabular-nums">{`#${proposal.rank} · ${proposal.score}%`}</span>
                    <span className="rounded-full border border-good bg-good-soft px-2 py-0.5 text-[10px] font-semibold text-good">{isEn ? proposal.badgeEn : proposal.badgeKo}</span>
                  </div>
                  <h4 className="text-sm font-bold text-fg [word-break:keep-all]">{isEn ? proposal.titleEn : proposal.titleKo}</h4>
                  <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-card p-2 font-mono text-[11px] text-fg-2 tabular-nums">
                    <span>{`Lens ${proposal.focalLengthMm}mm`}</span>
                    <span>{`Yaw ${signedDeg(proposal.cameraRig.yawDeg)}`}</span>
                    <span>{`Pitch ${signedDeg(proposal.cameraRig.pitchDeg)}`}</span>
                    <span>{`Roll ${signedDeg(proposal.cameraRig.rollDeg)}`}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">{isEn ? proposal.rationaleEn : proposal.rationaleKo}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5 pt-2">
                  <button type="button" data-testid={`camera-preview-btn-${proposal.rank}`} aria-pressed={isPreviewing} onClick={() => handleTogglePreview(proposal)} className={isPreviewing ? BTN_ACTIVE : BTN_OUTLINE}>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />{isPreviewing ? pick("미리보기 중", "Previewing") : pick("미리보기", "Preview")}
                  </button>
                  <button type="button" data-testid={`camera-apply-btn-${proposal.rank}`} onClick={() => handleApplyProposal(proposal)} className={BTN_SOLID}>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />{isApplied ? pick("재적용", "Re-Apply") : pick("적용", "Apply")}
                  </button>
                  {isApplied ? (
                    <button type="button" data-testid={`camera-card-revert-btn-${proposal.rank}`} onClick={handleRevert} className={BTN_OUTLINE}>
                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />{pick("원복", "Revert")}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {showJson ? (
        <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
          <pre data-testid="camera-json-preview" className="max-h-60 overflow-auto font-mono text-[11px] leading-relaxed text-fg-2">{jsonText}</pre>
        </div>
      ) : null}

      <p data-testid="camera-status-message" aria-live="polite" className="mt-3 min-h-[1.25rem] text-xs text-fg-3 [word-break:keep-all]">{statusMessage}</p>
    </section>
  );
}
