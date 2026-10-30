/**
 * ToonOffice 2D 렌더러(Canvas 2D).
 *
 * 그리는 순서: ① 바닥 청크 캐시(재질·낮은 벽·러그·벽 그늘) → ② 접지 그림자 → ③ y 정렬 층(북쪽 벽·가구·의자·물리 소품·배우)
 * → ④ 상호작용 강조·목적지·안내선 → ⑤ 파티클 → ⑥ 조명(주야 + 모니터·스탠드 가산광 + 창문 빛줄기) → ⑦ 화면 좌표 오버레이(이름표·말풍선·이모트·키 힌트).
 * 바닥은 512px 청크 단위로 한 번만 굽고, 배율 구간이 바뀔 때만 다시 굽는다.
 * 이름표 자리는 월드를 그리기 전에 정하고(office2d-overlay), 이름표와 겹치는 벽 명판은 흐리게 그린다.
 * 배우는 보행 시트 또는 작업 자세 시트(착석 작업 루프·제스처, office2d-poses)에서 프레임을 고른다.
 */
import type { StudioBuildPlacedFixture } from "../studio-virtual-space-build-mode-vitality";
import type { StudioVirtualDecorationState } from "../studio-virtual-space-customization";
import type { StudioVirtualAvatarProfile, StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import type { StudioSpaceThemeKey } from "../studio-virtual-space-theme";
import type { StudioTileEffectDefinition } from "../studio-virtual-space-tile-effects";
import { office2dActorBob, office2dActorFrame, office2dActorOpacity, type Office2dActor } from "./office2d-actors";
import { OFFICE2D_ACTOR_HEIGHT, OFFICE2D_FOOT_RATIO, office2dActorFoot } from "./office2d-actor-geometry";
import { paintOffice2dAvatarAccessory } from "./office2d-avatar-appearance";
import { office2dAtlasDrawFrame, office2dAtlasImageMatches } from "./office2d-atlas-frames";
import { resolveOffice2dStandingExpression } from "./office2d-standing-expression";
import type { Office2dCamera } from "./office2d-camera";
import { office2dSignAlpha, type Office2dLabelBox } from "./office2d-label-layout";
import { drawOffice2dKeycap, drawOffice2dOverlay, planOffice2dOverlay, type Office2dOverlayPlan } from "./office2d-overlay";
import type { Office2dParticles } from "./office2d-particles";
import { office2dPoseFrame } from "./office2d-poses";
import {
  office2dRoundRect,
  paintOffice2dFallbackActor,
  paintOffice2dFallbackObject,
  paintOffice2dFloor,
  paintOffice2dLowWall,
  paintOffice2dNorthWall,
  paintOffice2dShadow,
  paintOffice2dWallShade,
  paintOffice2dWallSign,
  type Office2dCanvas2D,
} from "./office2d-procedural-art";
import type { Office2dScene, Office2dSceneObject, Office2dWall } from "./office2d-scene";
import {
  OFFICE2D_CHARACTER_CELL,
  OFFICE2D_SPRITE_SPECS,
  office2dCharacterUrl,
  office2dObjectUrl,
  office2dWorkSheetUrl,
  office2dLegacyCharacterUrl,
  office2dLegacyWorkSheetUrl,
  type Office2dImageSource,
  type Office2dSpriteKey,
} from "./office2d-sprite-catalog";
import { office2dOutsideColor, type Office2dStageExtensions } from "./office2d-stage-extensions";
import {
  computeOffice2dObjectOcclusion,
  findOffice2dActionableObjectAhead,
  paintOffice2dComicBursts,
  paintOffice2dDoorwayAndSeatPreview,
  paintOffice2dNorthWallArtMural,
  paintOffice2dRoomAmbientEffects,
  paintOffice2dRoomFloorBackdrops,
  paintOffice2dSchematicOverlay,
  type Office2dComicBurst,
} from "./office2d-backdrop-art";
import {
  paintOffice2dActorSpatialAura,
  paintOffice2dFloorDetails,
  paintOffice2dObjectLiveOverlay,
  paintOffice2dWallDecorLive,
} from "./office2d-world-details";

export type Office2dDrawable = CanvasImageSource & Office2dImageSource;

export interface Office2dSurface {
  readonly canvas: Office2dDrawable;
  readonly context: Office2dCanvas2D;
}

export interface Office2dRendererHost {
  /** 바닥 청크용 오프스크린 표면. 만들 수 없으면 null(매 프레임 직접 그린다). */
  createSurface(width: number, height: number): Office2dSurface | null;
  image(url: string): Office2dDrawable | null;
  /** 기존 사용자 꾸미기 저장소의 캐시. 원격 동료에게 로컬 선택을 적용하지 않는다. */
  selfAvatarProfile?(): StudioVirtualAvatarProfile | null;
}

export interface Office2dPropVisual {
  readonly id: string;
  readonly sprite: Office2dSpriteKey;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly radius: number;
  readonly spin: number;
  readonly rolls: boolean;
  readonly angle?: number;
  readonly angularVelocity?: number;
  readonly impactSquash?: number;
  readonly vx?: number;
  readonly vy?: number;
}

export interface Office2dRenderFrame {
  readonly camera: Office2dCamera;
  readonly pixelRatio: number;
  readonly time: number;
  readonly now: number;
  readonly actors: readonly Office2dActor[];
  readonly selfId: string;
  readonly props: readonly Office2dPropVisual[];
  readonly nearbyInteractionId: string | null;
  readonly destination: StudioVirtualSpacePoint | null;
  readonly locateTarget: StudioVirtualSpacePoint | null;
  /** 0 = 밤, 1 = 낮. */
  readonly daylight: number;
  readonly reducedMotion: boolean;
  readonly language: "ko" | "en";
  readonly particles: Office2dParticles;
  readonly ghost: boolean;
  readonly atmosphere?: string | undefined;
  readonly spaceTheme?: StudioSpaceThemeKey | null | undefined;
  readonly tileEffects?: readonly StudioTileEffectDefinition[] | undefined;
  readonly placedFixtures?: readonly StudioBuildPlacedFixture[] | undefined;
  readonly decorations?: StudioVirtualDecorationState | undefined;
  readonly activeObjectStates?: ReadonlyMap<string, { readonly stateKey: string; readonly changedAt: number }> | undefined;
  readonly extensions?: Office2dStageExtensions | undefined;
  readonly schematicMode?: boolean | undefined;
  readonly comicBursts?: readonly Office2dComicBurst[] | undefined;
}

const CHUNK = 512;
const ACTOR_HEIGHT = OFFICE2D_ACTOR_HEIGHT;
const FOOT_RATIO = OFFICE2D_FOOT_RATIO;
const OUTSIDE = "#2b2420";
const SIGN_FONT = "700 13px Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif";

interface SortEntry {
  readonly y: number;
  readonly draw: () => void;
}

export class Office2dRenderer {
  private chunks = new Map<string, Office2dSurface | null>();
  private chunkScale = 0;
  private chunkTheme: StudioSpaceThemeKey | null | undefined = undefined;
  private readonly interactionObjects: ReadonlyMap<string, Office2dSceneObject>;
  private readonly roomStep: ReadonlyMap<string, number | null>;

  constructor(private readonly scene: Office2dScene, private readonly host: Office2dRendererHost) {
    this.interactionObjects = new Map(scene.objects.filter((object) => object.interactionId).map((object) => [object.interactionId ?? object.id, object] as const));
    this.roomStep = new Map(scene.rooms.map((room) => [room.id, room.pipelineStep] as const));
  }

  /** 이미지가 늦게 도착하면 바닥 캐시(러그·배경)를 다시 굽는다. */
  invalidateFloor(): void {
    this.chunks = new Map();
  }

  render(ctx: Office2dCanvas2D, frame: Office2dRenderFrame): void {
    const { camera, pixelRatio } = frame;
    const viewport = camera.getViewport();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = office2dOutsideColor(frame.spaceTheme);
    ctx.fillRect(0, 0, viewport.width * pixelRatio, viewport.height * pixelRatio);
    const scale = camera.zoom * pixelRatio;
    ctx.setTransform(scale, 0, 0, scale, (viewport.width / 2 - camera.x * camera.zoom) * pixelRatio, (viewport.height / 2 - camera.y * camera.zoom) * pixelRatio);
    ctx.imageSmoothingEnabled = true;
    const visible = camera.visibleRect(96);
    // 이름표 자리를 먼저 정해(측정만) 겹치는 벽 명판을 흐리게 그릴 수 있게 한다.
    const overlay = planOffice2dOverlay(ctx, frame);
    this.drawFloor(ctx, visible, scale, frame.language, frame.spaceTheme);
    paintOffice2dRoomAmbientEffects(ctx, this.scene, visible, frame.time, frame.reducedMotion, (url) => this.host.image(url));
    frame.extensions?.drawFloorTileEffects(ctx, frame.tileEffects, visible, frame.time, frame.reducedMotion);
    this.drawPortals(ctx, frame);
    this.drawShadows(ctx, frame, visible);
    this.drawSorted(ctx, frame, visible, overlay.boxes);
    frame.extensions?.drawPlacedFixturesAndDecor(
      ctx,
      frame.placedFixtures,
      frame.decorations,
      visible,
      frame.language,
      (sprite, x, y, width, tone) => this.drawObjectSprite(ctx, sprite, undefined, x, y, width, undefined, tone, false),
    );
    this.drawGuides(ctx, frame);
    frame.particles.draw(ctx);
    this.drawLighting(ctx, frame, visible);
    if (frame.schematicMode ?? frame.extensions?.schematicMode) {
      paintOffice2dSchematicOverlay(
        ctx,
        this.scene,
        frame.actors,
        frame.selfId,
        frame.language,
        frame.extensions?.claimedSeatId ?? null,
      );
    }
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.drawOverlay(ctx, frame, overlay);
  }

  private drawFloor(
    ctx: Office2dCanvas2D,
    visible: ReturnType<Office2dCamera["visibleRect"]>,
    scale: number,
    language: "ko" | "en" = "ko",
    spaceTheme?: StudioSpaceThemeKey | null,
  ): void {
    const bucket = Math.max(1, Math.min(2.5, Math.ceil(scale * 2) / 2));
    if (bucket !== this.chunkScale || spaceTheme !== this.chunkTheme) {
      this.chunkScale = bucket;
      this.chunkTheme = spaceTheme;
      this.chunks = new Map();
    }
    const x0 = Math.max(0, Math.floor(visible.minX / CHUNK));
    const y0 = Math.max(0, Math.floor(visible.minY / CHUNK));
    const x1 = Math.min(Math.ceil(this.scene.width / CHUNK) - 1, Math.floor(visible.maxX / CHUNK));
    const y1 = Math.min(Math.ceil(this.scene.height / CHUNK) - 1, Math.floor(visible.maxY / CHUNK));
    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        const key = `${cx}:${cy}:${language}:${spaceTheme ?? "default"}`;
        let surface = this.chunks.get(key);
        if (surface === undefined) {
          surface = this.host.createSurface(Math.ceil(CHUNK * bucket), Math.ceil(CHUNK * bucket));
          if (surface) {
            surface.context.setTransform(bucket, 0, 0, bucket, -cx * CHUNK * bucket, -cy * CHUNK * bucket);
            this.paintFloorArea(surface.context, cx * CHUNK, cy * CHUNK, language, spaceTheme);
          }
          this.chunks.set(key, surface);
        }
        if (surface) ctx.drawImage(surface.canvas, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
        else {
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
          ctx.clip();
          this.paintFloorArea(ctx, cx * CHUNK, cy * CHUNK, language, spaceTheme);
          ctx.restore();
        }
      }
    }
  }

  private paintFloorArea(
    ctx: Office2dCanvas2D,
    originX: number,
    originY: number,
    language: "ko" | "en" = "ko",
    spaceTheme?: StudioSpaceThemeKey | null,
  ): void {
    ctx.fillStyle = OUTSIDE;
    ctx.fillRect(originX, originY, CHUNK, CHUNK);
    const intersects = (rect: { x: number; y: number; width: number; height: number }) =>
      rect.x < originX + CHUNK && rect.x + rect.width > originX && rect.y < originY + CHUNK && rect.y + rect.height > originY;
    const background = this.scene.backgroundUrl ? this.host.image(this.scene.backgroundUrl) : null;
    if (background) ctx.drawImage(background, 0, 0, this.scene.width, this.scene.height);
    else for (const floor of this.scene.floors) if (intersects(floor)) paintOffice2dFloor(ctx, floor);
    paintOffice2dRoomFloorBackdrops(ctx, this.scene, originX, originY, CHUNK, (url) => this.host.image(url), spaceTheme);
    for (const object of this.scene.objects) {
      if (object.layer !== "floor") continue;
      this.drawObjectSprite(ctx, object.sprite, object.imageUrl, object.x, object.y, object.width, object.height, object.tone, object.flip);
    }
    paintOffice2dFloorDetails(ctx, this.scene, originX, originY, CHUNK, language);
    for (const wall of this.scene.walls) {
      if (!intersects({ x: wall.x - 20, y: wall.y - 20, width: wall.width + 40, height: wall.height + 60 })) continue;
      paintOffice2dWallShade(ctx, wall);
      if (wall.side !== "north") paintOffice2dLowWall(ctx, wall);
    }
  }

  private spriteSize(sprite: Office2dSpriteKey | null, imageUrl: string | undefined, width: number, height?: number): { readonly image: Office2dDrawable | null; readonly height: number } {
    const url = sprite ? office2dObjectUrl(sprite) : imageUrl;
    const image = url ? this.host.image(url) : null;
    if (image) return { image, height: width * (image.height / image.width) };
    return { image: null, height: height ?? width * (sprite ? OFFICE2D_SPRITE_SPECS[sprite].fallbackAspect : 0.8) };
  }

  private drawObjectSprite(
    ctx: Office2dCanvas2D,
    sprite: Office2dSpriteKey | null,
    imageUrl: string | undefined,
    x: number,
    y: number,
    width: number,
    height: number | undefined,
    tone: string,
    flip: boolean,
  ): number {
    const size = this.spriteSize(sprite, imageUrl, width, height);
    if (size.image) {
      if (flip) {
        ctx.save();
        ctx.translate(x, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(size.image, -width / 2, y - size.height, width, size.height);
        ctx.restore();
      } else {
        ctx.drawImage(size.image, x - width / 2, y - size.height, width, size.height);
      }
    } else if (sprite && OFFICE2D_SPRITE_SPECS[sprite].family !== "rug") {
      paintOffice2dFallbackObject(ctx, x, y, width, size.height, tone);
    } else if (sprite) {
      ctx.fillStyle = tone;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x - width / 2, y - size.height, width, size.height);
      ctx.globalAlpha = 1;
    }
    return size.height;
  }

  private drawChairBackBase(ctx: Office2dCanvas2D, x: number, baseY: number, width: number): void {
    const size = this.spriteSize("chair-back", undefined, width, undefined);
    if (!size.image) return;
    const cropTop = 0.56;
    const cropRatio = 1 - cropTop;
    ctx.drawImage(
      size.image,
      0,
      size.image.height * cropTop,
      size.image.width,
      size.image.height * cropRatio,
      x - width / 2,
      baseY - size.height * cropRatio,
      width,
      size.height * cropRatio,
    );
  }

  private drawPortals(ctx: Office2dCanvas2D, frame: Office2dRenderFrame): void {
    for (const portal of this.scene.portals) {
      const pulse = frame.reducedMotion ? 0.5 : 0.5 + Math.sin(frame.time * 3) * 0.25;
      ctx.fillStyle = "rgba(90, 70, 52, 0.85)";
      office2dRoundRect(ctx, portal.point.x - 48, portal.point.y - 14, 96, 28, 8);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 214, 140, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 228, 170, ${0.55 + pulse * 0.4})`;
      for (let index = 0; index < 3; index += 1) {
        const cx = portal.point.x - 16 + index * 16;
        ctx.beginPath();
        ctx.moveTo(cx - 5, portal.point.y - 4);
        ctx.lineTo(cx, portal.point.y + 3);
        ctx.lineTo(cx + 5, portal.point.y - 4);
        ctx.lineTo(cx + 5, portal.point.y - 1);
        ctx.lineTo(cx, portal.point.y + 6);
        ctx.lineTo(cx - 5, portal.point.y - 1);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private drawShadows(ctx: Office2dCanvas2D, frame: Office2dRenderFrame, visible: ReturnType<Office2dCamera["visibleRect"]>): void {
    for (const object of this.scene.objects) {
      if (object.layer !== "y-sort" || !object.sprite || !inside(object, visible)) continue;
      const ratio = OFFICE2D_SPRITE_SPECS[object.sprite].shadow;
      if (ratio > 0) paintOffice2dShadow(ctx, object.x, object.y - 2, (object.width * ratio) / 2, 9, 0.22);
    }
    for (const prop of frame.props) if (inside(prop, visible)) paintOffice2dShadow(ctx, prop.x, prop.y + prop.radius * 0.55, prop.radius * 1.05, prop.radius * 0.36, 0.26);
    for (const actor of frame.actors) {
      if (!inside(actor, visible) || actor.seat) continue;
      const bob = office2dActorBob(actor, frame.time, frame.reducedMotion);
      paintOffice2dShadow(ctx, actor.x, actor.y + 1, 15 * bob.shadowScale, 5.5 * bob.shadowScale, 0.3 * office2dActorOpacity(actor, frame.now));
    }
  }

  private drawSorted(ctx: Office2dCanvas2D, frame: Office2dRenderFrame, visible: ReturnType<Office2dCamera["visibleRect"]>, labelBoxes: readonly Office2dLabelBox[]): void {
    const entries: SortEntry[] = [];
    for (const wall of this.scene.walls) {
      if (wall.side !== "north" || wall.x > visible.maxX || wall.x + wall.width < visible.minX || wall.y > visible.maxY || wall.y + wall.height < visible.minY) continue;
      entries.push({ y: wall.y + wall.height, draw: () => this.drawNorthWall(ctx, wall, frame, labelBoxes) });
    }
    const occupiedSeats = new Set(frame.actors.flatMap((actor) => (actor.seat ? [actor.seat.id] : [])));
    for (const object of this.scene.objects) {
      if (object.layer !== "y-sort" || !inside(object, visible, 240)) continue;
      entries.push({ y: object.y, draw: () => {
        const expectedHeight = this.spriteSize(object.sprite, object.imageUrl, object.width, object.height).height;
        const occlusion = computeOffice2dObjectOcclusion(object, expectedHeight, frame.actors);
        if (occlusion.occluded) ctx.globalAlpha = occlusion.alpha;
        const drawnHeight = this.drawObjectSprite(ctx, object.sprite, object.imageUrl, object.x, object.y, object.width, object.height, object.tone, object.flip);
        paintOffice2dObjectLiveOverlay(ctx, object, drawnHeight, frame, occupiedSeats);
        ctx.globalAlpha = 1;
      } });
    }
    for (const seat of this.scene.seats) {
      if (!seat.chair || !inside(seat.anchor, visible)) continue;
      const chair = seat.chair;
      const baseY = chair === "chair-back" ? seat.anchor.y + 10 : seat.anchor.y + 1;
      if (chair === "chair-back" && occupiedSeats.has(seat.id)) {
        // 착석 중에는 등받이·팔걸이는 캐릭터 뒤에 두고, 좌판 하단·기둥·바퀴(하단 44%)만 엉덩이 앞에 그려 자연스럽게 감싼다.
        entries.push({ y: seat.anchor.y - 2, draw: () => { this.drawObjectSprite(ctx, chair, undefined, seat.anchor.x, baseY, 40, undefined, "#3b3f46", false); } });
        entries.push({ y: seat.anchor.y + 2, draw: () => { this.drawChairBackBase(ctx, seat.anchor.x, baseY, 40); } });
      } else {
        const y = chair === "chair-back" ? seat.anchor.y + 6 : seat.anchor.y - 3;
        entries.push({ y, draw: () => { this.drawObjectSprite(ctx, chair, undefined, seat.anchor.x, baseY, 40, undefined, "#3b3f46", false); } });
      }
    }
    for (const prop of frame.props) {
      if (!inside(prop, visible)) continue;
      entries.push({ y: prop.y + prop.radius * 0.5, draw: () => this.drawProp(ctx, prop) });
    }
    for (const actor of frame.actors) {
      if (!inside(actor, visible, 120)) continue;
      // 앉은 사람은 의자 기준으로 정렬한다(뒤 착석은 의자 등받이가 앞을 가리고, 앞 착석은 의자 위에 보인다).
      const sortY = actor.seat ? actor.seat.anchor.y : actor.y;
      entries.push({ y: sortY, draw: () => this.drawActor(ctx, actor, frame) });
    }
    entries.sort((left, right) => left.y - right.y);
    for (const entry of entries) entry.draw();
  }

  private drawNorthWall(ctx: Office2dCanvas2D, wall: Office2dWall, frame: Office2dRenderFrame, labelBoxes: readonly Office2dLabelBox[]): void {
    const language = frame.language;
    paintOffice2dNorthWall(ctx, wall);
    paintOffice2dNorthWallArtMural(ctx, wall, (url) => this.host.image(url), frame.time, frame.reducedMotion);
    const faceTop = wall.y + 12;
    const faceBottom = wall.y + wall.height - 8;
    for (const decor of wall.decor) {
      const image = this.host.image(office2dObjectUrl(decor.sprite));
      const aspect = image ? image.height / image.width : OFFICE2D_SPRITE_SPECS[decor.sprite].fallbackAspect;
      const height = Math.min(faceBottom - faceTop - 6, decor.width * aspect);
      const width = height / aspect;
      const cy = decor.sprite === "wall-clock" || decor.sprite === "neon-balloon" ? faceTop + 8 + height / 2 : (faceTop + faceBottom) / 2;
      if (image) ctx.drawImage(image, decor.x - width / 2, cy - height / 2, width, height);
      else paintOffice2dFallbackObject(ctx, decor.x, cy + height / 2, width, height, OFFICE2D_SPRITE_SPECS[decor.sprite].tone);
      paintOffice2dWallDecorLive(ctx, decor, decor.x, cy, width, height, frame);
    }
    if (wall.signKo && wall.signX !== undefined) {
      const step = this.roomStep.get(wall.roomId);
      const label = language === "en" ? wall.signEn ?? wall.signKo : wall.signKo;
      const text = step === null || step === undefined ? label : `${step + 1}. ${label}`;
      ctx.font = SIGN_FONT;
      const signWidth = Math.min(220, ctx.measureText(text).width + 26);
      const topLeft = frame.camera.worldToScreen({ x: wall.signX - signWidth / 2, y: faceTop + 6 });
      const signBox = { x: topLeft.x, y: topLeft.y, width: signWidth * frame.camera.zoom, height: 24 * frame.camera.zoom };
      ctx.globalAlpha = office2dSignAlpha(signBox, labelBoxes);
      paintOffice2dWallSign(ctx, wall.signX, faceTop + 6, text);
      ctx.globalAlpha = 1;
    }
  }

  private drawProp(ctx: Office2dCanvas2D, prop: Office2dPropVisual): void {
    const image = this.host.image(office2dObjectUrl(prop.sprite));
    const height = image ? prop.width * (image.height / image.width) : prop.width * OFFICE2D_SPRITE_SPECS[prop.sprite].fallbackAspect;
    const baseY = prop.y + prop.radius * 0.55;
    const vx = prop.vx ?? 0;
    const vy = prop.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    if (speed > 95) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 248, 230, 0.28)";
      ctx.lineWidth = Math.min(5, prop.radius * 0.32);
      ctx.beginPath();
      ctx.moveTo(prop.x, prop.y);
      ctx.lineTo(prop.x - vx * 0.065, prop.y - vy * 0.065);
      ctx.stroke();
      ctx.restore();
    }
    const squash = Math.max(0, Math.min(0.22, prop.impactSquash ?? 0));
    const scaleX = 1 + squash;
    const scaleY = 1 / scaleX;
    const bodyAngle = prop.angle ?? 0;
    if (prop.rolls) {
      ctx.save();
      ctx.translate(prop.x, baseY - height / 2);
      ctx.scale(scaleX, scaleY);
      ctx.rotate(prop.spin + bodyAngle);
      if (image) ctx.drawImage(image, -prop.width / 2, -height / 2, prop.width, height);
      else { ctx.fillStyle = OFFICE2D_SPRITE_SPECS[prop.sprite].tone; ctx.beginPath(); ctx.arc(0, 0, prop.width / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      return;
    }
    // 강체 토크 회전각(bodyAngle)을 최대 ±20° 범위로 투영하고 바퀴 미세 진동을 더한다.
    const wobble = Math.sin(prop.spin * 3) * 0.03 + Math.sin(bodyAngle) * 0.32;
    ctx.save();
    ctx.translate(prop.x, baseY);
    ctx.scale(scaleX, scaleY);
    ctx.rotate(wobble);
    if (image) ctx.drawImage(image, -prop.width / 2, -height, prop.width, height);
    else paintOffice2dFallbackObject(ctx, 0, 0, prop.width, height, OFFICE2D_SPRITE_SPECS[prop.sprite].tone);
    ctx.restore();
  }

  private drawActor(ctx: Office2dCanvas2D, actor: Office2dActor, frame: Office2dRenderFrame): void {
    const opacity = office2dActorOpacity(actor, frame.now) * (actor.id === frame.selfId && frame.ghost ? 0.5 : 1);
    if (opacity <= 0.01) return;
    const avatarProfile = actor.id === frame.selfId ? this.host.selfAvatarProfile?.() : null;
    const pose = office2dPoseFrame(actor, frame.time, frame.now, frame.reducedMotion);
    const walkFrame = pose.sheet === "walk" ? pose : office2dActorFrame(actor);
    const workCandidate = pose.sheet === "work" ? this.host.image(office2dWorkSheetUrl(actor.character)) : null;
    const generatedWorkImage = workCandidate && office2dAtlasImageMatches(actor.character, "work", pose.row, pose.col, workCandidate) ? workCandidate : null;
    const workImage = generatedWorkImage ?? (pose.sheet === "work" ? this.host.image(office2dLegacyWorkSheetUrl(actor.character)) : null);
    const walkCandidate = workImage ? null : this.host.image(office2dCharacterUrl(actor.character));
    const generatedWalkImage = walkCandidate && office2dAtlasImageMatches(actor.character, "walk", walkFrame.row, walkFrame.col, walkCandidate) ? walkCandidate : null;
    const walkImage = generatedWalkImage ?? (workImage ? null : this.host.image(office2dLegacyCharacterUrl(actor.character)));
    // 작업 자세 시트가 없으면(로딩 실패) 보행 시트의 같은 방향 정지 프레임으로 대신한다.
    const bob = office2dActorBob(actor, frame.time, frame.reducedMotion);
    const seated = actor.seat !== null;
    const foot = office2dActorFoot(actor);
    const footX = foot.x;
    const footY = seated ? foot.y : actor.y + 3;
    const height = ACTOR_HEIGHT * bob.scaleY;
    const width = ACTOR_HEIGHT * (OFFICE2D_CHARACTER_CELL.width / OFFICE2D_CHARACTER_CELL.height) * (seated ? 1 : bob.scaleX);
    ctx.globalAlpha = opacity;
    paintOffice2dActorSpatialAura(ctx, actor, frame, frame.actors);
    if (actor.id === frame.selfId && !seated) {
      ctx.strokeStyle = avatarProfile?.accent ?? actor.accent;
      ctx.lineWidth = 2;
      ctx.globalAlpha = opacity * (frame.reducedMotion ? 0.7 : 0.55 + Math.sin(frame.time * 3) * 0.2);
      ctx.beginPath();
      ctx.ellipse(actor.x, actor.y + 1, 17, 6.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = opacity;
    }
    if (actor.highlighted) {
      ctx.strokeStyle = "rgba(167, 139, 250, 0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(footX, footY - 2, 18, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const anchorY = footY + bob.offsetY;
    const reaction = resolveOffice2dStandingExpression(actor, pose, frame, (url) => this.host.image(url));
    const image = reaction?.image ?? workImage ?? walkImage;
    const drawHeight = seated && !workImage ? height * 0.9 : height;
    const tilt = !seated && !workImage ? bob.tiltRad : 0;
    let accessoryOffset = { x: 0, y: 0 };
    if (image) {
      // 작업 자세의 80%, 보행 착석 폴백의 92% 자르기는 기존 논리셀 계약을 유지한다.
      const crop = workImage ? (seated && actor.seat?.facing === "up" ? 0.8 : 1) : seated ? 0.92 : 1;
      const selected = workImage ? pose : walkFrame;
      const drawFrame = reaction?.drawFrame ?? office2dAtlasDrawFrame(actor.character, workImage ? "work" : "walk", selected.row, selected.col, image, crop,
        Boolean(workImage ? generatedWorkImage : generatedWalkImage));
      accessoryOffset = reaction && (avatarProfile?.accessory === "glasses" || avatarProfile?.accessory === "sunglasses")
        ? reaction.eyewearOffset : drawFrame.accessoryOffset;
      const source = drawFrame.source, target = drawFrame.destination;
      ctx.save();
      try {
        ctx.translate(footX, anchorY);
        ctx.rotate(tilt);
        ctx.drawImage(image, source.x, source.y, source.width, source.height,
          -width / 2 + target.x / 128 * width, -drawHeight * FOOT_RATIO + target.y / 192 * drawHeight,
          target.width / 128 * width, target.height / 192 * drawHeight);
      } finally { ctx.restore(); }
    } else {
      paintOffice2dFallbackActor(ctx, footX, anchorY, height, actor.accent, actor.facing, actor.stride / 10);
    }
    if (avatarProfile) paintOffice2dAvatarAccessory(ctx, avatarProfile, {
      facing: actor.seat?.facing ?? actor.facing, footX, footY: anchorY, width,
      height: drawHeight, tiltRad: tilt, offset: accessoryOffset,
    });
    ctx.globalAlpha = 1;
  }

  private drawGuides(ctx: Office2dCanvas2D, frame: Office2dRenderFrame): void {
    const self = frame.actors.find((actor) => actor.id === frame.selfId) ?? null;
    const occupiedSeats = new Set(frame.actors.flatMap((actor) => (actor.seat ? [actor.seat.id] : [])));
    paintOffice2dDoorwayAndSeatPreview(
      ctx,
      this.scene,
      self,
      occupiedSeats,
      frame.time,
      frame.language,
      frame.extensions?.claimedSeatId ?? null,
    );
    const activeObject =
      (frame.nearbyInteractionId ? this.interactionObjects.get(frame.nearbyInteractionId) : null) ??
      (self ? findOffice2dActionableObjectAhead(this.scene.objects, self) : null);
    if (activeObject) {
      const footprint = activeObject.footprint ?? { x: activeObject.x - activeObject.width / 2, y: activeObject.y - 24, width: activeObject.width, height: 24 };
      const pulse = frame.reducedMotion ? 0.8 : 0.65 + Math.sin(frame.time * 5) * 0.25;
      ctx.strokeStyle = `rgba(255, 210, 120, ${pulse})`;
      ctx.lineWidth = 3;
      office2dRoundRect(ctx, footprint.x - 8, footprint.y - 6, footprint.width + 16, footprint.height + 14, 10);
      ctx.stroke();
    }
    if (frame.destination) {
      const t = frame.reducedMotion ? 0.5 : (frame.time * 1.6) % 1;
      ctx.strokeStyle = `rgba(92, 195, 201, ${1 - t * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(frame.destination.x, frame.destination.y, 8 + t * 10, (8 + t * 10) * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (frame.locateTarget && self) {
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = "rgba(242, 184, 75, 0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(self.x, self.y);
      ctx.lineTo(frame.locateTarget.x, frame.locateTarget.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawLighting(ctx: Office2dCanvas2D, frame: Office2dRenderFrame, visible: ReturnType<Office2dCamera["visibleRect"]>): void {
    const night = Math.max(0, Math.min(1, 1 - frame.daylight));
    if (night > 0.02) {
      ctx.fillStyle = `rgba(22, 28, 64, ${0.42 * night})`;
      ctx.fillRect(visible.minX, visible.minY, visible.maxX - visible.minX, visible.maxY - visible.minY);
    }
    ctx.globalCompositeOperation = "lighter";
    for (const light of this.scene.lights) {
      if (light.x + light.radius < visible.minX || light.x - light.radius > visible.maxX || light.y + light.radius < visible.minY || light.y - light.radius > visible.maxY) continue;
      if (light.kind === "window") {
        const strength = 0.1 * frame.daylight;
        if (strength < 0.01) continue;
        const gradient = ctx.createLinearGradient(0, light.y - 60, 0, light.y + light.radius);
        gradient.addColorStop(0, `rgba(255, 244, 214, ${strength})`);
        gradient.addColorStop(1, "rgba(255, 244, 214, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(light.x - 40, light.y - 60);
        ctx.lineTo(light.x + 40, light.y - 60);
        ctx.lineTo(light.x + 78, light.y + light.radius);
        ctx.lineTo(light.x - 26, light.y + light.radius);
        ctx.closePath();
        ctx.fill();
        continue;
      }
      const flicker = light.kind === "screen" && !frame.reducedMotion ? 0.92 + Math.sin(frame.time * 7 + light.x) * 0.04 : 1;
      const strength = (light.kind === "lamp" ? 0.1 + night * 0.22 : 0.06 + night * 0.16) * flicker;
      const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
      gradient.addColorStop(0, withAlpha(light.color, strength));
      gradient.addColorStop(1, withAlpha(light.color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(light.x, light.y, light.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private drawOverlay(ctx: Office2dCanvas2D, frame: Office2dRenderFrame, overlay: Office2dOverlayPlan): void {
    if (frame.nearbyInteractionId) {
      const object = this.interactionObjects.get(frame.nearbyInteractionId);
      if (object) {
        const height = this.spriteSize(object.sprite, object.imageUrl, object.width, object.height).height;
        const point = frame.camera.worldToScreen({ x: object.x, y: object.y - height - 6 });
        drawOffice2dKeycap(ctx, point.x, point.y, "E");
      }
    }
    drawOffice2dOverlay(ctx, overlay, frame);
    paintOffice2dComicBursts(ctx, frame.camera, frame.comicBursts ?? frame.extensions?.comicBursts ?? [], frame.now, frame.reducedMotion);
  }
}

function inside(point: { readonly x: number; readonly y: number }, visible: ReturnType<Office2dCamera["visibleRect"]>, margin = 80): boolean {
  return point.x >= visible.minX - margin && point.x <= visible.maxX + margin && point.y >= visible.minY - margin && point.y <= visible.maxY + margin * 2;
}

function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(value) || hex.length !== 7) return `rgba(255, 255, 255, ${alpha})`;
  return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${Math.max(0, alpha)})`;
}
