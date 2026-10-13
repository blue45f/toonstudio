/**
 * 월드 공용 오버레이(상호작용 원형 표식·포털 발판·프라이빗 구역 표시·저작 디버그 선).
 *
 * Canvas에서 옮겨 온 생성 코드다. Canvas는 결과 객체와 클릭 콜백만 다룬다(Canvas 비대화 방지, W12).
 * Phaser는 Canvas가 늦게 불러오므로 여기서는 타입만 가져오고 실행 시 Geom 생성자는 인자로 받는다.
 */
import type * as Phaser from "phaser";

import type { StudioVirtualArtStyle } from "./studio-virtual-space-art-style";
import type { StudioLocateGuide } from "./studio-virtual-space-locate-guide";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  buildMovePathDisplay,
  movePathDotPhase,
  movePathFadeProgress,
  movePathRippleProgress,
  sampleRouteDots,
} from "./studio-virtual-space-move-path-display";
import { strokeStudioDashedRect, studioPrivateZoneOverlayShapes } from "./studio-virtual-space-private-zone-overlay";
import {
  studioWorldCollisionRects,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldInteractionDefinition,
  type StudioWorldPortalDefinition,
} from "./studio-virtual-space-world-manifest";

type OverlayScene = Pick<Phaser.Scene, "add">;
interface StoppableEvent { stopPropagation(): void }
type PointerHandler = (pointer: Phaser.Input.Pointer, localX: number, localY: number, event: StoppableEvent) => void;

/** 원형 표식 안의 2글자 약어. */
export function studioInteractionMarkerText(interaction: Pick<StudioWorldInteractionDefinition, "id" | "action">): string {
  if (/falls/u.test(interaction.id)) return "FX";
  if (/fountain/u.test(interaction.id)) return "WT";
  if (/garden/u.test(interaction.id)) return "GD";
  if (/market/u.test(interaction.id)) return "MK";
  if (/observatory/u.test(interaction.id)) return "OB";
  if (/gong/u.test(interaction.id)) return "GG";
  if (/stage/u.test(interaction.id)) return "EV";
  const glyphByAction: Record<string, string> = {
    assistant: "AI", assets: "AS", canvas: "DR", community: "CO", comic: "SB", live: "LV", review: "RV", story: "ST",
  };
  return glyphByAction[interaction.action] ?? "GO";
}

function monospace(profile: StudioVirtualArtStyle): string {
  return profile.pixelated ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "Inter, Pretendard, sans-serif";
}

/** 상호작용 지점의 원형 표식. 누르면 onSelect(그 상호작용)를 부른다. 바닥 y 정렬이라 이름표를 덮지 않는다. */
export function createStudioInteractionMarkers(
  scene: OverlayScene,
  interactions: readonly StudioWorldInteractionDefinition[],
  profile: StudioVirtualArtStyle,
  geom: Pick<typeof Phaser.Geom, "Circle">,
  onSelect: (interaction: StudioWorldInteractionDefinition) => void,
): Map<string, Phaser.GameObjects.Container> {
  const markers = new Map<string, Phaser.GameObjects.Container>();
  for (const interaction of interactions) {
    const plate = scene.add.graphics();
    plate.fillStyle(profile.palette.background, 0.58).fillCircle(0, 0, 14);
    plate.lineStyle(2, profile.palette.gate, 0.9).strokeCircle(0, 0, 12);
    plate.fillStyle(profile.palette.accent, 0.92).fillCircle(0, 0, 8);
    const glyph = scene.add.text(0, 0, studioInteractionMarkerText(interaction), {
      fontFamily: monospace(profile),
      fontSize: profile.pixelated ? "7px" : "8px",
      fontStyle: "bold",
      color: "#fbfaff",
    }).setOrigin(0.5);
    const marker = scene.add.container(interaction.point.x, interaction.point.y, [plate, glyph])
      .setSize(30, 30)
      .setDepth(Math.round(interaction.point.y) + 996)
      .setAlpha(0.68)
      .setInteractive(new geom.Circle(0, 0, 17), geom.Circle.Contains);
    if (marker.input) marker.input.cursor = "pointer";
    const select: PointerHandler = (_pointer, _x, _y, event) => { event.stopPropagation(); onSelect(interaction); };
    marker.on("pointerdown", select);
    markers.set(interaction.id, marker);
  }
  return markers;
}

