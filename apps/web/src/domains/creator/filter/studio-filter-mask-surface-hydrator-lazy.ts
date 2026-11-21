/**
 * 필터 마스크 표면 하이드레이터 지연 프록시.
 * 페이지에 복원할 필터 마스크 표면이 하나 이상 관측될 때만 CRDT 래스터 리플레이 런타임을 로드한다.
 */
import { isStudioFilterMaskSurfaceId } from "@/shared/lib/studio-filter-mask-surface-contract";

import { createStudioIntentLazyLoader } from "../studio-intent-lazy-loader";

import type { StudioCrdtDocument } from "../live/studio-crdt-document";
import type {
  StudioFilterMaskSurfaceDocumentReader,
  StudioFilterMaskSurfaceHydrationState,
  StudioFilterMaskSurfaceHydrator,
} from "./studio-filter-mask-surface-hydrator";

const filterMaskHydratorLoader = createStudioIntentLazyLoader(
  () => import("./studio-filter-mask-surface-hydrator"),
);

export class StudioLazyFilterMaskSurfaceHydrator {
  private delegate: StudioFilterMaskSurfaceHydrator | null = null;
  private delegateUnsubscribe: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private disposed = false;
  private loading = false;
  private pendingWorkId: string | null = null;
  private pendingDocument: StudioCrdtDocument | StudioFilterMaskSurfaceDocumentReader | null = null;
  private pendingSurfaceIds: readonly string[] = [];
  private pendingOptions: { readonly prioritySurfaceIds?: readonly string[] } = {};

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = (): number => this.version;

  get(surfaceId: string): StudioFilterMaskSurfaceHydrationState | null {
    return this.delegate ? this.delegate.get(surfaceId) : null;
  }

  resourceUrl(surfaceId: string): string | null {
    return this.delegate ? this.delegate.resourceUrl(surfaceId) : null;
  }

  setScope(
    workId: string | null,
    document: StudioCrdtDocument | StudioFilterMaskSurfaceDocumentReader | null,
  ): void {
    this.pendingWorkId = workId;
    this.pendingDocument = document;
    if (this.delegate) {
      this.delegate.setScope(workId, document);
    }
  }

  observe(
    surfaceIds: readonly string[],
    options: { readonly prioritySurfaceIds?: readonly string[] } = {},
  ): void {
    this.pendingSurfaceIds = surfaceIds;
    this.pendingOptions = options;
    if (this.delegate) {
      this.delegate.observe(surfaceIds, options);
      return;
    }
    if (this.disposed || !surfaceIds.some(isStudioFilterMaskSurfaceId)) return;
    this.ensureDelegateLoaded();
  }

  retry(surfaceId: string): void {
    if (this.delegate) {
      this.delegate.retry(surfaceId);
      return;
    }
    if (this.disposed || !isStudioFilterMaskSurfaceId(surfaceId)) return;
    this.ensureDelegateLoaded();
  }

  dispose(): void {
    this.disposed = true;
    this.delegateUnsubscribe?.();
    this.delegateUnsubscribe = null;
    this.delegate?.dispose();
    this.delegate = null;
    this.listeners.clear();
  }

  private emit(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  private ensureDelegateLoaded(): void {
    if (this.loading || this.delegate || this.disposed) return;
    this.loading = true;
    void filterMaskHydratorLoader.load().then(
      (mod) => {
        this.loading = false;
        if (this.disposed) return;
        const hydrator = new mod.StudioFilterMaskSurfaceHydrator();
        this.delegate = hydrator;
        this.delegateUnsubscribe = hydrator.subscribe(() => this.emit());
        hydrator.setScope(this.pendingWorkId, this.pendingDocument);
        hydrator.observe(this.pendingSurfaceIds, this.pendingOptions);
        this.emit();
      },
      () => {
        this.loading = false;
      },
    );
  }
}
