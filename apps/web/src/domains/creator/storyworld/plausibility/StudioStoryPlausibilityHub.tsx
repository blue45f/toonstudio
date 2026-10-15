/**
 * 스토리 개연성 점검 허브.
 *
 * 흐름: 원고로 시작(또는 설정 그대로) → 통합 리포트 → 근거로 이동 → 처리 기록.
 * 이 화면은 기존 탐지기를 새로 만들지 않고, 이미 있는 점검 결과를 한 곳에 모아 작가의 말로 보여 준다.
 * 문서를 자동으로 바꾸지 않는다. 문서를 바꾸는 일(질문지 답, 원고 초안)은 모두 작가가 확인한 뒤에만 하고,
 * 허브 안에서 한 일은 ‘방금 한 일 되돌리기’로 되돌릴 수 있다. 이 되돌리기는 허브 안에서만 동작하며
 * 편집기의 작업 기록(History)과는 이어져 있지 않다.
 */
import { ClipboardList, Download, FileText, ListChecks, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  StoryworldAnalysisResult,
  StoryworldProject,
  StoryworldQuestionId,
} from "../studio-storyworld-causality";
import type { StoryworldContinuityIssue } from "../studio-storyworld-continuity";
import type {
  StoryworldIssueDispositionDocument,
  StoryworldIssueDispositionStatus,
} from "../studio-storyworld-issue-dispositions";
import { downloadTextFile } from "./studio-story-plausibility-display";
import {
  EMPTY_MANUSCRIPT_NAME_SOURCES,
  loadManuscriptNameSources,
  type ManuscriptNameSources,
} from "./studio-story-manuscript-names";
import { StudioStoryPlausibilityManuscript } from "./StudioStoryPlausibilityManuscript";
import { CategoryGuide } from "./StudioStoryPlausibilityParts";
import { StudioStoryPlausibilityQuestionnaire } from "./StudioStoryPlausibilityQuestionnaire";
import { StudioStoryPlausibilityReportView } from "./StudioStoryPlausibilityReportView";
import { defaultPlausibilityRunDeps, usePlausibilityCheck } from "./use-story-plausibility-check";
import {
  buildPlausibilityExport,
  plausibilityExportFileName,
  plausibilityExportToJson,
  plausibilityExportToMarkdown,
} from "./studio-story-plausibility-export";
import { PLAUSIBILITY_EXAMPLE_PROJECT } from "./studio-story-plausibility-example";
import {
  applyPlausibilityDispositions,
  type PlausibilityDispositionRecord,
} from "./studio-story-plausibility-report";
import type { PlausibilityRunDeps } from "./studio-story-plausibility-run";
import { ALL_SCENES_SCOPE, describeScope, scopeSceneIds, type PlausibilityScope } from "./studio-story-plausibility-scope";
import { plausibilitySnapshotFromReport, writePlausibilitySummary } from "./studio-story-plausibility-summary";
import {
  PLAUSIBILITY_DISPOSITION_LABELS,
  type PlausibilityDispositionStatus,
  type PlausibilityFinding,
} from "./studio-story-plausibility-types";
import { popUndo, pushUndo, type PlausibilityUndoEntry } from "./studio-story-plausibility-undo";
import { directionSuffix } from "./studio-story-plausibility-text";
import "./studio-story-plausibility.css";

export interface StudioStoryPlausibilityHubProps {
  readonly project: StoryworldProject;
  readonly workId: string | null;
  /** 처리 기록·원고 사본을 찾는 열쇠(랩 저장 열쇠). */
  readonly scopeKey: string;
  readonly analysis: StoryworldAnalysisResult;
  readonly continuityIssues: readonly StoryworldContinuityIssue[];
  readonly dispositions: StoryworldIssueDispositionDocument | null;
  readonly onSetDisposition: (issueKey: string, status: StoryworldIssueDispositionStatus, note?: string) => void;
  readonly onClearDisposition: (issueKey: string) => void;
  /**
   * 작가가 확인한 문서 변경(질문지 답, 원고 초안)을 랩에 반영한다. `restore`가 true이면 되돌리기라서
   * 이전 문서를 표시(예시 데이터 여부)까지 그대로 되돌린다. 아니면 작가가 만든 문서로 다룬다.
   */
  readonly onProjectChange: (project: StoryworldProject, message: string, options?: { readonly restore?: boolean }) => void;
  readonly onOpenSettings: (target: "scene" | "fact" | "character", id: string) => void;
  /** 지금 설정을 파일로 저장한다. */
  readonly onExportProject: () => void;
  /** 지금 문서가 처음 보여 준 예시 데이터인가. */
  readonly isExampleSeed: boolean;
  /** 시계·저장소·원고 사본 보관소. 테스트에서만 바꾼다. */
  readonly deps?: PlausibilityRunDeps;
}

