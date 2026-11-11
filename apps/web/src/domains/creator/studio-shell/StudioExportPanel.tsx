import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  Globe2,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import {
  runStudioExportPreflight,
  STUDIO_EXPORT_TARGET_PROFILES,
  STUDIO_EXPORT_TARGETS,
  type StudioExportPreflightResult,
  type StudioExportTargetId,
} from "../studio-export-preflight";
import { readStudioProjectDocuments } from "../studio-project-document-reader";
import {
  createStudioProjectExportSnapshot,
  recommendedStudioExportDraft,
  type StudioExportDraftInput,
} from "../studio-project-export-snapshot";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { resolveStudioProjectResumeTarget } from "../studio-project-resume-target";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { useStudioProjectWorkspace } from "./useStudioProjectWorkspace";

const EXPORT_TARGET_VISUALS: Readonly<Record<StudioExportTargetId, string>> = {
  "webtoon-platform": "/brand/theme-scenes/ink-studio.svg",
  social: "/brand/theme-scenes/blossom-studio.svg",
  print: "/brand/theme-scenes/paper-studio.svg",
  "image-pdf": "/brand/theme-scenes/sepia-studio.svg",
  editable: "/brand/theme-scenes/graphite-studio.svg",
  ebook: "/brand/theme-scenes/aurora-studio.svg",
  video: "/brand/theme-scenes/starlight-studio.svg",
  archive: "/brand/theme-scenes/midnight-studio.svg",
};

interface LocalProjectExportContext {
  readonly documentId: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly localEditorHref: string;
}

function readLocalProjectExportContext(
  projectId: string,
  locale: "ko" | "en",
): LocalProjectExportContext | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    const project = readStudioProjectLibrary(storage).projects.find(
      (item) => item.id === projectId,
    );
    const docs = readStudioProjectDocuments(storage, projectId).documents.filter(
      (doc) => doc.status !== "trashed",
    );
    const activeDoc = docs.find((doc) => doc.status === "active") ?? docs[0] ?? null;
    if (!activeDoc) return null;
    const resumeHref = project
      ? resolveStudioProjectResumeTarget(storage, project, locale).href
      : `/studio/p/${encodeURIComponent(projectId)}/d/${encodeURIComponent(activeDoc.id)}`;
    return {
      documentId: activeDoc.id,
      width: activeDoc.width,
      height: activeDoc.height,
      localEditorHref: resumeHref,
    };
  } catch {
    return null;
  }
}

