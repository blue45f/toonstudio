/**
 * 가상 스튜디오 2D 강체 물리 · 10종 업무 인터랙션 · 다중 회의실 음향 격리 엔진.
 *
 * 프레임 독립 dt 클램프와 서브스텝 충돌 해소로 떨림과 벽 관통을 막고,
 * 문 개폐 상태에 따라 회의실 물리 충돌과 방음 감쇠를 연동한다.
 */

import {
  ACOUSTIC_ROOMS,
  DEFAULT_AVATAR_FRICTION,
  DEFAULT_AVATAR_MAX_SPEED,
  DEFAULT_AVATAR_RADIUS,
  DEFAULT_AVATAR_RESTITUTION,
  ESPRESSO_SPEED_MULTIPLIER,
  MAX_PHYSICS_DT_SEC,
  MIN_PHYSICS_DT_SEC,
  SHOWCASE_3D_ASSETS,
  STUDIO_WORLD_HEIGHT,
  STUDIO_WORLD_WIDTH,
  createDefaultStudioColliders,
  createDefaultStudioInteractiveObjects,
  type AabbCollider,
  type AcousticRoomId,
  type AcousticRoomZone,
  type CircleBody,
  type StudioInteractiveObject,
  type StudioLightingMood,
  type StudioPhysicsWorldState,
  type ThrowableProjectile,
  type Vec2,
} from "./vspace-physics-world-presets";

export {
  ACOUSTIC_ROOMS,
  ALL_INTERACTIVE_OBJECT_KINDS,
  ESPRESSO_SPEED_MULTIPLIER,
  MAX_PHYSICS_DT_SEC,
  STUDIO_WORLD_HEIGHT,
  STUDIO_WORLD_WIDTH,
  type AabbCollider,
  type AcousticRoomId,
  type AcousticRoomZone,
  type CircleBody,
  type InteractiveObjectKind,
  type StudioInteractiveObject,
  type StudioLightingMood,
  type StudioPhysicsWorldState,
  type ThrowableProjectile,
  type Vec2,
} from "./vspace-physics-world-presets";

export interface PhysicsStepInput {
  readonly moveX?: number;
  readonly moveY?: number;
  readonly dtSec: number;
  readonly subSteps?: number;
}

export interface ObjectInteractionOptions {
  readonly note?: string;
  readonly throwDirection?: Vec2;
  readonly projectileKind?: "paper-plane" | "cheer-sticker";
  readonly senderName?: string;
}

export interface ObjectInteractionOutcome {
  readonly world: StudioPhysicsWorldState;
  readonly ok: boolean;
  readonly messageKo: string;
  readonly sideEffect?: "open-quest-board" | "room-door-toggled" | "projectile-launched";
}

export interface RoomAcousticAttenuation {
  readonly gain: number;
  readonly distance: number;
  readonly speakerRoomId: AcousticRoomId;
  readonly listenerRoomId: AcousticRoomId;
  readonly isolated: boolean;
  readonly channelMode: "room-channel" | "proximity" | "door-bleed" | "soundproof-blocked";
  readonly reasonKo: string;
}

const LIGHTING_ORDER: readonly StudioLightingMood[] = [
  "daylight",
  "warm-atelier",
  "night-crunch",
];

export function clampPhysicsDt(rawDtSec: number): number {
  if (!Number.isFinite(rawDtSec) || rawDtSec <= 0) return 0;
  if (rawDtSec > MAX_PHYSICS_DT_SEC) return MAX_PHYSICS_DT_SEC;
  if (rawDtSec < MIN_PHYSICS_DT_SEC) return MIN_PHYSICS_DT_SEC;
  return rawDtSec;
}

export function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function resolveAcousticRoomAt(
  rooms: readonly AcousticRoomZone[],
  point: Vec2,
): AcousticRoomId {
  for (const room of rooms) {
    if (room.id === "open-lounge") continue;
    if (
      point.x >= room.bounds.minX &&
      point.x <= room.bounds.maxX &&
      point.y >= room.bounds.minY &&
      point.y <= room.bounds.maxY
    ) {
      return room.id;
    }
  }
  return "open-lounge";
}

