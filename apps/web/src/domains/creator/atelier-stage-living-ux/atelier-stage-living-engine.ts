/**
 * Wave 63B — AtelierStage 가상 스튜디오 실전 UI/UX · 캐릭터 자연 동작 · 일상 상호작용 엔진.
 *
 * - 자연스러운 이동 & IK 자세: 클릭 이동 + WASD/화살표 + AABB 장애물 슬라이드 충돌 해소 +
 *   속도 기반 걷기/달리기/멈춤 감속 곡선 + 8종 원클릭 창작자 포즈 + 발바닥 접지(footGroundY === 0) + 시선 ±55° 클램프
 * - 일상 협업: 거리 기반 말풍선 자동 페이드(3.2m 선명 · 5.5m 감쇠 · 원거리 조용함 / Whisper·Table·Room 3단계 존) +
 *   벽면 콘티 핀보드 포스트잇 + 옆자리 캔버스 엿보기 포털 + 4종 작업실 분위기 프리셋
 * - Calm 하단 플로팅 도크 예산(< 10% 화면 가림, 6개 핵심 액션) & JSON 내보내기 (OKLCH·무바이올렛 0%)
 */

export const ATELIER_STAGE_SCHEMA_VERSION = "toonstudio.atelier-stage-living-ux.v1";
export const ATELIER_STAGE_BRAND_NAME = "AtelierStage";
export const ATELIER_STAGE_STUDIO_NAME = "ToonStudio";
export const VIOLET_HUE_MIN = 270;
export const VIOLET_HUE_MAX = 320;
export const STAGE_ROOM_WIDTH_M = 12;
export const STAGE_ROOM_DEPTH_M = 8;
export const STAGE_NORTH_WALL_CLEARANCE_M = 0.65;
export const AVATAR_COLLISION_RADIUS_M = 0.42;
export const AVATAR_FOOT_GROUND_Y = 0;
export const LOOK_AT_MAX_YAW_DEG = 55;
export const WALK_MAX_SPEED_MPS = 1.65;
export const RUN_MAX_SPEED_MPS = 3.15;
export const DECEL_START_DISTANCE_M = 1.05;
export const ARRIVAL_EPSILON_M = 0.08;
export const STOP_SPEED_EPSILON_MPS = 0.06;
export const PROXIMITY_WHISPER_RADIUS_M = 1.8;
export const PROXIMITY_CLEAR_RADIUS_M = 3.2;
export const PROXIMITY_FADE_RADIUS_M = 5.5;
export const PROXIMITY_ROOM_FADE_RADIUS_M = 8.2;
export const CORE_DOCK_ACTION_BUDGET = 6;
export const MAX_DOCK_OCCLUSION_PERCENT = 10;

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface Vec2M { readonly x: number; readonly y: number; }
export interface Velocity2M { readonly vx: number; readonly vy: number; }

export type AvatarGaitState = "idle" | "walking" | "running" | "decelerating";
export type CreatorPoseId =
  | "sit-drawing" | "stretch-break" | "coffee-sip" | "wave-hello"
  | "applause-cheer" | "peek-critique" | "focus-headphones" | "nap-desk";
export type StageVoiceChatZoneId = "whisper" | "table" | "room";
export type SpeechBubbleClarity = "clear" | "fading" | "quiet";
export type ProximityTier = "whisper" | "table" | "room" | "quiet";
export type StickyNoteColorId = "butter-paper" | "sage-mint" | "terracotta-peach" | "sky-slate";
export type StageAmbiencePresetId =
  | "morning-sunlit-atelier" | "rainy-night-deadline" | "warm-cafe-lounge" | "minimal-white-gallery";
export type StageDockActionId = "move" | "pose" | "bubble" | "sticky" | "ambience" | "desk-invite";
export type DeskCoEditInviteState = "idle" | "peeking" | "co-edit-ready";
export type ObstacleSlideAxis = "none" | "x" | "y" | "corner-push" | "wall";

