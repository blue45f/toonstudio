import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BookOpenCheck,
  BrainCircuit,
  CircleDot,
  Download,
  FileJson,
  GitBranch,
  Globe2,
  Import,
  ListChecks,
  Network,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Users,
} from "lucide-react";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { loadStoryworldIssueDispositions, saveStoryworldIssueDispositions } from "./disposition-store";
import { frozenStatus2Text } from "../status-i18n/studio-frozen2-status-i18n";
import { storyworldDraftStore } from "./draft-store";
import { IssuesTab } from "./StudioStoryworldIssues";
import {
  CapabilitiesTab,
  ContractsTab,
  JsonTab,
  KnowledgeTab,
  MultiverseTab,
  OverviewTab,
} from "./StudioStoryworldLabTabs";
import { StudioStoryworldSettings, type StoryworldSettingsFocus } from "./StudioStoryworldSettings";
import { StudioStoryworldUniverse } from "./StudioStoryworldUniverse";
import { analyzeStoryworldContinuity } from "./studio-storyworld-continuity";
import {
  clearStoryworldIssueDisposition,
  upsertStoryworldIssueDisposition,
  type StoryworldIssueDispositionDocument,
  type StoryworldIssueDispositionStatus,
} from "./studio-storyworld-issue-dispositions";
import {
  friendlyStoryworldFileError,
  parseStoryworldProject,
} from "./studio-storyworld-document";
import { projectStoryworldToStudioProjectStory } from "./studio-storyworld-project-projection";
import { updateStudioProjectStory } from "../studio-project-feature-adapters";
import {
  STORYWORLD_DEMO_PROJECT,
  STUDIO_STORYWORLD_SCHEMA_VERSION,
  analyzeStoryworldProject,
  type StoryworldProject,
} from "./studio-storyworld-causality";
import "./studio-storyworld-lab.css";
import "../studio-shell/creator-workflow-surfaces.css";

import { lazyRetry } from "@/shared/lib/lazy-retry";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

// 개연성 점검 허브는 처음 열 때 내려받는다. 랩의 다른 탭을 쓰는 사람의 첫 화면을 무겁게 하지 않기 위해서다.
const StudioStoryPlausibilityHub = lazyRetry(
  () => import("./plausibility/StudioStoryPlausibilityHub").then((module) => ({ default: module.StudioStoryPlausibilityHub })),
  "StudioStoryPlausibilityHub",
);

export interface StudioStoryworldLabPageProps {
  readonly workId: string | null;
  readonly remixSourceWorkId: string | null;
  /** 주소의 ?view=plausibility 로 들어왔을 때 개연성 점검 탭에서 시작한다. */
  readonly initialView?: "plausibility" | null;
}

type StoryworldTab =
  | "plausibility"
  | "overview"
  | "settings"
  | "universe"
  | "issues"
  | "multiverse"
  | "knowledge"
  | "contracts"
  | "capabilities"
  | "json";

type SaveState = "idle" | "saved" | "error";


const TAB_ITEMS: readonly {
  readonly id: StoryworldTab;
  readonly label: string;
  readonly icon: typeof Network;
}[] = [
  { id: "plausibility", label: "개연성 점검", icon: ListChecks },
  { id: "overview", label: "대시보드", icon: Network },
  { id: "settings", label: "설정 관리", icon: Settings2 },
  { id: "universe", label: "공유 세계관", icon: Globe2 },
  { id: "issues", label: "모순·위험", icon: AlertTriangle },
  { id: "multiverse", label: "다른 전개", icon: GitBranch },
  { id: "knowledge", label: "인물 지식", icon: Users },
  { id: "contracts", label: "복선 약속", icon: BookOpenCheck },
  { id: "capabilities", label: "창의 기능 지도", icon: Sparkles },
  { id: "json", label: "설정 파일", icon: FileJson },
];

const STORYWORLD_DEMO_SEED_FLAG = "toonSpectrumDemoSeed";

function cloneDemoProject(): StoryworldProject {
  const project = JSON.parse(JSON.stringify(STORYWORLD_DEMO_PROJECT)) as StoryworldProject;
  return { ...project, metadata: { ...project.metadata, [STORYWORLD_DEMO_SEED_FLAG]: true } };
}

function authoredStoryworldProject(project: StoryworldProject): StoryworldProject {
  const metadata = { ...project.metadata, [STORYWORLD_DEMO_SEED_FLAG]: false };
  return { ...project, metadata };
}