export function createDefaultStudioPhysicsWorld(): StudioPhysicsWorldState {
  const initialPlayer: CircleBody = {
    id: "player-self",
    x: 480,
    y: 296,
    vx: 0,
    vy: 0,
    radius: DEFAULT_AVATAR_RADIUS,
    mass: 1,
    restitution: DEFAULT_AVATAR_RESTITUTION,
    friction: DEFAULT_AVATAR_FRICTION,
    maxSpeed: DEFAULT_AVATAR_MAX_SPEED,
  };
  return {
    player: initialPlayer,
    targetPoint: null,
    seatedObjectId: null,
    stamina: 74,
    focusBuffSec: 0,
    lightingMood: "daylight",
    deadlineRemainingHours: 18,
    deadlineUrgentMode: false,
    whiteboardNotes: [
      "EP12 18~24컷 선화 굵기 0.8pt 통일 확인",
      "야경 배경 3D 라이트맵 톤 다운 요청",
    ],
    showcaseAssets: SHOWCASE_3D_ASSETS,
    inspectedAssetIndex: 0,
    questBoardOpenCount: 0,
    objects: createDefaultStudioInteractiveObjects(),
    colliders: createDefaultStudioColliders(),
    rooms: ACOUSTIC_ROOMS,
    projectiles: [],
    activeRoomId: resolveAcousticRoomAt(ACOUSTIC_ROOMS, initialPlayer),
    lastInteractionLog: "오픈 라운지에 입장했습니다. 바닥을 클릭해 이동하거나 오브젝트와 상호작용하세요.",
    tickCount: 0,
  };
}

function clampSpeed(vx: number, vy: number, maxSpeed: number): Vec2 {
  const speed = Math.hypot(vx, vy);
  if (speed <= maxSpeed || speed === 0) return { x: vx, y: vy };
  const scale = maxSpeed / speed;
  return { x: vx * scale, y: vy * scale };
}

function clampToWorldBounds(body: CircleBody): { readonly body: CircleBody; readonly bounced: boolean } {
  let { x, y, vx, vy } = body;
  let bounced = false;
  const minX = 12 + body.radius;
  const maxX = STUDIO_WORLD_WIDTH - 12 - body.radius;
  const minY = 12 + body.radius;
  const maxY = STUDIO_WORLD_HEIGHT - 12 - body.radius;

  if (x < minX) {
    x = minX;
    if (vx < 0) {
      vx = -vx * body.restitution;
      bounced = true;
    }
  } else if (x > maxX) {
    x = maxX;
    if (vx > 0) {
      vx = -vx * body.restitution;
      bounced = true;
    }
  }
  if (y < minY) {
    y = minY;
    if (vy < 0) {
      vy = -vy * body.restitution;
      bounced = true;
    }
  } else if (y > maxY) {
    y = maxY;
    if (vy > 0) {
      vy = -vy * body.restitution;
      bounced = true;
    }
  }
  return { body: { ...body, x, y, vx, vy }, bounced };
}

export function resolveCircleVsAabb(
  body: CircleBody,
  box: AabbCollider,
): { readonly body: CircleBody; readonly collided: boolean } {
  if (!box.solid) return { body, collided: false };

  const closestX = Math.max(box.minX, Math.min(body.x, box.maxX));
  const closestY = Math.max(box.minY, Math.min(body.y, box.maxY));
  const dx = body.x - closestX;
  const dy = body.y - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= body.radius * body.radius) {
    return { body, collided: false };
  }

  let nx = 0;
  let ny = 0;
  let penetration: number;

  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    nx = dx / dist;
    ny = dy / dist;
    penetration = body.radius - dist;
  } else {
    const leftPen = Math.abs(body.x - box.minX);
    const rightPen = Math.abs(box.maxX - body.x);
    const topPen = Math.abs(body.y - box.minY);
    const bottomPen = Math.abs(box.maxY - body.y);
    const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);
    if (minPen === leftPen) {
      nx = -1;
      penetration = leftPen + body.radius;
    } else if (minPen === rightPen) {
      nx = 1;
      penetration = rightPen + body.radius;
    } else if (minPen === topPen) {
      ny = -1;
      penetration = topPen + body.radius;
    } else {
      ny = 1;
      penetration = bottomPen + body.radius;
    }
  }

  const nextX = body.x + nx * penetration;
  const nextY = body.y + ny * penetration;
  const vn = body.vx * nx + body.vy * ny;
  let nextVx = body.vx;
  let nextVy = body.vy;

  if (vn < 0) {
    const e = Math.min(body.restitution, box.restitution);
    const impulse = -(1 + e) * vn;
    nextVx += impulse * nx;
    nextVy += impulse * ny;
  }

  return { body: { ...body, x: nextX, y: nextY, vx: nextVx, vy: nextVy }, collided: true };
}