export interface StageObstacleAabb {
  readonly id: string; readonly kind: "desk" | "sofa" | "coffee-bar" | "shelf";
  readonly labelKo: string; readonly labelEn: string;
  readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number;
}
export interface CreatorPoseSpec {
  readonly id: CreatorPoseId; readonly labelKo: string; readonly labelEn: string;
  readonly shortKo: string; readonly shortEn: string;
  readonly category: "work" | "social" | "rest"; readonly posture: "seated" | "standing" | "leaning";
  readonly footGroundY: 0; readonly spineTiltDeg: number; readonly headPitchDeg: number;
  readonly armCueKo: string; readonly armCueEn: string;
  readonly defaultBubbleKo: string; readonly defaultBubbleEn: string;
  readonly focusStatus: "available" | "focusing" | "resting";
}
export interface StageVoiceChatZoneSpec {
  readonly id: StageVoiceChatZoneId; readonly labelKo: string; readonly labelEn: string;
  readonly clearRadiusM: number; readonly fadeRadiusM: number; readonly summaryKo: string; readonly summaryEn: string;
}
export interface StickyNoteColorSpec {
  readonly id: StickyNoteColorId; readonly labelKo: string; readonly labelEn: string;
  readonly fill: OklchColor; readonly border: OklchColor; readonly ink: OklchColor;
}
export interface WallStickyNote {
  readonly id: string; readonly text: string; readonly author: string; readonly colorId: StickyNoteColorId;
  readonly done: boolean; readonly pinSlot: number; readonly tiltDeg: number;
}
export interface StageCollaboratorDesk {
  readonly id: string; readonly obstacleId: string; readonly creatorName: string;
  readonly roleKo: string; readonly roleEn: string; readonly seatPos: Vec2M; readonly facingDeg: number;
  readonly episodeLabelKo: string; readonly episodeLabelEn: string; readonly activeLayerKo: string; readonly activeLayerEn: string;
  readonly progressPercent: number; readonly pomodoroRemainingMin: number; readonly pomodoroTotalMin: number;
  readonly pomodoroPhase: "focus" | "break"; readonly currentPoseId: CreatorPoseId;
  readonly speechTextKo: string; readonly speechTextEn: string; readonly panelCount: number; readonly accentColor: OklchColor;
}
export interface StageAmbiencePalette {
  readonly wallBg: OklchColor; readonly wallTrim: OklchColor; readonly floorBase: OklchColor; readonly floorGrid: OklchColor;
  readonly sunbeam: OklchColor; readonly deskTop: OklchColor; readonly deskSide: OklchColor; readonly pinboardBg: OklchColor;
  readonly ink: OklchColor; readonly mutedInk: OklchColor; readonly accent: OklchColor;
  readonly bubbleBg: OklchColor; readonly bubbleBorder: OklchColor;
}
export interface StageAmbiencePreset {
  readonly id: StageAmbiencePresetId; readonly labelKo: string; readonly labelEn: string;
  readonly shortKo: string; readonly shortEn: string; readonly polarity: "light" | "dark";
  readonly colorTempKelvin: number; readonly ambientVolumePercent: number;
  readonly visualFatigueScore: number; readonly blueLightReductionPercent: number;
  readonly soundscapeKo: string; readonly soundscapeEn: string; readonly moodSummaryKo: string; readonly moodSummaryEn: string;
  readonly palette: StageAmbiencePalette;
}
export interface StageDockActionSpec {
  readonly id: StageDockActionId; readonly labelKo: string; readonly labelEn: string;
  readonly shortcutKey: string; readonly summaryKo: string; readonly summaryEn: string;
}
export interface ObstacleSlideResult {
  readonly position: Vec2M; readonly collided: boolean;
  readonly collidedObstacleIds: readonly string[]; readonly slidAlongAxis: ObstacleSlideAxis;
}
export interface LookAtEvaluation {
  readonly bodyHeadingDeg: number; readonly worldGazeDeg: number; readonly rawDeltaDeg: number;
  readonly headYawOffsetDeg: number; readonly maxYawClampDeg: number; readonly clamped: boolean;
  readonly targetLocked: boolean; readonly recommendedBodyTurnDeg: number;
}
export interface AvatarLocomotionInput {
  readonly currentPos: Vec2M; readonly velocity?: Velocity2M; readonly facingDeg?: number;
  readonly targetPos?: Vec2M | null; readonly directionalInput?: Vec2M | null;
  readonly sprint?: boolean; readonly dtSec?: number; readonly poseId?: CreatorPoseId;
  readonly lookAtTarget?: Vec2M | null; readonly obstacles?: readonly StageObstacleAabb[]; readonly reducedMotion?: boolean;
}
export interface AvatarLocomotionState {
  readonly position: Vec2M; readonly velocity: Velocity2M; readonly speedMps: number; readonly maxSpeedMps: number;
  readonly facingDeg: number; readonly gait: AvatarGaitState; readonly arrivedAtTarget: boolean;
  readonly remainingTargetDistanceM: number; readonly strideFrequencyHz: number; readonly strideLengthM: number;
  readonly pelvisBobMm: number; readonly torsoLeanDeg: number; readonly footGroundY: 0; readonly grounded: boolean;
  readonly leftFootContact: boolean; readonly rightFootContact: boolean;
  readonly pose: CreatorPoseSpec; readonly lookAt: LookAtEvaluation; readonly collision: ObstacleSlideResult;
}
export interface PeerProximityBubbleState {
  readonly deskId: string; readonly creatorName: string; readonly distanceM: number;
  readonly clarity: SpeechBubbleClarity; readonly opacity: number; readonly audible: boolean;
  readonly proximityTier: ProximityTier; readonly withinTableRadius: boolean;
  readonly speechTextKo: string; readonly speechTextEn: string;
}
export interface PinboardSummary {
  readonly notes: readonly WallStickyNote[]; readonly totalNotes: number;
  readonly completedNotes: number; readonly pendingNotes: number; readonly completionRatePercent: number;
}
export interface DeskPeekPortalState {
  readonly desk: StageCollaboratorDesk; readonly distanceM: number; readonly withinTableRadius: boolean;
  readonly clarity: SpeechBubbleClarity; readonly coEditInviteState: DeskCoEditInviteState; readonly canInstantJoin: boolean;
}
export interface StageInteractionsInput {
  readonly avatarPos: Vec2M; readonly voiceChatZone?: StageVoiceChatZoneId; readonly selfSpeechText?: string;
  readonly stickyNotes?: readonly WallStickyNote[]; readonly selectedDeskId?: string | null;
  readonly coEditInvitedDeskId?: string | null; readonly ambienceId?: StageAmbiencePresetId; readonly desks?: readonly StageCollaboratorDesk[];
}
export interface StageInteractionsState {
  readonly voiceChatZone: StageVoiceChatZoneSpec; readonly selfSpeechText: string;
  readonly peerBubbles: readonly PeerProximityBubbleState[]; readonly reachablePeerCount: number; readonly clearPeerCount: number;
  readonly pinboard: PinboardSummary; readonly deskPeek: DeskPeekPortalState; readonly ambience: StageAmbiencePreset;
}
export interface StageDockBudgetInput {
  readonly viewportWidthPx?: number; readonly viewportHeightPx?: number; readonly dockWidthPx?: number;
  readonly dockHeightPx?: number; readonly dockActionCount?: number; readonly advancedDrawerOpen?: boolean;
}
export interface StageDockBudgetState {
  readonly viewportWidthPx: number; readonly viewportHeightPx: number; readonly dockWidthPx: number; readonly dockHeightPx: number;
  readonly dockActionCount: number; readonly coreActionBudget: number; readonly maxOcclusionPercent: number;
  readonly screenOcclusionPercent: number; readonly effectiveStageOccupancyPercent: number;
  readonly withinOcclusionBudget: boolean; readonly withinActionBudget: boolean;
  readonly advancedCollapsedByDefault: boolean; readonly grade: "calm-optimal" | "within-budget" | "over-budget";
}
export interface AtelierStageLivingSnapshot {
  readonly schemaVersion: string; readonly brand: string; readonly studio: string; readonly violetFree: true;
  readonly locomotion: AvatarLocomotionState; readonly interactions: StageInteractionsState; readonly dockBudget: StageDockBudgetState;
}

const clamp = (value: number, min: number, max: number): number => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min);
const roundTo = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export function normalizeHue(hueDeg: number): number {
  return Number.isFinite(hueDeg) ? ((hueDeg % 360) + 360) % 360 : 0;
}
export function isForbiddenVioletHue(hueDeg: number): boolean {
  const n = normalizeHue(hueDeg);
  return n >= VIOLET_HUE_MIN && n <= VIOLET_HUE_MAX;
}
export function formatOklch(color: OklchColor, alpha?: number): string {
  const safeH = isForbiddenVioletHue(color.h) ? 158 : normalizeHue(color.h);
  const l = roundTo(clamp(color.l, 0, 1), 3);
  const c = roundTo(clamp(color.c, 0, 0.37), 3);
  const h = roundTo(safeH, 1);
  return typeof alpha === "number" && Number.isFinite(alpha) && alpha < 1
    ? `oklch(${l} ${c} ${h} / ${roundTo(clamp(alpha, 0, 1), 3)})`
    : `oklch(${l} ${c} ${h})`;
}
export function normalizeAngleDeg(deg: number): number {
  return Number.isFinite(deg) ? ((deg % 360) + 360) % 360 : 0;
}
export function shortestSignedAngleDeg(fromDeg: number, toDeg: number): number {
  const diff = ((toDeg - fromDeg + 540) % 360) - 180;
  return diff === -180 ? 180 : diff;
}

export const STAGE_FURNITURE_OBSTACLES: readonly StageObstacleAabb[] = [
  { id: "obs-desk-lead", kind: "desk", labelKo: "콘티 책상", labelEn: "Story Desk", minX: 1.5, maxX: 3.3, minY: 1.5, maxY: 2.7 },
  { id: "obs-desk-lineart", kind: "desk", labelKo: "선화 책상", labelEn: "Lineart Desk", minX: 4.8, maxX: 6.6, minY: 1.5, maxY: 2.7 },
  { id: "obs-desk-color", kind: "desk", labelKo: "채색 책상", labelEn: "Color Desk", minX: 8.1, maxX: 9.9, minY: 1.5, maxY: 2.7 },
  { id: "obs-desk-bg3d", kind: "desk", labelKo: "배경·식자 책상", labelEn: "BG & Lettering Desk", minX: 7.9, maxX: 9.8, minY: 5.0, maxY: 6.2 },
  { id: "obs-sofa-lounge", kind: "sofa", labelKo: "라운지 소파", labelEn: "Lounge Sofa", minX: 1.4, maxX: 3.6, minY: 5.5, maxY: 6.6 },
  { id: "obs-coffee-bar", kind: "coffee-bar", labelKo: "커피 바", labelEn: "Coffee Bar", minX: 10.5, maxX: 11.4, minY: 3.3, maxY: 4.7 },
];

