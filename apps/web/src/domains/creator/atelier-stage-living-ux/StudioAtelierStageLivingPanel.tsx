/**
 * Wave 63B — AtelierStage 가상 스튜디오 실전 UI/UX · 캐릭터 자연 동작 · 일상 협업 라이브 패널.
 *
 * - 인터랙티브 2.5D 아이소메트릭 작업실 SVG(책상 4개·벽면 핀보드·창문 햇살·아바타 이동·±55° 시선 원뿔·근접 대화 반경·말풍선)
 * - 8종 원클릭 창작자 포즈/리액션 바 + 4종 작업실 분위기 프리셋 + 벽면 포스트잇 추가/완료 토글 + 옆자리 캔버스 엿보기 포털
 * - 화면 가림 10% 미만 Calm 하단 플로팅 도크(6개 핵심 액션) + <details> 고급 설정 접기 + JSON 내보내기
 * - 모든 props 선택적, OKLCH·currentColor 전용(원시 색·바이올렛 270~320° 0%), Web Storage 0건
 */

import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CheckCircle2, Code2, Copy,
  Eye, Footprints, MessageCircle, Pin, Radio, RotateCcw, SlidersHorizontal, Sun, Users,
} from "lucide-react";
import {
  useId, useMemo, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactElement,
} from "react";

import { copyText } from "@/shared/lib/copy-text";

import {
  CREATOR_STAGE_POSES, DEFAULT_WALL_STICKY_NOTES, PROXIMITY_CLEAR_RADIUS_M,
  PROXIMITY_FADE_RADIUS_M, STAGE_AMBIENCE_PRESETS, STAGE_COLLABORATOR_DESKS,
  STAGE_CORE_DOCK_ACTIONS, STAGE_FURNITURE_OBSTACLES, STAGE_ROOM_DEPTH_M,
  STAGE_ROOM_WIDTH_M, STAGE_STICKY_NOTE_COLORS, STAGE_VOICE_CHAT_ZONES,
  addWallStickyNote, buildAtelierStageLivingSnapshot, cycleWallStickyNoteColor,
  evaluateAvatarLocomotionAndPose, exportAtelierStageLivingJson, formatOklch,
  getStickyNoteColorSpec, toggleWallStickyNoteDone,
  type AtelierStageLivingSnapshot, type CreatorPoseId, type StageAmbiencePresetId,
  type StageDockActionId, type StageVoiceChatZoneId, type StickyNoteColorId,
  type Vec2M, type Velocity2M, type WallStickyNote,
} from "./atelier-stage-living-engine";

export interface StudioAtelierStageLivingPanelProps {
  readonly initialAmbienceId?: StageAmbiencePresetId;
  readonly initialPoseId?: CreatorPoseId;
  readonly initialVoiceZone?: StageVoiceChatZoneId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPoseChange?: (poseId: CreatorPoseId, snapshot: AtelierStageLivingSnapshot) => void;
  readonly onAmbienceChange?: (ambienceId: StageAmbiencePresetId, snapshot: AtelierStageLivingSnapshot) => void;
  readonly onDeskInvite?: (deskId: string, snapshot: AtelierStageLivingSnapshot) => void;
  readonly onExportJson?: (json: string, snapshot: AtelierStageLivingSnapshot) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const MOTION_BTN =
  "transition-[transform,color,background-color,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold [word-break:keep-all] ${MOTION_BTN} ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const ISO_W = 640;
const ISO_H = 370;
const ISO_OX = 248;
const ISO_OY = 76;
const ISO_UX = 26;
const ISO_UY = 12.5;
const ISO_VX = -24;
const ISO_VY = 15.5;
const ISO_DET = ISO_UX * ISO_VY - ISO_VX * ISO_UY;

function projectIso(x: number, y: number, z = 0): { readonly sx: number; readonly sy: number } {
  return {
    sx: Math.round((ISO_OX + x * ISO_UX + y * ISO_VX) * 10) / 10,
    sy: Math.round((ISO_OY + x * ISO_UY + y * ISO_VY - z) * 10) / 10,
  };
}

function unprojectIso(sx: number, sy: number): Vec2M {
  const dx = sx - ISO_OX;
  const dy = sy - ISO_OY;
  return {
    x: Math.round(((dx * ISO_VY - dy * ISO_VX) / ISO_DET) * 100) / 100,
    y: Math.round(((ISO_UX * dy - ISO_UY * dx) / ISO_DET) * 100) / 100,
  };
}

function polyStr(pts: readonly { readonly sx: number; readonly sy: number }[]): string {
  return pts.map((p) => `${p.sx},${p.sy}`).join(" ");
}

function isoCirclePoints(center: Vec2M, radiusM: number, segments = 24): string {
  const pts: { readonly sx: number; readonly sy: number }[] = [];
  for (let i = 0; i < segments; i += 1) {
    const rad = (i / segments) * Math.PI * 2;
    pts.push(projectIso(center.x + Math.cos(rad) * radiusM, center.y + Math.sin(rad) * radiusM, 0));
  }
  return polyStr(pts);
}

function isoBoxPolys(minX: number, minY: number, maxX: number, maxY: number, heightPx: number) {
  const b10 = projectIso(maxX, minY, 0);
  const b11 = projectIso(maxX, maxY, 0);
  const b01 = projectIso(minX, maxY, 0);
  const t00 = projectIso(minX, minY, heightPx);
  const t10 = projectIso(maxX, minY, heightPx);
  const t11 = projectIso(maxX, maxY, heightPx);
  const t01 = projectIso(minX, maxY, heightPx);
  return {
    top: polyStr([t00, t10, t11, t01]),
    frontLeft: polyStr([t01, t11, b11, b01]),
    frontRight: polyStr([t10, t11, b11, b10]),
  };
}

function IsometricAtelierStageSvg(props: {
  readonly snapshot: AtelierStageLivingSnapshot;
  readonly isEn: boolean;
  readonly onFloorClick: (target: Vec2M) => void;
  readonly onDeskSelect: (deskId: string) => void;
}): ReactElement {
  const { snapshot, isEn, onFloorClick, onDeskSelect } = props;
  const { locomotion, interactions } = snapshot;
  const { ambience, peerBubbles, pinboard, deskPeek } = interactions;
  const p = ambience.palette;

  const wallBg = formatOklch(p.wallBg);
  const wallTrim = formatOklch(p.wallTrim);
  const floorBase = formatOklch(p.floorBase);
  const floorGrid = formatOklch(p.floorGrid);
  const sunbeamFill = formatOklch(p.sunbeam, ambience.polarity === "dark" ? 0.16 : 0.34);
  const deskTop = formatOklch(p.deskTop);
  const deskSide = formatOklch(p.deskSide);
  const pinboardBg = formatOklch(p.pinboardBg);
  const ink = formatOklch(p.ink);
  const mutedInk = formatOklch(p.mutedInk);
  const accent = formatOklch(p.accent);
  const accentSoft = formatOklch(p.accent, 0.14);
  const bubbleBg = formatOklch(p.bubbleBg, 0.94);
  const bubbleBorder = formatOklch(p.bubbleBorder);

  const wallH = 62;
  const f00 = projectIso(0, 0);
  const f10 = projectIso(STAGE_ROOM_WIDTH_M, 0);
  const f11 = projectIso(STAGE_ROOM_WIDTH_M, STAGE_ROOM_DEPTH_M);
  const f01 = projectIso(0, STAGE_ROOM_DEPTH_M);
  const w00 = projectIso(0, 0, wallH);
  const w10 = projectIso(STAGE_ROOM_WIDTH_M, 0, wallH);
  const w01 = projectIso(0, STAGE_ROOM_DEPTH_M, wallH);

  const avatarPt = projectIso(locomotion.position.x, locomotion.position.y, 0);
  const gazeRad = (locomotion.lookAt.worldGazeDeg * Math.PI) / 180;
  const coneHalfRad = (24 * Math.PI) / 180;
  const coneLeft = projectIso(locomotion.position.x + Math.cos(gazeRad - coneHalfRad) * 1.9, locomotion.position.y + Math.sin(gazeRad - coneHalfRad) * 1.9);
  const coneRight = projectIso(locomotion.position.x + Math.cos(gazeRad + coneHalfRad) * 1.9, locomotion.position.y + Math.sin(gazeRad + coneHalfRad) * 1.9);

  const handleSvgClick = (event: MouseEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width > 1 && rect.height > 1) {
      onFloorClick(unprojectIso(((event.clientX - rect.left) / rect.width) * ISO_W, ((event.clientY - rect.top) / rect.height) * ISO_H));
      return;
    }
    onFloorClick({ x: 6.2, y: 4.35 });
  };

