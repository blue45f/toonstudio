import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  STUDIO_EXPORT_TARGET_PROFILES,
  STUDIO_EXPORT_TARGETS,
  STUDIO_UNIFIED_PUBLISH_PROFILES,
  defaultExportTargetForPublishProfile,
  evaluateCommercialExportPreflight,
  type PreflightAssetLicense,
  type PreflightBubbleBox,
  type StudioExportTargetId,
} from "./export/studio-unified-preflight-contract";
import type { StudioFloatingSurfaceLayout } from "./studio-floating-surface";
import { STUDIO_DESKTOP_FLOATING_QUERY, StudioDesktopFloatingSurface } from "./StudioDesktopFloatingSurface";
import type {
  StudioPublishComplianceChecklist,
  StudioPublishComplianceResult,
  StudioPublishContentFlags,
} from "./studio-publish-compliance";
import type {
  StudioPublishAiUsage,
  StudioPublishPreflightResult,
  StudioPublishProfile,
} from "./studio-publish-preflight";
import { useStudioModalSheet } from "./useStudioModalSheet";

import { useMediaQuery } from "@/shared/hooks/use-media-query";

const PREFLIGHT_DEFAULT_LAYOUT: StudioFloatingSurfaceLayout = {
  version: 2,
  xRatio: 1,
  yRatio: 0.04,
  width: 720,
  height: 780,
  dock: "right",
  positionLocked: false,
  sizeLocked: false,
};

const PROFILE_LABELS: Record<StudioPublishProfile, string> = {
  generic: "일반 / ToonStudio",
  webtoon: "WEBTOON CANVAS",
  tapas: "Tapas",
};

export interface StudioPublishPreflightPanelProps {
  open: boolean;
  onClose: () => void;
  profile: StudioPublishProfile;
  onProfileChange: (profile: StudioPublishProfile) => void;
  aiUsage: StudioPublishAiUsage;
  onAiUsageChange: (usage: StudioPublishAiUsage) => void;
  disclosure: string;
  onDisclosureChange: (value: string) => void;
  compliance: StudioPublishComplianceChecklist;
  onComplianceChange: (value: StudioPublishComplianceChecklist) => void;
  complianceResult: StudioPublishComplianceResult;
  result: StudioPublishPreflightResult;
  onDownloadReport: () => void;
  /** 통합 프리플라이트 센터(AC-012): 8개 출고 타깃 및 실검사 입력(생략 시 현재 프로필 기준 기본값 사용) */
  exportTarget?: StudioExportTargetId;
  onExportTargetChange?: (target: StudioExportTargetId) => void;
  documentWidthPx?: number;
  documentHeightPx?: number;
  bubbles?: readonly PreflightBubbleBox[];
  assets?: readonly PreflightAssetLicense[];
}

const CONTENT_FLAG_LABELS: Record<keyof StudioPublishContentFlags, string> = {
  sexualContent: "성적 표현",
  violence: "폭력 표현",
  strongLanguage: "강한 언어",
};

function triStateValue(value: boolean | null): string {
  return value === null ? "" : value ? "yes" : "no";
}

function readTriState(value: string): boolean | null {
  return value === "yes" ? true : value === "no" ? false : null;
}

