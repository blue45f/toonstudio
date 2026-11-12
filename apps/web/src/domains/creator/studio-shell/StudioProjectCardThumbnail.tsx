import { Image as ImageIcon, LoaderCircle } from "lucide-react";
import { Suspense, useEffect, useRef, useState, type ReactElement, type RefObject } from "react";

import { formatI18nTemplate, useBilingual, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

import type { StudioAutosavePayload, studioAutosaveKey } from "../studio-autosave";
import { readStudioProjectDocuments } from "../studio-project-document-reader";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import { studioProjectFormatProfile } from "../studio-project-format-catalog";
import { StudioProjectFormatVisual } from "./StudioProjectFormatPreview";
import { useResolvedStudioProjectThumbnailUrl } from "./useStudioProjectThumbnailUrl";
import type { ThumbElement, ThumbPageLike } from "../studio-page-thumbs";

const MAX_PREVIEW_DOCUMENTS = 6;

const LazyStudioPageThumbnail = lazyRetry(
  () => import("../StudioPageThumbnails").then((module) => ({
    default: module.StudioPageThumbnail,
  })),
  "StudioProjectCardThumbnail",
);

type PreviewPhase = "idle" | "loading" | "ready" | "empty";

interface PreviewCandidate {
  readonly page: ThumbPageLike;
  readonly savedAt: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function thumbElements(value: unknown): ThumbElement[] {
  if (!Array.isArray(value)) return [];
  return value.filter((element): element is ThumbElement => {
    const item = record(element);
    return item !== null
      && typeof item.id === "string"
      && item.id.trim().length > 0
      && typeof item.type === "string"
      && item.type.trim().length > 0;
  });
}

function normalizePreviewPage(value: unknown, fallbackId: string): ThumbPageLike | null {
  const page = record(value);
  if (!page) return null;
  const elements = thumbElements(page.elements);
  if (elements.length === 0) return null;
  const rawGradient = Array.isArray(page.bgGrad)
    ? page.bgGrad.filter((color): color is string => typeof color === "string")
    : [];
  const canvasH = typeof page.canvasH === "number"
    && Number.isFinite(page.canvasH)
    && page.canvasH > 0
    ? page.canvasH
    : 1080;

  return {
    id: typeof page.id === "string" && page.id.trim() ? page.id : fallbackId,
    elements,
    bg: typeof page.bg === "string" && page.bg.trim() ? page.bg : "#ffffff",
    bgGrad: rawGradient.length >= 2 ? rawGradient.slice(0, 2) : null,
    canvasH,
    grade: page.grade,
  };
}

function studioProjectPreviewFromAutosave(
  payload: StudioAutosavePayload,
): PreviewCandidate | null {
  const currentIndex = payload.currentPageId
    ? payload.pagesList.findIndex((page) => page.id === payload.currentPageId)
    : -1;
  const pages = currentIndex >= 0
    ? [payload.pagesList[currentIndex], ...payload.pagesList.filter((_, index) => index !== currentIndex)]
    : payload.pagesList;

  for (let index = 0; index < pages.length; index += 1) {
    const page = normalizePreviewPage(pages[index], `preview-page-${index + 1}`);
    if (!page) continue;
    const savedAt = Date.parse(payload.savedAt);
    return {
      page,
      savedAt: Number.isFinite(savedAt) ? savedAt : 0,
    };
  }
  return null;
}

function newestCandidate(
  payloads: readonly (StudioAutosavePayload | null | undefined)[],
): PreviewCandidate | null {
  let newest: PreviewCandidate | null = null;
  for (const payload of payloads) {
    if (!payload) continue;
    const candidate = studioProjectPreviewFromAutosave(payload);
    if (candidate && (!newest || candidate.savedAt >= newest.savedAt)) newest = candidate;
  }
  return newest;
}

function studioProjectPreviewAutosaveKeys(
  storage: Storage,
  project: StudioProjectLibraryEntry,
  authUserId: string | null,
  autosaveKey: typeof studioAutosaveKey,
): readonly string[] {
  let documentIds: string[];
  try {
    const documents = readStudioProjectDocuments(storage, project.id).documents
      .filter((document) => document.status !== "trashed")
      .slice(0, MAX_PREVIEW_DOCUMENTS)
      .map((document) => document.id);
    documentIds = [
      ...(project.lastOpenedDocumentId ? [project.lastOpenedDocumentId] : []),
      ...documents,
      project.id,
    ];
  } catch {
    documentIds = [
      ...(project.lastOpenedDocumentId ? [project.lastOpenedDocumentId] : []),
      project.id,
    ];
  }

  const owners = authUserId ? [authUserId, null] as const : [null] as const;
  const keys = new Set<string>();
  for (const documentId of new Set(documentIds.filter(Boolean))) {
    for (const owner of owners) {
      keys.add(autosaveKey({ userId: owner, workId: documentId }));
    }
  }
  return [...keys];
}

function localStorageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface ProjectPreviewLoad {
  /** 브라우저 자동저장(localStorage)에서 바로 읽은 후보. */
  readonly browser: Promise<PreviewCandidate | null>;
  /** SQLite 초기화가 늦어도 읽기 전용 OPFS 원고를 먼저 보여 준다. */
  readonly opfs: Promise<{ readonly hasRecord: boolean; readonly candidate: PreviewCandidate | null }>;
  /** OPFS와 SQLite 내구 저장본까지 합친 최종 후보. */
  readonly durable: Promise<PreviewCandidate | null>;
}

/**
 * 작품 홈은 같은 작품을 로비(최근 작업)와 목록에서 동시에 그린다. 동시에 시작한 해석만 짧게
 * 공유해 큰 자동저장 본문을 두 번 파싱하지 않고, 오래된 미리보기를 재사용하지는 않는다.
 */
const PREVIEW_SHARE_WINDOW_MS = 2_000;
const sharedPreviewLoads = new Map<string, { readonly startedAt: number; readonly load: ProjectPreviewLoad }>();

function previewLoadKey(project: StudioProjectLibraryEntry, authUserId: string | null): string {
  return JSON.stringify([
    project.id,
    project.updatedAt,
    project.lastOpenedAt,
    project.lastOpenedDocumentId,
    authUserId,
  ]);
}

type PreviewDurableRecord = Readonly<{
  state: "snapshot";
  savedAt: string;
  payload: StudioAutosavePayload;
}> | Readonly<{ state: "cleared"; savedAt: string }> | null;

function previewFromSources(
  browser: readonly (StudioAutosavePayload | null)[],
  opfs: readonly PreviewDurableRecord[],
  sqlite: readonly PreviewDurableRecord[] = [],
): PreviewCandidate | null {
  return newestCandidate(browser.map((compatibility, index) => {
    // 편집기와 같은 키별 정본 순서: 최신 시각 → 같은 시각의 삭제 표식 → OPFS.
    // 내구 기록이 있으면 브라우저 호환 후보를 저장 완료 원고로 승격하지 않는다.
    const records = [opfs[index], sqlite[index]].filter((row): row is NonNullable<PreviewDurableRecord> => row != null);
    records.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt)
      || Number(right.state === "cleared") - Number(left.state === "cleared"));
    const winner = records[0];
    return winner ? winner.state === "snapshot" ? winner.payload : null : compatibility;
  }));
}

