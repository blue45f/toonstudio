/**
 * 웹툰 스튜디오 본사(toon-hq) 설계도 — 순수 데이터.
 *
 * 웹툰 제작 공정을 공간 동선으로 옮겼다. 북쪽 줄은 "만드는 방"(콘티 → 작화 → 채색 → 배경·3D),
 * 가운데 줄은 "다듬고 확인하는 방"(자료실 · 집중 부스 · 식자 · PD 리뷰 · 마감 워룸),
 * 남쪽 줄은 "들어오고 쉬고 회의하고 내보내는 방"(로비 · 탕비 라운지 · 기획 회의실 · 연재 데스크)이다.
 * 두 복도(메인 홀, 남쪽 홀)가 모든 방을 잇고, 방마다 복도 쪽 벽에 2타일 폭 문이 있다.
 *
 * 좌표는 월드 픽셀(1타일 = 48px)이며, 가구 좌표는 스프라이트 바닥 중앙(base)이다. manifest 조립과 렌더 장면 구성은
 * 각각 toon-hq-manifest, office2d-scene이 이 데이터를 읽어서 한다.
 */
import type { StudioVirtualSpaceInteractionAction } from "../../studio-virtual-space-interactions";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "../../studio-virtual-space-model";
import type { StudioOfficeZoneType } from "../../studio-virtual-space-office-zones";
import type { StudioNpcRole } from "../../studio-virtual-space-npc-director";
import type { PlaceWorkMode } from "../../studio-virtual-space-place-modes";
import type { Office2dSpriteKey } from "../office2d-sprite-catalog";

export const TOON_HQ_PLACE_ID = "toon-hq";
export const TOON_HQ_TILE = 48;
export const TOON_HQ_WIDTH = 50 * TOON_HQ_TILE;
export const TOON_HQ_HEIGHT = 34 * TOON_HQ_TILE;
/** 방 북쪽 벽(정면이 보이는 3/4 시점 벽) 두께. 방 안쪽 윗부분을 차지한다. */
export const TOON_HQ_NORTH_WALL = 2 * 48;
export const TOON_HQ_SOUTH_WALL = 14;
export const TOON_HQ_SIDE_WALL = 12;
export const TOON_HQ_DOOR_WIDTH = 2 * TOON_HQ_TILE;
/** 월드 바깥 테두리 두께. */
export const TOON_HQ_BORDER = TOON_HQ_TILE;

export type ToonHqFloor = "oak" | "walnut" | "herringbone" | "carpet-sage" | "carpet-navy" | "terrazzo" | "concrete" | "tile-cream" | "cork";
export type ToonHqPrivacy = "public" | "private" | "silent";
export type ToonHqRow = "top" | "middle" | "bottom" | "corridor";

export interface ToonHqRoom {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly row: ToonHqRow;
  readonly floor: ToonHqFloor;
  /** 웹툰 공정 순서(0부터). 공정 레일에 이 순서로 보인다. 공정이 아닌 방은 null. */
  readonly pipelineStep: number | null;
  readonly pipelineKo?: string;
  readonly pipelineEn?: string;
  /** 공정 바에 쓰는 짧은 이름(2~3글자). */
  readonly pipelineShortKo?: string;
  readonly pipelineShortEn?: string;
  /** 미니맵처럼 좁은 곳에 쓰는 짧은 이름. 없으면 공정 약칭을 쓴다. */
  readonly mapShortKo?: string;
  readonly mapShortEn?: string;
  readonly action?: StudioVirtualSpaceInteractionAction;
  readonly privacy: ToonHqPrivacy;
  readonly zoneType?: StudioOfficeZoneType;
  readonly workMode?: PlaceWorkMode;
  /** 복도 쪽 문 중심 x. 북쪽·남쪽 벽에 각각 둘 수 있다. */
  readonly doors: { readonly north?: number; readonly south?: number };
  /** 벽 색(정면). */
  readonly wallTone: string;
  /** 방 분위기 조명 색. */
  readonly ambient: string;
  readonly spawn: StudioVirtualSpacePoint;
}

export type ToonHqDepth = "y-sort" | "floor" | "wall";

export interface ToonHqFurniture {
  readonly id: string;
  readonly sprite: Office2dSpriteKey;
  readonly roomId: string;
  readonly x: number;
  readonly y: number;
  /** 화면에 그릴 너비(px). 높이는 스프라이트 비율을 따른다. */
  readonly width: number;
  readonly depth?: ToonHqDepth;
  /** 바닥 접지면 충돌 상자(가로·세로). 없으면 통과 가능한 장식이다. */
  readonly footprint?: { readonly width: number; readonly height: number };
  readonly interaction?: {
    readonly action: StudioVirtualSpaceInteractionAction;
    readonly labelKo: string;
    readonly labelEn: string;
    readonly radius: number;
  };
  /** 좌석이 딸린 책상. 좌석 방향(north = 책상 뒤에 앉아 화면을 향함)은 스프라이트 카탈로그가 정한다. */
  readonly seat?: { readonly labelKo: string; readonly labelEn: string };
  /** 모니터·스탠드 등 국소 광원. */
  readonly glow?: { readonly color: string; readonly radius: number; readonly offsetY: number };
  /** 좌우 반전. */
  readonly flip?: boolean;
}

