/**
 * ToonOffice 2D 스테이지 확장:
 * - 원거리 경로 이동 가속(SoWork far_distance_speed_multiplier 벤치마크 F6)
 * - 저작 타일 이펙트(tileEffects) 바닥 렌더링 및 진입 발동(resolveTileEffectTrigger)
 * - 빌드 모드 배치 고정물(placedFixtures) 및 꾸미기(decorations) 2D 월드 렌더링
 * - 가구·오브젝트 상호작용 상태 전이(커피 추출·조명 토글·보드 동기화·교정지 출력) 및 전파(onObjectStateChange)
 * - 손 흔들기(waveActorIds) 및 가이드 투어(guideTourRequest) 연동
 * - 공간 테마(spaceTheme) 배경 외곽 톤 매핑
 */
import type { StudioBuildPlacedFixture } from "../studio-virtual-space-build-mode-vitality";
import { studioHuddleAudioFocusSnapshot } from "../../live/huddle/studio-p2p-huddle-audio-focus";
import type { StudioVirtualDecorationState, StudioVirtualDecorType } from "../studio-virtual-space-customization";
import type { StudioDayNightCycleConfig } from "../studio-virtual-space-engine-bridge";
import type { StudioInteractableStateKey } from "../studio-virtual-space-interactable-objects";
import type { StudioInteractionFxObjectStateChange } from "../studio-virtual-space-interaction-fx";
import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import {
  studioNpcGuideStops,
  type StudioNpcGuideStop,
  type StudioVirtualNpcGuideTourRequest,
  type StudioVirtualNpcGuideTourState,
} from "../studio-virtual-space-npc-guide";
import { isStudioSpaceThemeKey, studioSpaceTheme, type StudioSpaceThemeKey } from "../studio-virtual-space-theme";
import {
  resolveTileEffectTrigger,
  STUDIO_TILE_EFFECT_TILE_SIZE,
  type StudioTileEffectDefinition,
  type StudioTileEffectTrigger,
} from "../studio-virtual-space-tile-effects";
import type { StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import type { Office2dActor } from "./office2d-actors";
import type { Office2dComicBurst } from "./office2d-backdrop-art";
import type { Office2dVisibleRect } from "./office2d-camera";
import { OFFICE2D_OVERLAY_FONT } from "./office2d-overlay";
import type { Office2dParticles } from "./office2d-particles";
import type { Office2dPhysicsWorld } from "./office2d-physics";
import { office2dRoundRect, type Office2dCanvas2D } from "./office2d-procedural-art";
import type { Office2dScene } from "./office2d-scene";
import { OFFICE2D_SPRITE_SPECS, type Office2dSpriteKey } from "./office2d-sprite-catalog";

const DEFAULT_OUTSIDE_COLOR = "#2b2420";
const FAR_DISTANCE_START_PX = 320;
const FAR_DISTANCE_FULL_PX = 960;
const FAR_DISTANCE_MAX_MULTIPLIER = 1.45;

/**
 * 클릭·미니맵 이동 시 남은 경로 거리가 멀면 보행 속도를 최대 1.45배까지 부드럽게 높이고,
 * 도착 지점 320px 안에서 원래 속도로 감속한다(SoWork far_distance_speed_multiplier 대응).
 */
export function office2dPathSpeedMultiplier(remainingDistancePx: number, sprint: boolean): number {
  if (sprint || !Number.isFinite(remainingDistancePx) || remainingDistancePx <= FAR_DISTANCE_START_PX) return 1;
  const t = Math.min(1, (remainingDistancePx - FAR_DISTANCE_START_PX) / (FAR_DISTANCE_FULL_PX - FAR_DISTANCE_START_PX));
  return 1 + t * (FAR_DISTANCE_MAX_MULTIPLIER - 1);
}

/** 공간 테마(spaceTheme)에 맞는 캔버스 바깥 여백 색을 돌려준다(화면 전체 오버레이는 만들지 않는다). */
export function office2dOutsideColor(spaceTheme?: StudioSpaceThemeKey | null): string {
  if (!spaceTheme || !isStudioSpaceThemeKey(spaceTheme)) return DEFAULT_OUTSIDE_COLOR;
  return studioSpaceTheme(spaceTheme).backgroundGradient[0] ?? DEFAULT_OUTSIDE_COLOR;
}

/** 0(밤)~1(낮). 주야 사이클이 켜져 있으면 가상 시계를, 아니면 기기 시계를 쓴다. 밤에도 실내 조명 덕에 0.3 이상을 유지한다. */
export function office2dDaylight(cycle: StudioDayNightCycleConfig, nowMs: number): number {
  let hour: number;
  if (cycle.enabled) {
    const period = cycle.cycleMs && cycle.cycleMs > 0 ? cycle.cycleMs : 86_400_000;
    hour = ((((cycle.now - cycle.startMs) % period) + period) % period) / period * 24;
  } else {
    const date = new Date(nowMs);
    hour = date.getHours() + date.getMinutes() / 60;
  }
  const ramp = (value: number) => Math.max(0, Math.min(1, value));
  const day = hour < 12 ? ramp((hour - 5.5) / 2.5) : ramp((19.5 - hour) / 2.5);
  return 0.3 + day * 0.7;
}

/** 근처 동적 물리 소품(짐볼·의자·카트·휴지통 등)에 방향 충격량과 오프센터 스핀 토크를 가한다. */
export function kickOffice2dNearbyProp(
  self: Office2dActor,
  physics: Office2dPhysicsWorld,
  scene: Office2dScene,
  particles: Office2dParticles,
  reducedMotion: boolean,
): boolean {
  let closestId: string | null = null;
  let closestDist = 64;
  for (const prop of scene.physicsProps) {
    const body = physics.getBody(`prop:${prop.id}`);
    if (!body) continue;
    const dist = Math.hypot(body.x - self.x, body.y - self.y);
    if (dist < closestDist) {
      closestDist = dist;
      closestId = body.id;
    }
  }
  if (!closestId) return false;
  const body = physics.getBody(closestId);
  if (!body) return false;
  const dx = body.x - self.x;
  const dy = body.y - self.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const nx = dx / dist;
  const ny = dy / dist;
  const baseMass = body.invMass > 0 ? 1 / body.invMass : 10;
  const impulseMag = Math.min(2800, Math.max(420, baseMass * 240));
  physics.applyImpulse(closestId, nx * impulseMag, ny * impulseMag, { rx: -ny * 8, ry: nx * 8 }, baseMass * 12);
  self.squash = -0.055;
  if (!reducedMotion) particles.emit("spark", body.x - nx * 8, body.y - ny * 8, 6, 1.1);
  return true;
}

const DECOR_TO_SPRITE: Readonly<Partial<Record<StudioVirtualDecorType, Office2dSpriteKey>>> = Object.freeze({
  tree: "plant-olive",
  "flower-bed": "plant-monstera",
  lamp: "floor-lamp",
  rug: "rug-round",
  "drawing-desk": "desk-artist",
  bookshelf: "bookshelf",
  "review-board": "kanban-board",
  sofa: "sofa",
});

const FIXTURE_TO_SPRITE: Readonly<Record<string, Office2dSpriteKey>> = Object.freeze({
  "light-switch": "floor-lamp",
  whiteboard: "kanban-board",
  youtube: "review-screen",
});

function decorSprite(type: StudioVirtualDecorType): Office2dSpriteKey {
  return DECOR_TO_SPRITE[type] ?? "plant-monstera";
}

function fixtureSprite(kind: StudioBuildPlacedFixture["kind"]): Office2dSpriteKey {
  return FIXTURE_TO_SPRITE[kind] ?? "floor-lamp";
}

/** 장면 manifest 밖의 꾸미기·고정물도 실제 렌더링과 같은 매핑으로 이미지를 준비한다. */
export function office2dPlacedDecorSpriteKeys(
  decorations: StudioVirtualDecorationState | undefined,
  placedFixtures: readonly StudioBuildPlacedFixture[] | undefined,
): readonly Office2dSpriteKey[] {
  return [...new Set([
    ...(decorations?.placements.map((item) => decorSprite(item.type)) ?? []),
    ...(placedFixtures?.map((fixture) => fixtureSprite(fixture.kind)) ?? []),
  ])];
}

export class Office2dStageExtensions {
  private readonly objectStates = new Map<string, { readonly stateKey: string; readonly changedAt: number }>();
  private readonly bursts: Office2dComicBurst[] = [];
  private burstSeq = 0;
  public schematicMode = false;
  public claimedSeatId: string = readOffice2dClaimedSeatId();
  private lastTriggeredTileEffectId: string | null = null;
  private lastWaveSignature = "";
  private activeTour: {
    readonly requestId: string;
    readonly guideId: string;
    readonly stops: readonly StudioNpcGuideStop[];
    stopIndex: number;
    pauseUntil: number;
  } | null = null;

  get activeObjectStates(): ReadonlyMap<string, { readonly stateKey: string; readonly changedAt: number }> {
    return this.objectStates;
  }

  get comicBursts(): readonly Office2dComicBurst[] {
    return this.bursts;
  }

  pushComicBurst(text: string, color: string, x: number, y: number, nowMs = Date.now(), durationMs = 2400): void {
    this.burstSeq += 1;
    this.bursts.push({ id: this.burstSeq, text, color, x, y, createdAt: nowMs, durationMs });
    if (this.bursts.length > 16) {
      this.bursts.splice(0, this.bursts.length - 16);
    }
  }

  /** 상호작용 가구·소품 발동 시 로컬 상태 배지와 파티클을 일으키고 필요하면 프레즌스 상태 전이를 알린다. */
  interactWithObject(
    objectId: string,
    sprite: Office2dSpriteKey | null,
    x: number,
    y: number,
    nowMs: number,
    particles: Office2dParticles,
    onObjectStateChange?: (change: StudioInteractionFxObjectStateChange) => void,
  ): void {
    const prev = this.objectStates.get(objectId)?.stateKey;
    let nextState: StudioInteractableStateKey | "print:active" | null = null;

    if (sprite === "coffee-machine") {
      nextState = prev === "coffee:brewing" ? "coffee:ready" : "coffee:brewing";
      particles.emit("steam", x, y - 56, 6, 1.3);
      particles.emitComboBurst("interaction", x, y - 36, 0.9);
      this.pushComicBurst("보글보글 ☕ 에스프레소!", "#f59e0b", x, y - 58, nowMs);
    } else if (sprite === "floor-lamp") {
      nextState = prev === "light:off" ? "light:on" : "light:off";
      particles.emit("starburst", x, y - 64, 6, 1);
      particles.emit("spark", x, y - 64, 6, 0.9);
      this.pushComicBurst("찰칵 💡 스탠드 조명!", "#fbbf24", x, y - 64, nowMs);
    } else if (sprite === "kanban-board" || sprite === "storyboard-wall" || sprite === "review-screen") {
      nextState = "media:open";
      particles.emit("note", x, y - 58, 5, 1);
      particles.emitComboBurst("interaction", x, y - 40, 0.95);
      this.pushComicBurst(sprite === "review-screen" ? "승인 PASS ✅ 합평 스크린" : "번뜩—!! 📌 콘티·칸반 동기화", "#38bdf8", x, y - 62, nowMs);
    } else if (sprite === "printer-station" || sprite === "vending-machine") {
      nextState = "print:active";
      particles.emit("confetti", x, y - 48, 10, 0.85);
      particles.emit("starburst", x, y - 48, 5, 0.9);
      this.pushComicBurst("위이잉 🖨 교정지 출력 완료!", "#34d399", x, y - 56, nowMs);
    } else {
      particles.emitComboBurst("interaction", x, y - 32, 1);
      this.pushComicBurst("스슥— ✒️ 워크스테이션 가동!", "#a855f7", x, y - 52, nowMs);
    }

    if (nextState) {
      this.objectStates.set(objectId, { stateKey: nextState, changedAt: nowMs });
      if (nextState !== "print:active") {
        onObjectStateChange?.({ objectId, stateKey: nextState, stateChangedAt: nowMs });
      }
    }
  }

  /** 저작 타일 이펙트 진입 판정. 같은 타일에 머무는 동안에는 중복 호출하지 않는다. */
  stepTileEffects(
    selfPoint: StudioVirtualSpacePoint,
    tileEffects: readonly StudioTileEffectDefinition[] | undefined,
    particles: Office2dParticles,
    onTileEffectTrigger?: (trigger: StudioTileEffectTrigger) => void,
  ): void {
    if (!tileEffects || tileEffects.length === 0) {
      this.lastTriggeredTileEffectId = null;
      return;
    }
    const trigger = resolveTileEffectTrigger(tileEffects, selfPoint, STUDIO_TILE_EFFECT_TILE_SIZE);
    const nextId = trigger?.effect.id ?? null;
    if (nextId !== this.lastTriggeredTileEffectId) {
      this.lastTriggeredTileEffectId = nextId;
      if (trigger) {
        particles.emit("ring", selfPoint.x, selfPoint.y, 1, 1.4);
        onTileEffectTrigger?.(trigger);
      }
    }
  }

  /** waveActorIds가 바뀌면 해당 배우(나 또는 동료)가 손 흔들기 이모트·제스처를 재생한다. */
  syncWaveActors(
    waveActorIds: readonly string[] | undefined,
    self: Office2dActor,
    peers: ReadonlyMap<string, Office2dActor>,
    nowMs: number,
    showEmote: (actor: Office2dActor, kind: string, nowMs: number) => void,
  ): void {
    const signature = waveActorIds && waveActorIds.length > 0 ? waveActorIds.join(",") : "";
    if (signature === this.lastWaveSignature) return;
    this.lastWaveSignature = signature;
    if (!waveActorIds) return;
    for (const id of waveActorIds) {
      if (id === self.id || id === "local" || id === "self") {
        showEmote(self, "wave", nowMs);
        continue;
      }
      const peer = peers.get(id);
      if (peer) showEmote(peer, "wave", nowMs);
    }
  }

  /** NPC 가이드 투어 요청 처리: 콘티 → 작화 → 검수 → 자료실 순으로 안내한다. */
  stepGuideTour(
    selfPoint: StudioVirtualSpacePoint,
    manifest: StudioVirtualSpaceWorldManifest,
    request: StudioVirtualNpcGuideTourRequest | null | undefined,
    onGuideTourChange: ((state: StudioVirtualNpcGuideTourState) => void) | undefined,
    manualMoving: boolean,
    nowMs: number,
    approach: (point: StudioVirtualSpacePoint) => void,
  ): void {
    if (!request) {
      this.activeTour = null;
      return;
    }
    if (!this.activeTour || this.activeTour.requestId !== request.id) {
      const stops = studioNpcGuideStops(manifest, selfPoint);
      if (stops.length === 0) {
        onGuideTourChange?.({ requestId: request.id, guideId: request.guideId, status: "complete", stopIndex: 0, stopCount: 0 });
        return;
      }
      this.activeTour = { requestId: request.id, guideId: request.guideId, stops, stopIndex: 0, pauseUntil: 0 };
      const first = stops[0];
      if (first) {
        approach(first.point);
        onGuideTourChange?.({
          requestId: request.id,
          guideId: request.guideId,
          status: "walking",
          stopIndex: 0,
          stopCount: stops.length,
          stopAction: first.action,
        });
      }
      return;
    }

    const tour = this.activeTour;
    if (manualMoving) {
      this.activeTour = null;
      onGuideTourChange?.({
        requestId: tour.requestId,
        guideId: tour.guideId,
        status: "cancelled",
        stopIndex: tour.stopIndex,
        stopCount: tour.stops.length,
      });
      return;
    }

    const stop = tour.stops[tour.stopIndex];
    if (!stop) return;
    const dist = Math.hypot(stop.point.x - selfPoint.x, stop.point.y - selfPoint.y);
    if (tour.pauseUntil === 0 && dist <= 42) {
      tour.pauseUntil = nowMs + 1800;
      onGuideTourChange?.({
        requestId: tour.requestId,
        guideId: tour.guideId,
        status: "at-stop",
        stopIndex: tour.stopIndex,
        stopCount: tour.stops.length,
        stopAction: stop.action,
      });
    } else if (tour.pauseUntil > 0 && nowMs >= tour.pauseUntil) {
      tour.stopIndex += 1;
      tour.pauseUntil = 0;
      const next = tour.stops[tour.stopIndex];
      if (!next) {
        this.activeTour = null;
        onGuideTourChange?.({
          requestId: tour.requestId,
          guideId: tour.guideId,
          status: "complete",
          stopIndex: tour.stops.length - 1,
          stopCount: tour.stops.length,
        });
      } else {
        approach(next.point);
        onGuideTourChange?.({
          requestId: tour.requestId,
          guideId: tour.guideId,
          status: "walking",
          stopIndex: tour.stopIndex,
          stopCount: tour.stops.length,
          stopAction: next.action,
        });
      }
    }
  }

  /** 저작된 타일 이펙트를 바닥 위에 시각적으로 표시한다. */
  drawFloorTileEffects(
    ctx: Office2dCanvas2D,
    tileEffects: readonly StudioTileEffectDefinition[] | undefined,
    visible: Office2dVisibleRect,
    time: number,
    reducedMotion: boolean,
  ): void {
    if (!tileEffects || tileEffects.length === 0) return;
    const tileW = STUDIO_TILE_EFFECT_TILE_SIZE.width;
    const tileH = STUDIO_TILE_EFFECT_TILE_SIZE.height;
    ctx.save();
    for (const effect of tileEffects) {
      const x = effect.tileX * tileW;
      const y = effect.tileY * tileH;
      const w = Math.max(tileW, effect.width * tileW);
      const h = Math.max(tileH, effect.height * tileH);
      if (x + w < visible.minX || x > visible.maxX || y + h < visible.minY || y > visible.maxY) continue;
      const pulse = reducedMotion ? 0.65 : 0.55 + Math.sin(time * 3.2 + x * 0.02) * 0.25;
      const color = tileEffectColor(effect.kind);
      office2dRoundRect(ctx, x, y, w, h, 6);
      ctx.fillStyle = color.fill;
      ctx.fill();
      ctx.strokeStyle = color.stroke;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** 빌드 모드 고정물(placedFixtures)과 사용자 꾸미기(decorations)를 2D 월드에 그린다. */
  drawPlacedFixturesAndDecor(
    ctx: Office2dCanvas2D,
    placedFixtures: readonly StudioBuildPlacedFixture[] | undefined,
    decorations: StudioVirtualDecorationState | undefined,
    visible: Office2dVisibleRect,
    language: "ko" | "en",
    drawSprite: (sprite: Office2dSpriteKey, x: number, y: number, width: number, tone: string) => number,
  ): void {
    if (decorations?.placements) {
      for (const item of decorations.placements) {
        if (item.x < visible.minX - 80 || item.x > visible.maxX + 80 || item.y < visible.minY - 80 || item.y > visible.maxY + 80) continue;
        const sprite = decorSprite(item.type);
        const width = Math.round(52 * Math.max(0.7, Math.min(1.5, item.scale || 1)));
        drawSprite(sprite, item.x, item.y, width, OFFICE2D_SPRITE_SPECS[sprite].tone);
      }
    }
    if (placedFixtures) {
      for (const fixture of placedFixtures) {
        const { x, y } = fixture.point;
        if (x < visible.minX - 80 || x > visible.maxX + 80 || y < visible.minY - 80 || y > visible.maxY + 80) continue;
        const sprite = fixtureSprite(fixture.kind);
        const width = sprite === "floor-lamp" ? 40 : 120;
        const spriteHeight = drawSprite(sprite, x, y, width, OFFICE2D_SPRITE_SPECS[sprite].tone);
        const label = language === "en" ? fixture.labelEn : fixture.labelKo;
        ctx.save();
        ctx.font = `700 9.5px ${OFFICE2D_OVERLAY_FONT}`;
        const pillW = ctx.measureText(label).width + 12;
        office2dRoundRect(ctx, x - pillW / 2, y - spriteHeight - 18, pillW, 15, 7.5);
        ctx.fillStyle = "rgba(38, 30, 24, 0.84)";
        ctx.fill();
        ctx.fillStyle = "#f8ecd6";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x, y - spriteHeight - 10.5);
        ctx.restore();
      }
    }
  }
}

function tileEffectColor(kind: StudioTileEffectDefinition["kind"]): { readonly fill: string; readonly stroke: string } {
  switch (kind) {
    case "portal": return { fill: "rgba(92, 195, 201, 0.18)", stroke: "#5cc3c9" };
    case "spotlight": return { fill: "rgba(242, 184, 75, 0.2)", stroke: "#f2b84b" };
    case "zone": return { fill: "rgba(110, 231, 183, 0.16)", stroke: "#6ee7b7" };
    case "bgm": return { fill: "rgba(167, 139, 250, 0.16)", stroke: "#a78bfa" };
    default: return { fill: "rgba(240, 138, 126, 0.16)", stroke: "#f08a7e" };
  }
}

export const OFFICE2D_CLAIMED_SEAT_STORAGE_KEY = "toonstudio:office2d:my-seat-v1";
export const OFFICE2D_DEFAULT_CLAIMED_SEAT_ID = "hq-ink-desk-a-1-seat";
export const OFFICE2D_SOUND_MUTED_STORAGE_KEY = "toonstudio:office2d:sound-muted-v1";

/** SoWork SetMyWorkSpotModal(ev_be107c29) + WA personalArea 기반 내 지정석 ID 조회. */
export function readOffice2dClaimedSeatId(): string {
  try {
    const raw = globalThis.localStorage?.getItem(OFFICE2D_CLAIMED_SEAT_STORAGE_KEY)?.trim();
    return raw && raw.length > 0 ? raw : OFFICE2D_DEFAULT_CLAIMED_SEAT_ID;
  } catch {
    return OFFICE2D_DEFAULT_CLAIMED_SEAT_ID;
  }
}

/** 내 지정석 ID를 로컬 스토리지에 영속화한다. */
export function writeOffice2dClaimedSeatId(seatId: string): string {
  const next = seatId.trim() || OFFICE2D_DEFAULT_CLAIMED_SEAT_ID;
  try {
    globalThis.localStorage?.setItem(OFFICE2D_CLAIMED_SEAT_STORAGE_KEY, next);
  } catch {
    // 스토리지 접근 불가 환경 무시
  }
  return next;
}

export function readOffice2dSoundMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(OFFICE2D_SOUND_MUTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeOffice2dSoundMuted(muted: boolean): boolean {
  try {
    globalThis.localStorage?.setItem(OFFICE2D_SOUND_MUTED_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // 스토리지 접근 불가 환경 무시
  }
  return muted;
}

export interface Office2dQuickEmoteSpec {
  readonly digit: "1" | "2" | "3" | "4" | "5" | "6";
  readonly glyph: string;
  readonly sfxKo: string;
  readonly sfxEn: string;
  readonly color: string;
}

/** WorkAdventure EmoteStore(ev_c8d86099) 1~6 숫자키 즉시 이모트 + 웹툰 코믹 의성어 매핑. */
export const OFFICE2D_QUICK_EMOTES: readonly Office2dQuickEmoteSpec[] = Object.freeze([
  { digit: "1", glyph: "👋", sfxKo: "반가워요—!! 👋", sfxEn: "HELLO—!! 👋", color: "#38bdf8" },
  { digit: "2", glyph: "🔥", sfxKo: "마감 버닝—!! 🔥", sfxEn: "BURNING—!! 🔥", color: "#f97316" },
  { digit: "3", glyph: "👍", sfxKo: "컷 승인 PASS 👍", sfxEn: "APPROVED 👍", color: "#34d399" },
  { digit: "4", glyph: "💡", sfxKo: "번뜩— 유레카 💡", sfxEn: "EUREKA—!! 💡", color: "#fbbf24" },
  { digit: "5", glyph: "🎉", sfxKo: "탈고 만세—!! 🎉", sfxEn: "SHIPPED—!! 🎉", color: "#ec4899" },
  { digit: "6", glyph: "☕", sfxKo: "카페인 충전 ☕", sfxEn: "ESPRESSO ☕", color: "#c084fc" },
]);

export function findOffice2dQuickEmote(codeOrKey: string): Office2dQuickEmoteSpec | null {
  const digit = codeOrKey.startsWith("Digit") ? codeOrKey.slice(5) : codeOrKey;
  return OFFICE2D_QUICK_EMOTES.find((item) => item.digit === digit) ?? null;
}

const ROOM_CHORD_HZ: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  "hq-story-room": [523.25, 659.25],
  "hq-ink-bay": [587.33, 880],
  "hq-color-lab": [659.25, 987.77],
  "hq-bg3d-lab": [440, 659.25],
  "hq-reference-library": [392, 523.25],
  "hq-focus-booths": [329.63, 493.88],
  "hq-lettering-desk": [698.46, 1046.5],
  "hq-review-room": [523.25, 783.99],
  "hq-war-room": [493.88, 739.99],
  "hq-lobby": [587.33, 783.99],
  "hq-lounge": [440, 554.37],
  "hq-meeting-room": [493.88, 659.25],
  "hq-publish-desk": [659.25, 1318.5],
});

/**
 * Gather LeakyDesks + Kumospace 공간 음향 + WA decreaseAudioPlayerVolumeWhileTalking(ev_c8d86099) +
 * SoWork AudioPool(ev_be107c29)을 결합한 절차적 WebAudio 마이크로 사운드스케이프.
 */
export function playOffice2dSpatialCue(
  kind: "room-enter" | "seat-sit" | "desk-claim" | "emote" | "schematic" | "knock",
  options?: { readonly roomId?: string | null; readonly muted?: boolean; readonly talking?: boolean },
): boolean {
  if (options?.muted || typeof window === "undefined") return false;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return false;
  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const duck = options?.talking || studioHuddleAudioFocusSnapshot() ? 0.25 : 1;
    const roomPair = (options?.roomId ? ROOM_CHORD_HZ[options.roomId] : undefined) ?? [523.25, 783.99];
    const [f0, f1] =
      kind === "desk-claim"
        ? [587.33, 1174.66]
        : kind === "seat-sit"
          ? [440, 659.25]
          : kind === "schematic"
            ? [659.25, 493.88]
            : kind === "knock"
              ? [220, 330]
              : roomPair;
    const dur = kind === "desk-claim" ? 0.22 : kind === "room-enter" ? 0.18 : 0.12;
    osc.type = kind === "knock" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f1, now + dur * 0.85);
    gain.gain.setValueAtTime(0.065 * duck, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
    globalThis.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 360);
    return true;
  } catch {
    return false;
  }
}
