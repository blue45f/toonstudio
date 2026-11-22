/**
 * 화수 발행 연동 ₩0 마케팅·출판 패키지 패널 (Calm Atelier · 100% 브라우저 로컬).
 *
 * 1) X/인스타/블로그 공유용 OG 1200×630 3컷 미리보기 카드 (SVG · PNG Canvas 다운로드)
 * 2) 단행본 인쇄 규격(신국판·A5·B6, 쪽수·평량 기반 spineMm 자동 계산, 3mm 재단선 bleed + 앞/책등/뒤 안전선 SVG)
 * StudioExportPanel(출고·발행 진입점)에서 지연 마운트된다.
 */
import { AlertTriangle, BookOpen, Copy, Download, ImagePlus, Share2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  buildSocialShareSnippets,
  createDefaultOgMarketingInput,
  OG_CARD_HEIGHT,
  OG_CARD_THEME_IDS,
  OG_CARD_THEMES,
  OG_CARD_WIDTH,
  renderOgCardSvg,
  renderOgCardToCanvas,
  type OgCardThemeId,
  type OgMarketingCardInput,
} from "./og-card-renderer";
import {
  PRINT_BOOK_FORMAT_IDS,
  PRINT_BOOK_FORMATS,
  PRINT_DEFAULT_BLEED_MM,
  PRINT_MAX_PAGES,
  PRINT_MIN_PAGES,
  PRINT_PAPER_STOCK_IDS,
  PRINT_PAPER_STOCKS,
  renderPrintCoverTemplateSvg,
  type PrintBindingType,
  type PrintBookFormatId,
  type PrintPaperStockId,
} from "./print-cover-template-engine";

export interface StudioPublishMarketingPackPanelProps {
  readonly projectId: string;
  readonly seriesTitle?: string;
  readonly episodeNumber?: number;
}

type MarketingPackTabId = "og-card" | "print-cover";

const INPUT_CLASS =
  "mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const PAGE_COUNT_PRESETS = [160, 200, 240, 320] as const;