type HubMode = "report" | "questionnaire" | "manuscript";

function activeSceneCount(project: StoryworldProject): number {
  return project.scenes.filter((scene) => scene.disabled !== true).length;
}

export function StudioStoryPlausibilityHub(props: StudioStoryPlausibilityHubProps) {
  const { project, workId, scopeKey, dispositions } = props;
  const fallbackDeps = useMemo(() => defaultPlausibilityRunDeps(), []);
  const deps = props.deps ?? fallbackDeps;
  const [mode, setMode] = useState<HubMode>("report");
  const [focusScene, setFocusScene] = useState<string | null>(null);
  const [focusQuestion, setFocusQuestion] = useState<StoryworldQuestionId | null>(null);
  const [scope, setScope] = useState<PlausibilityScope>(ALL_SCENES_SCOPE);
  const [exampleMode, setExampleMode] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [undoStack, setUndoStack] = useState<readonly PlausibilityUndoEntry[]>([]);
  const [message, setMessage] = useState("");
  const [includeQuotes, setIncludeQuotes] = useState(true);
  const [nameSources, setNameSources] = useState<ManuscriptNameSources>(EMPTY_MANUSCRIPT_NAME_SOURCES);
  const [nameNotices, setNameNotices] = useState<readonly string[]>([]);

  const activeProject = exampleMode ? PLAUSIBILITY_EXAMPLE_PROJECT : project;
  const ids = useMemo(() => scopeSceneIds(activeProject, scope), [activeProject, scope]);
  const check = usePlausibilityCheck({
    project: activeProject,
    workId: exampleMode ? null : workId,
    scopeKey,
    scopeSceneIds: ids,
    nonce,
    deps,
    ...(exampleMode ? {} : { analysis: props.analysis, continuityIssues: props.continuityIssues }),
  });

  const records = useMemo<readonly PlausibilityDispositionRecord[]>(
    () => (exampleMode ? [] : (dispositions?.dispositions ?? []).map((item) => ({
      issueKey: item.issueKey,
      status: item.status,
      ...(item.note ? { note: item.note } : {}),
    }))),
    [dispositions, exampleMode],
  );
  const dispositionView = useMemo(
    () => (check.report ? applyPlausibilityDispositions(check.report, records) : null),
    [check.report, records],
  );

  // 점검을 마칠 때마다 한 번 알린다. 건수는 ref로 읽어서 처리 기록이 바뀔 때마다 다시 알리지 않는다.
  const generatedAtIso = check.report?.generatedAtIso ?? null;
  const countsRef = useRef(dispositionView?.summary.counts ?? null);
  useEffect(() => {
    countsRef.current = dispositionView?.summary.counts ?? null;
  }, [dispositionView]);
  useEffect(() => {
    const counts = countsRef.current;
    if (generatedAtIso !== null && counts !== null) {
      setMessage(`점검을 마쳤어요. 오류 ${counts.error}, 경고 ${counts.warning}, 제안 ${counts.suggestion}.`);
    }
  }, [generatedAtIso]);

  // 작품 준비도 패널이 읽을 한 줄 요약을 남긴다(예시 이야기와 작품 없는 초안은 제외). 저장은 공용 SQLite에 하고,
  // 실패해도 점검 결과에는 영향이 없다. 남기지 못했다는 사실만 알린다.
  const report = check.report;
  const acquireSummaryStore = deps.acquireSummaryStore;
  const [summaryFailed, setSummaryFailed] = useState(false);
  useEffect(() => {
    if (exampleMode || !workId || !acquireSummaryStore || !report || !dispositionView) return;
    let active = true;
    const snapshot = plausibilitySnapshotFromReport(report, dispositionView);
    void acquireSummaryStore()
      .then((store) => writePlausibilitySummary(store, workId, snapshot, typeof window === "undefined" ? undefined : window))
      .catch(() => false)
      .then((saved) => { if (active) setSummaryFailed(!saved); });
    return () => { active = false; };
  }, [exampleMode, workId, acquireSummaryStore, report, dispositionView]);

  const pushEntry = useCallback((entry: PlausibilityUndoEntry) => setUndoStack((stack) => pushUndo(stack, entry)), []);

  const setDisposition = (finding: PlausibilityFinding, status: PlausibilityDispositionStatus, note?: string) => {
    const previous = dispositions?.dispositions.find((item) => item.issueKey === finding.dispositionKey) ?? null;
    pushEntry({ kind: "disposition", label: `‘${finding.title}’ 처리 기록`, issueKey: finding.dispositionKey, previous });
    props.onSetDisposition(finding.dispositionKey, status, note);
    const label = PLAUSIBILITY_DISPOSITION_LABELS[status];
    setMessage(`‘${finding.title}’ 항목을 ‘${label}’${directionSuffix(label)} 기록했어요. 처리한 항목은 목록 아래에 접혀 있어요.`);
  };
  const clearDisposition = (finding: PlausibilityFinding) => {
    const previous = dispositions?.dispositions.find((item) => item.issueKey === finding.dispositionKey) ?? null;
    if (!previous) return;
    pushEntry({ kind: "disposition", label: `‘${finding.title}’ 처리 되돌리기`, issueKey: finding.dispositionKey, previous });
    props.onClearDisposition(finding.dispositionKey);
    setMessage(`‘${finding.title}’ 항목의 처리 기록을 지웠어요. 다시 확인할 항목으로 돌아왔어요.`);
  };

  const applyProject = (next: StoryworldProject, label: string) => {
    pushEntry({ kind: "project", label, previous: project });
    props.onProjectChange(next, label);
    setMessage(label);
  };

  const undo = () => {
    const { entry, rest } = popUndo(undoStack);
    if (!entry) return;
    setUndoStack(rest);
    if (entry.kind === "disposition") {
      if (entry.previous === null) props.onClearDisposition(entry.issueKey);
      else props.onSetDisposition(entry.previous.issueKey, entry.previous.status, entry.previous.note);
    } else {
      props.onProjectChange(entry.previous, `되돌렸어요: ${entry.label}`, { restore: true });
    }
    setMessage(`되돌렸어요: ${entry.label}`);
  };
  const lastUndo = undoStack.at(-1) ?? null;

  /** 원고로 시작하기를 열 때 스토리 바이블·세계관 설정의 등록 이름을 읽는다(열 때 한 번, 읽기만 한다). */
  const openManuscript = () => {
    const loaded = loadManuscriptNameSources({ workId, storage: deps.storage });
    setNameSources(loaded.sources);
    setNameNotices(loaded.notices);
    setMode("manuscript");
  };

  const openQuestionnaire = (sceneId?: string, question?: StoryworldQuestionId) => {
    setFocusScene(sceneId ?? null);
    setFocusQuestion(question ?? null);
    setMode("questionnaire");
  };

  const exportAs = (format: "md" | "json") => {
    if (!check.report || !dispositionView) return;
    const doc = buildPlausibilityExport({
      report: check.report,
      view: dispositionView,
      scopeLabel: describeScope(activeProject, scope),
      sceneTitles: new Map(activeProject.scenes.map((scene) => [scene.id, scene.title])),
      includeQuotes,
    });
    const filename = plausibilityExportFileName(doc.generatedAtIso, format);
    const ok = format === "md"
      ? downloadTextFile(filename, "text/markdown", plausibilityExportToMarkdown(doc))
      : downloadTextFile(filename, "application/json", plausibilityExportToJson(doc));
    setMessage(ok
      ? `${filename} 파일을 저장했어요. 점수 계산식과 점검 가능 범위가 함께 들어 있어요.`
      : "파일을 저장하지 못했어요. 브라우저의 다운로드 설정을 확인해 주세요.");
  };

  if (mode === "manuscript") {
    return (
      <StudioStoryPlausibilityManuscript
        isExampleSeed={props.isExampleSeed}
        nameNotices={nameNotices}
        nameSources={nameSources}
        now={deps.now}
        onCancel={() => setMode("report")}
        onCreate={(next, label) => {
          applyProject(next, label);
          setScope(ALL_SCENES_SCOPE);
          setNonce((value) => value + 1);
          setMode("report");
        }}
        onExportCurrent={props.onExportProject}
        project={project}
        scopeKey={scopeKey}
      />
    );
  }

  if (mode === "questionnaire") {
    return (
      <StudioStoryPlausibilityQuestionnaire
        initialQuestion={focusQuestion}
        initialSceneId={focusScene}
        onApply={applyProject}
        onClose={() => setMode("report")}
        project={activeProject}
        readOnly={exampleMode}
      />
    );
  }

  if (!exampleMode && activeSceneCount(project) === 0) {
    return (
      <div className="plausibility-hub">
        <div className="plausibility-empty">
          <h3>아직 점검할 장면이 없어요</h3>
          <p>
            원고를 붙여 넣으면 장면을 나눠 드리고, 설정만 있어도 점검할 수 있어요. 어떤 모습인지 먼저 보고 싶다면 일부러 문제를 심어 둔
            예시 이야기를 열어 보세요. 내 설정은 바뀌지 않아요.
          </p>
          <div className="plausibility-empty__actions">
            <button className="storyworld-button storyworld-button--primary" onClick={openManuscript} type="button">원고로 시작하기</button>
            <button className="storyworld-button" onClick={() => { setExampleMode(true); setScope(ALL_SCENES_SCOPE); }} type="button">예시 이야기로 점검해 보기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="plausibility-hub" data-plausibility-view="report">
      <div className="plausibility-hub__header">
        <div className="plausibility-hub__intro">
          <h2>개연성 점검</h2>
          <p>
            이야기가 앞뒤가 맞는지 근거와 함께 확인해요. 원고가 있으면 원고로 시작하고, 없어도 설정만으로 점검할 수 있어요.
            찾은 것은 ‘틀렸다’는 판정이 아니라 작가님께 드리는 질문이에요.
          </p>
          <CategoryGuide />
        </div>
        <div className="plausibility-hub__actions">
          <button className="storyworld-button" disabled={exampleMode} onClick={openManuscript} type="button"><FileText aria-hidden size={14} /> 원고로 시작하기</button>
          <button className="storyworld-button" onClick={() => openQuestionnaire()} type="button"><ClipboardList aria-hidden size={14} /> 질문지 열기</button>
          <details className="plausibility-details">
            <summary><Download aria-hidden size={13} /> 내보내기</summary>
            <div className="plausibility-card">
              <label>
                <input checked={includeQuotes} onChange={(event) => setIncludeQuotes(event.target.checked)} type="checkbox" />
                {" "}근거에 원고 인용 넣기
              </label>
              <p className="plausibility-hint">이메일·전화번호·주소 같은 개인 정보와 긴 토큰은 [가림]으로 바꿔요. 원고 전문은 담지 않아요.</p>
              <div className="plausibility-hub__actions">
                <button className="storyworld-button" disabled={!check.report} onClick={() => exportAs("md")} type="button">Markdown 파일</button>
                <button className="storyworld-button" disabled={!check.report} onClick={() => exportAs("json")} type="button">JSON 파일</button>
              </div>
            </div>
          </details>
          {lastUndo ? (
            <span className="plausibility-undo">
              <button className="storyworld-button" onClick={undo} type="button"><Undo2 aria-hidden size={14} /> 방금 한 일 되돌리기</button>
              <span className="plausibility-hint">{lastUndo.label}</span>
            </span>
          ) : null}
        </div>
      </div>

      <p aria-live="polite" className="plausibility-live" role="status">{message}</p>
      {summaryFailed && !exampleMode ? (
        <p className="plausibility-hint" role="status">프로젝트 준비도에 점검 요약을 남기지 못했어요. 점검 결과에는 영향이 없어요.</p>
      ) : null}

      {exampleMode ? (
        <div className="plausibility-banner plausibility-banner--example" role="note">
          <span><ListChecks aria-hidden size={14} /> 일부러 문제를 심어 둔 예시 이야기예요. 내 설정은 바뀌지 않았고, 이 화면에서는 처리 기록이나 답을 저장하지 않아요.</span>
          <button className="storyworld-button" onClick={() => { setExampleMode(false); setScope(ALL_SCENES_SCOPE); }} type="button">내 설정으로 돌아가기</button>
        </div>
      ) : null}

      <StudioStoryPlausibilityReportView
        check={check}
        dispositionView={dispositionView}
        onClearDisposition={clearDisposition}
        onOpenQuestionnaire={openQuestionnaire}
        onOpenSettings={props.onOpenSettings}
        onRerun={() => setNonce((value) => value + 1)}
        onScopeChange={setScope}
        onSetDisposition={setDisposition}
        project={activeProject}
        readOnly={exampleMode}
        scope={scope}
      />
    </div>
  );
}