export const STAGE_COLLABORATOR_DESKS: readonly StageCollaboratorDesk[] = [
  {
    id: "desk-lead", obstacleId: "obs-desk-lead", creatorName: "수빈", roleKo: "콘티·연출", roleEn: "Storyboard Lead",
    seatPos: { x: 2.4, y: 3.15 }, facingDeg: 270, episodeLabelKo: "24화 · 빗속 추격전 12컷", episodeLabelEn: "Ep.24 · Rain Chase Cut 12",
    activeLayerKo: "러프 콘티 + 말풍선 흐름", activeLayerEn: "Rough Conti + Balloon Flow",
    progressPercent: 78, pomodoroRemainingMin: 14, pomodoroTotalMin: 25, pomodoroPhase: "focus", currentPoseId: "sit-drawing",
    speechTextKo: "3컷 시선 동선만 살짝 오른쪽으로 빼면 좋겠어요", speechTextEn: "Let us shift Cut 3 sightline slightly right.",
    panelCount: 14, accentColor: { l: 0.56, c: 0.13, h: 158 },
  },
  {
    id: "desk-lineart", obstacleId: "obs-desk-lineart", creatorName: "도윤", roleKo: "선화·펜터치", roleEn: "Lineart & Ink",
    seatPos: { x: 5.7, y: 3.15 }, facingDeg: 270, episodeLabelKo: "24화 · 주인공 클로즈업 18컷", episodeLabelEn: "Ep.24 · Hero Close-Up Cut 18",
    activeLayerKo: "머리카락 외곽선 펜터치", activeLayerEn: "Hair Contour Ink Layer",
    progressPercent: 64, pomodoroRemainingMin: 9, pomodoroTotalMin: 25, pomodoroPhase: "focus", currentPoseId: "focus-headphones",
    speechTextKo: "머리카락 외곽선 강약 정리 마치고 넘길게요", speechTextEn: "Finishing hair line-weight cleanup now.",
    panelCount: 18, accentColor: { l: 0.62, c: 0.14, h: 52 },
  },
  {
    id: "desk-color", obstacleId: "obs-desk-color", creatorName: "하린", roleKo: "채색·조명", roleEn: "Color & Lighting",
    seatPos: { x: 9.0, y: 3.15 }, facingDeg: 270, episodeLabelKo: "24화 · 노을 옥상 시퀀스", episodeLabelEn: "Ep.24 · Rooftop Dusk Sequence",
    activeLayerKo: "역광 림라이트 보정", activeLayerEn: "Backlit Rim-Light Pass",
    progressPercent: 86, pomodoroRemainingMin: 4, pomodoroTotalMin: 5, pomodoroPhase: "break", currentPoseId: "coffee-sip",
    speechTextKo: "역광 림라이트 톤 확인해 보실 분 들러 주세요", speechTextEn: "Drop by if you want to review the dusk rim light.",
    panelCount: 11, accentColor: { l: 0.58, c: 0.13, h: 222 },
  },
  {
    id: "desk-bg3d", obstacleId: "obs-desk-bg3d", creatorName: "재민", roleKo: "배경·식자", roleEn: "Background & Lettering",
    seatPos: { x: 8.85, y: 4.55 }, facingDeg: 90, episodeLabelKo: "24화 · 골목 원근 + 효과음", episodeLabelEn: "Ep.24 · Alley Perspective & SFX",
    activeLayerKo: "배경 선화 합성 + 식자 검수", activeLayerEn: "BG Line Composite + Lettering QA",
    progressPercent: 92, pomodoroRemainingMin: 19, pomodoroTotalMin: 25, pomodoroPhase: "focus", currentPoseId: "applause-cheer",
    speechTextKo: "배경 선화 합성 끝! 최종 식자 검수 준비됐어요", speechTextEn: "Background composite done, ready for lettering QA.",
    panelCount: 22, accentColor: { l: 0.6, c: 0.14, h: 122 },
  },
];

export const CREATOR_STAGE_POSES: readonly CreatorPoseSpec[] = [
  { id: "sit-drawing", labelKo: "타블렛 작화", labelEn: "Tablet Drawing", shortKo: "작화", shortEn: "Draw", category: "work", posture: "seated", footGroundY: AVATAR_FOOT_GROUND_Y, spineTiltDeg: 11, headPitchDeg: -14, armCueKo: "펜 끝 미세 스트로크 · 왼손 단축키 대기", armCueEn: "Fine stylus strokes with shortcut hand anchored", defaultBubbleKo: "24화 펜선 다듬는 중이에요", defaultBubbleEn: "Refining Episode 24 ink lines", focusStatus: "focusing" },
  { id: "stretch-break", labelKo: "기지개 휴식", labelEn: "Stretch Break", shortKo: "기지개", shortEn: "Stretch", category: "rest", posture: "standing", footGroundY: AVATAR_FOOT_GROUND_Y, spineTiltDeg: -6, headPitchDeg: 10, armCueKo: "양팔 위로 뻗어 어깨·손목 긴장 완화", armCueEn: "Arms overhead releasing wrist and shoulder tension", defaultBubbleKo: "5분만 기지개 켜고 바로 이어서 할게요!", defaultBubbleEn: "Quick five-minute stretch before next panel!", focusStatus: "resting" },
  { id: "coffee-sip", labelKo: "커피 한 모금", labelEn: "Coffee Sip", shortKo: "커피", shortEn: "Coffee", category: "rest", posture: "standing", footGroundY: AVATAR_FOOT_GROUND_Y, spineTiltDeg: 2, headPitchDeg: 4, armCueKo: "따뜻한 머그컵을 들고 천천히 휴식", armCueEn: "Holding a warm studio mug for a calm pause", defaultBubbleKo: "커피 한 잔 내렸어요, 라운지 잠깐 오실래요?", defaultBubbleEn: "Fresh pour at the coffee bar—care for a quick break?", focusStatus: "available" },
  { id: "wave-hello", labelKo: "손 흔들기", labelEn: "Wave Hello", shortKo: "인사", shortEn: "Wave", category: "social", posture: "standing", footGroundY: AVATAR_FOOT_GROUND_Y, spineTiltDeg: 0, headPitchDeg: 2, armCueKo: "오른손을 부드럽게 흔들어 팀원 반기기", armCueEn: "Warm right-hand wave greeting teammates", defaultBubbleKo: "안녕하세요! 오늘 마감도 같이 힘내요", defaultBubbleEn: "Hey team! Ready for today's episode sprint", focusStatus: "available" },
  { id: "applause-cheer", labelKo: "마감 축하", labelEn: "Deadline Cheer", shortKo: "축하", shortEn: "Cheer", category: "social", posture: "standing", footGroundY: AVATAR_FOOT_GROUND_Y, spineTiltDeg: -3, headPitchDeg: 6, armCueKo: "박수 리듬으로 에피소드 완료 축하", armCueEn: "Celebratory applause for episode wrap", defaultBubbleKo: "이번 화 마감 통과! 다들 고생 많으셨어요", defaultBubbleEn: "Episode locked! Great work everyone", focusStatus: "available" },
  { id: "peek-critique", labelKo: "옆자리 원고 훔쳐보기", labelEn: "Desk Peek Critique", shortKo: "엿보기", shortEn: "Peek", category: "social", posture: "leaning", footGroundY: AVATAR_FOOT_GROUND_Y, spineTiltDeg: 18, headPitchDeg: -8, armCueKo: "상체를 살짝 기울여 동료 컷 구도 확인", armCueEn: "Leaning gently to inspect a teammate's layout", defaultBubbleKo: "오, 이 컷 카메라 각도 정말 살아 있네요!", defaultBubbleEn: "That camera angle brings the whole cut to life!", focusStatus: "available" },
  { id: "focus-headphones", labelKo: "집중 모드", labelEn: "Focus Headphones", shortKo: "집중", shortEn: "Focus", category: "work", posture: "seated", footGroundY: AVATAR_FOOT_GROUND_Y, spineTiltDeg: 14, headPitchDeg: -16, armCueKo: "헤드폰 착용 · 방해 금지 표시 · 25분 몰입", armCueEn: "Headphones on with calm focus aura active", defaultBubbleKo: "25분 집중 타이머 진행 중 · 급한 메모는 핀보드에!", defaultBubbleEn: "25m focus sprint—drop notes on the pinboard!", focusStatus: "focusing" },
  { id: "nap-desk", labelKo: "잠깐 눈붙이기", labelEn: "Desk Power Nap", shortKo: "휴식", shortEn: "Nap", category: "rest", posture: "seated", footGroundY: AVATAR_FOOT_GROUND_Y, spineTiltDeg: 28, headPitchDeg: -26, armCueKo: "팔을 괴고 10분 파워 냅 · 알림 음소거", armCueEn: "Resting on folded arms for a 10-minute reset", defaultBubbleKo: "10분만 눈 붙이고 15컷 채색 들어갈게요", defaultBubbleEn: "Taking a 10m reset before coloring Cut 15", focusStatus: "resting" },
];

