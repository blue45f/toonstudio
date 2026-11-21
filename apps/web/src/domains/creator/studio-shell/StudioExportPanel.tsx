import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  Globe2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";

import { useMemo, useState } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import {
  STUDIO_UNIFIED_PUBLISH_PROFILES,
  evaluateCommercialExportPreflight,
} from "../export/studio-unified-preflight-contract";
import {
  buildWebtoonPsdExportManifest,
  negotiateTimelapseWebmMimeType,
} from "../export/studio-timelapse-and-psd-exporter";
import {
  STUDIO_EXPORT_TARGET_PROFILES,
  STUDIO_EXPORT_TARGETS,
} from "../studio-export-preflight";
import type { StudioPublishProfile } from "../studio-publish-preflight";
import { EXPORT_TARGET_VISUALS, resultTone } from "./studio-export-panel-helpers";
import { StudioExportAdvancedDetails } from "./StudioExportAdvancedDetails";
import { StudioExportPreflightFindingsList } from "./StudioExportPreflightFindingsList";
import { StudioExportScopeSummaryCard } from "./StudioExportScopeSummaryCard";
import { useStudioExportPanelController } from "./useStudioExportPanelController";

/**
 * 초보자도 올릴 곳과 파일 형식만 고르면 실제 원고 해상도·선택 순서와 플랫폼 권장 규격·용량 추정치를 구분해 대조 점검하고,
 * 비로그인 로컬 편집기 파일 저장과 로그인 후 커뮤니티 공개 게시를 일치된 설정으로 이어 가는 출고 패널.
 */
interface StudioExportPanelProps {
  projectId: string;
  locale: "ko" | "en";
}

export function StudioExportPanel(props: StudioExportPanelProps) {
  const session = useSession();
  const owner = !session.ready ? undefined : session.status === "authenticated" ? session.data.user.id : null;
  return <StudioExportPanelContent key={JSON.stringify([props.projectId, session.ready, owner])} {...props} owner={owner} />;
}