export function resolveCircleVsCircle(
  a: CircleBody,
  b: CircleBody,
): { readonly a: CircleBody; readonly b: CircleBody; readonly collided: boolean } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minDist = a.radius + b.radius;
  const distSq = dx * dx + dy * dy;

  if (distSq >= minDist * minDist) return { a, b, collided: false };

  const dist = distSq > 1e-8 ? Math.sqrt(distSq) : 0;
  const nx = dist > 0 ? dx / dist : 1;
  const ny = dist > 0 ? dy / dist : 0;
  const overlap = minDist - dist;

  const invMassA = a.mass > 0 ? 1 / a.mass : 0;
  const invMassB = b.mass > 0 ? 1 / b.mass : 0;
  const totalInvMass = invMassA + invMassB;
  if (totalInvMass <= 0) return { a, b, collided: false };

  let nextA: CircleBody = {
    ...a,
    x: a.x - nx * overlap * (invMassA / totalInvMass),
    y: a.y - ny * overlap * (invMassA / totalInvMass),
  };
  let nextB: CircleBody = {
    ...b,
    x: b.x + nx * overlap * (invMassB / totalInvMass),
    y: b.y + ny * overlap * (invMassB / totalInvMass),
  };

  const velAlongNormal = (nextB.vx - nextA.vx) * nx + (nextB.vy - nextA.vy) * ny;
  if (velAlongNormal < 0) {
    const e = Math.min(nextA.restitution, nextB.restitution);
    const j = (-(1 + e) * velAlongNormal) / totalInvMass;
    nextA = { ...nextA, vx: nextA.vx - j * invMassA * nx, vy: nextA.vy - j * invMassA * ny };
    nextB = { ...nextB, vx: nextB.vx + j * invMassB * nx, vy: nextB.vy + j * invMassB * ny };
  }

  return { a: nextA, b: nextB, collided: true };
}

function activeCollidersForWorld(
  colliders: readonly AabbCollider[],
  objects: readonly StudioInteractiveObject[],
): readonly AabbCollider[] {
  const openDoors = new Set(
    objects.filter((obj) => obj.kind === "meeting-door" && obj.active).map((obj) => obj.id),
  );
  return colliders.map((collider) =>
    collider.doorObjectId && openDoors.has(collider.doorObjectId)
      ? { ...collider, solid: false }
      : collider,
  );
}

export function setPhysicsTargetPoint(
  world: StudioPhysicsWorldState,
  target: Vec2,
): StudioPhysicsWorldState {
  return {
    ...world,
    targetPoint: {
      x: Math.max(28, Math.min(STUDIO_WORLD_WIDTH - 28, target.x)),
      y: Math.max(28, Math.min(STUDIO_WORLD_HEIGHT - 28, target.y)),
    },
    seatedObjectId: null,
  };
}