export const STAGE_VOICE_CHAT_ZONES: readonly StageVoiceChatZoneSpec[] = [
  { id: "whisper", labelKo: "귓속말 (1.8m)", labelEn: "Whisper (1.8m)", clearRadiusM: PROXIMITY_WHISPER_RADIUS_M, fadeRadiusM: PROXIMITY_CLEAR_RADIUS_M, summaryKo: "옆자리 1:1 컷 피드백용 근거리 존", summaryEn: "Close 1:1 desk critique radius" },
  { id: "table", labelKo: "책상 그룹 (3.2m)", labelEn: "Table Group (3.2m)", clearRadiusM: PROXIMITY_CLEAR_RADIUS_M, fadeRadiusM: PROXIMITY_FADE_RADIUS_M, summaryKo: "3.2m 이내 선명 · 5.5m 감쇠 · 원거리 조용함", summaryEn: "Crisp within 3.2m, fading to 5.5m, silent beyond" },
  { id: "room", labelKo: "작업실 공지 (5.5m)", labelEn: "Studio Room (5.5m)", clearRadiusM: PROXIMITY_FADE_RADIUS_M, fadeRadiusM: PROXIMITY_ROOM_FADE_RADIUS_M, summaryKo: "마감 공유·전체 안내용 광역 전달 존", summaryEn: "Wide room-level announcement zone" },
];

export const STAGE_STICKY_NOTE_COLORS: readonly StickyNoteColorSpec[] = [
  { id: "butter-paper", labelKo: "버터지", labelEn: "Butter", fill: { l: 0.94, c: 0.085, h: 92 }, border: { l: 0.72, c: 0.11, h: 86 }, ink: { l: 0.24, c: 0.03, h: 82 } },
  { id: "sage-mint", labelKo: "세이지", labelEn: "Sage", fill: { l: 0.92, c: 0.065, h: 158 }, border: { l: 0.66, c: 0.1, h: 158 }, ink: { l: 0.22, c: 0.035, h: 162 } },
  { id: "terracotta-peach", labelKo: "테라코타", labelEn: "Terracotta", fill: { l: 0.91, c: 0.07, h: 46 }, border: { l: 0.68, c: 0.12, h: 42 }, ink: { l: 0.24, c: 0.04, h: 38 } },
  { id: "sky-slate", labelKo: "스카이", labelEn: "Sky", fill: { l: 0.92, c: 0.055, h: 224 }, border: { l: 0.66, c: 0.095, h: 226 }, ink: { l: 0.22, c: 0.035, h: 228 } },
];

export const DEFAULT_WALL_STICKY_NOTES: readonly WallStickyNote[] = [
  { id: "note-1", text: "24화 3컷 말풍선 여백 확보", author: "수빈", colorId: "butter-paper", done: false, pinSlot: 0, tiltDeg: -2 },
  { id: "note-2", text: "주인공 옥상 역광 톤 통일", author: "하린", colorId: "sage-mint", done: true, pinSlot: 1, tiltDeg: 1.5 },
  { id: "note-3", text: "18컷 효과음 폰트 외곽선 점검", author: "재민", colorId: "terracotta-peach", done: false, pinSlot: 2, tiltDeg: -1 },
  { id: "note-4", text: "오후 5시 최종 원고 내보내기 체크", author: "도윤", colorId: "sky-slate", done: false, pinSlot: 3, tiltDeg: 2 },
];