/** 포털 발판(타원)과 방 이름표. 누르면 onSelect(포털)를 부른다. */
export function createStudioPortalGateways(
  scene: OverlayScene,
  manifest: StudioVirtualSpaceWorldManifest,
  portals: readonly StudioWorldPortalDefinition[],
  profile: StudioVirtualArtStyle,
  translate: (ko: string, en: string) => string,
  onSelect: (portal: StudioWorldPortalDefinition) => void,
): void {
  for (const portal of portals) {
    const gateway = scene.add.ellipse(portal.point.x, portal.point.y, portal.radius * 1.75, portal.radius * 0.82, profile.palette.gate, 0.14)
      .setStrokeStyle(2, profile.palette.gate, 0.82)
      .setDepth(600)
      .setInteractive({ useHandCursor: true });
    const select: PointerHandler = (_pointer, _x, _y, event) => { event.stopPropagation(); onSelect(portal); };
    gateway.on("pointerdown", select);
    const room = portal.targetRoomId ? manifest.rooms.find((candidate) => candidate.id === portal.targetRoomId) : undefined;
    if (!room) continue;
    scene.add.text(portal.point.x, portal.point.y - portal.radius - 8, translate(room.labelKo, room.labelEn), {
      fontFamily: monospace(profile),
      fontSize: profile.pixelated ? "7px" : "8px",
      fontStyle: "bold",
      color: "#fbfaff",
      backgroundColor: "#171522d8",
      padding: { x: 5, y: 3 },
    }).setOrigin(0.5, 1).setDepth(602).setInteractive({ useHandCursor: true }).on("pointerdown", select);
  }
}

/** 프라이빗 음향 구역의 점선 테두리와 '프라이빗' 표시. */
export function drawStudioPrivateZoneOverlay(scene: OverlayScene, manifest: StudioVirtualSpaceWorldManifest, label: string): void {
  const shapes = studioPrivateZoneOverlayShapes(manifest.acousticZones);
  if (shapes.length === 0) return;
  const graphics = scene.add.graphics().setDepth(30_000);
  for (const shape of shapes) {
    graphics.fillStyle(0x8b5cf6, 0.10);
    graphics.fillRect(shape.x, shape.y, shape.width, shape.height);
    graphics.lineStyle(2, 0xa78bfa, 0.55);
    strokeStudioDashedRect(graphics, shape);
    scene.add.text(shape.x + 8, shape.y + 8, label, {
      fontFamily: "Pretendard, sans-serif",
      fontSize: "12px",
      color: "#e9e2ff",
      backgroundColor: "#4c2f9edd",
      padding: { x: 6, y: 3 },
    }).setDepth(30_001);
  }
}

/** 월드 저작 모드의 방·충돌·상호작용·스폰 디버그 선. */
export function drawStudioWorldDebugOverlay(
  scene: OverlayScene,
  manifest: StudioVirtualSpaceWorldManifest,
  interactions: readonly StudioWorldInteractionDefinition[],
): void {
  const graphics = scene.add.graphics().setDepth(170_000);
  graphics.lineStyle(2, 0x66aaff, 0.86);
  for (const room of manifest.rooms) {
    graphics.strokeRect(room.x, room.y, room.width, room.height);
    scene.add.text(room.x + 5, room.y + 5, room.id, {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "10px",
      color: "#dcecff",
      backgroundColor: "#10233ddd",
      padding: { x: 4, y: 2 },
    }).setDepth(170_001);
  }
  graphics.lineStyle(2, 0xff5f6d, 0.88);
  for (const collider of studioWorldCollisionRects(manifest)) graphics.strokeRect(collider.x, collider.y, collider.width, collider.height);
  graphics.lineStyle(2, 0x4ade80, 0.75);
  for (const interaction of interactions) graphics.strokeCircle(interaction.point.x, interaction.point.y, interaction.radius);
  graphics.lineStyle(2, 0xfacc15, 0.9);
  for (const spawn of manifest.spawns) {
    graphics.strokeCircle(spawn.point.x, spawn.point.y, 10);
    graphics.lineBetween(spawn.point.x - 7, spawn.point.y, spawn.point.x + 7, spawn.point.y);
    graphics.lineBetween(spawn.point.x, spawn.point.y - 7, spawn.point.x, spawn.point.y + 7);
  }
}

/** 길 안내가 쓰는 Graphics의 최소 구조. Phaser Graphics를 그대로 받고, 테스트는 호출을 기록하는 가짜를 넘긴다. */
interface RouteGraphics {
  clear(): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  fillEllipse(x: number, y: number, width: number, height: number): unknown;
  strokeEllipse(x: number, y: number, width: number, height: number): unknown;
}

