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

/**
 * 화면 클래스별 기본 배율.
 *
 * 예전에는 화면 크기와 무관하게 세로 14타일(데스크톱)·가로 8.5타일(세로형)을 보여 줘서 1920×1080 모니터에서도 노트북과 같은
 * 범위만 크게 확대해 보였다. WorkAdventure의 “최소 게임 픽셀 면적” 자동 줌(벤치마크 F2)을 참고하되, 업무 공간이므로 큰 화면일수록
 * 사무실을 더 넓게 보이게 한다. 보이는 월드 크기를 화면 크기의 거듭제곱(지수 0.45 / 0.5)으로 키워 캐릭터는 너무 작아지지 않으면서
 * (1080p에서 약 106px, 휴대폰에서 약 74px) 시야가 넓어진다.
 *
 * - 가로형: 보이는 세로 월드 = 14타일 × (화면 높이 / 800)^0.45, 12~19타일로 제한.
 * - 세로형(태블릿·휴대폰): 보이는 가로 월드 = 8.5타일 × (화면 너비 / 400)^0.5, 8~13타일로 제한.
 */
const TILE = 48;
const LANDSCAPE_BASE_TILES = 14;
const LANDSCAPE_REFERENCE_HEIGHT = 800;
const PORTRAIT_BASE_TILES = 8.5;
const PORTRAIT_REFERENCE_WIDTH = 400;

export function office2dVisibleWorldSpan(viewport: Office2dViewport): { readonly axis: "height" | "width"; readonly span: number } {
  const portrait = viewport.height > viewport.width * 1.15;
  if (portrait) {
    const tiles = Math.max(8, Math.min(13, PORTRAIT_BASE_TILES * Math.sqrt(viewport.width / PORTRAIT_REFERENCE_WIDTH)));
    return { axis: "width", span: tiles * TILE };
  }
  const tiles = Math.max(12, Math.min(19, LANDSCAPE_BASE_TILES * (viewport.height / LANDSCAPE_REFERENCE_HEIGHT) ** 0.45));
  return { axis: "height", span: tiles * TILE };
}

export function office2dBaseZoom(viewport: Office2dViewport): number {
  if (viewport.width <= 0 || viewport.height <= 0) return 1;
  const visible = office2dVisibleWorldSpan(viewport);
  const zoom = (visible.axis === "width" ? viewport.width : viewport.height) / visible.span;
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