export interface ToonHqPhysicsProp {
  readonly id: string;
  readonly sprite: Office2dSpriteKey;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly shape: { readonly type: "circle"; readonly radius: number } | { readonly type: "box"; readonly halfWidth: number; readonly halfHeight: number };
  readonly mass: number;
  readonly restitution: number;
  readonly damping: number;
  readonly returnHome: boolean;
  /** 굴러가는 물체(짐볼)는 회전해 보인다. */
  readonly rolls?: boolean;
}

export interface ToonHqSeat {
  readonly id: string;
  readonly roomId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly anchor: StudioVirtualSpacePoint;
  readonly approach: StudioVirtualSpacePoint;
  readonly exit: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  /** 시각적 엉덩이 위치(의자 위). */
  readonly attach: StudioVirtualSpacePoint;
  /** 이 좌석을 만든 가구 id. */
  readonly furnitureId: string;
}

export interface ToonHqNpc {
  readonly id: string;
  readonly skinKey: string;
  readonly roomId: string;
  readonly point: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  readonly behavior: "idle" | "talk" | "draw" | "review" | "patrol";
  readonly patrol?: readonly StudioVirtualSpacePoint[];
  readonly speed?: number;
  /** NPC 대화·도구 연결 역할. */
  readonly role: StudioNpcRole;
}

const T = TOON_HQ_TILE;
const point = (x: number, y: number): StudioVirtualSpacePoint => Object.freeze({ x, y });

function room(definition: ToonHqRoom): ToonHqRoom {
  return Object.freeze(definition);
}