export function StudioPublishPreflightPanel({
  open,
  onClose,
  profile,
  onProfileChange,
  aiUsage,
  onAiUsageChange,
  disclosure,
  onDisclosureChange,
  compliance,
  onComplianceChange,
  complianceResult,
  result,
  onDownloadReport,
  exportTarget: controlledExportTarget,
  onExportTargetChange,
  documentWidthPx = 800,
  documentHeightPx = 12_800,
  bubbles = [],
  assets = [],
}: StudioPublishPreflightPanelProps) {
  const isDesktop = useMediaQuery(STUDIO_DESKTOP_FLOATING_QUERY);
  const dialogRef = useRef<HTMLDivElement>(null);
  const portalRootRef = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : document.body,
  );
  const [uncontrolledTarget, setUncontrolledTarget] = useState<StudioExportTargetId>(() =>
    controlledExportTarget ?? defaultExportTargetForPublishProfile(profile),
  );
  const activeExportTarget = controlledExportTarget ?? uncontrolledTarget;

  useEffect(() => {
    if (controlledExportTarget) {
      setUncontrolledTarget(controlledExportTarget);
    }
  }, [controlledExportTarget]);

  const handleSelectExportTarget = (nextTarget: StudioExportTargetId) => {
    if (!controlledExportTarget) {
      setUncontrolledTarget(nextTarget);
    }
    onExportTargetChange?.(nextTarget);
  };

  useStudioModalSheet({
    activeKey: open && !isDesktop ? "publish-preflight" : null,
    dialogRef,
    onDismiss: onClose,
    resolveReturnFocus: () => {
      const ownerDocument = portalRootRef.current?.ownerDocument;
      return ownerDocument?.activeElement?.closest("#studio-project-actions-menu")
        ? ownerDocument.querySelector<HTMLElement>('[aria-controls="studio-project-actions-menu"]')
        : null;
    },
    rootRef: portalRootRef,
  });

  const commercialReport = useMemo(
    () =>
      evaluateCommercialExportPreflight({
        exportTarget: activeExportTarget,
        publishProfile: profile,
        documentWidthPx,
        documentHeightPx,
        bubbles,
        assets,
        thirdPartyAttributionNotes: compliance.thirdParty.used === true
          ? compliance.thirdParty.attributionNotes
          : undefined,
      }),
    [
      activeExportTarget,
      assets,
      bubbles,
      compliance.thirdParty.attributionNotes,
      compliance.thirdParty.used,
      documentHeightPx,
      documentWidthPx,
      profile,
    ],
  );

  if (!open || typeof document === "undefined") return null;

  const ready =
    result.canPublish &&
    complianceResult.readyForDestinationReview &&
    commercialReport.passed;
  const errorCount =
    result.errors.length +
    complianceResult.errors.length +
    commercialReport.blockerCount;
  const warningCount =
    result.warnings.length +
    complianceResult.warnings.length +
    commercialReport.warningCount;

  const issues = [
    ...result.issues.map((issue) => ({ ...issue, source: "구조" as const })),
    ...complianceResult.issues.map((issue) => ({ ...issue, source: "자가 점검" as const })),
    ...commercialReport.issues.map((issue) => ({
      code: issue.id,
      severity: issue.severity === "blocker" ? ("error" as const) : ("warning" as const),
      message: issue.messageKo,
      path: issue.targetId,
      source:
        issue.category === "rights-bom"
          ? ("소재 권리" as const)
          : issue.category === "mobile-legibility"
            ? ("모바일 가독성" as const)
            : ("스마트 컷" as const),
    })),
  ];

  const allChecksExplicitlyVerified =
    issues.length === 0 && commercialReport.mobileLegibility.status === "pass";

  const readinessPercent = ready
    ? commercialReport.mobileLegibility.status === "pass"
      ? 100
      : 86
    : Math.max(18, Math.round(70 / (1 + errorCount)));

  const modal = (
    <div
      ref={isDesktop ? undefined : dialogRef}
      role={isDesktop ? undefined : "dialog"}
      aria-modal={isDesktop ? undefined : true}
      aria-label={isDesktop ? undefined : "Publish Pack 사전검사"}
      tabIndex={isDesktop ? undefined : -1}
      className={isDesktop
        ? "contents"
        : "fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4"}
    >
      <div className={isDesktop
        ? "flex h-full min-h-0 w-full flex-col overflow-hidden"
        : "relative mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"}>
        {/* 상단 스펙트럼 진행 게이지 */}
        <div className="h-1 w-full shrink-0 bg-raised/70" aria-hidden="true">
          <div
            data-testid="publish-preflight-spectrum-gauge"
            className={`h-full transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              ready
                ? "bg-[linear-gradient(90deg,var(--color-accent),var(--color-cool),var(--color-good))]"
                : "bg-[linear-gradient(90deg,var(--color-warn),var(--color-bad))]"
            }`}
            style={{ width: `${readinessPercent}%` }}
          />
        </div>

        <header className={isDesktop ? "hidden" : "flex shrink-0 items-start gap-3 border-b border-line px-4 py-3"}>
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <ShieldCheck size={19} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold tracking-tight text-fg break-keep">
              원스톱 출고 · 게시 사전검사
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-3 break-keep">
              8개 출고 타깃과 3개 게시 프로필을 한 화면에서 전환하고, 모바일 가독성·스마트 컷·소재 권리(Rights BOM)를 함께 검사합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Publish Pack 사전검사 닫기"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-3 transition-colors duration-150 hover:bg-raised hover:text-fg active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {/* 8개 출고 타깃 원클릭 전환기 */}
          <section aria-label="출고 타깃 8종 선택" className="mb-4 border-b border-line/70 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <FileCheck2 size={14} className="text-accent" aria-hidden="true" />
                어디에 올릴까요? (8개 출고 타깃)
              </span>
              <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-[0.68rem] font-semibold tabular-nums text-fg-2">
                {commercialReport.targetProfile.labelKo} · 기준 {commercialReport.targetProfile.policyVersion}
              </span>
            </div>
            <div
              role="group"
              aria-label="출고 타깃 선택"
              data-testid="publish-preflight-target-group"
              className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4"
            >
              {STUDIO_EXPORT_TARGETS.map((targetId) => {
                const meta = STUDIO_EXPORT_TARGET_PROFILES[targetId];
                const active = activeExportTarget === targetId;
                return (
                  <button
                    key={targetId}
                    type="button"
                    aria-pressed={active}
                    data-testid={`publish-preflight-target-${targetId}`}
                    onClick={() => handleSelectExportTarget(targetId)}
                    className={`min-h-11 rounded-xl border px-2.5 py-1.5 text-left text-xs font-bold transition-[transform,border-color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none motion-reduce:transition-none ${
                      active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
                    }`}
                  >
                    <span className="block truncate">{meta.labelKo}</span>
                    <span className="mt-0.5 block truncate text-[0.65rem] font-normal text-fg-3">
                      {meta.requireRightsClearance ? "상업 권리 검사" : "개인 백업 전용"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className={isDesktop ? "grid gap-3 @lg:grid-cols-2" : "grid gap-3 sm:grid-cols-2"}>
            <label className="text-xs font-semibold text-fg-2">
              게시 목적지
              <select
                value={profile}
                onChange={(event) => {
                  const nextProfile = event.target.value as StudioPublishProfile;
                  onProfileChange(nextProfile);
                  if (!controlledExportTarget) {
                    setUncontrolledTarget(defaultExportTargetForPublishProfile(nextProfile));
                  }
                }}
                className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              >
                {STUDIO_UNIFIED_PUBLISH_PROFILES.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.labelKo}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-fg-2">
              AI 사용 유형
              <select
                value={aiUsage}
                onChange={(event) => onAiUsageChange(event.target.value as StudioPublishAiUsage)}
                className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              >
                <option value="none">사용하지 않음</option>
                <option value="assisted">보조 사용 · 번역/아이디어/수정</option>
                <option value="generated">생성 이미지 포함</option>
              </select>
            </label>
          </div>

          <label className="mt-3 block text-xs font-semibold text-fg-2">
            AI 사용 고지
            <textarea
              value={disclosure}
              onChange={(event) => onDisclosureChange(event.target.value.slice(0, 1_000))}
              rows={3}
              placeholder="예: 일부 배경 이미지를 생성형 AI로 제작했고 작가가 직접 편집·검수했습니다."
              disabled={aiUsage === "none"}
              className="mt-1.5 w-full resize-y rounded-lg border border-line bg-card px-3 py-2 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent disabled:opacity-50"
            />
          </label>

          {/* 3대 실검사 결과 (375px 말풍선 가독성 · 스마트 컷 분할 · Rights BOM 상업 라이선스) */}
          <section
            aria-label="상용 출고 3대 실검사"
            data-testid="publish-preflight-commercial-checks"
            className="mt-4 rounded-xl border border-line bg-card/55 p-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2.5">
              <h3 className="text-sm font-bold text-fg">
                실시간 출고 품질 · 권리 실검사
              </h3>
              <span className="text-[0.68rem] font-semibold tabular-nums text-fg-3">
                {documentWidthPx} × {documentHeightPx}px ·{" "}
                {commercialReport.exportMode === "commercial" ? "상업 연재 모드" : "개인 백업 모드"}
              </span>
            </div>

            <ul className="mt-2.5 divide-y divide-line/60 text-xs">
              <li
                data-testid="publish-preflight-check-legibility"
                className="flex items-start gap-2.5 py-2.5 first:pt-0"
              >
                <Smartphone
                  size={15}
                  aria-hidden="true"
                  className={`mt-0.5 shrink-0 ${
                    commercialReport.mobileLegibility.status === "pass"
                      ? "text-good"
                      : commercialReport.mobileLegibility.status === "warning"
                        ? "text-warn"
                        : "text-cool"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="font-bold text-fg">375px 모바일 말풍선 가독성</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
                        commercialReport.mobileLegibility.status === "pass"
                          ? "bg-good/15 text-good"
                          : commercialReport.mobileLegibility.status === "warning"
                            ? "bg-warn/15 text-warn"
                            : "bg-cool/15 text-cool"
                      }`}
                    >
                      {commercialReport.mobileLegibility.status === "pass"
                        ? "가독성 충족"
                        : commercialReport.mobileLegibility.status === "warning"
                          ? `작은 대사 ${commercialReport.mobileLegibility.warningCount}곳`
                          : "직접 확인 필요"}
                    </span>
                  </div>
                  <p className="mt-0.5 leading-relaxed text-fg-2 break-keep">
                    {commercialReport.mobileLegibility.summaryKo}
                  </p>
                </div>
              </li>

              <li
                data-testid="publish-preflight-check-smart-slice"
                className="flex items-start gap-2.5 py-2.5"
              >
                <Scissors
                  size={15}
                  aria-hidden="true"
                  className={`mt-0.5 shrink-0 ${
                    commercialReport.smartSlice.status === "adjusted" ? "text-accent" : "text-good"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="font-bold text-fg">스마트 컷 분할 (대사 절단 보호)</span>
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-bold tabular-nums text-accent">
                      {commercialReport.smartSlice.sliceCount}조각 계획
                    </span>
                  </div>
                  <p className="mt-0.5 leading-relaxed text-fg-2 break-keep">
                    {commercialReport.smartSlice.summaryKo}
                  </p>
                </div>
              </li>

              <li
                data-testid="publish-preflight-check-rights-bom"
                className="flex items-start gap-2.5 py-2.5 last:pb-0"
              >
                {commercialReport.rightsBom.status === "blocked" ? (
                  <ShieldAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
                ) : (
                  <ShieldCheck
                    size={15}
                    aria-hidden="true"
                    className={`mt-0.5 shrink-0 ${
                      commercialReport.rightsBom.status === "pass" ? "text-good" : "text-cool"
                    }`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="font-bold text-fg">Rights BOM 상업 라이선스 (NC·GPL 차단)</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
                        commercialReport.rightsBom.status === "blocked"
                          ? "bg-bad/15 text-bad"
                          : commercialReport.rightsBom.status === "pass"
                            ? "bg-good/15 text-good"
                            : "bg-cool/15 text-cool"
                      }`}
                    >
                      {commercialReport.rightsBom.status === "blocked"
                        ? `상업 출고 차단 ${commercialReport.rightsBom.blockerCount}건`
                        : commercialReport.rightsBom.status === "pass"
                          ? "상업 이용 가능"
                          : "개인 백업 전용"}
                    </span>
                  </div>
                  <p className="mt-0.5 leading-relaxed text-fg-2 break-keep">
                    {commercialReport.rightsBom.summaryKo}
                  </p>
                </div>
              </li>
            </ul>
          </section>

          <section className="mt-4 rounded-xl border border-line bg-card/40 p-3" aria-labelledby="publish-compliance-title">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 id="publish-compliance-title" className="text-sm font-bold text-fg">
                  권리·등급 자체 점검
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-3 break-keep">
                  작품 내용과 사용 소재를 직접 확인한 결과를 Publish Pack에 함께 보관합니다.
                </p>
              </div>
              <span className="rounded-full border border-line bg-panel px-2 py-1 text-[0.65rem] font-semibold text-fg-3">
                체크리스트 v{compliance.version}
              </span>
            </div>

            <div className={isDesktop ? "mt-3 grid gap-3 @lg:grid-cols-2" : "mt-3 grid gap-3 sm:grid-cols-2"}>
              <label className="text-xs font-semibold text-fg-2">
                예상 독자 등급
                <select
                  value={compliance.audienceRating ?? ""}
                  onChange={(event) =>
                    onComplianceChange({
                      ...compliance,
                      audienceRating:
                        event.target.value === "all" ||
                        event.target.value === "teen" ||
                        event.target.value === "mature"
                          ? event.target.value
                          : null,
                    })
                  }
                  className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                >
                  <option value="">선택해 주세요</option>
                  <option value="all">전체 이용가 예상</option>
                  <option value="teen">청소년 이용가 예상</option>
                  <option value="mature">성인 이용가 예상</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-fg-2">
                제3자 콘텐츠 사용
                <select
                  value={triStateValue(compliance.thirdParty.used)}
                  onChange={(event) => {
                    const used = readTriState(event.target.value);
                    onComplianceChange({
                      ...compliance,
                      thirdParty: {
                        used,
                        licensesConfirmed: used === true ? compliance.thirdParty.licensesConfirmed : false,
                        attributionNotes: used === true ? compliance.thirdParty.attributionNotes : "",
                      },
                    });
                  }}
                  className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                >
                  <option value="">선택해 주세요</option>
                  <option value="no">사용하지 않음</option>
                  <option value="yes">폰트·사진·소재 등을 사용함</option>
                </select>
              </label>
            </div>

            <fieldset className="mt-3">
              <legend className="text-xs font-semibold text-fg-2">민감 표현 포함 여부</legend>
              <div className={isDesktop ? "mt-1.5 grid gap-2 @xl:grid-cols-3" : "mt-1.5 grid gap-2 sm:grid-cols-3"}>
                {(Object.keys(CONTENT_FLAG_LABELS) as Array<keyof StudioPublishContentFlags>).map((flag) => (
                  <label key={flag} className="text-[0.7rem] font-semibold text-fg-3">
                    {CONTENT_FLAG_LABELS[flag]}
                    <select
                      value={triStateValue(compliance.contentFlags[flag])}
                      onChange={(event) =>
                        onComplianceChange({
                          ...compliance,
                          contentFlags: {
                            ...compliance.contentFlags,
                            [flag]: readTriState(event.target.value),
                          },
                        })
                      }
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-xs text-fg outline-none focus:border-accent"
                    >
                      <option value="">미확인</option>
                      <option value="no">없음</option>
                      <option value="yes">있음</option>
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className={isDesktop ? "mt-3 grid gap-2 @lg:grid-cols-2" : "mt-3 grid gap-2 sm:grid-cols-2"}>
              <label className="flex min-h-11 items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs leading-relaxed text-fg-2">
                <input
                  type="checkbox"
                  checked={compliance.ownershipRightsConfirmed}
                  onChange={(event) =>
                    onComplianceChange({ ...compliance, ownershipRightsConfirmed: event.target.checked })
                  }
                  className="mt-0.5 accent-accent"
                />
                원본을 소유하거나 게시할 권한이 있습니다.
              </label>
              <label className="flex min-h-11 items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs leading-relaxed text-fg-2">
                <input
                  type="checkbox"
                  checked={compliance.referenceRightsConfirmed}
                  onChange={(event) =>
                    onComplianceChange({ ...compliance, referenceRightsConfirmed: event.target.checked })
                  }
                  className="mt-0.5 accent-accent"
                />
                참고 자료와 원본에 필요한 이용 권리를 확인했습니다.
              </label>
              {compliance.thirdParty.used === true ? (
                <label className="flex min-h-11 items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs leading-relaxed text-fg-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={compliance.thirdParty.licensesConfirmed}
                    onChange={(event) =>
                      onComplianceChange({
                        ...compliance,
                        thirdParty: { ...compliance.thirdParty, licensesConfirmed: event.target.checked },
                      })
                    }
                    className="mt-0.5 accent-accent"
                  />
                  사용한 제3자 콘텐츠의 게시·상업 이용 범위와 라이선스를 확인했습니다.
                </label>
              ) : null}
              {aiUsage !== "none" ? (
                <label className="flex min-h-11 items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs leading-relaxed text-fg-2">
                  <input
                    type="checkbox"
                    checked={compliance.aiDisclosureConfirmed}
                    onChange={(event) =>
                      onComplianceChange({ ...compliance, aiDisclosureConfirmed: event.target.checked })
                    }
                    className="mt-0.5 accent-accent"
                  />
                  선택한 게시처에 필요한 AI 사용 고지를 확인했습니다.
                </label>
              ) : null}
              <label className="flex min-h-11 items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs leading-relaxed text-fg-2">
                <input
                  type="checkbox"
                  checked={compliance.policyReviewConfirmed}
                  onChange={(event) =>
                    onComplianceChange({ ...compliance, policyReviewConfirmed: event.target.checked })
                  }
                  className="mt-0.5 accent-accent"
                />
                선택한 게시처의 최신 콘텐츠·권리·AI 정책을 직접 검토했습니다.
              </label>
            </div>

            {compliance.thirdParty.used === true ? (
              <label className="mt-3 block text-xs font-semibold text-fg-2">
                제3자 콘텐츠 출처·라이선스 메모
                <textarea
                  value={compliance.thirdParty.attributionNotes}
                  onChange={(event) =>
                    onComplianceChange({
                      ...compliance,
                      thirdParty: {
                        ...compliance.thirdParty,
                        attributionNotes: event.target.value.slice(0, 4_000),
                      },
                    })
                  }
                  rows={3}
                  placeholder="소재명, 저작자/출처, 라이선스, 표시 문구 등을 기록하세요."
                  className="mt-1.5 w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent"
                />
              </label>
            ) : null}

            <p className="mt-3 rounded-lg border border-warning/25 bg-warning-soft/15 px-3 py-2 text-[0.68rem] leading-relaxed text-fg-3">
              {complianceResult.disclaimer}
            </p>
          </section>

          <div
            data-testid="publish-preflight-summary-banner"
            className={`mt-4 flex items-start gap-3 rounded-xl border p-3 ${
              ready ? "border-good/40 bg-good/12" : "border-bad/40 bg-bad/12"
            }`}
            role="status"
          >
            {ready ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-good" aria-hidden />
            ) : (
              <XCircle size={18} className="mt-0.5 shrink-0 text-bad" aria-hidden />
            )}
            <div>
              <p className="text-sm font-bold text-fg break-keep">
                {ready
                  ? commercialReport.mobileLegibility.status === "pass"
                    ? "출고·게시 필수 실검사를 모두 통과했어요"
                    : commercialReport.mobileLegibility.status === "warning"
                      ? "출고 차단은 없지만 375px 모바일 대사 경고를 확인하세요"
                      : "필수 차단 항목은 없지만 375px 모바일 대사 확인이 남아 있어요"
                  : `출고 차단 항목 ${errorCount}개를 해결해야 합니다`}
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-fg-3">
                오류 {errorCount}개 · 경고 {warningCount}개 · 타깃 {commercialReport.targetProfile.labelKo} · 프로필 {PROFILE_LABELS[profile]}
              </p>
            </div>
          </div>

          {allChecksExplicitlyVerified ? (
            <p className="mt-4 rounded-xl border border-line bg-card/50 px-3 py-4 text-center text-xs text-fg-3 break-keep">
              {r3c07StatusText(
                "studio.panelStatus.r3c07.publishPreflight.noIssues",
                "발견된 문제가 없습니다. 실제 업로드 직전에는 목적지의 최신 공지와 규격도 다시 확인하세요.",
              )}
            </p>
          ) : issues.length === 0 ? (
            <p className="mt-4 rounded-xl border border-cool/35 bg-cool/10 px-3 py-3 text-xs leading-relaxed text-fg-2 break-keep">
              구조·권리 차단 오류는 없으나, 대사 텍스트 박스가 연결되지 않아 375px 모바일 말풍선 크기는 미리보기에서 한 번 더 확인하세요.
            </p>
          ) : (
            <ol className="mt-4 space-y-2" aria-label="게시 사전검사 결과">
              {issues.map((item, index) => (
                <li
                  key={`${item.source}:${item.code}:${item.path ?? "root"}:${index}`}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${
                    item.severity === "error"
                      ? "border-bad/30 bg-bad/10 text-bad"
                      : "border-warning/30 bg-warning-soft/20 text-warning"
                  }`}
                >
                  {item.severity === "error" ? (
                    <XCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
                  ) : (
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 break-keep">
                    <span className="mr-1 rounded border border-current/20 px-1 py-0.5 text-[0.6rem] font-bold opacity-75">
                      {item.source}
                    </span>
                    <span className="font-semibold">{item.message}</span>
                    {item.path && <span className="mt-0.5 block font-mono text-[0.65rem] opacity-70">{item.path}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <p className="mr-auto text-[0.68rem] leading-relaxed text-fg-3 break-keep">
            플랫폼 한도는 바뀔 수 있어 보고서에 고정 수치로 단정하지 않습니다.
          </p>
          <button
            type="button"
            onClick={onDownloadReport}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:bg-raised active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none"
          >
            <Download size={13} aria-hidden /> 검사 보고서 JSON
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-xs font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none"
          >
            확인
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(
    isDesktop ? (
      <StudioDesktopFloatingSurface
        surfaceId="publish-preflight"
        label="Publish Pack 사전검사"
        defaultLayout={PREFLIGHT_DEFAULT_LAYOUT}
        onClose={onClose}
        minWidth={480}
        minHeight={420}
        maxWidth={960}
        maxHeight={1100}
        contentClassName="min-h-0 overflow-hidden"
      >
        {modal}
      </StudioDesktopFloatingSurface>
    ) : modal,
    document.body,
  );
}
