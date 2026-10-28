/**
 * ToonOffice 2D 월드 건축 디테일·실시간 소품 애니메이션·공간 오라(Canvas 2D).
 *
 * 경쟁사 벤치마크(Gather DeskPods·ListeningRangeUI·FocusOverBusy, WorkAdventure personalArea,
 * ZEP/oVice 공간 오브젝트 피드백)를 흡수해 2D 스튜디오 배경과 소품에 생동감을 더한다.
 *
 * 1) 바닥 청크 디테일: 복도 유도선, 방 내부 몰딩 테두리, 문턱 매트(프라이빗 🔒 / 정숙 🔇 / 공정 번호 배지).
 * 2) 북쪽 벽 실시간 장식: 실제 시각을 가리키는 벽시계 바늘, 네온 말풍선 맥동, 벽걸이 TV 대시보드, 비 오는 날 창문 빗줄기.
 * 3) 가구·작업대 실시간 오버레이: 리뷰 스크린 웹툰 컷 프리뷰, 콘티 월 썸네일, 칸반 보드 포스트잇, 집중 부스 ON AIR 표시,
 *    상호작용 상태(커피 추출·대형 출력기 시트·스탠드 조명 토글) 피드백.
 * 4) 배우 공간 오라: 착석 중 데스크 포드(DeskPod / personalArea) 경계, 정숙 구역 몰입 보호막, 근접 대화 고리.
 */
import { TOON_HQ_DOOR_WIDTH, TOON_HQ_ROOMS, type ToonHqRoom } from "./hq/toon-hq-blueprint";
import type { Office2dActor } from "./office2d-actors";
import { office2dActorFoot } from "./office2d-actor-geometry";
import { OFFICE2D_OVERLAY_FONT } from "./office2d-overlay";
import { office2dRoundRect, type Office2dCanvas2D } from "./office2d-procedural-art";
import type { Office2dScene, Office2dSceneObject, Office2dWallDecor } from "./office2d-scene";

export interface Office2dWorldDetailFrame {
  readonly time: number;
  readonly now: number;
  readonly selfId: string;
  readonly language: "ko" | "en";
  readonly reducedMotion: boolean;
  readonly daylight: number;
  readonly atmosphere?: string | undefined;
  readonly activeObjectStates?: ReadonlyMap<string, { readonly stateKey: string; readonly changedAt: number }> | undefined;
}

const HQ_ROOM_BY_ID: ReadonlyMap<string, ToonHqRoom> = new Map(TOON_HQ_ROOMS.map((room) => [room.id, room] as const));

