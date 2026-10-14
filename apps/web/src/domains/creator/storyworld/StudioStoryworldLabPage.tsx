import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Download,
  FileJson,
  FlaskConical,
  GitBranch,
  Globe2,
  Import,
  Network,
  RefreshCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Users,
  XCircle,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { loadStoryworldIssueDispositions, saveStoryworldIssueDispositions } from "./disposition-store";
import { storyworldDraftStore } from "./draft-store";
import { StudioStoryworldBoard } from "./StudioStoryworldBoard";
import { IssueList, IssuesTab } from "./StudioStoryworldIssues";
import { AxisCards, EmptyState, Panel } from "./StudioStoryworldLabShared";
import { scoreTone } from "./studio-storyworld-lab-display";
import {
  StudioStoryworldSettings,
  type StoryworldSettingsFocus,
} from "./StudioStoryworldSettings";
import { StudioStoryworldUniverse } from "./StudioStoryworldUniverse";
import { analyzeStoryworldContinuity } from "./studio-storyworld-continuity";
import {
  clearStoryworldIssueDisposition,
  upsertStoryworldIssueDisposition,
  type StoryworldIssueDispositionDocument,
  type StoryworldIssueDispositionStatus,
} from "./studio-storyworld-issue-dispositions";
import { projectStoryworldToStudioProjectStory } from "./studio-storyworld-project-projection";
import { updateStudioProjectStory } from "../studio-project-feature-adapters";
import {
  STORYWORLD_CAPABILITIES,
  STORYWORLD_CAPABILITY_GROUPS,
  storyworldCapabilitiesByGroup,
  storyworldCapabilityCounts,
  type StoryworldCapabilityGroup,
  type StoryworldCapabilityMaturity,
} from "./studio-storyworld-catalog";
import {
  STORYWORLD_DEMO_PROJECT,
  STUDIO_STORYWORLD_SCHEMA_VERSION,
  analyzeStoryworldProject,
  rankStoryworldParetoFrontier,
  simulateStoryworldCounterfactual,
  type StoryworldAnalysisResult,
  type StoryworldBranchMutation,
  type StoryworldProject,
} from "./studio-storyworld-causality";
import "./studio-storyworld-lab.css";
import "../studio-shell/creator-workflow-surfaces.css";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

export interface StudioStoryworldLabPageProps {
  readonly workId: string | null;
  readonly remixSourceWorkId: string | null;
}

type StoryworldTab =
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

const MATURITY_LABELS: Readonly<Record<StoryworldCapabilityMaturity, string>> = {
  engine: "바로 사용 가능",
  adapter: "다른 기능과 연결",
  experimental: "시험 중 기능",
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path}는 비어 있지 않은 문자열이어야 합니다.`);
  }
}

function assertFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path}는 유한한 숫자여야 합니다.`);
  }
}