export const STAGE_AMBIENCE_PRESETS: readonly StageAmbiencePreset[] = [
  {
    id: "morning-sunlit-atelier", labelKo: "아침 햇살 아틀리에", labelEn: "Morning Sunlit Atelier", shortKo: "아침 햇살", shortEn: "Sunlit",
    polarity: "light", colorTempKelvin: 5400, ambientVolumePercent: 28, visualFatigueScore: 18, blueLightReductionPercent: 32,
    soundscapeKo: "창밖 아침 바람 · 사각거리는 연필 소리", soundscapeEn: "Morning breeze and gentle pencil grain",
    moodSummaryKo: "맑은 자연광 아래 콘티·선화에 집중하기 좋은 균형 조도", moodSummaryEn: "Balanced daylight tuned for storyboards and clean ink",
    palette: {
      wallBg: { l: 0.95, c: 0.016, h: 86 }, wallTrim: { l: 0.86, c: 0.025, h: 78 }, floorBase: { l: 0.92, c: 0.028, h: 80 },
      floorGrid: { l: 0.84, c: 0.022, h: 78 }, sunbeam: { l: 0.96, c: 0.075, h: 92 }, deskTop: { l: 0.87, c: 0.045, h: 68 },
      deskSide: { l: 0.74, c: 0.045, h: 64 }, pinboardBg: { l: 0.83, c: 0.055, h: 64 }, ink: { l: 0.24, c: 0.02, h: 62 },
      mutedInk: { l: 0.46, c: 0.02, h: 68 }, accent: { l: 0.54, c: 0.135, h: 158 }, bubbleBg: { l: 0.99, c: 0.008, h: 84 }, bubbleBorder: { l: 0.76, c: 0.035, h: 80 },
    },
  },
  {
    id: "rainy-night-deadline", labelKo: "빗소리 야간 마감실", labelEn: "Rainy Night Deadline", shortKo: "야간 마감", shortEn: "Rainy Night",
    polarity: "dark", colorTempKelvin: 3400, ambientVolumePercent: 46, visualFatigueScore: 22, blueLightReductionPercent: 68,
    soundscapeKo: "창문 빗소리 · 스탠드 저소음 앰비언트", soundscapeEn: "Soft window rain and warm desk lamp hum",
    moodSummaryKo: "야간 장시간 작업 시 눈부심을 낮춘 따뜻한 스탠드 조명", moodSummaryEn: "Low-glare warm lamps protecting eyes through late deadlines",
    palette: {
      wallBg: { l: 0.24, c: 0.024, h: 228 }, wallTrim: { l: 0.34, c: 0.026, h: 224 }, floorBase: { l: 0.2, c: 0.02, h: 230 },
      floorGrid: { l: 0.29, c: 0.022, h: 226 }, sunbeam: { l: 0.72, c: 0.095, h: 74 }, deskTop: { l: 0.34, c: 0.035, h: 56 },
      deskSide: { l: 0.25, c: 0.03, h: 52 }, pinboardBg: { l: 0.32, c: 0.038, h: 58 }, ink: { l: 0.93, c: 0.015, h: 84 },
      mutedInk: { l: 0.74, c: 0.02, h: 220 }, accent: { l: 0.78, c: 0.13, h: 74 }, bubbleBg: { l: 0.28, c: 0.024, h: 226 }, bubbleBorder: { l: 0.56, c: 0.08, h: 74 },
    },
  },
  {
    id: "warm-cafe-lounge", labelKo: "따뜻한 카페 라운지", labelEn: "Warm Cafe Lounge", shortKo: "카페 라운지", shortEn: "Warm Cafe",
    polarity: "light", colorTempKelvin: 4000, ambientVolumePercent: 38, visualFatigueScore: 20, blueLightReductionPercent: 52,
    soundscapeKo: "에스프레소 스팀 · 잔잔한 어쿠스틱 룸 톤", soundscapeEn: "Soft espresso steam and mellow acoustic room tone",
    moodSummaryKo: "아이디어 회의와 가벼운 컷 리뷰에 어울리는 포근한 우드 톤", moodSummaryEn: "Cozy warm wood palette tailored for casual storyboard chats",
    palette: {
      wallBg: { l: 0.93, c: 0.028, h: 66 }, wallTrim: { l: 0.82, c: 0.038, h: 58 }, floorBase: { l: 0.88, c: 0.042, h: 62 },
      floorGrid: { l: 0.8, c: 0.036, h: 58 }, sunbeam: { l: 0.93, c: 0.09, h: 72 }, deskTop: { l: 0.78, c: 0.062, h: 52 },
      deskSide: { l: 0.64, c: 0.058, h: 48 }, pinboardBg: { l: 0.76, c: 0.065, h: 56 }, ink: { l: 0.25, c: 0.03, h: 44 },
      mutedInk: { l: 0.45, c: 0.032, h: 50 }, accent: { l: 0.56, c: 0.135, h: 42 }, bubbleBg: { l: 0.98, c: 0.015, h: 74 }, bubbleBorder: { l: 0.72, c: 0.055, h: 54 },
    },
  },
  {
    id: "minimal-white-gallery", labelKo: "화이트 갤러리 전시", labelEn: "Minimal White Gallery", shortKo: "갤러리 전시", shortEn: "White Gallery",
    polarity: "light", colorTempKelvin: 6000, ambientVolumePercent: 14, visualFatigueScore: 26, blueLightReductionPercent: 18,
    soundscapeKo: "고요한 전시실 공기음 · 최소 알림 모드", soundscapeEn: "Quiet gallery air tone with minimal notifications",
    moodSummaryKo: "색 보정과 최종 원고 합평에 적합한 중립 표준광 공간", moodSummaryEn: "Neutral color-accurate gallery lighting for final review",
    palette: {
      wallBg: { l: 0.975, c: 0.005, h: 210 }, wallTrim: { l: 0.89, c: 0.008, h: 210 }, floorBase: { l: 0.945, c: 0.006, h: 210 },
      floorGrid: { l: 0.87, c: 0.008, h: 210 }, sunbeam: { l: 0.99, c: 0.012, h: 205 }, deskTop: { l: 0.92, c: 0.008, h: 210 },
      deskSide: { l: 0.81, c: 0.012, h: 212 }, pinboardBg: { l: 0.9, c: 0.01, h: 210 }, ink: { l: 0.2, c: 0.01, h: 218 },
      mutedInk: { l: 0.45, c: 0.012, h: 218 }, accent: { l: 0.5, c: 0.125, h: 222 }, bubbleBg: { l: 0.995, c: 0.003, h: 210 }, bubbleBorder: { l: 0.78, c: 0.018, h: 218 },
    },
  },
];

export const STAGE_CORE_DOCK_ACTIONS: readonly StageDockActionSpec[] = [
  { id: "move", labelKo: "이동", labelEn: "Move", shortcutKey: "W", summaryKo: "클릭 이동 · WASD 방향 조작", summaryEn: "Click-to-walk & WASD navigation" },
  { id: "pose", labelKo: "포즈", labelEn: "Pose", shortcutKey: "P", summaryKo: "8종 창작자 일상 동작 전환", summaryEn: "8 one-click creator poses" },
  { id: "bubble", labelKo: "말풍선", labelEn: "Bubble", shortcutKey: "B", summaryKo: "근접 말풍선 · 3단계 음성 존", summaryEn: "Proximity bubbles & 3 voice zones" },
  { id: "sticky", labelKo: "포스트잇", labelEn: "Sticky", shortcutKey: "N", summaryKo: "벽면 콘티 핀보드 메모 관리", summaryEn: "Wall conti sticky-note pinboard" },
  { id: "ambience", labelKo: "분위기", labelEn: "Ambience", shortcutKey: "L", summaryKo: "4종 작업실 조명·사운드 전환", summaryEn: "4 studio lighting & sound scenes" },
  { id: "desk-invite", labelKo: "책상 초대", labelEn: "Desk Invite", shortcutKey: "E", summaryKo: "옆자리 캔버스 엿보기 · 공동 작업", summaryEn: "Desk peek portal & co-editing" },
];

export const getCreatorPoseSpec = (poseId: CreatorPoseId): CreatorPoseSpec => CREATOR_STAGE_POSES.find((p) => p.id === poseId) ?? CREATOR_STAGE_POSES[0];
export const getStageVoiceChatZoneSpec = (zoneId: StageVoiceChatZoneId): StageVoiceChatZoneSpec => STAGE_VOICE_CHAT_ZONES.find((z) => z.id === zoneId) ?? STAGE_VOICE_CHAT_ZONES[1];
export const getStageAmbiencePreset = (presetId: StageAmbiencePresetId): StageAmbiencePreset => STAGE_AMBIENCE_PRESETS.find((p) => p.id === presetId) ?? STAGE_AMBIENCE_PRESETS[0];
export const getStickyNoteColorSpec = (colorId: StickyNoteColorId): StickyNoteColorSpec => STAGE_STICKY_NOTE_COLORS.find((c) => c.id === colorId) ?? STAGE_STICKY_NOTE_COLORS[0];

function clampToRoom(pos: Vec2M, radius: number): { readonly pos: Vec2M; readonly hitWall: boolean } {
  const x = clamp(pos.x, radius, STAGE_ROOM_WIDTH_M - radius);
  const y = clamp(pos.y, STAGE_NORTH_WALL_CLEARANCE_M + radius, STAGE_ROOM_DEPTH_M - radius);
  return { pos: { x, y }, hitWall: x !== pos.x || y !== pos.y };
}
function overlapsAabb(pos: Vec2M, radius: number, obs: StageObstacleAabb): boolean {
  const eps = 1e-4;
  return pos.x > obs.minX - radius + eps && pos.x < obs.maxX + radius - eps && pos.y > obs.minY - radius + eps && pos.y < obs.maxY + radius - eps;
}
function pushOutOfAabb(pos: Vec2M, radius: number, obs: StageObstacleAabb): Vec2M {
  const left = obs.minX - radius;
  const right = obs.maxX + radius;
  const top = obs.minY - radius;
  const bottom = obs.maxY + radius;
  const minPen = Math.min(Math.abs(pos.x - left), Math.abs(right - pos.x), Math.abs(pos.y - top), Math.abs(bottom - pos.y));
  if (minPen === Math.abs(pos.x - left)) return { x: left, y: pos.y };
  if (minPen === Math.abs(right - pos.x)) return { x: right, y: pos.y };
  return minPen === Math.abs(pos.y - top) ? { x: pos.x, y: top } : { x: pos.x, y: bottom };
}