function rectsIntersect(
  a: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  b: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * 바닥 청크에 구워 넣는 건축 디테일(문턱 매트·프라이버시/공정 바닥 배지·복도 유도선·방 테두리 몰딩).
 * 정적 요소만 그리므로 512px 청크 캐시에서 1회만 실행된다.
 */
export function paintOffice2dFloorDetails(
  ctx: Office2dCanvas2D,
  scene: Office2dScene,
  originX: number,
  originY: number,
  chunkSize: number,
  language: "ko" | "en" = "ko",
): void {
  if (scene.kind !== "toon-hq") return;
  const chunk = { x: originX, y: originY, width: chunkSize, height: chunkSize };

  for (const room of TOON_HQ_ROOMS) {
    if (!rectsIntersect(room, chunk)) continue;

    if (room.row === "corridor") {
      paintCorridorRunner(ctx, room);
      continue;
    }

    // 방 안쪽 미세 몰딩 테두리
    ctx.strokeStyle = "rgba(74, 54, 38, 0.14)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(room.x + 14, room.y + 98, room.width - 28, room.height - 114);

    if (room.doors.north !== undefined) {
      paintDoorThreshold(ctx, room, room.doors.north, room.y + 2, "north", language);
    }
    if (room.doors.south !== undefined) {
      paintDoorThreshold(ctx, room, room.doors.south, room.y + room.height - 22, "south", language);
    }
  }
}

function paintCorridorRunner(ctx: Office2dCanvas2D, room: ToonHqRoom): void {
  const cy = room.y + room.height / 2;
  ctx.save();
  ctx.fillStyle = "rgba(182, 148, 104, 0.14)";
  ctx.fillRect(room.x + 36, cy - 16, room.width - 72, 32);
  ctx.strokeStyle = "rgba(166, 130, 86, 0.34)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(room.x + 36, cy - 16);
  ctx.lineTo(room.x + room.width - 36, cy - 16);
  ctx.moveTo(room.x + 36, cy + 16);
  ctx.lineTo(room.x + room.width - 36, cy + 16);
  ctx.stroke();

  // 복도 중앙 황동 포인터 도트
  ctx.fillStyle = "rgba(176, 138, 90, 0.38)";
  for (let x = room.x + 120; x < room.x + room.width - 80; x += 192) {
    ctx.beginPath();
    ctx.arc(x, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintDoorThreshold(
  ctx: Office2dCanvas2D,
  room: ToonHqRoom,
  doorX: number,
  matY: number,
  side: "north" | "south",
  language: "ko" | "en",
): void {
  const matW = TOON_HQ_DOOR_WIDTH - 10;
  const matH = 18;
  const matX = doorX - matW / 2;

  ctx.save();
  // 매트 그림자 및 본체
  ctx.fillStyle = "rgba(38, 28, 20, 0.22)";
  office2dRoundRect(ctx, matX - 1, matY + 1, matW + 2, matH, 5);
  ctx.fill();

  const accent = room.privacy === "private"
    ? "#d99b4e"
    : room.privacy === "silent"
      ? "#5fa883"
      : room.pipelineStep !== null
        ? "#c69255"
        : "#8c735b";
  ctx.fillStyle = "#46382e";
  office2dRoundRect(ctx, matX, matY, matW, matH, 4);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 매트 안쪽 황동 줄무늬
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.32;
  ctx.fillRect(matX + 5, side === "north" ? matY + 3 : matY + matH - 5, matW - 10, 2);
  ctx.globalAlpha = 1;

  // 프라이버시 / 정숙 / 공정 번호 캡션
  let badge: string;
  if (room.privacy === "private") badge = language === "en" ? "PRIVATE" : "회의·보안";
  else if (room.privacy === "silent") badge = language === "en" ? "QUIET" : "정숙·몰입";
  else if (room.pipelineStep !== null) badge = `STEP 0${room.pipelineStep + 1}`;
  else badge = language === "en" ? "WELCOME" : "출입구";

  ctx.font = `800 8.5px ${OFFICE2D_OVERLAY_FONT}`;
  ctx.fillStyle = "#f7ead7";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(badge, doorX, matY + matH / 2 + 0.5);
  ctx.restore();
}

/** 북쪽 벽 장식(시계·네온·벽걸이 TV·창문) 위에 실시간 애니메이션 디테일을 덧그린다. */
export function paintOffice2dWallDecorLive(
  ctx: Office2dCanvas2D,
  decor: Office2dWallDecor,
  cx: number,
  cy: number,
  width: number,
  height: number,
  frame: Office2dWorldDetailFrame,
): void {
  ctx.save();
  if (decor.sprite === "wall-clock") {
    const radius = Math.min(width, height) * 0.22;
    const totalSeconds = Math.floor(frame.now / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60 + seconds / 60;
    const hours = (Math.floor(totalSeconds / 3600) + 9) % 12 + minutes / 60;

    const hourAngle = (hours / 12) * Math.PI * 2 - Math.PI / 2;
    const minAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
    const secAngle = (seconds / 60) * Math.PI * 2 - Math.PI / 2;

    ctx.lineCap = "round";
    ctx.strokeStyle = "#2d221b";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(hourAngle) * radius * 0.52, cy + Math.sin(hourAngle) * radius * 0.52);
    ctx.stroke();

    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(minAngle) * radius * 0.74, cy + Math.sin(minAngle) * radius * 0.74);
    ctx.stroke();

    if (!frame.reducedMotion) {
      ctx.strokeStyle = "#e05a47";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(secAngle) * radius * 0.8, cy + Math.sin(secAngle) * radius * 0.8);
      ctx.stroke();
    }
    ctx.fillStyle = "#d99b4e";
    ctx.beginPath();
    ctx.arc(cx, cy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (decor.sprite === "neon-balloon") {
    const pulse = frame.reducedMotion ? 0.45 : 0.35 + Math.sin(frame.time * 3.2 + cx * 0.01) * 0.2;
    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, Math.max(width, height) * 0.52);
    glow.addColorStop(0, `rgba(116, 232, 255, ${pulse * 0.42})`);
    glow.addColorStop(1, "rgba(116, 232, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(cx - width * 0.55, cy - height * 0.55, width * 1.1, height * 1.1);
  } else if (decor.sprite === "wall-tv") {
    const pulse = frame.reducedMotion ? 0.32 : 0.24 + (Math.sin(frame.time * 2.1 + cx) * 0.5 + 0.5) * 0.16;
    const glow = ctx.createRadialGradient(cx, cy, 3, cx, cy, Math.max(width, height) * 0.48);
    glow.addColorStop(0, `rgba(92, 195, 201, ${pulse})`);
    glow.addColorStop(1, "rgba(92, 195, 201, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(cx - width * 0.5, cy - height * 0.5, width, height);
  } else if (decor.sprite === "window" && frame.atmosphere === "rain" && !frame.reducedMotion) {
    ctx.strokeStyle = "rgba(180, 220, 255, 0.38)";
    ctx.lineWidth = 1.1;
    for (let index = 0; index < 3; index += 1) {
      const phase = ((frame.time * 2.2 + index * 0.33 + cx * 0.01) % 1);
      const rx = cx - width * 0.22 + index * (width * 0.22);
      const ry = cy - height * 0.22 + phase * (height * 0.38);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 1.5, ry + 6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 가구·작업대 스프라이트 위에 실시간 화면 광채·상태 배지·집중 부스 ON AIR 표시를 덧그린다. */
export function paintOffice2dObjectLiveOverlay(
  ctx: Office2dCanvas2D,
  object: Office2dSceneObject,
  spriteHeight: number,
  frame: Office2dWorldDetailFrame,
  occupiedSeatIds: ReadonlySet<string>,
): void {
  if (!object.sprite) return;
  const activeState = frame.activeObjectStates?.get(object.id);
  ctx.save();

  if (object.sprite === "review-screen") {
    const pulse = frame.reducedMotion ? 0.22 : 0.18 + Math.sin(frame.time * 2.2) * 0.06;
    const cy = object.y - spriteHeight * 0.58;
    const glow = ctx.createRadialGradient(object.x, cy, 8, object.x, cy, object.width * 0.52);
    glow.addColorStop(0, `rgba(125, 211, 252, ${pulse})`);
    glow.addColorStop(1, "rgba(125, 211, 252, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(object.x - object.width * 0.55, cy - spriteHeight * 0.45, object.width * 1.1, spriteHeight * 0.9);
  } else if (object.sprite === "focus-booth" && occupiedSeatIds.has(`${object.id}-seat`)) {
    const pillY = object.y - spriteHeight - 8;
    const label = frame.language === "en" ? "ON AIR · FOCUS" : "집중 중 · ON AIR";
    ctx.font = `800 9.5px ${OFFICE2D_OVERLAY_FONT}`;
    const pillW = ctx.measureText(label).width + 16;
    office2dRoundRect(ctx, object.x - pillW / 2, pillY - 9, pillW, 18, 9);
    ctx.fillStyle = "rgba(24, 52, 42, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "#6ee7b7";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = "#a7f3d0";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, object.x, pillY);
  }

  // 상호작용 오브젝트 상태 배지(커피 추출·스탠드 조명·보드·출력기 반응)
  if (activeState && frame.now - activeState.changedAt < 14_000) {
    const badgeText = activeStateBadgeLabel(activeState.stateKey, frame.language);
    if (badgeText) {
      const badgeY = object.y - spriteHeight - 10;
      ctx.font = `800 10px ${OFFICE2D_OVERLAY_FONT}`;
      const badgeW = ctx.measureText(badgeText).width + 16;
      office2dRoundRect(ctx, object.x - badgeW / 2, badgeY - 10, badgeW, 19, 9.5);
      ctx.fillStyle = "rgba(38, 30, 24, 0.92)";
      ctx.fill();
      ctx.strokeStyle = "#f2b84b";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = "#fff6e0";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, object.x, badgeY - 0.5);
    }
  }

  ctx.restore();
}

function activeStateBadgeLabel(stateKey: string, language: "ko" | "en"): string | null {
  switch (stateKey) {
    case "coffee:brewing": return language === "en" ? "☕ Brewing…" : "☕ 커피 추출 중…";
    case "coffee:ready": return language === "en" ? "☕ Ready!" : "☕ 커피 준비 완료!";
    case "light:on": return language === "en" ? "💡 Warm light ON" : "💡 스탠드 조명 켜짐";
    case "light:off": return language === "en" ? "🌙 Light dimmed" : "🌙 스탠드 조명 꺼짐";
    case "media:open": return language === "en" ? "📌 Board synced" : "📌 보드 동기화됨";
    case "print:active": return language === "en" ? "🖨 Proof printed" : "🖨 교정지 출력 완료";
    default: return null;
  }
}

/**
 * 배우 주변 공간 오라:
 * - 착석 시 데스크 포드(Gather DeskPods / WorkAdventure personalArea)
 * - 정숙 구역(자료실·집중 부스) 안에서의 몰입 실드 고리(Gather FocusOverBusy)
 * - 근접 대화 대상이 있을 때 은은한 청취 범위 고리(Gather ListeningRangeUI)
 */
export function paintOffice2dActorSpatialAura(
  ctx: Office2dCanvas2D,
  actor: Office2dActor,
  frame: Office2dWorldDetailFrame,
  actors: readonly Office2dActor[],
): void {
  const isSelf = actor.id === frame.selfId;
  const foot = office2dActorFoot(actor);
  ctx.save();

  // 1) 착석 중 데스크 포드 오라 (나 또는 동료가 작업대에 앉아 있을 때)
  if (actor.seat && (isSelf || actor.kind === "peer")) {
    const podW = 132;
    const podH = 74;
    const podX = actor.seat.anchor.x - podW / 2;
    const podY = actor.seat.anchor.y - 54;
    const pulse = frame.reducedMotion ? 0.36 : 0.3 + Math.sin(frame.time * 2.4) * 0.08;
    office2dRoundRect(ctx, podX, podY, podW, podH, 16);
    ctx.fillStyle = isSelf ? `rgba(124, 92, 246, ${pulse * 0.22})` : "rgba(92, 195, 201, 0.08)";
    ctx.fill();
    ctx.strokeStyle = isSelf ? `rgba(167, 139, 250, ${pulse + 0.2})` : "rgba(92, 195, 201, 0.32)";
    ctx.lineWidth = isSelf ? 1.8 : 1.2;
    ctx.stroke();

    if (isSelf) {
      const tag = frame.language === "en" ? "ACTIVE DESK POD" : "내 작업 포드";
      ctx.font = `800 8.5px ${OFFICE2D_OVERLAY_FONT}`;
      const tagW = ctx.measureText(tag).width + 12;
      office2dRoundRect(ctx, podX + 8, podY + podH - 15, tagW, 14, 7);
      ctx.fillStyle = "rgba(40, 30, 62, 0.88)";
      ctx.fill();
      ctx.fillStyle = "#e9d5ff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tag, podX + 8 + tagW / 2, podY + podH - 8);
    }
    ctx.restore();
    return;
  }

  if (!isSelf) {
    ctx.restore();
    return;
  }

  // 2) 정숙·몰입 구역 실드 링 (Gather FocusOverBusy)
  const room = findRoomContaining(foot.x, foot.y);
  if (room?.privacy === "silent") {
    ctx.strokeStyle = "rgba(110, 231, 183, 0.55)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(foot.x, foot.y, 26, 10.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 3) 근접 청취·대화 범위 링 (Gather ListeningRangeUI — 근처 강조된 NPC나 동료가 있을 때만 표시해 바닥을 깔끔하게 유지)
  const nearbyPartner = actors.find(
    (other) => other.id !== actor.id
      && (other.highlighted || (other.kind === "peer" && Math.hypot(other.x - foot.x, other.y - foot.y) <= 160)),
  );
  if (nearbyPartner) {
    ctx.strokeStyle = "rgba(255, 224, 150, 0.34)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.ellipse(foot.x, foot.y, 52, 21, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function findRoomContaining(x: number, y: number): ToonHqRoom | undefined {
  for (const room of HQ_ROOM_BY_ID.values()) {
    if (x >= room.x && x <= room.x + room.width && y >= room.y && y <= room.y + room.height) return room;
  }
  return undefined;
}