/**
 * 길 안내 색. 후광은 어둡고 심은 밝아서 밝은 타일 바닥과 어두운 야간 바닥 어디서든 보인다
 * (예전의 옅은 라벤더 선은 밝은 바닥에서 거의 보이지 않았다). 색은 캔버스 숫자 색이라 CSS 토큰 대상이 아니다.
 */
const ROUTE_HALO = 0x1d1438;
const ROUTE_CORE = 0xffffff;
const ROUTE_ACCENT = 0xb79bff;

/** 목적지 마커의 바닥 타원 크기(px). 3/4 시점의 바닥이라 가로:세로를 2:1로 눌러 그린다. */
const MARKER_WIDTH = 24;
const MARKER_HEIGHT = 12;

/**
 * 프레임 사이에 이어져야 하는 길 안내 상태: 마지막 목적지와 도착 페이드 시작 시각.
 * 캔버스가 장면당 하나를 만들어 매 프레임 같은 객체를 넘긴다.
 */
export interface StudioRouteOverlayMemory {
  destination: StudioVirtualSpacePoint | null;
  visible: boolean;
  fadeStartedAt: number | null;
}

export function createStudioRouteOverlayMemory(): StudioRouteOverlayMemory {
  return { destination: null, visible: false, fadeStartedAt: null };
}

export interface StudioRouteOverlayFrame {
  readonly current: StudioVirtualSpacePoint;
  readonly path: readonly StudioVirtualSpacePoint[];
  /** 마커 표시 판정에 쓰는 이동 중 여부(속도 5px/s 초과). */
  readonly moving: boolean;
  /** 프레임 시계(ms). 포털 링 맥동 위상. */
  readonly now: number;
  /** 벽시계(ms). 경로 표시 모델의 펄스 기준(기존 Date.now() 전달과 동일). */
  readonly wallNow: number;
  readonly markerStartedAt: number;
  readonly reducedMotion: boolean;
  readonly portals: readonly StudioWorldPortalDefinition[];
  /** 월드 좌표 → 그리기 좌표 투영(캔버스가 매니페스트 투영을 감싸 넘긴다). 경로·마커·포털 링 모두 이 투영을 따른다. */
  readonly projectPoint: (point: StudioVirtualSpacePoint) => StudioVirtualSpacePoint;
  readonly memory: StudioRouteOverlayMemory;
}

function drawRouteMarker(
  graphics: RouteGraphics,
  ground: StudioVirtualSpacePoint,
  options: { readonly scale: number; readonly alpha: number },
): void {
  const width = MARKER_WIDTH * options.scale;
  const height = MARKER_HEIGHT * options.scale;
  graphics.lineStyle(4.5, ROUTE_HALO, 0.4 * options.alpha);
  graphics.strokeEllipse(ground.x, ground.y, width, height);
  graphics.lineStyle(2, ROUTE_CORE, 0.96 * options.alpha);
  graphics.strokeEllipse(ground.x, ground.y, width, height);
  graphics.fillStyle(ROUTE_ACCENT, 0.95 * options.alpha);
  graphics.fillEllipse(ground.x, ground.y, 8 * options.scale, 4 * options.scale);
}

/**
 * 클릭 이동 길 안내와 가장 가까운 포털의 바닥 펄스 링.
 *
 * - 안내 점: 발밑에서 목적지까지 일정 간격으로 찍힌 점이 목적지 쪽으로 흐른다(모션 줄이기에서는 정지).
 * - 목적지 마커: 바닥 타원 + 중심점이 숨 쉬듯 커졌다 작아진다. 클릭한 순간에는 파문이 한 번 퍼져 "받았다"를 알린다.
 * - 도착하면 마커가 갑자기 꺼지지 않고 조금 커지면서 옅어진다.
 */