export const TOON_HQ_ROOMS: readonly ToonHqRoom[] = Object.freeze([
  room({ id: "hq-story-room", labelKo: "콘티·시나리오 룸", labelEn: "Story & Storyboard Room", mapShortKo: "콘티룸", mapShortEn: "Story", row: "top",
    descriptionKo: "기획안과 시나리오를 다듬고 콘티 보드로 회차 흐름을 잡는 방이에요.",
    descriptionEn: "Shape scripts and pin the episode flow on the storyboard wall.",
    x: T, y: T, width: 12 * T, height: 10 * T, floor: "walnut", pipelineStep: 0, pipelineKo: "시나리오·콘티", pipelineEn: "Script & boards", pipelineShortKo: "콘티", pipelineShortEn: "Boards",
    action: "story", privacy: "public", zoneType: "studio", workMode: "focus-desk", doors: { south: 7 * T }, wallTone: "#e9dcc8", ambient: "#ffd9a8",
    spawn: point(7 * T, 470) }),
  room({ id: "hq-ink-bay", labelKo: "작화 오픈 데스크", labelEn: "Sketch & Ink Bay", row: "top",
    descriptionKo: "스케치와 선화를 그리는 8석 오픈 데스크예요. 자리를 잡으면 드로잉 스튜디오로 바로 이어져요.",
    descriptionEn: "An eight-seat open bay for sketching and inking that opens straight into the drawing studio.",
    x: 13 * T, y: T, width: 15 * T, height: 10 * T, floor: "herringbone", pipelineStep: 1, pipelineKo: "스케치·선화", pipelineEn: "Sketch & ink", pipelineShortKo: "작화", pipelineShortEn: "Ink",
    action: "canvas", privacy: "public", zoneType: "studio", workMode: "focus-desk", doors: { south: 20.5 * T }, wallTone: "#efe6d6", ambient: "#fff1d6",
    spawn: point(20.5 * T, 480) }),
  room({ id: "hq-color-lab", labelKo: "채색 랩", labelEn: "Color Lab", row: "top",
    descriptionKo: "캘리브레이션된 모니터로 채색과 명암을 맞추는 방이에요.",
    descriptionEn: "Calibrated displays for flats, rendering and lighting passes.",
    x: 28 * T, y: T, width: 10 * T, height: 10 * T, floor: "oak", pipelineStep: 2, pipelineKo: "채색", pipelineEn: "Color", pipelineShortKo: "채색", pipelineShortEn: "Color",
    action: "canvas", privacy: "public", zoneType: "studio", workMode: "focus-desk", doors: { south: 33 * T }, wallTone: "#e4ecef", ambient: "#dff3ff",
    spawn: point(33 * T, 480) }),
  room({ id: "hq-bg3d-lab", labelKo: "배경·3D 랩", labelEn: "Background & 3D Lab", row: "top",
    descriptionKo: "배경 원화와 3D 레이아웃을 잡는 방이에요. 필요할 때만 3D 보기로 전환해요.",
    descriptionEn: "Background paintings and 3D layouts. Switch to the 3D view only when you need it.",
    x: 38 * T, y: T, width: 11 * T, height: 10 * T, floor: "concrete", pipelineStep: 3, pipelineKo: "배경·3D", pipelineEn: "Background & 3D", pipelineShortKo: "배경", pipelineShortEn: "BG/3D",
    action: "canvas", privacy: "public", zoneType: "studio", workMode: "focus-desk", doors: { south: 43.5 * T }, wallTone: "#dfe3ea", ambient: "#d8e4ff",
    spawn: point(43.5 * T, 480) }),
  room({ id: "hq-main-hall", labelKo: "메인 홀", labelEn: "Main Hall", row: "corridor",
    descriptionKo: "작업실과 검수실을 잇는 중앙 복도예요.", descriptionEn: "The central corridor between the making rooms and the review rooms.",
    x: T, y: 11 * T, width: 48 * T, height: 3 * T, floor: "terrazzo", pipelineStep: null,
    privacy: "public", doors: {}, wallTone: "#ece6dc", ambient: "#fff6e8", spawn: point(25 * T, 12.5 * T) }),
  room({ id: "hq-reference-library", labelKo: "자료실", labelEn: "Reference Library", mapShortKo: "자료실", mapShortEn: "Library", row: "middle",
    descriptionKo: "작화 자료와 설정집을 찾는 조용한 자료실이에요. 들어오면 마이크가 꺼져요.",
    descriptionEn: "A quiet library of references and setting bibles. Your mic mutes when you enter.",
    x: T, y: 14 * T, width: 10 * T, height: 8 * T, floor: "cork", pipelineStep: null,
    action: "assets", privacy: "silent", zoneType: "library", workMode: "focus-desk", doors: { north: 6 * T, south: 6 * T }, wallTone: "#e8dcc6", ambient: "#ffe2b3",
    spawn: point(6 * T, 20 * T) }),
  room({ id: "hq-focus-booths", labelKo: "집중 부스", labelEn: "Focus Booths", mapShortKo: "부스", mapShortEn: "Focus", row: "middle",
    descriptionKo: "마감 직전 몰입이 필요할 때 쓰는 1인 부스예요. 방해 금지 상태가 돼요.",
    descriptionEn: "Solo pods for deadline focus. You switch to do-not-disturb inside.",
    x: 11 * T, y: 14 * T, width: 8 * T, height: 8 * T, floor: "carpet-sage", pipelineStep: null,
    privacy: "silent", zoneType: "focus-zone", workMode: "focus-desk", doors: { south: 15 * T }, wallTone: "#dfe7dd", ambient: "#e9ffe6",
    spawn: point(15 * T, 20.4 * T) }),
  room({ id: "hq-lettering-desk", labelKo: "식자·편집 데스크", labelEn: "Lettering Desk", row: "middle",
    descriptionKo: "대사와 효과음, 말풍선을 앉히는 식자 작업 자리예요.",
    descriptionEn: "Where dialogue, SFX and speech balloons are set.",
    x: 19 * T, y: 14 * T, width: 9 * T, height: 8 * T, floor: "oak", pipelineStep: 4, pipelineKo: "식자", pipelineEn: "Lettering", pipelineShortKo: "식자", pipelineShortEn: "Letter",
    action: "comic", privacy: "public", zoneType: "studio", workMode: "focus-desk", doors: { north: 23.5 * T, south: 23.5 * T }, wallTone: "#f1e7d8", ambient: "#fff0d0",
    spawn: point(23.5 * T, 21 * T) }),
  room({ id: "hq-review-room", labelKo: "PD 리뷰룸", labelEn: "PD Review Room", mapShortKo: "리뷰룸", mapShortEn: "Review", row: "middle",
    descriptionKo: "큰 화면으로 원고를 함께 보며 수정 지시를 남기는 검수실이에요.",
    descriptionEn: "Review pages together on the big screen and leave revision notes.",
    x: 28 * T, y: 14 * T, width: 12 * T, height: 8 * T, floor: "carpet-navy", pipelineStep: 5, pipelineKo: "PD 검수", pipelineEn: "PD review", pipelineShortKo: "검수", pipelineShortEn: "Review",
    action: "review", privacy: "private", zoneType: "meeting-room", workMode: "conference", doors: { north: 30 * T, south: 30 * T }, wallTone: "#d9dde8", ambient: "#cfe0ff",
    spawn: point(30 * T, 20.8 * T) }),
  room({ id: "hq-war-room", labelKo: "마감 워룸", labelEn: "Deadline War Room", mapShortKo: "워룸", mapShortEn: "War room", row: "middle",
    descriptionKo: "회차별 마감과 진행 상황을 칸반 보드로 확인하는 방이에요.",
    descriptionEn: "Track every episode's deadline and status on the kanban boards.",
    x: 40 * T, y: 14 * T, width: 9 * T, height: 8 * T, floor: "concrete", pipelineStep: null,
    action: "assistant", privacy: "public", zoneType: "studio", workMode: "conference", doors: { north: 44.5 * T, south: 44.5 * T }, wallTone: "#e7e2da", ambient: "#ffe0d0",
    spawn: point(44.5 * T, 21 * T) }),
  room({ id: "hq-south-hall", labelKo: "남쪽 홀", labelEn: "South Hall", row: "corridor",
    descriptionKo: "로비·라운지·회의실로 이어지는 복도예요.", descriptionEn: "The corridor to the lobby, lounge and meeting rooms.",
    x: T, y: 22 * T, width: 48 * T, height: 2 * T, floor: "terrazzo", pipelineStep: null,
    privacy: "public", doors: {}, wallTone: "#ece6dc", ambient: "#fff6e8", spawn: point(25 * T, 23 * T) }),
  room({ id: "hq-lobby", labelKo: "로비·리셉션", labelEn: "Lobby & Reception", mapShortKo: "로비", mapShortEn: "Lobby", row: "bottom",
    descriptionKo: "출근하면 처음 도착하는 곳이에요. 오늘의 공정과 팀원 위치를 확인하세요.",
    descriptionEn: "Where you arrive. Check today's pipeline and where your teammates are.",
    x: T, y: 24 * T, width: 12 * T, height: 9 * T, floor: "tile-cream", pipelineStep: null,
    action: "community", privacy: "public", zoneType: "reception", workMode: "lounge", doors: { north: 7 * T }, wallTone: "#efe4d2", ambient: "#fff0d8",
    spawn: point(7 * T, 1470) }),
  room({ id: "hq-lounge", labelKo: "탕비 라운지", labelEn: "Pantry Lounge", mapShortKo: "라운지", mapShortEn: "Lounge", row: "bottom",
    descriptionKo: "커피 한 잔과 짧은 대화로 머리를 식히는 라운지예요. 짐볼은 밀어서 굴릴 수 있어요.",
    descriptionEn: "Coffee, quick chats and a bouncy ball you can push around.",
    x: 13 * T, y: 24 * T, width: 15 * T, height: 9 * T, floor: "herringbone", pipelineStep: null,
    action: "community", privacy: "public", zoneType: "lounge", workMode: "lounge", doors: { north: 20.5 * T }, wallTone: "#f3e3d3", ambient: "#ffd8b0",
    spawn: point(20.5 * T, 1300) }),
  room({ id: "hq-meeting-room", labelKo: "기획 회의실", labelEn: "Planning Room", mapShortKo: "회의실", mapShortEn: "Planning", row: "bottom",
    descriptionKo: "새 작품 기획과 주간 회의를 하는 비공개 회의실이에요.",
    descriptionEn: "A private room for new-series planning and weekly syncs.",
    x: 28 * T, y: 24 * T, width: 12 * T, height: 9 * T, floor: "carpet-navy", pipelineStep: null,
    action: "live", privacy: "private", zoneType: "meeting-room", workMode: "conference", doors: { north: 30 * T }, wallTone: "#dde0e8", ambient: "#d6e4ff",
    spawn: point(30 * T, 1300) }),
  room({ id: "hq-publish-desk", labelKo: "연재 데스크", labelEn: "Publishing Desk", row: "bottom",
    descriptionKo: "검수가 끝난 회차를 예약 업로드하고 독자 반응을 확인하는 곳이에요.",
    descriptionEn: "Schedule approved episodes and watch reader response.",
    x: 40 * T, y: 24 * T, width: 9 * T, height: 9 * T, floor: "walnut", pipelineStep: 6, pipelineKo: "연재 업로드", pipelineEn: "Publish", pipelineShortKo: "연재", pipelineShortEn: "Publish",
    action: "assistant", privacy: "public", zoneType: "studio", workMode: "focus-desk", doors: { north: 44.5 * T }, wallTone: "#ece2d4", ambient: "#fff0dc",
    spawn: point(44.5 * T, 1300) }),
]);