function isDemoStoryworldSeed(project: StoryworldProject): boolean {
  return project.metadata?.[STORYWORLD_DEMO_SEED_FLAG] === true;
}

function projectStorageKey(workId: string | null, remixSourceWorkId: string | null): string {
  const scope = workId !== null
    ? `work:${workId}`
    : remixSourceWorkId !== null
      ? `remix:${remixSourceWorkId}`
      : "draft";
  return `toonspectrum:storyworld-lab:v1:${scope}`;
}

function editorHref(workId: string | null, remixSourceWorkId: string | null): string {
  if (workId !== null) return `/studio/work/${encodeURIComponent(workId)}/canvas`;
  if (remixSourceWorkId !== null) return `/studio/remix/${encodeURIComponent(remixSourceWorkId)}/canvas`;
  return "/studio";
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function StudioStoryworldLabPage(props: StudioStoryworldLabPageProps) {
  useDocumentTitle("스토리월드 인과관계 랩 · Studio");
  const key = projectStorageKey(props.workId, props.remixSourceWorkId);
  const [loaded, setLoaded] = useState<{ key: string; project: StoryworldProject } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoaded(null);
    setError(null);
    void storyworldDraftStore.load(key, parseStoryworldProject).then((project) => {
      if (active) setLoaded({ key, project: project ?? cloneDemoProject() });
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : frozenStatus2Text("studio.frozenStatus2.world.storageOpenFailed", "저장소를 열 수 없습니다."));
    });
    return () => { active = false; };
  }, [key, attempt]);
  if (loaded === null || loaded.key !== key) {
    return (
      <div className="storyworld-main storyworld-recovery" aria-busy={error === null}>
        <h1>스토리월드 인과관계 랩</h1>
        <p role={error === null ? "status" : "alert"}>
          {error === null ? frozenStatus2Text("studio.frozenStatus2.world.loadingSettings", "저장된 세계관 설정을 불러오는 중입니다.") : frozenStatus2Text("studio.frozenStatus2.world.loadSettingsFailed", "저장된 설정을 불러오지 못했습니다. 저장된 내용은 그대로 두었습니다. 아래 ‘다시 불러오기’를 눌러 주세요. 계속 실패하면 편집기로 돌아가 다시 시작할 수 있습니다.")}
        </p>
        {error !== null ? <button className="storyworld-button" type="button" onClick={() => setAttempt((value) => value + 1)}>다시 불러오기</button> : null}
        <Link className="storyworld-button" href={editorHref(props.workId, props.remixSourceWorkId)}>Studio 편집기로 돌아가기</Link>
      </div>
    );
  }
  return <StudioStoryworldLabEditor key={key} {...props} initialProject={loaded.project} />;
}

