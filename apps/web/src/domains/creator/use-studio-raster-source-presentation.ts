import { useEffect, useState } from "react";

import type {
  StudioRasterSourceLease,
  StudioRasterSourceLeaseOptions,
} from "./render/studio-raster-source-lease";

const isCasSource = (source: string | null): boolean => !!source && (source.startsWith("studio-opfs-cas:") || source.startsWith("bg3d-lt-artifact:"));

export type StudioRasterPresentationLease = Pick<StudioRasterSourceLease, "src" | "release"> & { readonly kind: "passthrough" | "linked-3d-cas" | "thumbnail" };

export type StudioRasterSourceLeaseAcquirer = (
  source: string,
  options: StudioRasterSourceLeaseOptions,
) => Promise<StudioRasterPresentationLease>;

export interface StudioRasterSourcePresentation {
  readonly error: Error | null;
  readonly pending: boolean;
  readonly src: string | null;
}

async function acquireDefaultStudioRasterSourceLease(
  source: string,
  options: StudioRasterSourceLeaseOptions,
): Promise<StudioRasterSourceLease> {
  const { acquireStudioRasterSourceLease } = await import("./render/studio-raster-source-lease");
  return await acquireStudioRasterSourceLease(source, options);
}

/**
 * Projects a canonical raster source into a browser-readable presentation lease. Ordinary URLs
 * remain synchronous; linked OPFS/CAS sources stay hidden until their exact bytes are verified.
 */
export function useStudioRasterSourcePresentation(
  source: string | null,
  options: {
    readonly acquire?: StudioRasterSourceLeaseAcquirer;
    readonly consumer: string;
  },
): StudioRasterSourcePresentation {
  const [resolved, setResolved] = useState<{
    readonly error: Error | null;
    readonly source: string;
    readonly src: string | null;
  } | null>(null);
  const linked = isCasSource(source);

  useEffect(() => {
    if (!source || !isCasSource(source)) return;
    const controller = new AbortController();
    let active = true;
    let lease: StudioRasterPresentationLease | null = null;
    const acquire = options.acquire ?? acquireDefaultStudioRasterSourceLease;
    void acquire(source, {
      consumer: options.consumer,
      signal: controller.signal,
    }).then((nextLease) => {
      if (!active) {
        nextLease.release();
        return;
      }
      if (nextLease.kind !== "linked-3d-cas" && nextLease.kind !== "thumbnail") {
        nextLease.release();
        throw new Error("연결형 3D raster source가 검증된 CAS lease를 반환하지 않았습니다.");
      }
      lease = nextLease;
      setResolved({ error: null, source, src: nextLease.src });
    }).catch((cause: unknown) => {
      if (!active || controller.signal.aborted) return;
      setResolved({
        error: cause instanceof Error ? cause : new Error("Raster source를 표시할 수 없습니다."),
        source,
        src: null,
      });
    });
    return () => {
      active = false;
      controller.abort();
      lease?.release();
    };
  }, [options.acquire, options.consumer, source]);

  if (!source) return { error: null, pending: false, src: null };
  if (!linked) return { error: null, pending: false, src: source };
  if (resolved?.source !== source) return { error: null, pending: true, src: null };
  return {
    error: resolved.error,
    pending: resolved.src === null && resolved.error === null,
    src: resolved.src,
  };
}
