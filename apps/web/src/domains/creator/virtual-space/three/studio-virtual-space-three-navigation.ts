import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { studioSemanticLineCanTraverse } from "../studio-virtual-space-semantic-world";
import { studioWorldLineCanOccupy } from "../studio-virtual-space-world-connectivity";
import { studioWorldCollisionRects, type StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { clampStudioWorldPoint, findStudioWorldPath, resolveStudioWorldSpawn, STUDIO_WORLD_PLAYER_RADIUS, studioWorldCanOccupy } from "../studio-virtual-space-world-pathfinding";

/** 2D와 같은 충돌·지형 계약을 사용한다. 키보드는 벽을 따라 미끄러지고 클릭 이동은 경로를 한 번 계산한다. */
export class StudioThreeWorldNavigation {
  private route: StudioVirtualSpacePoint[] = [];
  private target: StudioVirtualSpacePoint | null = null;

  constructor(private readonly manifest: StudioVirtualSpaceWorldManifest) {}

  /** 다음 이동 계산에 남아 있는 실제 waypoint 수다. 경로를 다시 계산하지 않는다. */
  get waypointCount(): number { return this.route.length; }

  resolveTarget(point: StudioVirtualSpacePoint): StudioVirtualSpacePoint | null {
    return resolveStudioWorldSpawn(this.manifest, clampStudioWorldPoint(this.manifest, point));
  }

  cancel(): void { this.route = []; this.target = null; }

  private canMove(from: StudioVirtualSpacePoint, to: StudioVirtualSpacePoint): boolean {
    return studioWorldCanOccupy(this.manifest, to)
      && studioWorldLineCanOccupy(this.manifest, studioWorldCollisionRects(this.manifest), from, to, STUDIO_WORLD_PLAYER_RADIUS)
      && studioSemanticLineCanTraverse(this.manifest, from, to);
  }

  directional(from: StudioVirtualSpacePoint, delta: StudioVirtualSpacePoint): StudioVirtualSpacePoint {
    this.cancel();
    const target = clampStudioWorldPoint(this.manifest, { x: from.x + delta.x, y: from.y + delta.y });
    if (this.canMove(from, target)) return target;
    const horizontal = { x: target.x, y: from.y };
    if (this.canMove(from, horizontal)) {
      const vertical = { x: horizontal.x, y: target.y };
      return this.canMove(horizontal, vertical) ? vertical : horizontal;
    }
    const vertical = { x: from.x, y: target.y };
    if (this.canMove(from, vertical)) return vertical;
    // 코너 슬라이딩 보정(Gather/WorkAdventure): 문틀·책상 모서리에 살짝 걸렸을 때 열린 방향으로 부드럽게 미끄러진다.
    const stepLen = Math.hypot(delta.x, delta.y);
    if (stepLen > 0.01) {
      const nx = delta.x / stepLen;
      const ny = delta.y / stepLen;
      const px = -ny;
      const py = nx;
      const look = Math.max(10, stepLen * 1.6);
      for (const offset of [10, 18]) {
        const probePos = clampStudioWorldPoint(this.manifest, { x: from.x + nx * look + px * offset, y: from.y + ny * look + py * offset });
        const probeNeg = clampStudioWorldPoint(this.manifest, { x: from.x + nx * look - px * offset, y: from.y + ny * look - py * offset });
        const posFree = studioWorldCanOccupy(this.manifest, probePos);
        const negFree = studioWorldCanOccupy(this.manifest, probeNeg);
        if (posFree !== negFree) {
          const sign = posFree ? 1 : -1;
          const slide = clampStudioWorldPoint(this.manifest, {
            x: from.x + px * sign * stepLen * 0.72,
            y: from.y + py * sign * stepLen * 0.72,
          });
          if (this.canMove(from, slide)) return slide;
        }
      }
    }
    return from;
  }

  toward(from: StudioVirtualSpacePoint, target: StudioVirtualSpacePoint, distance: number) {
    if (!this.target || this.target.x !== target.x || this.target.y !== target.y) {
      this.target = { ...target };
      this.route = [...findStudioWorldPath(this.manifest, from, target)];
    }
    let point = from;
    let remaining = Math.max(0, distance);
    while (this.route.length > 0 && remaining > 0) {
      const waypoint = this.route[0];
      if (!waypoint) break;
      const gap = Math.hypot(waypoint.x - point.x, waypoint.y - point.y);
      if (gap < 0.001) { this.route.shift(); continue; }
      const step = Math.min(gap, remaining);
      const next = { x: point.x + (waypoint.x - point.x) * step / gap, y: point.y + (waypoint.y - point.y) * step / gap };
      if (!this.canMove(point, next)) { this.route = []; break; }
      point = next;
      remaining -= step;
      if (step >= gap) this.route.shift();
    }
    return { point, moving: Math.hypot(point.x - from.x, point.y - from.y) > 0.001, arrived: this.route.length === 0 };
  }
}