export function stepStudioPhysicsWorld(
  world: StudioPhysicsWorldState,
  input: PhysicsStepInput,
): StudioPhysicsWorldState {
  const dt = clampPhysicsDt(input.dtSec);
  if (dt === 0) return world;

  const subSteps = Math.max(1, Math.min(6, input.subSteps ?? (dt > 0.02 ? 2 : 1)));
  const subDt = dt / subSteps;
  const effectiveColliders = activeCollidersForWorld(world.colliders, world.objects);
  const speedScale = world.focusBuffSec > 0 ? ESPRESSO_SPEED_MULTIPLIER : 1;

  let player = world.player;
  let targetPoint = world.targetPoint;
  let seatedObjectId = world.seatedObjectId;

  const hasManualInput =
    Math.abs(input.moveX ?? 0) > 1e-4 || Math.abs(input.moveY ?? 0) > 1e-4;
  if (hasManualInput) {
    targetPoint = null;
    seatedObjectId = null;
  }

  let projectiles = [...world.projectiles];

  for (let step = 0; step < subSteps; step += 1) {
    let dirX = input.moveX ?? 0;
    let dirY = input.moveY ?? 0;

    if (!hasManualInput && targetPoint) {
      const dx = targetPoint.x - player.x;
      const dy = targetPoint.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 6) {
        targetPoint = null;
        player = { ...player, vx: 0, vy: 0 };
      } else {
        dirX = dx / dist;
        dirY = dy / dist;
      }
    }

    const inputMag = Math.hypot(dirX, dirY);
    const maxSpeed = player.maxSpeed * speedScale;
    let vx = player.vx;
    let vy = player.vy;

    if (inputMag > 1e-4) {
      const accel = 1350 * speedScale;
      vx += (dirX / Math.max(1, inputMag)) * accel * subDt;
      vy += (dirY / Math.max(1, inputMag)) * accel * subDt;
    }

    const damping = Math.exp(-player.friction * subDt);
    vx *= damping;
    vy *= damping;
    if (Math.hypot(vx, vy) < 1.2 && inputMag <= 1e-4) {
      vx = 0;
      vy = 0;
    }

    const clampedVel = clampSpeed(vx, vy, maxSpeed);
    player = {
      ...player,
      x: player.x + clampedVel.x * subDt,
      y: player.y + clampedVel.y * subDt,
      vx: clampedVel.x,
      vy: clampedVel.y,
    };

    for (const box of effectiveColliders) {
      player = resolveCircleVsAabb(player, box).body;
    }
    player = clampToWorldBounds(player).body;

    const nextProjectiles: ThrowableProjectile[] = [];
    for (const proj of projectiles) {
      const nextTtl = proj.ttlSec - subDt;
      if (nextTtl <= 0) continue;

      const pDamp = Math.exp(-proj.body.friction * subDt);
      const pVel = clampSpeed(proj.body.vx * pDamp, proj.body.vy * pDamp, proj.body.maxSpeed);
      let pBody: CircleBody = {
        ...proj.body,
        x: proj.body.x + pVel.x * subDt,
        y: proj.body.y + pVel.y * subDt,
        vx: pVel.x,
        vy: pVel.y,
      };
      let bounces = proj.bounces;

      for (const box of effectiveColliders) {
        const res = resolveCircleVsAabb(pBody, box);
        if (res.collided) {
          pBody = res.body;
          bounces += 1;
        }
      }
      const boundRes = clampToWorldBounds(pBody);
      pBody = boundRes.body;
      if (boundRes.bounced) bounces += 1;

      nextProjectiles.push({ ...proj, body: pBody, ttlSec: nextTtl, bounces });
    }
    projectiles = nextProjectiles;
  }

  const nextFocusBuffSec = Math.max(0, Number((world.focusBuffSec - dt).toFixed(3)));
  const nextStamina =
    seatedObjectId === "obj-rest-sofa-01"
      ? Math.min(100, Number((world.stamina + dt * 4).toFixed(2)))
      : world.stamina;

  return {
    ...world,
    player,
    targetPoint,
    seatedObjectId,
    stamina: nextStamina,
    focusBuffSec: nextFocusBuffSec,
    projectiles,
    activeRoomId: resolveAcousticRoomAt(world.rooms, player),
    tickCount: world.tickCount + 1,
  };
}

export function findNearestInteractable(
  world: StudioPhysicsWorldState,
  extraMargin = 0,
): StudioInteractiveObject | null {
  let nearest: StudioInteractiveObject | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const obj of world.objects) {
    const d = distanceBetween(world.player, obj);
    if (d <= obj.interactRadius + extraMargin && d < bestDist) {
      bestDist = d;
      nearest = obj;
    }
  }
  return nearest;
}