function triggerDownload(filename: string, content: BlobPart, mimeType: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function StudioPublishMarketingPackPanel({
  projectId,
  seriesTitle = "밤의 우편배달부",
  episodeNumber = 12,
}: StudioPublishMarketingPackPanelProps) {
  const [activeTab, setActiveTab] = useState<MarketingPackTabId>("og-card");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Tab 1: OG 1200×630 공유 카드 상태
  const [ogInput, setOgInput] = useState<OgMarketingCardInput>(() =>
    createDefaultOgMarketingInput(seriesTitle, episodeNumber),
  );

  // Tab 2: 단행본 인쇄 규격 표지 상태
  const [formatId, setFormatId] = useState<PrintBookFormatId>("shinguk");
  const [pageCount, setPageCount] = useState<number>(240);
  const [paperStockId, setPaperStockId] = useState<PrintPaperStockId>("art-100");
  const [binding, setBinding] = useState<PrintBindingType>("perfect-soft");
  const [bleedMm, setBleedMm] = useState<number>(PRINT_DEFAULT_BLEED_MM);
  const [bookTitle, setBookTitle] = useState<string>(seriesTitle);
  const [volumeLabel, setVolumeLabel] = useState<string>("1권");
  const [bookAuthor, setBookAuthor] = useState<string>("스튜디오 작가");
  const [publisherName, setPublisherName] = useState<string>("1인 독립출판");

  const ogArtifact = useMemo(() => renderOgCardSvg(ogInput), [ogInput]);
  const shareSnippets = useMemo(
    () =>
      buildSocialShareSnippets(
        ogInput,
        `https://toonstudio.kr/work/${encodeURIComponent(projectId)}`,
      ),
    [ogInput, projectId],
  );

  const printArtifact = useMemo(
    () =>
      renderPrintCoverTemplateSvg({
        formatId,
        pageCount,
        paperStockId,
        binding,
        bleedMm,
        bookTitle,
        volumeLabel,
        authorName: bookAuthor,
        publisherName,
      }),
    [binding, bleedMm, bookAuthor, bookTitle, formatId, pageCount, paperStockId, publisherName, volumeLabel],
  );

  const updateCutSlot = (
    slotIndex: 0 | 1 | 2,
    patch: { readonly cutLabel?: string; readonly captionKo?: string; readonly imageDataUrl?: string | null },
  ) => {
    setOgInput((prev) => {
      const next: [
        OgMarketingCardInput["cuts"][0],
        OgMarketingCardInput["cuts"][1],
        OgMarketingCardInput["cuts"][2],
      ] = [prev.cuts[0], prev.cuts[1], prev.cuts[2]];
      next[slotIndex] = { ...next[slotIndex], ...patch };
      return { ...prev, cuts: next };
    });
  };

  const handleUploadCutImage = (slotIndex: 0 | 1 | 2, file: File | null) => {
    if (!file || typeof FileReader === "undefined") return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        updateCutSlot(slotIndex, { imageDataUrl: reader.result });
        setStatusMessage(`미리보기 ${slotIndex + 1}번 컷 이미지를 로컬로 불러왔어요.`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadOgSvg = () => {
    triggerDownload(
      `${projectId}-ep${ogInput.episodeNumber}-og-1200x630.svg`,
      ogArtifact.svgMarkup,
      "image/svg+xml;charset=utf-8",
    );
    setStatusMessage("OG 1200×630 공유 카드 SVG를 기기에 저장했어요.");
  };

  const handleDownloadOgPng = () => {
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    const rendered = renderOgCardToCanvas(canvas, ogInput);
    if (!rendered || typeof canvas.toBlob !== "function") {
      handleDownloadOgSvg();
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        handleDownloadOgSvg();
        return;
      }
      triggerDownload(
        `${projectId}-ep${ogInput.episodeNumber}-og-1200x630.png`,
        blob,
        "image/png",
      );
      setStatusMessage("OG 1200×630 공유 카드 PNG를 기기에 저장했어요.");
    }, "image/png");
  };

  const handleCopySnippet = async (label: string, text: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setStatusMessage(`${label} 문구를 클립보드에 복사했어요.`);
        return;
      }
    } catch {
      // 클립보드 차단 환경 대응
    }
    setStatusMessage(`${label} 문구를 아래 미리보기에서 선택해 복사할 수 있어요.`);
  };

  const handleDownloadPrintSvg = () => {
    triggerDownload(
      `${projectId}-${formatId}-${printArtifact.spec.normalizedPageCount}p-spine-${printArtifact.spec.spineMm}mm-cover.svg`,
      printArtifact.svgMarkup,
      "image/svg+xml;charset=utf-8",
    );
    setStatusMessage(
      `단행본 표지 가이드 SVG(책등 ${printArtifact.spec.spineMm}mm · 재단선 ${bleedMm}mm)를 저장했어요.`,
    );
  };

  const handleDownloadPrintSpecJson = () => {
    triggerDownload(
      `${projectId}-${formatId}-print-spec.json`,
      JSON.stringify(printArtifact.spec, null, 2),
      "application/json;charset=utf-8",
    );
    setStatusMessage("단행본 인쇄 규격 사양서 JSON을 저장했어요.");
  };

  const { spec } = printArtifact;

  return (
    <section
      aria-label="화수 발행 연동 마케팅 및 단행본 표지 패키지"
      data-testid="publish-marketing-pack-panel"
      className="mt-3 space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            ₩0 마케팅 · 1인 출판 패키지 · 100% 로컬
          </p>
          <h3 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            OG 1200×630 공유 카드 &amp; 단행본 재단선 표지 템플릿
          </h3>
          <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            화수 발행 직후 X·인스타·블로그 홍보 카드와 신국판·A5·B6 인쇄소 입고용 표지 가이드(책등 폭 자동 계산)를 무료로 뽑아 씁니다.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="마케팅·출판 도구 전환"
          className="flex flex-wrap gap-2"
        >
          <button
            type="button"
            role="tab"
            id="marketing-tab-og"
            aria-selected={activeTab === "og-card"}
            aria-controls="marketing-panel-og"
            data-testid="marketing-pack-tab-og"
            onClick={() => setActiveTab("og-card")}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3.5 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              activeTab === "og-card"
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
            }`}
          >
            <Share2 size={14} aria-hidden="true" />
            OG 1200×630 공유 카드
          </button>
          <button
            type="button"
            role="tab"
            id="marketing-tab-print"
            aria-selected={activeTab === "print-cover"}
            aria-controls="marketing-panel-print"
            data-testid="marketing-pack-tab-print"
            onClick={() => setActiveTab("print-cover")}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3.5 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              activeTab === "print-cover"
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
            }`}
          >
            <BookOpen size={14} aria-hidden="true" />
            단행본 재단선 표지
          </button>
        </div>
      </header>

      {/* TAB 1: OG 1200×630 3컷 공유 카드 */}
      {activeTab === "og-card" ? (
        <div
          id="marketing-panel-og"
          role="tabpanel"
          aria-labelledby="marketing-tab-og"
          className="space-y-4"
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            {/* 실시간 1200×630 SVG 미리보기 */}
            <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-fg tabular-nums">
                  실시간 미리보기 ({OG_CARD_WIDTH} × {OG_CARD_HEIGHT} px)
                </span>
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-fg-2">
                  <input
                    type="checkbox"
                    checked={Boolean(ogInput.showSafeGuide)}
                    onChange={(event) =>
                      setOgInput((prev) => ({ ...prev, showSafeGuide: event.target.checked }))
                    }
                    className="size-4 cursor-pointer accent-[var(--color-accent)]"
                  />
                  안전 크롭선 표시
                </label>
              </div>
              <div className="overflow-hidden rounded-xl border border-line bg-canvas">
                <img
                  src={ogArtifact.svgDataUrl}
                  alt={`${ogInput.seriesTitle} ${ogInput.episodeNumber}화 OG 1200×630 3컷 미리보기`}
                  data-testid="og-card-preview-img"
                  className="block aspect-[1200/630] w-full object-contain"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="og-download-svg-btn"
                  onClick={handleDownloadOgSvg}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Download size={14} aria-hidden="true" />
                  OG SVG 저장
                </button>
                <button
                  type="button"
                  data-testid="og-download-png-btn"
                  onClick={handleDownloadOgPng}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-4 text-xs font-semibold text-fg transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Download size={14} aria-hidden="true" />
                  OG PNG (1200×630) 저장
                </button>
              </div>
            </div>

            {/* 카드 문구 · 테마 · 3컷 슬롯 편집 */}
            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="OG 카드 테마 선택">
                {OG_CARD_THEME_IDS.map((themeId: OgCardThemeId) => (
                  <button
                    key={themeId}
                    type="button"
                    aria-pressed={ogInput.theme === themeId}
                    onClick={() => setOgInput((prev) => ({ ...prev, theme: themeId }))}
                    className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      ogInput.theme === themeId
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-panel text-fg-2 hover:text-fg"
                    }`}
                  >
                    {OG_CARD_THEMES[themeId].labelKo}
                  </button>
                ))}
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-fg-2">
                  작품명
                  <input
                    value={ogInput.seriesTitle}
                    onChange={(event) =>
                      setOgInput((prev) => ({ ...prev, seriesTitle: event.target.value }))
                    }
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="block text-xs font-semibold text-fg-2">
                  화수 번호
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={ogInput.episodeNumber}
                    onChange={(event) => {
                      const nextEp = Math.max(1, Number(event.target.value) || 1);
                      setOgInput((prev) => ({
                        ...prev,
                        episodeNumber: nextEp,
                        ctaLabel: `지금 ${nextEp}화 바로 읽기 →`,
                      }));
                    }}
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold text-fg-2">
                이번 화 한 줄 훅
                <input
                  value={ogInput.episodeSubtitle}
                  onChange={(event) =>
                    setOgInput((prev) => ({ ...prev, episodeSubtitle: event.target.value }))
                  }
                  className={INPUT_CLASS}
                />
              </label>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-fg-2">
                  작가명
                  <input
                    value={ogInput.authorName}
                    onChange={(event) =>
                      setOgInput((prev) => ({ ...prev, authorName: event.target.value }))
                    }
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="block text-xs font-semibold text-fg-2">
                  연재 주기·플랫폼 배지
                  <input
                    value={ogInput.scheduleBadge}
                    onChange={(event) =>
                      setOgInput((prev) => ({ ...prev, scheduleBadge: event.target.value }))
                    }
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              {/* 3컷 슬롯 캡션 및 로컬 이미지 연결 */}
              <div className="space-y-2 border-t border-line pt-2.5">
                <span className="block text-xs font-bold text-fg">3컷 미리보기 슬롯</span>
                {([0, 1, 2] as const).map((idx) => {
                  const slot = ogInput.cuts[idx];
                  return (
                    <div
                      key={slot.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2"
                    >
                      <input
                        aria-label={`${idx + 1}번 컷 한 줄 대사`}
                        value={slot.captionKo}
                        onChange={(event) => updateCutSlot(idx, { captionKo: event.target.value })}
                        className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 text-xs text-fg outline-none focus:border-accent"
                      />
                      <label className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:border-line-strong hover:text-fg">
                        <ImagePlus size={14} aria-hidden="true" />
                        <span>{slot.imageDataUrl ? "컷 교체" : "컷 넣기"}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) =>
                            handleUploadCutImage(idx, event.target.files?.[0] ?? null)
                          }
                          className="sr-only"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 채널별 공유 문구 복사 */}
          <div className="grid gap-2.5 md:grid-cols-3">
            {(
              [
                { id: "x", label: "X(트위터) 홍보 문구", value: shareSnippets.xPostText },
                { id: "ig", label: "인스타그램 본문·해시태그", value: shareSnippets.instagramCaption },
                { id: "blog", label: "블로그 OG 메타 태그", value: shareSnippets.blogOgMetaHtml },
              ] as const
            ).map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between gap-2 rounded-xl border border-line bg-card p-3"
              >
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-fg">{item.label}</h4>
                  <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-panel p-2 font-mono text-xs text-fg-2">
                    {item.value}
                  </pre>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopySnippet(item.label, item.value)}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Copy size={13} aria-hidden="true" />
                  복사하기
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* TAB 2: 단행본 인쇄 규격 표지 템플릿 */
        <div
          id="marketing-panel-print"
          role="tabpanel"
          aria-labelledby="marketing-tab-print"
          className="space-y-4"
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            {/* 실시간 앞/책등/뒤 표지 재단선 가이드 SVG 미리보기 */}
            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-fg">
                  펼침면 재단선 가이드 (뒤표지 · 책등 · 앞표지)
                </span>
                <span
                  data-testid="print-cover-spine-badge"
                  className="rounded-lg border border-accent/45 bg-accent-soft px-2.5 py-1 text-xs font-bold tabular-nums text-accent"
                >
                  책등 폭 {spec.spineMm} mm
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-line bg-canvas p-2">
                <img
                  src={printArtifact.svgDataUrl}
                  alt={`${bookTitle} ${volumeLabel} 단행본 앞·책등·뒤 재단선 표지 템플릿`}
                  data-testid="print-cover-preview-img"
                  className="block max-h-80 w-full object-contain"
                />
              </div>

              {/* 인쇄소 입고 규격 KPI */}
              <dl
                data-testid="print-cover-spec-metrics"
                className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
              >
                <div className="rounded-lg border border-line bg-panel px-2.5 py-2">
                  <dt className="text-xs text-fg-3">책등 폭 (spineMm)</dt>
                  <dd className="mt-0.5 text-sm font-bold tabular-nums text-accent">
                    {spec.spineMm} mm
                  </dd>
                </div>
                <div className="rounded-lg border border-line bg-panel px-2.5 py-2">
                  <dt className="text-xs text-fg-3">전체 펼침면 (Bleed 포함)</dt>
                  <dd className="mt-0.5 text-sm font-bold tabular-nums text-fg">
                    {spec.totalWidthMm} × {spec.totalHeightMm} mm
                  </dd>
                </div>
                <div className="rounded-lg border border-line bg-panel px-2.5 py-2">
                  <dt className="text-xs text-fg-3">300 DPI 작업 픽셀</dt>
                  <dd className="mt-0.5 text-sm font-bold tabular-nums text-fg">
                    {spec.totalWidthPx300} × {spec.totalHeightPx300} px
                  </dd>
                </div>
                <div className="rounded-lg border border-line bg-panel px-2.5 py-2">
                  <dt className="text-xs text-fg-3">재단선 / 안전선</dt>
                  <dd className="mt-0.5 text-sm font-bold tabular-nums text-good">
                    {spec.bleedMm}mm / {spec.safeMarginMm}mm
                  </dd>
                </div>
              </dl>

              {spec.warningsKo.length > 0 ? (
                <ul className="space-y-1 rounded-xl border border-warn/45 bg-warn/10 p-3 text-xs text-warn">
                  {spec.warningsKo.map((msg) => (
                    <li key={msg} className="flex items-start gap-1.5 [word-break:keep-all]">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>{msg}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="print-download-svg-btn"
                  onClick={handleDownloadPrintSvg}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Download size={14} aria-hidden="true" />
                  인쇄 표지 가이드 SVG 저장
                </button>
                <button
                  type="button"
                  data-testid="print-download-json-btn"
                  onClick={handleDownloadPrintSpecJson}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-4 text-xs font-semibold text-fg transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Download size={14} aria-hidden="true" />
                  인쇄 사양서 JSON 저장
                </button>
              </div>
            </div>

            {/* 단행본 판형 · 쪽수 · 평량 · 제본 입력 */}
            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="space-y-1.5">
                <span className="block text-xs font-bold text-fg">단행본 판형 선택</span>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="단행본 판형">
                  {PRINT_BOOK_FORMAT_IDS.map((id) => {
                    const fmt = PRINT_BOOK_FORMATS[id];
                    const selected = formatId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        data-testid={`print-format-${id}`}
                        onClick={() => setFormatId(id)}
                        className={`flex min-h-11 flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          selected
                            ? "border-accent bg-accent-soft text-fg"
                            : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg"
                        }`}
                      >
                        <span className="text-xs font-bold text-fg">{fmt.labelKo}</span>
                        <span className="text-xs text-fg-3">{fmt.useCaseKo}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-fg-2">
                  본문 총 쪽수 ({PRINT_MIN_PAGES}~{PRINT_MAX_PAGES}쪽)
                  <input
                    data-testid="print-page-count-input"
                    type="number"
                    min={PRINT_MIN_PAGES}
                    max={PRINT_MAX_PAGES}
                    step={2}
                    value={pageCount}
                    onChange={(event) => setPageCount(Number(event.target.value) || 200)}
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="block text-xs font-semibold text-fg-2">
                  내지 종이 평량
                  <select
                    data-testid="print-paper-stock-select"
                    value={paperStockId}
                    onChange={(event) => {
                      const next = PRINT_PAPER_STOCK_IDS.find((id) => id === event.target.value);
                      if (next) setPaperStockId(next);
                    }}
                    className={INPUT_CLASS}
                  >
                    {PRINT_PAPER_STOCK_IDS.map((id) => (
                      <option key={id} value={id}>
                        {PRINT_PAPER_STOCKS[id].labelKo} ({PRINT_PAPER_STOCKS[id].caliperMmPerSheet}mm/장)
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-1.5" role="group" aria-label="빠른 쪽수 프리셋">
                {PAGE_COUNT_PRESETS.map((pages) => (
                  <button
                    key={pages}
                    type="button"
                    aria-pressed={pageCount === pages}
                    onClick={() => setPageCount(pages)}
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      pageCount === pages
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-panel text-fg-2 hover:text-fg"
                    }`}
                  >
                    {pages}쪽
                  </button>
                ))}
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-fg-2">
                  제본 방식
                  <select
                    value={binding}
                    onChange={(event) => {
                      const val = event.target.value;
                      if (val === "perfect-soft" || val === "hardcover") setBinding(val);
                    }}
                    className={INPUT_CLASS}
                  >
                    <option value="perfect-soft">무선제본 (소프트커버 +0.6mm)</option>
                    <option value="hardcover">양장제본 (하드커버 +4.0mm)</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-fg-2">
                  재단선 여분 (Bleed)
                  <select
                    value={bleedMm}
                    onChange={(event) => setBleedMm(Number(event.target.value) || 3)}
                    className={INPUT_CLASS}
                  >
                    <option value={3}>3mm (한국 인쇄소 표준)</option>
                    <option value={5}>5mm (여유 재단선)</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-fg-2">
                  단행본 제목
                  <input
                    value={bookTitle}
                    onChange={(event) => setBookTitle(event.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="block text-xs font-semibold text-fg-2">
                  권수 표기
                  <input
                    value={volumeLabel}
                    onChange={(event) => setVolumeLabel(event.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-fg-2">
                  저자명
                  <input
                    value={bookAuthor}
                    onChange={(event) => setBookAuthor(event.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="block text-xs font-semibold text-fg-2">
                  출판사 / 임프린트
                  <input
                    value={publisherName}
                    onChange={(event) => setPublisherName(event.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {statusMessage ? (
        <p
          role="status"
          data-testid="publish-marketing-pack-status"
          className="rounded-lg border border-good/35 bg-good/10 px-3 py-2 text-xs font-semibold text-good"
        >
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