function assertOptionalStringArray(record: Record<string, unknown>, key: string, path: string): void {
  const value = record[key];
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${path}.${key}는 문자열 배열이어야 합니다.`);
  }
}

function assertOptionalRecordArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
  validate: (item: Record<string, unknown>, itemPath: string) => void,
): void {
  const value = record[key];
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error(`${path}.${key}는 배열이어야 합니다.`);
  value.forEach((item, index) => {
    if (!isRecord(item)) throw new Error(`${path}.${key}[${index}]는 객체여야 합니다.`);
    validate(item, `${path}.${key}[${index}]`);
  });
}

function assertOptionalFiniteNumber(record: Record<string, unknown>, key: string, path: string): void {
  if (record[key] !== undefined) assertFiniteNumber(record[key], `${path}.${key}`);
}

function assertOptionalString(record: Record<string, unknown>, key: string, path: string): void {
  if (record[key] !== undefined && typeof record[key] !== "string") {
    throw new Error(`${path}.${key}는 문자열이어야 합니다.`);
  }
}

function assertStoryworldCharacter(value: unknown, path: string): void {
  if (!isRecord(value)) throw new Error(`${path}는 객체여야 합니다.`);
  assertString(value.id, `${path}.id`);
  assertString(value.name, `${path}.name`);
  assertOptionalString(value, "goal", path);
  assertOptionalString(value, "description", path);
  assertOptionalStringArray(value, "aliases", path);
  assertOptionalStringArray(value, "tags", path);
  assertOptionalStringArray(value, "initialFactIds", path);
  assertOptionalStringArray(value, "secretFactIds", path);
  if (value.motion !== undefined) {
    if (!isRecord(value.motion)) throw new Error(`${path}.motion은 객체여야 합니다.`);
    for (const key of ["reveal", "emphasis", "expressionNotes", "voiceNote"]) {
      assertOptionalString(value.motion, key, `${path}.motion`);
    }
  }
}

function assertStoryworldFact(value: unknown, path: string): void {
  if (!isRecord(value)) throw new Error(`${path}는 객체여야 합니다.`);
  assertString(value.id, `${path}.id`);
  assertString(value.label, `${path}.label`);
  assertString(value.subjectId, `${path}.subjectId`);
  assertString(value.key, `${path}.key`);
  assertOptionalString(value, "description", path);
  assertOptionalFiniteNumber(value, "intendedReaderRevealOrder", path);
  assertOptionalStringArray(value, "tags", path);
}

function assertStoryworldScene(value: unknown, path: string): void {
  if (!isRecord(value)) throw new Error(`${path}는 객체여야 합니다.`);
  assertString(value.id, `${path}.id`);
  assertString(value.title, `${path}.title`);
  assertOptionalString(value, "description", path);
  assertOptionalString(value, "locationId", path);
  assertFiniteNumber(value.order, `${path}.order`);
  assertOptionalFiniteNumber(value, "timeIndex", path);
  assertOptionalStringArray(value, "participantIds", path);
  assertOptionalStringArray(value, "dependsOnSceneIds", path);
  assertOptionalStringArray(value, "setupIds", path);
  assertOptionalStringArray(value, "payoffIds", path);
  assertOptionalStringArray(value, "motifIds", path);

  assertOptionalRecordArray(value, "preconditions", path, (item, itemPath) => {
    assertString(item.factId, `${itemPath}.factId`);
    if (item.comparator !== undefined && ![
      "exists", "not-exists", "equals", "not-equals", "greater-than", "less-than",
    ].includes(String(item.comparator))) {
      throw new Error(`${itemPath}.comparator가 지원되지 않습니다.`);
    }
  });
  assertOptionalRecordArray(value, "effects", path, (item, itemPath) => {
    assertString(item.factId, `${itemPath}.factId`);
    if (!["set", "delete", "increment", "decrement"].includes(String(item.op))) {
      throw new Error(`${itemPath}.op가 지원되지 않습니다.`);
    }
  });
  assertOptionalRecordArray(value, "knowledgeUses", path, (item, itemPath) => {
    assertString(item.characterId, `${itemPath}.characterId`);
    assertString(item.factId, `${itemPath}.factId`);
  });
  assertOptionalRecordArray(value, "reveals", path, (item, itemPath) => {
    assertString(item.factId, `${itemPath}.factId`);
    if (!Array.isArray(item.audiences) || item.audiences.some((audience) =>
      typeof audience !== "string" || audience.length === 0
    )) {
      throw new Error(`${itemPath}.audiences는 문자열 배열이어야 합니다.`);
    }
  });
  assertOptionalRecordArray(value, "emotionalBeats", path, (item, itemPath) => {
    assertString(item.characterId, `${itemPath}.characterId`);
    assertFiniteNumber(item.valence, `${itemPath}.valence`);
    assertFiniteNumber(item.arousal, `${itemPath}.arousal`);
  });
  assertOptionalRecordArray(value, "localization", path, (item, itemPath) => {
    assertString(item.locale, `${itemPath}.locale`);
    assertFiniteNumber(item.sourceCharacters, `${itemPath}.sourceCharacters`);
    assertFiniteNumber(item.translatedCharacters, `${itemPath}.translatedCharacters`);
    assertFiniteNumber(item.balloonCapacityCharacters, `${itemPath}.balloonCapacityCharacters`);
  });
  assertOptionalRecordArray(value, "assets", path, (item, itemPath) => {
    assertString(item.assetId, `${itemPath}.assetId`);
    assertString(item.label, `${itemPath}.label`);
    if (!["cleared", "restricted", "unknown", "expired"].includes(String(item.licenseStatus))) {
      throw new Error(`${itemPath}.licenseStatus가 지원되지 않습니다.`);
    }
  });
  if (value.production !== undefined) {
    if (!isRecord(value.production)) throw new Error(`${path}.production은 객체여야 합니다.`);
    for (const key of [
      "drawingMinutes", "letteringMinutes", "renderMinutes", "reviewMinutes", "uniqueAssetCount", "complexity",
    ]) {
      assertOptionalFiniteNumber(value.production, key, `${path}.production`);
    }
    assertOptionalStringArray(value.production, "assigneeIds", `${path}.production`);
  }
  if (value.accessibility !== undefined && !isRecord(value.accessibility)) {
    throw new Error(`${path}.accessibility는 객체여야 합니다.`);
  }
}

function parseStoryworldProject(text: string): StoryworldProject {
  if (text.length > 1_000_000) throw new Error("스토리월드 JSON은 1MB 이하여야 합니다.");
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error("최상위 값은 객체여야 합니다.");
  if (value.schemaVersion !== STUDIO_STORYWORLD_SCHEMA_VERSION) {
    throw new Error(`schemaVersion은 ${STUDIO_STORYWORLD_SCHEMA_VERSION}이어야 합니다.`);
  }
  assertString(value.id, "project.id");
  assertString(value.title, "project.title");
  if (!Array.isArray(value.characters) || !Array.isArray(value.facts) || !Array.isArray(value.scenes)) {
    throw new Error("characters, facts, scenes는 배열이어야 합니다.");
  }
  if (value.characters.length > 64 || value.facts.length > 512 || value.scenes.length > 256) {
    throw new Error("로컬 분석 한도는 인물 64명, 사실 512개, 장면 256개입니다.");
  }
  value.characters.forEach((item, index) => assertStoryworldCharacter(item, `characters[${index}]`));
  value.facts.forEach((item, index) => assertStoryworldFact(item, `facts[${index}]`));
  value.scenes.forEach((item, index) => assertStoryworldScene(item, `scenes[${index}]`));
  if (value.setupContracts !== undefined) {
    if (!Array.isArray(value.setupContracts)) throw new Error("setupContracts는 배열이어야 합니다.");
    value.setupContracts.forEach((item, index) => {
      const path = `setupContracts[${index}]`;
      if (!isRecord(item)) throw new Error(`${path}는 객체여야 합니다.`);
      assertString(item.id, `${path}.id`);
      assertString(item.label, `${path}.label`);
      assertOptionalFiniteNumber(item, "payoffDueByOrder", path);
      assertOptionalFiniteNumber(item, "requiredPayoffCount", path);
    });
  }
  if (value.motifs !== undefined) {
    if (!Array.isArray(value.motifs)) throw new Error("motifs는 배열이어야 합니다.");
    value.motifs.forEach((item, index) => {
      const path = `motifs[${index}]`;
      if (!isRecord(item)) throw new Error(`${path}는 객체여야 합니다.`);
      assertString(item.id, `${path}.id`);
      assertString(item.label, `${path}.label`);
      assertOptionalFiniteNumber(item, "minOccurrences", path);
      assertOptionalFiniteNumber(item, "maxGapScenes", path);
    });
  }
  assertOptionalFiniteNumber(value, "productionCapacityMinutes", "project");
  return value as unknown as StoryworldProject;
}

/**
 * 불러오기 오류를 작가 언어로 바꿉니다. 내부 검사 문구(필드 이름·형식 이름)는
 * 화면에 그대로 내보내지 않고, 무엇이 문제인지와 다음에 할 일을 함께 전합니다.
 */
function friendlyStoryworldFileError(caught: unknown): string {
  const raw = caught instanceof Error ? caught.message : "";
  if (raw.includes("1MB")) {
    return "설정 파일이 너무 큽니다(1MB 초과). 파일을 나누거나 불필요한 내용을 줄인 뒤 다시 불러와 주세요.";
  }
  if (raw.includes("schemaVersion")) {
    return "이 화면에서 저장한 설정 파일이 아닌 것 같습니다. '설정 파일로 저장'으로 받은 파일을 골랐는지 확인한 뒤 다시 불러와 주세요.";
  }
  if (/characters|facts|scenes|setupContracts|motifs/.test(raw)) {
    return "설정 파일에서 인물·사실·장면 중 빠졌거나 형식이 다른 항목이 있습니다. 원본 파일을 열어 빠진 항목을 채운 뒤 다시 불러와 주세요.";
  }
  return "설정 파일을 읽을 수 없습니다. 파일이 손상되지 않았는지 확인하고, 이 화면에서 저장한 설정 파일을 골라 다시 불러와 주세요.";
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatMinutes(value: number): string {
  if (value < 60) return `${formatNumber(value)}분`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
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

function OverviewTab({ project, result, onOpenIssues, onOpenData, onEditElement }: {
  readonly project: StoryworldProject;
  readonly result: StoryworldAnalysisResult;
  readonly onOpenIssues: () => void;
  readonly onOpenData: () => void;
  readonly onEditElement: (kind: "character" | "fact", id: string) => void;
}) {
  const blockingIssues = result.issues.filter((issue) => issue.severity === "error").length;
  return (
    <div className="storyworld-tab-stack">
      <StudioStoryworldBoard onEditElement={onEditElement} onOpenData={onOpenData} project={project} />
      <section aria-labelledby="storyworld-checkup-title" className="storyworld-checkup">
        <div className="storyworld-checkup__heading">
          <h2 id="storyworld-checkup-title">점검 결과</h2>
          <p>위 보드와 같은 설정으로 계산한 점검 결과입니다. 계산 방식은 그대로입니다.</p>
        </div>
        <div className="storyworld-tab-stack">
      <div className="storyworld-score-hero">
        <div className={`storyworld-score-orb storyworld-tone--${scoreTone(result.overallScore)}`}>
          <strong>{result.overallScore}</strong>
          <span>통합 건전성</span>
        </div>
        <div className="storyworld-score-copy">
          <span className="storyworld-eyebrow">세계관 점검 결과</span>
          <h2>원고를 읽는 대신, 원고가 성립하는지 실행했습니다.</h2>
          <p>
            {result.orderedSceneIds.length}개 장면과 {result.receipt.factCount}개 사실을 순서대로 적용해
            {" "}{result.issues.length}개 확인할 점과 {result.repairProposals.length}개 고치기 제안을 만들었습니다.
          </p>
          <button className="storyworld-button storyworld-button--primary" onClick={onOpenIssues} type="button">
            {blockingIssues > 0 ? `${blockingIssues}개 꼭 고칠 문제 보기` : "전체 확인할 점 보기"}
            <ChevronRight aria-hidden size={16} />
          </button>
        </div>
      </div>

      <AxisCards result={result} />

      <div className="storyworld-summary-grid">
        <Panel title="지금까지 이어진 세계" description="마지막 장면까지 실제로 이어진 세계의 모습입니다.">
          <dl className="storyworld-stat-list">
            <div><dt>지나온 장면</dt><dd>{result.orderedSceneIds.length}</dd></div>
            <div><dt>세계 변화 기록</dt><dd>{result.worldTimeline.length}</dd></div>
            <div><dt>열린 복선</dt><dd>{result.setupLedger.filter((row) => row.status === "open" || row.status === "overdue").length}</dd></div>
            <div><dt>독자 공개 사실</dt><dd>{result.worldTimeline.at(-1)?.readerFactIds.length ?? 0}</dd></div>
          </dl>
        </Panel>
        <Panel title="제작 예상" description="이야기의 문제와 제작 시간을 함께 견줘 봅니다.">
          <dl className="storyworld-stat-list">
            <div><dt>예상 총 작업</dt><dd>{formatMinutes(result.production.totalMinutes)}</dd></div>
            <div><dt>가용량 사용</dt><dd>{result.production.utilizationPercent === null ? "미설정" : `${result.production.utilizationPercent}%`}</dd></div>
            <div><dt>고유 자산</dt><dd>{result.production.uniqueAssetCount}</dd></div>
            <div><dt>재사용 가능</dt><dd>{result.production.reusableAssetCount}</dd></div>
          </dl>
        </Panel>
        <Panel title="점검 근거" description="같은 설정에서는 언제 다시 계산해도 같은 결과가 나옵니다.">
          <dl className="storyworld-receipt">
            <div><dt>작품</dt><dd>{project.title}</dd></div>
            <div><dt>확인할 점</dt><dd>{result.issues.length}개</dd></div>
            <div><dt>고치기 제안</dt><dd>{result.repairProposals.length}개</dd></div>
            <div><dt>다시 계산해도 같은 결과</dt><dd>예</dd></div>
          </dl>
        </Panel>
      </div>

      <Panel
        title="먼저 확인할 점"
        description="원고를 함부로 고치지 않고, 중요한 것부터 순서대로 보여줍니다."
        action={<button className="storyworld-text-button" onClick={onOpenIssues} type="button">모두 보기 <ChevronRight aria-hidden size={14} /></button>}
      >
        <IssueList issues={result.issues} limit={5} />
      </Panel>
        </div>
      </section>
    </div>
  );
}

function MultiverseTab({ project, result }: {
  readonly project: StoryworldProject;
  readonly result: StoryworldAnalysisResult;
}) {
  const activeScenes = project.scenes.filter((scene) => !scene.disabled).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const [sceneId, setSceneId] = useState(activeScenes[0]?.id ?? "");
  const [branch, setBranch] = useState<ReturnType<typeof simulateStoryworldCounterfactual> | null>(null);
  useEffect(() => {
    if (activeScenes.some((scene) => scene.id === sceneId)) return;
    setSceneId(activeScenes[0]?.id ?? "");
  }, [activeScenes, sceneId]);

  const run = () => {
    if (!sceneId) return;
    const mutation: StoryworldBranchMutation = { kind: "disable-scene", sceneId };
    setBranch(simulateStoryworldCounterfactual(project, mutation));
  };
  const frontier = branch
    ? rankStoryworldParetoFrontier([
      { id: "baseline", label: "기준 판 · 지금 설정", result },
      { id: "branch", label: "가상 안 · 장면 뺀 전개", result: branch.branch },
    ])
    : [];
  const sceneTitleById = new Map(project.scenes.map((scene) => [scene.id, `${scene.order}. ${scene.title}`]));
  const branchIssueMessageById = branch
    ? new Map(branch.branch.issues.map((issue) => [issue.id, issue.message]))
    : new Map<string, string>();
  const baselineIssueMessageById = branch
    ? new Map(branch.baseline.issues.map((issue) => [issue.id, issue.message]))
    : new Map<string, string>();
  const candidateLabelById = new Map(frontier.map((candidate) => [candidate.id, candidate.label]));

  return (
    <div className="storyworld-tab-stack">
      <Panel title="장면 빼고 미리 보기" description="지금 설정을 바꾸지 않고 ‘이 장면이 없었다면’ 어떻게 되는지 미리 계산합니다.">
        <div className="storyworld-branch-controls">
          <label>
            가상으로 제외할 장면
            <select onChange={(event) => setSceneId(event.target.value)} value={sceneId}>
              {activeScenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.order}. {scene.title}</option>)}
            </select>
          </label>
          <button className="storyworld-button storyworld-button--primary" disabled={!sceneId} onClick={run} type="button">
            <FlaskConical aria-hidden size={17} />
            미리 보기 실행
          </button>
        </div>
      </Panel>

      {branch ? (
        <>
          <div className="storyworld-branch-comparison">
            <article>
              <span>기준 판 · 지금 설정</span>
              <strong>{branch.baseline.overallScore}</strong>
              <small>확인할 점 {branch.baseline.issues.length}개</small>
            </article>
            <div className={`storyworld-delta storyworld-tone--${branch.scoreDelta >= 0 ? "good" : "bad"}`}>
              {branch.scoreDelta >= 0 ? "+" : ""}{branch.scoreDelta}
            </div>
            <article>
              <span>가상 안 · 장면 뺀 전개</span>
              <strong>{branch.branch.overallScore}</strong>
              <small>확인할 점 {branch.branch.issues.length}개</small>
            </article>
          </div>
          <div className="storyworld-summary-grid">
            <Panel title="영향받는 장면" description="이 장면과 이어져 있어 함께 살펴봐야 할 장면입니다.">
              <div className="storyworld-chip-list">
                {branch.impactedSceneIds.map((id) => <span key={id}>{sceneTitleById.get(id) ?? id}</span>)}
              </div>
            </Panel>
            <Panel title="새로 생긴 문제">
              {branch.addedIssueIds.length > 0
                ? <div className="storyworld-code-list">{branch.addedIssueIds.map((id) => <p key={id}>{branchIssueMessageById.get(id) ?? "새로 확인할 점이 생겼습니다."}</p>)}</div>
                : <EmptyState>새 문제 없음</EmptyState>}
            </Panel>
            <Panel title="해결된 문제">
              {branch.resolvedIssueIds.length > 0
                ? <div className="storyworld-code-list">{branch.resolvedIssueIds.map((id) => <p key={id}>{baselineIssueMessageById.get(id) ?? "기존 문제가 사라졌습니다."}</p>)}</div>
                : <EmptyState>해결된 문제 없음</EmptyState>}
            </Panel>
          </div>
          <Panel title="두 안 꼼꼼 비교" description="한쪽 점수만 보지 않고 9개 점검 항목을 모두 견줘 봅니다.">
            <div className="storyworld-frontier-grid">
              {frontier.map((candidate) => (
                <article className={candidate.frontier ? "is-frontier" : ""} key={candidate.id}>
                  <CircleDot aria-hidden size={18} />
                  <div><strong>{candidate.label}</strong><span>{candidate.overallScore}점</span></div>
                  <em>{candidate.frontier ? "어느 쪽도 밀리지 않음" : `${candidate.dominatedByIds.map((id) => candidateLabelById.get(id) ?? id).join(", ")}보다 모든 항목에서 밀림`}</em>
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="가상 안 항목별 점수">
            <AxisCards result={branch.branch} />
          </Panel>
        </>
      ) : (
        <EmptyState>장면을 골라, 지금 설정을 건드리지 않고 미리 보기를 실행해 보세요.</EmptyState>
      )}
    </div>
  );
}

function KnowledgeTab({ project, result }: {
  readonly project: StoryworldProject;
  readonly result: StoryworldAnalysisResult;
}) {
  const factById = new Map(project.facts.map((fact) => [fact.id, fact]));
  return (
    <div className="storyworld-tab-stack">
      <Panel title="인물별로 아는 것" description="작가가 아는 진실과 등장인물이 아는 사실을 나눠 봅니다.">
        <div className="storyworld-knowledge-grid">
          {result.knowledgeMatrix.map((row) => (
            <article key={row.characterId}>
              <div className="storyworld-avatar" aria-hidden>{row.characterName.slice(0, 1)}</div>
              <div>
                <h3>{row.characterName}</h3>
                <code>{row.characterId}</code>
              </div>
              <dl>
                <div><dt>현재 아는 사실</dt><dd>{row.knownFactIds.length}</dd></div>
                <div><dt>비밀 약속</dt><dd>{row.secretFactIds.length}</dd></div>
              </dl>
              <div className="storyworld-fact-list">
                {row.knownFactIds.map((factId) => (
                  <span key={factId}><CheckCircle2 aria-hidden size={14} />{factById.get(factId)?.label ?? factId}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="새어 나간 지식" description="알게 되는 장면 없이 먼저 써 버린 사실만 모았습니다.">
        <IssueList issues={result.issues.filter((issue) => issue.code === "knowledge-leak")} />
      </Panel>
      <Panel title="장면마다 달라지는 세계" description="각 장면이 끝난 직후의 세계와 독자에게 공개된 범위입니다.">
        <div className="storyworld-timeline">
          {result.worldTimeline.map((frame) => (
            <article key={frame.sceneId}>
              <div><span>{frame.order}</span><code>{frame.sceneId}</code></div>
              <p>성립 사실 {Object.keys(frame.facts).length} · 독자 공개 {frame.readerFactIds.length}</p>
              <details><summary>장면 뒤 세계 모습 그대로 보기</summary><pre>{JSON.stringify(frame.facts, null, 2)}</pre></details>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ContractsTab({ result }: { readonly result: StoryworldAnalysisResult }) {
  return (
    <div className="storyworld-tab-stack">
      <Panel title="복선 약속 장부" description="복선을 심은 곳과 거두는 곳을 하나의 약속으로 따라갑니다.">
        <div className="storyworld-contract-grid">
          {result.setupLedger.map((row) => (
            <article data-status={row.status} key={row.setupId}>
              <div className="storyworld-contract-grid__topline">
                <BookOpenCheck aria-hidden size={18} />
                <strong>{row.label}</strong>
                <span>{row.status}</span>
              </div>
              <dl>
                <div><dt>설치</dt><dd>{row.setupSceneIds.length}회</dd></div>
                <div><dt>회수</dt><dd>{row.payoffSceneIds.length}회</dd></div>
                <div><dt>기한</dt><dd>{row.dueByOrder ?? "미설정"}</dd></div>
              </dl>
              <div className="storyworld-chip-list">
                {[...row.setupSceneIds, ...row.payoffSceneIds].map((id, index) => <code key={`${id}:${index}`}>{id}</code>)}
              </div>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="반복 모티프" description="되풀이되는 시각·소리·소품 모티프가 얼마나 자주, 얼마나 띄엄띄엄 나오는지 봅니다.">
        <div className="storyworld-motif-grid">
          {result.motifLedger.map((row) => (
            <article key={row.motifId}>
              <Sparkles aria-hidden size={20} />
              <div><strong>{row.label}</strong><code>{row.motifId}</code></div>
              <dl>
                <div><dt>등장</dt><dd>{row.occurrenceCount}</dd></div>
                <div><dt>최대 공백</dt><dd>{row.largestGapScenes}장면</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="스포일러 미리 막기">
        <IssueList issues={result.issues.filter((issue) => issue.axis === "spoiler-safety")} />
      </Panel>
    </div>
  );
}

function CapabilitiesTab() {
  const [maturity, setMaturity] = useState<StoryworldCapabilityMaturity | "all">("all");
  const counts = storyworldCapabilityCounts();
  const groups = Object.keys(STORYWORLD_CAPABILITY_GROUPS) as StoryworldCapabilityGroup[];
  return (
    <div className="storyworld-tab-stack">
      <div className="storyworld-capability-intro">
        <div>
          <span className="storyworld-eyebrow">창의 기능 지도</span>
          <h2>{STORYWORLD_CAPABILITIES.length}개 차별화 기능을 하나의 세계관 설정으로 묶었습니다.</h2>
          <p>버튼을 무작정 늘리지 않고 바로 쓸 수 있는 것, 다른 기능과 연결되는 것, 시험 중인 것을 구분합니다.</p>
        </div>
        <dl>
          <div><dt>바로 사용 가능</dt><dd>{counts.engine}</dd></div>
          <div><dt>다른 기능과 연결</dt><dd>{counts.adapter}</dd></div>
          <div><dt>시험 중</dt><dd>{counts.experimental}</dd></div>
        </dl>
      </div>
      <div className="storyworld-segmented" role="group" aria-label="기능 성숙도 필터">
        {(["all", "engine", "adapter", "experimental"] as const).map((value) => (
          <button aria-pressed={maturity === value} key={value} onClick={() => setMaturity(value)} type="button">
            {value === "all" ? "전체" : MATURITY_LABELS[value]}
          </button>
        ))}
      </div>
      {groups.map((group) => {
        const capabilities = storyworldCapabilitiesByGroup(group).filter((item) => maturity === "all" || item.maturity === maturity);
        if (capabilities.length === 0) return null;
        const groupMeta = STORYWORLD_CAPABILITY_GROUPS[group];
        return (
          <Panel key={group} title={groupMeta.label} description={groupMeta.purpose}>
            <div className="storyworld-capability-grid">
              {capabilities.map((capability) => (
                <article key={capability.id}>
                  <div className="storyworld-capability-grid__topline">
                    <BrainCircuit aria-hidden size={18} />
                    <span data-maturity={capability.maturity}>{MATURITY_LABELS[capability.maturity]}</span>
                  </div>
                  <h3>{capability.name}</h3>
                  <p>{capability.oneLine}</p>
                  <details>
                    <summary>근거와 주의할 점</summary>
                    <strong>주의할 점</strong>
                    <p>{capability.guardrail}</p>
                    <div className="storyworld-chip-list">{capability.evidence.map((item) => <code key={item}>{item}</code>)}</div>
                    {capability.composesWith ? <small>함께 쓰기: {capability.composesWith.join(" · ")}</small> : null}
                  </details>
                </article>
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function JsonTab({ project, onApply }: {
  readonly project: StoryworldProject;
  readonly onApply: (project: StoryworldProject) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(project, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  useEffect(() => setText(JSON.stringify(project, null, 2)), [project]);
  const apply = () => {
    try {
      const next = parseStoryworldProject(text);
      onApply(next);
      setError(null);
    } catch (caught) {
      setError(friendlyStoryworldFileError(caught));
    }
  };
  if (!editorOpen) {
    return (
      <Panel
        title="설정 불러오기 · 직접 고치기"
        description="보통은 위쪽 '설정 불러오기'에서 파일을 골라 불러오는 방법이 가장 쉽고 안전합니다. 설정을 글자 그대로 고쳐야 할 때만 직접 편집을 여세요."
      >
        <ol className="storyworld-import-steps">
          <li>먼저 지금 설정을 '설정 파일로 저장'으로 보관해 두세요. 잘못 고쳐도 파일로 되돌릴 수 있습니다.</li>
          <li>직접 편집을 열면 인물·사실·장면을 적어 둔 글이 그대로 보입니다.</li>
          <li>다 고치면 '적용하고 다시 점검하기'를 누르세요. 형식이 어긋나면 적용되지 않고, 무엇이 문제인지와 다음에 할 일을 알려 드립니다.</li>
        </ol>
        <button className="storyworld-button storyworld-button--primary" onClick={() => setEditorOpen(true)} type="button">
          직접 편집 열기
        </button>
      </Panel>
    );
  }
  return (
    <Panel
      title="설정 직접 편집"
      description="인물·사실·공개 범위·인물이 아는 것을 글자 그대로 적어 고칩니다."
      action={<button className="storyworld-button storyworld-button--primary" onClick={apply} type="button"><Save aria-hidden size={16} /> 적용하고 다시 점검하기</button>}
    >
      <label className="storyworld-json-editor">
        <span className="sr-only">세계관 설정 직접 편집</span>
        <textarea onChange={(event) => setText(event.target.value)} spellCheck={false} value={text} />
      </label>
      {error ? <p className="storyworld-inline-error" role="alert"><XCircle aria-hidden size={16} />{error}</p> : null}
      <button className="storyworld-text-button" onClick={() => setEditorOpen(false)} type="button">편집 닫기</button>
    </Panel>
  );
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
      if (active) setError(caught instanceof Error ? caught.message : "저장소를 열 수 없습니다.");
    });
    return () => { active = false; };
  }, [key, attempt]);
  if (loaded === null || loaded.key !== key) {
    return (
      <div className="storyworld-main storyworld-recovery" aria-busy={error === null}>
        <h1>스토리월드 인과관계 랩</h1>
        <p role={error === null ? "status" : "alert"}>
          {error === null ? "저장된 세계관 설정을 불러오는 중입니다." : "저장된 설정을 불러오지 못했습니다. 저장된 내용은 그대로 두었습니다. 아래 ‘다시 불러오기’를 눌러 주세요. 계속 실패하면 편집기로 돌아가 다시 시작할 수 있습니다."}
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
}: StudioStoryworldLabPageProps & { readonly initialProject: StoryworldProject }) {
  const storageKey = useMemo(() => projectStorageKey(workId, remixSourceWorkId), [workId, remixSourceWorkId]);
  const [project, setProject] = useState<StoryworldProject>(initialProject);
  const [activeTab, setActiveTab] = useState<StoryworldTab>("overview");
  const [settingsFocus, setSettingsFocus] = useState<StoryworldSettingsFocus | null>(null);
  const [issueDispositions, setIssueDispositions] = useState<StoryworldIssueDispositionDocument | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [statusText, setStatusText] = useState("세계관 점검 준비됨");
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
      setStatusText(readinessProjected === null
        ? workId
          ? "예시 세계관은 저장했지만 실제 작품 준비도에는 반영하지 않았습니다."
          : "이 기기에 세계관 설정을 저장했습니다."
        : readinessProjected
          ? "이 기기에 세계관 설정을 저장하고 작품 준비도에 반영했습니다."
          : "세계관 설정은 저장했지만 작품 준비도에는 반영하지 못했습니다. 편집기로 돌아가 작품을 다시 연 뒤 확인해 주세요.");
    }).catch(() => {
      if (!active) return;
      setSaveState("error");
      setStatusText("설정을 저장하지 못했습니다. 지금 고친 내용은 이 화면에만 남아 있으니, 화면을 닫기 전에 ‘설정 파일로 저장’으로 보관해 주세요.");
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
      setStatusText("이슈 처리 상태를 저장하지 못했습니다. 현재 표시는 이 탭에만 남아 있습니다. 잠시 뒤 다시 눌러 주세요.");
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
    setStatusText("예시 세계관으로 되돌렸습니다.");
  };
  const exportProject = () => {
    downloadJson(`${project.id}.storyworld.json`, project);
    setStatusText("설정 파일을 저장했습니다. ‘설정 불러오기’에서 같은 파일을 골라 다시 불러올 수 있습니다.");
  };
  const exportReceipt = () => {
    downloadJson(`${project.id}.storyworld-receipt.json`, result.receipt);
    setStatusText("점검 기록 파일을 저장했습니다.");
  };
  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("스토리월드 JSON은 1MB 이하여야 합니다.");
      const next = authoredStoryworldProject(parseStoryworldProject(await file.text()));
      setProject(next);
      setActiveTab("overview");
      setStatusText(`‘${next.title}’ 설정을 불러와 다시 점검했습니다. 대시보드에서 결과를 확인하세요.`);
    } catch (caught) {
      setStatusText(`불러오지 못했습니다. ${friendlyStoryworldFileError(caught)}`);
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
            {saveState === "error" ? "저장 실패" : saveState === "saved" ? "로컬 저장됨" : "분석 중"}
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

          {activeTab === "overview" ? <OverviewTab onEditElement={openInSettings} onOpenData={() => setActiveTab("json")} onOpenIssues={() => setActiveTab("issues")} project={project} result={result} /> : null}
          {activeTab === "settings" ? (
            <StudioStoryworldSettings
              focusRequest={settingsFocus}
              onChange={(next) => { setProject(authoredStoryworldProject(next)); setStatusText("설정을 저장했습니다."); }}
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
          {activeTab === "json" ? <JsonTab onApply={(next) => { setProject(authoredStoryworldProject(next)); setStatusText("설정 변경을 적용해 다시 점검했습니다. 대시보드에서 결과를 확인하세요."); }} project={project} /> : null}
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
