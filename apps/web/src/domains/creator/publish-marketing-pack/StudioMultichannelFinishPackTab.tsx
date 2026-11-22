import { AlertTriangle, CheckCircle2, Download, Film, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import {
  buildMultichannelFinishPackBundle,
  createDefaultMultichannelFinishPackInput,
  type RightsBomAssetInput,
} from "./multichannel-finish-pack-builder";

export interface StudioMultichannelFinishPackTabProps {
  readonly projectId: string;
  readonly seriesTitle: string;
  readonly episodeNumber: number;
  readonly onDownloadFile: (filename: string, content: BlobPart, mimeType: string, messageKo: string) => void;
}

const SAMPLE_UNVERIFIED_ASSET: RightsBomAssetInput = {
  assetId: "font-unverified-sample",
  name: "외부 미확인 필기체 폰트 (검증 필요)",
  category: "font",
  licenseTier: "unverified",
  sourceVendor: "Unknown Archive",
  commercialUseAllowed: false,
  redistributableInExport: false,
};

/**
 * 축 30 · 1화 완료 멀티채널 마감 번들 탭 (9:16 숏폼 티저 · 대표 썸네일 3종 · WCAG ALT · Rights BOM).
 */
export function StudioMultichannelFinishPackTab({
  projectId,
  seriesTitle,
  episodeNumber,
  onDownloadFile,
}: StudioMultichannelFinishPackTabProps) {
  const [simulateUnverifiedAsset, setSimulateUnverifiedAsset] = useState(false);

  const packInput = useMemo(() => {
    const base = createDefaultMultichannelFinishPackInput(projectId, seriesTitle, episodeNumber);
    if (!simulateUnverifiedAsset) return base;
    return {
      ...base,
      assets: [...base.assets, SAMPLE_UNVERIFIED_ASSET],
    };
  }, [episodeNumber, projectId, seriesTitle, simulateUnverifiedAsset]);

  const bundle = useMemo(() => buildMultichannelFinishPackBundle(packInput), [packInput]);

  return (
    <div
      id="marketing-panel-finish-pack"
      role="tabpanel"
      aria-labelledby="marketing-tab-finish-pack"
      data-testid="multichannel-finish-pack-tabpanel"
      className="space-y-4"
    >
      {/* 상단 준비도 + Rights BOM 게이트 요약 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-3.5">
        <div className="space-y-1">
          <p className="text-xs font-bold text-fg">
            1화 완료 멀티채널 마감 번들 · 출고 준비도{" "}
            <span data-testid="finish-pack-readiness-score" className="tabular-nums text-accent">
              {bundle.readinessScore}점
            </span>
          </p>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            9:16 숏폼 티저(1080×1920) · 대표 썸네일 3종(1:1·16:9·3:4) · WCAG 2.1 AA 대체 텍스트 · Rights BOM 감사서를 한 번에 묶습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="finish-pack-rights-gate-badge"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold ${
              bundle.bundleExportAllowed
                ? "border-good/45 bg-good/10 text-good"
                : "border-bad/45 bg-bad/10 text-bad"
            }`}
          >
            {bundle.bundleExportAllowed ? (
              <ShieldCheck size={14} aria-hidden="true" />
            ) : (
              <AlertTriangle size={14} aria-hidden="true" />
            )}
            Rights BOM:{" "}
            {bundle.rightsBomReport.exportGateStatus === "approved"
              ? "상업 출고 승인"
              : bundle.rightsBomReport.exportGateStatus === "approved-with-credits"
                ? "출처 표기 후 출고 승인"
                : "미검증 에셋 출고 차단"}
          </span>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2">
            <input
              type="checkbox"
              data-testid="finish-pack-toggle-unverified-asset"
              checked={simulateUnverifiedAsset}
              onChange={(event) => setSimulateUnverifiedAsset(event.target.checked)}
              className="size-4 cursor-pointer accent-[var(--color-accent)]"
            />
            미검증 폰트 차단 테스트
          </label>
        </div>
      </div>

      {/* 1) 9:16 숏폼 티저 + 2) 대표 썸네일 3종 */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
              <Film size={14} aria-hidden="true" />
              9:16 숏폼 티저 ({bundle.shortformTeaser9x16.widthPx}×{bundle.shortformTeaser9x16.heightPx} ·{" "}
              {bundle.shortformTeaser9x16.totalDurationSec}초)
            </h4>
            <span className="text-xs text-fg-3">
              {bundle.shortformTeaser9x16.targetChannels.join(" · ")}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-xl border border-line bg-canvas">
              <img
                src={bundle.shortformTeaser9x16.posterSvgDataUrl}
                alt={`${seriesTitle} ${episodeNumber}화 9:16 숏폼 티저 키프레임 미리보기`}
                data-testid="finish-pack-teaser-preview"
                className="block aspect-[9/16] w-full object-contain"
              />
            </div>
            <ol className="space-y-2 text-xs" data-testid="finish-pack-teaser-beats">
              {bundle.shortformTeaser9x16.beats.map((beat) => (
                <li
                  key={beat.beatOrder}
                  className="rounded-lg border border-line bg-panel p-2 text-fg-2"
                >
                  <div className="flex items-center justify-between font-bold text-fg tabular-nums">
                    <span>
                      #{beat.beatOrder} {beat.role.toUpperCase()} ({beat.cameraMotion})
                    </span>
                    <span>
                      {beat.startSec.toFixed(1)}s–{beat.endSec.toFixed(1)}s
                    </span>
                  </div>
                  <p className="mt-0.5 text-fg [word-break:keep-all]">{beat.subtitleOverlayKo}</p>
                  <p className="text-fg-3">{beat.audioBeatCue}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-fg">대표 썸네일 3종 자동 조판</h4>
            <span className="text-xs text-fg-3">1:1 · 16:9 · 3:4 안전여백 적용</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3" data-testid="finish-pack-thumbnails-grid">
            {bundle.thumbnails.map((thumb) => (
              <article
                key={thumb.variantId}
                data-testid={`finish-pack-thumb-${thumb.variantId}`}
                className="flex flex-col justify-between gap-2 rounded-lg border border-line bg-panel p-2.5"
              >
                <div className="space-y-1.5">
                  <div className="overflow-hidden rounded-lg border border-line bg-canvas p-1">
                    <img
                      src={thumb.svgDataUrl}
                      alt={`${thumb.headlineKo} ${thumb.labelKo} 미리보기`}
                      className="block h-28 w-full object-contain"
                    />
                  </div>
                  <strong className="block text-xs font-bold text-fg">{thumb.labelKo}</strong>
                  <p className="text-xs text-fg-3 tabular-nums">
                    {thumb.widthPx}×{thumb.heightPx}px · 기준 {thumb.selectedCutIndex}컷
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onDownloadFile(
                      thumb.fileName,
                      thumb.svgMarkup,
                      "image/svg+xml;charset=utf-8",
                      `${thumb.labelKo} SVG를 저장했어요.`,
                    )
                  }
                  className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg hover:border-line-strong hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Download size={13} aria-hidden="true" />
                  SVG 저장
                </button>
              </article>
            ))}
          </div>
        </div>
      </div>

      {/* 3) WCAG 2.1 AA 대체 텍스트 팩 + 4) Rights BOM 리포트 */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
              <CheckCircle2 size={14} aria-hidden="true" />
              WCAG 2.1 AA 대체 텍스트 팩 ({bundle.wcagAltPack.coveragePercent}% 통과)
            </h4>
            <span className="text-xs text-fg-3 tabular-nums">
              {bundle.wcagAltPack.passedCount}/{bundle.wcagAltPack.totalCutCount}컷
            </span>
          </div>
          <ul className="space-y-1.5 text-xs" data-testid="finish-pack-wcag-alt-list">
            {bundle.wcagAltPack.entries.map((entry) => (
              <li
                key={entry.cutId}
                className="rounded-lg border border-line bg-panel p-2 text-fg-2 [word-break:keep-all]"
              >
                <strong className="text-fg">{entry.cutIndex}컷:</strong> {entry.altTextKo}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-fg">
              Rights BOM 라이선스 감사서 (체크섬 {bundle.rightsBomReport.manifestChecksum})
            </h4>
            <span className="text-xs text-fg-3 tabular-nums">
              승인 {bundle.rightsBomReport.clearedCount} · 출처{" "}
              {bundle.rightsBomReport.attributionRequiredCount} · 차단{" "}
              {bundle.rightsBomReport.blockedCount}
            </span>
          </div>
          <ul className="space-y-1.5 text-xs" data-testid="finish-pack-rights-bom-list">
            {bundle.rightsBomReport.items.map((item) => (
              <li
                key={item.assetId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel p-2"
              >
                <div>
                  <strong className="text-fg">{item.name}</strong>
                  <p className="text-fg-3">{item.reasonKo}</p>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
                    item.verdict === "blocked"
                      ? "border-bad/45 bg-bad/10 text-bad"
                      : item.verdict === "attribution-required"
                        ? "border-warn/45 bg-warn/10 text-warn"
                        : "border-good/45 bg-good/10 text-good"
                  }`}
                >
                  {item.verdict === "blocked"
                    ? "출고 차단"
                    : item.verdict === "attribution-required"
                      ? "출처 필수"
                      : "상업 승인"}
                </span>
              </li>
            ))}
          </ul>
          {bundle.rightsBomReport.blockingReasonsKo.length > 0 ? (
            <p
              role="alert"
              data-testid="finish-pack-rights-block-alert"
              className="rounded-lg border border-bad/45 bg-bad/10 p-2.5 text-xs font-semibold text-bad"
            >
              {bundle.rightsBomReport.blockingReasonsKo[0]}
            </p>
          ) : null}
        </div>
      </div>

      {/* 번들 매니페스트 & Rights BOM 다운로드 */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="finish-pack-download-bundle-btn"
          disabled={!bundle.bundleExportAllowed}
          onClick={() =>
            onDownloadFile(
              `${projectId}-ep${episodeNumber}-multichannel-finish-pack.json`,
              bundle.bundleManifestJson,
              "application/json;charset=utf-8",
              "멀티채널 마감 번들 매니페스트 JSON을 저장했어요.",
            )
          }
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Download size={14} aria-hidden="true" />
          멀티채널 마감 번들 JSON 저장 ({bundle.deliverableFiles.length}개 산출물)
        </button>
        <button
          type="button"
          data-testid="finish-pack-download-bom-btn"
          onClick={() =>
            onDownloadFile(
              `${projectId}-ep${episodeNumber}-rights-bom.json`,
              bundle.rightsBomReport.bomJson,
              "application/json;charset=utf-8",
              "Rights BOM 라이선스 감사서 JSON을 저장했어요.",
            )
          }
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-4 text-xs font-semibold text-fg transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Download size={14} aria-hidden="true" />
          Rights BOM 감사서 JSON 저장
        </button>
      </div>
    </div>
  );
}