const ROOM_BY_ID: ReadonlyMap<string, ToonHqRoom> = new Map(TOON_HQ_ROOMS.map((entry) => [entry.id, entry] as const));

/** 미니맵·좁은 칩용 짧은 방 이름. 본사 방이 아니거나 짧은 이름이 없으면 null. */
export function toonHqRoomShortLabel(roomId: string): { readonly ko: string; readonly en: string } | null {
  const entry = ROOM_BY_ID.get(roomId);
  if (!entry) return null;
  const ko = entry.mapShortKo ?? entry.pipelineShortKo;
  const en = entry.mapShortEn ?? entry.pipelineShortEn;
  return ko && en ? { ko, en } : null;
}

function furniture(definition: ToonHqFurniture): ToonHqFurniture {
  return Object.freeze(definition);
}

const deskSeat = (ko: string, en: string) => Object.freeze({ labelKo: ko, labelEn: en });
const SCREEN_GLOW = "#9fd4ff";
const WARM_GLOW = "#ffd59a";

/** 작업 책상 줄을 만든다. */
function deskRow(input: {
  readonly prefix: string;
  readonly roomId: string;
  readonly sprites: readonly Office2dSpriteKey[];
  readonly xs: readonly number[];
  readonly y: number;
  readonly action: StudioVirtualSpaceInteractionAction;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly glow?: string;
}): readonly ToonHqFurniture[] {
  return input.xs.map((x, index) => furniture({
    id: `${input.prefix}-${index + 1}`,
    sprite: input.sprites[index % input.sprites.length] ?? "desk-artist",
    roomId: input.roomId,
    x, y: input.y, width: 128,
    footprint: { width: 120, height: 40 },
    interaction: { action: input.action, labelKo: `${input.labelKo} ${index + 1}`, labelEn: `${input.labelEn} ${index + 1}`, radius: 70 },
    seat: deskSeat(`${input.labelKo} ${index + 1}번 자리`, `${input.labelEn} seat ${index + 1}`),
    glow: { color: input.glow ?? SCREEN_GLOW, radius: 74, offsetY: -46 },
  }));
}

