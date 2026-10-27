/**
 * ToonOffice 2D 런타임: 입력 → 물리 → 배우·NPC·동료 → 엔진 이벤트(HUD 계약) → 카메라 → 렌더.
 *
 * React와 독립된 클래스라 가짜 시계·가짜 캔버스로 테스트한다. StudioOffice2dCanvas가 requestAnimationFrame으로
 * frame()·draw()를 부르고, 키·포인터 이벤트를 넘긴다. 엔진 이벤트 의미(구역 변경·근접 NPC·끼임·로컬 상태)는
 * 기존 Phaser·3D 스테이지와 같은 계약(StudioVirtualSpacePhaserCanvasProps)을 따른다.
 */
import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import {
  STUDIO_VIRTUAL_SPACE_NEARBY_NPC_LIMIT,
  STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS,
  StudioStuckDetector,
  StudioZoneChangeTracker,
  studioNearbyNpcIdsKey,
  type StudioVirtualSpaceNearbyNpc,
} from "../studio-virtual-space-engine-events";
import { STUDIO_INTERACT_KEY_CODES } from "../studio-virtual-space-interact-prompt";
import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { studioNpcActivityLabel, studioNpcInteraction, studioNpcLabel } from "../studio-virtual-space-npc-director";
import { nearestInteraction, type StudioVirtualSpacePhaserCanvasProps } from "../studio-virtual-space-phaser-canvas-model";
import { studioPoseSeatAnchors } from "../studio-virtual-space-pose-controller";
import type { StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import { findStudioWorldPath } from "../studio-virtual-space-world-pathfinding";
import {
  studioWorldInteractions,
  studioWorldPortals,
  studioWorldRoomAt,
  studioWorldSpawn,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldInteractionDefinition,
  type StudioWorldPortalDefinition,
} from "../studio-virtual-space-world-manifest";
import { studioVirtualWorldPresentation } from "../studio-virtual-space-world-presentation";
import { advanceOffice2dActor, createOffice2dActor, office2dEmoteGlyph, type Office2dActor } from "./office2d-actors";
import { Office2dCamera, office2dBaseZoom } from "./office2d-camera";
import { createOffice2dNpc, stepOffice2dNpc, type Office2dNpcState } from "./office2d-npc";
import { Office2dParticles } from "./office2d-particles";
import { OFFICE2D_CATEGORY, Office2dPhysicsWorld } from "./office2d-physics";
import type { Office2dCanvas2D } from "./office2d-procedural-art";
import { Office2dRenderer, type Office2dPropVisual, type Office2dRendererHost } from "./office2d-renderer";
import { office2dSceneFor, type Office2dScene, type Office2dSeatVisual } from "./office2d-scene";
import { studioUserStatusLabel } from "./office2d-status";
import { office2dAccentFor, office2dCharacterForAvatar, office2dCharacterForNpc, office2dHashIndex } from "./office2d-sprite-catalog";

export type Office2dRuntimeCallbacks = Pick<StudioVirtualSpacePhaserCanvasProps,
  | "onLocalState" | "onInteract" | "onNearbyInteractionChange" | "onPeerSelect" | "onCancelFollow" | "onPortal" | "onZoneChange"
  | "onNearbyNpcsChange" | "onStuckChange" | "onGhostModeChange" | "onNpcInteract" | "onSelfImpact" | "onRuntimeMetrics">;

export interface Office2dRuntimeOptions {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly bridge: StudioVirtualSpaceEngineBridge;
  readonly host: Office2dRendererHost;
  readonly selfIdentity: string;
  readonly getSnapshot: () => StudioVirtualSpaceSnapshot;
  readonly getSelfName: () => string;
  readonly getSeatedActors: () => NonNullable<StudioVirtualSpacePhaserCanvasProps["seatedActors"]>;
  readonly getCallbacks: () => Office2dRuntimeCallbacks;
  readonly getLanguage: () => "ko" | "en";
  readonly getReducedMotion: () => boolean;
  /** 실제 시계(ms). 테스트는 고정 값을 넣는다. */
  readonly clock?: () => number;
}

const SELF_BODY = "actor:self";
const SELF_RADIUS = 12;
const ACCELERATION = 1900;
const DECELERATION = 2600;
const LOCAL_STATE_INTERVAL_MS = 80;
const METRICS_INTERVAL_MS = 1000;
const PEER_INTERPOLATION = 11;
const TAP_ACTOR_RADIUS = 30;

function length(x: number, y: number): number {
  return Math.hypot(x, y);
}

export class Office2dRuntime {
  readonly scene: Office2dScene;
  readonly camera: Office2dCamera;
  private readonly physics: Office2dPhysicsWorld;
  private readonly renderer: Office2dRenderer;
  private readonly particles = new Office2dParticles();
  private readonly interactions: readonly StudioWorldInteractionDefinition[];
  private readonly portals: readonly StudioWorldPortalDefinition[];
  private readonly zoneTracker: StudioZoneChangeTracker;
  private readonly stuck = new StudioStuckDetector();
  private readonly self: Office2dActor;
  private readonly peers = new Map<string, Office2dActor>();
  private readonly npcs: { readonly state: Office2dNpcState; readonly actor: Office2dActor }[] = [];
  private readonly keys = new Set<string>();
  private readonly walkSpeed: number;
  private readonly sprintMultiplier: number;
  private path: StudioVirtualSpacePoint[] = [];
  private destination: StudioVirtualSpacePoint | null = null;
  private pending: { readonly kind: "interaction" | "npc"; readonly id: string } | null = null;
  private lastInteractionId: string | null | undefined = undefined;
  private lastNpcKey: string | null = null;
  private lastLocalStateAt = -Infinity;
  private lastLocalKey = "";
  private lastImpactAt = 0;
  private metricsFrames = 0;
  private metricsStartedAt = 0;
  private readonly armedPortals = new Map<string, boolean>();
  private readonly seenReactions = new Map<string, number>();
  private elapsed = 0;
  private snapCamera = true;
  private ambientTimer = 0;
  private started = false;

  constructor(private readonly options: Office2dRuntimeOptions) {
    const { manifest } = options;
    this.scene = office2dSceneFor(manifest);
    this.interactions = studioWorldInteractions(manifest);
    this.portals = studioWorldPortals(manifest);
    this.zoneTracker = new StudioZoneChangeTracker(manifest);
    const presentation = studioVirtualWorldPresentation(manifest);
    this.walkSpeed = presentation?.locomotion?.walkSpeed ?? 210;
    this.sprintMultiplier = presentation?.locomotion?.sprintMultiplier ?? 1.55;
    this.physics = new Office2dPhysicsWorld({ width: manifest.width, height: manifest.height });
    this.physics.setSurfaceRegions(this.scene.floors.map((floor) => ({
      x: floor.x,
      y: floor.y,
      width: floor.width,
      height: floor.height,
      material: floor.floor,
    })));
    this.scene.staticColliders.forEach((rect, index) => {
      if (rect.width <= 0 || rect.height <= 0) return;
      this.physics.addBody({ id: `static:${index}`, kind: "static", shape: { type: "box", halfWidth: rect.width / 2, halfHeight: rect.height / 2 },
        x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, category: OFFICE2D_CATEGORY.world, friction: 0.05 });
    });
    for (const prop of this.scene.physicsProps) {
      this.physics.addBody({ id: `prop:${prop.id}`, kind: "dynamic", shape: prop.shape, x: prop.x, y: prop.y, mass: prop.mass, restitution: prop.restitution,
        linearDamping: prop.damping, angularDamping: prop.rolls ? 2.4 : 4.6, friction: 0.32, fixedRotation: false, rolls: prop.rolls === true,
        category: OFFICE2D_CATEGORY.prop, returnHome: prop.returnHome, tag: prop.sprite, maxSpeed: 640 });
    }
    const snapshot = options.getSnapshot();
    const start = this.resolveStart(snapshot);
    this.physics.addBody({ id: SELF_BODY, kind: "dynamic", shape: { type: "circle", radius: SELF_RADIUS }, x: start.x, y: start.y, mass: 60,
      linearDamping: 0, restitution: 0, friction: 0.1, category: OFFICE2D_CATEGORY.actor, maxSpeed: 600 });
    const now = this.now();
    this.self = createOffice2dActor({ id: options.selfIdentity, kind: "self", character: office2dCharacterForAvatar(snapshot.self.avatarIndex, options.selfIdentity),
      accent: office2dAccentFor(options.selfIdentity), name: options.getSelfName(), x: start.x, y: start.y, facing: snapshot.self.facing, now });
    manifest.npcs.forEach((definition, index) => {
      const state = createOffice2dNpc(definition, office2dHashIndex(definition.id, 1_000_003) + index);
      const label = studioNpcLabel(definition);
      const actor = createOffice2dActor({ id: `npc:${definition.id}`, kind: "npc", character: office2dCharacterForNpc(definition.skinKey), accent: "#a78bfa",
        name: options.getLanguage() === "en" ? label.en : label.ko, x: definition.point.x, y: definition.point.y, facing: definition.facing, now });
      this.physics.addBody({ id: `npc:${definition.id}`, kind: "kinematic", shape: { type: "circle", radius: 11 }, x: definition.point.x, y: definition.point.y,
        category: OFFICE2D_CATEGORY.actor });
      this.npcs.push({ state, actor });
    });
    this.camera = new Office2dCamera(manifest.width, manifest.height, start);
    this.renderer = new Office2dRenderer(this.scene, options.host);
    for (const portal of this.portals) this.armedPortals.set(portal.id, length(portal.point.x - start.x, portal.point.y - start.y) > portal.radius);
  }

  private now(): number {
    return this.options.clock ? this.options.clock() : Date.now();
  }

  private resolveStart(snapshot: StudioVirtualSpaceSnapshot): StudioVirtualSpacePoint {
    const { manifest } = this.options;
    const saved = snapshot.self;
    const candidate = Number.isFinite(saved.x) && Number.isFinite(saved.y) && (saved.x > 0 || saved.y > 0) && studioWorldRoomAt(manifest, saved) === saved.zoneId
      ? { x: saved.x, y: saved.y }
      : studioWorldSpawn(manifest).point;
    return this.physics.nearestFreePoint(candidate.x, candidate.y, SELF_RADIUS) ?? studioWorldSpawn(manifest).point;
  }

  /** 이미지 로딩이 끝난 뒤 한 번. 첫 구역 이벤트를 보낸다. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.renderer.invalidateFloor();
    const zone = this.zoneTracker.next(this.self);
    if (zone) this.options.getCallbacks().onZoneChange?.(zone);
    this.metricsStartedAt = this.now();
  }

  setViewport(width: number, height: number): void {
    this.camera.setViewport({ width, height });
  }

  keyDown(code: string): void {
    this.keys.add(code);
    if (STUDIO_INTERACT_KEY_CODES.has(code)) this.options.bridge.requestInteract();
    if (code === "Space" || code === "KeyF") this.kickNearbyProp();
    if (code === "KeyG") {
      const enabled = this.options.bridge.toggleGhostMode();
      this.options.getCallbacks().onGhostModeChange?.(enabled);
    }
  }

  /** 근처 동적 물리 소품(짐볼·의자·카트·휴지통 등)에 방향 충격량과 오프센터 스핀 토크를 가한다. */
  private kickNearbyProp(): boolean {
    let closestId: string | null = null;
    let closestDist = 64;
    for (const prop of this.scene.physicsProps) {
      const body = this.physics.getBody(`prop:${prop.id}`);
      if (!body) continue;
      const dist = length(body.x - this.self.x, body.y - this.self.y);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = body.id;
      }
    }
    if (!closestId) return false;
    const body = this.physics.getBody(closestId);
    if (!body) return false;
    const dx = body.x - this.self.x;
    const dy = body.y - this.self.y;
    const dist = Math.max(1, length(dx, dy));
    const nx = dx / dist;
    const ny = dy / dist;
    const baseMass = body.invMass > 0 ? 1 / body.invMass : 10;
    const impulseMag = Math.min(2800, Math.max(420, baseMass * 240));
    const spinOffset = { rx: -ny * 8, ry: nx * 8 };
    this.physics.applyImpulse(closestId, nx * impulseMag, ny * impulseMag, spinOffset, baseMass * 12);
    this.self.squash = -0.055;
    if (!this.options.getReducedMotion()) {
      this.particles.emit("spark", body.x - nx * 8, body.y - ny * 8, 6, 1.1);
    }
    return true;
  }

  keyUp(code: string): void {
    this.keys.delete(code);
  }

  /** 창이 초점을 잃으면 눌린 키를 모두 놓는다(계속 걷는 문제 방지). */
  releaseKeys(): void {
    this.keys.clear();
  }

  /** 화면 탭/클릭(CSS px). 동료·NPC·작업대를 고르거나 그 지점으로 걸어간다. */
  tap(screenX: number, screenY: number): void {
    const world = this.camera.screenToWorld({ x: screenX, y: screenY });
    const hitActor = (actor: Office2dActor) => {
      const footY = actor.seat ? actor.seat.attach.y + 16 : actor.y;
      const footX = actor.seat ? actor.seat.attach.x : actor.x;
      return Math.abs(world.x - footX) < TAP_ACTOR_RADIUS * 0.75 && world.y < footY + 8 && world.y > footY - 78;
    };
    for (const [sessionId, actor] of this.peers) {
      if (actor.leavingAt === null && hitActor(actor)) {
        this.options.getCallbacks().onPeerSelect(sessionId);
        return;
      }
    }
    for (const { state, actor } of this.npcs) {
      if (!hitActor(actor)) continue;
      this.approach({ x: state.x, y: state.y + 30 }, { kind: "npc", id: state.definition.id });
      return;
    }
    const object = this.scene.objects.find((candidate) => {
      if (!candidate.interactionId || !candidate.footprint) return false;
      const box = candidate.footprint;
      return world.x >= box.x - 6 && world.x <= box.x + box.width + 6 && world.y >= box.y - 70 && world.y <= box.y + box.height + 10;
    });
    if (object?.interactionId) {
      const interaction = this.interactions.find((item) => item.id === object.interactionId);
      if (interaction) {
        this.approach({ x: interaction.point.x, y: interaction.point.y + 24 }, { kind: "interaction", id: interaction.id });
        return;
      }
    }
    this.approach(world, null);
  }

  wheel(deltaY: number): void {
    if (!Number.isFinite(deltaY) || deltaY === 0) return;
    this.options.bridge.userZoom.apply(deltaY < 0 ? "in" : "out");
  }

  private approach(target: StudioVirtualSpacePoint, pending: { readonly kind: "interaction" | "npc"; readonly id: string } | null): void {
    const free = this.physics.nearestFreePoint(target.x, target.y, SELF_RADIUS, 160);
    if (!free) return;
    if (this.options.bridge.getFollowingPeer()) this.options.getCallbacks().onCancelFollow();
    const route = findStudioWorldPath(this.options.manifest, this.self, free);
    this.path = (route.length ? route : [free]).filter((point) => length(point.x - this.self.x, point.y - this.self.y) > 6).map((point) => ({ x: point.x, y: point.y }));
    this.destination = free;
    this.pending = pending;
  }

  private inputVector(): { readonly x: number; readonly y: number } {
    const joystick = this.options.bridge.getJoystick();
    let x = joystick.x;
    let y = joystick.y;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) x -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) x += 1;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) y -= 1;
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) y += 1;
    const magnitude = length(x, y);
    // 대각선 정규화: 어느 방향이든 같은 속도(WorkAdventure의 √2배 문제를 피한다).
    return magnitude > 1 ? { x: x / magnitude, y: y / magnitude } : { x, y };
  }

  private consumeBridge(nowMs: number): void {
    const { bridge, manifest } = this.options;
    const teleport = bridge.consumeTeleport();
    if (teleport) this.teleport(teleport);
    const move = bridge.consumeMoveTarget();
    if (move) {
      const distance = length(move.x - this.self.x, move.y - this.self.y);
      const crossRoom = studioWorldRoomAt(manifest, move) !== studioWorldRoomAt(manifest, this.self);
      if (distance > 900 && crossRoom) this.teleport(move);
      else this.approach(move, null);
    }
    if (bridge.consumeUnstuck()) this.teleport(studioWorldSpawn(manifest).point);
    const emote = bridge.consumeEmote();
    if (emote) this.showEmote(this.self, emote, nowMs);
    const effect = bridge.consumeEnvironmentEffect();
    if (effect) this.particles.emit("confetti", effect.point.x, effect.point.y - 30, 24, 1.2);
  }

  private teleport(point: StudioVirtualSpacePoint): void {
    const free = this.physics.nearestFreePoint(point.x, point.y, SELF_RADIUS) ?? studioWorldSpawn(this.options.manifest).point;
    this.physics.teleport(SELF_BODY, free.x, free.y);
    this.self.x = free.x;
    this.self.y = free.y;
    this.path = [];
    this.destination = null;
    this.pending = null;
    this.snapCamera = true;
    this.particles.emit("ring", free.x, free.y, 1, 2);
    if (this.stuck.reset()) this.options.getCallbacks().onStuckChange?.(false);
  }

  private showEmote(actor: Office2dActor, kind: string, nowMs: number): void {
    const glyph = office2dEmoteGlyph(kind);
    if (!glyph) return;
    actor.emote = { glyph, until: nowMs + 2600 };
    this.particles.emit("confetti", actor.x, actor.y - 60, 10, 0.7);
  }

  /** 한 프레임 진행(초 단위 경과). */
  frame(deltaSeconds: number): void {
    const dt = Math.min(0.1, Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
    const nowMs = this.now();
    this.elapsed += dt;
    const callbacks = this.options.getCallbacks();
    const { bridge } = this.options;
    this.consumeBridge(nowMs);

    // 1) 로컬 아바타 조작
    const input = this.inputVector();
    const directional = length(input.x, input.y) > 0.05;
    if (directional && (this.path.length || this.pending)) {
      this.path = [];
      this.destination = null;
      this.pending = null;
    }
    if (directional && bridge.getFollowingPeer()) callbacks.onCancelFollow();
    const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = this.walkSpeed * (sprint ? this.sprintMultiplier : 1);
    let desiredX = 0;
    let desiredY = 0;
    if (directional) {
      desiredX = input.x * speed;
      desiredY = input.y * speed;
    } else {
      const following = bridge.getFollowingPeer();
      const leader = following ? this.peers.get(following) : undefined;
      if (leader && length(leader.x - this.self.x, leader.y - this.self.y) > 70 && this.path.length === 0) this.approach({ x: leader.x, y: leader.y + 36 }, null);
      const next = this.path[0];
      if (next) {
        const dx = next.x - this.self.x;
        const dy = next.y - this.self.y;
        const distance = length(dx, dy);
        if (distance < 9) {
          this.path.shift();
          if (this.path.length === 0) this.destination = null;
        } else {
          const arrive = this.path.length === 1 ? Math.min(1, distance / 40) : 1;
          desiredX = (dx / distance) * speed * arrive;
          desiredY = (dy / distance) * speed * arrive;
        }
      }
    }
    const body = this.physics.getBody(SELF_BODY);
    if (body) {
      const dvx = desiredX - body.vx;
      const dvy = desiredY - body.vy;
      const change = length(dvx, dvy);
      const rate = (length(desiredX, desiredY) > 1 ? ACCELERATION : DECELERATION) * dt;
      const scale = change > rate ? rate / change : 1;
      this.physics.setVelocity(SELF_BODY, body.vx + dvx * scale, body.vy + dvy * scale);
      this.physics.setCollisionMask(SELF_BODY, bridge.isGhostMode() ? OFFICE2D_CATEGORY.world : OFFICE2D_CATEGORY.world | OFFICE2D_CATEGORY.prop | OFFICE2D_CATEGORY.actor);
    }

    // 2) NPC·동료 목표 갱신
    for (const { state } of this.npcs) {
      stepOffice2dNpc(state, this.self, dt, nowMs);
      this.physics.setKinematicTarget(`npc:${state.definition.id}`, state.x, state.y);
    }
    this.syncPeers(dt, nowMs);

    // 3) 물리
    const report = this.physics.step(dt);
    for (const impact of report.impacts) {
      const involvesSelf = impact.a === SELF_BODY || impact.b === SELF_BODY;
      const other = this.physics.getBody(impact.a === SELF_BODY ? impact.b : impact.a);
      const point = other ?? this.physics.getBody(impact.a);
      if (point && impact.impactSpeed > 75) {
        this.particles.emit(
          impact.impactSpeed > 230 ? "spark" : "dust",
          impact.contactX ?? point.x,
          impact.contactY ?? point.y,
          Math.min(10, impact.impactSpeed / 36),
          Math.min(2, impact.impactSpeed / 190),
        );
      }
      if (involvesSelf && other?.kind === "dynamic" && body) {
        this.self.squash = Math.max(-0.085, this.self.squash - Math.min(0.06, impact.impactSpeed / 3200));
        if (nowMs - this.lastImpactAt > 300) {
          this.lastImpactAt = nowMs;
          callbacks.onSelfImpact?.(body.vx, body.vy);
        }
      }
    }
    if (body) advanceOffice2dActor(this.self, body.x, body.y, dt);
    if (this.self.moving && sprint && !this.options.getReducedMotion() && Math.floor(this.self.stride / 26) !== Math.floor((this.self.stride - speed * dt) / 26)) {
      this.particles.emit("dust", this.self.x, this.self.y, 2, 0.6);
    }
    for (const { state, actor } of this.npcs) {
      const npcBody = this.physics.getBody(`npc:${state.definition.id}`);
      advanceOffice2dActor(actor, npcBody?.x ?? state.x, npcBody?.y ?? state.y, dt);
      if (!actor.moving) actor.facing = state.facing;
    }

    // 4) 자세·좌석
    this.updateSeats(nowMs);
    this.self.name = this.options.getSelfName() || (this.options.getLanguage() === "en" ? "Me" : "나");
    const snapshot = this.options.getSnapshot();
    this.self.character = office2dCharacterForAvatar(snapshot.self.avatarIndex, this.options.selfIdentity);
    this.self.bubble = snapshot.selfChatBubble && snapshot.selfChatBubble.expiresAt > nowMs ? snapshot.selfChatBubble.text : snapshot.self.bubble ?? null;
    this.self.status = studioUserStatusLabel(snapshot.self.userStatus, snapshot.self.activity, this.options.getLanguage());

    // 5) 엔진 이벤트
    this.emitSignals(directional, nowMs);

    // 6) 카메라·파티클
    const conversation = bridge.getConversationFocus();
    const focus = conversation ? { x: (conversation.x + this.self.x) / 2, y: (conversation.y + this.self.y) / 2 } : this.self;
    const zoom = office2dBaseZoom(this.camera.getViewport()) * bridge.userZoom.get() * (conversation ? 1.15 : 1);
    const lead = body && !conversation ? { x: body.vx * 0.12, y: body.vy * 0.1 } : { x: 0, y: 0 };
    this.camera.follow(focus, dt, { zoom, leadX: lead.x, leadY: lead.y, snap: this.snapCamera });
    this.snapCamera = false;
    this.updateAmbient(dt);
    this.particles.update(dt);
    this.metricsFrames += 1;
    if (nowMs - this.metricsStartedAt >= METRICS_INTERVAL_MS) this.emitMetrics(nowMs);
  }

  private syncPeers(dt: number, nowMs: number): void {
    const snapshot = this.options.getSnapshot();
    const live = new Set<string>();
    const language = this.options.getLanguage();
    for (const peer of snapshot.peers) {
      const sessionId = peer.participant.sessionId;
      live.add(sessionId);
      let actor = this.peers.get(sessionId);
      if (!actor) {
        actor = createOffice2dActor({ id: `peer:${sessionId}`, kind: "peer", character: office2dCharacterForAvatar(peer.state.avatarIndex, sessionId),
          accent: office2dAccentFor(sessionId), name: peer.participant.displayName, x: peer.state.x, y: peer.state.y, facing: peer.state.facing, now: nowMs });
        this.peers.set(sessionId, actor);
        if (!this.physics.getBody(actor.id)) {
          this.physics.addBody({ id: actor.id, kind: "kinematic", shape: { type: "circle", radius: 11 }, x: peer.state.x, y: peer.state.y, category: OFFICE2D_CATEGORY.actor });
        }
      }
      actor.leavingAt = null;
      actor.name = peer.participant.displayName;
      actor.character = office2dCharacterForAvatar(peer.state.avatarIndex, sessionId);
      const bubble = snapshot.chatBubbles.find((item) => item.sessionId === sessionId && item.expiresAt > nowMs);
      actor.bubble = bubble?.text ?? peer.state.bubble ?? null;
      actor.typing = peer.state.typing === true || snapshot.peerTyping.some((item) => item.sessionId === sessionId && item.expiresAt > nowMs);
      actor.status = studioUserStatusLabel(peer.state.userStatus, peer.state.activity, language);
      const far = length(peer.state.x - actor.x, peer.state.y - actor.y) > 320;
      const t = far ? 1 : 1 - Math.exp(-dt * PEER_INTERPOLATION);
      const nextX = actor.x + (peer.state.x - actor.x) * t;
      const nextY = actor.y + (peer.state.y - actor.y) * t;
      if (far) this.physics.teleport(actor.id, nextX, nextY);
      else this.physics.setKinematicTarget(actor.id, nextX, nextY);
      advanceOffice2dActor(actor, nextX, nextY, dt);
      if (!actor.moving) actor.facing = peer.state.facing;
      if (peer.state.emote && actor.emote === null) this.showEmote(actor, peer.state.emote, nowMs);
    }
    for (const reaction of snapshot.peerReactions) {
      const key = `${reaction.sessionId}:${reaction.reaction}`;
      if (this.seenReactions.get(key) === reaction.expiresAt) continue;
      this.seenReactions.set(key, reaction.expiresAt);
      const actor = this.peers.get(reaction.sessionId);
      if (actor) this.showEmote(actor, reaction.reaction, nowMs);
    }
    for (const [sessionId, actor] of this.peers) {
      if (live.has(sessionId)) continue;
      if (actor.leavingAt === null) actor.leavingAt = nowMs;
      else if (nowMs - actor.leavingAt > 480) {
        this.peers.delete(sessionId);
        this.physics.removeBody(actor.id);
      }
    }
    for (const actor of [this.self, ...this.peers.values()]) if (actor.emote && actor.emote.until <= nowMs) actor.emote = null;
  }

  private seatFor(point: StudioVirtualSpacePoint): Office2dSeatVisual | null {
    let best: Office2dSeatVisual | null = null;
    let bestDistance = 10;
    for (const seat of this.scene.seats) {
      const distance = Math.min(length(seat.attach.x - point.x, seat.attach.y - point.y), length(seat.anchor.x - point.x, seat.anchor.y - point.y));
      if (distance < bestDistance) {
        best = seat;
        bestDistance = distance;
      }
    }
    return best;
  }

  private updateSeats(nowMs: number): void {
    const seated = this.options.getSeatedActors();
    const pose = this.options.bridge.updatePoseState({
      position: this.self,
      moving: this.self.moving,
      seatAnchors: studioPoseSeatAnchors({ seatedActors: seated, interactionSlots: this.options.manifest.interactionSlots }),
      openArea: true,
      now: nowMs,
    });
    const leased = seated.find((actor) => actor.id === this.options.selfIdentity);
    const seatPoint = leased?.anchorPoint ?? (pose.pose === "sit" ? pose.anchor?.point : undefined);
    this.self.seat = seatPoint && !this.self.moving ? this.seatFor(seatPoint) : null;
    for (const [sessionId, actor] of this.peers) {
      const entry = seated.find((item) => item.id === sessionId);
      actor.seat = entry && !actor.moving ? this.seatFor(entry.anchorPoint) : null;
    }
  }

  private emitSignals(directional: boolean, nowMs: number): void {
    const callbacks = this.options.getCallbacks();
    const { manifest, bridge } = this.options;
    const zone = this.zoneTracker.next(this.self);
    if (zone && this.started) callbacks.onZoneChange?.(zone);

    const nearbyNpcs: StudioVirtualSpaceNearbyNpc[] = [];
    const language = this.options.getLanguage();
    for (const { state, actor } of this.npcs) {
      const distance = length(state.x - this.self.x, state.y - this.self.y);
      actor.highlighted = distance <= STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS * 0.5;
      if (distance > STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS) continue;
      const label = studioNpcLabel(state.definition);
      const activity = studioNpcActivityLabel(state.definition, state.moving ? "walk" : state.yielding ? "yield" : "work");
      nearbyNpcs.push({ id: state.definition.id, npc: state.definition, labelKo: label.ko, labelEn: label.en, activityKo: activity.ko, activityEn: activity.en,
        skinKey: state.definition.skinKey, distance, interaction: studioNpcInteraction(manifest, state.definition) });
      actor.name = language === "en" ? label.en : label.ko;
    }
    nearbyNpcs.sort((left, right) => left.distance - right.distance);
    const limited = nearbyNpcs.slice(0, STUDIO_VIRTUAL_SPACE_NEARBY_NPC_LIMIT);
    const npcKey = studioNearbyNpcIdsKey(limited);
    if (npcKey !== this.lastNpcKey) {
      this.lastNpcKey = npcKey;
      callbacks.onNearbyNpcsChange?.(limited);
    }

    const closest = nearestInteraction(this.interactions, this.self);
    if ((closest?.id ?? null) !== this.lastInteractionId) {
      this.lastInteractionId = closest?.id ?? null;
      callbacks.onNearbyInteractionChange?.(closest);
    }

    if (this.pending) {
      const pending = this.pending;
      if (pending.kind === "interaction") {
        const target = this.interactions.find((item) => item.id === pending.id);
        if (target && length(target.point.x - this.self.x, target.point.y - this.self.y) <= target.radius + 12) {
          this.pending = null;
          this.path = [];
          this.destination = null;
          callbacks.onInteract(target);
        }
      } else {
        const npc = limited.find((item) => item.id === pending.id);
        if (npc?.interaction && npc.distance <= 70) {
          this.pending = null;
          this.path = [];
          this.destination = null;
          callbacks.onNpcInteract?.(npc.interaction, npc.npc);
        }
      }
    }

    if (bridge.consumeInteract()) {
      const npc = limited[0];
      if (npc?.interaction && npc.distance <= 90) callbacks.onNpcInteract?.(npc.interaction, npc.npc);
      else if (closest) callbacks.onInteract(closest);
      else {
        const portal = this.portals.find((candidate) => length(candidate.point.x - this.self.x, candidate.point.y - this.self.y) <= candidate.radius + 16);
        if (portal) callbacks.onPortal?.(portal);
      }
    }

    for (const portal of this.portals) {
      const inside = length(portal.point.x - this.self.x, portal.point.y - this.self.y) <= portal.radius;
      if (!inside) this.armedPortals.set(portal.id, true);
      else if (this.armedPortals.get(portal.id) && this.self.moving) {
        this.armedPortals.set(portal.id, false);
        callbacks.onPortal?.(portal);
      }
    }

    if (this.stuck.sample({ time: nowMs, directional, point: this.self })) callbacks.onStuckChange?.(this.stuck.value);

    const point = { x: Math.round(this.self.x), y: Math.round(this.self.y) };
    const pose = bridge.getPose();
    const key = `${point.x}:${point.y}:${this.self.facing}:${this.self.moving}:${pose}`;
    if (key !== this.lastLocalKey && nowMs - this.lastLocalStateAt >= LOCAL_STATE_INTERVAL_MS) {
      this.lastLocalKey = key;
      this.lastLocalStateAt = nowMs;
      callbacks.onLocalState({ point, facing: this.self.facing, moving: this.self.moving, zoneId: studioWorldRoomAt(manifest, point), pose });
    }
  }

  private updateAmbient(dt: number): void {
    if (this.options.getReducedMotion()) return;
    this.ambientTimer += dt;
    if (this.ambientTimer < 0.22) return;
    this.ambientTimer = 0;
    const visible = this.camera.visibleRect();
    for (const object of this.scene.objects) {
      if (object.sprite !== "coffee-machine" || object.x < visible.minX || object.x > visible.maxX || object.y < visible.minY || object.y > visible.maxY + 80) continue;
      this.particles.emit("steam", object.x - 22, object.y - 70, 1, 1);
    }
    if (this.daylight() > 0.5) {
      for (const light of this.scene.lights) {
        if (light.kind !== "window" || light.x < visible.minX || light.x > visible.maxX || light.y < visible.minY || light.y > visible.maxY) continue;
        if (this.particles.count < 200) this.particles.emit("mote", light.x + 20, light.y + 40, 1, 1);
      }
    }
  }

  /** 0(밤)~1(낮). 주야 사이클이 켜져 있으면 가상 시계를, 아니면 이 기기 시계를 쓴다. 사무실 조명이 있어 밤에도 0.3 아래로 내려가지 않는다. */
  daylight(): number {
    const cycle = this.options.bridge.getDayNightCycle();
    let hour: number;
    if (cycle.enabled) {
      const period = cycle.cycleMs && cycle.cycleMs > 0 ? cycle.cycleMs : 86_400_000;
      hour = ((((cycle.now - cycle.startMs) % period) + period) % period) / period * 24;
    } else {
      const date = new Date(this.now());
      hour = date.getHours() + date.getMinutes() / 60;
    }
    const ramp = (value: number) => Math.max(0, Math.min(1, value));
    const day = hour < 12 ? ramp((hour - 5.5) / 2.5) : ramp((19.5 - hour) / 2.5);
    return 0.3 + day * 0.7;
  }

  private emitMetrics(nowMs: number): void {
    const seconds = Math.max(0.001, (nowMs - this.metricsStartedAt) / 1000);
    const fps = Math.round(this.metricsFrames / seconds);
    const visible = this.camera.visibleRect(40);
    const isVisible = (actor: Office2dActor) => actor.x >= visible.minX && actor.x <= visible.maxX && actor.y >= visible.minY && actor.y <= visible.maxY;
    this.options.getCallbacks().onRuntimeMetrics?.({
      fps,
      frameTimeMs: fps > 0 ? Math.round(1000 / fps) : 0,
      qualityTier: fps >= 50 ? "high" : fps >= 30 ? "balanced" : "battery",
      peerCount: this.peers.size,
      visiblePeerCount: [...this.peers.values()].filter(isVisible).length,
      npcCount: this.npcs.length,
      visibleNpcCount: this.npcs.filter(({ actor }) => isVisible(actor)).length,
      routeWaypoints: this.path.length,
      failedTextures: 0,
      updatedAt: nowMs,
    });
    this.metricsFrames = 0;
    this.metricsStartedAt = nowMs;
  }

  /** 캔버스에 그린다. ctx는 장치 픽셀 크기 캔버스다. */
  draw(ctx: Office2dCanvas2D, pixelRatio: number): void {
    const props: Office2dPropVisual[] = this.scene.physicsProps.map((prop) => {
      const body = this.physics.getBody(`prop:${prop.id}`);
      const radius = prop.shape.type === "circle" ? prop.shape.radius : prop.shape.halfHeight;
      return {
        id: prop.id,
        sprite: prop.sprite,
        x: body?.x ?? prop.x,
        y: body?.y ?? prop.y,
        width: prop.width,
        radius,
        spin: body?.spin ?? 0,
        rolls: prop.rolls === true,
        angle: body?.angle ?? 0,
        angularVelocity: body?.angularVelocity ?? 0,
        impactSquash: body?.impactSquash ?? 0,
        vx: body?.vx ?? 0,
        vy: body?.vy ?? 0,
      };
    });
    this.renderer.render(ctx, {
      camera: this.camera,
      pixelRatio,
      time: this.elapsed,
      now: this.now(),
      actors: [this.self, ...this.npcs.map(({ actor }) => actor), ...this.peers.values()],
      selfId: this.self.id,
      props,
      nearbyInteractionId: this.lastInteractionId ?? null,
      destination: this.destination,
      locateTarget: this.locateTarget(),
      daylight: this.daylight(),
      reducedMotion: this.options.getReducedMotion(),
      language: this.options.getLanguage(),
      particles: this.particles,
      ghost: this.options.bridge.isGhostMode(),
    });
  }

  private locateTarget(): StudioVirtualSpacePoint | null {
    const target = this.options.bridge.getLocateTarget();
    const peer = target ? this.peers.get(target) : undefined;
    if (peer) return peer;
    return this.options.bridge.getLocatePoint();
  }

  /** 테스트·디버깅용 읽기 전용 상태. */
  debugState(): { readonly self: StudioVirtualSpacePoint; readonly facing: string; readonly moving: boolean; readonly seated: boolean; readonly peers: number; readonly props: readonly StudioVirtualSpacePoint[] } {
    return {
      self: { x: this.self.x, y: this.self.y },
      facing: this.self.facing,
      moving: this.self.moving,
      seated: this.self.seat !== null,
      peers: this.peers.size,
      props: this.scene.physicsProps.map((prop) => {
        const body = this.physics.getBody(`prop:${prop.id}`);
        return { x: body?.x ?? prop.x, y: body?.y ?? prop.y };
      }),
    };
  }
}