/** 벽과 가구(책상·소파·커피 바) AABB를 기준으로 아바타가 걸리지 않고 미끄러지듯 충돌을 해소한다. */
export function resolveAvatarObstacleSlide(
  startPos: Vec2M,
  desiredPos: Vec2M,
  obstacles: readonly StageObstacleAabb[] = STAGE_FURNITURE_OBSTACLES,
  radius = AVATAR_COLLISION_RADIUS_M,
): ObstacleSlideResult {
  const initialRoom = clampToRoom(desiredPos, radius);
  let pos = initialRoom.pos;
  let hitWall = initialRoom.hitWall;
  let slidAlongAxis: ObstacleSlideAxis = hitWall ? "wall" : "none";
  const collidedIds = new Set<string>();

  for (let pass = 0; pass < 3; pass += 1) {
    let resolvedAny = false;
    for (const obs of obstacles) {
      if (!overlapsAabb(pos, radius, obs)) continue;
      collidedIds.add(obs.id);
      resolvedAny = true;
      const slideX: Vec2M = { x: pos.x, y: startPos.y };
      const slideY: Vec2M = { x: startPos.x, y: pos.y };
      const xFree = !overlapsAabb(slideX, radius, obs);
      const yFree = !overlapsAabb(slideY, radius, obs);
      if (xFree && yFree) {
        if (Math.abs(desiredPos.x - startPos.x) >= Math.abs(desiredPos.y - startPos.y)) { pos = slideX; slidAlongAxis = "x"; }
        else { pos = slideY; slidAlongAxis = "y"; }
      } else if (xFree) { pos = slideX; slidAlongAxis = "x"; }
      else if (yFree) { pos = slideY; slidAlongAxis = "y"; }
      else { pos = pushOutOfAabb(pos, radius, obs); slidAlongAxis = "corner-push"; }
    }
    const clampedPass = clampToRoom(pos, radius);
    pos = clampedPass.pos;
    if (clampedPass.hitWall) { hitWall = true; if (slidAlongAxis === "none") slidAlongAxis = "wall"; }
    if (!resolvedAny) break;
  }
  return { position: { x: roundTo(pos.x, 3), y: roundTo(pos.y, 3) }, collided: collidedIds.size > 0 || hitWall, collidedObstacleIds: [...collidedIds], slidAlongAxis };
}

/** 몸체 방향 기준 시선 자동 추적을 해부학적으로 자연스러운 ±55° 이내로 클램프한다. */
export function computeClampedLookAt(avatarPos: Vec2M, bodyHeadingDeg: number, lookAtTarget?: Vec2M | null): LookAtEvaluation {
  const normalizedBody = normalizeAngleDeg(bodyHeadingDeg);
  if (!lookAtTarget || Math.hypot(lookAtTarget.x - avatarPos.x, lookAtTarget.y - avatarPos.y) < 0.02) {
    return { bodyHeadingDeg: roundTo(normalizedBody, 1), worldGazeDeg: roundTo(normalizedBody, 1), rawDeltaDeg: 0, headYawOffsetDeg: 0, maxYawClampDeg: LOOK_AT_MAX_YAW_DEG, clamped: false, targetLocked: Boolean(lookAtTarget), recommendedBodyTurnDeg: 0 };
  }
  const targetAngle = normalizeAngleDeg((Math.atan2(lookAtTarget.y - avatarPos.y, lookAtTarget.x - avatarPos.x) * 180) / Math.PI);
  const rawDelta = shortestSignedAngleDeg(normalizedBody, targetAngle);
  const clampedYaw = clamp(rawDelta, -LOOK_AT_MAX_YAW_DEG, LOOK_AT_MAX_YAW_DEG);
  const clamped = Math.abs(rawDelta) > LOOK_AT_MAX_YAW_DEG;
  return {
    bodyHeadingDeg: roundTo(normalizedBody, 1), worldGazeDeg: roundTo(normalizeAngleDeg(normalizedBody + clampedYaw), 1),
    rawDeltaDeg: roundTo(rawDelta, 1), headYawOffsetDeg: roundTo(clampedYaw, 1), maxYawClampDeg: LOOK_AT_MAX_YAW_DEG,
    clamped, targetLocked: true, recommendedBodyTurnDeg: clamped ? roundTo(rawDelta - Math.sign(rawDelta) * LOOK_AT_MAX_YAW_DEG, 1) : 0,
  };
}