async function readPreviewOpfsRows(keys: readonly string[]): Promise<PreviewDurableRecord[]> {
  try {
    const { createStudioAutosaveOpfsSession } = await import("../studio-autosave-opfs-session");
    return await Promise.all(keys.map(async (key) => {
      let session: Awaited<ReturnType<typeof createStudioAutosaveOpfsSession>> = null;
      try {
        // 원고 leadership을 취득하지 않으며 쓰기·삭제·복구 마이그레이션은 하지 않는다.
        session = await createStudioAutosaveOpfsSession(key, undefined, { readOnly: true });
        return await session?.readLatest() ?? null;
      } catch {
        return null;
      } finally {
        await session?.dispose().catch(() => undefined);
      }
    }));
  } catch {
    return keys.map(() => null);
  }
}

function startProjectPreviewLoad(
  storage: Storage,
  project: StudioProjectLibraryEntry,
  authUserId: string | null,
): ProjectPreviewLoad {
  // 자동저장 해석기와 내구 저장소는 미리보기가 필요할 때만 불러온다.
  const browserRead = import("../studio-autosave").then(({ readStudioAutosave, studioAutosaveKey: autosaveKey }) => {
    const keys = studioProjectPreviewAutosaveKeys(storage, project, authUserId, autosaveKey);
    return { keys, payloads: keys.map((key) => readStudioAutosave(storage, key)?.payload ?? null) };
  });
  const browser = browserRead.then(({ payloads }) => newestCandidate(payloads));
  const opfsRows = browserRead.then(({ keys }) => readPreviewOpfsRows(keys));
  const opfs = Promise.all([browserRead, opfsRows]).then(([{ payloads }, rows]) => ({
    hasRecord: rows.some((row) => row !== null), candidate: previewFromSources(payloads, rows),
  }));
  const sqliteRows = browserRead.then(async ({ keys }) => {
    try {
      const { acquireStudioAutosaveSqliteStore } = await import("../studio-autosave-sqlite-store");
      const store = await acquireStudioAutosaveSqliteStore();
      return await Promise.all(keys.map(async (key) => {
        try { return await store.read(key); } catch { return null; }
      }));
    } catch {
      return keys.map(() => null);
    }
  });
  const durable = Promise.all([browserRead, opfsRows, sqliteRows]).then(([{ payloads }, opfs, sqlite]) =>
    previewFromSources(payloads, opfs, sqlite));
  return { browser, opfs, durable };
}

