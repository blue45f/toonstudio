/**
 * 가상 스튜디오 공간 물리 기본 데이터 · 4개 음향 회의실 · 10종 상호작용 오브젝트 프리셋.
 */

export const STUDIO_WORLD_WIDTH = 960;
export const STUDIO_WORLD_HEIGHT = 560;
export const MAX_PHYSICS_DT_SEC = 0.05;
export const MIN_PHYSICS_DT_SEC = 0.001;
export const DEFAULT_AVATAR_RADIUS = 16;
export const DEFAULT_AVATAR_MAX_SPEED = 240;
export const DEFAULT_AVATAR_FRICTION = 7.2;
export const DEFAULT_AVATAR_RESTITUTION = 0.25;
export const ESPRESSO_SPEED_MULTIPLIER = 1.18;

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export type AcousticRoomId =
  | "storyboard-room-a"
  | "ad-review-room-b"
  | "global-meeting-room-c"
  | "open-lounge";

export type StudioLightingMood = "daylight" | "warm-atelier" | "night-crunch";

export type InteractiveObjectKind =
  | "sit-chair"
  | "whiteboard-review"
  | "deadline-board"
  | "coffee-machine"
  | "meeting-door"
  | "light-switch"
  | "asset-pedestal"
  | "rest-sofa"
  | "throwable-paper-plane"
  | "quest-kiosk";

export const ALL_INTERACTIVE_OBJECT_KINDS: readonly InteractiveObjectKind[] = [
  "sit-chair",
  "whiteboard-review",
  "deadline-board",
  "coffee-machine",
  "meeting-door",
  "light-switch",
  "asset-pedestal",
  "rest-sofa",
  "throwable-paper-plane",
  "quest-kiosk",
];

export interface CircleBody {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly radius: number;
  readonly mass: number;
  readonly restitution: number;
  readonly friction: number;
  readonly maxSpeed: number;
}

export interface AabbCollider {
  readonly id: string;
  readonly labelKo: string;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly restitution: number;
  readonly solid: boolean;
  /** 연동된 회의실 문 ID. 문이 열리면(active=true) 충돌을 해제한다. */
  readonly doorObjectId?: string;
}

export interface AcousticRoomZone {
  readonly id: AcousticRoomId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly doorObjectId: string | null;
  readonly wallAttenuationDb: number;
  readonly openDoorBleedFactor: number;
}

export interface StudioInteractiveObject {
  readonly id: string;
  readonly kind: InteractiveObjectKind;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly x: number;
  readonly y: number;
  readonly interactRadius: number;
  readonly snapPoint?: Vec2;
  readonly roomId: AcousticRoomId;
  readonly active: boolean;
  readonly stateLabelKo: string;
}

export interface ThrowableProjectile {
  readonly id: string;
  readonly kind: "paper-plane" | "cheer-sticker";
  readonly labelKo: string;
  readonly body: CircleBody;
  readonly ttlSec: number;
  readonly bounces: number;
  readonly senderName: string;
}

export interface StudioPhysicsWorldState {
  readonly player: CircleBody;
  readonly targetPoint: Vec2 | null;
  readonly seatedObjectId: string | null;
  readonly stamina: number;
  readonly focusBuffSec: number;
  readonly lightingMood: StudioLightingMood;
  readonly deadlineRemainingHours: number;
  readonly deadlineUrgentMode: boolean;
  readonly whiteboardNotes: readonly string[];
  readonly showcaseAssets: readonly string[];
  readonly inspectedAssetIndex: number;
  readonly questBoardOpenCount: number;
  readonly objects: readonly StudioInteractiveObject[];
  readonly colliders: readonly AabbCollider[];
  readonly rooms: readonly AcousticRoomZone[];
  readonly projectiles: readonly ThrowableProjectile[];
  readonly activeRoomId: AcousticRoomId;
  readonly lastInteractionLog: string;
  readonly tickCount: number;
}

