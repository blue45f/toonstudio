import {
  resolveStudioHdActivityAura,
  resolveStudioHdGroundContactSpec,
  type StudioHdSpriteTier,
} from "./studio-virtual-space-hd-sprite-pipeline";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioWorldPropDepth, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/**
 * 배우 접지 코어 AO(Ambient Occlusion) 및 공감각 활동 오라(Activity Aura) 렌더러 +
 * DEV 진단 dataset 동기화 헬퍼.
 *
 * - 단일 Phaser Graphics 레이어(depth 989, 그림자 바로 아래)를 매 프레임 초기화해
 *   가비지 컬렉션 할당 없이 접지 코어 그림자와 상태 오라 링을 그린다.
 * - `StudioVirtualSpacePhaserCanvas.tsx`의 비대화를 막기 위해 DEV dataset 진단 기록도 함께 전담한다.
 */
export type StudioMicroExpressionKind =
  | "joy-sparkle"
  | "focus-glint"
  | "surprise-pop"
  | "sleep-bubble"
  | "calm-glow";

export interface StudioMicroExpressionSpec {
  readonly visible: boolean;
  readonly kind: StudioMicroExpressionKind;
  readonly cheekColorHex: number;
  readonly cheekAlpha: number;
  readonly accentColorHex: number;
  readonly accentAlpha: number;
  readonly pulseScale: number;
}

const JOY_REACTIONS = new Set([
  "wave",
  "celebrate",
  "cheer",
  "cheers",
  "clap",
  "thumbs-up",
  "heart",
  "love",
  "laugh",
  "smile",
  "coffee",
  "party",
  "calisthenics",
  "kpop-dance",
  "shuffle",
  "moonwalk",
  "dance",
]);

const SURPRISE_REACTIONS = new Set([
  "idea",
  "question",
  "surprised",
  "alert",
  "fire",
  "wow",
]);

/** 캐릭터의 감정·활동·상태에 따른 작은 얼굴 마이크로 표정(볼 홍조·눈가 반짝임·만화풍 감정 기호) 스펙을 계산한다. */
export function resolveStudioMicroExpressionSpec(input: {
  readonly reaction?: string | null;
  readonly activity?: string;
  readonly userStatus?: string | null;
  readonly moving: boolean;
  readonly seated: boolean;
  readonly ghost: boolean;
  readonly reducedMotion: boolean;
  readonly timeMs: number;
}): StudioMicroExpressionSpec {
  if (input.ghost) {
    return {
      visible: false,
      kind: "calm-glow",
      cheekColorHex: 0xff8fab,
      cheekAlpha: 0,
      accentColorHex: 0xffffff,
      accentAlpha: 0,
      pulseScale: 1,
    };
  }

  const reactionKey = (input.reaction ?? "").trim().toLowerCase();
  const pulse = input.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(input.timeMs * 0.0065);
  const pulseScale = Number((0.92 + pulse * 0.18).toFixed(3));

  if (JOY_REACTIONS.has(reactionKey)) {
    return {
      visible: true,
      kind: "joy-sparkle",
      cheekColorHex: 0xff7eb6,
      cheekAlpha: Number((0.42 + pulse * 0.14).toFixed(3)),
      accentColorHex: 0xffe066,
      accentAlpha: Number((0.72 + pulse * 0.22).toFixed(3)),
      pulseScale,
    };
  }

  if (SURPRISE_REACTIONS.has(reactionKey)) {
    return {
      visible: true,
      kind: "surprise-pop",
      cheekColorHex: 0xff9f7a,
      cheekAlpha: Number((0.3 + pulse * 0.1).toFixed(3)),
      accentColorHex: 0xfbbf24,
      accentAlpha: Number((0.78 + pulse * 0.18).toFixed(3)),
      pulseScale,
    };
  }

  if (input.activity === "away" || input.userStatus === "break" || input.userStatus === "on-break" || input.userStatus === "away") {
    return {
      visible: true,
      kind: "sleep-bubble",
      cheekColorHex: 0xfda4af,
      cheekAlpha: 0.22,
      accentColorHex: 0x93c5fd,
      accentAlpha: Number((0.48 + pulse * 0.22).toFixed(3)),
      pulseScale,
    };
  }

  if (
    input.activity === "focused" ||
    input.userStatus === "focusing" ||
    input.userStatus === "focused" ||
    input.userStatus === "presenting" ||
    input.activity === "reviewing"
  ) {
    return {
      visible: true,
      kind: "focus-glint",
      cheekColorHex: 0xff8fab,
      cheekAlpha: 0.2,
      accentColorHex: 0x38bdf8,
      accentAlpha: Number((0.58 + pulse * 0.24).toFixed(3)),
      pulseScale,
    };
  }

  return {
    visible: true,
    kind: "calm-glow",
    cheekColorHex: 0xff8fab,
    cheekAlpha: input.moving ? 0.24 : 0.18,
    accentColorHex: 0xfff3c4,
    accentAlpha: Number((0.32 + pulse * 0.12).toFixed(3)),
    pulseScale,
  };
}