/** 캐릭터 클릭 이동·WASD 이동·장애물 슬라이드·감속 곡선·IK 바닥 접지·±55° 시선 상태를 평가한다. */
export function evaluateAvatarLocomotionAndPose(input: AvatarLocomotionInput): AvatarLocomotionState {
  const dt = clamp(input.dtSec ?? 0.2, 0.016, 0.5);
  const obstacles = input.obstacles ?? STAGE_FURNITURE_OBSTACLES;
  const prevVel: Velocity2M = input.velocity ?? { vx: 0, vy: 0 };
  const prevSpeed = Math.hypot(prevVel.vx, prevVel.vy);
  const maxSpeed = input.sprint ? RUN_MAX_SPEED_MPS : WALK_MAX_SPEED_MPS;
  const pose = getCreatorPoseSpec(input.poseId ?? "sit-drawing");
  const reducedMotion = Boolean(input.reducedMotion);

  let desiredVx = 0;
  let desiredVy = 0;
  let arrivedAtTarget = false;
  let remainingTargetDistanceM = 0;
  let hasActiveMoveIntent = false;

  const dirX = input.directionalInput?.x ?? 0;
  const dirY = input.directionalInput?.y ?? 0;
  const dirMag = Math.hypot(dirX, dirY);

  if (dirMag > 0.01) {
    hasActiveMoveIntent = true;
    const targetSpeed = maxSpeed * clamp(dirMag, 0, 1);
    const blend = reducedMotion ? 1 : clamp(dt * 7.5, 0.25, 1);
    desiredVx = prevVel.vx + ((dirX / dirMag) * targetSpeed - prevVel.vx) * blend;
    desiredVy = prevVel.vy + ((dirY / dirMag) * targetSpeed - prevVel.vy) * blend;
  } else if (input.targetPos) {
    const dx = input.targetPos.x - input.currentPos.x;
    const dy = input.targetPos.y - input.currentPos.y;
    const dist = Math.hypot(dx, dy);
    remainingTargetDistanceM = roundTo(dist, 3);
    if (dist <= ARRIVAL_EPSILON_M) arrivedAtTarget = true;
    else {
      hasActiveMoveIntent = true;
      const decelRatio = dist < DECEL_START_DISTANCE_M ? Math.pow(clamp(dist / DECEL_START_DISTANCE_M, 0, 1), 0.72) : 1;
      const cappedSpeed = Math.min(maxSpeed * decelRatio, dist / dt);
      desiredVx = (dx / dist) * cappedSpeed;
      desiredVy = (dy / dist) * cappedSpeed;
    }
  } else if (prevSpeed > STOP_SPEED_EPSILON_MPS) {
    const damping = reducedMotion ? 0 : Math.exp(-8.5 * dt);
    desiredVx = prevVel.vx * damping;
    desiredVy = prevVel.vy * damping;
    if (Math.hypot(desiredVx, desiredVy) <= STOP_SPEED_EPSILON_MPS) { desiredVx = 0; desiredVy = 0; }
  }

  const collision = resolveAvatarObstacleSlide(input.currentPos, { x: input.currentPos.x + desiredVx * dt, y: input.currentPos.y + desiredVy * dt }, obstacles);
  const actualVx = (collision.position.x - input.currentPos.x) / dt;
  const actualVy = (collision.position.y - input.currentPos.y) / dt;
  const actualSpeed = Math.hypot(actualVx, actualVy);
  const cleanSpeed = actualSpeed < STOP_SPEED_EPSILON_MPS ? 0 : roundTo(actualSpeed, 2);

  if (input.targetPos && !arrivedAtTarget) {
    remainingTargetDistanceM = roundTo(Math.hypot(input.targetPos.x - collision.position.x, input.targetPos.y - collision.position.y), 3);
    if (remainingTargetDistanceM <= ARRIVAL_EPSILON_M) arrivedAtTarget = true;
  }
  const isDecelerating = cleanSpeed > 0 && (
    (!hasActiveMoveIntent && cleanSpeed < prevSpeed) ||
    (Boolean(input.targetPos) && remainingTargetDistanceM > 0 && remainingTargetDistanceM < DECEL_START_DISTANCE_M && cleanSpeed < maxSpeed * 0.85)
  );
  let gait: AvatarGaitState = "idle";
  if (cleanSpeed > 0) gait = cleanSpeed >= 2.0 ? "running" : isDecelerating ? "decelerating" : "walking";

  const facingDeg = cleanSpeed > STOP_SPEED_EPSILON_MPS
    ? roundTo(normalizeAngleDeg((Math.atan2(actualVy, actualVx) * 180) / Math.PI), 1)
    : roundTo(normalizeAngleDeg(input.facingDeg ?? 90), 1);
  const lookAt = computeClampedLookAt(collision.position, facingDeg, input.lookAtTarget ?? (hasActiveMoveIntent && input.targetPos ? input.targetPos : null));
  const strideFrequencyHz = cleanSpeed === 0 ? 0 : roundTo(1.25 + (cleanSpeed / RUN_MAX_SPEED_MPS) * 1.65, 2);
  const strideLengthM = cleanSpeed === 0 ? 0 : roundTo(clamp(cleanSpeed / Math.max(strideFrequencyHz, 0.1), 0.18, 1.15), 2);
  const pelvisBobMm = reducedMotion || cleanSpeed === 0 ? 0 : roundTo(Math.min(26, cleanSpeed * 7.8), 1);
  const torsoLeanDeg = cleanSpeed === 0 ? pose.spineTiltDeg : roundTo(Math.min(9.5, cleanSpeed * 2.8), 1);

  return {
    position: collision.position, velocity: { vx: cleanSpeed === 0 ? 0 : roundTo(actualVx, 2), vy: cleanSpeed === 0 ? 0 : roundTo(actualVy, 2) },
    speedMps: cleanSpeed, maxSpeedMps: maxSpeed, facingDeg, gait, arrivedAtTarget, remainingTargetDistanceM,
    strideFrequencyHz, strideLengthM, pelvisBobMm, torsoLeanDeg, footGroundY: AVATAR_FOOT_GROUND_Y, grounded: true,
    leftFootContact: true, rightFootContact: gait !== "running", pose, lookAt, collision,
  };
}

/** 두 좌표 사이의 거리와 선택한 음성·채팅 존 기준 말풍선 투명도 및 선명도를 계산한다. */
export function evaluateProximityBubble(distanceM: number, voiceChatZoneId: StageVoiceChatZoneId = "table"): {
  readonly clarity: SpeechBubbleClarity; readonly opacity: number; readonly audible: boolean; readonly proximityTier: ProximityTier;
} {
  const safeDistance = Math.max(0, Number.isFinite(distanceM) ? distanceM : 99);
  const zone = getStageVoiceChatZoneSpec(voiceChatZoneId);
  const proximityTier: ProximityTier = safeDistance <= PROXIMITY_WHISPER_RADIUS_M ? "whisper"
    : safeDistance <= PROXIMITY_CLEAR_RADIUS_M ? "table"
    : safeDistance <= PROXIMITY_FADE_RADIUS_M ? "room" : "quiet";

  if (safeDistance <= zone.clearRadiusM) return { clarity: "clear", opacity: 1, audible: true, proximityTier };
  if (safeDistance <= zone.fadeRadiusM) {
    const t = clamp((safeDistance - zone.clearRadiusM) / Math.max(0.01, zone.fadeRadiusM - zone.clearRadiusM), 0, 1);
    const smooth = 1 - t * t * (3 - 2 * t);
    return { clarity: "fading", opacity: roundTo(0.16 + smooth * 0.84, 2), audible: true, proximityTier };
  }
  return { clarity: "quiet", opacity: 0, audible: false, proximityTier };
}

/** 벽면 콘티 핀보드에 새 포스트잇을 추가한다(빈 문자열 무시). */
export function addWallStickyNote(
  notes: readonly WallStickyNote[],
  input: { readonly text: string; readonly author?: string; readonly colorId?: StickyNoteColorId },
): readonly WallStickyNote[] {
  const trimmed = input.text.trim();
  if (trimmed.length === 0) return notes;
  const nextSlot = notes.reduce((acc, n) => Math.max(acc, n.pinSlot), -1) + 1;
  const tiltPattern = [-2, 1.5, -1, 2, -1.5, 1];
  const text = Array.from(trimmed).slice(0, 64).join("");
  const author = Array.from(input.author?.trim() || "나").slice(0, 16).join("");
  return [
    ...notes,
    { id: `note-${nextSlot + 1}`, text, author, colorId: input.colorId ?? "butter-paper", done: false, pinSlot: nextSlot, tiltDeg: tiltPattern[nextSlot % tiltPattern.length] ?? 0 },
  ];
}

export function toggleWallStickyNoteDone(notes: readonly WallStickyNote[], noteId: string): readonly WallStickyNote[] {
  return notes.map((note) => (note.id === noteId ? { ...note, done: !note.done } : note));
}

export function cycleWallStickyNoteColor(notes: readonly WallStickyNote[], noteId: string): readonly WallStickyNote[] {
  const order = STAGE_STICKY_NOTE_COLORS.map((c) => c.id);
  return notes.map((note) => (note.id === noteId ? { ...note, colorId: order[(order.indexOf(note.colorId) + 1) % order.length] ?? "butter-paper" } : note));
}