export const ACOUSTIC_ROOMS: readonly AcousticRoomZone[] = [
  {
    id: "storyboard-room-a",
    nameKo: "콘티 회의실 A",
    nameEn: "Storyboard Room A",
    bounds: { minX: 24, minY: 24, maxX: 296, maxY: 214 },
    doorObjectId: "obj-door-room-a",
    wallAttenuationDb: 42,
    openDoorBleedFactor: 0.28,
  },
  {
    id: "ad-review-room-b",
    nameKo: "AD 검수실 B",
    nameEn: "AD Review Room B",
    bounds: { minX: 332, minY: 24, maxX: 628, maxY: 214 },
    doorObjectId: "obj-door-room-b",
    wallAttenuationDb: 46,
    openDoorBleedFactor: 0.24,
  },
  {
    id: "global-meeting-room-c",
    nameKo: "글로벌 외주 미팅룸 C",
    nameEn: "Global Outsource Room C",
    bounds: { minX: 664, minY: 24, maxX: 936, maxY: 214 },
    doorObjectId: "obj-door-room-c",
    wallAttenuationDb: 44,
    openDoorBleedFactor: 0.26,
  },
  {
    id: "open-lounge",
    nameKo: "오픈 라운지",
    nameEn: "Open Lounge & Global Plaza",
    bounds: { minX: 24, minY: 224, maxX: 936, maxY: 536 },
    doorObjectId: null,
    wallAttenuationDb: 0,
    openDoorBleedFactor: 1,
  },
];

export const SHOWCASE_3D_ASSETS: readonly string[] = [
  "우체국 야경 3D 배경 (BLENDER-5.3)",
  "옥상 추격전 모듈 세트 (LOW-POLY)",
  "서울 지하철 2호선 객차 내부",
  "동남아 열대 카페 테라스 팩",
];

export function createDefaultStudioColliders(): readonly AabbCollider[] {
  return [
    { id: "wall-a-left", labelKo: "회의실 A 좌측 벽", minX: 24, minY: 206, maxX: 132, maxY: 220, restitution: 0.35, solid: true },
    { id: "wall-a-door", labelKo: "회의실 A 방음문", minX: 132, minY: 206, maxX: 192, maxY: 220, restitution: 0.2, solid: true, doorObjectId: "obj-door-room-a" },
    { id: "wall-a-right", labelKo: "회의실 A 우측 벽", minX: 192, minY: 206, maxX: 300, maxY: 220, restitution: 0.35, solid: true },
    { id: "wall-ab-div", labelKo: "회의실 A-B 격벽", minX: 296, minY: 24, maxX: 332, maxY: 220, restitution: 0.35, solid: true },
    { id: "wall-b-left", labelKo: "검수실 B 좌측 벽", minX: 332, minY: 206, maxX: 450, maxY: 220, restitution: 0.35, solid: true },
    { id: "wall-b-door", labelKo: "검수실 B 방음문", minX: 450, minY: 206, maxX: 510, maxY: 220, restitution: 0.2, solid: true, doorObjectId: "obj-door-room-b" },
    { id: "wall-b-right", labelKo: "검수실 B 우측 벽", minX: 510, minY: 206, maxX: 628, maxY: 220, restitution: 0.35, solid: true },
    { id: "wall-bc-div", labelKo: "검수실 B-C 격벽", minX: 628, minY: 24, maxX: 664, maxY: 220, restitution: 0.35, solid: true },
    { id: "wall-c-left", labelKo: "미팅룸 C 좌측 벽", minX: 664, minY: 206, maxX: 770, maxY: 220, restitution: 0.35, solid: true },
    { id: "wall-c-door", labelKo: "미팅룸 C 방음문", minX: 770, minY: 206, maxX: 830, maxY: 220, restitution: 0.2, solid: true, doorObjectId: "obj-door-room-c" },
    { id: "wall-c-right", labelKo: "미팅룸 C 우측 벽", minX: 830, minY: 206, maxX: 936, maxY: 220, restitution: 0.35, solid: true },
    { id: "table-room-a", labelKo: "콘티 회의 테이블", minX: 112, minY: 92, maxX: 212, maxY: 140, restitution: 0.25, solid: true },
    { id: "table-room-b", labelKo: "AD 컬러 캘리브레이션 데스크", minX: 428, minY: 92, maxX: 532, maxY: 140, restitution: 0.25, solid: true },
    { id: "table-room-c", labelKo: "글로벌 통역 원탁", minX: 748, minY: 92, maxX: 852, maxY: 140, restitution: 0.25, solid: true },
    { id: "pillar-lounge-center", labelKo: "중앙 에셋 진열 기둥", minX: 446, minY: 356, maxX: 514, maxY: 406, restitution: 0.4, solid: true },
  ];
}

