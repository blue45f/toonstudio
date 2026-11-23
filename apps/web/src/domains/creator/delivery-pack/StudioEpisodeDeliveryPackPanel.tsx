/**
 * 화수 일괄 납품 패키지 패널 (네이버·카카오·레진·글로벌 규격 자동 슬라이스 + Rights BOM 증명서).
 *
 * 프로젝트의 실제 웹툰 원고 문서와 워크스페이스 소재 상태를 바탕으로 플랫폼별 안전 절단선과
 * 파일명(`EP01_001.jpg`)을 계산하고, Rights BOM 상업 라이선스 검증을 통과한 경우에만
 * `RIGHTS-BOM-CERTIFICATE.md`, `delivery-manifest.json`, ZIP 패키지를 내려받을 수 있게 한다.
 */

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  FileJson2,
  FileText,
  Scissors,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useId, useMemo, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { readStudioProjectLibrary } from "../studio-project-library-reader";
import { useStudioProjectDocuments } from "../studio-shell/useStudioProjectDocuments";
import { useStudioProjectWorkspace } from "../studio-shell/useStudioProjectWorkspace";
import {
  buildEpisodeDeliveryPack,
  createEpisodeDeliveryPackZip,
  DELIVERY_MANIFEST_PATH,
  RIGHTS_BOM_CERTIFICATE_PATH,
} from "./delivery-pack-bundler";
import { DeliveryRightsBomSection } from "./DeliveryRightsBomSection";
import {
  DeliverySlicePreviewSection,
  type EditableProtectedZone,
} from "./DeliverySlicePreviewSection";
import {
  DELIVERY_IMAGE_FORMATS,
  DELIVERY_PLATFORM_IDS,
  DELIVERY_PLATFORM_SPECS,
  type DeliveryImageFormat,
  type DeliveryPlatformId,
} from "./platform-delivery-specs";
import {
  mapWorkspaceDiagnosticAssetsToDeliveryBom,
  type DeliveryBomLicenseStatus,
  type DeliveryRightsBomAsset,
} from "./rights-bom-validator";
import type { DeliveryProtectedZone, EpisodeSliceInput } from "./safe-slice-planner";

export interface DeliveryPackDownloadPayload {
  readonly fileName: string;
  readonly content: string | Uint8Array;
  readonly mimeType: string;
}

export interface StudioEpisodeDeliveryPackPanelProps {
  readonly projectId: string;
  readonly locale: "ko" | "en";
  readonly generatedAt?: string;
  readonly onDownloadFile?: (payload: DeliveryPackDownloadPayload) => void;
}

const INPUT_CLASS =
  "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-line bg-card px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

function triggerBrowserDownload(payload: DeliveryPackDownloadPayload): void {
  if (typeof window === "undefined") return;
  const blobPart: BlobPart =
    typeof payload.content === "string" ? payload.content : new Uint8Array(payload.content);
  const blob = new Blob([blobPart], { type: payload.mimeType });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = payload.fileName;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(href);
}

function readSeriesTitle(projectId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return (
      readStudioProjectLibrary(window.localStorage).projects.find((item) => item.id === projectId)
        ?.title ?? ""
    );
  } catch {
    return "";
  }
}