export function interactWithStudioObject(
  world: StudioPhysicsWorldState,
  objectId: string,
  options: ObjectInteractionOptions = {},
): ObjectInteractionOutcome {
  const target = world.objects.find((obj) => obj.id === objectId);
  if (!target) {
    return { world, ok: false, messageKo: "대상 오브젝트를 찾을 수 없습니다." };
  }

  const applyPatch = (
    messageKo: string,
    objPatch: Partial<StudioInteractiveObject>,
    worldPatch: Partial<StudioPhysicsWorldState>,
    sideEffect?: ObjectInteractionOutcome["sideEffect"],
  ): ObjectInteractionOutcome => ({
    ok: true,
    messageKo,
    ...(sideEffect ? { sideEffect } : {}),
    world: {
      ...world,
      ...worldPatch,
      objects: world.objects.map((obj) => (obj.id === objectId ? { ...obj, ...objPatch } : obj)),
      lastInteractionLog: messageKo,
    },
  });

  switch (target.kind) {
    case "sit-chair": {
      const alreadySeated = world.seatedObjectId === target.id;
      const snap = target.snapPoint ?? { x: target.x, y: target.y };
      const messageKo = alreadySeated ? `${target.nameKo}에서 일어났습니다.` : `${target.nameKo}에 착석했습니다.`;
      return applyPatch(
        messageKo,
        { active: !alreadySeated, stateLabelKo: alreadySeated ? "착석 대기" : "착석 중" },
        {
          player: alreadySeated ? world.player : { ...world.player, x: snap.x, y: snap.y, vx: 0, vy: 0 },
          targetPoint: null,
          seatedObjectId: alreadySeated ? null : target.id,
          activeRoomId: resolveAcousticRoomAt(world.rooms, alreadySeated ? world.player : snap),
        },
      );
    }

    case "whiteboard-review": {
      const note =
        options.note?.trim() ||
        `원고 검수 핀 #${world.whiteboardNotes.length + 1}: 컷 경계 여백과 말풍선 정렬 확인`;
      const nextNotes = [...world.whiteboardNotes, note];
      return applyPatch(
        `공유 화이트보드에 메모를 기록했습니다 (총 ${nextNotes.length}건).`,
        { active: true, stateLabelKo: `검수 메모 ${nextNotes.length}건` },
        { whiteboardNotes: nextNotes },
      );
    }

    case "deadline-board": {
      const nextUrgent = !world.deadlineUrgentMode;
      const label = nextUrgent
        ? `D-${world.deadlineRemainingHours}시간 · 마감 집중 경보`
        : `D-${world.deadlineRemainingHours}시간 · 정상`;
      return applyPatch(
        `마감 카운트다운 전광판 전환: ${label}`,
        { active: nextUrgent, stateLabelKo: label },
        { deadlineUrgentMode: nextUrgent },
      );
    }

    case "coffee-machine": {
      const nextStamina = Math.min(100, Math.round(world.stamina + 25));
      return applyPatch(
        `에스프레소 추출 완료! 스태미나 ${nextStamina}% · 이동 속도 +18% 버프(3분) 적용.`,
        { active: true, stateLabelKo: `버프 활성 (${nextStamina}%)` },
        { stamina: nextStamina, focusBuffSec: 180 },
      );
    }

    case "meeting-door": {
      const nextOpen = !target.active;
      const db = world.rooms.find((r) => r.doorObjectId === target.id)?.wallAttenuationDb ?? 42;
      const stateLabelKo = nextOpen ? "문 열림 (입장 가능)" : `방음 닫힘 (${db}dB 차폐)`;
      return applyPatch(`${target.nameKo}: ${stateLabelKo}`, { active: nextOpen, stateLabelKo }, {}, "room-door-toggled");
    }

    case "light-switch": {
      const nextMood = LIGHTING_ORDER[(LIGHTING_ORDER.indexOf(world.lightingMood) + 1) % LIGHTING_ORDER.length] ?? "daylight";
      const moodLabel: Record<StudioLightingMood, string> = {
        daylight: "주광색 (Daylight)",
        "warm-atelier": "따뜻한 아틀리에 (Warm)",
        "night-crunch": "야간 마감 조명 (Night)",
      };
      return applyPatch(
        `스튜디오 조명을 ${moodLabel[nextMood]} 모드로 바꿨습니다.`,
        { active: nextMood !== "night-crunch", stateLabelKo: moodLabel[nextMood] },
        { lightingMood: nextMood },
      );
    }

    case "asset-pedestal": {
      const nextIdx = (world.inspectedAssetIndex + 1) % world.showcaseAssets.length;
      const assetName = world.showcaseAssets[nextIdx] ?? "3D 배경 에셋";
      return applyPatch(
        `3D 에셋 진열대 회전: ${assetName} 미리보기 활성.`,
        { active: true, stateLabelKo: assetName },
        { inspectedAssetIndex: nextIdx },
      );
    }

    case "rest-sofa": {
      const snap = target.snapPoint ?? { x: target.x, y: target.y };
      const nextStamina = Math.min(100, Math.round(world.stamina + 30));
      return applyPatch(
        `아틀리에 소파에서 휴식했습니다 (스태미나 ${nextStamina}%).`,
        { active: true, stateLabelKo: `휴식 중 (${nextStamina}%)` },
        {
          player: { ...world.player, x: snap.x, y: snap.y, vx: 0, vy: 0 },
          targetPoint: null,
          seatedObjectId: target.id,
          stamina: nextStamina,
        },
      );
    }

    case "throwable-paper-plane": {
      const rawDir = options.throwDirection ?? { x: 0.85, y: -0.52 };
      const mag = Math.hypot(rawDir.x, rawDir.y) || 1;
      const kind = options.projectileKind ?? "paper-plane";
      const speed = kind === "paper-plane" ? 310 : 240;
      const projId = `proj-${world.tickCount}-${world.projectiles.length + 1}`;
      const projectile: ThrowableProjectile = {
        id: projId,
        kind,
        labelKo: kind === "paper-plane" ? "응원 종이비행기" : "마감 화이팅 스티커",
        senderName: options.senderName ?? "나 (PD)",
        ttlSec: 4.5,
        bounces: 0,
        body: {
          id: projId,
          x: world.player.x,
          y: world.player.y,
          vx: (rawDir.x / mag) * speed,
          vy: (rawDir.y / mag) * speed,
          radius: 8,
          mass: 0.2,
          restitution: 0.72,
          friction: 0.9,
          maxSpeed: 380,
        },
      };
      const nextProjectiles = [...world.projectiles.slice(-11), projectile];
      return applyPatch(
        `${projectile.labelKo}를 발사했습니다 (활성 소품 ${nextProjectiles.length}개).`,
        { active: true, stateLabelKo: `비행 중 ${nextProjectiles.length}개` },
        { projectiles: nextProjectiles },
        "projectile-launched",
      );
    }

    case "quest-kiosk": {
      const nextCount = world.questBoardOpenCount + 1;
      return applyPatch(
        `글로벌 외주 게시판 키오스크를 열었습니다 (${nextCount}회 조회).`,
        { active: true, stateLabelKo: `게시판 연결됨 (${nextCount}회)` },
        { questBoardOpenCount: nextCount },
        "open-quest-board",
      );
    }
  }
}

