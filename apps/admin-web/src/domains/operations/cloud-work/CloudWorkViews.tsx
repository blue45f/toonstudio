import { duplicateNotes, formatTime, freshness, olderMain, RISK_LABELS, sourceComparison, STAGES } from "@toonstudio/contracts/admin-cloud-workboard";

import { prLabel, shortSha } from "./cloud-work-helpers";
import { WorkBadge, WorkCiBadge, WorkEmpty, WorkIcon, WorkLink, WorkStage } from "./cloud-work-ui";

import type { WorkView } from "./cloud-work-helpers";
import type { Board, Task } from "@toonstudio/contracts/admin-cloud-workboard";

interface Props { board: Board; tasks: Task[]; now: number; view: WorkView; layout: "table" | "kanban"; onEdit: (task: Task) => void }

function TaskSignals({ task, now }: { task: Task; now: number }) {
  const detected = Object.entries(task.risks).filter(([, signal]) => signal === "감지");
  return <div className="cw-badges"><WorkCiBadge task={task} now={now} />{detected.map(([key]) => <WorkBadge key={key} tone="red">{RISK_LABELS[key as keyof Task["risks"]]}</WorkBadge>)}</div>;
}

function TaskCard({ task, now, onEdit }: { task: Task; now: number; onEdit: Props["onEdit"] }) {
  return <article className="cw-task-card">
    <div className="cw-spread"><span className="cw-meta">{task.id} · {task.project}</span><WorkBadge tone={task.priority === "높음" ? "amber" : "gray"}>{task.priority}</WorkBadge></div>
    <button type="button" className="cw-title-button" onClick={() => onEdit(task)}>{task.title}</button>
    <WorkStage value={task.stage} /><TaskSignals task={task} now={now} />
    <p className="cw-muted">{sourceComparison(task)}</p>
    <p>{task.nextAction || "다음 조치 미기록"}</p>
    <div className="cw-spread cw-meta"><span>{task.owner || "담당자 미정"}</span><span>{freshness(task, now)}</span></div>
  </article>;
}

function TaskTable({ tasks, now, onEdit }: Pick<Props, "tasks" | "now" | "onEdit">) {
  return <><div className="cw-table-wrap"><table className="cw-task-table"><caption className="cw-sr-only">클라우드 작업 상태와 다음 조치</caption>
    <thead><tr><th>작업 / 프로젝트</th><th>현재 상태</th><th>소스 · main 비교</th><th>CI · 위험 신호</th><th>운영 확인</th><th>다음 조치 · 확인 시점</th></tr></thead>
    <tbody>{tasks.map(task => <tr key={task.id}>
      <td><span className="cw-meta">{task.id} · {task.project}</span><button type="button" className="cw-title-button" onClick={() => onEdit(task)}>{task.title}</button><span className="cw-meta">{task.owner || "담당자 미정"} · {task.action}</span></td>
      <td><WorkStage value={task.stage} /><span className="cw-cell-note">{task.priority} 우선순위</span></td>
      <td><span>{sourceComparison(task)}</span><span className="cw-cell-note">main: {task.mainInclusion}</span><WorkLink url={task.pr}>{prLabel(task.pr)}</WorkLink></td>
      <td><TaskSignals task={task} now={now} /></td>
      <td><span>배포 {task.deployStatus}</span><span className="cw-cell-note">마이그레이션 {task.migrationStatus}</span><span className="cw-cell-note">계정 {task.accountStatus} · 인프라 {task.infraStatus}</span></td>
      <td><p>{task.nextAction || "다음 조치 미기록"}</p><span className="cw-cell-note">{formatTime(task.verifiedAt)}</span><WorkBadge tone={freshness(task, now) === "24시간 내 확인" ? "teal" : "gray"}>{freshness(task, now)}</WorkBadge></td>
    </tr>)}</tbody></table></div>
    <div className="cw-mobile-tasks">{tasks.map(task => <TaskCard key={task.id} task={task} now={now} onEdit={onEdit} />)}</div></>;
}

function TaskKanban({ tasks, now, onEdit }: Pick<Props, "tasks" | "now" | "onEdit">) {
  return <div className="cw-kanban" aria-label="상태별 칸반">{STAGES.map(stage => {
    const items = tasks.filter(task => task.stage === stage);
    return <section className="cw-kanban-column" key={stage} aria-label={stage}><header><WorkStage value={stage} /><span>{items.length}</span></header>
      {items.length ? items.map(task => <TaskCard key={task.id} task={task} now={now} onEdit={onEdit} />) : <p className="cw-muted cw-kanban-empty">작업 없음</p>}
    </section>;
  })}</div>;
}

