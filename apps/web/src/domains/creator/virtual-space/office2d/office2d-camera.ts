/**
 * ToonOffice 2D 카메라: 부드러운 추종, 사용자 줌, 월드 경계 고정, 화면↔월드 좌표 변환.
 */
import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";

export interface Office2dViewport {
  readonly width: number;
  readonly height: number;
}

export interface Office2dVisibleRect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** 화면에 보이는 세로 월드 크기(px). 데스크톱은 약 14타일, 세로형 모바일은 가로 약 8.5타일이 보인다. */
const DESKTOP_VISIBLE_HEIGHT = 14 * 48;
const PORTRAIT_VISIBLE_WIDTH = 8.5 * 48;

export function office2dBaseZoom(viewport: Office2dViewport): number {
  if (viewport.width <= 0 || viewport.height <= 0) return 1;
  const portrait = viewport.height > viewport.width * 1.15;
  const zoom = portrait ? viewport.width / PORTRAIT_VISIBLE_WIDTH : viewport.height / DESKTOP_VISIBLE_HEIGHT;
  return Math.max(0.55, Math.min(2.4, zoom));
}

export class Office2dCamera {
  x: number;
  y: number;
  zoom = 1;
  private viewport: Office2dViewport = { width: 1, height: 1 };

  constructor(private readonly worldWidth: number, private readonly worldHeight: number, start: StudioVirtualSpacePoint) {
    this.x = start.x;
    this.y = start.y;
  }

  setViewport(viewport: Office2dViewport): void {
    this.viewport = { width: Math.max(1, viewport.width), height: Math.max(1, viewport.height) };
  }

  getViewport(): Office2dViewport {
    return this.viewport;
  }

  /** 목표 지점으로 지수 감쇠 추종. 이동 방향으로 살짝 앞서 보여 준다. */
  follow(target: StudioVirtualSpacePoint, deltaSeconds: number, options: { readonly zoom: number; readonly leadX?: number; readonly leadY?: number; readonly snap?: boolean }): void {
    const goalX = target.x + (options.leadX ?? 0);
    const goalY = target.y + (options.leadY ?? 0);
    const t = options.snap ? 1 : 1 - Math.exp(-Math.max(0, deltaSeconds) * 7.5);
    const zoomT = options.snap ? 1 : 1 - Math.exp(-Math.max(0, deltaSeconds) * 9);
    this.x += (goalX - this.x) * t;
    this.y += (goalY - this.y) * t;
    this.zoom += (options.zoom - this.zoom) * zoomT;
    this.clamp();
  }

  private clamp(): void {
    const halfWidth = this.viewport.width / this.zoom / 2;
    const halfHeight = this.viewport.height / this.zoom / 2;
    this.x = halfWidth * 2 >= this.worldWidth ? this.worldWidth / 2 : Math.max(halfWidth, Math.min(this.worldWidth - halfWidth, this.x));
    this.y = halfHeight * 2 >= this.worldHeight ? this.worldHeight / 2 : Math.max(halfHeight, Math.min(this.worldHeight - halfHeight, this.y));
  }

  visibleRect(margin = 0): Office2dVisibleRect {
    const halfWidth = this.viewport.width / this.zoom / 2 + margin;
    const halfHeight = this.viewport.height / this.zoom / 2 + margin;
    return { minX: this.x - halfWidth, minY: this.y - halfHeight, maxX: this.x + halfWidth, maxY: this.y + halfHeight };
  }

  worldToScreen(point: StudioVirtualSpacePoint): StudioVirtualSpacePoint {
    return {
      x: (point.x - this.x) * this.zoom + this.viewport.width / 2,
      y: (point.y - this.y) * this.zoom + this.viewport.height / 2,
    };
  }

  screenToWorld(point: StudioVirtualSpacePoint): StudioVirtualSpacePoint {
    return {
      x: (point.x - this.viewport.width / 2) / this.zoom + this.x,
      y: (point.y - this.viewport.height / 2) / this.zoom + this.y,
    };
  }
}
