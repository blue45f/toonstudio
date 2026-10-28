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
    return this.canMove(from, vertical) ? vertical : from;
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