function StudioStoryworldLabEditor({
  workId,
  remixSourceWorkId,
  initialProject,
  initialView = null,
}: StudioStoryworldLabPageProps & { readonly initialProject: StoryworldProject }) {
  const storageKey = useMemo(() => projectStorageKey(workId, remixSourceWorkId), [workId, remixSourceWorkId]);
  const [project, setProject] = useState<StoryworldProject>(initialProject);
  const [activeTab, setActiveTab] = useState<StoryworldTab>(initialView === "plausibility" ? "plausibility" : "overview");
  const [settingsFocus, setSettingsFocus] = useState<StoryworldSettingsFocus | null>(null);
  const [issueDispositions, setIssueDispositions] = useState<StoryworldIssueDispositionDocument | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [statusText, setStatusText] = useState(frozenStatus2Text("studio.frozenStatus2.world.initialStatus", "세계관 점검 준비됨"));
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const result = useMemo(() => analyzeStoryworldProject(project), [project]);
  const continuityIssues = useMemo(() => analyzeStoryworldContinuity(project), [project]);
  const backHref = editorHref(workId, remixSourceWorkId);
  const documentScope = workId !== null ? `작품 ${workId}` : remixSourceWorkId !== null ? `리믹스 ${remixSourceWorkId}` : "로컬 초안";

  useEffect(() => {
    const previous = document.title;
    document.title = `${project.title} · 스토리월드 인과관계 랩`;
    return () => { document.title = previous; };
  }, [project.title]);

  useEffect(() => {
    let active = true;
    setSaveState("idle");
    // Complete settings edits queue immediately; only obsolete UI receipts are cancelled.
    void storyworldDraftStore.save(storageKey, project).then(() => {
      let readinessProjected: boolean | null = workId && !isDemoStoryworldSeed(project) ? true : null;
      if (readinessProjected !== null && workId && typeof window !== "undefined") {
        try {
          updateStudioProjectStory(
            window.localStorage,
            workId,
            projectStoryworldToStudioProjectStory(project, workId),
            { target: window },
          );
        } catch {
          readinessProjected = false;
        }
      }
      if (!active) return;
      setSaveState("saved");
      setStatusText(readinessProjected === null ? (workId ? frozenStatus2Text("studio.frozenStatus2.world.savedExampleNotProjected", "예시 세계관은 저장했지만 실제 작품 준비도에는 반영하지 않았습니다.") : frozenStatus2Text("studio.frozenStatus2.world.savedToDevice", "이 기기에 세계관 설정을 저장했습니다.")) : readinessProjected ? frozenStatus2Text("studio.frozenStatus2.world.savedAndProjected", "이 기기에 세계관 설정을 저장하고 작품 준비도에 반영했습니다.") : frozenStatus2Text("studio.frozenStatus2.world.savedNotProjected", "세계관 설정은 저장했지만 작품 준비도에는 반영하지 못했습니다. 편집기로 돌아가 작품을 다시 연 뒤 확인해 주세요."));
    }).catch(() => {
      if (!active) return;
      setSaveState("error");
      setStatusText(frozenStatus2Text("studio.frozenStatus2.world.saveFailed", "설정을 저장하지 못했습니다. 지금 고친 내용은 이 화면에만 남아 있으니, 화면을 닫기 전에 ‘설정 파일로 저장’으로 보관해 주세요."));
    });
    return () => { active = false; };
  }, [project, storageKey, workId]);

  useEffect(() => {
    let active = true;
    void loadStoryworldIssueDispositions(storageKey).then((loaded) => {
      if (active) setIssueDispositions(loaded);
    }).catch(() => {
      // 처리 기록을 열 수 없어도 진단 자체는 계속 보여 준다. 기록만 비어 있는 것으로 취급한다.
      if (active) setIssueDispositions({ version: 1, scopeKey: storageKey, dispositions: [] });
    });
    return () => { active = false; };
  }, [storageKey]);

  const persistDispositions = (next: StoryworldIssueDispositionDocument) => {
    setIssueDispositions(next);
    void saveStoryworldIssueDispositions(next).catch(() => {
      setStatusText(frozenStatus2Text("studio.frozenStatus2.world.dispositionSaveFailed", "이슈 처리 상태를 저장하지 못했습니다. 현재 표시는 이 탭에만 남아 있습니다. 잠시 뒤 다시 눌러 주세요."));
    });
  };

  const setDisposition = (issueKey: string, status: StoryworldIssueDispositionStatus, note?: string) => {
    const base = issueDispositions ?? { version: 1 as const, scopeKey: storageKey, dispositions: [] };
    persistDispositions(upsertStoryworldIssueDisposition(base, {
      issueKey,
      status,
      ...(note ? { note } : {}),
      updatedAtIso: new Date().toISOString(),
    }));
  };

  const clearDisposition = (issueKey: string) => {
    if (!issueDispositions) return;
    persistDispositions(clearStoryworldIssueDisposition(issueDispositions, issueKey));
  };

  const openInSettings = (kind: "character" | "fact" | "scene", id: string) => {
    setSettingsFocus({ kind, id, nonce: Date.now() });
    setActiveTab("settings");
  };

  const reset = () => {
    setProject(cloneDemoProject());
    setStatusText(frozenStatus2Text("studio.frozenStatus2.world.resetToExample", "예시 세계관으로 되돌렸습니다."));
  };
  const exportProject = () => {
    downloadJson(`${project.id}.storyworld.json`, project);
    setStatusText(frozenStatus2Text("studio.frozenStatus2.world.fileSaved", "설정 파일을 저장했습니다. ‘설정 불러오기’에서 같은 파일을 골라 다시 불러올 수 있습니다."));
  };
  const exportReceipt = () => {
    downloadJson(`${project.id}.storyworld-receipt.json`, result.receipt);
    setStatusText(frozenStatus2Text("studio.frozenStatus2.world.receiptSaved", "점검 기록 파일을 저장했습니다."));
  };
  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error(frozenStatus2Text("studio.frozenStatus2.world.fileTooLarge", "스토리월드 JSON은 1MB 이하여야 합니다."));
      const next = authoredStoryworldProject(parseStoryworldProject(await file.text()));
      setProject(next);
      setActiveTab("overview");
      setStatusText(frozenStatus2Text("studio.frozenStatus2.world.importedSettings", { title: next.title }, "‘{title}’ 설정을 불러와 다시 점검했습니다. 대시보드에서 결과를 확인하세요."));
    } catch (caught) {
      setStatusText(frozenStatus2Text("studio.frozenStatus2.world.importFailed", { detail: friendlyStoryworldFileError(caught) }, "불러오지 못했습니다. {detail}"));
    }
  };

  return (
    <div className="storyworld-shell" data-creator-workflow="storyworld">
      <header className="storyworld-topbar">
        <div className="storyworld-topbar__brand">
          <Link aria-label="Studio 편집기로 돌아가기" className="storyworld-icon-button" href={backHref}>
            <ArrowLeft aria-hidden size={19} />
          </Link>
          <div className="storyworld-brand-mark" aria-hidden><Network size={20} /></div>
          <div>
            <span>TOONSTUDIO STUDIO</span>
            <strong>스토리월드 인과관계 랩</strong>
          </div>
        </div>
        <div className="storyworld-topbar__actions">
          <span className={`storyworld-save-state storyworld-save-state--${saveState}`}>
            {saveState === "error" ? <AlertTriangle aria-hidden size={14} /> : <ShieldCheck aria-hidden size={14} />}
            {saveState === "error" ? frozenStatus2Text("studio.frozenStatus2.world.saveFailedBadge", "저장 실패") : saveState === "saved" ? frozenStatus2Text("studio.frozenStatus2.world.savedBadge", "로컬 저장됨") : frozenStatus2Text("studio.frozenStatus2.world.analyzingBadge", "분석 중")}
          </span>
          <button className="storyworld-button" onClick={() => setImportWizardOpen(true)} type="button"><Import aria-hidden size={16} /> 설정 불러오기</button>
          <button className="storyworld-button" onClick={exportProject} type="button"><Download aria-hidden size={16} /> 설정 파일로 저장</button>
          <button className="storyworld-button" onClick={exportReceipt} type="button"><BadgeCheck aria-hidden size={16} /> 점검 기록 저장</button>
          <input aria-label="세계관 설정 파일 고르기" accept="application/json,.json" className="sr-only" onChange={importProject} ref={importRef} type="file" />
        </div>
      </header>

      <div className="storyworld-body">
        <aside className="storyworld-sidebar">
          <div className="storyworld-project-card">
            <span>{documentScope}</span>
            <strong>{project.title}</strong>
            <small>{project.id === STORYWORLD_DEMO_PROJECT.id ? "예시 데이터 · " : "이 기기에서 작업 중 · "}{project.scenes.length}개 장면 · {project.characters.length}명 · {project.facts.length}개 사실</small>
          </div>
          <nav aria-label="스토리월드 랩 섹션">
            {TAB_ITEMS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button aria-current={activeTab === tab.id ? "page" : undefined} key={tab.id} onClick={() => setActiveTab(tab.id)} type="button">
                  <Icon aria-hidden size={17} />
                  <span>{tab.label}</span>
                  {tab.id === "issues" && result.issues.length > 0 ? <em>{result.issues.length}</em> : null}
                </button>
              );
            })}
          </nav>
          <div className="storyworld-sidebar__footer">
            <button onClick={reset} type="button"><RefreshCcw aria-hidden size={15} /> 데모 초기화</button>
            <p><TimerReset aria-hidden size={14} /> 분석은 네트워크 없이 이 탭에서 실행됩니다.</p>
          </div>
        </aside>

        <div className="storyworld-main">
          {importWizardOpen ? (
            <section aria-labelledby="storyworld-import-wizard-title" className="storyworld-checkup">
              <div className="storyworld-checkup__heading">
                <h2 id="storyworld-import-wizard-title">설정 불러오기</h2>
                <p>이전에 이 화면에서 저장한 설정 파일을 불러오면 지금 세계관 설정이 그 내용으로 바뀝니다. 순서대로 따라 하세요.</p>
              </div>
              <ol className="storyworld-import-steps">
                <li>먼저 지금 설정을 파일로 저장해 두세요. 마음에 들지 않으면 이 파일로 되돌릴 수 있습니다.</li>
                <li>불러올 설정 파일을 고르세요.</li>
                <li>불러온 뒤 대시보드에서 점검 결과를 확인하세요.</li>
              </ol>
              <div className="storyworld-branch-controls">
                <button className="storyworld-button storyworld-button--primary" onClick={() => { setImportWizardOpen(false); importRef.current?.click(); }} type="button">
                  <Import aria-hidden size={16} /> 파일 고르기
                </button>
                <button className="storyworld-button" onClick={exportProject} type="button">
                  <Download aria-hidden size={16} /> 지금 설정 파일로 저장
                </button>
                <button className="storyworld-button" onClick={() => setImportWizardOpen(false)} type="button">취소</button>
              </div>
            </section>
          ) : null}
          <div className="storyworld-page-heading">
            <div>
              <span className="storyworld-eyebrow">{documentScope} · 원고와 따로 다듬고, 작품 준비도에 반영되는 세계관 설정</span>
              <h1>{TAB_ITEMS.find((tab) => tab.id === activeTab)?.label}</h1>
            </div>
            <div className="storyworld-run-badge">
              <BrainCircuit aria-hidden size={18} />
              <span>확인할 점 <strong>{result.issues.length}개</strong></span>
            </div>
          </div>

          {activeTab === "plausibility" ? (
            <Suspense fallback={<p className="storyworld-empty" role="status">{frozenStatus2Text("studio.frozenStatus2.world.plausibilityLoading", "개연성 점검을 여는 중입니다.")}</p>}>
              <StudioStoryPlausibilityHub
                analysis={result}
                continuityIssues={continuityIssues}
                dispositions={issueDispositions}
                isExampleSeed={isDemoStoryworldSeed(project)}
                onClearDisposition={clearDisposition}
                onExportProject={exportProject}
                onOpenSettings={openInSettings}
                onProjectChange={(next, message, options) => { setProject(options?.restore === true ? next : authoredStoryworldProject(next)); setStatusText(message); }}
                onSetDisposition={setDisposition}
                project={project}
                scopeKey={storageKey}
                workId={workId}
              />
            </Suspense>
          ) : null}
          {activeTab === "overview" ? <OverviewTab onEditElement={openInSettings} onOpenData={() => setActiveTab("json")} onOpenIssues={() => setActiveTab("issues")} project={project} result={result} /> : null}
          {activeTab === "settings" ? (
            <StudioStoryworldSettings
              focusRequest={settingsFocus}
              onChange={(next) => { setProject(authoredStoryworldProject(next)); setStatusText(frozenStatus2Text("studio.frozenStatus2.world.settingsSaved", "설정을 저장했습니다.")); }}
              project={project}
            />
          ) : null}
          {activeTab === "universe" ? <StudioStoryworldUniverse project={project} scopeKey={storageKey} /> : null}
          {activeTab === "issues" ? (
            <IssuesTab
              continuityIssues={continuityIssues}
              dispositions={issueDispositions}
              onClearDisposition={clearDisposition}
              onFixContinuity={(issue) => openInSettings(issue.target.kind, issue.target.id)}
              onSetDisposition={setDisposition}
              result={result}
            />
          ) : null}
          {activeTab === "multiverse" ? <MultiverseTab project={project} result={result} /> : null}
          {activeTab === "knowledge" ? <KnowledgeTab project={project} result={result} /> : null}
          {activeTab === "contracts" ? <ContractsTab result={result} /> : null}
          {activeTab === "capabilities" ? <CapabilitiesTab /> : null}
          {activeTab === "json" ? <JsonTab onApply={(next) => { setProject(authoredStoryworldProject(next)); setStatusText(frozenStatus2Text("studio.frozenStatus2.world.appliedSettings", "설정 변경을 적용해 다시 점검했습니다. 대시보드에서 결과를 확인하세요.")); }} project={project} /> : null}
        </div>
      </div>
      <div aria-live="polite" className="storyworld-statusbar">
        <CircleDot aria-hidden size={13} />
        <span>{statusText}</span>
        <span>설정 형식 v{STUDIO_STORYWORLD_SCHEMA_VERSION}</span>
      </div>
    </div>
  );
}
