import {
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  FlaskConical,
  Save,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { frozenStatus2Text } from "../status-i18n/studio-frozen2-status-i18n";
import { resolveStoryworldIssue } from "../status-i18n/studio-producer-error-i18n-storyworld";
import { StudioStoryworldBoard } from "./StudioStoryworldBoard";
import { IssueList } from "./StudioStoryworldIssues";
import { AxisCards, EmptyState, Panel } from "./StudioStoryworldLabShared";
import {
  STORYWORLD_CAPABILITIES,
  STORYWORLD_CAPABILITY_GROUPS,
  storyworldCapabilitiesByGroup,
  storyworldCapabilityCounts,
  type StoryworldCapabilityGroup,
  type StoryworldCapabilityMaturity,
} from "./studio-storyworld-catalog";
import {
  rankStoryworldParetoFrontier,
  simulateStoryworldCounterfactual,
  type StoryworldAnalysisResult,
  type StoryworldBranchMutation,
  type StoryworldProject,
} from "./studio-storyworld-causality";
import {
  friendlyStoryworldFileError,
  parseStoryworldProject,
} from "./studio-storyworld-document";
import { scoreTone } from "./studio-storyworld-lab-display";

const MATURITY_LABELS: Readonly<Record<StoryworldCapabilityMaturity, string>> = {
  engine: "바로 사용 가능",
  adapter: "다른 기능과 연결",
  experimental: "시험 중 기능",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatMinutes(value: number): string {
  if (value < 60) return `${formatNumber(value)}분`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

export function OverviewTab({ project, result, onOpenIssues, onOpenData, onEditElement }: {
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

export function MultiverseTab({ project, result }: {
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
    ? new Map(branch.branch.issues.map((issue) => [issue.id, resolveStoryworldIssue(issue)]))
    : new Map<string, string>();
  const baselineIssueMessageById = branch
    ? new Map(branch.baseline.issues.map((issue) => [issue.id, resolveStoryworldIssue(issue)]))
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
                ? <div className="storyworld-code-list">{branch.addedIssueIds.map((id) => <p key={id}>{branchIssueMessageById.get(id) ?? frozenStatus2Text("studio.frozenStatus2.world.issueAddedFallback", "새로 확인할 점이 생겼습니다.")}</p>)}</div>
                : <EmptyState>새 문제 없음</EmptyState>}
            </Panel>
            <Panel title="해결된 문제">
              {branch.resolvedIssueIds.length > 0
                ? <div className="storyworld-code-list">{branch.resolvedIssueIds.map((id) => <p key={id}>{baselineIssueMessageById.get(id) ?? frozenStatus2Text("studio.frozenStatus2.world.issueResolvedFallback", "기존 문제가 사라졌습니다.")}</p>)}</div>
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

export function KnowledgeTab({ project, result }: {
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

export function ContractsTab({ result }: { readonly result: StoryworldAnalysisResult }) {
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

export function CapabilitiesTab() {
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

export function JsonTab({ project, onApply }: {
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