export const TOON_HQ_FURNITURE: readonly ToonHqFurniture[] = Object.freeze([
  // 콘티·시나리오 룸
  ...deskRow({ prefix: "hq-writer-desk", roomId: "hq-story-room", sprites: ["desk-writer"], xs: [170, 350], y: 250,
    action: "story", labelKo: "시나리오 데스크", labelEn: "Script desk", glow: WARM_GLOW }),
  furniture({ id: "hq-storyboard-wall", sprite: "storyboard-wall", roomId: "hq-story-room", x: 528, y: 182, width: 150,
    footprint: { width: 140, height: 26 }, interaction: { action: "comic", labelKo: "콘티 보드", labelEn: "Storyboard wall", radius: 84 } }),
  furniture({ id: "hq-story-table", sprite: "table-round", roomId: "hq-story-room", x: 300, y: 430, width: 124,
    footprint: { width: 108, height: 34 }, interaction: { action: "story", labelKo: "시나리오 회의 테이블", labelEn: "Script table", radius: 86 } }),
  furniture({ id: "hq-story-rug", sprite: "rug-round", roomId: "hq-story-room", x: 300, y: 446, width: 168, depth: "floor" }),
  furniture({ id: "hq-story-plant", sprite: "plant-monstera", roomId: "hq-story-room", x: 88, y: 196, width: 60, footprint: { width: 36, height: 18 } }),
  furniture({ id: "hq-story-lamp", sprite: "floor-lamp", roomId: "hq-story-room", x: 590, y: 470, width: 40, footprint: { width: 20, height: 12 },
    glow: { color: WARM_GLOW, radius: 120, offsetY: -80 } }),

  // 작화 오픈 데스크(8석)
  ...deskRow({ prefix: "hq-ink-desk-a", roomId: "hq-ink-bay", sprites: ["desk-artist", "desk-inking"], xs: [708, 852, 1116, 1260], y: 250,
    action: "canvas", labelKo: "작화 데스크 A", labelEn: "Ink desk A" }),
  ...deskRow({ prefix: "hq-ink-desk-b", roomId: "hq-ink-bay", sprites: ["desk-inking", "desk-artist"], xs: [708, 852, 1116, 1260], y: 440,
    action: "canvas", labelKo: "작화 데스크 B", labelEn: "Ink desk B" }),
  furniture({ id: "hq-ink-rug", sprite: "rug-rect", roomId: "hq-ink-bay", x: 984, y: 366, width: 196, depth: "floor" }),
  furniture({ id: "hq-ink-partition", sprite: "partition", roomId: "hq-ink-bay", x: 984, y: 248, width: 44, footprint: { width: 30, height: 14 } }),
  furniture({ id: "hq-ink-plant", sprite: "plant-olive", roomId: "hq-ink-bay", x: 984, y: 190, width: 52, footprint: { width: 30, height: 16 } }),

  // 채색 랩
  ...deskRow({ prefix: "hq-color-desk-a", roomId: "hq-color-lab", sprites: ["desk-colorist"], xs: [1470, 1700], y: 250,
    action: "canvas", labelKo: "채색 데스크 A", labelEn: "Color desk A", glow: "#c9b6ff" }),
  ...deskRow({ prefix: "hq-color-desk-b", roomId: "hq-color-lab", sprites: ["desk-colorist"], xs: [1470, 1700], y: 440,
    action: "canvas", labelKo: "채색 데스크 B", labelEn: "Color desk B", glow: "#ffc2d9" }),
  furniture({ id: "hq-color-rug", sprite: "rug-round", roomId: "hq-color-lab", x: 1585, y: 368, width: 176, depth: "floor" }),
  furniture({ id: "hq-color-plant", sprite: "plant-monstera", roomId: "hq-color-lab", x: 1585, y: 190, width: 56, footprint: { width: 34, height: 16 } }),

  // 배경·3D 랩
  ...deskRow({ prefix: "hq-bg3d-desk-a", roomId: "hq-bg3d-lab", sprites: ["desk-3d"], xs: [1960, 2216], y: 250,
    action: "canvas", labelKo: "배경 데스크 A", labelEn: "Background desk A", glow: "#8fd0ff" }),
  ...deskRow({ prefix: "hq-bg3d-desk-b", roomId: "hq-bg3d-lab", sprites: ["desk-3d"], xs: [1960, 2216], y: 440,
    action: "canvas", labelKo: "배경 데스크 B", labelEn: "Background desk B", glow: "#8fd0ff" }),
  furniture({ id: "hq-bg3d-printer", sprite: "printer-station", roomId: "hq-bg3d-lab", x: 2088, y: 200, width: 100,
    footprint: { width: 88, height: 26 }, interaction: { action: "assets", labelKo: "대형 출력기", labelEn: "Large-format printer", radius: 72 } }),

  // 메인 홀 장식
  furniture({ id: "hq-hall-plant-west", sprite: "plant-olive", roomId: "hq-main-hall", x: 84, y: 590, width: 48, footprint: { width: 28, height: 14 } }),
  furniture({ id: "hq-hall-plant-east", sprite: "plant-olive", roomId: "hq-main-hall", x: 2316, y: 590, width: 48, footprint: { width: 28, height: 14 } }),
  furniture({ id: "hq-hall-cooler", sprite: "water-cooler", roomId: "hq-main-hall", x: 1250, y: 572, width: 42, footprint: { width: 30, height: 14 } }),

  // 자료실
  ...[120, 216, 360, 456].map((x, index) => furniture({
    id: `hq-library-shelf-${index + 1}`, sprite: "bookshelf", roomId: "hq-reference-library", x, y: 836, width: 92,
    footprint: { width: 90, height: 26 },
    ...(index === 1 ? { interaction: { action: "assets" as const, labelKo: "레퍼런스 서가", labelEn: "Reference shelves", radius: 86 } } : {}),
  })),
  ...[170, 410].map((x, index) => furniture({
    id: `hq-library-table-${index + 1}`, sprite: "table-round", roomId: "hq-reference-library", x, y: 980, width: 104,
    footprint: { width: 92, height: 28 },
  })),

  // 집중 부스(4개)
  ...[585, 675, 765, 855].map((x, index) => furniture({
    id: `hq-focus-booth-${index + 1}`, sprite: "focus-booth", roomId: "hq-focus-booths", x, y: 852, width: 72,
    footprint: { width: 80, height: 40 },
    interaction: { action: "canvas", labelKo: `집중 부스 ${index + 1}`, labelEn: `Focus booth ${index + 1}`, radius: 56 },
    seat: deskSeat(`집중 부스 ${index + 1}`, `Focus booth ${index + 1}`),
    glow: { color: "#bff5c9", radius: 56, offsetY: -40 },
  })),

  // 식자·편집 데스크
  ...deskRow({ prefix: "hq-letter-desk-a", roomId: "hq-lettering-desk", sprites: ["desk-lettering"], xs: [1010, 1246], y: 830,
    action: "comic", labelKo: "식자 데스크 A", labelEn: "Lettering desk A" }),
  ...deskRow({ prefix: "hq-letter-desk-b", roomId: "hq-lettering-desk", sprites: ["desk-lettering"], xs: [1010, 1246], y: 960,
    action: "comic", labelKo: "식자 데스크 B", labelEn: "Lettering desk B" }),

  // PD 리뷰룸
  furniture({ id: "hq-review-screen", sprite: "review-screen", roomId: "hq-review-room", x: 1660, y: 802, width: 190,
    footprint: { width: 176, height: 24 }, interaction: { action: "review", labelKo: "리뷰 스크린", labelEn: "Review screen", radius: 100 },
    glow: { color: "#a9c8ff", radius: 150, offsetY: -70 } }),
  furniture({ id: "hq-review-table", sprite: "table-conference", roomId: "hq-review-room", x: 1660, y: 940, width: 230,
    footprint: { width: 216, height: 36 } }),
  furniture({ id: "hq-review-rug", sprite: "rug-rect", roomId: "hq-review-room", x: 1660, y: 960, width: 254, depth: "floor" }),
  furniture({ id: "hq-review-lamp", sprite: "floor-lamp", roomId: "hq-review-room", x: 1390, y: 800, width: 40, footprint: { width: 20, height: 12 },
    glow: { color: WARM_GLOW, radius: 110, offsetY: -80 } }),
  furniture({ id: "hq-review-plant", sprite: "plant-monstera", roomId: "hq-review-room", x: 1875, y: 800, width: 56, footprint: { width: 34, height: 16 } }),

  // 마감 워룸
  furniture({ id: "hq-war-kanban-1", sprite: "kanban-board", roomId: "hq-war-room", x: 2025, y: 812, width: 140,
    footprint: { width: 130, height: 24 }, interaction: { action: "assistant", labelKo: "회차 칸반 보드", labelEn: "Episode kanban", radius: 86 } }),
  furniture({ id: "hq-war-kanban-2", sprite: "kanban-board", roomId: "hq-war-room", x: 2250, y: 812, width: 140,
    footprint: { width: 130, height: 24 }, interaction: { action: "assistant", labelKo: "마감 일정 보드", labelEn: "Deadline board", radius: 86 } }),
  furniture({ id: "hq-war-table", sprite: "table-round", roomId: "hq-war-room", x: 2136, y: 962, width: 110,
    footprint: { width: 96, height: 28 } }),

  // 로비·리셉션
  furniture({ id: "hq-lobby-reception", sprite: "reception-desk", roomId: "hq-lobby", x: 190, y: 1330, width: 150,
    footprint: { width: 140, height: 32 }, interaction: { action: "community", labelKo: "리셉션 데스크", labelEn: "Reception desk", radius: 90 } }),
  furniture({ id: "hq-lobby-rug", sprite: "rug-rect", roomId: "hq-lobby", x: 470, y: 1470, width: 190, depth: "floor" }),
  furniture({ id: "hq-lobby-sofa", sprite: "sofa", roomId: "hq-lobby", x: 470, y: 1340, width: 136, footprint: { width: 126, height: 30 } }),
  furniture({ id: "hq-lobby-side-table", sprite: "side-table", roomId: "hq-lobby", x: 560, y: 1440, width: 52, footprint: { width: 40, height: 18 } }),
  furniture({ id: "hq-lobby-plant-west", sprite: "plant-monstera", roomId: "hq-lobby", x: 86, y: 1290, width: 58, footprint: { width: 34, height: 16 } }),
  furniture({ id: "hq-lobby-plant-east", sprite: "plant-olive", roomId: "hq-lobby", x: 588, y: 1290, width: 50, footprint: { width: 30, height: 14 } }),

  // 탕비 라운지
  furniture({ id: "hq-lounge-coffee", sprite: "coffee-machine", roomId: "hq-lounge", x: 700, y: 1292, width: 84,
    footprint: { width: 80, height: 26 }, interaction: { action: "community", labelKo: "커피 머신", labelEn: "Coffee machine", radius: 76 },
    glow: { color: WARM_GLOW, radius: 70, offsetY: -50 } }),
  furniture({ id: "hq-lounge-cooler", sprite: "water-cooler", roomId: "hq-lounge", x: 790, y: 1290, width: 44, footprint: { width: 30, height: 14 } }),
  furniture({ id: "hq-lounge-vending", sprite: "vending-machine", roomId: "hq-lounge", x: 1270, y: 1300, width: 80,
    footprint: { width: 76, height: 28 }, interaction: { action: "community", labelKo: "간식 자판기", labelEn: "Snack machine", radius: 70 },
    glow: { color: "#bde6ff", radius: 80, offsetY: -60 } }),
  furniture({ id: "hq-lounge-rug", sprite: "rug-round", roomId: "hq-lounge", x: 980, y: 1470, width: 210, depth: "floor" }),
  furniture({ id: "hq-lounge-sofa", sprite: "sofa", roomId: "hq-lounge", x: 1150, y: 1420, width: 140, footprint: { width: 130, height: 30 } }),
  furniture({ id: "hq-lounge-side-table", sprite: "side-table", roomId: "hq-lounge", x: 1150, y: 1508, width: 54, footprint: { width: 42, height: 18 } }),
  furniture({ id: "hq-lounge-lamp", sprite: "floor-lamp", roomId: "hq-lounge", x: 660, y: 1530, width: 40, footprint: { width: 20, height: 12 },
    glow: { color: WARM_GLOW, radius: 130, offsetY: -80 } }),

  // 기획 회의실
  furniture({ id: "hq-meeting-board", sprite: "kanban-board", roomId: "hq-meeting-room", x: 1660, y: 1278, width: 150,
    footprint: { width: 140, height: 24 }, interaction: { action: "live", labelKo: "기획 화이트보드", labelEn: "Planning whiteboard", radius: 80 } }),
  furniture({ id: "hq-meeting-table", sprite: "table-conference", roomId: "hq-meeting-room", x: 1660, y: 1400, width: 260,
    footprint: { width: 244, height: 36 }, interaction: { action: "live", labelKo: "회의 테이블", labelEn: "Meeting table", radius: 120 } }),
  furniture({ id: "hq-meeting-rug", sprite: "rug-rect", roomId: "hq-meeting-room", x: 1660, y: 1420, width: 276, depth: "floor" }),
  furniture({ id: "hq-meeting-plant", sprite: "plant-monstera", roomId: "hq-meeting-room", x: 1878, y: 1540, width: 56, footprint: { width: 34, height: 16 } }),

  // 연재 데스크
  ...deskRow({ prefix: "hq-publish-desk", roomId: "hq-publish-desk", sprites: ["desk-producer"], xs: [2030, 2246], y: 1330,
    action: "assistant", labelKo: "연재 데스크", labelEn: "Publishing desk", glow: WARM_GLOW }),
  furniture({ id: "hq-publish-printer", sprite: "printer-station", roomId: "hq-publish-desk", x: 2136, y: 1505, width: 104,
    footprint: { width: 92, height: 26 } }),
  furniture({ id: "hq-publish-cabinet", sprite: "filing-cabinet", roomId: "hq-publish-desk", x: 1975, y: 1505, width: 56, footprint: { width: 50, height: 22 } }),
  furniture({ id: "hq-publish-box", sprite: "comic-box", roomId: "hq-publish-desk", x: 2300, y: 1510, width: 52, footprint: { width: 44, height: 22 } }),
]);

