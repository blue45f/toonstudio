import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  ANTI_AI_SHIELD_PRESETS,
  analyzeOnDeviceStrokeHabits,
  buildCreatorProvenanceManifest,
  canonicalJsonStringify,
  computeSha256Hex,
  exportEpisodeTranscriptHtml,
  exportEpisodeTranscriptJson,
  extractStrokeSamplesFromPages,
  extractWebtoonCutInputsFromPages,
  generateEpisodeAccessibilityBundle,
  verifyCreatorProvenanceManifest,
  type AltTextLocale,
  type AntiAiShieldStrength,
} from "./creator-trust";
import {
  buildStudioAssetRightsManifest,
  type StudioAssetRightsAttestationInput,
} from "./studio-asset-rights-manifest";
import {
  projectStudioAssetRightsUsages,
  type StudioAssetRightsProjectionPage,
} from "./studio-asset-rights-projection";
import { StudioAssetRightsManifestPanel } from "./StudioAssetRightsManifestPanel";

export interface StudioAssetRightsAuditDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workId?: string | null;
  readonly pages: readonly StudioAssetRightsProjectionPage[];
}

const TRUST_CONTROL_CLASS =
  "min-h-11 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const TRUST_ENCODER = new TextEncoder();

function downloadLocalManifest(payload: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([payload], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function StudioAssetRightsAuditDialog({
  open,
  onClose,
  workId,
  pages,
}: StudioAssetRightsAuditDialogProps) {
  const [reviewer, setReviewer] = useState("");
  const [attestation, setAttestation] =
    useState<StudioAssetRightsAttestationInput | null>(null);
  const [shieldStrength, setShieldStrength] =
    useState<AntiAiShieldStrength>("balanced");
  const [altTextLocale, setAltTextLocale] = useState<AltTextLocale>("ko");
  const [openedAt] = useState(() => Date.now());
  const resolvedWorkId = workId?.trim() || `local:${pages[0]?.id ?? "untitled"}`;
  const usages = open ? projectStudioAssetRightsUsages(pages) : [];
  const result = buildStudioAssetRightsManifest({
    workId: resolvedWorkId,
    usages,
    attestation,
    now: openedAt,
  });

  const creatorTrustSummary = useMemo(() => {
    if (!open) return null;
    const rightsPayload = canonicalJsonStringify(result.manifest);
    const rightsBytes = TRUST_ENCODER.encode(rightsPayload);
    const prohibitedCount = result.manifest.assets.filter(
      (asset) => asset.commercialUse === "prohibited",
    ).length;
    const unknownCount = result.manifest.assets.filter(
      (asset) => asset.commercialUse === "unknown",
    ).length;
    const provenanceManifest = buildCreatorProvenanceManifest({
      workId: resolvedWorkId,
      episodeLabel: pages[0]?.id ?? "EP01",
      creatorDisplayName: reviewer.trim() || "ToonStudio 창작자",
      rightsBomSummary: {
        totalAssets: result.manifest.summary.placementCount,
        uniqueAssets: result.manifest.summary.assetCount,
        clearedForCommercialUse: result.manifest.summary.readyForPublishPreflight,
        prohibitedCount,
        unknownCount,
        rightsManifestDigestSha256: computeSha256Hex(rightsBytes),
      },
      contentBytes: rightsBytes,
      issuedAtIso: new Date(openedAt).toISOString(),
    });
    const provenanceVerification = verifyCreatorProvenanceManifest(
      provenanceManifest,
      rightsBytes,
    );
    const altTextBundle = generateEpisodeAccessibilityBundle({
      workId: resolvedWorkId,
      episodeTitle: resolvedWorkId,
      locale: altTextLocale,
      cuts: extractWebtoonCutInputsFromPages(pages),
    });
    const habitReport = analyzeOnDeviceStrokeHabits({
      sessionId: `audit:${resolvedWorkId}`,
      strokes: extractStrokeSamplesFromPages(pages, openedAt),
    });
    return {
      provenanceManifest,
      provenanceVerification,
      altTextBundle,
      habitReport,
    };
  }, [altTextLocale, open, openedAt, pages, resolvedWorkId, result.manifest, reviewer]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      globalThis.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const activeShieldSpec = ANTI_AI_SHIELD_PRESETS[shieldStrength];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="에셋 권리·납품 감사"
      className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto overscroll-contain bg-[oklch(0.08_0.01_70/0.82)] p-2 backdrop-blur-sm sm:p-4"
    >
      <div className="flex w-full max-w-6xl flex-col gap-3">
        <StudioAssetRightsManifestPanel
          result={result}
          reviewer={reviewer}
          onReviewerChange={setReviewer}
          onAttestationChange={setAttestation}
          onExportJson={(payload) =>
            downloadLocalManifest(
              payload,
              "toonstudio-asset-rights-v1.json",
              "application/json"
            )
          }
          onExportCsv={(payload) =>
            downloadLocalManifest(
              payload,
              "toonstudio-asset-rights-v1.csv",
              "text/csv;charset=utf-8"
            )
          }
          onClose={onClose}
        />
        {creatorTrustSummary ? (
          <section
            aria-label="창작자 보호·접근성 온디바이스 점검"
            className="rounded-2xl border border-line bg-panel p-4 text-fg shadow-lg"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <h3 className="text-sm font-bold text-fg">
                  창작자 IP 보호 · 컷 Alt-Text · 온디바이스 습관 점검 (서버 전송 0건)
                </h3>
                <p className="mt-0.5 text-xs text-fg-2">
                  {creatorTrustSummary.provenanceVerification.summaryKo}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(["subtle", "balanced", "strong"] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={shieldStrength === level}
                    onClick={() => setShieldStrength(level)}
                    className={`${TRUST_CONTROL_CLASS} ${
                      shieldStrength === level ? "border-accent text-fg" : ""
                    }`}
                  >
                    {ANTI_AI_SHIELD_PRESETS[level].labelKo}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setAltTextLocale((prev) => (prev === "ko" ? "en" : "ko"))
                  }
                  className={TRUST_CONTROL_CLASS}
                >
                  해설 언어: {altTextLocale.toUpperCase()}
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-card/70 p-3">
                <p className="text-xs font-semibold text-fg-2">
                  AI 학습 방어 · SHA-256 증명서
                </p>
                <p className="mt-1 text-xs text-fg">
                  {activeShieldSpec.labelKo} · {activeShieldSpec.targetPsnrRangeKo}
                </p>
                <p className="mt-1 truncate font-mono text-[0.7rem] text-fg-3">
                  SHA-256: {creatorTrustSummary.provenanceManifest.contentSha256}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    downloadLocalManifest(
                      JSON.stringify(
                        creatorTrustSummary.provenanceManifest,
                        null,
                        2,
                      ),
                      "toonstudio-creator-provenance-v1.json",
                      "application/json",
                    )
                  }
                  className={`mt-2 w-full ${TRUST_CONTROL_CLASS}`}
                >
                  온디바이스 증명서 JSON 저장
                </button>
              </div>

              <div className="rounded-xl border border-line bg-card/70 p-3">
                <p className="text-xs font-semibold text-fg-2">
                  웹툰 컷 Alt-Text (WCAG 2.2 AA)
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-fg">
                  {creatorTrustSummary.altTextBundle.cuts[0]?.altText ??
                    "배치된 컷이 없습니다."}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadLocalManifest(
                        exportEpisodeTranscriptJson(
                          creatorTrustSummary.altTextBundle,
                        ),
                        "toonstudio-cut-alt-text-v1.json",
                        "application/json",
                      )
                    }
                    className={`flex-1 ${TRUST_CONTROL_CLASS}`}
                  >
                    대본 JSON
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadLocalManifest(
                        exportEpisodeTranscriptHtml(
                          creatorTrustSummary.altTextBundle,
                        ),
                        "toonstudio-cut-alt-text-v1.html",
                        "text/html;charset=utf-8",
                      )
                    }
                    className={`flex-1 ${TRUST_CONTROL_CLASS}`}
                  >
                    대본 HTML
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-card/70 p-3">
                <p className="text-xs font-semibold text-fg-2">
                  온디바이스 작화 습관 분석
                </p>
                <p className="mt-1 text-xs text-fg">
                  분석 스트로크 {creatorTrustSummary.habitReport.paceProfile.totalStrokes}건 · 권장 손떨림 보정{" "}
                  {creatorTrustSummary.habitReport.jitterProfile.recommendedStabilizationLevel}% (
                  {creatorTrustSummary.habitReport.jitterProfile.recommendedStabilizationWindowPx}px)
                </p>
                <p className="mt-1 text-[0.7rem] text-fg-3">
                  {creatorTrustSummary.habitReport.workRhythmSuggestionsKo[0]}
                </p>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
