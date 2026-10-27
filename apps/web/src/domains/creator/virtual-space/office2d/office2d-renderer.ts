/**
 * ToonOffice 2D 렌더러(Canvas 2D).
 *
 * 그리는 순서: ① 바닥 청크 캐시(재질·낮은 벽·러그·벽 그늘) → ② 접지 그림자 → ③ y 정렬 층(북쪽 벽·가구·의자·물리 소품·배우)
 * → ④ 상호작용 강조·목적지·안내선 → ⑤ 파티클 → ⑥ 조명(주야 + 모니터·스탠드 가산광 + 창문 빛줄기) → ⑦ 화면 좌표 오버레이(이름표·말풍선·이모트·키 힌트).
 * 바닥은 512px 청크 단위로 한 번만 굽고, 배율 구간이 바뀔 때만 다시 굽는다.
 */
import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { office2dActorBob, office2dActorFrame, office2dActorOpacity, type Office2dActor } from "./office2d-actors";
import type { Office2dCamera } from "./office2d-camera";
import type { Office2dParticles } from "./office2d-particles";
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
  type Office2dImageSource,
  type Office2dSpriteKey,
} from "./office2d-sprite-catalog";

export type Office2dDrawable = CanvasImageSource & Office2dImageSource;

export interface Office2dSurface {
  readonly canvas: Office2dDrawable;
  readonly context: Office2dCanvas2D;
}

export interface Office2dRendererHost {
  /** 바닥 청크용 오프스크린 표면. 만들 수 없으면 null(매 프레임 직접 그린다). */
  createSurface(width: number, height: number): Office2dSurface | null;
  image(url: string): Office2dDrawable | null;
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
}

const CHUNK = 512;
const ACTOR_HEIGHT = 76;
const FOOT_RATIO = 188 / 192;
const OUTSIDE = "#2b2420";
const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif";

interface SortEntry {
  readonly y: number;
  readonly draw: () => void;
}