function buildInitialDraft(
  projectId: string,
  target: StudioExportTargetId,
  localContext: LocalProjectExportContext | null,
): StudioExportDraftInput {
  const recommended = recommendedStudioExportDraft(projectId, target);
  if (!localContext) return recommended;
  return {
    ...recommended,
    documentId: localContext.documentId,
    width: localContext.width ?? recommended.width,
    height: localContext.height ?? recommended.height,
  };
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function updatePreflight(
  results: readonly StudioExportPreflightResult[],
  next: StudioExportPreflightResult,
): readonly StudioExportPreflightResult[] {
  return Object.freeze(
    [
      ...results.filter(
        (item) => item.target !== next.target || item.policyVersion !== next.policyVersion,
      ),
      next,
    ].sort((a, b) =>
      `${a.target}:${a.policyVersion}`.localeCompare(`${b.target}:${b.policyVersion}`),
    ),
  );
}

function resultTone(result: StudioExportPreflightResult | null): string {
  if (!result) return "border-line bg-panel";
  if (result.status === "pass") return "border-success/30 bg-success-soft/15";
  if (result.status === "warning") return "border-warning/35 bg-warning-soft/15";
  return "border-danger/35 bg-danger-soft/15";
}

/**
 * 초보자도 올릴 곳과 파일 형식만 고르면 실제 원고 해상도와 플랫폼 권장 규격을 대조 점검하고,
 * 비로그인 로컬 편집기 파일 저장과 로그인 후 커뮤니티 공개 게시를 헷갈리지 않고 선택할 수 있는 출고 패널.
 */
export function StudioExportPanel({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: "ko" | "en";
}) {
  const bt = useBilingual("StudioExportPanel");
  const workspace = useStudioProjectWorkspace(projectId, locale);
  const localContext = useMemo(
    () => readLocalProjectExportContext(projectId, locale),
    [projectId, locale],
  );
  const [target, setTarget] = useState<StudioExportTargetId>("webtoon-platform");
  const [draft, setDraft] = useState<StudioExportDraftInput>(() =>
    buildInitialDraft(projectId, "webtoon-platform", localContext),
  );
  const [result, setResult] = useState<StudioExportPreflightResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profile = STUDIO_EXPORT_TARGET_PROFILES[target];
  const recommendedDraft = useMemo(
    () => recommendedStudioExportDraft(projectId, target),
    [projectId, target],
  );
  const hasCustomSpec =
    draft.width !== recommendedDraft.width ||
    draft.height !== recommendedDraft.height ||
    draft.format !== recommendedDraft.format ||
    draft.dpi !== recommendedDraft.dpi ||
    draft.colorSpace !== recommendedDraft.colorSpace;
  const savedResult =
    workspace.state?.exportPreflights.find(
      (item) => item.target === target && item.policyVersion === profile.policyVersion,
    ) ?? null;
  const displayedResult = result ?? savedResult;

  const projectFacts = useMemo(() => {
    const state = workspace.state;
    return {
      blockedAssets: state?.assets.filter((asset) => asset.status === "blocked").length ?? 0,
      warningAssets: state?.assets.filter((asset) => asset.status === "warning").length ?? 0,
      localization:
        state?.localization.reduce((sum, item) => sum + item.blockingIssueCount, 0) ?? 0,
      comments:
        state?.reviewSession.threads.filter((thread) => thread.status === "open").length ?? 0,
    };
  }, [workspace.state]);

  const selectTarget = (nextTarget: StudioExportTargetId) => {
    setTarget(nextTarget);
    setDraft(buildInitialDraft(projectId, nextTarget, localContext));
    setResult(null);
    setMessage(null);
    setError(null);
  };

  const resetToRecommendedSpec = () => {
    const next = recommendedStudioExportDraft(projectId, target);
    setDraft(
      localContext ? { ...next, documentId: localContext.documentId } : next,
    );
    setResult(null);
    setMessage(
      bt(
        "선택한 올릴 곳의 권장 해상도·형식으로 되돌렸어요.",
        "Restored the recommended resolution and format for this destination.",
      ),
    );
    setError(null);
  };

  const patch = <K extends keyof StudioExportDraftInput>(
    key: K,
    value: StudioExportDraftInput[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setResult(null);
    setMessage(null);
  };

  const runPreflight = () => {
    if (!workspace.state) {
      setError(
        bt(
          "작품 정보를 아직 불러오지 못했어요. 페이지를 새로고침한 뒤 다시 검사해 주세요.",
          "Reload project state before running preflight.",
        ),
      );
      return;
    }
    try {
      const next = runStudioExportPreflight(
        target,
        createStudioProjectExportSnapshot(workspace.state, { ...draft, target }),
      );
      const updated = workspace.update((current) => ({
        ...current,
        exportPreflights: updatePreflight(current.exportPreflights, next),
      }));
      if (!updated) throw new Error("검사 결과를 기기에 저장하지 못했어요.");
      setResult(next);
      setMessage(
        bt(
          "지금 설정으로 출고 전 점검을 마치고 결과를 저장했어요.",
          "Saved preflight from the current project state.",
        ),
      );
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : bt(
              "출고 전 점검을 실행하지 못했어요. 잠시 후 다시 눌러 주세요.",
              "Preflight could not be completed.",
            ),
      );
    }
  };

  const editorHref = localContext
    ? localContext.localEditorHref
    : `/studio/work/${encodeURIComponent(projectId)}/publish`;
  const communityPublishHref = localContext
    ? "/studio/publish"
    : `/studio/work/${encodeURIComponent(projectId)}/publish`;
  const estimatedMb = Math.round((draft.estimatedFileSizeBytes / 1024 / 1024) * 10) / 10;

  return (
    <section
      className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6"
      aria-labelledby="project-export-title"
      data-testid="studio-export-panel"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <FileCheck2 size={14} aria-hidden="true" />{" "}
            {bt("3단계 · 저장·내보내기 점검", "STEP 3 · EXPORT CHECK")}
          </p>
          <h2
            id="project-export-title"
            className="mt-2 text-2xl font-black tracking-tight text-fg"
          >
            {bt(
              "올릴 곳을 고르면 알맞은 규격을 자동으로 맞춰 드려요",
              "Pick where to publish and get matching specs automatically",
            )}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
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
        <span className="inline-flex min-h-9 items-center rounded-full border border-line bg-panel px-3 text-xs font-bold text-fg-2">
          {bt(`규격 기준 ${profile.policyVersion}`, `Policy ${profile.policyVersion}`)}
        </span>
      </div>

      {workspace.error || error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/20 px-3 py-2 text-xs font-semibold text-danger"
        >
          {error ?? workspace.error}
        </p>
      ) : null}
      {message ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-success/30 bg-success-soft/20 px-3 py-2 text-xs font-semibold text-success"
        >
          {message}
        </p>
      ) : null}

      <div
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
                "group min-w-0 overflow-hidden rounded-xl border text-left text-xs font-bold transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transform-none",
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

      {/* 자주 쓰는 파일 형식 선택과 자동 맞춰진 규격 요약을 한눈에 배치 */}
      <div className="mt-5 grid gap-3 rounded-2xl border border-line bg-panel/45 p-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:items-end">
        <label className="text-xs font-bold text-fg-2">
          {bt("파일 형식", "File format")}
          <select
            aria-label={bt("형식", "Format")}
            value={draft.format}
            onChange={(event) => patch("format", event.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm font-bold text-fg"
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
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/80 bg-card px-3.5 py-2.5 text-xs text-fg-2"
        >
          <div>
            <strong className="font-bold text-fg">
              {bt(profile.labelKo, profile.labelEn)}{` `}
              {hasCustomSpec
                ? localContext &&
                  draft.width === localContext.width &&
                  draft.height === localContext.height
                  ? bt("현재 원고 크기 기준", "current manuscript size")
                  : bt("직접 조정한 규격", "custom spec")
                : bt("권장 규격", "recommended spec")}
            </strong>
            <p className="mt-0.5 text-fg-3">
              {`${draft.width} × ${draft.height} px · ${draft.colorSpace.toUpperCase()}${draft.dpi ? ` · ${draft.dpi} DPI` : ""} · ${bt(`예상 ${estimatedMb} MB`, `Est. ${estimatedMb} MB`)}`}
              {hasCustomSpec
                ? ` (${bt(`권장 ${recommendedDraft.width} × ${recommendedDraft.height}px`, `Recommended ${recommendedDraft.width} × ${recommendedDraft.height}px`)})`
                : ""}
            </p>
          </div>
          {hasCustomSpec ? (
            <button
              type="button"
              data-testid="studio-export-reset-recommended"
              onClick={resetToRecommendedSpec}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-accent/45 bg-accent-soft/45 px-3 py-1 text-[0.68rem] font-bold text-accent transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
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

      {/* 초보자에게 부담스러운 7가지 세부 수치·체크박스는 접힘 영역으로 분리 */}
      <details
        data-testid="studio-export-advanced-settings"
        className="mt-4 rounded-2xl border border-line bg-panel/35 p-4"
      >
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <SlidersHorizontal size={15} className="text-accent" aria-hidden="true" />
          <span>
            {bt(
              "해상도·DPI·색 공간·접근성 세부 설정 (필요할 때만 변경)",
              "Detailed resolution, DPI, color space & accessibility (optional)",
            )}
          </span>
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold text-fg-2">
            {bt("가로 폭", "Width")}
            <input
              type="number"
              min={1}
              value={draft.width}
              onChange={(event) => patch("width", numberValue(event.target.value, draft.width))}
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
            />
          </label>
          <label className="text-xs font-bold text-fg-2">
            {bt("전체 높이", "Height")}
            <input
              type="number"
              min={1}
              value={draft.height}
              onChange={(event) => patch("height", numberValue(event.target.value, draft.height))}
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
            />
          </label>
          <label className="text-xs font-bold text-fg-2">
            {bt("예상 용량 (MB)", "Estimated size (MB)")}
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={estimatedMb}
              onChange={(event) =>
                patch("estimatedFileSizeBytes", numberValue(event.target.value, 1) * 1024 * 1024)
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
            />
          </label>
          <label className="text-xs font-bold text-fg-2">
            DPI
            <input
              type="number"
              min={1}
              value={draft.dpi ?? ""}
              onChange={(event) =>
                patch("dpi", event.target.value ? numberValue(event.target.value, 72) : null)
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
              placeholder={bt("웹 연재는 자동", "Automatic for web")}
            />
          </label>
          <label className="text-xs font-bold text-fg-2">
            {bt("색 공간", "Color space")}
            <select
              value={draft.colorSpace}
              onChange={(event) => patch("colorSpace", event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
            >
              {(profile.allowedColorSpaces ?? ["srgb"]).map((space) => (
                <option key={space} value={space}>
                  {space.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-fg-2">
            {bt("가장 작은 글자 (px)", "Smallest text (px)")}
            <input
              type="number"
              min={1}
              value={draft.minimumTextPx ?? ""}
              onChange={(event) =>
                patch(
                  "minimumTextPx",
                  event.target.value ? numberValue(event.target.value, 12) : null,
                )
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
            />
          </label>
          <label className="text-xs font-bold text-fg-2">
            {bt("대체 텍스트 범위", "Alt text coverage")}
            <select
              value={String(draft.altTextCoverage)}
              onChange={(event) => patch("altTextCoverage", Number(event.target.value))}
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
            >
              <option value="0">0%</option>
              <option value="0.5">50%</option>
              <option value="1">100%</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["readingOrderComplete", bt("읽기 순서 완료", "Reading order complete")],
              ["aiDisclosurePrepared", bt("AI 보조 사용 표기 준비", "AI disclosure prepared")],
              ["captionsComplete", bt("자막·대본 준비 완료", "Captions complete")],
              ["editableStructurePreserved", bt("레이어 편집 구조 유지", "Editable structure preserved")],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2"
            >
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(event) => patch(key, event.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
      </details>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            {
              id: "rights",
              label: bt("권리 확인 필요 소재", "Blocked assets"),
              count: projectFacts.blockedAssets,
              href: `/studio/p/${encodeURIComponent(projectId)}/assets?view=rights`,
              cta: bt("권리 확인하기", "Check rights"),
            },
            {
              id: "missing",
              label: bt("사용 조건 주의 소재", "Asset warnings"),
              count: projectFacts.warningAssets,
              href: `/studio/p/${encodeURIComponent(projectId)}/assets?view=missing`,
              cta: bt("소재 점검하기", "Inspect assets"),
            },
            {
              id: "localization",
              label: bt("다국어 대사 넘침", "Localization blocks"),
              count: projectFacts.localization,
              href: `/studio/p/${encodeURIComponent(projectId)}/story?view=localization`,
              cta: bt("대사 길이 보기", "Check dialogue"),
            },
            {
              id: "review",
              label: bt("남은 피드백 메모", "Open review"),
              count: projectFacts.comments,
              href: `/studio/p/${encodeURIComponent(projectId)}/review`,
              cta: bt("피드백 열기", "Open review"),
            },
          ] as const
        ).map((item) => (
          <Link
            key={item.id}
            href={item.href}
            data-testid={`studio-export-jump-${item.id}`}
            className="group flex min-h-20 flex-col justify-between rounded-xl border border-line bg-panel p-3 transition-colors hover:border-accent/50 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <div>
              <p className="text-[0.68rem] text-fg-3">{item.label}</p>
              <b className={cn("mt-1 block text-lg", item.count > 0 ? "text-warning" : "text-fg")}>
                {item.count}
              </b>
            </div>
            <span className="mt-2 inline-flex items-center gap-1 text-[0.68rem] font-bold text-accent">
              <span>{item.cta}</span>
              <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>

      <div className={cn("mt-5 rounded-2xl border p-4", resultTone(displayedResult))}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black text-fg">
              {displayedResult?.status === "pass" ? (
                <CheckCircle2 size={17} className="text-success" aria-hidden="true" />
              ) : (
                <ShieldAlert
                  size={17}
                  className={displayedResult?.status === "blocked" ? "text-danger" : "text-warning"}
                  aria-hidden="true"
                />
              )}
              {displayedResult
                ? bt(displayedResult.summaryKo, displayedResult.summaryEn)
                : bt("내보내기 전에 한 번 점검해 보세요", "Run preflight for these settings")}
            </h3>
            {displayedResult ? (
              <p className="mt-1 text-xs text-fg-3">
                {bt(
                  `꼭 고칠 항목 ${displayedResult.blockingCount}건 · 참고 항목 ${displayedResult.warningCount}건`,
                  `${displayedResult.blockingCount} blocking · ${displayedResult.warningCount} warnings`,
                )}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={runPreflight}
            className={buttonClass({ className: "min-h-11 gap-2" })}
          >
            <FileCheck2 size={16} aria-hidden="true" />
            {bt("현재 상태 검사", "Run preflight")}
          </button>
        </div>

        {displayedResult?.findings.length ? (
          <ul className="mt-4 space-y-2">
            {displayedResult.findings.map((finding) => (
              <li
                key={finding.code}
                className="rounded-xl border border-line bg-card/70 p-3 text-xs leading-5 text-fg-2"
              >
                <b
                  className={
                    finding.severity === "error"
                      ? "text-danger"
                      : finding.severity === "warning"
                        ? "text-warning"
                        : "text-fg"
                  }
                >
                  {bt(finding.messageKo, finding.messageEn)}
                </b>
                <span className="mt-1 block text-fg-3">
                  {bt(finding.suggestedActionKo, finding.suggestedActionEn)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-fg-3">
          {localContext
            ? bt(
                "편집기 내보내기에서는 로그인 없이 내 기기에 PNG·PDF·분할 이미지를 저장할 수 있고, 게시판 공개는 로그인 후 진행됩니다.",
                "Export PNG, PDF, or sliced images locally in the editor without signing in, or publish publicly to the community.",
              )
            : bt(
                "컷 자동 분할과 최종 이미지·PDF 파일 저장은 편집기 출고 화면에서 바로 마무리할 수 있어요.",
                "The editor rechecks exact segmentation, layers and file size immediately before rendering.",
              )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {localContext ? (
            <Link
              href={communityPublishHref}
              data-testid="studio-export-community-publish"
              className={buttonClass({
                variant: "outline",
                className: "min-h-11 gap-1.5",
              })}
            >
              <Globe2 size={15} aria-hidden="true" />
              {bt("커뮤니티 공개 게시 (로그인)", "Publish to community")}
            </Link>
          ) : null}
          <Link
            href={editorHref}
            data-testid="studio-export-finalize-link"
            className={buttonClass({
              variant: displayedResult?.status === "blocked" ? "outline" : "solid",
              className: "min-h-11 gap-2",
            })}
          >
            {bt("편집기에서 최종 출력", "Finalize in editor")}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
