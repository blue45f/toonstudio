import { panelStatusText } from "./studio-panel-status-i18n-r3c06";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  createStudioBundleImageRecord, filterStudioBundleAssets, isStudioBundleAssetEligibleForSelection,
  loadStudioBundleCatalog, STUDIO_BUNDLE_CATEGORY_LABELS, studioBundleAssetUrl,
  type StudioBundleAsset, type StudioBundleAssetKind,
} from "./studio-bundle-asset-delivery";
import { useStudioModalSheet } from "./useStudioModalSheet";

import type { StudioAsset } from "./studio-asset-library";

import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";

const PAGE_SIZE = 24;
const CONTROL = "min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";
const KINDS: readonly {id: "all" | StudioBundleAssetKind; label: string}[] = [
  {id: "all", label: "전체"}, {id: "prop-image", label: "2D 투명 소품"},
  {id: "background", label: "2D 배경"},
];
function categoryLabel(asset: StudioBundleAsset): string {
  return STUDIO_BUNDLE_CATEGORY_LABELS[asset.category] ?? asset.category;
}

/**
 * Creator Bundle 렌더 소품 패널. CC0 라이브러리와 나란히 노출하되 권리 표기는 분리한다:
 * 이 팩은 서비스 내 사용 전용이라 원본 모델·텍스처를 받는 동선이 없고, 오프라인 렌더한
 * 이미지를 무결성 검증 후 캔버스에 삽입하는 동선만 제공한다. 검수(visualReviewed)를
 * 통과한 항목만 목록에 올린다.
 */
