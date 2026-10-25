import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  INITIAL_SHOTGRID_CUT_MATRIX,
  INITIAL_SHOTGRID_MEDIA_VERSIONS,
  INITIAL_SHOTGRID_PUBLISHED_ASSETS,
  SHOTGRID_PIPELINE_STEPS,
  buildBurnInSlateOverlay,
  compareMediaVersionSpecs,
  computePipelineMatrixSummary,
  evaluateVersionLineageHealth,
  getShotGridStatusMeta,
  getShotGridStepMeta,
  syncVersionToLatestUpstream,
  transitionCutStepWithAutoHandoff,
  type ShotGridCutMatrixRow,
  type ShotGridMediaVersion,
  type ShotGridPipelineStep,
  type ShotGridPublishedAsset,
  type ShotGridStatusCode,
} from "./production-shotgrid-version-lineage-model";

const STATUS_CYCLE_OPTIONS: readonly ShotGridStatusCode[] = [
  "wtg",
  "rdy",
  "ip",
  "rev",
  "cbb",
  "apr",
  "fin",
  "omt",
];

function badgeClassForTone(tone: "neutral" | "info" | "warning" | "success" | "danger"): string {
  switch (tone) {
    case "success":
      return "border-good/40 bg-good/10 text-good";
    case "warning":
      return "border-warn/40 bg-warn/10 text-warn";
    case "danger":
      return "border-bad/40 bg-bad/10 text-bad";
    case "info":
      return "border-cool/40 bg-cool/10 text-cool";
    default:
      return "border-line bg-raised text-fg-2";
  }
}