/** 벽면 장식(창문·포스터·시계·네온). 북쪽 벽 정면에 붙는다. x는 중심, wallRoomId는 붙는 방. */
export interface ToonHqWallDecor {
  readonly id: string;
  readonly sprite: Office2dSpriteKey;
  readonly wallRoomId: string;
  readonly x: number;
  readonly width: number;
}

export const TOON_HQ_WALL_DECOR: readonly ToonHqWallDecor[] = Object.freeze([
  ...[180, 420].map((x, index) => ({ id: `hq-story-window-${index}`, sprite: "window" as const, wallRoomId: "hq-story-room", x, width: 86 })),
  ...[720, 900, 1070, 1250].map((x, index) => ({ id: `hq-ink-window-${index}`, sprite: "window" as const, wallRoomId: "hq-ink-bay", x, width: 86 })),
  ...[1460, 1710].map((x, index) => ({ id: `hq-color-window-${index}`, sprite: "window" as const, wallRoomId: "hq-color-lab", x, width: 86 })),
  ...[1940, 2240].map((x, index) => ({ id: `hq-bg3d-window-${index}`, sprite: "window" as const, wallRoomId: "hq-bg3d-lab", x, width: 86 })),
  { id: "hq-story-pinboard", sprite: "pinboard", wallRoomId: "hq-story-room", x: 300, width: 58 },
  { id: "hq-ink-clock", sprite: "wall-clock", wallRoomId: "hq-ink-bay", x: 984, width: 34 },
  { id: "hq-library-pinboard", sprite: "pinboard", wallRoomId: "hq-reference-library", x: 432, width: 58 },
  { id: "hq-focus-clock", sprite: "wall-clock", wallRoomId: "hq-focus-booths", x: 820, width: 32 },
  { id: "hq-lettering-neon", sprite: "neon-balloon", wallRoomId: "hq-lettering-desk", x: 1010, width: 70 },
  { id: "hq-review-poster", sprite: "poster", wallRoomId: "hq-review-room", x: 1840, width: 52 },
  { id: "hq-war-clock", sprite: "wall-clock", wallRoomId: "hq-war-room", x: 2340 - 40, width: 32 },
  { id: "hq-lobby-poster-west", sprite: "poster", wallRoomId: "hq-lobby", x: 150, width: 56 },
  { id: "hq-lobby-tv", sprite: "wall-tv", wallRoomId: "hq-lobby", x: 435, width: 64 },
  { id: "hq-lobby-poster-east", sprite: "poster", wallRoomId: "hq-lobby", x: 520, width: 56 },
  { id: "hq-lounge-neon", sprite: "neon-balloon", wallRoomId: "hq-lounge", x: 1120, width: 76 },
  { id: "hq-meeting-tv", sprite: "wall-tv", wallRoomId: "hq-meeting-room", x: 1660, width: 72 },
  { id: "hq-meeting-clock", sprite: "wall-clock", wallRoomId: "hq-meeting-room", x: 1860, width: 32 },
  { id: "hq-publish-tv", sprite: "wall-tv", wallRoomId: "hq-publish-desk", x: 2228, width: 58 },
  { id: "hq-publish-poster", sprite: "poster", wallRoomId: "hq-publish-desk", x: 2290, width: 52 },
]);

