/**
 * PDF 워크벤치 페이지 — 발행·가져온 PDF의 페이지를 카드로 정리하는 후단 작업 화면.
 *
 * 할 수 있는 것: PDF 여러 개 추가(병합), 페이지 순서 재배열(버튼·드래그), 페이지
 * 회전·제거, 전체를 한 PDF로 내려받기, 페이지 범위별로 나눠 내려받기.
 * 모든 처리는 이 기기 안에서 끝나고 파일은 서버로 가지 않는다.
 *
 * 상태 정본은 pdf-workbench-model(순수 상태), 바이트 연산은 pdf-workbench-engine,
 * 썸네일은 pdf-workbench-thumbnails가 맡는다. 이 파일은 조립과 상호작용만 담당한다.
 */

import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileText,
  FileUp,
  LoaderCircle,
  RotateCw,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { downloadBlob } from "../export/studio-export";
import {
  PdfWorkbenchLoadError,
  buildMergedPdfBytes,
  buildSplitPdfFiles,
  inspectPdfSource,
} from "./pdf-workbench-engine";
import {
  addPdfSource,
  createPdfWorkbenchState,
  movePdfPage,
  movePdfPageTo,
  parsePdfPageRanges,
  removePdfPage,
  removePdfSource,
  rotatePdfPage,
  suggestPdfOutputName,
  type PdfWorkbenchPageEntry,
  type PdfWorkbenchState,
} from "./pdf-workbench-model";
import { renderPdfPageThumbnail } from "./pdf-workbench-thumbnails";

const THUMBNAIL_WIDTH = 220;