export function StudioBundleAssetLibraryPanel({onUseAsset}: {readonly onUseAsset: (asset: StudioAsset) => boolean}) {
  const searchId = useId();
  const previewTitleId = useId();
  const rootRef = useRef<HTMLDetailsElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<readonly StudioBundleAsset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | StudioBundleAssetKind>("all");
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<StudioBundleAsset | null>(null);
  const [inserting, setInserting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const insertController = useRef<AbortController | null>(null);
  const debouncedQuery = useDebouncedValue(query, 140);

  useEffect(() => {
    if (!open || catalog) return;
    const controller = new AbortController();
    setLoadError(null);
    loadStudioBundleCatalog(controller.signal).then(items => {
      if (!controller.signal.aborted) setCatalog(items);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : panelStatusText("studio.panelStatus.bundleLibrary.loadFailed", "에셋 목록을 불러오지 못했습니다."));
    });
    return () => controller.abort();
  }, [open, catalog, revision]);
  useEffect(() => () => {
    insertController.current?.abort();
    insertController.current = null;
  }, []);

  function dismissPreview(): void {
    // Closing a retained panel does not unmount this component. Cancel its pending work explicitly
    // so a late download cannot modify the canvas after the artist has left the preview/library.
    const pending = insertController.current;
    insertController.current = null;
    pending?.abort();
    setInserting(null);
    if (pending) setNotice("에셋 삽입을 취소했습니다.");
    setPreview(null);
  }

  useStudioModalSheet({
    activeKey: preview ? `bundle-asset-preview:${preview.id}` : null,
    dialogRef: previewRef, rootRef,
    onDismiss: dismissPreview,
    resolveInitialFocus: dialog => dialog.querySelector<HTMLElement>("[data-autofocus='true']"),
  });
  const eligible = useMemo(
    () => (catalog ?? []).filter(isStudioBundleAssetEligibleForSelection),
    [catalog],
  );
  const filtered = useMemo(
    () => filterStudioBundleAssets(eligible, debouncedQuery, kind === "all" ? undefined : kind),
    [eligible, debouncedQuery, kind],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  async function insert(asset: StudioBundleAsset): Promise<void> {
    insertController.current?.abort();
    const controller = new AbortController();
    insertController.current = controller;
    setInserting(asset.id); setNotice("");
    try {
      const item = await createStudioBundleImageRecord(asset, controller.signal);
      if (controller.signal.aborted || insertController.current !== controller) return;
      const added = onUseAsset(item);
      setNotice(added ? `${asset.name} 에셋을 삽입했습니다.` : panelStatusText("studio.panelStatus.bundleLibrary.insertCanvasUnavailable", "캔버스에 삽입하지 못했습니다. 편집 가능한 컷을 선택해 주세요."));
      if (added) setPreview(null);
    } catch (error: unknown) {
      if (!controller.signal.aborted && insertController.current === controller) {
        setNotice(error instanceof Error ? error.message : panelStatusText("studio.panelStatus.bundleLibrary.insertFailed", "에셋 삽입에 실패했습니다."));
      }
    } finally {
      // A cancelled predecessor must not clear the loading state of a newer insertion.
      if (insertController.current === controller) {
        insertController.current = null;
        setInserting(null);
      }
    }
  }
  function renderUseButton(asset: StudioBundleAsset) {
    return <button className={`${CONTROL} mt-2 w-full`} type="button" disabled={inserting !== null} onClick={() => {void insert(asset);}}>{inserting === asset.id ? panelStatusText("studio.panelStatus.bundleLibrary.inserting", "검증·삽입 중…") : "캔버스에 삽입"}</button>;
  }
  return (
    <details ref={rootRef} className="mb-3 rounded-xl border border-line bg-card/70 p-3" data-studio-bundle-library="true" onToggle={event => {setOpen(event.currentTarget.open); if (!event.currentTarget.open) dismissPreview();}}>
      <summary className="min-h-11 cursor-pointer rounded-md text-sm font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">번들 렌더 소품 {catalog === null ? "" : `· ${eligible.length}종`}</summary>
      {open && <div className="mt-2 space-y-3">
        <p className="text-xs leading-relaxed text-fg-3">구매한 Creator Bundle의 3D 모델을 오프라인 렌더한 투명 소품과 배경입니다. 원본 모델·텍스처 파일은 제공하지 않으며, 렌더 이미지를 검증해 캔버스에 바로 삽입합니다.</p>
        <label htmlFor={searchId} className="block text-xs font-semibold text-fg-2">에셋 검색</label>
        <input id={searchId} type="search" value={query} placeholder="음식, 주방, 나무, 마을, food…" className={`${CONTROL} w-full`} onChange={event => {setQuery(event.target.value); setPage(0);}} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="에셋 종류">{KINDS.map(item => <button key={item.id} type="button" className={`${CONTROL} ${kind === item.id ? "border-accent font-bold text-accent" : ""}`} aria-pressed={kind === item.id} onClick={() => {setKind(item.id); setPage(0);}}>{item.label}</button>)}</div>
        {loadError ? <div role="alert" className="space-y-2 text-xs text-fg-2"><p>{loadError}</p><button type="button" className={CONTROL} onClick={() => setRevision(value => value + 1)}>{panelStatusText("studio.panelStatus.bundleLibrary.reload", "다시 불러오기")}</button></div>
          : !catalog ? <p role="status" className="text-xs text-fg-3">{panelStatusText("studio.panelStatus.bundleLibrary.loadingList", "에셋 목록을 불러오는 중입니다.")}</p>
          : eligible.length === 0 ? <p className="py-4 text-center text-xs text-fg-3">{panelStatusText("studio.panelStatus.bundleLibrary.reviewedEmpty", "아직 검수가 끝난 번들 소품이 없습니다. 렌더와 검수가 끝나면 이곳에 표시됩니다.")}</p>
          : <>
            <p role="status" className="text-xs text-fg-3">검색 결과 {filtered.length}종 · {currentPage + 1}/{pages}페이지</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{visible.map(asset => <article key={asset.id} className="min-w-0 rounded-lg border border-line bg-panel p-2" data-bundle-asset-id={asset.id}>
              <button type="button" className="block aspect-square w-full rounded-md bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label={`${asset.name} 확대 미리보기`} onClick={() => setPreview(asset)}><img src={studioBundleAssetUrl(asset.previewPath ?? asset.path)} alt="" loading="lazy" decoding="async" width={384} height={384} className="aspect-square w-full rounded-md object-contain" /></button>
              <p className="mt-1 break-words text-xs font-semibold text-fg">{asset.name}</p><p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">{categoryLabel(asset)}<br />{asset.width}×{asset.height} · <a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{asset.provider}</a> · {asset.licenseId}</p>{renderUseButton(asset)}
            </article>)}</div>
            {filtered.length === 0 && <p className="py-4 text-center text-xs text-fg-3">{panelStatusText("studio.panelStatus.bundleLibrary.searchEmpty", "검색 결과가 없습니다. 검색어나 종류를 바꿔 주세요.")}</p>}
            {pages > 1 && <nav className="flex items-center justify-between gap-2" aria-label="에셋 페이지"><button type="button" className={CONTROL} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</button><span className="text-xs text-fg-3">{currentPage + 1} / {pages}</span><button type="button" className={CONTROL} disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>다음</button></nav>}
          </>}
        <p role="status" aria-live="polite" className="text-xs leading-relaxed text-fg-2">{notice}</p>
        <p className="text-[0.65rem] leading-relaxed text-fg-3">이 소품은 서비스 안에서만 사용할 수 있는 라이선스로 제공됩니다. 캔버스에 삽입한 렌더 이미지는 작품 제작에 쓸 수 있지만, 소품 자체를 다시 배포하거나 파일로 내보낼 수는 없습니다.</p>
      </div>}
      {preview && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-3"><div ref={previewRef} role="dialog" aria-modal="true" aria-labelledby={previewTitleId} tabIndex={-1} className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line bg-panel p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3"><h3 id={previewTitleId} className="text-sm font-bold text-fg">{preview.name}</h3><button type="button" data-autofocus="true" className={CONTROL} onClick={dismissPreview}>닫기</button></div>
        <img src={studioBundleAssetUrl(preview.path)} alt={`${preview.name} 실제 파일 미리보기`} className="mt-3 max-h-[60dvh] w-full rounded-lg bg-slate-200 object-contain" />
        <p className="mt-2 text-xs leading-relaxed text-fg-2">{categoryLabel(preview)} · {preview.provider} · {preview.licenseId}<br />원본 {preview.width}×{preview.height}px 렌더 이미지입니다. 표시 크기는 화면에 맞춰 축소됩니다.</p>{renderUseButton(preview)}
        <p role="status" aria-live="polite" className="mt-2 text-xs leading-relaxed text-fg-2">{notice}</p>
      </div></div>}
    </details>
  );
}