/**
 * 배우 접지 코어 AO(Ambient Occlusion), 공감각 활동 오라(Activity Aura),
 * 그리고 작은 얼굴 마이크로 표정(볼 홍조·눈가 하이라이트·감정 기호) 렌더러 +
 * DEV 진단 dataset 동기화 헬퍼.
 */
export class StudioActorAuraRuntime {
  private readonly graphics: import("phaser").GameObjects.Graphics;
  private readonly faceGraphics: import("phaser").GameObjects.Graphics;

  constructor(scene: import("phaser").Scene) {
    this.graphics = scene.add.graphics().setDepth(989);
    this.faceGraphics = scene.add.graphics().setDepth(1_014);
  }

  beginFrame(): void {
    this.graphics.clear();
    this.faceGraphics.clear();
  }

  drawActorGroundAndAura(input: {
    readonly x: number;
    readonly y: number;
    readonly distance: number;
    readonly stride: number;
    readonly moving: boolean;
    readonly seated: boolean;
    readonly ghost: boolean;
    readonly reducedMotion: boolean;
    readonly activity?: string;
    readonly userStatus?: string | null;
    readonly reaction?: string | null;
    readonly accessoryKey?: string | null;
    readonly sprite?: import("phaser").GameObjects.Sprite;
    readonly timeMs: number;
    readonly fadeAlpha?: number;
    readonly tier?: StudioHdSpriteTier;
  }): void {
    const fade = Number.isFinite(input.fadeAlpha ?? 1) ? Math.max(0, Math.min(1, input.fadeAlpha ?? 1)) : 1;
    if (fade <= 0.02) return;

    const contact = resolveStudioHdGroundContactSpec({
      distance: input.distance,
      stride: input.stride,
      moving: input.moving,
      seated: input.seated,
      ghost: input.ghost,
      reducedMotion: input.reducedMotion,
      tier: input.tier,
    });
    if (contact.visible && contact.coreAlpha > 0) {
      this.graphics.fillStyle(0x070a12, contact.coreAlpha * fade);
      this.graphics.fillEllipse(input.x, input.y + 1.5, contact.coreWidth, contact.coreHeight);
    }

    const aura = resolveStudioHdActivityAura({
      activity: input.activity,
      userStatus: input.userStatus,
      timeMs: input.timeMs,
      reducedMotion: input.reducedMotion,
      seated: input.seated,
    });
    if (aura.visible && !input.ghost) {
      this.graphics.fillStyle(aura.colorHex, aura.glowAlpha * fade);
      this.graphics.fillEllipse(input.x, input.y + 1, aura.outerRadiusX * 2, aura.outerRadiusY * 2);
      this.graphics.lineStyle(1.6, aura.colorHex, aura.ringAlpha * fade);
      this.graphics.strokeEllipse(input.x, input.y + 1, aura.innerRadiusX * 2, aura.innerRadiusY * 2);
    }

    const activeReaction = (input.reaction ?? (input.sprite?.getData("actorReaction") as string | null | undefined) ?? "").trim().toLowerCase();
    // 웰니스(체조·요가·목풀기·타이치) 및 댄스(아이돌 군무·셔플·문워크·춤·건배) 바닥 리듬 서클 연출
    if (
      !input.ghost && (
        activeReaction === "calisthenics" ||
        activeReaction === "yoga" ||
        activeReaction === "neck-stretch" ||
        activeReaction === "tai-chi" ||
        activeReaction === "cheers" ||
        activeReaction === "kpop-dance" ||
        activeReaction === "shuffle" ||
        activeReaction === "moonwalk" ||
        activeReaction === "dance"
      )
    ) {
      const isCalmWellness = activeReaction === "yoga" || activeReaction === "neck-stretch" || activeReaction === "tai-chi";
      const wave = input.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(input.timeMs * (isCalmWellness ? 0.004 : 0.014));
      const primaryHex =
        activeReaction === "calisthenics" || activeReaction === "cheers" ? 0xfbbf24
          : isCalmWellness ? 0x34d399
            : activeReaction === "kpop-dance" ? 0xf472b6
              : activeReaction === "moonwalk" ? 0xa78bfa
                : 0x38bdf8;
      const secondaryHex =
        activeReaction === "calisthenics" ? 0x34d399
          : isCalmWellness ? 0xa78bfa
            : 0xfde047;
      const rx = 24 + wave * 6;
      const ry = 9.5 + wave * 2.2;
      this.graphics.fillStyle(primaryHex, 0.16 * fade);
      this.graphics.fillEllipse(input.x, input.y + 1.5, rx * 2, ry * 2);
      this.graphics.lineStyle(1.8, primaryHex, 0.55 * fade);
      this.graphics.strokeEllipse(input.x, input.y + 1.5, rx * 1.75, ry * 1.75);
      this.graphics.lineStyle(1.2, secondaryHex, 0.45 * fade);
      this.graphics.strokeEllipse(input.x, input.y + 1.5, rx * 1.25, ry * 1.25);
    }

    const expression = resolveStudioMicroExpressionSpec({
      reaction: activeReaction,
      activity: input.activity,
      userStatus: input.userStatus,
      moving: input.moving,
      seated: input.seated,
      ghost: input.ghost,
      reducedMotion: input.reducedMotion,
      timeMs: input.timeMs,
    });
    const spriteX = input.sprite ? input.sprite.x : input.x;
    const spriteY = input.sprite ? input.sprite.y : input.y;
    const displayH = input.sprite && input.sprite.displayHeight > 16 ? input.sprite.displayHeight : 56;
    const faceCenterY = spriteY - displayH * 0.62;
    const headTopY = spriteY - displayH * 0.88;
    const cheekSpanX = Math.max(4.5, Math.min(7.5, displayH * 0.11));

    if (expression.visible) {
      // 1) 작은 얼굴 양볼 소프트 블러셔(생기 있는 로즈 홍조)
      if (expression.cheekAlpha > 0.02) {
        this.faceGraphics.fillStyle(expression.cheekColorHex, expression.cheekAlpha * fade);
        this.faceGraphics.fillEllipse(spriteX - cheekSpanX, faceCenterY + 2, 4.2 * expression.pulseScale, 2.5);
        this.faceGraphics.fillEllipse(spriteX + cheekSpanX, faceCenterY + 2, 4.2 * expression.pulseScale, 2.5);
      }

      // 2) 감정·상태별 눈가/머리 주변 마이크로 표정 악센트
      if (expression.kind === "joy-sparkle") {
        const sparkX = spriteX + cheekSpanX + 4;
        const sparkY = faceCenterY - 6;
        const r = 2.8 * expression.pulseScale;
        this.faceGraphics.lineStyle(1.4, expression.accentColorHex, expression.accentAlpha * fade);
        this.faceGraphics.lineBetween(sparkX - r, sparkY, sparkX + r, sparkY);
        this.faceGraphics.lineBetween(sparkX, sparkY - r, sparkX, sparkY + r);
      } else if (expression.kind === "focus-glint") {
        const glintX = spriteX + cheekSpanX + 3.5;
        const glintY = faceCenterY - 4.5;
        this.faceGraphics.fillStyle(expression.accentColorHex, expression.accentAlpha * fade);
        this.faceGraphics.fillCircle(glintX, glintY, 1.8 * expression.pulseScale);
        this.faceGraphics.lineStyle(1.1, expression.accentColorHex, expression.accentAlpha * 0.85 * fade);
        this.faceGraphics.lineBetween(glintX - 3.2, glintY, glintX + 3.2, glintY);
      } else if (expression.kind === "surprise-pop") {
        const popX = spriteX + cheekSpanX + 4;
        const popY = faceCenterY - 8;
        this.faceGraphics.lineStyle(1.5, expression.accentColorHex, expression.accentAlpha * fade);
        this.faceGraphics.lineBetween(popX, popY, popX + 3, popY - 4);
        this.faceGraphics.lineBetween(popX + 2.5, popY + 1.5, popX + 6, popY - 1);
      } else if (expression.kind === "sleep-bubble") {
        const bubbleX = spriteX + cheekSpanX + 3.5;
        const bubbleY = faceCenterY - 3;
        this.faceGraphics.lineStyle(1.1, expression.accentColorHex, expression.accentAlpha * fade);
        this.faceGraphics.strokeCircle(bubbleX, bubbleY, 2.4 * expression.pulseScale);
      }
    }

    // 3) 프로시저럴 크리에이티브·오피스 액세서리(왕관·고양이 귀·헤일로·화관·VR 바이저·펜촉 날개·새싹·커피잔·불꽃·음파·천사 날개)
    const accessoryKey = (input.accessoryKey ?? (input.sprite?.getData("actorAccessoryKey") as string | null | undefined) ?? "none").trim();
    if (!input.ghost && accessoryKey !== "none") {
      const bob = input.reducedMotion ? 0 : Math.sin(input.timeMs * 0.005) * 1.2;
      if (accessoryKey === "crown") {
        const cy = headTopY - 2 + bob * 0.4;
        this.faceGraphics.fillStyle(0xfacc15, 0.95 * fade);
        this.faceGraphics.fillRect(spriteX - 7, cy - 3, 14, 4.5);
        this.faceGraphics.fillCircle(spriteX - 6, cy - 4.5, 1.8);
        this.faceGraphics.fillCircle(spriteX, cy - 6, 2.2);
        this.faceGraphics.fillCircle(spriteX + 6, cy - 4.5, 1.8);
        this.faceGraphics.fillStyle(0xf43f5e, 0.95 * fade);
        this.faceGraphics.fillCircle(spriteX, cy - 1, 1.5);
      } else if (accessoryKey === "cat-ears") {
        const cy = headTopY + 1;
        this.faceGraphics.fillStyle(0x312e81, 0.92 * fade);
        this.faceGraphics.fillCircle(spriteX - 7.5, cy - 2, 3.6);
        this.faceGraphics.fillCircle(spriteX + 7.5, cy - 2, 3.6);
        this.faceGraphics.fillStyle(0xf472b6, 0.92 * fade);
        this.faceGraphics.fillCircle(spriteX - 7.5, cy - 2, 1.9);
        this.faceGraphics.fillCircle(spriteX + 7.5, cy - 2, 1.9);
      } else if (accessoryKey === "halo") {
        const cy = headTopY - 6 + bob;
        this.faceGraphics.lineStyle(2.1, 0xfde047, 0.92 * fade);
        this.faceGraphics.strokeEllipse(spriteX, cy, 18, 5.5);
        this.faceGraphics.lineStyle(1, 0xffffff, 0.75 * fade);
        this.faceGraphics.strokeEllipse(spriteX, cy, 15, 4);
      } else if (accessoryKey === "flower-crown") {
        const cy = headTopY + 2;
        this.faceGraphics.lineStyle(1.6, 0x4ade80, 0.9 * fade);
        this.faceGraphics.lineBetween(spriteX - 8, cy, spriteX + 8, cy);
        this.faceGraphics.fillStyle(0xfb7185, 0.95 * fade);
        this.faceGraphics.fillCircle(spriteX - 5, cy - 0.5, 2.2);
        this.faceGraphics.fillStyle(0xfef08a, 0.95 * fade);
        this.faceGraphics.fillCircle(spriteX, cy - 1, 2.4);
        this.faceGraphics.fillStyle(0xf472b6, 0.95 * fade);
        this.faceGraphics.fillCircle(spriteX + 5, cy - 0.5, 2.2);
      } else if (accessoryKey === "vr-visor") {
        const vy = faceCenterY - 1.5;
        this.faceGraphics.fillStyle(0x0ea5e9, 0.85 * fade);
        this.faceGraphics.fillRect(spriteX - 8, vy - 2.2, 16, 4.4);
        this.faceGraphics.lineStyle(1.2, 0xe0f2fe, 0.92 * fade);
        this.faceGraphics.lineBetween(spriteX - 6, vy - 1, spriteX + 5, vy - 1);
      } else if (accessoryKey === "pen-wing") {
        const px = spriteX + 8;
        const py = headTopY + 2 + bob * 0.5;
        this.faceGraphics.fillStyle(0xf8fafc, 0.92 * fade);
        this.faceGraphics.fillEllipse(px + 2, py - 2, 7, 3.6);
        this.faceGraphics.fillStyle(0xfbbf24, 0.95 * fade);
        this.faceGraphics.fillCircle(px - 1, py, 2.1);
      } else if (accessoryKey === "sprout") {
        const sy = headTopY - 1 + bob * 0.5;
        this.faceGraphics.lineStyle(1.5, 0x22c55e, 0.95 * fade);
        this.faceGraphics.lineBetween(spriteX, sy + 2, spriteX, sy - 5);
        this.faceGraphics.fillStyle(0x4ade80, 0.95 * fade);
        this.faceGraphics.fillEllipse(spriteX - 3.2, sy - 5, 5.2, 2.8);
        this.faceGraphics.fillEllipse(spriteX + 3.2, sy - 4.2, 5.2, 2.8);
      } else if (accessoryKey === "coffee-cup") {
        const cx = spriteX + 9.5;
        const cy = headTopY + 1 + bob * 0.6;
        this.faceGraphics.fillStyle(0xf8fafc, 0.94 * fade);
        this.faceGraphics.fillRect(cx - 3.5, cy - 2.5, 7, 6);
        this.faceGraphics.fillStyle(0x78350f, 0.95 * fade);
        this.faceGraphics.fillRect(cx - 2.5, cy - 2, 5, 1.8);
        this.faceGraphics.lineStyle(1.1, 0xe2e8f0, 0.85 * fade);
        this.faceGraphics.lineBetween(cx - 1.2, cy - 4.2, cx - 1.2, cy - 7);
        this.faceGraphics.lineBetween(cx + 1.2, cy - 3.8, cx + 1.2, cy - 6.4);
      } else if (accessoryKey === "deadline-fire") {
        const fy = headTopY - 3 + bob * 0.5;
        this.faceGraphics.fillStyle(0xf97316, 0.92 * fade);
        this.faceGraphics.fillCircle(spriteX, fy, 4.4);
        this.faceGraphics.fillCircle(spriteX - 4.2, fy + 1.2, 3);
        this.faceGraphics.fillCircle(spriteX + 4.2, fy + 1.2, 3);
        this.faceGraphics.fillStyle(0xfef08a, 0.95 * fade);
        this.faceGraphics.fillCircle(spriteX, fy + 0.6, 2.4);
      } else if (accessoryKey === "music-beam") {
        const my = headTopY + bob * 0.4;
        this.faceGraphics.lineStyle(1.8, 0x38bdf8, 0.92 * fade);
        this.faceGraphics.strokeEllipse(spriteX, my + 2, 18, 8);
        this.faceGraphics.fillStyle(0xc084fc, 0.95 * fade);
        this.faceGraphics.fillCircle(spriteX - 9, my + 3, 2.6);
        this.faceGraphics.fillCircle(spriteX + 9, my + 3, 2.6);
      } else if (accessoryKey === "angel-wings") {
        const wy = faceCenterY + 6 + bob * 0.5;
        this.faceGraphics.fillStyle(0xf8fafc, 0.9 * fade);
        this.faceGraphics.fillEllipse(spriteX - 11.5, wy, 8.5, 4.6);
        this.faceGraphics.fillEllipse(spriteX + 11.5, wy, 8.5, 4.6);
        this.faceGraphics.lineStyle(1.1, 0xbae6fd, 0.85 * fade);
        this.faceGraphics.strokeEllipse(spriteX - 11.5, wy, 8.5, 4.6);
        this.faceGraphics.strokeEllipse(spriteX + 11.5, wy, 8.5, 4.6);
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.faceGraphics.destroy();
  }
}

export interface StudioCanvasDevDiagnosticsInput {
  readonly parent: HTMLElement;
  readonly currentPoint: StudioVirtualSpacePoint;
  readonly rendered: StudioVirtualSpacePoint;
  readonly camera: import("phaser").Cameras.Scene2D.Camera;
  readonly localSprite: import("phaser").GameObjects.Sprite;
  readonly localSeat: boolean;
  readonly pathLength: number;
  readonly textureKeys: readonly string[];
  readonly localDistance: number;
  readonly walkSpeed: number;
  readonly gaitDistancePerCycle: number | undefined;
  readonly pixelRatio: number;
  readonly textResolution: number;
  readonly textureLodDiagnostics: Record<string, string>;
  readonly nextMoving: boolean;
  readonly facing: string;
  readonly terrainKind: string;
  readonly pathAllowed: boolean;
  readonly dayPhase: string;
  readonly weather: string;
  readonly backdrop: string;
  readonly hasLivingWorld: boolean;
  readonly hasObjectPhysics: boolean;
  readonly decorationCount: number;
  readonly environmentInteractionsCount: number;
  readonly interestKey: string;
  readonly activePeerVisualsCount: number;
  readonly visibleNpcCount: number;
  readonly maxParticles: number;
  readonly qualityTier: string;
  readonly controlMode: string;
  readonly moveFeel: string;
  readonly localGaitStride: number;
  readonly cameraPreference: string;
  readonly shownLocalEmote: string | null;
  readonly chatterBubbles: ReadonlyArray<{ readonly npcId: string; readonly text: { readonly ko: string } }>;
  readonly emoteSequence: number;
  readonly time: number;
  readonly emoteDebug: string;
  readonly peers: ReadonlyArray<readonly [string, {
    readonly sprite: import("phaser").GameObjects.Sprite;
    readonly targetX: number;
    readonly targetY: number;
  }]>;
  readonly activePeerEmote: (peerId: string) => string;
  readonly npcs: ReadonlyArray<readonly [string, {
    readonly sprite: import("phaser").GameObjects.Sprite;
    readonly groundPoint: StudioVirtualSpacePoint;
    readonly phase: string;
  }]>;
  readonly manifest: StudioVirtualSpaceWorldManifest;
}

/** DEV 환경에서 Playwright 하네스 검증용 dataset 속성을 동기화한다. */
export function syncStudioCanvasDevDiagnostics(input: StudioCanvasDevDiagnosticsInput): void {
  const { parent } = input;
  parent.dataset.localX = input.currentPoint.x.toFixed(3);
  parent.dataset.localY = input.currentPoint.y.toFixed(3);
  parent.dataset.cameraScroll = `${Math.round(input.camera.scrollX)},${Math.round(input.camera.scrollY)},${input.camera.zoom.toFixed(3)}`;
  parent.dataset.renderX = input.rendered.x.toFixed(3);
  parent.dataset.renderY = input.rendered.y.toFixed(3);
  parent.dataset.visualX = input.localSprite.x.toFixed(3);
  parent.dataset.visualY = input.localSprite.y.toFixed(3);
  parent.dataset.spriteOriginY = input.localSprite.originY.toFixed(6);
  parent.dataset.spriteHeight = input.localSprite.displayHeight.toFixed(3);
  parent.dataset.seated = String(input.localSeat);
  parent.dataset.walkFrame = String(input.localSprite.frame.name);
  parent.dataset.pathLength = String(input.pathLength);
  parent.dataset.loadedWalkSheets = String(input.textureKeys.filter((key) => key.includes("walk-sheet")).length);
  parent.dataset.loadedActionSheets = String(input.textureKeys.filter((key) => /-(talk|draw|review)-sheet-/u.test(key)).length);
  parent.dataset.walkDistance = input.localDistance.toFixed(2);
  parent.dataset.walkSpeed = String(input.walkSpeed);
  parent.dataset.gaitDistancePerCycle = String(input.gaitDistancePerCycle ?? "native");
  parent.dataset.pixelRatio = input.pixelRatio.toFixed(2);
  parent.dataset.textResolution = String(input.textResolution);
  Object.assign(parent.dataset, input.textureLodDiagnostics);
  parent.dataset.localMoving = String(input.nextMoving);
  parent.dataset.localFacing = input.facing;
  parent.dataset.terrain = input.terrainKind;
  parent.dataset.pathAllowed = String(input.pathAllowed);
  parent.dataset.dayPhase = input.dayPhase;
  parent.dataset.weather = input.weather;
  parent.dataset.backdrop = input.backdrop;
  parent.dataset.livingWorld = String(input.hasLivingWorld);
  parent.dataset.objectPhysics = String(input.hasObjectPhysics);
  parent.dataset.decorationCount = String(input.decorationCount);
  parent.dataset.environmentInteractions = String(input.environmentInteractionsCount);
  parent.dataset.interestKey = input.interestKey;
  parent.dataset.activePeerVisuals = String(input.activePeerVisualsCount);
  parent.dataset.activeNpcVisuals = String(input.visibleNpcCount);
  parent.dataset.maxParticles = String(input.maxParticles);
  parent.dataset.qualityTier = input.qualityTier;
  parent.dataset.controlMode = input.controlMode;
  parent.dataset.moveFeel = input.moveFeel;
  parent.dataset.gaitStride = String(Math.round(input.localGaitStride));
  parent.dataset.cameraPreference = input.cameraPreference;
  parent.dataset.texture = input.localSprite.texture.key;
  parent.dataset.appearanceIssues = JSON.stringify(input.localSprite.getData("appearanceIssues") ?? []);
  parent.dataset.reaction = input.shownLocalEmote ?? "";
  parent.dataset.npcSpeech = JSON.stringify(input.chatterBubbles.map((bubble) => ({ id: bubble.npcId, ko: bubble.text.ko })));
  parent.dataset.emoteSequence = String(input.emoteSequence);
  parent.dataset.frameTime = input.time.toFixed(0);
  parent.dataset.emoteDebug = input.emoteDebug;
  parent.dataset.peers = JSON.stringify(input.peers.map(([id, peer]) => ({
    id, x: peer.sprite.x, y: peer.sprite.y, targetX: peer.targetX, targetY: peer.targetY,
    texture: peer.sprite.texture.key, reaction: input.activePeerEmote(id),
  })));
  parent.dataset.npcs = JSON.stringify(input.npcs.map(([id, npc]) => ({
    id, x: npc.sprite.x, y: npc.sprite.y, floor: npc.groundPoint, phase: npc.phase,
    stage: npc.sprite.getData("activityStage"), anchor: npc.sprite.getData("activityAnchorId"),
    texture: npc.sprite.texture.key, frame: npc.sprite.frame.name,
    originX: npc.sprite.originX, originY: npc.sprite.originY,
    displayWidth: npc.sprite.displayWidth, displayHeight: npc.sprite.displayHeight,
  })));
  parent.dataset.props = JSON.stringify(
    input.manifest.props.filter((prop) => prop.assetUrl).map((prop) => ({ id: prop.id, depth: studioWorldPropDepth(prop) })),
  );
}