  const gridLines: ReactElement[] = [];
  for (let gx = 2; gx < STAGE_ROOM_WIDTH_M; gx += 2) {
    const a = projectIso(gx, 0);
    const b = projectIso(gx, STAGE_ROOM_DEPTH_M);
    gridLines.push(<line key={`gx-${gx}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke={floorGrid} strokeWidth="0.9" />);
  }
  for (let gy = 2; gy < STAGE_ROOM_DEPTH_M; gy += 2) {
    const a = projectIso(0, gy);
    const b = projectIso(STAGE_ROOM_WIDTH_M, gy);
    gridLines.push(<line key={`gy-${gy}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke={floorGrid} strokeWidth="0.9" />);
  }

  const pinBoardPoly = polyStr([projectIso(5.2, 0.08, 46), projectIso(10.6, 0.08, 46), projectIso(10.6, 0.08, 12), projectIso(5.2, 0.08, 12)]);
  const ariaLabel = isEn
    ? `AtelierStage 2.5D isometric studio map, ambience ${ambience.labelEn}, pose ${locomotion.pose.labelEn}, avatar at ${locomotion.position.x}m by ${locomotion.position.y}m`
    : `AtelierStage 2.5D 아이소메트릭 작업실 맵, 분위기 ${ambience.labelKo}, 포즈 ${locomotion.pose.labelKo}, 아바타 위치 ${locomotion.position.x}m, ${locomotion.position.y}m`;

  return (
    <svg
      data-testid="atelier-stage-iso-svg" data-ambience-id={ambience.id} data-pose-id={locomotion.pose.id}
      data-gait={locomotion.gait} data-foot-ground-y={locomotion.footGroundY} data-lookat-yaw={locomotion.lookAt.headYawOffsetDeg}
      data-voice-zone={interactions.voiceChatZone.id} data-sticky-count={pinboard.totalNotes} data-violet-free="true"
      viewBox={`0 0 ${ISO_W} ${ISO_H}`} role="img" aria-label={ariaLabel} onClick={handleSvgClick}
      className="h-80 w-full cursor-crosshair rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width={ISO_W} height={ISO_H} fill={wallBg} />
      <polygon points={polyStr([w01, w00, f00, f01])} fill={wallTrim} stroke={floorGrid} strokeWidth="1" />
      <polygon points={polyStr([w00, w10, f10, f00])} fill={wallBg} stroke={floorGrid} strokeWidth="1" />
      <polygon points={polyStr([projectIso(1.0, 0.05, 50), projectIso(4.3, 0.05, 50), projectIso(4.3, 0.05, 14), projectIso(1.0, 0.05, 14)])} fill={sunbeamFill} stroke={wallTrim} strokeWidth="1.4" />
      <polygon points={polyStr([f00, f10, f11, f01])} fill={floorBase} stroke={wallTrim} strokeWidth="1.4" />
      <g opacity="0.72">{gridLines}</g>
      <polygon data-testid="stage-svg-sunbeam" points={polyStr([projectIso(1.0, 0.1), projectIso(4.3, 0.1), projectIso(5.4, 3.8), projectIso(1.6, 3.8)])} fill={sunbeamFill} />

      <g data-testid="stage-svg-pinboard">
        <polygon points={pinBoardPoly} fill={pinboardBg} stroke={deskSide} strokeWidth="1.5" />
        {pinboard.notes.slice(0, 8).map((note, idx) => {
          const pt = projectIso(5.65 + (idx % 4) * 1.18, 0.12, Math.floor(idx / 4) === 0 ? 39 : 23);
          const colorSpec = getStickyNoteColorSpec(note.colorId);
          return (
            <g key={note.id} data-testid={`stage-svg-note-${note.id}`} data-done={String(note.done)} transform={`translate(${pt.sx} ${pt.sy}) rotate(${note.tiltDeg})`}>
              <rect x="-10" y="-6" width="20" height="13" rx="2" fill={formatOklch(colorSpec.fill)} stroke={formatOklch(colorSpec.border)} strokeWidth="1" opacity={note.done ? 0.62 : 1} />
              <circle cx="0" cy="-4" r="1.5" fill={accent} />
              {note.done
                ? <path d="M -4 1 L -1 4 L 5 -2" fill="none" stroke={formatOklch(colorSpec.ink)} strokeWidth="1.3" />
                : <line x1="-6" y1="2" x2="6" y2="2" stroke={formatOklch(colorSpec.ink)} strokeWidth="1" opacity="0.65" />}
            </g>
          );
        })}
      </g>

      {STAGE_FURNITURE_OBSTACLES.filter((o) => o.kind !== "desk").map((obs) => {
        const box = isoBoxPolys(obs.minX, obs.minY, obs.maxX, obs.maxY, obs.kind === "sofa" ? 16 : 22);
        return (
          <g key={obs.id} data-testid={`stage-svg-${obs.id}`}>
            <polygon points={box.frontLeft} fill={deskSide} stroke={wallTrim} strokeWidth="0.9" />
            <polygon points={box.frontRight} fill={wallTrim} stroke={deskSide} strokeWidth="0.9" />
            <polygon points={box.top} fill={deskTop} stroke={deskSide} strokeWidth="1" />
          </g>
        );
      })}

      <polygon data-testid="stage-svg-fade-ring" points={isoCirclePoints(locomotion.position, PROXIMITY_FADE_RADIUS_M, 28)} fill="none" stroke={mutedInk} strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
      <polygon data-testid="stage-svg-clear-ring" points={isoCirclePoints(locomotion.position, interactions.voiceChatZone.clearRadiusM, 28)} fill={accentSoft} stroke={accent} strokeWidth="1.4" strokeDasharray="5 3" />
      <polygon data-testid="stage-svg-lookat-cone" points={polyStr([avatarPt, coneLeft, coneRight])} fill={formatOklch(p.accent, 0.22)} stroke={accent} strokeWidth="0.9" />

      {STAGE_COLLABORATOR_DESKS.map((desk) => {
        const obs = STAGE_FURNITURE_OBSTACLES.find((o) => o.id === desk.obstacleId);
        if (!obs) return null;
        const box = isoBoxPolys(obs.minX, obs.minY, obs.maxX, obs.maxY, 18);
        const seatPt = projectIso(desk.seatPos.x, desk.seatPos.y, 0);
        const deskCenter = projectIso((obs.minX + obs.maxX) / 2, (obs.minY + obs.maxY) / 2, 20);
        const bubble = peerBubbles.find((b) => b.deskId === desk.id);
        const isSelected = deskPeek.desk.id === desk.id;
        const deskAccent = formatOklch(desk.accentColor);
        return (
          <g key={desk.id} data-testid={`stage-svg-desk-${desk.id}`} data-selected={String(isSelected)} onClick={(e) => { e.stopPropagation(); onDeskSelect(desk.id); }} className="cursor-pointer">
            <polygon points={box.frontLeft} fill={deskSide} stroke={wallTrim} strokeWidth="0.9" />
            <polygon points={box.frontRight} fill={wallTrim} stroke={deskSide} strokeWidth="0.9" />
            <polygon points={box.top} fill={deskTop} stroke={isSelected ? accent : deskSide} strokeWidth={isSelected ? "2" : "1"} />
            <rect x={deskCenter.sx - 12} y={deskCenter.sy - 11} width="24" height="12" rx="2.5" fill={bubbleBg} stroke={deskAccent} strokeWidth="1.2" />
            <ellipse cx={seatPt.sx} cy={seatPt.sy + 1} rx="8" ry="4" fill={ink} opacity="0.22" />
            <circle cx={seatPt.sx} cy={seatPt.sy - 12} r="6.5" fill={deskAccent} stroke={bubbleBg} strokeWidth="1.2" />
            <text x={seatPt.sx} y={seatPt.sy + 12} textAnchor="middle" fill={ink} fontSize="8" fontWeight="700">{`${desk.creatorName} · ${desk.progressPercent}%`}</text>
            {bubble && bubble.audible ? (
              <g data-testid={`stage-svg-bubble-${desk.id}`} data-clarity={bubble.clarity} opacity={bubble.opacity}>
                <rect x={seatPt.sx - 56} y={seatPt.sy - 42} width="112" height="19" rx="6" fill={bubbleBg} stroke={bubble.clarity === "clear" ? deskAccent : bubbleBorder} strokeWidth="1.1" />
                <text x={seatPt.sx} y={seatPt.sy - 30} textAnchor="middle" fill={ink} fontSize="7" fontWeight="600">{(isEn ? bubble.speechTextEn : bubble.speechTextKo).slice(0, 18)}</text>
              </g>
            ) : null}
          </g>
        );
      })}

      <g data-testid="stage-svg-player-avatar" transform={`translate(${avatarPt.sx} ${avatarPt.sy})`}>
        <ellipse cx="0" cy="1" rx="10" ry="4.8" fill={ink} opacity="0.28" />
        <path
          d={
            locomotion.pose.id === "stretch-break" ? "M -9 -14 L -13 -28 M 9 -14 L 13 -28"
              : locomotion.pose.id === "wave-hello" ? "M 8 -14 L 15 -26"
                : locomotion.pose.id === "coffee-sip" ? "M 7 -12 L 13 -14"
                  : "M -7 -10 L -10 -5 M 7 -10 L 10 -5"
          }
          stroke={accent} strokeWidth="2.4" strokeLinecap="round"
        />
        <rect x="-7" y="-17" width="14" height="14" rx="5" fill={accent} stroke={bubbleBg} strokeWidth="1.4" />
        <circle cx="0" cy="-24" r="7.5" fill={bubbleBg} stroke={accent} strokeWidth="2" />
        {locomotion.pose.id === "focus-headphones" ? <path d="M -8 -24 A 8 8 0 0 1 8 -24" fill="none" stroke={ink} strokeWidth="2.2" /> : null}
        {locomotion.pose.id === "nap-desk" ? <text x="12" y="-28" fill={mutedInk} fontSize="8" fontFamily="monospace" fontWeight="700">zZ</text> : null}
        {locomotion.pose.id === "applause-cheer" ? <text x="12" y="-28" fill={accent} fontSize="8" fontFamily="monospace" fontWeight="700">CLAP</text> : null}
        <rect x="-64" y="-56" width="128" height="20" rx="7" fill={bubbleBg} stroke={accent} strokeWidth="1.2" />
        <text x="0" y="-43" textAnchor="middle" fill={ink} fontSize="7.4" fontWeight="700">{interactions.selfSpeechText.slice(0, 20)}</text>
      </g>

      <rect x="0" y={ISO_H - 24} width={ISO_W} height="24" fill={wallTrim} opacity="0.92" />
      <text x="12" y={ISO_H - 9} fill={ink} fontSize="8" fontFamily="monospace" fontWeight="700">
        {`ATELIERSTAGE · POS (${locomotion.position.x}m, ${locomotion.position.y}m) · FOOT Y=${locomotion.footGroundY}m · LOOK-AT ${locomotion.lookAt.headYawOffsetDeg}deg`}
      </text>
      <text x={ISO_W - 12} y={ISO_H - 9} textAnchor="end" fill={mutedInk} fontSize="7.6" fontFamily="monospace">
        {`${ambience.colorTempKelvin}K · CLEAR ${PROXIMITY_CLEAR_RADIUS_M}m · VIOLET-FREE`}
      </text>
    </svg>
  );
}

/** AtelierStage 가상 스튜디오 실전 UI/UX · 캐릭터 자연 동작 · 일상 상호작용 라이브 패널. */
export function StudioAtelierStageLivingPanel(props: StudioAtelierStageLivingPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const noteInputId = useId();
  const speechInputId = useId();

  const [avatarPos, setAvatarPos] = useState<Vec2M>({ x: 5.7, y: 4.1 });
  const [avatarVel, setAvatarVel] = useState<Velocity2M>({ vx: 0, vy: 0 });
  const [facingDeg, setFacingDeg] = useState<number>(270);
  const [targetPos, setTargetPos] = useState<Vec2M | null>(null);
  const [sprint, setSprint] = useState<boolean>(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [poseId, setPoseId] = useState<CreatorPoseId>(props.initialPoseId ?? "sit-drawing");
  const [voiceZone, setVoiceZone] = useState<StageVoiceChatZoneId>(props.initialVoiceZone ?? "table");
  const [ambienceId, setAmbienceId] = useState<StageAmbiencePresetId>(props.initialAmbienceId ?? "morning-sunlit-atelier");
  const [selfSpeechText, setSelfSpeechText] = useState<string>(isEn ? "Refining Episode 24 ink lines" : "24화 펜선 다듬는 중이에요");
  const [stickyNotes, setStickyNotes] = useState<readonly WallStickyNote[]>(DEFAULT_WALL_STICKY_NOTES);
  const [draftNote, setDraftNote] = useState<string>("");
  const [draftNoteColor, setDraftNoteColor] = useState<StickyNoteColorId>("butter-paper");
  const [selectedDeskId, setSelectedDeskId] = useState<string>(STAGE_COLLABORATOR_DESKS[1].id);
  const [coEditInvitedDeskId, setCoEditInvitedDeskId] = useState<string | null>(null);
  const [activeDockAction, setActiveDockAction] = useState<StageDockActionId>("move");
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const selectedDesk = useMemo(
    () => STAGE_COLLABORATOR_DESKS.find((d) => d.id === selectedDeskId) ?? STAGE_COLLABORATOR_DESKS[0],
    [selectedDeskId],
  );

  const snapshot = useMemo(
    () => buildAtelierStageLivingSnapshot({
      locomotion: {
        currentPos: avatarPos, velocity: avatarVel, facingDeg, targetPos, sprint, poseId,
        lookAtTarget: selectedDesk.seatPos, reducedMotion, dtSec: 0.2,
      },
      interactions: { voiceChatZone: voiceZone, selfSpeechText, stickyNotes, selectedDeskId, coEditInvitedDeskId, ambienceId },
      dockBudget: { viewportWidthPx: 1440, viewportHeightPx: 900, dockWidthPx: 528, dockHeightPx: 56, dockActionCount: STAGE_CORE_DOCK_ACTIONS.length, advancedDrawerOpen: advancedOpen },
    }),
    [advancedOpen, ambienceId, avatarPos, avatarVel, coEditInvitedDeskId, facingDeg, poseId, reducedMotion, selectedDesk.seatPos, selectedDeskId, selfSpeechText, sprint, stickyNotes, targetPos, voiceZone],
  );

  const jsonOutput = useMemo(() => exportAtelierStageLivingJson(snapshot), [snapshot]);

  const applyStepMove = (dir: Vec2M, customTarget: Vec2M | null = null): void => {
    const next = evaluateAvatarLocomotionAndPose({
      currentPos: avatarPos, velocity: avatarVel, facingDeg,
      directionalInput: customTarget ? null : dir, targetPos: customTarget, sprint, poseId,
      lookAtTarget: customTarget ?? selectedDesk.seatPos, reducedMotion, dtSec: 0.35,
    });
    setAvatarPos(next.position);
    setAvatarVel(next.velocity);
    setFacingDeg(next.facingDeg);
    setTargetPos(customTarget);
    setActiveDockAction("move");
  };

  const handleStageKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const key = event.key.toLowerCase();
    if (key === "w" || key === "arrowup") { event.preventDefault(); applyStepMove({ x: 0, y: -1 }); }
    else if (key === "s" || key === "arrowdown") { event.preventDefault(); applyStepMove({ x: 0, y: 1 }); }
    else if (key === "a" || key === "arrowleft") { event.preventDefault(); applyStepMove({ x: -1, y: 0 }); }
    else if (key === "d" || key === "arrowright") { event.preventDefault(); applyStepMove({ x: 1, y: 0 }); }
  };

  const handlePoseSelect = (nextPoseId: CreatorPoseId): void => {
    setPoseId(nextPoseId);
    setActiveDockAction("pose");
    const nextSnap = buildAtelierStageLivingSnapshot({
      locomotion: { currentPos: avatarPos, velocity: { vx: 0, vy: 0 }, facingDeg, poseId: nextPoseId, lookAtTarget: selectedDesk.seatPos, reducedMotion },
      interactions: { voiceChatZone: voiceZone, selfSpeechText, stickyNotes, selectedDeskId, coEditInvitedDeskId, ambienceId },
    });
    props.onPoseChange?.(nextPoseId, nextSnap);
  };

  const handleAmbienceSelect = (nextAmbienceId: StageAmbiencePresetId): void => {
    setAmbienceId(nextAmbienceId);
    setActiveDockAction("ambience");
    const nextSnap = buildAtelierStageLivingSnapshot({
      locomotion: { currentPos: avatarPos, velocity: avatarVel, facingDeg, poseId, lookAtTarget: selectedDesk.seatPos, reducedMotion },
      interactions: { voiceChatZone: voiceZone, selfSpeechText, stickyNotes, selectedDeskId, coEditInvitedDeskId, ambienceId: nextAmbienceId },
    });
    props.onAmbienceChange?.(nextAmbienceId, nextSnap);
  };

  const handleAddStickyNote = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const updated = addWallStickyNote(stickyNotes, { text: draftNote, author: pick("나", "Me"), colorId: draftNoteColor });
    if (updated !== stickyNotes) {
      setStickyNotes(updated);
      setDraftNote("");
      setActiveDockAction("sticky");
    }
  };