export function computeRoomAcousticAttenuation(
  world: StudioPhysicsWorldState,
  speakerPos: Vec2,
  listenerPos: Vec2,
  maxHearDistance = 320,
): RoomAcousticAttenuation {
  const speakerRoomId = resolveAcousticRoomAt(world.rooms, speakerPos);
  const listenerRoomId = resolveAcousticRoomAt(world.rooms, listenerPos);
  const distance = distanceBetween(speakerPos, listenerPos);

  const proximityGain =
    distance >= maxHearDistance
      ? 0
      : Number((1 / (1 + (distance / 76) ** 2)).toFixed(3));

  if (speakerRoomId === listenerRoomId && speakerRoomId !== "open-lounge") {
    return {
      gain: 1,
      distance: Number(distance.toFixed(1)),
      speakerRoomId,
      listenerRoomId,
      isolated: false,
      channelMode: "room-channel",
      reasonKo: "동일 회의실 전용 음성 채널 연결",
    };
  }

  if (speakerRoomId === "open-lounge" && listenerRoomId === "open-lounge") {
    return {
      gain: proximityGain,
      distance: Number(distance.toFixed(1)),
      speakerRoomId,
      listenerRoomId,
      isolated: proximityGain === 0,
      channelMode: "proximity",
      reasonKo:
        proximityGain > 0
          ? `오픈 라운지 근접 음성 (${Math.round(proximityGain * 100)}%)`
          : "오픈 라운지 가청 거리 밖",
    };
  }

  const checkDoorOpen = (roomId: AcousticRoomId): { open: boolean; bleed: number } => {
    const room = world.rooms.find((r) => r.id === roomId);
    if (!room || !room.doorObjectId) return { open: true, bleed: 1 };
    const door = world.objects.find((o) => o.id === room.doorObjectId);
    return { open: Boolean(door?.active), bleed: room.openDoorBleedFactor };
  };

  const speakerDoor = checkDoorOpen(speakerRoomId);
  const listenerDoor = checkDoorOpen(listenerRoomId);

  if (!speakerDoor.open || !listenerDoor.open) {
    return {
      gain: 0,
      distance: Number(distance.toFixed(1)),
      speakerRoomId,
      listenerRoomId,
      isolated: true,
      channelMode: "soundproof-blocked",
      reasonKo: "방음문 닫힘으로 음향 완전 격리",
    };
  }

  const bleedGain = Number((proximityGain * Math.min(speakerDoor.bleed, listenerDoor.bleed)).toFixed(3));
  return {
    gain: bleedGain,
    distance: Number(distance.toFixed(1)),
    speakerRoomId,
    listenerRoomId,
    isolated: bleedGain === 0,
    channelMode: "door-bleed",
    reasonKo: `방음문 개방 상태 누설 음향 (${Math.round(bleedGain * 100)}%)`,
  };
}