export function drawStudioRouteOverlay(graphics: RouteGraphics, frame: StudioRouteOverlayFrame): void {
  graphics.clear();
  const memory = frame.memory;
  const pathDisplay = buildMovePathDisplay({
    current: frame.current,
    path: frame.path,
    destination: frame.path.at(-1) ?? null,
    moving: frame.moving,
    now: frame.wallNow,
    markerStartedAt: frame.markerStartedAt,
    reducedMotion: frame.reducedMotion,
  });
  const marker = pathDisplay.visible ? pathDisplay.marker : null;
  if (marker) {
    memory.destination = marker.point;
    memory.visible = true;
    memory.fadeStartedAt = null;
    const dots = sampleRouteDots(
      pathDisplay.polyline.map((point) => frame.projectPoint(point)),
      { phase: movePathDotPhase(frame.wallNow, frame.reducedMotion) },
    );
    for (const dot of dots) {
      graphics.fillStyle(ROUTE_HALO, 0.32 * dot.alpha);
      graphics.fillEllipse(dot.x, dot.y, 9, 5.6);
      graphics.fillStyle(ROUTE_CORE, 0.94 * dot.alpha);
      graphics.fillEllipse(dot.x, dot.y, 5.6, 3.4);
    }
    const ground = frame.projectPoint(marker.point);
    drawRouteMarker(graphics, ground, { scale: frame.reducedMotion ? 1 : 1 + marker.pulse * 0.2, alpha: 1 });
    const ripple = movePathRippleProgress(frame.wallNow, frame.markerStartedAt, frame.reducedMotion);
    if (ripple !== null) {
      const spread = 0.5 + ripple * 1.7;
      graphics.lineStyle(2.5, ROUTE_CORE, 0.85 * (1 - ripple));
      graphics.strokeEllipse(ground.x, ground.y, MARKER_WIDTH * spread, MARKER_HEIGHT * spread);
    }
  } else if (memory.destination) {
    if (memory.visible) {
      // 방금 도착(또는 취소)했다: 페이드를 시작한다. 모션 줄이기에서는 바로 지운다.
      memory.visible = false;
      memory.fadeStartedAt = frame.reducedMotion ? null : frame.wallNow;
    }
    const fade = movePathFadeProgress(frame.wallNow, memory.fadeStartedAt, frame.reducedMotion);
    if (fade === null) {
      memory.destination = null;
      memory.fadeStartedAt = null;
    } else {
      drawRouteMarker(graphics, frame.projectPoint(memory.destination), { scale: 1 + fade * 0.55, alpha: 1 - fade });
    }
  }
  // 가장 가까운 포털에는 바닥 펄스 링을 그려 "여기로 가면 이동한다"를 알린다.
  // 모션 줄이기에서는 맥동 없이 정적 링만 그린다.
  let nearestPortal: StudioWorldPortalDefinition | null = null;
  let nearestPortalDistance = Number.POSITIVE_INFINITY;
  for (const candidate of frame.portals) {
    const distance = Math.hypot(candidate.point.x - frame.current.x, candidate.point.y - frame.current.y);
    if (distance < nearestPortalDistance) {
      nearestPortalDistance = distance;
      nearestPortal = candidate;
    }
  }
  if (nearestPortal && nearestPortalDistance <= 84) {
    const pulse = frame.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(frame.now * 0.006);
    const ground = frame.projectPoint(nearestPortal.point);
    const radius = nearestPortal.radius ?? 26;
    graphics.lineStyle(2, 0xe8ddff, 0.3 + pulse * 0.45);
    graphics.strokeEllipse(ground.x, ground.y, radius * 2 * (1 + pulse * 0.14), radius * (1 + pulse * 0.14));
  }
}

type LocateGraphics = Pick<Phaser.GameObjects.Graphics,
  "clear" | "lineStyle" | "lineBetween" | "fillStyle" | "fillTriangle" | "strokeCircle">;

/** 참가자 locate 안내선: 화면 밖이면 자기 위치에서 가장자리 마커로 선+화살표, 안이면 마커 링. */
export function drawStudioLocateOverlay(
  graphics: LocateGraphics,
  guide: StudioLocateGuide,
  self: StudioVirtualSpacePoint,
  time: number,
  reducedMotion: boolean,
): void {
  graphics.clear();
  if (!guide.visible) return;
  const markerPulse = reducedMotion ? 1 : 1 + 0.22 * Math.sin(time * 0.008);
  if (!guide.onScreen) {
    graphics.lineStyle(2, 0xffd166, 0.85);
    graphics.lineBetween(self.x, self.y, guide.markerPoint.x, guide.markerPoint.y);
    const arrowAngle = guide.angle;
    const tipX = guide.markerPoint.x + Math.cos(arrowAngle) * 22;
    const tipY = guide.markerPoint.y + Math.sin(arrowAngle) * 22;
    graphics.fillStyle(0xffd166, 0.9);
    graphics.fillTriangle(
      tipX, tipY,
      guide.markerPoint.x + Math.cos(arrowAngle + 2.5) * 14,
      guide.markerPoint.y + Math.sin(arrowAngle + 2.5) * 14,
      guide.markerPoint.x + Math.cos(arrowAngle - 2.5) * 14,
      guide.markerPoint.y + Math.sin(arrowAngle - 2.5) * 14,
    );
  }
  graphics.lineStyle(2.5, 0xffd166, 0.95);
  graphics.strokeCircle(guide.markerPoint.x, guide.markerPoint.y, 14 * markerPulse);
}