  const handleCoEditInvite = (deskId: string): void => {
    setSelectedDeskId(deskId);
    setCoEditInvitedDeskId(deskId);
    setActiveDockAction("desk-invite");
    const nextSnap = buildAtelierStageLivingSnapshot({
      locomotion: { currentPos: avatarPos, velocity: avatarVel, facingDeg, poseId, lookAtTarget: selectedDesk.seatPos, reducedMotion },
      interactions: { voiceChatZone: voiceZone, selfSpeechText, stickyNotes, selectedDeskId: deskId, coEditInvitedDeskId: deskId, ambienceId },
    });
    props.onDeskInvite?.(deskId, nextSnap);
  };

  const handleCopyJson = async (): Promise<void> => {
    const ok = await copyText(jsonOutput);
    if (ok) { setCopyStatus("copied"); props.onExportJson?.(jsonOutput, snapshot); }
    else { setCopyStatus("error"); }
  };

  const { locomotion, interactions, dockBudget } = snapshot;

  return (
    <section
      data-testid="atelier-stage-living-panel"
      aria-label={pick("AtelierStage 살아 있는 가상 작업실", "AtelierStage Living Virtual Studio")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg shadow-sm ${props.className ?? ""}`.trim()}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <p className="font-mono text-[11px] font-semibold tracking-wider text-accent uppercase">ToonStudio · AtelierStage Living UX</p>
          <h2 className="text-base font-bold text-fg [word-break:keep-all]">{pick("함께 마감하는 살아 있는 가상 작업실", "Living Virtual Atelier for Daily Team Deadlines")}</h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("바닥 클릭 이동·±55° 시선 추적·근접 말풍선·벽면 콘티 핀보드·옆자리 원고 엿보기를 한 화면에서 조작합니다.", "Click-to-walk, ±55° look-at, proximity speech bubbles, wall conti pinboard, and instant desk peek in one calm workspace.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span data-testid="stage-ground-badge" className="rounded-lg border border-good bg-good-soft px-2.5 py-1 font-mono text-[11px] font-semibold text-good">{`footGroundY ${locomotion.footGroundY}m`}</span>
          <span data-testid="stage-lookat-badge" className="rounded-lg border border-line bg-card px-2.5 py-1 font-mono text-[11px] font-semibold text-fg">{`${pick("시선", "Look-At")} ${locomotion.lookAt.headYawOffsetDeg}°`}</span>
          <span data-testid="stage-dock-badge" className="rounded-lg border border-accent bg-accent-soft px-2.5 py-1 font-mono text-[11px] font-semibold text-accent">{`${pick("도크 가림", "Dock")} ${dockBudget.screenOcclusionPercent}% (<10%)`}</span>
        </div>
      </header>

      <div
        data-testid="stage-interactive-canvas-wrap"
        role="grid"
        aria-roledescription={pick("가상 작업실 인터랙티브 맵", "Interactive studio map")}
        tabIndex={0}
        onKeyDown={handleStageKeyDown}
        aria-label={pick("WASD 또는 화살표 키로 아바타 이동", "Use WASD or arrow keys to move avatar")}
        className={`space-y-2.5 rounded-xl border border-line bg-raised p-3 ${FOCUS_RING}`}
      >
        <IsometricAtelierStageSvg snapshot={snapshot} isEn={isEn} onFloorClick={(target) => applyStepMove({ x: 0, y: 0 }, target)} onDeskSelect={(deskId) => { setSelectedDeskId(deskId); setActiveDockAction("desk-invite"); }} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("방향 이동 조작", "Directional movement controls")}>
            <button type="button" data-testid="stage-move-up" onClick={() => applyStepMove({ x: 0, y: -1 })} className={BTN_OUTLINE} aria-label={pick("북쪽으로 이동", "Move north")}><ArrowUp className="h-4 w-4" aria-hidden="true" /><span>{pick("북(W)", "N (W)")}</span></button>
            <button type="button" data-testid="stage-move-left" onClick={() => applyStepMove({ x: -1, y: 0 })} className={BTN_OUTLINE} aria-label={pick("서쪽으로 이동", "Move west")}><ArrowLeft className="h-4 w-4" aria-hidden="true" /><span>{pick("서(A)", "W (A)")}</span></button>
            <button type="button" data-testid="stage-move-down" onClick={() => applyStepMove({ x: 0, y: 1 })} className={BTN_OUTLINE} aria-label={pick("남쪽으로 이동", "Move south")}><ArrowDown className="h-4 w-4" aria-hidden="true" /><span>{pick("남(S)", "S (S)")}</span></button>
            <button type="button" data-testid="stage-move-right" onClick={() => applyStepMove({ x: 1, y: 0 })} className={BTN_OUTLINE} aria-label={pick("동쪽으로 이동", "Move east")}><ArrowRight className="h-4 w-4" aria-hidden="true" /><span>{pick("동(D)", "E (D)")}</span></button>
            <button type="button" data-testid="stage-sprint-toggle" aria-pressed={sprint} onClick={() => setSprint((prev) => !prev)} className={sprint ? BTN_ACTIVE : BTN_OUTLINE}><Footprints className="h-4 w-4" aria-hidden="true" /><span>{sprint ? pick("빠른 걸음 ON", "Sprint ON") : pick("걷기 모드", "Walk Mode")}</span></button>
            <button type="button" data-testid="stage-reset-pos" onClick={() => { setAvatarPos({ x: 5.7, y: 4.1 }); setAvatarVel({ vx: 0, vy: 0 }); setTargetPos(null); }} className={BTN_OUTLINE}><RotateCcw className="h-4 w-4" aria-hidden="true" /><span>{pick("중앙 복귀", "Center")}</span></button>
          </div>
          <p data-testid="stage-proximity-summary" className="font-mono text-xs text-fg-2 tabular-nums">{`${pick("들리는 동료", "Audible Peers")} ${interactions.reachablePeerCount}/${STAGE_COLLABORATOR_DESKS.length} · ${pick("선명", "Clear")} ${interactions.clearPeerCount} · ${locomotion.gait.toUpperCase()}`}</p>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("8종 원클릭 창작자 포즈 · 일상 리액션", "8 One-Click Creator Poses & Reactions")}</h3>
          <span className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? locomotion.pose.armCueEn : locomotion.pose.armCueKo}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={pick("창작자 포즈 선택", "Creator pose selection")}>
          {CREATOR_STAGE_POSES.map((pose) => (
            <button key={pose.id} type="button" data-testid={`stage-pose-${pose.id}`} aria-pressed={pose.id === poseId} onClick={() => handlePoseSelect(pose.id)} className={pose.id === poseId ? BTN_ACTIVE : BTN_OUTLINE}>
              <span>{isEn ? pose.labelEn : pose.labelKo}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]"><Sun className="h-4 w-4 text-accent" aria-hidden="true" />{pick("4종 작업실 분위기 씬 프리셋", "4 Studio Ambience Scene Presets")}</h3>
          <span data-testid="stage-ambience-metrics" className="font-mono text-[11px] text-fg-2 tabular-nums">{`${interactions.ambience.colorTempKelvin}K · ${pick("앰비언트", "Ambience")} ${interactions.ambience.ambientVolumePercent}% · ${pick("시각 피로", "Fatigue")} ${interactions.ambience.visualFatigueScore}/100`}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={pick("작업실 분위기 선택", "Studio ambience presets")}>
          {STAGE_AMBIENCE_PRESETS.map((preset) => (
            <button key={preset.id} type="button" data-testid={`stage-ambience-${preset.id}`} aria-pressed={preset.id === ambienceId} onClick={() => handleAmbienceSelect(preset.id)} className={preset.id === ambienceId ? BTN_ACTIVE : BTN_OUTLINE}>
              <span>{isEn ? preset.labelEn : preset.labelKo}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-fg-2 [word-break:keep-all]">{`${isEn ? interactions.ambience.soundscapeEn : interactions.ambience.soundscapeKo} — ${isEn ? interactions.ambience.moodSummaryEn : interactions.ambience.moodSummaryKo}`}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div data-testid="stage-desk-peek-portal" className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]"><Eye className="h-4 w-4 text-accent" aria-hidden="true" />{pick("옆자리 캔버스 엿보기 & 동시 작업 포털", "Desk Peek & Co-Edit Portal")}</h3>
            <span className="font-mono text-[11px] text-fg-2 tabular-nums">{`${interactions.deskPeek.distanceM}m · ${interactions.deskPeek.clarity.toUpperCase()}`}</span>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("동료 책상 선택", "Select collaborator desk")}>
            {STAGE_COLLABORATOR_DESKS.map((desk) => (
              <button key={desk.id} type="button" data-testid={`stage-desk-btn-${desk.id}`} aria-pressed={desk.id === selectedDeskId} onClick={() => { setSelectedDeskId(desk.id); setActiveDockAction("desk-invite"); }} className={desk.id === selectedDeskId ? BTN_ACTIVE : BTN_OUTLINE}>
                <span>{`${desk.creatorName} (${isEn ? desk.roleEn : desk.roleKo})`}</span>
              </button>
            ))}
          </div>
          <div className="space-y-2 rounded-lg border border-line bg-raised p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-fg [word-break:keep-all]">{`${interactions.deskPeek.desk.creatorName} · ${isEn ? interactions.deskPeek.desk.episodeLabelEn : interactions.deskPeek.desk.episodeLabelKo}`}</p>
                <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? interactions.deskPeek.desk.activeLayerEn : interactions.deskPeek.desk.activeLayerKo}</p>
              </div>
              <span className="rounded-md border border-line bg-card px-2 py-1 font-mono text-[11px] font-bold text-fg tabular-nums">{`${interactions.deskPeek.desk.pomodoroRemainingMin}/${interactions.deskPeek.desk.pomodoroTotalMin}m`}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-canvas" aria-hidden="true">
              <div className="h-full rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${interactions.deskPeek.desk.progressPercent}%` }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="font-mono text-xs text-fg-2 tabular-nums">{`${pick("진행률", "Progress")} ${interactions.deskPeek.desk.progressPercent}% · ${interactions.deskPeek.desk.panelCount}${pick("컷", " cuts")}`}</span>
              <button type="button" data-testid="stage-coedit-join-btn" onClick={() => handleCoEditInvite(interactions.deskPeek.desk.id)} className={interactions.deskPeek.coEditInviteState === "co-edit-ready" ? BTN_ACTIVE : BTN_SOLID}>
                <Users className="h-4 w-4" aria-hidden="true" />
                <span>{interactions.deskPeek.coEditInviteState === "co-edit-ready" ? pick("공동 편집 입장 준비됨", "Co-Edit Ready") : pick("공동 편집 입장 준비", "Prepare Co-Edit")}</span>
              </button>
            </div>
          </div>
        </div>

        <div data-testid="stage-pinboard-section" className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]"><Pin className="h-4 w-4 text-accent" aria-hidden="true" />{pick("벽면 포스트잇 & 콘티 핀보드", "Wall Sticky-Note & Conti Pinboard")}</h3>
            <span data-testid="stage-pinboard-metrics" className="font-mono text-[11px] text-fg-2 tabular-nums">{`${interactions.pinboard.completedNotes}/${interactions.pinboard.totalNotes} (${interactions.pinboard.completionRatePercent}%)`}</span>
          </div>
          <form onSubmit={handleAddStickyNote} className="flex flex-wrap items-center gap-2">
            <label htmlFor={noteInputId} className="sr-only">{pick("새 핀보드 메모 입력", "New pinboard note")}</label>
            <input id={noteInputId} data-testid="stage-note-input" type="text" value={draftNote} onChange={(e) => setDraftNote(e.target.value)} placeholder={pick("컷 피드백·마감 체크를 벽에 꽂아 보세요", "Pin a cut note or checklist item")} className={`min-h-11 min-w-44 flex-1 rounded-lg border border-line bg-canvas px-3 text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`} />
            <div className="flex items-center gap-1" role="group" aria-label={pick("스티커 색상", "Sticky note color")}>
              {STAGE_STICKY_NOTE_COLORS.map((color) => (
                <button key={color.id} type="button" data-testid={`stage-note-color-${color.id}`} aria-label={isEn ? color.labelEn : color.labelKo} aria-pressed={draftNoteColor === color.id} onClick={() => setDraftNoteColor(color.id)} className={draftNoteColor === color.id ? BTN_ACTIVE : BTN_OUTLINE}>
                  <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border border-line-strong" style={{ backgroundColor: formatOklch(color.fill) }} />
                </button>
              ))}
            </div>
            <button type="submit" data-testid="stage-note-add-btn" className={BTN_SOLID}><Pin className="h-4 w-4" aria-hidden="true" /><span>{pick("핀 꽂기", "Pin Note")}</span></button>
          </form>
          <ul data-testid="stage-note-list" className="space-y-1.5">
            {interactions.pinboard.notes.map((note) => {
              const colorSpec = getStickyNoteColorSpec(note.colorId);
              return (
                <li key={note.id} data-testid={`stage-note-item-${note.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-raised px-2.5 py-1.5">
                  <button type="button" data-testid={`stage-note-toggle-${note.id}`} aria-pressed={note.done} onClick={() => setStickyNotes((prev) => toggleWallStickyNoteDone(prev, note.id))} className={`flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left text-xs [word-break:keep-all] ${MOTION_BTN} ${FOCUS_RING}`}>
                    <span aria-hidden="true" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border" style={{ backgroundColor: formatOklch(colorSpec.fill), borderColor: formatOklch(colorSpec.border), color: formatOklch(colorSpec.ink) }}>
                      {note.done ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className={note.done ? "text-fg-3 line-through" : "font-medium text-fg"}>{note.text}</span>
                    <span className="ml-auto font-mono text-[10px] text-fg-3">{note.author}</span>
                  </button>
                  <button type="button" data-testid={`stage-note-cycle-${note.id}`} onClick={() => setStickyNotes((prev) => cycleWallStickyNoteColor(prev, note.id))} className={BTN_OUTLINE}><span>{pick("색상", "Tone")}</span></button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <nav data-testid="stage-calm-dock" aria-label={pick("AtelierStage Calm 하단 플로팅 도크", "AtelierStage Calm Bottom Floating Dock")} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line-strong bg-card px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {STAGE_CORE_DOCK_ACTIONS.map((action) => (
            <button key={action.id} type="button" data-testid={`stage-dock-${action.id}`} aria-pressed={activeDockAction === action.id} onClick={() => setActiveDockAction(action.id)} className={activeDockAction === action.id ? BTN_ACTIVE : BTN_OUTLINE}>
              <span>{isEn ? action.labelEn : action.labelKo}</span>
              <span className="font-mono text-[10px] opacity-70">{action.shortcutKey}</span>
            </button>
          ))}
        </div>
        <span data-testid="stage-dock-budget-status" className="font-mono text-[11px] font-semibold text-good tabular-nums">{`${pick("핵심", "Core")} ${dockBudget.dockActionCount}/${dockBudget.coreActionBudget} · ${pick("점유", "Stage")} ${dockBudget.effectiveStageOccupancyPercent}%`}</span>
      </nav>

      <details data-testid="stage-advanced-details" open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)} className="rounded-xl border border-line bg-raised p-3">
        <summary className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-2 text-xs font-bold text-fg [word-break:keep-all] ${FOCUS_RING}`}>
          <span className="inline-flex items-center gap-1.5"><SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />{pick("고급 공간 설정 · 3단계 근접 대화 존 · JSON 명세", "Advanced Space Settings · 3-Tier Proximity Zone · JSON Spec")}</span>
          <span className="font-mono text-[11px] text-fg-2 tabular-nums">{`${interactions.voiceChatZone.clearRadiusM}m / ${interactions.voiceChatZone.fadeRadiusM}m`}</span>
        </summary>
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]"><Radio className="h-4 w-4 text-accent" aria-hidden="true" />{pick("근접 말풍선 · 음성 존", "Proximity Speech & Voice Zone")}</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("음성 채팅 존 선택", "Voice chat zone")}>
              {STAGE_VOICE_CHAT_ZONES.map((zone) => (
                <button key={zone.id} type="button" data-testid={`stage-zone-${zone.id}`} aria-pressed={voiceZone === zone.id} onClick={() => { setVoiceZone(zone.id); setActiveDockAction("bubble"); }} className={voiceZone === zone.id ? BTN_ACTIVE : BTN_OUTLINE}>
                  <span>{isEn ? zone.labelEn : zone.labelKo}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={speechInputId} className="inline-flex items-center gap-1 text-xs font-semibold text-fg [word-break:keep-all]"><MessageCircle className="h-4 w-4 text-accent" aria-hidden="true" />{pick("내 말풍선", "My Bubble")}</label>
            <input id={speechInputId} data-testid="stage-self-speech-input" type="text" value={selfSpeechText} onChange={(e) => setSelfSpeechText(e.target.value)} className={`min-h-11 min-w-52 flex-1 rounded-lg border border-line bg-canvas px-3 text-xs text-fg ${FOCUS_RING}`} />
            <button type="button" data-testid="stage-reduced-motion-toggle" aria-pressed={reducedMotion} onClick={() => setReducedMotion((prev) => !prev)} className={reducedMotion ? BTN_ACTIVE : BTN_OUTLINE}>
              <span>{reducedMotion ? pick("모션 감소 ON", "Reduced Motion ON") : pick("모션 감소 OFF", "Reduced Motion OFF")}</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-testid="stage-copy-json-btn" onClick={() => void handleCopyJson()} className={BTN_SOLID}><Copy className="h-4 w-4" aria-hidden="true" /><span>{pick("상태 JSON 복사", "Copy Stage JSON")}</span></button>
              <button type="button" data-testid="stage-toggle-json-btn" aria-expanded={showJsonPreview} onClick={() => setShowJsonPreview((prev) => !prev)} className={showJsonPreview ? BTN_ACTIVE : BTN_OUTLINE}><Code2 className="h-4 w-4" aria-hidden="true" /><span>{showJsonPreview ? pick("JSON 닫기", "Hide JSON") : pick("JSON 미리보기", "Preview JSON")}</span></button>
            </div>
            {copyStatus === "copied" ? <span data-testid="stage-copy-status" role="status" className="inline-flex items-center gap-1 text-xs font-semibold text-good [word-break:keep-all]"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{pick("AtelierStage JSON을 클립보드에 복사했습니다.", "Copied AtelierStage JSON to clipboard.")}</span> : null}
            {copyStatus === "error" ? <span data-testid="stage-copy-error" role="alert" className="text-xs font-semibold text-bad [word-break:keep-all]">{pick("클립보드 권한을 확인한 뒤 다시 시도해 주세요.", "Clipboard permission unavailable. Please retry.")}</span> : null}
          </div>
          {showJsonPreview ? <pre data-testid="stage-json-preview" className="max-h-52 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums">{jsonOutput}</pre> : null}
        </div>
      </details>
    </section>
  );
}