export class Office2dRenderer {
  private chunks = new Map<string, Office2dSurface | null>();
  private chunkScale = 0;
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
    ctx.fillStyle = OUTSIDE;
    ctx.fillRect(0, 0, viewport.width * pixelRatio, viewport.height * pixelRatio);
    const scale = camera.zoom * pixelRatio;
    ctx.setTransform(scale, 0, 0, scale, (viewport.width / 2 - camera.x * camera.zoom) * pixelRatio, (viewport.height / 2 - camera.y * camera.zoom) * pixelRatio);
    ctx.imageSmoothingEnabled = true;
    const visible = camera.visibleRect(96);
    this.drawFloor(ctx, visible, scale);
    this.drawPortals(ctx, frame);
    this.drawShadows(ctx, frame, visible);
    this.drawSorted(ctx, frame, visible);
    this.drawGuides(ctx, frame);
    frame.particles.draw(ctx);
    this.drawLighting(ctx, frame, visible);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.drawOverlay(ctx, frame);
  }

  private drawFloor(ctx: Office2dCanvas2D, visible: ReturnType<Office2dCamera["visibleRect"]>, scale: number): void {
    const bucket = Math.max(1, Math.min(2.5, Math.ceil(scale * 2) / 2));
    if (bucket !== this.chunkScale) {
      this.chunkScale = bucket;
      this.chunks = new Map();
    }
    const x0 = Math.max(0, Math.floor(visible.minX / CHUNK));
    const y0 = Math.max(0, Math.floor(visible.minY / CHUNK));
    const x1 = Math.min(Math.ceil(this.scene.width / CHUNK) - 1, Math.floor(visible.maxX / CHUNK));
    const y1 = Math.min(Math.ceil(this.scene.height / CHUNK) - 1, Math.floor(visible.maxY / CHUNK));
    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        const key = `${cx}:${cy}`;
        let surface = this.chunks.get(key);
        if (surface === undefined) {
          surface = this.host.createSurface(Math.ceil(CHUNK * bucket), Math.ceil(CHUNK * bucket));
          if (surface) {
            surface.context.setTransform(bucket, 0, 0, bucket, -cx * CHUNK * bucket, -cy * CHUNK * bucket);
            this.paintFloorArea(surface.context, cx * CHUNK, cy * CHUNK);
          }
          this.chunks.set(key, surface);
        }
        if (surface) ctx.drawImage(surface.canvas, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
        else {
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
          ctx.clip();
          this.paintFloorArea(ctx, cx * CHUNK, cy * CHUNK);
          ctx.restore();
        }
      }
    }
  }

  private paintFloorArea(ctx: Office2dCanvas2D, originX: number, originY: number): void {
    ctx.fillStyle = OUTSIDE;
    ctx.fillRect(originX, originY, CHUNK, CHUNK);
    const intersects = (rect: { x: number; y: number; width: number; height: number }) =>
      rect.x < originX + CHUNK && rect.x + rect.width > originX && rect.y < originY + CHUNK && rect.y + rect.height > originY;
    const background = this.scene.backgroundUrl ? this.host.image(this.scene.backgroundUrl) : null;
    if (background) ctx.drawImage(background, 0, 0, this.scene.width, this.scene.height);
    else for (const floor of this.scene.floors) if (intersects(floor)) paintOffice2dFloor(ctx, floor);
    for (const object of this.scene.objects) {
      if (object.layer !== "floor") continue;
      this.drawObjectSprite(ctx, object.sprite, object.imageUrl, object.x, object.y, object.width, object.height, object.tone, object.flip);
    }
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

  private drawSorted(ctx: Office2dCanvas2D, frame: Office2dRenderFrame, visible: ReturnType<Office2dCamera["visibleRect"]>): void {
    const entries: SortEntry[] = [];
    const self = frame.actors.find((actor) => actor.id === frame.selfId) ?? null;
    for (const wall of this.scene.walls) {
      if (wall.side !== "north" || wall.x > visible.maxX || wall.x + wall.width < visible.minX || wall.y > visible.maxY || wall.y + wall.height < visible.minY) continue;
      entries.push({ y: wall.y + wall.height, draw: () => this.drawNorthWall(ctx, wall, frame.language) });
    }
    for (const object of this.scene.objects) {
      if (object.layer !== "y-sort" || !inside(object, visible, 240)) continue;
      entries.push({ y: object.y, draw: () => {
        const covering = self !== null && !self.seat && object.footprint !== null
          && self.y < object.y - 4 && Math.abs(self.x - object.x) < object.width / 2 && self.y > object.y - this.spriteSize(object.sprite, object.imageUrl, object.width, object.height).height;
        if (covering) ctx.globalAlpha = 0.55;
        this.drawObjectSprite(ctx, object.sprite, object.imageUrl, object.x, object.y, object.width, object.height, object.tone, object.flip);
        ctx.globalAlpha = 1;
      } });
    }
    for (const seat of this.scene.seats) {
      if (!seat.chair || !inside(seat.anchor, visible)) continue;
      const chair = seat.chair;
      const y = chair === "chair-back" ? seat.anchor.y + 6 : seat.anchor.y - 3;
      entries.push({ y, draw: () => { this.drawObjectSprite(ctx, chair, undefined, seat.anchor.x, y + 4, 40, undefined, "#3b3f46", false); } });
    }
    for (const prop of frame.props) {
      if (!inside(prop, visible)) continue;
      entries.push({ y: prop.y + prop.radius * 0.5, draw: () => this.drawProp(ctx, prop) });
    }
    for (const actor of frame.actors) {
      if (!inside(actor, visible, 120)) continue;
      const sortY = actor.seat ? actor.seat.anchor.y : actor.y;
      entries.push({ y: sortY, draw: () => this.drawActor(ctx, actor, frame) });
    }
    entries.sort((left, right) => left.y - right.y);
    for (const entry of entries) entry.draw();
  }

  private drawNorthWall(ctx: Office2dCanvas2D, wall: Office2dWall, language: "ko" | "en"): void {
    paintOffice2dNorthWall(ctx, wall);
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
    }
    if (wall.signKo && wall.signX !== undefined) {
      const step = this.roomStep.get(wall.roomId);
      const label = language === "en" ? wall.signEn ?? wall.signKo : wall.signKo;
      paintOffice2dWallSign(ctx, wall.signX, faceTop + 6, step === null || step === undefined ? label : `${step + 1}. ${label}`);
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
    const image = this.host.image(office2dCharacterUrl(actor.character));
    const { row, col } = office2dActorFrame(actor);
    const bob = office2dActorBob(actor, frame.time, frame.reducedMotion);
    const seated = actor.seat !== null;
    const footX = seated && actor.seat ? actor.seat.attach.x : actor.x;
    const footY = seated && actor.seat ? actor.seat.attach.y + 16 : actor.y + 3;
    const height = ACTOR_HEIGHT * (seated ? 0.9 : 1) * bob.scaleY;
    const width = ACTOR_HEIGHT * (OFFICE2D_CHARACTER_CELL.width / OFFICE2D_CHARACTER_CELL.height) * (seated ? 1 : bob.scaleX);
    ctx.globalAlpha = opacity;
    if (actor.id === frame.selfId && !seated) {
      ctx.strokeStyle = actor.accent;
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
      ctx.ellipse(actor.x, actor.y + 1, 18, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const anchorY = footY + bob.offsetY;
    if (image) {
      const sx = col * OFFICE2D_CHARACTER_CELL.width;
      const sy = row * OFFICE2D_CHARACTER_CELL.height;
      const drawHeight = seated ? height * 0.92 : height;
      if (!seated && Math.abs(bob.tiltRad) > 1e-4) {
        ctx.save();
        ctx.translate(footX, anchorY);
        ctx.rotate(bob.tiltRad);
        ctx.drawImage(image, sx, sy, OFFICE2D_CHARACTER_CELL.width, OFFICE2D_CHARACTER_CELL.height,
          -width / 2, -height * FOOT_RATIO, width, drawHeight);
        ctx.restore();
      } else {
        ctx.drawImage(image, sx, sy, OFFICE2D_CHARACTER_CELL.width, OFFICE2D_CHARACTER_CELL.height * (seated ? 0.92 : 1),
          footX - width / 2, anchorY - height * FOOT_RATIO, width, drawHeight);
      }
    } else {
      paintOffice2dFallbackActor(ctx, footX, anchorY, height, actor.accent, actor.facing, actor.stride / 10);
    }
    ctx.globalAlpha = 1;
  }

  private drawGuides(ctx: Office2dCanvas2D, frame: Office2dRenderFrame): void {
    if (frame.nearbyInteractionId) {
      const object = this.interactionObjects.get(frame.nearbyInteractionId);
      if (object) {
        const footprint = object.footprint ?? { x: object.x - object.width / 2, y: object.y - 24, width: object.width, height: 24 };
        const pulse = frame.reducedMotion ? 0.8 : 0.65 + Math.sin(frame.time * 5) * 0.25;
        ctx.strokeStyle = `rgba(255, 210, 120, ${pulse})`;
        ctx.lineWidth = 3;
        office2dRoundRect(ctx, footprint.x - 8, footprint.y - 6, footprint.width + 16, footprint.height + 14, 10);
        ctx.stroke();
      }
    }
    if (frame.destination) {
      const t = frame.reducedMotion ? 0.5 : (frame.time * 1.6) % 1;
      ctx.strokeStyle = `rgba(92, 195, 201, ${1 - t * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(frame.destination.x, frame.destination.y, 8 + t * 10, (8 + t * 10) * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const self = frame.actors.find((actor) => actor.id === frame.selfId);
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

  private drawOverlay(ctx: Office2dCanvas2D, frame: Office2dRenderFrame): void {
    const { camera } = frame;
    const viewport = camera.getViewport();
    if (frame.nearbyInteractionId) {
      const object = this.interactionObjects.get(frame.nearbyInteractionId);
      if (object) {
        const height = this.spriteSize(object.sprite, object.imageUrl, object.width, object.height).height;
        const point = camera.worldToScreen({ x: object.x, y: object.y - height - 6 });
        drawKeycap(ctx, point.x, point.y, "E");
      }
    }
    for (const actor of frame.actors) {
      const opacity = office2dActorOpacity(actor, frame.now);
      if (opacity < 0.05) continue;
      const footY = actor.seat ? actor.seat.attach.y + 16 : actor.y;
      const footX = actor.seat ? actor.seat.attach.x : actor.x;
      const head = camera.worldToScreen({ x: footX, y: footY - ACTOR_HEIGHT * (actor.seat ? 0.84 : 0.98) });
      if (head.x < -80 || head.x > viewport.width + 80 || head.y < -60 || head.y > viewport.height + 120) continue;
      ctx.globalAlpha = opacity;
      const plateBottom = drawNamePlate(ctx, head.x, head.y - 4, actor, actor.id === frame.selfId);
      let top = plateBottom;
      if (actor.bubble || actor.typing) top = drawBubble(ctx, head.x, top - 6, actor.bubble ?? "", !actor.bubble && actor.typing, frame.time);
      if (actor.emote && actor.emote.until > frame.now) {
        const remaining = (actor.emote.until - frame.now) / 2600;
        const pop = frame.reducedMotion ? 1 : Math.min(1, (1 - remaining) * 6) * (1 + Math.sin(frame.time * 9) * 0.04);
        ctx.font = `${Math.round(26 * pop)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(actor.emote.glyph, head.x, top - 4);
      }
      ctx.globalAlpha = 1;
    }
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

function drawKeycap(ctx: Office2dCanvas2D, x: number, y: number, key: string): void {
  office2dRoundRect(ctx, x - 13, y - 26, 26, 24, 6);
  ctx.fillStyle = "rgba(255, 248, 232, 0.96)";
  ctx.fill();
  ctx.strokeStyle = "#7a5a3c";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#4a3426";
  ctx.font = `800 13px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(key, x, y - 13.5);
}

/** 이름표를 그리고 윗변 y를 돌려준다. */
function drawNamePlate(ctx: Office2dCanvas2D, x: number, bottom: number, actor: Office2dActor, self: boolean): number {
  ctx.font = `700 12px ${FONT}`;
  const name = actor.name.length > 18 ? `${actor.name.slice(0, 17)}…` : actor.name;
  const width = Math.ceil(ctx.measureText(name).width) + 26;
  const statusHeight = actor.status ? 14 : 0;
  const height = 20 + statusHeight;
  const top = bottom - height;
  office2dRoundRect(ctx, x - width / 2, top, width, height, 10);
  ctx.fillStyle = actor.kind === "npc" ? "rgba(52, 40, 78, 0.86)" : self ? "rgba(40, 30, 24, 0.9)" : "rgba(31, 26, 23, 0.82)";
  ctx.fill();
  ctx.fillStyle = actor.kind === "npc" ? "#c4b5fd" : actor.accent;
  ctx.beginPath();
  ctx.arc(x - width / 2 + 10, top + 10, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fffaf0";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(name, x - width / 2 + 18, top + 10.5);
  if (actor.status) {
    ctx.font = `600 10px ${FONT}`;
    ctx.fillStyle = "rgba(255, 238, 210, 0.85)";
    ctx.textAlign = "center";
    ctx.fillText(actor.status.length > 16 ? `${actor.status.slice(0, 15)}…` : actor.status, x, top + 26);
  }
  return top;
}

function wrapText(ctx: Office2dCanvas2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const char of [...text]) {
    const candidate = line + char;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = char.trimStart();
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && [...lines.join("")].length < [...text].length) {
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 1))}…`;
  }
  return lines;
}

/** 말풍선을 그리고 윗변 y를 돌려준다. */
function drawBubble(ctx: Office2dCanvas2D, x: number, bottom: number, text: string, typing: boolean, time: number): number {
  ctx.font = `600 12px ${FONT}`;
  const lines = typing ? ["   "] : wrapText(ctx, text, 168, 3);
  const width = Math.max(44, Math.min(184, Math.max(...lines.map((line) => ctx.measureText(line).width)) + 20));
  const height = lines.length * 16 + 12;
  const top = bottom - height - 6;
  office2dRoundRect(ctx, x - width / 2, top, width, height, 10);
  ctx.fillStyle = "rgba(255, 253, 248, 0.97)";
  ctx.fill();
  ctx.strokeStyle = "rgba(90, 66, 48, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 6, top + height - 0.5);
  ctx.lineTo(x, top + height + 6);
  ctx.lineTo(x + 6, top + height - 0.5);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 253, 248, 0.97)";
  ctx.fill();
  ctx.fillStyle = "#3d2e24";
  if (typing) {
    for (let index = 0; index < 3; index += 1) {
      ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(time * 6 - index * 0.8));
      ctx.beginPath();
      ctx.arc(x - 9 + index * 9, top + height / 2, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return top;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, index) => ctx.fillText(line, x, top + 14 + index * 16));
  return top;
}