export const TOON_HQ_PHYSICS_PROPS: readonly ToonHqPhysicsProp[] = Object.freeze([
  { id: "hq-lounge-ball", sprite: "exercise-ball", x: 1050, y: 1350, width: 38, shape: { type: "circle", radius: 18 }, mass: 3, restitution: 0.78, damping: 0.9, returnHome: false, rolls: true },
  { id: "hq-hall-ball", sprite: "exercise-ball", x: 1500, y: 1104, width: 34, shape: { type: "circle", radius: 16 }, mass: 2.5, restitution: 0.8, damping: 0.8, returnHome: false, rolls: true },
  { id: "hq-lounge-beanbag-1", sprite: "beanbag", x: 870, y: 1440, width: 58, shape: { type: "circle", radius: 25 }, mass: 18, restitution: 0.05, damping: 7, returnHome: true },
  { id: "hq-lounge-beanbag-2", sprite: "beanbag", x: 990, y: 1505, width: 58, shape: { type: "circle", radius: 25 }, mass: 18, restitution: 0.05, damping: 7, returnHome: true },
  { id: "hq-lounge-chair", sprite: "chair-front", x: 1268, y: 1420, width: 40, shape: { type: "circle", radius: 15 }, mass: 9, restitution: 0.2, damping: 5, returnHome: true },
  { id: "hq-ink-cart", sprite: "supply-cart", x: 984, y: 330, width: 56, shape: { type: "box", halfWidth: 24, halfHeight: 14 }, mass: 14, restitution: 0.15, damping: 3.5, returnHome: true },
  { id: "hq-color-cart", sprite: "supply-cart", x: 1585, y: 330, width: 56, shape: { type: "box", halfWidth: 24, halfHeight: 14 }, mass: 14, restitution: 0.15, damping: 3.5, returnHome: true },
  { id: "hq-story-bin", sprite: "paper-bin", x: 470, y: 300, width: 28, shape: { type: "circle", radius: 11 }, mass: 3, restitution: 0.3, damping: 4, returnHome: true },
  { id: "hq-letter-bin", sprite: "paper-bin", x: 1128, y: 1010, width: 28, shape: { type: "circle", radius: 11 }, mass: 3, restitution: 0.3, damping: 4, returnHome: true },
  { id: "hq-library-box", sprite: "comic-box", x: 288, y: 930, width: 40, shape: { type: "box", halfWidth: 17, halfHeight: 12 }, mass: 9, restitution: 0.1, damping: 5, returnHome: true },
]);