export function PdfWorkbenchPage() {
  const bt = useBilingual("PdfWorkbenchPage");
  const [wb, setWb] = useState<PdfWorkbenchState>(() => createPdfWorkbenchState());
  const [thumbs, setThumbs] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [adding, setAdding] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [splitSpec, setSplitSpec] = useState("");
  const [splitError, setSplitError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const bytesBySourceIdRef = useRef(new Map<string, Uint8Array>());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasPages = wb.pages.length > 0;
  const baseName = wb.sources[0]?.name ?? "워크벤치";

  // 보이는 순서대로 썸네일을 채운다. 캐시 키에 회전을 포함해 회전하면 다시 그린다.
  useEffect(() => {
    let cancelled = false;
    const missing = wb.pages.filter(
      (entry) => !thumbs.has(thumbnailKey(entry)),
    );
    if (missing.length === 0) return;
    void (async () => {
      for (const entry of missing) {
        if (cancelled) return;
        const bytes = bytesBySourceIdRef.current.get(entry.sourceId);
        if (!bytes) continue;
        try {
          const url = await renderPdfPageThumbnail({
            bytes,
            pageIndex: entry.sourcePageIndex,
            rotationDelta: entry.rotationDelta,
            targetWidth: THUMBNAIL_WIDTH,
          });
          if (cancelled) return;
          setThumbs((current) => new Map(current).set(thumbnailKey(entry), url));
        } catch {
          // 썸네일 실패는 카드 자리표시(파일 아이콘+페이지 번호)로 대체한다 — 작업 자체는 계속된다.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wb.pages, thumbs]);

  const addFiles = async (files: readonly File[]) => {
    const pdfFiles = files.filter(
      (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfFiles.length === 0) {
      setError(bt("PDF 파일을 선택해 주세요.", "Please choose PDF files."));
      return;
    }
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      for (const file of pdfFiles) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const inspected = await inspectPdfSource({
          id: "pending",
          name: file.name,
          bytes,
        });
        // 소스 id = 내용 지문. 같은 파일을 다시 넣으면 중복 추가를 막고 앵커 식별자와도 일치한다.
        const sourceId = inspected.fingerprint;
        if (bytesBySourceIdRef.current.has(sourceId)) {
          setNotice(bt(`이미 추가된 파일이에요: ${file.name}`, `Already added: ${file.name}`));
          continue;
        }
        bytesBySourceIdRef.current.set(sourceId, bytes);
        setWb((current) => addPdfSource(current, { ...inspected.source, id: sourceId }));
      }
    } catch (caught) {
      setError(
        caught instanceof PdfWorkbenchLoadError
          ? caught.message
          : bt("파일을 읽는 중 문제가 생겼어요. 다른 PDF로 시도해 주세요.", "Something went wrong while reading the file. Please try another PDF."),
      );
    } finally {
      setAdding(false);
    }
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (files.length > 0) void addFiles(files);
  };

  const onDropFiles = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) void addFiles(Array.from(event.dataTransfer.files));
  };

  const removeSource = (sourceId: string, name: string) => {
    bytesBySourceIdRef.current.delete(sourceId);
    setWb((current) => removePdfSource(current, sourceId));
    setNotice(bt(`${name}을(를) 워크벤치에서 뺐어요.`, `Removed ${name} from the workbench.`));
  };

  const clearAll = () => {
    bytesBySourceIdRef.current.clear();
    setThumbs(new Map());
    setWb(createPdfWorkbenchState());
    setSplitSpec("");
    setSplitError(null);
    setNotice(null);
  };

  const downloadMerged = async () => {
    setBuilding(true);
    setError(null);
    try {
      const bytes = await buildMergedPdfBytes({
        state: wb,
        bytesBySourceId: bytesBySourceIdRef.current,
        title: baseName.replace(/\.pdf$/iu, ""),
      });
      downloadBlob(
        toPdfBlob(bytes),
        suggestPdfOutputName(baseName, wb.sources.length > 1 ? "병합" : undefined),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : bt("PDF를 만들지 못했어요.", "Could not build the PDF."));
    } finally {
      setBuilding(false);
    }
  };

  const downloadSplit = async () => {
    const parsed = parsePdfPageRanges(splitSpec, wb.pages.length);
    if (!parsed.ok) {
      setSplitError(parsed.error);
      return;
    }
    setSplitError(null);
    setBuilding(true);
    setError(null);
    try {
      const files = await buildSplitPdfFiles({
        state: wb,
        bytesBySourceId: bytesBySourceIdRef.current,
        ranges: parsed.ranges,
        baseName,
      });
      for (const file of files) {
        downloadBlob(toPdfBlob(file.bytes), file.name);
      }
      setNotice(bt(`${files.length}개 파일로 나눠 내려받았어요.`, `Downloaded ${files.length} split files.`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : bt("PDF를 만들지 못했어요.", "Could not build the PDF."));
    } finally {
      setBuilding(false);
    }
  };

  const onCardDrop = (event: DragEvent, target: PdfWorkbenchPageEntry) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (!draggedId || draggedId === target.id) return;
    const targetIndex = wb.pages.findIndex((page) => page.id === target.id);
    if (targetIndex >= 0) setWb((current) => movePdfPageTo(current, draggedId, targetIndex));
  };

  return (
    <Container size="wide" className="space-y-6 break-keep py-6 sm:space-y-8 sm:py-10 lg:py-12">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
          {bt("발행 후단 작업", "After publishing")}
        </p>
        <h1 className="text-2xl font-bold sm:text-3xl">{bt("PDF 워크벤치", "PDF Workbench")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-fg-3 sm:text-base">
          {bt(
            "발행했거나 받은 PDF를 열어 페이지를 카드처럼 정리해요. 여러 파일을 하나로 합치고, 순서를 바꾸고, 필요한 범위만 나눠서 새 PDF로 내려받습니다. 모든 처리는 이 기기 안에서 끝나고 파일은 서버로 가지 않아요.",
            "Open published or received PDFs and arrange their pages like cards. Merge files, reorder pages, and download the result as a new PDF. Everything happens on this device — files never leave for a server.",
          )}
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-2xl border border-bad/40 bg-bad-soft px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-2xl border border-line bg-card px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}

      <section
        aria-label={bt("PDF 추가", "Add PDFs")}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDropFiles}
        className="rounded-3xl border border-dashed border-line bg-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            {adding ? <LoaderCircle className="animate-spin" size={22} aria-hidden="true" /> : <FileUp size={22} aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{bt("PDF를 끌어다 놓거나 골라서 추가", "Drop PDFs here or browse")}</p>
            <p className="text-sm text-fg-3">
              {bt("여러 개를 한 번에 넣으면 목록 끝부터 이어 붙어 하나의 문서처럼 다룰 수 있어요.", "Add several at once and they line up end to end, ready to merge.")}
            </p>
          </div>
          <button
            type="button"
            disabled={adding}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors disabled:opacity-50"
          >
            {bt("PDF 고르기", "Choose PDFs")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            aria-label={bt("PDF 파일 선택", "Select PDF files")}
            onChange={onFileInput}
          />
        </div>
        {wb.sources.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label={bt("추가된 파일", "Added files")}>
            {wb.sources.map((source) => (
              <li
                key={source.id}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-panel py-1.5 pl-3 pr-1.5 text-sm"
              >
                <FileText size={14} aria-hidden="true" className="shrink-0" />
                <span className="max-w-56 truncate">{source.name}</span>
                <span className="text-xs text-fg-3">
                  {source.pageCount}
                  {bt("페이지", " pages")}
                </span>
                <button
                  type="button"
                  onClick={() => removeSource(source.id, source.name)}
                  aria-label={bt(`${source.name} 빼기`, `Remove ${source.name}`)}
                  className="grid size-7 place-items-center rounded-full transition-colors hover:bg-accent-soft"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm transition-colors hover:bg-accent-soft"
              >
                <Trash2 size={14} aria-hidden="true" />
                {bt("전부 비우기", "Clear all")}
              </button>
            </li>
          </ul>
        ) : null}
      </section>

      {hasPages ? (
        <>
          <section aria-label={bt("페이지 목록", "Pages")}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {bt(`페이지 ${wb.pages.length}장`, `${wb.pages.length} pages`)}
              </h2>
              <p className="text-sm text-fg-3">
                {bt("카드를 드래그하거나 화살표 버튼으로 순서를 바꿔요.", "Drag cards or use the arrow buttons to reorder.")}
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {wb.pages.map((entry, index) => {
                const source = wb.sources.find((candidate) => candidate.id === entry.sourceId);
                const thumb = thumbs.get(thumbnailKey(entry));
                return (
                  <li
                    key={entry.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", entry.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDraggingId(entry.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => onCardDrop(event, entry)}
                    className={cn(
                      "group rounded-2xl border border-line bg-card p-2 shadow-sm transition-opacity",
                      draggingId === entry.id && "opacity-40",
                    )}
                  >
                    <div className="grid aspect-[3/4] place-items-center overflow-hidden rounded-xl bg-panel">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={bt(`${index + 1}번째 페이지 미리보기`, `Preview of page ${index + 1}`)}
                          className="h-full w-full object-contain"
                          draggable={false}
                        />
                      ) : (
                        <span className="grid place-items-center gap-1 text-fg-3">
                          <FileText size={28} aria-hidden="true" />
                          <span className="text-xs">{bt("미리보기 없음", "No preview")}</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-2 truncate px-1 text-xs text-fg-3" title={source?.name}>
                      {bt(
                        `${index + 1}. ${source?.name ?? ""} · 원본 ${entry.sourcePageIndex + 1}페이지`,
                        `${index + 1}. ${source?.name ?? ""} · original page ${entry.sourcePageIndex + 1}`,
                      )}
                      {entry.rotationDelta !== 0 ? ` · ${entry.rotationDelta}°` : ""}
                    </p>
                    <div className="mt-1 flex items-center justify-between px-0.5 pb-0.5">
                      <span className="flex gap-0.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => setWb((current) => movePdfPage(current, entry.id, -1))}
                          aria-label={bt(`${index + 1}번째 페이지를 앞으로`, `Move page ${index + 1} earlier`)}
                          className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-accent-soft disabled:opacity-30"
                        >
                          <ArrowLeft size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={index === wb.pages.length - 1}
                          onClick={() => setWb((current) => movePdfPage(current, entry.id, 1))}
                          aria-label={bt(`${index + 1}번째 페이지를 뒤로`, `Move page ${index + 1} later`)}
                          className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-accent-soft disabled:opacity-30"
                        >
                          <ArrowRight size={15} aria-hidden="true" />
                        </button>
                      </span>
                      <span className="flex gap-0.5">
                        <button
                          type="button"
                          onClick={() => setWb((current) => rotatePdfPage(current, entry.id, 1))}
                          aria-label={bt(`${index + 1}번째 페이지를 시계 방향으로 회전`, `Rotate page ${index + 1} clockwise`)}
                          className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-accent-soft"
                        >
                          <RotateCw size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setWb((current) => removePdfPage(current, entry.id))}
                          aria-label={bt(`${index + 1}번째 페이지를 목록에서 제거`, `Remove page ${index + 1} from the list`)}
                          className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-accent-soft"
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section
            aria-label={bt("내려받기", "Download")}
            className="grid gap-4 rounded-3xl border border-line bg-card p-5 sm:grid-cols-2 sm:p-6"
          >
            <div className="space-y-2">
              <h2 className="font-semibold">{bt("하나로 합쳐 내려받기", "Download merged")}</h2>
              <p className="text-sm text-fg-3">
                {bt("지금 보이는 순서 그대로 한 파일이 돼요.", "One file in exactly the order shown above.")}
              </p>
              <button
                type="button"
                disabled={building}
                onClick={() => void downloadMerged()}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors disabled:opacity-50"
              >
                {building ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                {bt("합친 PDF 내려받기", "Download merged PDF")}
              </button>
            </div>
            <div className="space-y-2">
              <h2 className="font-semibold">{bt("범위별로 나눠 내려받기", "Download by ranges")}</h2>
              <label htmlFor="pdf-workbench-split-spec" className="block text-sm text-fg-3">
                {bt("예: 1-3, 5 — 범위마다 파일이 하나씩 생겨요.", "Example: 1-3, 5 — one file per range.")}
              </label>
              <div className="flex gap-2">
                <input
                  id="pdf-workbench-split-spec"
                  type="text"
                  inputMode="numeric"
                  value={splitSpec}
                  onChange={(event) => setSplitSpec(event.target.value)}
                  placeholder="1-3, 5"
                  aria-invalid={splitError ? true : undefined}
                  aria-describedby={splitError ? "pdf-workbench-split-error" : undefined}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm"
                />
                <button
                  type="button"
                  disabled={building}
                  onClick={() => void downloadSplit()}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-accent-soft disabled:opacity-50"
                >
                  <Scissors size={16} aria-hidden="true" />
                  {bt("나눠 받기", "Split")}
                </button>
              </div>
              {splitError ? (
                <p id="pdf-workbench-split-error" role="alert" className="text-sm text-bad">
                  {splitError}
                </p>
              ) : null}
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-3xl border border-line bg-card px-5 py-10 text-center sm:py-14">
          <FileText className="mx-auto text-fg-3" size={32} aria-hidden="true" />
          <p className="mt-3 font-semibold">{bt("아직 추가한 PDF가 없어요", "No PDFs added yet")}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-fg-3">
            {bt(
              "단행본 발행 파일이나 검수용 PDF를 넣으면 여기에서 페이지를 눈으로 확인하며 정리할 수 있어요.",
              "Add a published book file or a review PDF to arrange its pages visually.",
            )}
          </p>
        </section>
      )}
    </Container>
  );
}

function thumbnailKey(entry: PdfWorkbenchPageEntry): string {
  return `${entry.id}@${entry.rotationDelta}`;
}

/** BlobPart가 요구하는 ArrayBuffer 소유 복사본으로 감싼다 (studio-pdf-export와 같은 관용구). */
function toPdfBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Blob([copy], { type: "application/pdf" });
}