export function createDefaultStudioInteractiveObjects(): readonly StudioInteractiveObject[] {
  return [
    {
      id: "obj-chair-work-01",
      kind: "sit-chair",
      nameKo: "인체공학 작업 의자",
      nameEn: "Ergonomic Desk Chair",
      x: 162,
      y: 166,
      interactRadius: 56,
      snapPoint: { x: 162, y: 166 },
      roomId: "storyboard-room-a",
      active: false,
      stateLabelKo: "착석 대기",
    },
    {
      id: "obj-whiteboard-01",
      kind: "whiteboard-review",
      nameKo: "공유 원고 화이트보드",
      nameEn: "Shared Manuscript Whiteboard",
      x: 480,
      y: 58,
      interactRadius: 68,
      roomId: "ad-review-room-b",
      active: false,
      stateLabelKo: "검수 메모 2건",
    },
    {
      id: "obj-deadline-board-01",
      kind: "deadline-board",
      nameKo: "마감 카운트다운 전광판",
      nameEn: "Deadline Countdown Board",
      x: 340,
      y: 256,
      interactRadius: 68,
      roomId: "open-lounge",
      active: false,
      stateLabelKo: "D-18시간 · 정상",
    },
    {
      id: "obj-coffee-machine-01",
      kind: "coffee-machine",
      nameKo: "자동 에스프레소 머신",
      nameEn: "Auto Espresso Machine",
      x: 112,
      y: 288,
      interactRadius: 64,
      roomId: "open-lounge",
      active: false,
      stateLabelKo: "추출 가능 (+25 스태미나)",
    },
    {
      id: "obj-door-room-a",
      kind: "meeting-door",
      nameKo: "콘티 회의실 A 방음문",
      nameEn: "Room A Acoustic Door",
      x: 162,
      y: 213,
      interactRadius: 64,
      roomId: "storyboard-room-a",
      active: false,
      stateLabelKo: "방음 닫힘 (42dB 차폐)",
    },
    {
      id: "obj-door-room-b",
      kind: "meeting-door",
      nameKo: "AD 검수실 B 방음문",
      nameEn: "Room B Acoustic Door",
      x: 480,
      y: 213,
      interactRadius: 64,
      roomId: "ad-review-room-b",
      active: false,
      stateLabelKo: "방음 닫힘 (46dB 차폐)",
    },
    {
      id: "obj-door-room-c",
      kind: "meeting-door",
      nameKo: "글로벌 미팅룸 C 방음문",
      nameEn: "Room C Acoustic Door",
      x: 800,
      y: 213,
      interactRadius: 64,
      roomId: "global-meeting-room-c",
      active: true,
      stateLabelKo: "문 열림 (입장 가능)",
    },
    {
      id: "obj-light-switch-01",
      kind: "light-switch",
      nameKo: "스튜디오 조명 스위치",
      nameEn: "Studio Light Switch",
      x: 244,
      y: 256,
      interactRadius: 58,
      roomId: "open-lounge",
      active: true,
      stateLabelKo: "주광색 (Daylight)",
    },
    {
      id: "obj-asset-pedestal-01",
      kind: "asset-pedestal",
      nameKo: "3D 에셋 진열대",
      nameEn: "3D Asset Pedestal",
      x: 480,
      y: 432,
      interactRadius: 72,
      roomId: "open-lounge",
      active: false,
      stateLabelKo: SHOWCASE_3D_ASSETS[0] ?? "3D 에셋",
    },
    {
      id: "obj-rest-sofa-01",
      kind: "rest-sofa",
      nameKo: "휴식 아틀리에 소파",
      nameEn: "Atelier Rest Sofa",
      x: 132,
      y: 468,
      interactRadius: 68,
      snapPoint: { x: 132, y: 468 },
      roomId: "open-lounge",
      active: false,
      stateLabelKo: "휴식 가능 (+30 스태미나)",
    },
    {
      id: "obj-paper-plane-01",
      kind: "throwable-paper-plane",
      nameKo: "응원 종이비행기 발사대",
      nameEn: "Cheer Paper Plane Launcher",
      x: 620,
      y: 332,
      interactRadius: 68,
      roomId: "open-lounge",
      active: false,
      stateLabelKo: "종이비행기 투척 준비",
    },
    {
      id: "obj-quest-kiosk-01",
      kind: "quest-kiosk",
      nameKo: "글로벌 외주 게시판 키오스크",
      nameEn: "Global Outsourcing Quest Kiosk",
      x: 822,
      y: 318,
      interactRadius: 76,
      roomId: "open-lounge",
      active: false,
      stateLabelKo: "외주 파티 모집 열기",
    },
  ];
}
