import type { Page } from "playwright";

export interface GpuAdapterEvidence {
  readonly available: boolean;
  readonly adapterClass: "hardware" | "software" | "unknown" | "unavailable";
  readonly isFallbackAdapter: boolean | null;
  readonly adapterFingerprint: string | null;
  readonly vendor: string;
  readonly architecture: string;
  readonly device: string;
  readonly description: string;
}

export interface LongStrokeBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export async function inspectGpuAdapter(
  page: Page,
  webgpuEnabled: boolean,
): Promise<GpuAdapterEvidence> {
  const unavailable: GpuAdapterEvidence = Object.freeze({
    available: false,
    adapterClass: "unavailable",
    isFallbackAdapter: null,
    adapterFingerprint: null,
    vendor: "",
    architecture: "",
    device: "",
    description: "",
  });
  if (!webgpuEnabled) return unavailable;
  return page
    .evaluate(async () => {
      type AdapterInfoLike = Readonly<{
        vendor?: unknown;
        architecture?: unknown;
        device?: unknown;
        description?: unknown;
      }>;
      type AdapterLike = Readonly<{
        info?: AdapterInfoLike;
        isFallbackAdapter?: unknown;
      }>;
      type NavigatorWithGpu = Navigator &
        Readonly<{
          gpu?: Readonly<{
            requestAdapter(
              options?: Readonly<{ powerPreference?: "high-performance" }>,
            ): Promise<AdapterLike | null>;
          }>;
        }>;
      const gpu = (navigator as NavigatorWithGpu).gpu;
      if (!gpu) return null;
      const adapter = (await gpu.requestAdapter({
        powerPreference: "high-performance",
      })) as AdapterLike | null;
      if (!adapter) return null;
      const info = adapter.info ?? {};
      const text = (value: unknown): string =>
        typeof value === "string" ? value.trim() : "";
      const vendor = text(info.vendor);
      const architecture = text(info.architecture);
      const device = text(info.device);
      const description = text(info.description);
      const fallbackValue = adapter.isFallbackAdapter;
      const isFallbackAdapter =
        typeof fallbackValue === "boolean" ? fallbackValue : null;
      const adapterFingerprint =
        [vendor, architecture, device, description]
          .filter((value) => value.length > 0)
          .join(":") || null;
      const identity = adapterFingerprint?.toLowerCase() ?? "";
      const software =
        /swiftshader|llvmpipe|lavapipe|software|warp|basic render/u.test(
          identity,
        );
      const adapterClass =
        isFallbackAdapter === true || software
          ? ("software" as const)
          : adapterFingerprint
            ? ("hardware" as const)
            : ("unknown" as const);
      return {
        available: true,
        adapterClass,
        isFallbackAdapter,
        adapterFingerprint,
        vendor,
        architecture,
        device,
        description,
      };
    })
    .then((result) => result ?? unavailable)
    .catch(() => unavailable);
}

/**
 * 디스패치 제스처 기하(batches × perBatch 이산 pointermove)에 causal 거리 게이트(sampleSpacing)를
 * 그대로 적용해 기대 커밋 점 수를 도출한다.
 */
export function computeExpectedDiscreteGesturePoints(
  box: LongStrokeBox,
  samples: number,
  cssToDocument: number,
  sampleSpacing: number,
  batches: number,
  gesturePoint: (box: LongStrokeBox, t: number) => { x: number; y: number },
): number {
  const perBatch = Math.max(1, Math.floor(samples / batches));
  const start = gesturePoint(box, 0);
  let lastX = start.x * cssToDocument;
  let lastY = start.y * cssToDocument;
  let accepted = 1;
  for (let batch = 1; batch <= batches; batch += 1) {
    const from = gesturePoint(box, (batch - 1) / batches);
    const to = gesturePoint(box, batch / batches);
    for (let step = 1; step <= perBatch; step += 1) {
      const ratio = step / perBatch;
      const nextX = (from.x + (to.x - from.x) * ratio) * cssToDocument;
      const nextY = (from.y + (to.y - from.y) * ratio) * cssToDocument;
      if (Math.hypot(nextX - lastX, nextY - lastY) >= sampleSpacing) {
        accepted += 1;
        lastX = nextX;
        lastY = nextY;
      }
    }
  }
  return Math.min(perBatch * batches, accepted);
}