export function ProductionShotGridVersionLineageSuite() {
  const [publishedAssets, setPublishedAssets] =
    useState<readonly ShotGridPublishedAsset[]>(INITIAL_SHOTGRID_PUBLISHED_ASSETS);
  const [versions, setVersions] =
    useState<readonly ShotGridMediaVersion[]>(INITIAL_SHOTGRID_MEDIA_VERSIONS);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    INITIAL_SHOTGRID_MEDIA_VERSIONS[1]!.versionId,
  );
  const [compareVersionAId, setCompareVersionAId] = useState<string>(
    INITIAL_SHOTGRID_MEDIA_VERSIONS[0]!.versionId,
  );
  const [compareVersionBId, setCompareVersionBId] = useState<string>(
    INITIAL_SHOTGRID_MEDIA_VERSIONS[1]!.versionId,
  );
  const [matrixRows, setMatrixRows] =
    useState<readonly ShotGridCutMatrixRow[]>(INITIAL_SHOTGRID_CUT_MATRIX);
  const [handoffBanner, setHandoffBanner] = useState<string | null>(null);

  const matrixCaptionId = useId();
  const slateDialogTitleId = useId();
  const slateDialogRef = useRef<HTMLDialogElement | null>(null);

  // `<dialog closedby="any">` 미지원 브라우저용 light-dismiss 폴백 (modern-web-guidance: light-dismiss-a-dialog)
  useEffect(() => {
    const dialog = slateDialogRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (isDialogContent) return;
      dialog.close();
    };

    dialog.addEventListener("click", handleBackdropClick);
    return () => dialog.removeEventListener("click", handleBackdropClick);
  }, []);

  const selectedVersion = useMemo(
    () => versions.find((v) => v.versionId === selectedVersionId) ?? versions[0]!,
    [versions, selectedVersionId],
  );

  const lineageHealth = useMemo(
    () => evaluateVersionLineageHealth(selectedVersion, publishedAssets),
    [selectedVersion, publishedAssets],
  );

  const burnInSlate = useMemo(
    () => buildBurnInSlateOverlay(selectedVersion, "북부 대공의 비밀 성채", publishedAssets),
    [selectedVersion, publishedAssets],
  );

  const matrixSummary = useMemo(
    () => computePipelineMatrixSummary(matrixRows),
    [matrixRows],
  );

  const versionA = useMemo(
    () => versions.find((v) => v.versionId === compareVersionAId) ?? versions[0]!,
    [versions, compareVersionAId],
  );
  const versionB = useMemo(
    () => versions.find((v) => v.versionId === compareVersionBId) ?? versions[1] ?? versions[0]!,
    [versions, compareVersionBId],
  );
  const versionComparisonDiff = useMemo(
    () => compareMediaVersionSpecs(versionA, versionB),
    [versionA, versionB],
  );

  const handleSyncUpstreamPins = (versionId: string) => {
    setVersions((prev) =>
      prev.map((item) =>
        item.versionId === versionId
          ? syncVersionToLatestUpstream(item, publishedAssets, "2026-10-26T06:45:00Z")
          : item,
      ),
    );
    setHandoffBanner(
      "선택한 컷 버전의 업스트림 에셋 핀을 최신 PublishedFile 리비전으로 일괄 리바인딩하고 새 리비전(REV)으로 승격했습니다.",
    );
  };

  const handlePublishNewAssetRevision = (assetId: string) => {
    setPublishedAssets((prev) =>
      prev.map((asset) =>
        asset.assetId === assetId
          ? {
              ...asset,
              latestRevision: asset.latestRevision + 1,
              publishedAtIso: "2026-10-26T06:50:00Z",
            }
          : asset,
      ),
    );
    setHandoffBanner("업스트림 에셋의 신규 리비전을 퍼블리시했습니다. 하위 컷 버전의 Out-of-Date 경고를 확인하세요.");
  };

  const handleMatrixStatusChange = (
    cutCode: string,
    step: ShotGridPipelineStep,
    nextStatus: ShotGridStatusCode,
  ) => {
    const result = transitionCutStepWithAutoHandoff(matrixRows, cutCode, step, nextStatus);
    setMatrixRows(result.updatedRows);
    if (result.autoPromotedStep) {
      const promotedMeta = getShotGridStepMeta(result.autoPromotedStep);
      setHandoffBanner(
        `${cutCode}의 ${getShotGridStepMeta(step).labelKo} 공정이 승인/확정되어 후속 공정 '${promotedMeta.labelKo}' 상태가 자동으로 [WTG → RDY(착수 가능)]로 인계되었습니다.`,
      );
    } else {
      setHandoffBanner(
        `${cutCode} · ${getShotGridStepMeta(step).labelKo} 상태가 [${getShotGridStatusMeta(nextStatus).shortCode}]로 변경되었습니다.`,
      );
    }
  };

  return (
    <section
      aria-label="샷그리드 미디어 버전 계보 및 파이프라인 매트릭스 스위트"
      data-testid="shotgrid-version-lineage-suite"
      className="rounded-2xl border border-line bg-card p-5 shadow-xs space-y-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
              ShotGrid / Flow Production Tracking 내재화
            </span>
            <span className="text-xs text-fg-3">
              고사양 미디어 버전 · PublishedFile 에셋 계보 · Screening Room 슬레이트
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-fg">
            컷 미디어 버전 트리 & 업스트림 에셋 리비전 계보(Lineage) 관제실
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            data-testid="shotgrid-overall-progress"
            className="rounded-lg border border-line bg-raised px-3 py-1.5 font-semibold text-fg"
          >
            전체 파이프라인 공정률: {matrixSummary.overallProgressPercent}%
          </span>
          <span className="rounded-lg border border-line bg-raised px-2.5 py-1.5 text-fg-2">
            착수 가능(RDY) {matrixSummary.readyToStartCount} · 검수 대기(REV) {matrixSummary.pendingReviewCount} · 보완 권고(CBB) {matrixSummary.cbbCount}
          </span>
          <button
            type="button"
            data-testid="open-burnin-slate-modal-btn"
            onClick={() => slateDialogRef.current?.showModal()}
            className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-1.5 font-semibold text-accent hover:bg-accent/20"
          >
            Burn-in Slate 전체 규격 보기
          </button>
        </div>
      </header>

      {handoffBanner ? (
        <div
          role="status"
          data-testid="shotgrid-handoff-banner"
          className="rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-2.5 text-xs font-medium text-fg"
        >
          {handoffBanner}
        </div>
      ) : null}

      {/* 1. Screening Room 미디어 버전 선택 & PublishedFile 업스트림 에셋 계보 검사 */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5 space-y-3 rounded-xl border border-line bg-panel p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-fg-2">
              Screening Room 검수 플레이리스트 ({versions.length} Versions)
            </h4>
          </div>
          <div className="space-y-2">
            {versions.map((ver) => {
              const statusMeta = getShotGridStatusMeta(ver.status);
              const verHealth = evaluateVersionLineageHealth(ver, publishedAssets);
              const isSelected = ver.versionId === selectedVersion.versionId;
              return (
                <button
                  key={ver.versionId}
                  type="button"
                  data-testid={`shotgrid-version-card-${ver.versionId}`}
                  onClick={() => setSelectedVersionId(ver.versionId)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-card hover:border-fg-3"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-fg">{ver.versionCode}</span>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${badgeClassForTone(statusMeta.badgeTone)}`}
                    >
                      {statusMeta.shortCode} · {statusMeta.labelKo}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-fg">
                    {ver.cutCode} · {ver.cutTitle}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-2">
                    <span>
                      {ver.sourceSpec.fileFormat} · {ver.sourceSpec.widthPx}×{ver.sourceSpec.heightPx}px · {ver.sourceSpec.colorSpace}
                    </span>
                    <span
                      className={
                        verHealth.isUpToDate
                          ? "font-semibold text-good"
                          : "font-semibold text-warn"
                      }
                    >
                      {verHealth.isUpToDate
                        ? "에셋 리비전 최신"
                        : `구버전 에셋 ${verHealth.outdatedAssets.length}건`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 선택된 버전의 Burn-in Slate 및 업스트림 의존성 계보(Lineage) */}
        <div className="lg:col-span-7 space-y-3 rounded-xl border border-line bg-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-fg-2">
                선택 버전 에셋 계보(PublishedFile Lineage) & 슬레이트
              </h4>
              <p className="text-xs text-fg-3">
                3D 배경·캐릭터 시트 업스트림 리비전 불일치 시 즉시 감지하여 리바인딩합니다.
              </p>
            </div>
            {!lineageHealth.isUpToDate ? (
              <button
                type="button"
                data-testid="shotgrid-sync-upstream-btn"
                onClick={() => handleSyncUpstreamPins(selectedVersion.versionId)}
                className="rounded-lg bg-warn px-3 py-1.5 text-xs font-bold text-canvas hover:opacity-90"
              >
                최신 업스트림 에셋으로 일괄 리바인딩 (+v00{selectedVersion.revisionNumber + 1})
              </button>
            ) : null}
          </div>

          {/* Burn-in Slate 미니 프리뷰 */}
          <div
            data-testid="shotgrid-burnin-slate-preview"
            className="rounded-xl border border-line bg-canvas p-3.5 font-mono text-[11px] text-fg space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-1.5">
              <span>{burnInSlate.topLeft}</span>
              <span className="text-accent">{burnInSlate.topRight}</span>
            </div>
            {burnInSlate.lineageWarningBanner ? (
              <div
                data-testid="shotgrid-lineage-warning-banner"
                className="rounded-md bg-warn/15 px-2.5 py-1 text-warn font-sans font-semibold"
              >
                {burnInSlate.lineageWarningBanner}
              </div>
            ) : (
              <div className="rounded-md bg-good/15 px-2.5 py-1 text-good font-sans font-semibold">
                {lineageHealth.summaryLabel}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-1.5 text-fg-2">
              <span>{burnInSlate.bottomLeft}</span>
              <span>{burnInSlate.bottomRight}</span>
            </div>
          </div>

          {/* 참조 중인 PublishedFile 에셋 목록 */}
          <div className="grid gap-2 sm:grid-cols-2">
            {publishedAssets.map((asset) => {
              const pin = selectedVersion.upstreamPins.find((p) => p.assetId === asset.assetId);
              const isOutdated = pin !== undefined && pin.pinnedRevision < asset.latestRevision;
              return (
                <div
                  key={asset.assetId}
                  data-testid={`shotgrid-asset-node-${asset.assetId}`}
                  className={`rounded-lg border p-2.5 text-xs ${
                    isOutdated
                      ? "border-warn/50 bg-warn/10"
                      : "border-line bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-bold text-fg">{asset.assetCode}</span>
                    <button
                      type="button"
                      data-testid={`publish-asset-rev-btn-${asset.assetId}`}
                      onClick={() => handlePublishNewAssetRevision(asset.assetId)}
                      className="rounded border border-line bg-raised px-1.5 py-0.5 text-[10px] font-semibold text-fg-2 hover:text-fg"
                    >
                      +신규 리비전 배포(v{asset.latestRevision + 1})
                    </button>
                  </div>
                  <p className="mt-0.5 font-medium text-fg">{asset.assetName}</p>
                  <p className="mt-1 text-[11px] text-fg-2">
                    최신: <strong>v{asset.latestRevision}</strong> ({asset.fileFormat}) ·{" "}
                    {pin
                      ? isOutdated
                        ? `현재 컷 참조: v${pin.pinnedRevision} (구버전 -${asset.latestRevision - pin.pinnedRevision})`
                        : `현재 컷 참조: v${pin.pinnedRevision} (일치)`
                      : "이 컷에서 미참조"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. A/B 버전 리비전 스펙 비교기 */}
      <div className="rounded-xl border border-line bg-panel p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-fg-2">
            Screening Room A/B 리비전 사양 비교기
          </h4>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-fg-2">
              <span>기준 버전(A):</span>
              <select
                aria-label="기준 버전 A 선택"
                data-testid="shotgrid-compare-select-a"
                value={compareVersionAId}
                onChange={(e) => setCompareVersionAId(e.target.value)}
                className="rounded border border-line bg-card px-2 py-1 text-xs text-fg"
              >
                {versions.map((v) => (
                  <option key={v.versionId} value={v.versionId}>
                    {v.versionCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-fg-2">
              <span>비교 버전(B):</span>
              <select
                aria-label="비교 버전 B 선택"
                data-testid="shotgrid-compare-select-b"
                value={compareVersionBId}
                onChange={(e) => setCompareVersionBId(e.target.value)}
                className="rounded border border-line bg-card px-2 py-1 text-xs text-fg"
              >
                {versions.map((v) => (
                  <option key={v.versionId} value={v.versionId}>
                    {v.versionCode}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div
          data-testid="shotgrid-ab-diff-summary"
          className="grid gap-2 sm:grid-cols-4 text-xs"
        >
          <div className="rounded-lg border border-line bg-card p-2.5">
            <span className="text-fg-3">리비전 격차</span>
            <p className="mt-0.5 font-bold text-fg">
              {versionComparisonDiff.versionACode} → {versionComparisonDiff.versionBCode} (
              {versionComparisonDiff.revisionGap >= 0
                ? `+${versionComparisonDiff.revisionGap}`
                : versionComparisonDiff.revisionGap}
              )
            </p>
          </div>
          <div className="rounded-lg border border-line bg-card p-2.5">
            <span className="text-fg-3">캔버스 세로 픽셀 변화</span>
            <p className="mt-0.5 font-bold text-fg">
              {versionComparisonDiff.heightDeltaPx >= 0
                ? `+${versionComparisonDiff.heightDeltaPx}px`
                : `${versionComparisonDiff.heightDeltaPx}px`}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-card p-2.5">
            <span className="text-fg-3">레이어 수 / 용량 편차</span>
            <p className="mt-0.5 font-bold text-fg">
              {versionComparisonDiff.layerCountDelta >= 0
                ? `+${versionComparisonDiff.layerCountDelta}`
                : versionComparisonDiff.layerCountDelta}{" "}
              Layers /{" "}
              {versionComparisonDiff.fileSizeDeltaMb >= 0
                ? `+${versionComparisonDiff.fileSizeDeltaMb}`
                : versionComparisonDiff.fileSizeDeltaMb}
              MB
            </p>
          </div>
          <div className="rounded-lg border border-line bg-card p-2.5">
            <span className="text-fg-3">미해결 감독 노트</span>
            <p className="mt-0.5 font-bold text-fg">
              A: {versionComparisonDiff.unresolvedNotesA}건 → B: {versionComparisonDiff.unresolvedNotesB}건
            </p>
          </div>
        </div>
      </div>

      {/* 3. 파이프라인 스텝 상태 매트릭스 (modern-web-guidance: responsive-table 적용) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-fg-2">
            컷 × 파이프라인 스텝 상태 매트릭스 (선행 공정 승인 시 후행 WTG → RDY 자동 인계)
          </h4>
        </div>
        <div
          role="region"
          aria-labelledby={matrixCaptionId}
          className="overflow-auto max-w-full rounded-xl border border-line bg-card"
        >
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <caption id={matrixCaptionId} className="sr-only">
              컷별 파이프라인 스텝 진행 상태 및 공정률 매트릭스 표
            </caption>
            <thead className="sticky top-0 z-10 bg-raised text-fg-2">
              <tr>
                <th scope="col" className="sticky left-0 z-20 border-b border-line bg-raised px-3 py-2 font-bold">
                  컷 코드 / 장면명
                </th>
                {SHOTGRID_PIPELINE_STEPS.map((stepMeta) => (
                  <th key={stepMeta.step} scope="col" className="border-b border-line px-2.5 py-2 font-bold">
                    <div>{stepMeta.labelKo}</div>
                    <div className="text-[10px] font-normal text-fg-3">
                      평균 {matrixSummary.stepProgressByKey[stepMeta.step]}%
                    </div>
                  </th>
                ))}
                <th scope="col" className="border-b border-line px-3 py-2 font-bold text-right">
                  컷 공정률
                </th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr key={row.cutCode} className="hover:bg-panel">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-line bg-card px-3 py-2.5 font-semibold text-fg"
                  >
                    <div className="font-mono text-xs">{row.cutCode}</div>
                    <div className="text-[11px] font-normal text-fg-2">{row.cutTitle}</div>
                  </th>
                  {SHOTGRID_PIPELINE_STEPS.map((stepMeta) => {
                    const currentStatus = row.stepStatuses[stepMeta.step];
                    const statusMeta = getShotGridStatusMeta(currentStatus);
                    return (
                      <td key={stepMeta.step} className="border-b border-line px-2.5 py-2">
                        <select
                          aria-label={`${row.cutCode} ${stepMeta.labelKo} 상태`}
                          data-testid={`shotgrid-matrix-cell-${row.cutCode}-${stepMeta.step}`}
                          value={currentStatus}
                          onChange={(e) =>
                            handleMatrixStatusChange(
                              row.cutCode,
                              stepMeta.step,
                              e.target.value as ShotGridStatusCode,
                            )
                          }
                          className={`rounded-md border px-2 py-1 text-[11px] font-bold ${badgeClassForTone(statusMeta.badgeTone)}`}
                        >
                          {STATUS_CYCLE_OPTIONS.map((code) => {
                            const optMeta = getShotGridStatusMeta(code);
                            return (
                              <option key={code} value={code}>
                                {optMeta.shortCode} ({optMeta.labelKo})
                              </option>
                            );
                          })}
                        </select>
                      </td>
                    );
                  })}
                  <td
                    data-testid={`shotgrid-cut-progress-${row.cutCode}`}
                    className="border-b border-line px-3 py-2 text-right font-mono font-bold text-fg"
                  >
                    {matrixSummary.cutProgressByCode[row.cutCode] ?? 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Burn-in Slate 상세 다이얼로그 (modern-web-guidance: light-dismiss-a-dialog) */}
      <dialog
        ref={slateDialogRef}
        {...({ closedby: "any" } as Record<string, string>)}
        aria-labelledby={slateDialogTitleId}
        data-testid="shotgrid-burnin-slate-dialog"
        className="m-auto w-full max-w-xl rounded-2xl border border-line bg-card p-5 text-fg shadow-xl backdrop:bg-canvas/70 backdrop:backdrop-blur-xs"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h4 id={slateDialogTitleId} className="text-sm font-bold text-fg">
              ShotGrid Screening Room · Burn-in Slate 상세 규격
            </h4>
            <button
              type="button"
              onClick={() => slateDialogRef.current?.close()}
              className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-fg-2 hover:text-fg"
            >
              닫기 (Esc)
            </button>
          </div>
          <div className="space-y-2 rounded-xl border border-line bg-canvas p-4 font-mono text-xs text-fg">
            <p className="text-accent">{burnInSlate.topLeft}</p>
            <p>{burnInSlate.topRight}</p>
            <p className="text-fg-2">{burnInSlate.bottomLeft}</p>
            <p className="text-fg-2">{burnInSlate.bottomRight}</p>
            <p className="text-[11px] text-fg-3">워터마크: {burnInSlate.watermarkText}</p>
          </div>
          <div className="space-y-1.5">
            <h5 className="text-xs font-bold text-fg-2">타임코드 / 스크롤 Y축 감독 노트</h5>
            {selectedVersion.directorNotes.map((note) => (
              <div
                key={note.noteId}
                className="rounded-lg border border-line bg-raised px-3 py-2 text-xs"
              >
                <div className="flex items-center justify-between font-semibold text-fg">
                  <span>
                    {note.author} (Y={note.scrollYOrFrame}px)
                  </span>
                  <span className={note.resolved ? "text-good" : "text-warn"}>
                    {note.resolved ? "해결됨" : "미해결"}
                  </span>
                </div>
                <p className="mt-1 text-fg-2">{note.body}</p>
              </div>
            ))}
          </div>
        </div>
      </dialog>
    </section>
  );
}