function loadProjectPreview(
  storage: Storage,
  project: StudioProjectLibraryEntry,
  authUserId: string | null,
): ProjectPreviewLoad {
  const now = Date.now();
  for (const [key, entry] of sharedPreviewLoads) {
    if (now - entry.startedAt >= PREVIEW_SHARE_WINDOW_MS) sharedPreviewLoads.delete(key);
  }
  const key = previewLoadKey(project, authUserId);
  const shared = sharedPreviewLoads.get(key);
  if (shared) return shared.load;
  const load = startProjectPreviewLoad(storage, project, authUserId);
  sharedPreviewLoads.set(key, { startedAt: now, load });
  return load;
}

function useNearViewport(): {
  readonly nearViewport: boolean;
  readonly rootRef: RefObject<HTMLDivElement | null>;
} {
  useBilingualI18nRevision();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [nearViewport, setNearViewport] = useState(
    () => typeof globalThis.IntersectionObserver !== "function",
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof globalThis.IntersectionObserver !== "function") return;
    const observer = new globalThis.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "420px 0px" });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return { nearViewport, rootRef };
}

function PreviewLoading({ locale: _locale }: { readonly locale: string }) {
  const bt = useBilingual("StudioProjectCardThumbnail.loading");
  return (
    <div className="grid h-full place-items-center bg-panel/70 text-fg-3">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {bt("미리보기 불러오는 중", "Loading preview")}
      </div>
    </div>
  );
}

function PreviewEmpty({
  locale,
  project,
  coverFailed = false,
  variant = "card",
}: {
  readonly locale: string;
  readonly project: StudioProjectLibraryEntry;
  readonly coverFailed?: boolean;
  readonly variant?: StudioProjectCardThumbnailVariant;
}) {
  const bt = useBilingual("StudioProjectCardThumbnail.empty");
  const formatProfile = project.definition
    ? studioProjectFormatProfile(project.definition.format)
    : null;
  if (formatProfile) {
    return (
      <div
        data-thumbnail-empty="true"
        data-thumbnail-fallback={coverFailed ? "true" : undefined}
        className="relative h-full bg-panel/70 p-3 text-center text-fg-3"
      >
        <StudioProjectFormatVisual
          profile={formatProfile}
          className="mx-auto h-full max-w-sm bg-card/70"
        />
        <span className="absolute inset-x-3 bottom-3 truncate rounded-lg bg-card/90 px-2 py-1.5 text-[0.68rem] font-bold text-fg-2 shadow-sm">
          {locale.startsWith("ko") ? formatProfile.titleKo : formatProfile.titleEn}
        </span>
      </div>
    );
  }
  return (
    <div
      data-thumbnail-empty="true"
      data-thumbnail-fallback={coverFailed ? "true" : undefined}
      className="grid h-full place-items-center bg-panel/70 px-3 text-center text-fg-3 sm:px-5"
    >
      <div className="min-w-0 max-w-full">
        <ImageIcon size={variant === "cover" ? 18 : 22} className="mx-auto text-accent/80" aria-hidden="true" />
        {variant === "card" ? (
          <p className="mt-1.5 truncate text-[0.7rem] font-bold text-fg-2" title={project.title}>
            {project.title}
          </p>
        ) : null}
        <p className="mt-1 text-[0.68rem] font-semibold leading-4 text-fg-3 sm:text-xs">
          {coverFailed
            ? bt("표지 이미지를 불러오지 못해 기본 커버로 표시합니다.", "Cover image unavailable; showing default cover.")
            : bt("작업을 시작하면 미리보기가 표시됩니다.", "A preview appears after you start working.")}
        </p>
      </div>
    </div>
  );
}

export type StudioProjectCardThumbnailVariant = "card" | "cover";

const VARIANT_FRAME_CLASS: Readonly<Record<StudioProjectCardThumbnailVariant, string>> = {
  card: "relative -mx-3.5 -mt-3.5 mb-3.5 aspect-[16/10] overflow-hidden border-b border-line bg-panel/70 sm:-mx-4 sm:-mt-4 sm:mb-4",
  cover: "relative h-full w-full overflow-hidden bg-panel/70",
};

