import { studioOilDeviceBounds } from "../brush/studio-oil-readback-plan";
import { paintStudioOilRibbonCarrier } from "../brush/studio-oil-ribbon-carrier";
import type { StudioOilRibbonPaintInput } from "../brush/studio-oil-ribbon-carrier-types";
import type { StudioLiveInkSurface } from "./studio-live-ink-overlay";
import { releaseStudioLiveOverlayCanvas } from "./studio-live-overlay-canvas-cleanup";
import { StudioLiveOilSnapshotTiles } from "./studio-live-oil-snapshot-tiles";

export { studioOilSourceOverContribution } from "./studio-live-oil-snapshot-tiles";

export interface StudioLiveOilUnderlay {
  readonly canvas: HTMLCanvasElement;
  readonly left: number;
  readonly top: number;
  readonly pixelRatio: number;
}

/** 현재 획의 바닥만 보유한다. 문서·pending 순서는 캡처 때 고정하며 재생 때 갱신한다. */
export class StudioLiveOilUnderlayPainter {
  private provider: ((surface: StudioLiveInkSurface) => StudioLiveOilUnderlay | null) | null = null;

  setProvider(provider: ((surface: StudioLiveInkSurface) => StudioLiveOilUnderlay | null) | null): void {
    this.provider = provider;
    this.reset();
  }
  private snapshot: HTMLCanvasElement | null = null;
  private strokeId: string | null = null;
  private snapshotTiles: StudioLiveOilSnapshotTiles | null = null;
  private scratch: HTMLCanvasElement | null = null;

  reset(): void {
    releaseStudioLiveOverlayCanvas(this.snapshot);
    releaseStudioLiveOverlayCanvas(this.scratch);
    this.snapshot = null;
    this.snapshotTiles = null;
    this.scratch = null;
    this.strokeId = null;
  }

  paint(
    target: CanvasRenderingContext2D,
    input: StudioOilRibbonPaintInput & { readonly paddingRadiusPx: number },
    strokeId: string,
    surface: StudioLiveInkSurface,
    settled: HTMLCanvasElement | null,
    active: boolean,
  ): boolean {
    if (!this.provider) return false;
    const width = target.canvas.width;
    const height = target.canvas.height;
    const dpr = width / surface.width;
    if (!active || this.strokeId !== strokeId || !this.snapshot
      || this.snapshot.width !== width || this.snapshot.height !== height) {
      const source = this.provider(surface);
      if (!source || !Number.isFinite(source.pixelRatio) || source.pixelRatio <= 0) {
        throw new Error("유화 정본 바닥 표면이 없습니다.");
      }
      releaseStudioLiveOverlayCanvas(this.snapshot);
      this.snapshotTiles = null;
      const snapshot = document.createElement("canvas");
      snapshot.width = width;
      snapshot.height = height;
      const context = snapshot.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("유화 바닥 캡처 표면을 만들 수 없습니다.");
      context.drawImage(source.canvas,
        (surface.left - source.left) * source.pixelRatio,
        (surface.top - source.top) * source.pixelRatio,
        surface.width * source.pixelRatio, surface.height * source.pixelRatio,
        0, 0, width, height);
      if (settled) context.drawImage(settled, 0, 0);
      // canvas 자체는 획 시작에 고정하고, CPU 픽셀은 필요한 타일만 한 번씩 읽는다.
      this.snapshotTiles = new StudioLiveOilSnapshotTiles(width, height,
        rect => context.getImageData(rect.x, rect.y, rect.width, rect.height));
      this.snapshot = snapshot;
      this.strokeId = strokeId;
    }
    const transform = target.getTransform();
    const scale = Math.max(Math.abs(transform.a), Math.abs(transform.d));
    const padding = Math.ceil(Math.max(input.radiusPx, input.paddingRadiusPx)
      * Math.max(1, surface.documentScale * dpr) * 4 + 8) / scale;
    const rect = studioOilDeviceBounds(input.points, padding, transform, width, height);
    if (!rect) return true;
    const { x, y, width: w, height: h } = rect;
    const scratch = this.scratch ?? document.createElement("canvas");
    if (scratch.width !== width) scratch.width = width;
    if (scratch.height !== height) scratch.height = height;
    this.scratch = scratch;
    const context = scratch.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("유화 혼색 표면을 만들 수 없습니다.");
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(x, y, w, h);
    context.drawImage(this.snapshot, x, y, w, h, x, y, w, h);
    context.setTransform(transform);
    // 같은 carrier와 실제 바닥을 사용한다. 최종 혼색·강모의 합성 순서도 정본과 같다.
    paintStudioOilRibbonCarrier(Object.assign(context, { _context: context }), input);
    const after = context.getImageData(x, y, w, h);
    if (!this.snapshotTiles) throw new Error("유화 바닥 스냅샷 타일이 없습니다.");
    this.snapshotTiles.contribute(after, rect);
    if (active) target.putImageData(after, x, y);
    else {
      context.putImageData(after, x, y);
      target.save();
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalCompositeOperation = "source-over";
      target.globalAlpha = 1;
      target.drawImage(scratch, x, y, w, h, x, y, w, h);
      target.restore();
    }
    return true;
  }
}
