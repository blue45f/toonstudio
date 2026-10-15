import { PackageOpen, TriangleAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import { readStudioProjectDocuments } from "../studio-project-document-reader";
import { readStudioProjectLibrary } from "../studio-project-library-reader";
import { useStudioProjectWorkspace } from "../studio-shell/useStudioProjectWorkspace";
import { submissionTargetWidth } from "./submission-package-preflight";
import { buildSubmissionCharacterSheets } from "./submission-package-story";
import { resolveSubmissionLocale } from "./submission-package-messages";
import { SubmissionBuildPanel } from "./SubmissionBuildPanel";
import { SubmissionCharacterPicker } from "./SubmissionCharacterPicker";
import { SubmissionEpisodeSection } from "./SubmissionEpisodeSection";
import { SubmissionOptions } from "./SubmissionOptions";
import { SubmissionPreflightReport } from "./SubmissionPreflightReport";
import { SubmissionStoryFields } from "./SubmissionStoryFields";
import type { SubmissionDocumentSeed } from "./use-submission-package-draft";
import { useSubmissionPackageDraft } from "./use-submission-package-draft";
import type { SubmissionDraftStorage } from "./submission-package-draft-store";
import { useSubmissionPackageBuild, type SubmissionBuildDeps } from "./use-submission-package-build";
import type { SubmissionPackageLocale } from "./submission-package-types";

export interface StudioSubmissionPackagePanelProps {
  readonly projectId: string;
  readonly locale: SubmissionPackageLocale;
  /** 시험용 주입. 기본은 이 브라우저의 localStorage. */
  readonly draftStorage?: SubmissionDraftStorage | null;
  /** 시험용 주입. 기본은 브라우저 Worker CRC·캔버스 PDF·파일 선택기 저장. */
  readonly buildDeps?: SubmissionBuildDeps;
}

interface ProjectSeed {
  readonly title: string;
  readonly description: string;
  readonly documents: readonly SubmissionDocumentSeed[];
}

const EMPTY_SEED: ProjectSeed = Object.freeze({ title: "", description: "", documents: Object.freeze([]) });

/** 이 브라우저에 있는 프로젝트의 이름·설명·웹툰 문서 목록을 한 번 읽는다. 읽기가 막혀도 빈 값으로 계속한다. */
function readProjectSeed(projectId: string): ProjectSeed {
  if (typeof window === "undefined") return EMPTY_SEED;
  let title = "";
  let description = "";
  let documents: readonly SubmissionDocumentSeed[] = [];
  try {
    const entry = readStudioProjectLibrary(window.localStorage).projects.find((project) => project.id === projectId);
    title = entry?.title ?? "";
    description = entry?.description ?? "";
  } catch {
    // 프로젝트 이름은 편의 값이다. 못 읽으면 직접 적게 한다.
  }
  try {
    documents = readStudioProjectDocuments(window.localStorage, projectId)
      .documents.filter((document) => document.kind === "webtoon" && document.status === "active")
      .map((document) => ({ id: document.id, title: document.title, width: document.width, height: document.height, pageCount: document.pageCount }));
  } catch {
    // 문서 목록을 못 읽으면 빈 회차 칸으로 시작한다.
  }
  return { title, description, documents };
}

/**
 * 투고 패키지 — 스튜디오 프로젝트(작품)의 회차 원고 3화 이상, 캐릭터 시트, 로그라인·시놉시스를 ZIP 하나(+표지)로 묶는다.
 *
 * 정본은 스튜디오 프로젝트와 그 문서(회차)다. 에디터만 문서를 정확히 이미지로 만들 수 있으므로(`StudioExportPanel` 의 경계),
 * 이 화면은 에디터에서 내보낸 이미지를 회차별로 받아 규격을 점검하고 묶는다. 전부 이 브라우저 안에서 처리하며 어떤 서버로도
 * 보내지 않는다.
 */
export function StudioSubmissionPackagePanel({ projectId, locale, draftStorage, buildDeps }: StudioSubmissionPackagePanelProps) {
  const bt = useBilingual("StudioSubmissionPackagePanel");
  const titleId = useId();
  const workspace = useStudioProjectWorkspace(projectId, locale);
  const [seed] = useState(() => readProjectSeed(projectId));
  const story = workspace.state?.story;
  const sheets = useMemo(() => (story ? buildSubmissionCharacterSheets(story.bible, story.narrative) : []), [story]);

  const controller = useSubmissionPackageDraft({
    projectId,
    projectTitle: seed.title,
    documents: seed.documents,
    characters: sheets,
    storage: draftStorage,
  });
  const build = useSubmissionPackageBuild(buildDeps);
  const { state, draft, report, platform } = controller;
  const [builtSignature, setBuiltSignature] = useState<string | null>(null);

  const signature = useMemo(
    () =>
      JSON.stringify([
        [state.title, state.authorName, state.logline, state.synopsis, state.targetWidth, state.includeCoverPdf, state.coverLocale],
        state.episodes.map((episode) => [episode.number, episode.title, episode.note, episode.pages.map((page) => page.id)]),
        [...controller.selectedCharacterIds].sort(),
      ]),
    [state, controller.selectedCharacterIds],
  );

  const coverLocale = state.coverLocale === "auto" ? resolveSubmissionLocale(locale) : state.coverLocale;
  const targetWidthPx = submissionTargetWidth(state.targetWidth)?.width ?? null;
  const stale = build.state.status === "done" && builtSignature !== signature;

  const handleBuild = (): void => {
    setBuiltSignature(signature);
    void build.start(draft, { locale: coverLocale, includeCoverPdf: state.includeCoverPdf, platform });
  };

  const handleReset = (): void => {
    build.reset();
    setBuiltSignature(null);
  };

  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6" aria-labelledby={titleId}>
      <header>
        <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-accent">
          <PackageOpen aria-hidden="true" className="size-4" />
          {bt("투고 준비", "SUBMISSION PREP")}
        </p>
        <h2 id={titleId} className="mt-2 text-2xl font-black tracking-tight text-fg">
          {bt("투고 패키지 내보내기", "Export a submission package")}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-2">
          {formatI18nTemplate(
            bt(
              "회차 원고 {required}화 이상, 캐릭터 시트, 로그라인·시놉시스를 ZIP 하나와 표지로 묶어요. 회차마다 에디터에서 내보낸 이미지를 골라 규격을 점검하고, 모든 처리는 이 브라우저 안에서만 해요. 서버로 올리지 않아요.",
              "Bundle at least {required} episodes, character sheets, and a logline and synopsis into one ZIP with a cover. Choose the images you exported from the editor for each episode, check them against the format, and everything stays in this browser. Nothing is uploaded.",
            ),
            { required: 3 },
          )}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">
          {bt("투고하기 전에 ", "Before you submit, read ")}
          <Link href="/learn/contract-checklist" className="font-semibold text-accent underline underline-offset-2 hover:text-accent-2">
            {bt("웹툰 계약서 검토 체크리스트", "the webtoon contract review checklist")}
          </Link>
          {bt("도 살펴보세요.", ".")}
        </p>
      </header>

      {controller.persistence === "unavailable" ? (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-warn/50 bg-warning-soft px-3 py-2 text-sm text-fg">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warn" />
          {bt("이 브라우저에서는 쓰던 글을 저장할 수 없어요. 이 화면을 닫으면 적은 내용이 사라져요.", "This browser cannot save what you typed. It is lost when you close this page.")}
        </p>
      ) : null}

      <div className="mt-5 space-y-6">
        <SubmissionStoryFields
          values={{ title: state.title, authorName: state.authorName, logline: state.logline, synopsis: state.synopsis }}
          issues={report.issues}
          locale={locale}
          projectDescription={seed.description}
          onChange={controller.actions.setField}
        />

        <SubmissionEpisodeSection
          episodes={state.episodes}
          stats={report.episodeStats}
          issues={report.issues}
          locale={locale}
          targetWidthPx={targetWidthPx}
          restoredFromSaved={controller.restoredFromSaved}
          actions={controller.actions}
        />

        {workspace.error ? (
          <div role="alert" className="rounded-xl border border-bad/50 bg-bad-soft px-3 py-2 text-sm text-fg">
            <p className="font-bold">{bt("캐릭터 시트를 불러오지 못했어요.", "Could not load the character sheets.")}</p>
            <p className="mt-0.5 text-xs text-fg-2">{workspace.error}</p>
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={workspace.reload}>
              {bt("다시 불러오기", "Reload")}
            </Button>
          </div>
        ) : workspace.state === null ? (
          <div role="status" aria-busy="true" className="space-y-2 rounded-2xl border border-line bg-panel p-4">
            <div aria-hidden="true" className="h-4 w-40 animate-pulse rounded bg-raised motion-reduce:animate-none" />
            <div aria-hidden="true" className="h-10 w-full animate-pulse rounded bg-raised motion-reduce:animate-none" />
            <p className="text-sm text-fg-2">{bt("캐릭터 시트를 불러오는 중…", "Loading character sheets…")}</p>
          </div>
        ) : (
          <SubmissionCharacterPicker projectId={projectId} sheets={sheets} selectedIds={controller.selectedCharacterIds} onToggle={controller.actions.toggleCharacter} />
        )}

        <SubmissionOptions
          targetWidth={state.targetWidth}
          includeCoverPdf={state.includeCoverPdf}
          coverLocale={state.coverLocale}
          onTargetWidth={controller.actions.setTarget}
          onIncludeCoverPdf={controller.actions.setIncludePdf}
          onCoverLocale={controller.actions.setCoverLocale}
        />

        <SubmissionPreflightReport report={report} locale={locale} />

        <SubmissionBuildPanel
          state={build.state}
          saveState={build.saveState}
          canBuild={report.canBuild}
          errorCount={report.errorCount}
          stale={stale}
          onBuild={handleBuild}
          onCancel={build.cancel}
          onSave={() => void build.save()}
          onReset={handleReset}
        />
      </div>
    </section>
  );
}

export default StudioSubmissionPackagePanel;