function ComparisonCards({ tasks, board, now, onEdit }: Omit<Props, "view" | "layout">) {
  return <div className="cw-cards">{tasks.map(task => {
    const duplicates = duplicateNotes(task, board.tasks);
    return <article className="cw-comparison-card" key={task.id}>
      <div className="cw-spread"><div><span className="cw-meta">{task.id} · {task.project}</span><button className="cw-title-button" type="button" onClick={() => onEdit(task)}>{task.title}</button></div><WorkStage value={task.stage} /></div>
      <div className="cw-source-grid">
        <div><span>로컬</span><code title={task.localSha}>{shortSha(task.localSha)}</code><p>{task.localBranch || "브랜치 미확인"}</p><small>변경 파일 {task.dirtyFiles ?? "미확인"}</small></div>
        <div><span>원격</span><code title={task.remoteSha}>{shortSha(task.remoteSha)}</code><p>{task.remoteBranch || "브랜치 미확인"}</p><WorkLink url={task.pr}>{prLabel(task.pr)} · {task.prState}</WorkLink></div>
        <div><span>main</span><code title={task.mainSha}>{shortSha(task.mainSha)}</code><p>{task.mainInclusion}</p><small>{olderMain(task, board.tasks) ? "더 최근의 main 증빙 있음 · 재확인" : freshness(task, now)}</small></div>
      </div>
      <p className="cw-comparison-result"><WorkIcon name="compare" />{sourceComparison(task)}</p>
      <p>{task.comparisonNote || "내용 비교 근거가 없습니다. SHA 차이만으로 동일 변경 여부를 단정하지 않습니다."}</p>
      {duplicates.length > 0 && <ul className="cw-warning-list">{duplicates.map(note => <li key={note}>{note}</li>)}</ul>}
      <div className="cw-spread cw-meta"><span>변경 그룹 {task.changeKey || "미기록"} · 배포 {task.deployEnvironment || "환경 미확인"} / {shortSha(task.deploySha)}</span><WorkLink url={task.comparisonLink}>비교 근거</WorkLink></div>
    </article>;
  })}</div>;
}

function ApprovalCards({ tasks, onEdit }: Pick<Props, "tasks" | "onEdit">) {
  const approvals = tasks.filter(task => task.stage === "승인 대기");
  if (!approvals.length) return <WorkEmpty title="승인 대기 작업이 없습니다" detail="실행이 필요한 작업은 승인 대기 상태에서 범위와 선행 조건을 기록합니다." />;
  return <div className="cw-cards">{approvals.map(task => <article className="cw-approval-card" key={task.id}>
    <div className="cw-spread"><span className="cw-meta">{task.id} · {task.project}</span><WorkBadge tone="purple">{task.action}</WorkBadge></div>
    <button className="cw-title-button" type="button" onClick={() => onEdit(task)}>{task.title}</button>
    <dl className="cw-detail-list"><div><dt>담당 작업</dt><dd>{task.assignment || "미기록"}</dd></div><div><dt>영향 범위</dt><dd>{task.scope || "미기록"}</dd></div><div><dt>선행 조건</dt><dd>{task.prerequisites || "미기록"}</dd></div><div><dt>차단 요인</dt><dd>{task.blockers || "미기록"}</dd></div><div><dt>다음 조치</dt><dd>{task.nextAction || "미기록"}</dd></div></dl>
    <p className="cw-approval-note"><WorkIcon name="lock" />보드에는 승인 대기 기록만 저장됩니다.</p>
  </article>)}</div>;
}

function ActivityList({ board, tasks }: Pick<Props, "board" | "tasks">) {
  const ids = new Set(tasks.map(task => task.id));
  const entries = board.audit.filter(entry => entry.taskId === "cloud-workboard-v1" || ids.has(entry.taskId));
  if (!entries.length) return <WorkEmpty title="변경 이력이 없습니다" detail="이 보드에 저장한 작업 변경 이력을 서버에서 기록합니다. JSON의 과거 감사 이력은 가져오지 않습니다." />;
  return <>{entries.some(entry => entry.taskId === "cloud-workboard-v1") && <p className="cw-meta">보드 전체 저장 기록은 작업 필터와 관계없이 표시됩니다.</p>}
    <ol className="cw-activity-list">{entries.map(entry => <li key={entry.id}><WorkIcon name="history" /><div><strong>{entry.title}</strong><p>{entry.detail}</p><span className="cw-meta">{entry.taskId === "cloud-workboard-v1" ? "보드 전체" : entry.taskId} · {formatTime(entry.at)}</span></div></li>)}</ol></>;
}

export function CloudWorkViews(props: Props) {
  if (props.view === "activity") return <ActivityList {...props} />;
  if (!props.tasks.length) return <WorkEmpty />;
  if (props.view === "compare") return <ComparisonCards {...props} />;
  if (props.view === "approvals") return <ApprovalCards {...props} />;
  return props.layout === "kanban" ? <TaskKanban {...props} /> : <TaskTable {...props} />;
}