function formatMbLabel(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parsePositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultLicenseCodeForStatus(status: DeliveryBomLicenseStatus): string {
  switch (status) {
    case "commercial-allowed":
      return "COMMERCIAL-CLEARED";
    case "commercial-attribution":
      return "CC-BY-4.0";
    case "non-commercial":
      return "CC-BY-NC-4.0";
    case "restricted":
      return "RESTRICTED";
    case "unknown":
      return "";
  }
}

export function StudioEpisodeDeliveryPackPanel({
  projectId,
  locale,
  generatedAt,
  onDownloadFile,
}: StudioEpisodeDeliveryPackPanelProps) {
  const bt = useBilingual("StudioEpisodeDeliveryPackPanel");
  const headingId = useId();
  const workspace = useStudioProjectWorkspace(projectId, locale);
  const documents = useStudioProjectDocuments(projectId, locale, "active");

  const [seriesTitle, setSeriesTitle] = useState<string>(() => readSeriesTitle(projectId));
  const [authorName, setAuthorName] = useState<string>("");
  const [platformId, setPlatformId] = useState<DeliveryPlatformId>("naver_webtoon");
  const [format, setFormat] = useState<DeliveryImageFormat>("jpg");
  const [episodeNumber, setEpisodeNumber] = useState<number>(1);
  const [customWidthPx, setCustomWidthPx] = useState<number | null>(null);
  const [customHeightPx, setCustomHeightPx] = useState<number | null>(null);

  const [protectedZones, setProtectedZones] = useState<readonly EditableProtectedZone[]>([]);
  const [customAssets, setCustomAssets] = useState<readonly DeliveryRightsBomAsset[]>([]);
  const [assetOverrides, setAssetOverrides] = useState<
    Readonly<
      Record<
        string,
        Partial<Pick<DeliveryRightsBomAsset, "licenseStatus" | "licenseCode" | "attributionText">>
      >
    >
  >({});

  const [defaultGeneratedAt] = useState<string>(() => new Date().toISOString());
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const webtoonDocs = useMemo(
    () =>
      documents.documents
        .filter(
          (doc) =>
            (doc.kind === "webtoon" || doc.defaultWorkspace === "comic") &&
            doc.width !== null &&
            doc.height !== null &&
            doc.width > 0 &&
            doc.height > 0,
        )
        .sort(
          (left, right) =>
            Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
            left.title.localeCompare(right.title) ||
            left.id.localeCompare(right.id),
        ),
    [documents.documents],
  );

  const activeSourceWidth = customWidthPx ?? webtoonDocs[0]?.width ?? 800;
  const activeSourceHeight = customHeightPx ?? webtoonDocs[0]?.height ?? 4800;

  const episodesInput = useMemo<readonly EpisodeSliceInput[]>(() => {
    const zoneInputs: readonly DeliveryProtectedZone[] = protectedZones.map((zone) => ({
      id: zone.id,
      kind: zone.kind,
      topY: zone.topY,
      bottomY: zone.bottomY,
    }));

    if (webtoonDocs.length > 1 && customWidthPx === null && customHeightPx === null) {
      return webtoonDocs.map((doc, idx) => ({
        episodeNumber: episodeNumber + idx,
        episodeTitle: doc.title,
        sourceWidthPx: doc.width ?? 800,
        sourceHeightPx: doc.height ?? 4800,
        protectedZones: idx === 0 ? zoneInputs : [],
      }));
    }

    return [
      {
        episodeNumber,
        episodeTitle: webtoonDocs[0]?.title ?? `${episodeNumber}화`,
        sourceWidthPx: activeSourceWidth,
        sourceHeightPx: activeSourceHeight,
        protectedZones: zoneInputs,
      },
    ];
  }, [
    activeSourceHeight,
    activeSourceWidth,
    customHeightPx,
    customWidthPx,
    episodeNumber,
    protectedZones,
    webtoonDocs,
  ]);

  const customAssetIds = useMemo(
    () => new Set(customAssets.map((item) => item.id)),
    [customAssets],
  );

  const combinedAssets = useMemo<readonly DeliveryRightsBomAsset[]>(() => {
    const workspaceAssets = mapWorkspaceDiagnosticAssetsToDeliveryBom(workspace.state?.assets ?? []);
    return [...workspaceAssets, ...customAssets].map((asset) => {
      const override = assetOverrides[asset.id];
      if (!override) return asset;
      const nextStatus = override.licenseStatus ?? asset.licenseStatus;
      return {
        ...asset,
        licenseStatus: nextStatus,
        licenseCode: override.licenseCode ?? asset.licenseCode,
        requiresAttribution:
          nextStatus === "commercial-attribution" ? true : asset.requiresAttribution,
        attributionText:
          override.attributionText !== undefined ? override.attributionText : asset.attributionText,
      };
    });
  }, [assetOverrides, customAssets, workspace.state?.assets]);

  const packResult = useMemo(
    () =>
      buildEpisodeDeliveryPack({
        projectId,
        seriesTitle: seriesTitle.trim() || bt("내 웹툰", "Untitled Webtoon"),
        authorName: authorName.trim() || bt("ToonStudio 창작자", "ToonStudio Creator"),
        platformId,
        format,
        episodes: episodesInput,
        rightsBomAssets: combinedAssets,
        generatedAt: generatedAt ?? defaultGeneratedAt,
      }),
    [
      authorName,
      bt,
      combinedAssets,
      defaultGeneratedAt,
      episodesInput,
      format,
      generatedAt,
      platformId,
      projectId,
      seriesTitle,
    ],
  );

  const selectedSpec = DELIVERY_PLATFORM_SPECS[platformId];
  const deliverDownload = onDownloadFile ?? triggerBrowserDownload;
  const primaryEpisode = packResult.batchPlan.episodes[0] ?? null;

  const handleDownloadCertificate = (): void => {
    if (!packResult.ok) return;
    setDownloadError(null);
    deliverDownload({
      fileName: RIGHTS_BOM_CERTIFICATE_PATH,
      content: packResult.certificateMarkdown,
      mimeType: "text/markdown;charset=utf-8",
    });
    setDownloadStatus(
      bt(
        "Rights BOM 상업 납품 증명서(RIGHTS-BOM-CERTIFICATE.md)를 내려받았습니다.",
        "Downloaded RIGHTS-BOM-CERTIFICATE.md.",
      ),
    );
  };

  const handleDownloadManifest = (): void => {
    if (!packResult.ok) return;
    setDownloadError(null);
    deliverDownload({
      fileName: DELIVERY_MANIFEST_PATH,
      content: packResult.manifestJson,
      mimeType: "application/json;charset=utf-8",
    });
    setDownloadStatus(
      bt(
        "납품 매니페스트(delivery-manifest.json)를 내려받았습니다.",
        "Downloaded delivery-manifest.json.",
      ),
    );
  };

  const handleDownloadZip = (): void => {
    if (!packResult.ok) return;
    try {
      const zipBytes = createEpisodeDeliveryPackZip(packResult);
      const fileName = `${projectId}-${platformId}-delivery-pack.zip`;
      deliverDownload({
        fileName,
        content: zipBytes,
        mimeType: "application/zip",
      });
      setDownloadError(null);
      setDownloadStatus(
        bt(
          `${selectedSpec.labelKo} 납품 패키지 ZIP(${fileName})을 생성해 내려받았습니다.`,
          `Generated and downloaded ${fileName}.`,
        ),
      );
    } catch (cause) {
      setDownloadError(
        cause instanceof Error
          ? cause.message
          : bt("납품 ZIP 생성에 실패했습니다.", "Failed to generate delivery ZIP."),
      );
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      data-testid="studio-episode-delivery-pack-panel"
      className="min-w-0 rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-accent">
            <Scissors size={14} aria-hidden="true" />
            {bt("화수 일괄 납품 패키지 · RIGHTS BOM", "EPISODE DELIVERY PACK · RIGHTS BOM")}
          </p>
          <h2 id={headingId} className="mt-1.5 text-xl font-extrabold tracking-tight text-fg">
            {bt(
              "플랫폼 규격 자동 슬라이스 및 상업 라이선스 증명서 번들",
              "Platform Auto-Slicer & Commercial Rights BOM Bundler",
            )}
          </h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-fg-2">
            {bt(
              "네이버·카카오·레진·글로벌 규격에 맞춰 말풍선과 얼굴을 피해 절단선을 계산하고, 상업 불가·출처 누락 소재가 없을 때만 납품 증명서와 ZIP 매니페스트를 발급합니다.",
              "Calculates safe cut lines avoiding speech bubbles and faces for Naver, Kakao, Lezhin, and Global Webtoon, and issues the certificate and ZIP manifest only when Rights BOM clears.",
            )}
          </p>
        </div>

        <span
          data-testid="delivery-pack-gate-badge"
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-bold",
            packResult.ok
              ? "border-good/35 bg-good/10 text-good"
              : "border-bad/40 bg-bad/10 text-bad",
          )}
        >
          {packResult.ok ? (
            <ShieldCheck size={16} aria-hidden="true" />
          ) : (
            <ShieldAlert size={16} aria-hidden="true" />
          )}
          {packResult.ok
            ? bt("상업 납품 통과 (CLEARED)", "Cleared for delivery")
            : bt(
                `납품 차단 (${packResult.blockReasons.length}건)`,
                `Blocked (${packResult.blockReasons.length})`,
              )}
        </span>
      </div>

      <div
        role="group"
        aria-label={bt("납품 플랫폼 규격 선택", "Select delivery platform spec")}
        className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        {DELIVERY_PLATFORM_IDS.map((candidateId) => {
          const spec = DELIVERY_PLATFORM_SPECS[candidateId];
          const active = candidateId === platformId;
          return (
            <button
              key={candidateId}
              type="button"
              aria-pressed={active}
              data-testid={`delivery-platform-${candidateId}`}
              onClick={() => setPlatformId(candidateId)}
              className={cn(
                "min-h-11 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
                active
                  ? "border-accent bg-accent-soft/45 text-fg"
                  : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              <span className="block text-sm font-bold text-fg">
                {bt(spec.labelKo, spec.labelEn)}
              </span>
              <span className="mt-1 block text-xs text-fg-3">
                {`${spec.targetWidthPx} × ${spec.maxSliceHeightPx}px · ${spec.fileNamePattern}`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-line bg-panel/45 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-bold text-fg-2">
          {bt("작품명", "Series title")}
          <input
            type="text"
            value={seriesTitle}
            placeholder={bt("예: 달빛 편의점", "e.g. Midnight Store")}
            onChange={(event) => setSeriesTitle(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className="text-xs font-bold text-fg-2">
          {bt("시작 화수", "Start episode")}
          <input
            type="number"
            min={1}
            value={episodeNumber}
            onChange={(event) => setEpisodeNumber(parsePositiveInt(event.target.value, 1))}
            className={INPUT_CLASS}
          />
        </label>
        <label className="text-xs font-bold text-fg-2">
          {bt("원고 가로 (px)", "Source width (px)")}
          <input
            type="number"
            min={1}
            value={activeSourceWidth}
            onChange={(event) => setCustomWidthPx(parsePositiveInt(event.target.value, 800))}
            className={INPUT_CLASS}
          />
        </label>
        <label className="text-xs font-bold text-fg-2">
          {bt("원고 세로 (px)", "Source height (px)")}
          <input
            type="number"
            min={1}
            value={activeSourceHeight}
            onChange={(event) => setCustomHeightPx(parsePositiveInt(event.target.value, 4800))}
            className={INPUT_CLASS}
          />
        </label>
        <label className="text-xs font-bold text-fg-2">
          {bt("출력 포맷", "Format")}
          <select
            aria-label={bt("납품 출력 포맷", "Delivery image format")}
            value={format}
            onChange={(event) => setFormat(event.target.value as DeliveryImageFormat)}
            className={INPUT_CLASS}
          >
            {DELIVERY_IMAGE_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>

      <DeliveryRightsBomSection
        assets={combinedAssets}
        customAssetIds={customAssetIds}
        rightsReport={packResult.rightsReport}
        onAddAsset={(asset) => {
          setCustomAssets((prev) => [...prev, asset]);
          setDownloadStatus(null);
          setDownloadError(null);
        }}
        onRemoveAsset={(assetId) =>
          setCustomAssets((prev) => prev.filter((item) => item.id !== assetId))
        }
        onUpdateLicenseStatus={(assetId, nextStatus) =>
          setAssetOverrides((prev) => ({
            ...prev,
            [assetId]: {
              ...prev[assetId],
              licenseStatus: nextStatus,
              licenseCode: defaultLicenseCodeForStatus(nextStatus),
            },
          }))
        }
        onUpdateAttribution={(assetId, attributionText) =>
          setAssetOverrides((prev) => ({
            ...prev,
            [assetId]: {
              ...prev[assetId],
              attributionText,
            },
          }))
        }
      />

      <DeliverySlicePreviewSection
        protectedZones={protectedZones}
        totalSliceCount={packResult.batchPlan.totalSliceCount}
        totalAdjustedCutCount={packResult.batchPlan.totalAdjustedCutCount}
        primaryEpisode={primaryEpisode}
        onAddProtectedZone={(zone) => setProtectedZones((prev) => [...prev, zone])}
      />

      {!packResult.ok ? (
        <div
          role="alert"
          data-testid="delivery-pack-blocked-alert"
          className="mt-4 rounded-2xl border border-bad/40 bg-bad/10 p-4 text-xs text-bad"
        >
          <p className="flex items-center gap-2 text-sm font-bold">
            <AlertTriangle size={16} aria-hidden="true" />
            {bt(
              "Rights BOM 또는 플랫폼 규격 검증에 실패해 납품 내보내기가 차단되었습니다.",
              "Delivery export is blocked until Rights BOM and platform spec issues are resolved.",
            )}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {packResult.blockReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div
          data-testid="delivery-pack-ready-summary"
          className="mt-4 rounded-2xl border border-good/35 bg-good/10 p-4 text-xs text-fg-2"
        >
          <p className="flex items-center gap-2 text-sm font-bold text-good">
            <CheckCircle2 size={16} aria-hidden="true" />
            {bt(
              `${selectedSpec.labelKo} 납품 패키지 준비 완료 · ${packResult.batchPlan.episodeCount}화 / ${packResult.batchPlan.totalSliceCount}조각 (${formatMbLabel(packResult.batchPlan.totalEstimatedBytes)})`,
              `${selectedSpec.labelEn} delivery pack ready · ${packResult.batchPlan.episodeCount} ep / ${packResult.batchPlan.totalSliceCount} slices`,
            )}
          </p>
          <p className="mt-1 text-fg-3">
            {bt(
              `규격: ${selectedSpec.specNoteKo} · 증명서 다이제스트 ${packResult.digest}`,
              `Spec: ${selectedSpec.specNoteEn} · Digest ${packResult.digest}`,
            )}
          </p>
        </div>
      )}

      {downloadStatus ? (
        <p
          role="status"
          className="mt-3 rounded-xl border border-good/30 bg-good/10 px-3 py-2 text-xs font-semibold text-good"
        >
          {downloadStatus}
        </p>
      ) : null}
      {downloadError ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-bad/35 bg-bad/10 px-3 py-2 text-xs font-semibold text-bad"
        >
          {downloadError}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="delivery-pack-download-zip"
          disabled={!packResult.ok}
          onClick={handleDownloadZip}
          className={buttonClass({
            variant: "solid",
            className: "min-h-11 gap-2 motion-reduce:transition-none",
          })}
        >
          <FileArchive size={16} aria-hidden="true" />
          {bt("납품 패키지 ZIP 받기", "Download delivery ZIP")}
        </button>
        <button
          type="button"
          data-testid="delivery-pack-download-certificate"
          disabled={!packResult.ok}
          onClick={handleDownloadCertificate}
          className={buttonClass({
            variant: "outline",
            className: "min-h-11 gap-2 motion-reduce:transition-none",
          })}
        >
          <FileText size={16} aria-hidden="true" />
          {bt("RIGHTS-BOM-CERTIFICATE.md 받기", "Download certificate (.md)")}
        </button>
        <button
          type="button"
          data-testid="delivery-pack-download-manifest"
          disabled={!packResult.ok}
          onClick={handleDownloadManifest}
          className={buttonClass({
            variant: "outline",
            className: "min-h-11 gap-2 motion-reduce:transition-none",
          })}
        >
          <FileJson2 size={16} aria-hidden="true" />
          {bt("delivery-manifest.json 받기", "Download manifest (.json)")}
        </button>
        <label className="ml-auto flex min-h-11 items-center gap-2 text-xs font-semibold text-fg-3">
          <Download size={14} aria-hidden="true" />
          <span>{bt("작가 표기:", "Author:")}</span>
          <input
            type="text"
            aria-label={bt("증명서 작가명", "Certificate author name")}
            value={authorName}
            placeholder={bt("ToonStudio 창작자", "ToonStudio Creator")}
            onChange={(event) => setAuthorName(event.target.value)}
            className="min-h-11 w-40 rounded-xl border border-line bg-panel px-2.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </label>
      </div>

      {packResult.ok ? (
        <details className="mt-4 rounded-2xl border border-line bg-panel/35 p-4">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between text-xs font-bold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span>
              {bt("생성된 RIGHTS-BOM-CERTIFICATE.md 미리보기", "Preview RIGHTS-BOM-CERTIFICATE.md")}
            </span>
            <span className="text-fg-3">
              {bt(`포함 파일 ${packResult.files.length}건`, `${packResult.files.length} files`)}
            </span>
          </summary>
          <pre
            data-testid="delivery-pack-certificate-preview"
            className="mt-3 max-h-64 overflow-auto rounded-xl border border-line bg-card p-3 font-mono text-xs leading-5 text-fg-2"
          >
            {packResult.certificateMarkdown}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