/** 근접 말풍선·핀보드·옆자리 책상 엿보기 포털·작업실 분위기 4종 상태를 통합 계산한다. */
export function evaluateStageInteractions(input: StageInteractionsInput): StageInteractionsState {
  const desks = input.desks ?? STAGE_COLLABORATOR_DESKS;
  const voiceChatZone = getStageVoiceChatZoneSpec(input.voiceChatZone ?? "table");
  const ambience = getStageAmbiencePreset(input.ambienceId ?? "morning-sunlit-atelier");
  const notes = input.stickyNotes ?? DEFAULT_WALL_STICKY_NOTES;

  const peerBubbles: readonly PeerProximityBubbleState[] = desks.map((desk) => {
    const distanceM = roundTo(Math.hypot(desk.seatPos.x - input.avatarPos.x, desk.seatPos.y - input.avatarPos.y), 2);
    const bubble = evaluateProximityBubble(distanceM, voiceChatZone.id);
    return {
      deskId: desk.id, creatorName: desk.creatorName, distanceM,
      clarity: bubble.clarity, opacity: bubble.opacity, audible: bubble.audible, proximityTier: bubble.proximityTier,
      withinTableRadius: distanceM <= PROXIMITY_CLEAR_RADIUS_M, speechTextKo: desk.speechTextKo, speechTextEn: desk.speechTextEn,
    };
  });

  const completedNotes = notes.filter((n) => n.done).length;
  const totalNotes = notes.length;
  const selectedDesk = desks.find((d) => d.id === input.selectedDeskId) ?? desks[0];
  const selectedBubble = peerBubbles.find((b) => b.deskId === selectedDesk.id) ?? peerBubbles[0];
  const coEditInviteState: DeskCoEditInviteState = input.coEditInvitedDeskId === selectedDesk.id
    ? "co-edit-ready" : input.selectedDeskId === selectedDesk.id ? "peeking" : "idle";

  return {
    voiceChatZone, selfSpeechText: (input.selfSpeechText ?? "24화 펜선 다듬는 중이에요").trim(), peerBubbles,
    reachablePeerCount: peerBubbles.filter((b) => b.audible).length,
    clearPeerCount: peerBubbles.filter((b) => b.clarity === "clear").length,
    pinboard: { notes, totalNotes, completedNotes, pendingNotes: totalNotes - completedNotes, completionRatePercent: totalNotes === 0 ? 0 : Math.round((completedNotes / totalNotes) * 100) },
    deskPeek: { desk: selectedDesk, distanceM: selectedBubble.distanceM, withinTableRadius: selectedBubble.withinTableRadius, clarity: selectedBubble.clarity, coEditInviteState, canInstantJoin: selectedBubble.distanceM <= PROXIMITY_FADE_RADIUS_M },
    ambience,
  };
}

/** 가상 스튜디오 Calm 하단 플로팅 도크의 화면 가림 비율(< 10%)과 6개 핵심 액션 예산을 검증한다. */
export function evaluateStageDockBudget(input?: StageDockBudgetInput): StageDockBudgetState {
  const cfg = input ?? {};
  const viewportWidthPx = clamp(cfg.viewportWidthPx ?? 1440, 320, 4096);
  const viewportHeightPx = clamp(cfg.viewportHeightPx ?? 900, 480, 2160);
  const dockWidthPx = clamp(cfg.dockWidthPx ?? 528, 120, viewportWidthPx);
  const dockHeightPx = clamp(cfg.dockHeightPx ?? 56, 44, viewportHeightPx);
  const dockActionCount = Math.max(0, Math.round(cfg.dockActionCount ?? STAGE_CORE_DOCK_ACTIONS.length));
  const screenOcclusionPercent = roundTo(((dockWidthPx * dockHeightPx) / (viewportWidthPx * viewportHeightPx)) * 100, 2);
  const effectiveStageOccupancyPercent = roundTo(100 - screenOcclusionPercent, 2);
  const withinOcclusionBudget = screenOcclusionPercent < MAX_DOCK_OCCLUSION_PERCENT;
  const withinActionBudget = dockActionCount <= CORE_DOCK_ACTION_BUDGET;
  const grade: StageDockBudgetState["grade"] = withinOcclusionBudget && withinActionBudget
    ? (screenOcclusionPercent <= 6 ? "calm-optimal" : "within-budget") : "over-budget";

  return {
    viewportWidthPx, viewportHeightPx, dockWidthPx, dockHeightPx, dockActionCount,
    coreActionBudget: CORE_DOCK_ACTION_BUDGET, maxOcclusionPercent: MAX_DOCK_OCCLUSION_PERCENT,
    screenOcclusionPercent, effectiveStageOccupancyPercent, withinOcclusionBudget, withinActionBudget,
    advancedCollapsedByDefault: !cfg.advancedDrawerOpen, grade,
  };
}

/** AtelierStage 전체 상태 스냅샷을 구성한다. */
export function buildAtelierStageLivingSnapshot(input: {
  readonly locomotion: AvatarLocomotionInput;
  readonly interactions: Omit<StageInteractionsInput, "avatarPos">;
  readonly dockBudget?: StageDockBudgetInput;
}): AtelierStageLivingSnapshot {
  const locomotion = evaluateAvatarLocomotionAndPose(input.locomotion);
  const interactions = evaluateStageInteractions({ ...input.interactions, avatarPos: locomotion.position });
  return {
    schemaVersion: ATELIER_STAGE_SCHEMA_VERSION, brand: ATELIER_STAGE_BRAND_NAME, studio: ATELIER_STAGE_STUDIO_NAME,
    violetFree: true, locomotion, interactions, dockBudget: evaluateStageDockBudget(input.dockBudget),
  };
}

/** AtelierStage 라이브 상태 스냅샷을 재현 가능한 JSON 문자열로 직렬화한다. */
export function exportAtelierStageLivingJson(snapshot: AtelierStageLivingSnapshot): string {
  const { locomotion, interactions, dockBudget } = snapshot;
  return JSON.stringify({
    schemaVersion: snapshot.schemaVersion, brand: snapshot.brand, studio: snapshot.studio, violetFree: snapshot.violetFree,
    avatar: {
      position: locomotion.position, facingDeg: locomotion.facingDeg, gait: locomotion.gait, speedMps: locomotion.speedMps,
      footGroundY: locomotion.footGroundY, grounded: locomotion.grounded, poseId: locomotion.pose.id,
      lookAt: { headYawOffsetDeg: locomotion.lookAt.headYawOffsetDeg, clamped: locomotion.lookAt.clamped, maxYawClampDeg: locomotion.lookAt.maxYawClampDeg },
      collision: locomotion.collision,
    },
    interactions: {
      voiceChatZone: interactions.voiceChatZone.id, selfSpeechText: interactions.selfSpeechText,
      reachablePeerCount: interactions.reachablePeerCount, clearPeerCount: interactions.clearPeerCount,
      ambienceId: interactions.ambience.id, colorTempKelvin: interactions.ambience.colorTempKelvin,
      ambientVolumePercent: interactions.ambience.ambientVolumePercent, visualFatigueScore: interactions.ambience.visualFatigueScore,
      visualFatigueScoreSource: "preset-example",
      pinboard: { totalNotes: interactions.pinboard.totalNotes, completedNotes: interactions.pinboard.completedNotes, completionRatePercent: interactions.pinboard.completionRatePercent, includesNoteText: false },
      deskPeek: { deskId: interactions.deskPeek.desk.id, creatorName: interactions.deskPeek.desk.creatorName, progressPercent: interactions.deskPeek.desk.progressPercent, coEditInviteState: interactions.deskPeek.coEditInviteState },
    },
    dockBudget: {
      dockActionCount: dockBudget.dockActionCount, screenOcclusionPercent: dockBudget.screenOcclusionPercent,
      withinOcclusionBudget: dockBudget.withinOcclusionBudget, effectiveStageOccupancyPercent: dockBudget.effectiveStageOccupancyPercent, grade: dockBudget.grade,
    },
  }, null, 2);
}
