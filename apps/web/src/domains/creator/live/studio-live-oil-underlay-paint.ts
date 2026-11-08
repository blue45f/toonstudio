import { studioOilDeviceBounds } from "../brush/studio-oil-readback-plan";
import { paintStudioOilRibbonCarrier } from "../brush/studio-oil-ribbon-carrier";
import type { StudioOilRibbonPaintInput } from "../brush/studio-oil-ribbon-carrier-types";
import type { StudioLiveInkSurface } from "./studio-live-ink-overlay";

export interface StudioLiveOilUnderlay {
  readonly canvas: HTMLCanvasElement;
  readonly left: number;
  readonly top: number;
  readonly pixelRatio: number;
}

/** 혼색 결과에서 이미 표시 중인 바닥을 빼서 source-over 기여분만 남긴다. */
export function studioOilSourceOverContribution(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
  region?: { readonly x: number; readonly y: number; readonly width: number; readonly sourceWidth: number },
): void {
  const rowBytes = (region?.width ?? after.length / 4) * 4;
  const rowSkip = region ? (region.sourceWidth - region.width) * 4 : 0;
  let source = region ? (region.y * region.sourceWidth + region.x) * 4 : 0;
  for (let i = 0; i < after.length; i += 4, source += 4) {
    if (i > 0 && i % rowBytes === 0) source += rowSkip;
    const a = before[source + 3]! / 255;
    const b = after[i + 3]! / 255;
    if (before[source] === after[i] && before[source + 1] === after[i + 1]
      && before[source + 2] === after[i + 2] && a === b) {
      after.fill(0, i, i + 4);
      continue;
    }
    // 알파의 8비트 반올림으로 254→254여도 multiply 강모는 RGB를 바꿀 수 있다.
    // 색이 표현 가능한 최소 알파도 함께 구해 바닥 감산 뒤 음수/범위 초과를 막는다.
    let alpha = a === 1 ? 1 : Math.max(0, Math.min(1, (b - a) / (1 - a)));
    for (let channel = 0; channel < 3; channel += 1) {
      const previous = before[source + channel]! / 255 * a;
      const next = after[i + channel]! / 255 * b;
      if (next < previous) alpha = Math.max(alpha, 1 - next / previous);
      else if (next > previous) alpha = Math.max(alpha, (next - previous) / (1 - previous));
    }
    if (alpha === 0) {
      after.fill(0, i, i + 4);
      continue;
    }
    for (let channel = 0; channel < 3; channel += 1) {
      after[i + channel] = (after[i + channel]! * b - before[source + channel]! * a * (1 - alpha)) / alpha;
    }
    after[i + 3] = alpha * 255;
  }
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
  private snapshotPixels: ImageData | null = null;
  private scratch: HTMLCanvasElement | null = null;

  reset(): void {
    this.snapshot = null;
    this.snapshotPixels = null;
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
      this.snapshotPixels = context.getImageData(0, 0, width, height);
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
    if (!this.snapshotPixels) throw new Error("Oil snapshot pixels unavailable");
    studioOilSourceOverContribution(this.snapshotPixels.data, after.data,
      { x, y, width: w, sourceWidth: width });
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