export function StudioProjectCardThumbnail({
  authUserId,
  locale,
  project,
  variant = "card",
}: {
  readonly authUserId: string | null;
  readonly locale: string;
  readonly project: StudioProjectLibraryEntry;
  /** `cover`는 이미 이름이 있는 링크 안에서 쓰는 장식용 표지다(보조기기에는 링크 이름만 전달). */
  readonly variant?: StudioProjectCardThumbnailVariant;
}): ReactElement {
  const bt = useBilingual("StudioProjectCardThumbnail");
  const { nearViewport, rootRef } = useNearViewport();
  const [previewState, setPreviewState] = useState<{
    readonly projectId: string;
    readonly phase: PreviewPhase;
    readonly preview: PreviewCandidate | null;
  }>({ projectId: project.id, phase: "idle", preview: null });
  // 새 작품 props가 들어온 첫 렌더부터 이전 작품의 이미지를 노출하지 않는다.
  const { preview, phase } = previewState.projectId === project.id
    ? previewState : { preview: null, phase: "idle" as const };
  const [storedThumbnailFailed, setStoredThumbnailFailed] = useState(false);
  const decorative = variant === "cover";

  useEffect(() => {
    setStoredThumbnailFailed(false);
  }, [project.thumbnailUrl]);

  useEffect(() => {
    if (!nearViewport) return;
    const storage = localStorageOrNull();
    const publish = (candidate: PreviewCandidate | null) => setPreviewState({
      projectId: project.id, phase: candidate ? "ready" : "empty", preview: candidate,
    });
    if (!storage) {
      publish(null);
      return;
    }

    let disposed = false;
    // 같은 작품의 저장 이벤트에는 기존 그림을 유지하고, 다른 작품으로 바뀌면 초기화한다.
    setPreviewState((current) => current.projectId === project.id && current.phase === "ready"
      ? current : { projectId: project.id, phase: "loading", preview: null });
    const load = loadProjectPreview(storage, project, authUserId);
    load.browser.then((candidate) => {
      if (!disposed && candidate) publish(candidate);
    }, () => undefined);
    load.opfs.then(({ hasRecord, candidate }) => {
      if (!disposed && hasRecord) publish(candidate);
    }, () => undefined);
    load.durable.then((candidate) => {
      if (!disposed) publish(candidate);
    }, () => { if (!disposed) publish(null); });

    return () => {
      disposed = true;
    };
  }, [authUserId, nearViewport, project]);

  const resolvedThumbnailUrl = useResolvedStudioProjectThumbnailUrl(project.thumbnailUrl);
  const storedThumbnail = resolvedThumbnailUrl && !storedThumbnailFailed
    ? resolvedThumbnailUrl
    : null;
  const previewLabel = formatI18nTemplate(
    bt("{value0} 최근 작업 미리보기", "Recent work preview for {value0}"),
    { value0: project.title },
  );

  return (
    <div
      ref={rootRef}
      data-studio-project-thumbnail={variant}
      data-thumbnail-fallback={storedThumbnailFailed ? "true" : undefined}
      aria-hidden={decorative || undefined}
      className={VARIANT_FRAME_CLASS[variant]}
      data-project-preview-state={preview ? "autosave" : storedThumbnail ? "stored" : storedThumbnailFailed ? "fallback" : phase}
    >
      {preview ? (
        <div
          role={decorative ? undefined : "img"}
          aria-label={decorative ? undefined : previewLabel}
          className="h-full w-full bg-white"
        >
          <Suspense fallback={<PreviewLoading locale={locale} />}>
            <LazyStudioPageThumbnail
              page={preview.page}
              className="!h-full !rounded-none !border-0 bg-white"
            />
          </Suspense>
        </div>
      ) : storedThumbnail ? (
        <img
          src={storedThumbnail}
          alt={decorative ? "" : previewLabel}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setStoredThumbnailFailed(true)}
        />
      ) : (phase === "idle" || phase === "loading") && !storedThumbnailFailed ? (
        <PreviewLoading locale={locale} />
      ) : (
        <PreviewEmpty
          locale={locale}
          project={project}
          coverFailed={storedThumbnailFailed}
          variant={variant}
        />
      )}
      {!decorative && (preview || storedThumbnail) ? (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full border border-white/20 bg-black/65 px-2 py-1 text-[0.62rem] font-black text-white shadow-sm backdrop-blur-sm">
          {preview
            ? bt("최근 자동 저장", "Latest autosave")
            : bt("프로젝트 미리보기", "Project preview")}
        </span>
      ) : null}
    </div>
  );
}