function StudioExportPanelContent({ projectId, locale, owner }: StudioExportPanelProps & {
  owner: string | null | undefined;
}) {
  const bt = useBilingual("StudioExportPanel");
  const {
    workspaceError,
    manuscript,
    target,
    profile,
    draft,
    effectiveDraft,
    recommendedDraft,
    scopeSummary,
    hasCustomSpec,
    isAtActualManuscriptSize,
    displayedResult,
    projectFacts,
    returnHref,
    editorHref,
    communityPublishHref,
    message,
    error,
    selectTarget,
    resetToRecommendedSpec,
    patch,
    retryFromError,
    handleChangeSelectionMode,
    handleChangeSelectionExpression,
    syncReturnStateInHistory,
    runPreflight,
  } = useStudioExportPanelController(projectId, locale, owner);

  const [publishProfile, setPublishProfile] = useState<StudioPublishProfile>("generic");
  const estimatedMb = Math.max(
    0.1,
    Math.round((draft.estimatedFileSizeBytes / 1024 / 1024) * 10) / 10,
  );
  const unifiedPreflight = useMemo(
    () =>
      evaluateCommercialExportPreflight({
        exportTarget: target,
        publishProfile,
        documentWidthPx: draft.width,
        documentHeightPx: draft.height,
        bubbles:
          effectiveDraft.minimumTextPx && effectiveDraft.minimumTextPx > 0
            ? [
                {
                  id: "min-text-sample",
                  text: "최소 대사 가독성 기준",
                  fontSizePx: effectiveDraft.minimumTextPx,
                  topY: 64,
                  bottomY: 128,
                },
              ]
            : [],
        assets:
          projectFacts.blockedAssets > 0
            ? [
                {
                  assetId: "blocked-rights-bom",
                  name: `권리 확인 필요 소재 ${projectFacts.blockedAssets}건`,
                  licenseCode: "NON-COMMERCIAL",
                },
              ]
            : [],
      }),
    [
      draft.height,
      draft.width,
      effectiveDraft.minimumTextPx,
      projectFacts.blockedAssets,
      publishProfile,
      target,
    ],
  );
  const plannedSliceCount = unifiedPreflight.smartSlice.sliceCount;
  const commercialGateReport = unifiedPreflight.gateReport;
  const psdAndTimelapseSpec = useMemo(() => {
    const psd = buildWebtoonPsdExportManifest({
      widthPx: draft.width,
      heightPx: draft.height,
      layers: [],
    });
    const webmMime = negotiateTimelapseWebmMimeType(
      typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function"
        ? (mime) => MediaRecorder.isTypeSupported(mime)
        : undefined,
    );
    return { psdGroupCount: psd.groups.length, webmMime };
  }, [draft.height, draft.width]);
  const platformRecommendedShortLabel =
    profile.exactWidth !== undefined
      ? bt(
          `플랫폼 권장 폭 ${profile.exactWidth}px${profile.maxSegmentHeight ? ` · 분할 상한 ${profile.maxSegmentHeight}px` : ""}`,
          `Recommended width ${profile.exactWidth}px${profile.maxSegmentHeight ? ` · slice cap ${profile.maxSegmentHeight}px` : ""}`,
        )
      : profile.maxWidth !== undefined
        ? bt(`플랫폼 최대 폭 ${profile.maxWidth}px`, `Max width ${profile.maxWidth}px`)
        : bt(
            `권장 ${recommendedDraft.width} × ${recommendedDraft.height}px`,
            `Recommended ${recommendedDraft.width} × ${recommendedDraft.height}px`,
          );

  return (
    <section
      className="min-w-0 rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6"
      aria-labelledby="project-export-title"
      data-testid="studio-export-panel"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <FileCheck2 size={14} aria-hidden="true" />{" "}
            {bt("3단계 · 저장·내보내기 점검", "STEP 3 · EXPORT CHECK")}
          </p>
          <h2
            id="project-export-title"
            className="mt-2 break-words text-2xl font-black tracking-tight text-fg"
          >
            {bt(
              "올릴 곳을 고르면 알맞은 규격을 자동으로 맞춰 드려요",
              "Pick where to publish and get matching specs automatically",
            )}
          </h2>
          <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-fg-2">
            {bt(
              "연재 플랫폼이나 SNS·인쇄 용도를 선택하면 현재 원고 크기와 권장 규격을 비교해 드립니다. 내 기기에 이미지·PDF로 저장하거나 커뮤니티 공개 게시로 이어 가세요.",
              "Select a webtoon platform, social feed, or print target to compare your manuscript dimensions with recommended specs, then export locally or publish to the community.",
            )}
          </p>
          <ol
            aria-label={bt("내보내기 3단계 요약", "3-step export summary")}
            className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-fg-2"
          >
            <li className="rounded-full border border-accent/35 bg-accent-soft/35 px-2.5 py-1 text-accent">
              {bt("① 올릴 곳 선택", "1. Pick destination")}
            </li>
            <li className="rounded-full border border-line bg-panel px-2.5 py-1">
              {bt("② 현재 상태 검사", "2. Check status")}
            </li>
            <li className="rounded-full border border-line bg-panel px-2.5 py-1">
              {bt("③ 편집기에서 파일 저장", "3. Export file")}
            </li>
          </ol>
        </div>
        <span className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line bg-panel px-3 text-xs font-bold text-fg-2">
          {bt(`규격 기준 ${profile.policyVersion}`, `Policy ${profile.policyVersion}`)}
        </span>
      </div>

      {workspaceError || error ? (
        <div
          role="group"
          aria-label={bt("사전검사 오류 복구", "Preflight error recovery")}
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/35 bg-danger-soft/20 px-3 py-2 text-xs font-semibold text-danger"
        >
          <p role="alert" className="min-w-0 break-words">
            {error ?? workspaceError}
          </p>
          <button
            type="button"
            onClick={retryFromError}
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className:
                "min-h-11 min-w-0 gap-1.5 break-words focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
            })}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {bt("다시 시도", "Try again")}
          </button>
        </div>
      ) : null}
      {message ? (
        <p
          role="status"
          className="mt-4 break-words rounded-xl border border-success/30 bg-success-soft/20 px-3 py-2 text-xs font-semibold text-success"
        >
          {message}
        </p>
      ) : null}

      <div
        role="group"
        className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        aria-label={bt("내보내기 목적", "Export destinations")}
      >
        {STUDIO_EXPORT_TARGETS.map((candidate) => {
          const candidateProfile = STUDIO_EXPORT_TARGET_PROFILES[candidate];
          const active = candidate === target;
          return (
            <button
              key={candidate}
              type="button"
              aria-pressed={active}
              onClick={() => selectTarget(candidate)}
              className={cn(
                "group min-h-11 min-w-0 overflow-hidden rounded-xl border text-left text-xs font-bold transition-[transform,border-color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]",
                "focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none motion-reduce:transition-none",
                active
                  ? "border-accent bg-accent-soft/50 shadow-sm"
                  : "border-line bg-panel text-fg-2 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised hover:text-fg",
              )}
            >
              <span className="relative block h-16 overflow-hidden bg-canvas sm:h-20">
                <img
                  src={EXPORT_TARGET_VISUALS[candidate]}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transform-none"
                />
                <span
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-white/[0.04]"
                  aria-hidden="true"
                />
              </span>
              <span
                className={cn(
                  "flex min-h-11 items-center px-3 break-words",
                  active ? "text-accent" : "text-fg-2",
                )}
              >
                {bt(candidateProfile.labelKo, candidateProfile.labelEn)}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="group"
        aria-label={bt("연재 게시 프로필", "Publishing profile")}
        data-testid="studio-export-publish-profiles"
        className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel/45 px-3 py-2 text-xs"
      >
        <span className="font-bold text-fg-2">{bt("게시 프로필 연계", "Publish profile")}</span>
        {STUDIO_UNIFIED_PUBLISH_PROFILES.map((entry) => {
          const active = publishProfile === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={active}
              data-testid={`studio-export-profile-${entry.id}`}
              onClick={() => setPublishProfile(entry.id)}
              className={cn(
                "inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-semibold transition-colors duration-150 active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none",
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              {bt(entry.labelKo, entry.labelEn)}
            </button>
          );
        })}
        <span className="ml-auto text-[0.7rem] text-fg-3 break-keep">
          {unifiedPreflight.mobileLegibility.summaryKo}
        </span>
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-line bg-panel/45 p-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:items-end">
        <label className="min-w-0 text-xs font-bold text-fg-2">
          {bt("파일 형식", "File format")}
          <select
            aria-label={bt("형식", "Format")}
            value={draft.format}
            onChange={(event) => patch("format", event.target.value)}
            className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-line bg-card px-3 text-sm font-bold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            {profile.allowedFormats.map((format) => (
              <option key={format} value={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <div
          data-testid="studio-export-preset-summary"
          className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-line/80 bg-card px-3.5 py-2.5 text-xs text-fg-2"
        >
          <div className="min-w-0">
            <strong className="break-words font-bold text-fg">
              {bt(profile.labelKo, profile.labelEn)}{` `}
              {hasCustomSpec
                ? isAtActualManuscriptSize
                  ? bt("현재 원고 크기 기준", "current manuscript size")
                  : bt("직접 조정한 규격", "custom spec")
                : bt("권장 규격", "recommended spec")}
            </strong>
            <p className="mt-0.5 break-words text-fg-3">
              {`${draft.width} × ${draft.height} px · ${draft.colorSpace.toUpperCase()}${draft.dpi ? ` · ${draft.dpi} DPI` : ""} · ${bt(`추정 약 ${estimatedMb} MB`, `Est. ~${estimatedMb} MB`)}${plannedSliceCount > 1 ? ` · ${bt(`스마트 컷 분할 ${plannedSliceCount}조각`, `${plannedSliceCount} smart slices`)}` : ""}`}
              {hasCustomSpec ? ` (${platformRecommendedShortLabel})` : ""}
            </p>
          </div>
          {hasCustomSpec ? (
            <button
              type="button"
              data-testid="studio-export-reset-recommended"
              onClick={resetToRecommendedSpec}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/45 bg-accent-soft/45 px-3 py-1 text-[0.68rem] font-bold text-accent transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              <RotateCcw size={12} aria-hidden="true" />
              {bt("권장값으로 복원", "Restore recommended")}
            </button>
          ) : (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[0.68rem] font-bold text-accent">
              {bt("자동 맞춤 적용됨", "Auto-matched")}
            </span>
          )}
        </div>
      </div>

      <StudioExportScopeSummaryCard
        format={draft.format}
        summary={scopeSummary}
        onChangeSelectionMode={handleChangeSelectionMode}
        onChangeSelectionExpression={handleChangeSelectionExpression}
      />

      <StudioExportAdvancedDetails
        projectId={projectId}
        draft={effectiveDraft}
        profile={profile}
        estimatedMb={estimatedMb}
        projectFacts={projectFacts}
        onPatch={patch}
      />

      <div className={cn("mt-5 min-w-0 rounded-2xl border p-4", resultTone(displayedResult))}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 break-words text-sm font-black text-fg">
              {displayedResult?.status === "pass" ? (
                <CheckCircle2 size={17} className="shrink-0 text-success" aria-hidden="true" />
              ) : (
                <ShieldAlert
                  size={17}
                  className={cn(
                    "shrink-0",
                    displayedResult?.status === "blocked" ? "text-danger" : "text-warning",
                  )}
                  aria-hidden="true"
                />
              )}
              {displayedResult
                ? bt(displayedResult.summaryKo, displayedResult.summaryEn)
                : bt("내보내기 전에 한 번 점검해 보세요", "Run preflight for these settings")}
            </h3>
            {displayedResult ? (
              <p className="mt-1 break-words text-xs text-fg-3">
                {bt(
                  `꼭 고칠 항목 ${displayedResult.blockingCount}건 · 참고 항목 ${displayedResult.warningCount}건`,
                  `${displayedResult.blockingCount} blocking · ${displayedResult.warningCount} warnings`,
                )}
              </p>
            ) : null}
            <p
              data-testid="studio-export-commercial-gate-summary"
              className={cn(
                "mt-1.5 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.68rem] font-bold",
                commercialGateReport.passed
                  ? commercialGateReport.warningCount > 0
                    ? "border-warn/40 bg-warn/10 text-warn"
                    : "border-good/35 bg-good/10 text-good"
                  : "border-bad/40 bg-bad/10 text-bad",
              )}
            >
              {!profile.requireRightsClearance
                ? bt(
                    `개인 백업 · 상업 이용 권리는 별도로 확인하세요 · 주의 ${commercialGateReport.warningCount}건`,
                    `Personal backup · Check rights before commercial use · Warnings: ${commercialGateReport.warningCount}`,
                  )
                : commercialGateReport.passed
                ? commercialGateReport.warningCount > 0
                  ? bt(
                      `Rights BOM 통과 · 375px 모바일 가독성 주의 ${commercialGateReport.warningCount}건`,
                      `Rights BOM clear · ${commercialGateReport.warningCount} mobile legibility warning`,
                    )
                  : bt(
                      "Rights BOM 상업 라이선스 · 375px 모바일 가독성 기준 충족",
                      "Rights BOM commercial license & 375px legibility clear",
                    )
                : bt(
                    `Rights BOM 상업 출고 차단 ${commercialGateReport.blockerCount}건 (비상업 라이선스 소재 확인 필요)`,
                    `Rights BOM blocked (${commercialGateReport.blockerCount} non-commercial asset issue)`,
                  )}
            </p>
            <p
              data-testid="studio-export-psd-timelapse-spec"
              className="mt-1 break-words text-[0.68rem] text-fg-3"
            >
              {bt(
                `비파괴 PSD ${psdAndTimelapseSpec.psdGroupCount}계층 그룹 · 과정 타임랩스(${psdAndTimelapseSpec.webmMime}, 0.5×~4×) 출고 지원`,
                `Non-destructive ${psdAndTimelapseSpec.psdGroupCount}-group PSD & timelapse (${psdAndTimelapseSpec.webmMime}, 0.5×–4×) ready`,
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={runPreflight}
            disabled={owner === undefined}
            className={buttonClass({
              className:
                "min-h-11 min-w-0 gap-2 break-words focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
            })}
          >
            <FileCheck2 size={16} aria-hidden="true" />
            {bt("현재 상태 검사", "Run preflight")}
          </button>
        </div>

        {displayedResult?.findings.length ? (
          <StudioExportPreflightFindingsList
            findings={displayedResult.findings}
            baseEditorHref={manuscript?.localEditorHref ?? null}
            returnHref={returnHref}
            onBeforeJump={syncReturnStateInHistory}
          />
        ) : null}
      </div>

      <div
        role="group"
        aria-label={bt("최종 출력 이동", "Final export navigation")}
        className="mt-5 flex flex-wrap items-center justify-between gap-3"
      >
        <p className="min-w-0 break-words text-xs leading-5 text-fg-3">
          {manuscript
            ? bt(
                "편집기 내보내기에서는 선택한 형식·해상도·페이지 순서를 그대로 이어받아 내 기기에 PNG·PDF·분할 이미지를 저장할 수 있어요.",
                "Editor export receives the selected format, resolution, and page order to save PNG, PDF, or sliced images locally.",
              )
            : bt(
                "컷 자동 분할과 최종 이미지·PDF 파일 저장은 편집기 출고 화면에서 바로 마무리할 수 있어요.",
                "The editor rechecks exact segmentation, layers and file size immediately before rendering.",
              )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={manuscript?.localEditorHref ?? `/studio/p/${encodeURIComponent(projectId)}/cut`}
            data-testid="studio-export-return-workspace-link"
            className={buttonClass({
              variant: "quiet",
              className:
                "min-h-11 min-w-0 gap-1.5 break-words border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
            })}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            {bt("작업공간으로 돌아가기 (파일 미생성)", "Return to workspace (no file saved)")}
          </Link>
          {manuscript ? (
            <Link
              href={communityPublishHref}
              data-testid="studio-export-community-publish"
              className={buttonClass({
                variant: "outline",
                className:
                  "min-h-11 min-w-0 gap-1.5 break-words focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
              })}
            >
              <Globe2 size={15} aria-hidden="true" />
              {bt("커뮤니티 공개 게시 (로그인)", "Publish to community")}
            </Link>
          ) : null}
          {scopeSummary.actual.selectionValid ? (
            <Link
              href={editorHref}
              data-testid="studio-export-finalize-link"
              className={buttonClass({
                variant: displayedResult?.status === "blocked" ? "outline" : "solid",
                className:
                  "min-h-11 min-w-0 gap-2 break-words focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
              })}
            >
              {bt("편집기에서 최종 출력", "Finalize in editor")}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              disabled
              data-testid="studio-export-finalize-link"
              className={buttonClass({
                variant: "outline",
                className: "min-h-11 min-w-0 gap-2 break-words opacity-50",
              })}
            >
              {bt("페이지 범위 수정 후 최종 출력", "Fix page range to export")}
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