export const TOON_HQ_NPCS: readonly ToonHqNpc[] = Object.freeze([
  { id: "hq-npc-concierge", skinKey: "npc-concierge", roomId: "hq-lobby", point: point(190, 1272), facing: "down", behavior: "idle", role: "guide" },
  { id: "hq-npc-artist", skinKey: "npc-artist", roomId: "hq-ink-bay", point: point(984, 480), facing: "down", behavior: "patrol", speed: 54, role: "artist",
    patrol: [point(760, 330), point(1200, 330), point(984, 480)] },
  { id: "hq-npc-editor", skinKey: "npc-editor", roomId: "hq-review-room", point: point(1450, 900), facing: "right", behavior: "review", role: "editor" },
  { id: "hq-npc-producer", skinKey: "npc-producer", roomId: "hq-war-room", point: point(2136, 880), facing: "down", behavior: "patrol", speed: 50, role: "producer",
    patrol: [point(2050, 900), point(2222, 900), point(2136, 1012)] },
  { id: "hq-npc-archivist", skinKey: "npc-archivist", roomId: "hq-reference-library", point: point(288, 900), facing: "left", behavior: "patrol", speed: 40, role: "librarian",
    patrol: [point(150, 900), point(420, 900), point(288, 792)] },
  { id: "hq-npc-cafe", skinKey: "npc-cafe", roomId: "hq-lounge", point: point(800, 1350), facing: "left", behavior: "patrol", speed: 46, role: "cafe",
    patrol: [point(720, 1350), point(900, 1340), point(1000, 1330)] },
  { id: "hq-npc-host", skinKey: "npc-host", roomId: "hq-south-hall", point: point(600, 1104), facing: "right", behavior: "patrol", speed: 58, role: "host",
    patrol: [point(300, 1104), point(1900, 1104)] },
]);

/** 로비 남쪽 출입문: 캠퍼스 산책로로 나가는 포털. */
export const TOON_HQ_CAMPUS_PORTAL = Object.freeze({
  id: "hq-portal-campus",
  point: point(7 * T, 1546),
  radius: 30,
  href: "/studio/space?place=skyport",
  labelKo: "캠퍼스 산책로",
  labelEn: "Campus promenade",
});

export function toonHqRoomById(id: string): ToonHqRoom | undefined {
  return TOON_HQ_ROOMS.find((candidate) => candidate.id === id);
}

/** 공정 레일 순서대로 정렬한 방 목록. */
export function toonHqPipelineRooms(): readonly ToonHqRoom[] {
  return TOON_HQ_ROOMS
    .filter((candidate) => candidate.pipelineStep !== null)
    .slice()
    .sort((left, right) => (left.pipelineStep ?? 0) - (right.pipelineStep ?? 0));
}
